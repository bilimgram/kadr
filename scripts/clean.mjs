#!/usr/bin/env node
// Removes build output and caches across the workspace. `--all` also removes node_modules.
import { readdirSync, rmSync } from "node:fs";
import { join } from "node:path";

const OUTPUTS = ["dist", "out", "release", "coverage", ".turbo"];
const removeAll = process.argv.includes("--all");

const projects = [
  ".",
  ...["apps", "packages"].flatMap((group) =>
    readdirSync(group, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => join(group, entry.name)),
  ),
];

for (const project of projects) {
  for (const name of [...OUTPUTS, ...(removeAll ? ["node_modules"] : [])]) {
    rmSync(join(project, name), { recursive: true, force: true });
  }
}
console.log(`Cleaned ${projects.length} projects${removeAll ? " (including node_modules)" : ""}.`);
