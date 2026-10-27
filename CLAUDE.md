# Kadr — guide for Claude Code

Kadr is an open-source, local-first screen recorder (Loom-class): Electron desktop app + static web
app, shared TypeScript packages, and a Rust native core. Read `docs/PLAN.md` (roadmap, principles)
and `docs/ARCHITECTURE.md` (how it fits together) before larger changes; decisions live in
`docs/adr/`.

## Commands

Always run pnpm through Corepack (`corepack pnpm …`); the version is pinned in `package.json`.

| Task                                            | Command                                                                                              |
| ----------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Install                                         | `corepack pnpm install`                                                                              |
| Desktop app (Electron, HMR for renderers)       | `corepack pnpm dev:desktop`                                                                          |
| Web app                                         | `corepack pnpm dev:web`                                                                              |
| Everything CI checks (lint + typecheck + tests) | `corepack pnpm check`                                                                                |
| Single package tests                            | `corepack pnpm --filter @kadr/<name> test`                                                           |
| Desktop smoke test (production build)           | `corepack pnpm --filter @kadr/desktop test:e2e`                                                      |
| Auto-fix formatting/lint                        | `corepack pnpm lint:fix`                                                                             |
| Production builds                               | `corepack pnpm build`                                                                                |
| Rust                                            | `cargo fmt --all`, `cargo clippy --workspace --all-targets -- -D warnings`, `cargo test --workspace` |

`electron-vite dev` hot-reloads renderers only: restart `dev:desktop` after changing
`apps/desktop/src/main` or `src/preload`.

## Repository map

- `apps/desktop` — Electron. `src/main` (Node: windows, IPC, settings, tray, shortcuts),
  `src/preload` (the only bridge), `src/renderer` (control panel, bubble, toolbar, countdown),
  `src/shared` (IPC contract + Zod schemas + pure logic). See `apps/desktop/CLAUDE.md`.
- `apps/web` — Vite + React browser recorder.
- `packages/project-format` — Zod schemas for the `.kadr` bundle (public, versioned format).
- `packages/compositor` — bubble shapes, layout math, light correction, canvas compositor.
- `packages/recorder-core` — browser recording primitives (clock, event log, MediaRecorder wrapper).
- `packages/ai-editor` — provider-agnostic AI editing (heuristics, context, edit-plan validation).
- `packages/ui` — design tokens (`theme.css`) and shared React components.
- `crates/kadr-native` — Rust napi-rs addon (Phase 4: native capture/encode).

Internal packages export TypeScript source (`"exports": "./src/index.ts"`); apps compile them.

## Non-negotiable rules

1. **Security boundary (desktop).** Renderers are sandboxed with no Node access. Every IPC channel
   goes through `src/shared/api.ts` (contract) → `src/preload/index.ts` (bridge) →
   `src/main/ipc.ts` (handler that checks the sender and validates every argument with Zod). Never
   enable `nodeIntegration`, disable `contextIsolation`/`sandbox`, or expose `ipcRenderer` directly.
2. **Privacy.** Never log or send recordings, transcripts, keystroke contents, window titles, or API
   keys. Telemetry is opt-in only. Event capture stays local.
3. **Clean room.** No code, assets or private API details from proprietary products (including Loom).
   No GPL/AGPL code. MIT/BSD/Apache code only with attribution in `NOTICE`.
4. **Open format stability.** `@kadr/project-format` is a public file format: additive changes only
   within `FORMAT_VERSION`; anything breaking needs a version bump, a migration, and an ADR.
5. **Dependencies.** Permissive licenses only (see `docs/PLAN.md` §8). Shared versions go in the pnpm
   catalog (`pnpm-workspace.yaml`); reference them as `"catalog:"`.

## Conventions

- TypeScript strict with `noUncheckedIndexedAccess`; no `any`, no non-null assertions to silence
  errors — narrow or validate instead. Validate untrusted data (IPC, files, network) with Zod.
- Biome formats and lints (`lint:fix`); don't hand-format. Double quotes, semicolons, 100 columns.
- Tests sit next to code as `*.test.ts` (Vitest). Pure logic gets unit tests; keep DOM/Electron
  code thin around it. Bug fixes come with a regression test.
- Comments explain _why_, not _what_. Public functions get a one-line JSDoc.
- UI: use `@kadr/ui` components and `--k-*` tokens; never hard-code colors in components. Every
  control must be keyboard-reachable and labeled (WCAG 2.2 AA).
- Commits and PR titles follow Conventional Commits (`feat(desktop): …`) and are signed off
  (`git commit -s`). Behavior changes in a package need a changeset (`corepack pnpm changeset`).
- Architectural decisions → new ADR in `docs/adr/` (template in `docs/adr/README.md`).

## Definition of done

`corepack pnpm check` and `corepack pnpm build` pass; Rust changes pass `fmt`, `clippy -D warnings`
and tests; new behavior has tests; docs/ADRs updated when behavior or architecture changed; for UI,
the change was exercised in the running app.

## Gotchas

- **Windows paths:** keep the checkout path short; some tools fail beyond 260 characters. The repo
  uses `nodeLinker: hoisted` partly for this reason.
- **Electron binary** downloads on first `dev:desktop` (`apps/desktop/scripts/ensure-electron.cjs`).
- **Global shortcuts** fall back to the next free accelerator (`SHORTCUT_CANDIDATES`); the UI shows
  what was registered — never hard-code shortcut labels.
- The control panel window hosts the recording engine (`backgroundThrottling: false`); hiding it
  must never stop a recording.
