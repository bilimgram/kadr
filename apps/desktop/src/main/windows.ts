import { join } from "node:path";
import { getBubbleShape } from "@kadr/compositor/shapes";
import { app, BrowserWindow, screen, type WebPreferences } from "electron";
import { type AppSettings, Channels } from "../shared/api";
import { isBubbleShown } from "../shared/settings";
import { APP_ORIGIN } from "./protocol";

type Page = "control" | "bubble" | "toolbar" | "countdown";

/** Loom-like bubble sizes (diameter in DIPs). */
const BUBBLE_PIXEL_HEIGHT = { small: 150, medium: 200, large: 280 } as const;
const BUBBLE_MARGIN = 24;
/** Control panel: 320 px card plus a transparent margin for its shadow. */
const PANEL_WIDTH = 344;
const PANEL_MARGIN = 12;
const TOOLBAR_SIZE = { width: 280, height: 440 } as const;
/** Transparent space above and below the toolbar pill inside its window. */
const TOOLBAR_PILL_INSET = 46;
const COUNTDOWN_SIZE = { width: 420, height: 420 } as const;

const secureWebPreferences: WebPreferences = {
  preload: join(__dirname, "../preload/index.js"),
  contextIsolation: true,
  sandbox: true,
  nodeIntegration: false,
  webSecurity: true,
  spellcheck: false,
};

function pageUrl(page: Page): string {
  const devServerUrl = process.env.ELECTRON_RENDERER_URL;
  return devServerUrl ? `${devServerUrl}/${page}.html` : `${APP_ORIGIN}/${page}.html`;
}

/** Floating overlay windows: transparent, frameless, above everything, on every workspace. */
function createOverlayWindow(
  page: Page,
  bounds: Electron.Rectangle,
  webPreferences: WebPreferences = secureWebPreferences,
): BrowserWindow {
  const win = new BrowserWindow({
    ...bounds,
    transparent: true,
    backgroundColor: "#00000000",
    frame: false,
    resizable: false,
    maximizable: false,
    minimizable: false,
    fullscreenable: false,
    hasShadow: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    show: false,
    webPreferences,
  });
  win.setAlwaysOnTop(true, "screen-saver");
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  void win.loadURL(pageUrl(page));
  return win;
}

export function bubbleWindowSize(settings: AppSettings) {
  const height = BUBBLE_PIXEL_HEIGHT[settings.bubble.size];
  return {
    width: Math.round(height * getBubbleShape(settings.bubble.shape).aspectRatio),
    height,
  };
}

/** Owns every window and their choreography; the rest of main never touches BrowserWindow directly. */
export class WindowManager {
  control: BrowserWindow | null = null;
  private bubble: BrowserWindow | null = null;
  private toolbar: BrowserWindow | null = null;
  private countdown: BrowserWindow | null = null;
  private settings: AppSettings | null = null;
  private sessionActive = false;
  private toolbarMovedByUser = false;
  private quitting = false;

  constructor() {
    app.on("before-quit", () => {
      this.quitting = true;
    });
  }

  /** The control panel: a compact, frameless card near the top-right corner, like a tray app. */
  createControl(): BrowserWindow {
    const area = screen.getPrimaryDisplay().workArea;
    const win = new BrowserWindow({
      width: PANEL_WIDTH,
      height: 520,
      x: area.x + area.width - PANEL_WIDTH - 8,
      y: area.y + 8,
      title: "Kadr",
      show: false,
      frame: false,
      transparent: true,
      backgroundColor: "#00000000",
      hasShadow: false,
      resizable: false,
      maximizable: false,
      fullscreenable: false,
      alwaysOnTop: true,
      // The panel hosts the recording engine, so it must keep running while hidden.
      webPreferences: { ...secureWebPreferences, backgroundThrottling: false },
    });
    win.once("ready-to-show", () => this.showControl());
    win.on("close", (event) => {
      // Closing the panel keeps Kadr running in the tray.
      if (this.quitting) return;
      event.preventDefault();
      this.hideControl();
    });
    win.on("closed", () => {
      this.control = null;
    });
    void win.loadURL(pageUrl("control"));
    this.control = win;
    return win;
  }

  createBubble(settings: AppSettings): void {
    const { width, height } = bubbleWindowSize(settings);
    const area = screen.getPrimaryDisplay().workArea;
    const win = createOverlayWindow("bubble", {
      width,
      height,
      x: area.x + BUBBLE_MARGIN,
      y: area.y + area.height - height - BUBBLE_MARGIN,
    });
    this.keepOpenUntilQuit(win);
    win.setIgnoreMouseEvents(true, { forward: true });
    win.once("ready-to-show", () => this.syncBubble());
    this.bubble = win;
    this.settings = settings;
  }

