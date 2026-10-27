# @kadr/project-format — guide for Claude Code

This package defines a **public file format** (`.kadr` bundles, `events.jsonl`, transcripts, edit
plans) that other tools may read and write. Treat every schema change as an API change.

- **Additive only** within a `FORMAT_VERSION`: new optional fields, new event types, new edit
  operation types. Readers must ignore unknown fields.
- **Breaking changes** (renaming/removing fields, changing units or meaning, making a field
  required) need: a `FORMAT_VERSION` bump, a migration from the previous version, tests for both,
  and an ADR.
- Time is always integer microseconds since recording start (`Micros`); positions are normalized
  0–1 (`NormalizedPoint`, `NormalizedRect`). Don't introduce other units.
- Never add fields that would store keystroke contents or other sensitive data by default.
- Every schema change updates `src/schema.test.ts`, and `toJsonSchemas()` must keep working (it is
  how non-TypeScript tools consume the format).
