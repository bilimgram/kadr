# Architecture Decision Records

We record significant technical decisions as ADRs (lightweight [MADR](https://adr.github.io/madr/) style).
An ADR is immutable once accepted; to change a decision, write a new ADR that supersedes it.

| ADR                                                | Title                                                                    | Status   |
| -------------------------------------------------- | ------------------------------------------------------------------------ | -------- |
| [0001](0001-electron-with-rust-native-core.md)     | Electron shell with a Rust native core                                   | Accepted |
| [0002](0002-local-first-server-optional.md)        | Local-first, server-optional architecture                                | Accepted |
| [0003](0003-license-and-open-core.md)              | Apache-2.0 license with an open-core `ee/` directory                     | Proposed |
| [0004](0004-recording-bundle-separate-tracks.md)   | Recording bundle with separate tracks and an event log                   | Accepted |
| [0005](0005-ai-edits-as-declarative-edit-plans.md) | AI edits as declarative, validated edit plans (BYOK)                     | Accepted |
| [0006](0006-monorepo-tooling.md)                   | Monorepo tooling: pnpm, Turborepo, TypeScript, Biome, Vitest, Changesets | Accepted |

## Template

```markdown
# NNNN. Title

- Status: Proposed | Accepted | Superseded by NNNN
- Date: YYYY-MM-DD

## Context

What problem are we solving? What forces are at play?

## Decision

What we decided, stated plainly.

## Consequences

What becomes easier, what becomes harder, what we must now do.

## Alternatives considered

Each option with the reason it was not chosen.
```
