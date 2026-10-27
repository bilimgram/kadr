# 0006. Monorepo tooling

- Status: Accepted
- Date: 2026-10-27

## Context

Desktop, web, shared packages, and later a server and Rust crates must evolve together with fast CI and
a low barrier for contributors.

## Decision

| Concern         | Choice                                                                 | Notes                                                              |
| --------------- | ---------------------------------------------------------------------- | ------------------------------------------------------------------ |
| Package manager | **pnpm** workspaces (pinned via `packageManager`)                      | `nodeLinker: hoisted` for electron-builder and Windows path limits |
| Task runner     | **Turborepo**                                                          | Cached `build` / `typecheck` / `test` across packages              |
| Language        | **TypeScript** (strict, `noUncheckedIndexedAccess`)                    | Rust for the native core                                           |
| Lint + format   | **Biome**                                                              | One fast tool instead of ESLint + Prettier                         |
| Unit tests      | **Vitest**                                                             | E2E with Playwright (Electron + web) from Phase 1                  |
| Desktop build   | **electron-vite** + **electron-builder**                               | Multi-window renderer, signing, auto-update                        |
| Web build       | **Vite** + React                                                       | Static output                                                      |
| Validation      | **Zod**                                                                | Runtime validation + JSON Schema export                            |
| Versioning      | **Changesets**                                                         | Per-package changelogs, release PRs                                |
| Shared versions | **pnpm catalog** in `pnpm-workspace.yaml`                              | One version of React, Vite, Zod… across packages                   |
| Git hooks       | **lefthook**                                                           | Biome on staged files, rustfmt, Conventional Commit messages       |
| Supply chain    | `minimumReleaseAge`, `allowBuilds`, **cargo-deny**, SHA-pinned actions | Blocks fresh malicious releases and unvetted install scripts       |
| Rust toolchain  | `rust-toolchain.toml` + workspace lints (clippy pedantic)              | Same compiler and lint level for everyone                          |
| Rust            | Cargo workspace + **napi-rs**                                          | `crates/`                                                          |

Shared packages are "internal packages" that export TypeScript source; apps compile them. Packages
meant for npm (`@kadr/project-format`) get a build step when first published.

## Consequences

- Single `pnpm install` and consistent scripts (`pnpm dev:desktop`, `pnpm check`).
- Biome lacks some niche ESLint plugins; acceptable for now, revisit if needed.

## Alternatives considered

- **Nx:** more powerful but heavier. **npm/yarn workspaces:** weaker isolation. **ESLint + Prettier:**
  slower, two tools to configure.
