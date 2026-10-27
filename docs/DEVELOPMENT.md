# Development guide

## Prerequisites

| Tool    | Version                                  | Notes                                                                   |
| ------- | ---------------------------------------- | ----------------------------------------------------------------------- |
| Node.js | 24 (≥ 22.12)                             | `.node-version`; use fnm, nvm-windows or Volta                          |
| pnpm    | pinned in `package.json`                 | Always via Corepack: `corepack enable`, then `corepack pnpm …`          |
| Rust    | pinned in `rust-toolchain.toml`          | Only for `crates/`; rustup installs the pinned toolchain automatically  |
| Windows | Visual Studio Build Tools (C++ workload) | Needed to build the Rust addon                                          |
| macOS   | Xcode Command Line Tools                 | Grant Screen Recording, Camera and Microphone to your terminal/Electron |

On Windows, clone into a short path (for example `C:\dev\kadr`); some tools still fail on paths
longer than 260 characters.

## First run

```bash
corepack enable
corepack pnpm install        # also installs git hooks (lefthook)
corepack pnpm dev:desktop    # downloads the Electron binary on first run
```

## Everyday commands

| Command                             | What it does                                                             |
| ----------------------------------- | ------------------------------------------------------------------------ |
| `corepack pnpm dev:desktop`         | Electron app; renderers hot-reload, restart for `main`/`preload` changes |
| `corepack pnpm dev:web`             | Web recorder at http://localhost:5173                                    |
| `corepack pnpm check`               | Lint + typecheck + unit tests (what CI runs)                             |
| `corepack pnpm lint:fix`            | Format and auto-fix with Biome                                           |
| `corepack pnpm build`               | Production builds (cached by Turborepo)                                  |
| `corepack pnpm check:rust`          | `cargo fmt --check`, `clippy -D warnings`, tests                         |
| `corepack pnpm changeset`           | Describe a user-facing change for the changelog                          |
| `corepack pnpm clean` / `clean:all` | Remove build output / also `node_modules`                                |

## Git workflow

- Branch from `main`; open a PR early. PR titles follow Conventional Commits and become the squash
  commit message.
- Sign off every commit: `git commit -s` (DCO). The `commit-msg` hook checks the format and warns
  about missing sign-offs; CI enforces both.
- The `pre-commit` hook formats staged files with Biome and checks `rustfmt`. Skip hooks only in an
  emergency (`--no-verify`); CI runs everything anyway.

## Debugging the desktop app

- **Renderer** (control panel, bubble, toolbar, countdown): in dev, renderer warnings and crashes are
  printed in the `dev:desktop` terminal. Open DevTools for a window from code with
  `win.webContents.openDevTools({ mode: "detach" })` while investigating (don't commit it).
- **Main process:** `console.*` goes to the terminal. To attach a debugger, run
  `corepack pnpm --filter @kadr/desktop exec electron-vite dev --inspect=9229` and attach VS Code or
  Chrome (`chrome://inspect`).
- **Settings** are stored in `settings.json` in Electron's `userData` folder
  (`%APPDATA%\@kadr\desktop` on Windows in dev). Delete it to reset to defaults.
- **Recordings** go to `Videos/Kadr`.

## Dependencies

- Versions shared by several packages live in the pnpm catalog (`pnpm-workspace.yaml`); reference
  them as `"catalog:"` in `package.json`.
- New dependencies must be permissively licensed (MIT, BSD, ISC, Apache-2.0, MPL-2.0…). CI's
  dependency review and `cargo deny` enforce this.
- pnpm refuses versions published less than 24 hours ago (`minimumReleaseAge`) and blocks
  dependency build scripts unless listed under `allowBuilds`.

## Troubleshooting

| Symptom                                                         | Fix                                                                                   |
| --------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `spawn … ENOENT` or `ERR_PACKAGE_IMPORT_NOT_DEFINED` on Windows | Path too long: move the checkout to a short path                                      |
| `pnpm` itself crashes with "Cannot find module … pnpm.cjs"      | Use `corepack pnpm`, or reinstall the global pnpm                                     |
| `Electron uninstall` from electron-vite                         | Run `corepack pnpm dev:desktop` (it downloads the binary)                             |
| A global shortcut doesn't work                                  | Another app owns it; Kadr falls back to the next candidate — see **More → Shortcuts** |
| Camera or screen is black on macOS                              | Grant permissions in System Settings → Privacy & Security, then restart               |
