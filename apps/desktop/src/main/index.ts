import { join } from "node:path";
import { app, globalShortcut, systemPreferences } from "electron";
import { Channels } from "../shared/api";
import { registerIpc } from "./ipc";
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

if (!app.requestSingleInstanceLock()) {
  app.quit();
}

let windows: WindowManager | null = null;
// Module-level reference so the tray icon is not garbage-collected.
let tray: Electron.Tray | null = null;
let updates: UpdateService | null = null;

if (devServerUrl) {
  // Surface renderer warnings and crashes in the dev terminal.
  app.on("web-contents-created", (_event, contents) => {
    contents.on("console-message", ({ level, message, sourceId, lineNumber }) => {
      // The dev server has no CSP by design; the packaged app serves a strict one.
      const devCspWarning = message.includes("Insecure Content-Security-Policy");
      if ((level === "warning" || level === "error") && !devCspWarning) {
        console.log(`[renderer ${level}] ${message} (${sourceId}:${lineNumber})`);
      }
    });
    contents.on("render-process-gone", (_e, details) => {
      console.error(`[renderer gone] ${contents.getURL()}: ${details.reason}`);
    });
  });
}

app.on("second-instance", () => windows?.showControl());
// Kadr keeps running in the tray when its windows are hidden; quit from the tray menu.
app.on("window-all-closed", () => undefined);
app.on("will-quit", () => {
  globalShortcut.unregisterAll();
  updates?.dispose();
  tray?.destroy();
});

app.whenReady().then(async () => {
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
  });

  manager.createBubble(settings.get());
  manager.createToolbar();
  manager.createControl();
  tray = createTray(manager, session, updater);
  updater.start();
});
