#!/usr/bin/env node
// Validates a commit message against Conventional Commits (used by the commit-msg git hook).
// PR titles are checked by the same rules in CI (.github/workflows/pr-title.yml) — keep TYPES in sync.
import { readFileSync } from "node:fs";

const TYPES = ["feat", "fix", "perf", "refactor", "docs", "test", "build", "ci", "chore", "revert"];
const HEADER = new RegExp(`^(${TYPES.join("|")})(\\([a-z0-9-]+\\))?!?: \\S.{0,99}$`);
// Commits created by git itself or by tooling that are rewritten or squashed later.
const EXEMPT = /^(Merge |Revert "|fixup! |squash! |amend! )/;

const file = process.argv[2];
if (!file) {
  console.error("usage: check-commit-msg.mjs <commit-msg-file>");
  process.exit(2);
}

const message = readFileSync(file, "utf8");
const header = message.split(/\r?\n/).find((line) => line.trim() !== "" && !line.startsWith("#"));

if (!header || EXEMPT.test(header)) process.exit(0);

if (!HEADER.test(header)) {
  console.error(`✖ Commit message header doesn't follow Conventional Commits:\n\n    ${header}\n`);
  console.error(`  Expected: <type>(<optional-scope>): <summary>   (max 100 characters)`);
  console.error(`  Types:    ${TYPES.join(", ")}`);
  console.error(`  Example:  feat(desktop): add hexagon bubble shape\n`);
  process.exit(1);
}

if (!/^Signed-off-by: .+ <.+>$/m.test(message)) {
  // CI enforces the DCO on pull requests; warn early so contributors aren't surprised.
  console.warn("⚠ No Signed-off-by line. Use `git commit -s` (required by the DCO check in CI).");
}
