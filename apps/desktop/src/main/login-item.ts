import { app } from "electron";

/** Passed by the login item so Kadr starts quietly in the tray. */
const HIDDEN_ARG = "--hidden";

/** Whether this platform supports login items (Electron implements them for Windows and macOS). */
export const loginItemSupported = process.platform === "win32" || process.platform === "darwin";

/** Registers or removes Kadr as a login item. Installed builds only: dev would register Electron. */
export function applyOpenAtLogin(enabled: boolean): void {
  if (!app.isPackaged || !loginItemSupported) return;
  if (app.getLoginItemSettings({ args: [HIDDEN_ARG] }).openAtLogin === enabled) return;
  app.setLoginItemSettings({ openAtLogin: enabled, args: [HIDDEN_ARG] });
}

/** True when the operating system started Kadr at login, so it should stay in the tray. */
export function launchedAtLogin(): boolean {
  if (process.argv.includes(HIDDEN_ARG)) return true;
  return process.platform === "darwin" && app.getLoginItemSettings().wasOpenedAtLogin === true;
}
