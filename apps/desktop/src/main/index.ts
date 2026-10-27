import { join } from "node:path";
import { app, globalShortcut, systemPreferences } from "electron";
import { Channels } from "../shared/api";
import { recoverRenderer } from "./crash-recovery";
import { registerIpc } from "./ipc";
import { applyOpenAtLogin, launchedAtLogin } from "./login-item";
import { registerAppScheme, serveRenderer } from "./protocol";
import { RecordingStore } from "./recordings";
import { hardenApp } from "./security";
import { SessionCoordinator } from "./session";
import { SettingsStore } from "./settings-store";
import { registerShortcuts } from "./shortcuts";
import { createTray } from "./tray";
import { UpdateService } from "./updater";
import { WindowManager } from "./windows";

const devServerUrl = process.env.ELECTRON_RENDERER_URL;

registerAppScheme();
app.enableSandbox();
// Matches the installer's shortcut, so Windows groups windows and notifications under Kadr.
if (process.platform === "win32") app.setAppUserModelId("dev.kadr.desktop");

// A second launch only brings the running instance forward (see "second-instance").
const primaryInstance = app.requestSingleInstanceLock();
if (!primaryInstance) app.quit();

let windows: WindowManager | null = null;
// Module-level reference so the tray icon is not garbage-collected.
let tray: Electron.Tray | null = null;
let updates: UpdateService | null = null;

app.on("web-contents-created", (_event, contents) => {
  contents.on("render-process-gone", (_e, details) => {
    console.error(`[renderer gone] ${contents.getURL()}: ${details.reason}`);
    recoverRenderer(contents, details.reason);
  });
  if (devServerUrl) {
    // Surface renderer warnings and errors in the dev terminal.
    contents.on("console-message", ({ level, message, sourceId, lineNumber }) => {
      // The dev server has no CSP by design; the packaged app serves a strict one.
      const devCspWarning = message.includes("Insecure Content-Security-Policy");
      if ((level === "warning" || level === "error") && !devCspWarning) {
        console.log(`[renderer ${level}] ${message} (${sourceId}:${lineNumber})`);
      }
    });
  }
});

app.on("second-instance", () => windows?.showControl());
// Kadr keeps running in the tray when its windows are hidden; quit from the tray menu.
app.on("window-all-closed", () => undefined);
app.on("will-quit", () => {
  globalShortcut.unregisterAll();
  updates?.dispose();
  tray?.destroy();
});

app.whenReady().then(async () => {
  if (!primaryInstance) return;
  serveRenderer(join(__dirname, "../renderer"));
  hardenApp(devServerUrl);

  if (process.platform === "darwin") {
    await systemPreferences.askForMediaAccess("camera");
    await systemPreferences.askForMediaAccess("microphone");
  }

  const settings = new SettingsStore();
  await settings.load();
  windows = new WindowManager();
  const session = new SessionCoordinator(windows, settings);

  const shortcuts = registerShortcuts({
    startStop: () => session.toggleStartStop(),
    pauseResume: () => session.command("togglePause"),
  });

  const manager = windows;
  updates = new UpdateService({
    getSettings: () => settings.get().updates,
    isBusy: () => session.isActive(),
    onChange: (state) => manager.broadcast(Channels.updatesChanged, state),
  });

  registerIpc({
    devServerUrl,
    recordings: new RecordingStore(),
    settings,
    session,
    windows,
    shortcuts,
    updates,
  });

  const updater = updates;
  settings.onChange((next) => {
    manager.broadcast(Channels.settingsChanged, next);
    manager.applyBubble(next);
    updater.applySettings();
    applyOpenAtLogin(next.system.openAtLogin);
  });
  applyOpenAtLogin(settings.get().system.openAtLogin);

  manager.createBubble(settings.get());
  manager.createToolbar();
  // Started by the OS at login: stay in the tray until the user opens Kadr.
  manager.createControl({ startHidden: launchedAtLogin() });
  tray = createTray(manager, session, updater);
  updater.start();
});
