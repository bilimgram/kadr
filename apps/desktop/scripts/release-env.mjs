// Release configuration for packaging and publishing. Values come from the environment (CI) and
// fall back to the repository's gitignored `.env` file (local releases). See docs/RELEASING.md.
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

const repositoryRoot = resolve(import.meta.dirname, "../../..");

/** Parses KEY=value lines; ignores comments and blank lines, strips matching quotes. */
export function parseEnv(source) {
  const values = {};
  for (const rawLine of source.split(/\r?\n/u)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const separator = line.indexOf("=");
    if (separator < 1) continue;
    const key = line.slice(0, separator).trim();
    let value = line.slice(separator + 1).trim();
    const quoted = /^(["']).*\1$/u.test(value);
    if (quoted) value = value.slice(1, -1);
    values[key] = value;
  }
  return values;
}

/** Environment variables win over `.env`, so CI secrets always take precedence. */
export function loadReleaseEnv() {
  const file = join(repositoryRoot, ".env");
  const fromFile = existsSync(file) ? parseEnv(readFileSync(file, "utf8")) : {};
  return { ...fromFile, ...process.env };
}

export function requireEnv(env, name) {
  const value = env[name]?.trim();
  if (!value) {
    throw new Error(`${name} is required. Set it in the environment or in the repository's .env.`);
  }
  return value;
}

/** The public update feed baked into installers, without a trailing slash; null when unset. */
export function updateFeedUrl(env) {
  const url = env.KADR_UPDATE_URL?.trim().replace(/\/+$/u, "");
  if (!url) return null;
  if (!url.startsWith("https://")) throw new Error("KADR_UPDATE_URL must be an https:// URL.");
  return url;
}