  /** Created up front (hidden) so it appears instantly when recording starts. */
  createToolbar(): void {
    const area = screen.getPrimaryDisplay().workArea;
    const win = createOverlayWindow("toolbar", {
      ...TOOLBAR_SIZE,
      x: area.x + 8,
      y: area.y + Math.round((area.height - TOOLBAR_SIZE.height) / 2),
    });
    this.keepOpenUntilQuit(win);
    // Excluded from screen capture (Windows 10 2004+; best effort on macOS until the native core).
    win.setContentProtection(true);
    win.setIgnoreMouseEvents(true, { forward: true });
    this.toolbar = win;
  }

  isControlVisible(): boolean {
    return !!this.control?.isVisible();
  }

  showControl(): void {
    if (!this.control) return;
    this.control.show();
    this.control.focus();
    this.control.webContents.send(Channels.panelVisibility, true);
    this.syncBubble();
  }

  hideControl(): void {
    this.control?.hide();
    this.control?.webContents.send(Channels.panelVisibility, false);
    this.syncBubble();
  }

  toggleControl(): void {
    if (this.isControlVisible()) this.hideControl();
    else this.showControl();
  }

  /** Fits the panel window to its content. */
  resizeControl(contentHeight: number): void {
    const win = this.control;
    if (!win || win.isDestroyed()) return;
    const area = screen.getDisplayMatching(win.getBounds()).workArea;
    const height = Math.min(contentHeight + PANEL_MARGIN * 2, area.height - 16);
    const bounds = win.getBounds();
    if (bounds.height !== height) win.setBounds({ ...bounds, width: PANEL_WIDTH, height });
  }

  setSessionActive(active: boolean): void {
    this.sessionActive = active;
    this.syncBubble();
  }

  showToolbar(): void {
    const win = this.toolbar;
    if (!win || win.isVisible()) return;
    if (!this.toolbarMovedByUser) this.placeToolbarAboveBubble(win);
    win.showInactive();
  }

  hideToolbar(): void {
    this.toolbar?.hide();
  }

  /** Called when the user drags a floating window, so we stop auto-placing it. */
  noteUserMoved(win: BrowserWindow): void {
    if (win === this.toolbar) this.toolbarMovedByUser = true;
  }

  openCountdown(onClosed: () => void): void {
    this.closeCountdown();
    const area = screen.getPrimaryDisplay().workArea;
    const win = createOverlayWindow(
      "countdown",
      {
        ...COUNTDOWN_SIZE,
        x: area.x + Math.round((area.width - COUNTDOWN_SIZE.width) / 2),
        y: area.y + Math.round((area.height - COUNTDOWN_SIZE.height) / 2),
      },
      // Countdown tones play without a prior click in this window.
      { ...secureWebPreferences, autoplayPolicy: "no-user-gesture-required" },
    );
    win.setContentProtection(true);
    win.once("ready-to-show", () => {
      win.show();
      win.focus();
    });
    win.on("closed", () => {
      // Only a user-initiated close counts; closeCountdown() clears the reference first.
      if (this.countdown !== win) return;
      this.countdown = null;
      onClosed();
    });
    this.countdown = win;
  }

  closeCountdown(): void {
    const win = this.countdown;
    this.countdown = null;
    if (win && !win.isDestroyed()) win.close();
  }

  isCountdownWindow(win: BrowserWindow | null): boolean {
    return !!win && win === this.countdown;
  }

  applyBubble(settings: AppSettings): void {
    this.settings = settings;
    const win = this.bubble;
    if (!win || win.isDestroyed()) return;
    const bounds = win.getBounds();
    const size = bubbleWindowSize(settings);
    if (size.width !== bounds.width || size.height !== bounds.height) {
      // Keep the bottom-left corner anchored while resizing.
      win.setBounds({ x: bounds.x, y: bounds.y + bounds.height - size.height, ...size });
    }
    this.syncBubble();
  }

  broadcast(channel: string, payload: unknown): void {
    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed()) win.webContents.send(channel, payload);
    }
  }

  /** Like Loom, the bubble shows while the panel is open (as a preview) or while recording. */
  private syncBubble(): void {
    const win = this.bubble;
    if (!win || win.isDestroyed() || !this.settings) return;
    const shown = isBubbleShown(this.settings) && (this.sessionActive || this.isControlVisible());
    if (shown && !win.isVisible()) win.showInactive();
    if (!shown && win.isVisible()) win.hide();
  }

  private placeToolbarAboveBubble(win: BrowserWindow): void {
    const area = screen.getPrimaryDisplay().workArea;
    const bubble = this.bubble?.isVisible() ? this.bubble.getBounds() : null;
    const centered = area.y + Math.round((area.height - TOOLBAR_SIZE.height) / 2);
    const aboveBubble = bubble
      ? bubble.y - TOOLBAR_SIZE.height + TOOLBAR_PILL_INSET - 12
      : centered;
    win.setPosition(area.x + 8, Math.max(area.y + 8, aboveBubble));
  }

  private keepOpenUntilQuit(win: BrowserWindow): void {
    // Floating windows can't be closed on their own (e.g. Alt+F4); they live as long as the app.
    win.on("close", (event) => {
      if (!this.quitting) event.preventDefault();
    });
  }
}
