#!/usr/bin/env node
// Installs git hooks on `pnpm install` (root "prepare" script). Skipped in CI, outside a git
// checkout (e.g. a source tarball), or when KADR_SKIP_GIT_HOOKS=1.
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";

if (process.env.CI || process.env.KADR_SKIP_GIT_HOOKS === "1" || !existsSync(".git")) {
  process.exit(0);
}

// A single command string (not args + shell) avoids Node's unescaped-arguments deprecation.
const result = spawnSync("lefthook install", { stdio: "inherit", shell: true });
if (result.status !== 0) {
  console.warn(
    "Could not install git hooks (lefthook). Run `corepack pnpm exec lefthook install`.",
  );
}
