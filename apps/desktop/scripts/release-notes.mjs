#!/usr/bin/env node
// Prints the GitHub Release notes for the current desktop version: its CHANGELOG entry followed
// by a download table built from the installers in release/<version>/, and install notes.
// Used by .github/workflows/desktop-release.yml.
import { readdir, readFile } from "node:fs/promises";
import { join, resolve } from "node:path";

const appRoot = resolve(import.meta.dirname, "..");
const { version } = JSON.parse(await readFile(join(appRoot, "package.json"), "utf8"));
const changelog = await readFile(join(appRoot, "CHANGELOG.md"), "utf8");

// The section between "## <version>" and the next "## " heading, without changeset sub-headings.
const lines = changelog.split(/\r?\n/u);
const start = lines.findIndex((line) => line.trim() === `## ${version}`);
if (start === -1) throw new Error(`apps/desktop/CHANGELOG.md has no "## ${version}" section.`);
const end = lines.findIndex((line, index) => index > start && line.startsWith("## "));
let entries = lines
  .slice(start + 1, end === -1 ? undefined : end)
  .filter((line) => !line.startsWith("### "));
// A single changeset is one bullet with an indented body: unwrap it into plain paragraphs.
if (entries.filter((line) => line.startsWith("- ")).length === 1) {
  entries = entries.map((line) => line.replace(/^- /u, "").replace(/^ {2}/u, ""));
}
const changes = entries
  .map((line) => line.trimEnd())
  .join("\n")
  .trim();

const PLATFORMS = [
  [/\.exe$/u, "Windows 10/11 (64-bit)"],
  [/arm64\.dmg$/u, "macOS (Apple Silicon)"],
  [/x64\.dmg$/u, "macOS (Intel)"],
  [/\.AppImage$/u, "Linux (AppImage, any distro)"],
  [/\.deb$/u, "Debian / Ubuntu"],
];
const files = await readdir(join(appRoot, "release", version)).catch(() => []);
const rows = PLATFORMS.flatMap(([pattern, platform]) =>
  files.filter((file) => pattern.test(file)).map((file) => `| ${platform} | \`${file}\` |`),
);

const guide = "https://github.com/bilimgram/kadr/blob/main/docs/USER_GUIDE.md";
console.log(`${changes}

## Download

| Platform | File |
| --- | --- |
${rows.join("\n")}

Prefer no install? [Try Kadr in your browser](https://bilimgram.github.io/kadr/).

> [!IMPORTANT]
> Preview builds aren't code-signed yet. **Windows:** on "Windows protected your PC", choose
> **More info → Run anyway**. **macOS:** if Kadr "can't be opened", open **System Settings →
> Privacy & Security** and choose **Open Anyway**. Details in the [user guide](${guide}#install).

Installed apps keep themselves up to date. Verify a download's build provenance with
\`gh attestation verify <file> --repo bilimgram/kadr\`; the software bill of materials is attached
as \`Kadr-${version}-sbom.spdx.json\`.`);
