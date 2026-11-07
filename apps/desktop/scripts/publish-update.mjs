#!/usr/bin/env node
// Publishes a packaged desktop release to the update feed on Cloudflare R2 (S3 API).
//
//   node scripts/publish-update.mjs [--dry-run] [--force]
//
// Validates every file referenced by the update metadata (version and SHA-512), refuses to
// overwrite an already-published version unless --force, uploads installers first and the
// metadata last (so clients never see metadata pointing at files that aren't there yet), then
// reads the public feed back to confirm. Each request is retried on its own when the connection
// drops (retry.mjs), so one hiccup doesn't fail the whole upload. Configuration:
// docs/RELEASING.md.
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { readdir, readFile, stat } from "node:fs/promises";
import { extname, join, resolve } from "node:path";
import { HeadObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import YAML from "yaml";
import { loadReleaseEnv, requireEnv, updateFeedUrl } from "./release-env.mjs";
import { describeError, UPLOAD_ATTEMPTS, withRetries } from "./retry.mjs";

const args = new Set(process.argv.slice(2));
const dryRun = args.has("--dry-run");
const force = args.has("--force");

const appRoot = resolve(import.meta.dirname, "..");
const { version } = JSON.parse(await readFile(join(appRoot, "package.json"), "utf8"));
const releaseDir = join(appRoot, "release", version);
const env = loadReleaseEnv();

const feedUrl = updateFeedUrl(env);
if (!feedUrl) throw new Error("KADR_UPDATE_URL is required to publish an update.");
const publicBase = requireEnv(env, "R2_PUBLIC_URL").replace(/\/+$/u, "");
if (!feedUrl.startsWith(`${publicBase}/`)) {
  throw new Error(
    `KADR_UPDATE_URL (${feedUrl}) must be a path under R2_PUBLIC_URL (${publicBase}).`,
  );
}
/** Object key prefix inside the bucket, e.g. "kadr/desktop". */
const prefix = feedUrl.slice(publicBase.length + 1);

const CONTENT_TYPES = {
  ".yml": "text/yaml; charset=utf-8",
  ".exe": "application/vnd.microsoft.portable-executable",
  ".dmg": "application/x-apple-diskimage",
  ".zip": "application/zip",
  ".deb": "application/vnd.debian.binary-package",
  ".AppImage": "application/octet-stream",
  ".blockmap": "application/octet-stream",
};
// Versioned files never change once published; metadata must always be revalidated.
const IMMUTABLE = "public, max-age=31536000, immutable";
const REVALIDATE = "no-cache, max-age=0";

async function sha512(path) {
  const hash = createHash("sha512");
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest("base64");
}

// 1. Collect and validate the metadata electron-builder produced for this version.
const entries = await readdir(releaseDir).catch(() => {
  throw new Error(
    `No build output in ${releaseDir}. Run \`corepack pnpm --filter @kadr/desktop dist\` first.`,
  );
});
const metadataFiles = entries.filter((name) =>
  /^(latest|beta|alpha)(-[a-z0-9-]+)?\.yml$/u.test(name),
);
if (metadataFiles.length === 0) {
  throw new Error(
    `No update metadata (latest*.yml) in ${releaseDir}. Was KADR_UPDATE_URL set for the build?`,
  );
}

/** Artifact file name → absolute path. */
const artifacts = new Map();
for (const name of metadataFiles) {
  const metadata = YAML.parse(await readFile(join(releaseDir, name), "utf8"));
  if (metadata.version !== version) {
    throw new Error(`${name} is for version ${metadata.version}, but package.json is ${version}.`);
  }
  for (const file of metadata.files ?? []) {
    const fileName = decodeURIComponent(file.url);
    const path = join(releaseDir, fileName);
    if ((await sha512(path)) !== file.sha512) {
      throw new Error(`SHA-512 of ${fileName} doesn't match ${name}. Rebuild before publishing.`);
    }
    artifacts.set(fileName, path);
    if (entries.includes(`${fileName}.blockmap`)) {
      artifacts.set(`${fileName}.blockmap`, join(releaseDir, `${fileName}.blockmap`));
    }
  }
}

const plan = [
  ...[...artifacts].map(([name, path]) => ({ name, path, cacheControl: IMMUTABLE })),
  ...metadataFiles.map((name) => ({
    name,
    path: join(releaseDir, name),
    cacheControl: REVALIDATE,
  })),
];

console.log(`Kadr ${version} → ${feedUrl}`);
for (const item of plan) {
  const { size } = await stat(item.path);
  console.log(`  ${item.name.padEnd(48)} ${(size / 1024 / 1024).toFixed(1).padStart(7)} MB`);
}
if (dryRun) {
  console.log("Dry run: nothing uploaded.");
  process.exit(0);
}

// 2. Upload: artifacts first, metadata last.
const bucket = requireEnv(env, "R2_BUCKET");
const endpoint = requireEnv(env, "R2_ENDPOINT").replace(/\/+$/u, "");
if (!endpoint.startsWith("https://")) throw new Error("R2_ENDPOINT must be an https:// URL.");
const s3 = new S3Client({
  region: env.R2_REGION?.trim() || "auto",
  endpoint,
  forcePathStyle: true,
  // Retries happen per request in withRetries(); the SDK can't retry streamed uploads anyway.
  maxAttempts: 1,
  // Without a logger the SDK prints "non-retryable streaming request" before each of our retries,
  // which reads like a failure. With one, it logs every failed request (input included) as an
  // error: those failures reach our code and are reported there, so only other warnings print.
  logger: {
    debug() {},
    info() {},
    warn(message, ...rest) {
      if (!String(message).includes("non-retryable streaming request")) {
        console.warn(message, ...rest);
      }
    },
    error() {},
  },
  credentials: {
    accessKeyId: requireEnv(env, "R2_ACCESS_KEY"),
    secretAccessKey: requireEnv(env, "R2_SECRET_KEY"),
  },
});

/** Logs a retry without the error message, which can name the account's endpoint. */
const logRetry = (name) => (error, attempt, ms) =>
  console.warn(
    `  ! ${name}: ${describeError(error)}; retrying in ${ms / 1000} s (attempt ${attempt + 1} of ${UPLOAD_ATTEMPTS})`,
  );

async function exists(key) {
  try {
    await withRetries(() => s3.send(new HeadObjectCommand({ Bucket: bucket, Key: key })), {
      onRetry: logRetry(key),
    });
    return true;
  } catch (error) {
    if (error?.$metadata?.httpStatusCode === 404 || error?.name === "NotFound") return false;
    throw error;
  }
}

if (!force) {
  for (const [name] of artifacts) {
    if (await exists(`${prefix}/${name}`)) {
      throw new Error(
        `${name} is already published. Bump the version, or pass --force to replace it.`,
      );
    }
  }
}

for (const item of plan) {
  const { size } = await stat(item.path);
  const extension = item.name.endsWith(".blockmap") ? ".blockmap" : extname(item.name);
  try {
    await withRetries(
      () =>
        s3.send(
          new PutObjectCommand({
            Bucket: bucket,
            Key: `${prefix}/${item.name}`,
            // A fresh stream for every attempt: a stream can only be read once.
            Body: createReadStream(item.path),
            ContentLength: size,
            ContentType: CONTENT_TYPES[extension] ?? "application/octet-stream",
            CacheControl: item.cacheControl,
          }),
        ),
      { onRetry: logRetry(item.name) },
    );
  } catch (error) {
    throw new Error(
      `Uploading ${item.name} failed (${describeError(error)}). Installers go up before the ` +
        "update metadata, so apps never see an incomplete release; run again with --force to " +
        "finish publishing.",
      { cause: error },
    );
  }
  console.log(`  ✓ uploaded ${item.name}`);
}

// 3. Read the public feed back, exactly as installed apps will.
for (const name of metadataFiles) {
  const body = await withRetries(
    async () => {
      const response = await fetch(`${feedUrl}/${name}?verify=${Date.now()}`, {
        cache: "no-store",
      });
      if (!response.ok) {
        throw Object.assign(
          new Error(`Public feed check failed for ${name}: HTTP ${response.status}`),
          { status: response.status },
        );
      }
      return response.text();
    },
    { onRetry: logRetry(name) },
  );
  const published = YAML.parse(body);
  if (published.version !== version) {
    throw new Error(`Public ${name} reports ${published.version}, expected ${version}.`);
  }
}
console.log(`Published Kadr ${version}. Installed apps will pick it up on their next check.`);
