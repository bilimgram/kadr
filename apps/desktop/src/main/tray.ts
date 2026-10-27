import { Menu, nativeImage, Tray } from "electron";
import type { SessionCoordinator } from "./session";
import type { UpdateService } from "./updater";
import type { WindowManager } from "./windows";

/**
 * Draws the tray icon in code (a violet record button) so no image assets are needed yet.
 * Pixels are premultiplied BGRA, the layout Electron's bitmap API expects on every platform.
 */
function createTrayIcon(): Electron.NativeImage {
  const size = 32;
  const center = size / 2;
  const pixels = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const distance = Math.hypot(x + 0.5 - center, y + 0.5 - center);
      const alpha = Math.min(1, Math.max(0, 14.5 - distance));
      // White center dot inside a violet disc.
      const dot = Math.min(1, Math.max(0, 6.5 - distance));
      const [r, g, b] = [124 + (255 - 124) * dot, 92 + (255 - 92) * dot, 255];
      const i = (y * size + x) * 4;
      pixels[i] = Math.round(b * alpha);
      pixels[i + 1] = Math.round(g * alpha);
      pixels[i + 2] = Math.round(r * alpha);
      pixels[i + 3] = Math.round(255 * alpha);
    }
  }
  return nativeImage.createFromBitmap(pixels, { width: size, height: size, scaleFactor: 2 });
}

/** Kadr lives in the tray (like Loom): click to open the panel, right-click for quick actions. */
export function createTray(
  windows: WindowManager,
  session: SessionCoordinator,
  updates: UpdateService,
): Tray {
  const tray = new Tray(createTrayIcon());
  tray.setToolTip("Kadr");
  tray.on("click", () => windows.toggleControl());

  const buildMenu = () => {
    const status = session.getSnapshot().status;
    const recording = status === "recording" || status === "paused";
    return Menu.buildFromTemplate([
      { label: "Open Kadr", click: () => windows.showControl() },
      {
        label: recording ? "Stop recording" : "Start recording",
        enabled: recording || status === "idle",
        click: () => session.toggleStartStop(),
      },
      { type: "separator" },
      updateMenuItem(updates, !session.isActive()),
      { label: "Quit Kadr", role: "quit" },
    ]);
  };
  // Rebuilt on every open so labels reflect the current session state.
  tray.on("right-click", () => tray.popUpContextMenu(buildMenu()));
  return tray;
}

function updateMenuItem(
  updates: UpdateService,
  idle: boolean,
): Electron.MenuItemConstructorOptions {
  const state = updates.getState();
  if (state.status === "downloaded") {
    return {
      label: `Restart to update to ${state.availableVersion}`,
      enabled: idle,
      click: () => updates.install(),
    };
  }
  return {
    label:
      state.status === "downloading"
        ? `Downloading update… ${state.progress ?? 0}%`
        : "Check for updates",
    enabled:
      idle &&
      state.status !== "disabled" &&
      state.status !== "checking" &&
      state.status !== "downloading",
    click: () => void updates.check(),
  };
}
