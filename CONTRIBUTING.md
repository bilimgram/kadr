# Contributing to Kadr

Thanks for helping! This guide covers setup, workflow, and the rules every change follows.

## Setup

```bash
corepack enable                 # uses the pnpm version pinned in package.json
corepack pnpm install           # also installs git hooks (lefthook)
corepack pnpm check             # lint + typecheck + unit tests
corepack pnpm dev:desktop       # or: corepack pnpm dev:web
```

Rust is only needed when working on `crates/` (the toolchain is pinned in `rust-toolchain.toml`).
See [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md) for debugging and troubleshooting.

## Workflow

1. For anything larger than a bug fix, open an issue or a GitHub Discussion first. Architectural
   changes need an ADR in `docs/adr/` (see the template in [docs/adr/README.md](docs/adr/README.md)).
2. Branch from `main`, keep PRs small and focused.
3. PR titles follow [Conventional Commits](https://www.conventionalcommits.org/)
   (`feat(desktop): add hexagon bubble`), because PRs are squash-merged.
4. If your change affects a package's behavior, add a changeset: `pnpm changeset`.
5. CI must be green: lint, typecheck, tests, and build on Windows, macOS, and Linux.

## Developer Certificate of Origin (DCO)

We use the [DCO](https://developercertificate.org/) instead of a CLA. Sign off every commit:

```bash
git commit -s -m "feat(compositor): add blob shape"
```

This adds `Signed-off-by: Your Name <you@example.com>`, certifying you wrote the change or have the
right to submit it under the project's license.

## Clean-room rule

Do not contribute code, assets, or details of private APIs from proprietary products (including
Loom), and do not copy GPL/AGPL code. Reimplement behavior from public, observable features. MIT,
BSD, or Apache-2.0 code may be reused with attribution in `NOTICE`.

## Code standards

- TypeScript strict mode; validate untrusted input (IPC, files, network) with Zod.
- Biome formats and lints (`pnpm lint:fix`).
- Tests next to code (`*.test.ts`) with Vitest.
- Privacy: never log or transmit recording content, transcripts, keystrokes, or API keys.
- Accessibility: every control is keyboard-reachable and labeled.

## Reporting bugs and security issues

Use the issue templates for bugs and features. **Never** report vulnerabilities in public issues —
see [SECURITY.md](SECURITY.md).
