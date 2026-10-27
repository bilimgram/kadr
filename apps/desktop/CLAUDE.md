# Desktop app (Electron) — guide for Claude Code

## Process and window model

| Window        | Page             | Notes                                                                                                                       |
| ------------- | ---------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Control panel | `control.html`   | Frameless card near the top-right; closes to the tray. **Hosts the recording engine** (`renderer/src/control/engine.ts`).   |
| Bubble        | `bubble.html`    | Transparent, always on top, click-through outside the shape, JS drag. Shown while the panel is open or a session is active. |
| Toolbar       | `toolbar.html`   | Recording controls, content-protected (excluded from capture).                                                              |
| Countdown     | `countdown.html` | 3-2-1 overlay, content-protected.                                                                                           |

`main/windows.ts` (`WindowManager`) owns every `BrowserWindow`; `main/session.ts`
(`SessionCoordinator`) relays toolbar/tray/shortcut commands to the engine and choreographs windows
from the engine's reported `SessionSnapshot`. Settings persist via `main/settings-store.ts`
(atomic JSON writes, schema-validated, section-wise fallback to defaults).

## Adding an IPC capability (always all five steps)

1. **Schema** — add Zod schemas for every argument in `src/shared/schemas.ts`.
2. **Contract** — add the channel name to `Channels` and the method to `KadrApi` in
   `src/shared/api.ts` (types only; the preload must not import Zod).
3. **Bridge** — implement it in `src/preload/index.ts` (`invoke` for request/response, `send` for
   fire-and-forget, `subscribe` for main → renderer events).
4. **Handler** — register it in `src/main/ipc.ts` with `handle(...)` / `on(...)`, which reject
   untrusted senders and parse every argument. Restrict to a specific window where it matters
   (`isControlWindow`, `isCountdownWindow`). File-system access stays inside `RecordingStore`.
5. **Test** — pure logic goes in `src/shared` with a `*.test.ts`.

## Security checklist for changes here

- Keep `contextIsolation`, `sandbox`, `webSecurity` on; `nodeIntegration` off (`secureWebPreferences`).
- Production pages load only from `kadr://app/` with the CSP in `main/protocol.ts`; don't loosen it
  (no `unsafe-eval`, no remote origins).
- New permissions must be added to `ALLOWED_PERMISSIONS` deliberately; navigation and
  `window.open` stay blocked (`main/security.ts`).
- Shell/file operations are restricted to the recordings folder (`RecordingStore.contains`).

## Testing changes

`corepack pnpm --filter @kadr/desktop typecheck` and `test`, then run `corepack pnpm dev:desktop`.
In dev, renderer warnings and crashes are forwarded to the terminal. Restart `dev:desktop` after
editing `src/main` or `src/preload` (only renderers hot-reload).

**Dev mode is not the shipped app**: dev pages come from `http://localhost`, packaged ones from
`kadr://app`. Run `corepack pnpm --filter @kadr/desktop test:e2e` (Playwright against the
production build, also in CI and before every release) for anything touching IPC, windows,
permissions or the protocol, and extend `e2e/smoke.e2e.ts` for new window behavior.

## Pitfalls

- Check senders with `isTrustedOrigin` (`src/shared/origin.ts`), never `URL.origin`: Node reports
  the origin of `kadr:` URLs as `"null"`, which broke every IPC call in v0.1.0.
- Never call `window.close()` from a page: a page-initiated close destroys the window (the control
  panel hosts the recording engine). Hide windows through `WindowManager`.
- Page Visibility doesn't update for hidden overlay windows; the main process signals visibility
  explicitly (`panel:visibility`, `bubble:visibility`). The bubble holds the camera only while
  visible.
- On Windows all always-on-top windows share one band and the last activated wins, and a
  hide/show cycle can drop the level. `WindowManager.raiseFloatingWindows` re-asserts it (focus
  changes, display changes, every 1.5 s while visible); call it after showing a floating window.
  The "stays above another app's window" e2e test guards this with a real screen capture.
- Bubble placement rules are pure (`src/shared/placement.ts`); positions persist in
  `window-state.json` (not settings, so drags don't broadcast settings changes).
