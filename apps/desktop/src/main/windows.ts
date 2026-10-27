import { join } from "node:path";
import { getBubbleShape } from "@kadr/compositor/shapes";
import { app, BrowserWindow, screen, type WebPreferences } from "electron";
import {
  type AppSettings,
  Channels,
  type RegionContext,
  type RegionSelection,
} from "../shared/api";
import { APP_ORIGIN } from "../shared/origin";
import {
  clampIntoArea,
  isFullyVisible,
  type Rect,
  resolveBubblePosition,
} from "../shared/placement";
import { type DisplayRegion, normalizeRegion, restoreRegion } from "../shared/region";
import { isBubbleShown } from "../shared/settings";
import type { WindowStateStore } from "./window-state";

type Page = "control" | "bubble" | "toolbar" | "countdown" | "region" | "frame";

/** Loom-like bubble sizes (diameter in DIPs). */
const BUBBLE_PIXEL_HEIGHT = { small: 150, medium: 200, large: 280 } as const;
/**
 * How often floating windows re-assert their place at the top while visible. On Windows every
 * always-on-top window shares one band, and whichever was activated last (another app's player or
 * call window, even our own panel) ends up above ours.
 */
const KEEP_ON_TOP_INTERVAL_MS = 1500;
/** Control panel: 320 px card plus a transparent margin for its shadow. */
const PANEL_WIDTH = 344;
const PANEL_MARGIN = 12;
const TOOLBAR_SIZE = { width: 280, height: 440 } as const;
/** Transparent space above and below the toolbar pill inside its window. */
const TOOLBAR_PILL_INSET = 46;
const COUNTDOWN_SIZE = { width: 420, height: 420 } as const;
/** The frame around a recorded region sits this far outside it, so it is never in the video. */
const REGION_FRAME_INSET = 4;

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
  /** Region picker overlays, one per display, while the user picks an area. */
  private regionPickers = new Map<number, BrowserWindow>();
  private regionPickerStart: DisplayRegion | null = null;
  private onRegionPickerClosed: (() => void) | null = null;
  private regionFrame: BrowserWindow | null = null;
  private settings: AppSettings | null = null;
  private sessionActive = false;
  private toolbarMovedByUser = false;
  private quitting = false;
  private keepOnTopTimer: NodeJS.Timeout | null = null;

  constructor(private readonly windowState: WindowStateStore) {
    app.on("before-quit", () => {
      this.quitting = true;
      if (this.keepOnTopTimer) clearInterval(this.keepOnTopTimer);
      this.keepOnTopTimer = null;
    });
    // Another window took the top of the stack (including our own panel): put ours back on top.
    app.on("browser-window-focus", () => this.raiseFloatingWindows());
    app.on("browser-window-blur", () => this.raiseFloatingWindows());
    // Displays changed (unplugged monitor, new resolution): keep the bubble fully visible, and
    // give up on a region being picked, whose overlays no longer match the screens.
    const onDisplaysChanged = () => {
      this.keepBubbleOnScreen();
      if (this.regionPickers.size > 0) this.onRegionPickerClosed?.();
      this.raiseFloatingWindows();
    };
    screen.on("display-added", onDisplaysChanged);
    screen.on("display-removed", onDisplaysChanged);
    screen.on("display-metrics-changed", onDisplaysChanged);
  }

  /** The control panel: a compact, frameless card near the top-right corner, like a tray app. */
  createControl({ startHidden = false }: { startHidden?: boolean } = {}): BrowserWindow {
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
    win.once("ready-to-show", () => {
      if (!startHidden) this.showControl();
    });
    win.on("close", (event) => {
      // Closing the panel keeps Kadr running in the tray.
      if (this.quitting) return;
      event.preventDefault();
      this.hideControl();
    });
    win.on("closed", () => {
      this.control = null;
      this.syncBubble();
    });
    void win.loadURL(pageUrl("control"));
    this.control = win;
    return win;
  }

  createBubble(settings: AppSettings): void {
    const size = bubbleWindowSize(settings);
    // Where the user left it, if that is still fully on a display; otherwise the default corner.
    const position = resolveBubblePosition(
      this.windowState.bubblePosition,
      size,
      screen.getAllDisplays().map((display) => display.workArea),
      screen.getPrimaryDisplay().workArea,
    );
    const win = createOverlayWindow("bubble", { ...size, ...position });
    this.keepOpenUntilQuit(win);
    win.setIgnoreMouseEvents(true, { forward: true });
    win.on("moved", () => this.rememberBubblePosition());
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
    this.raiseFloatingWindows();
  }

  hideToolbar(): void {
    this.toolbar?.hide();
  }

  /** Called when the user drags a floating window, so we stop auto-placing it. */
  noteUserMoved(win: BrowserWindow): void {
    if (win === this.toolbar) this.toolbarMovedByUser = true;
    if (win === this.bubble) this.rememberBubblePosition();
  }

  /** Shows the countdown over `center` (the recorded region) or in the middle of the screen. */
  openCountdown(onClosed: () => void, center?: Rect): void {
    this.closeCountdown();
    const target = center ?? screen.getPrimaryDisplay().workArea;
    const centered = {
      ...COUNTDOWN_SIZE,
      x: target.x + Math.round((target.width - COUNTDOWN_SIZE.width) / 2),
      y: target.y + Math.round((target.height - COUNTDOWN_SIZE.height) / 2),
    };
    const win = createOverlayWindow(
      "countdown",
      { ...centered, ...clampIntoArea(centered, screen.getDisplayMatching(centered).workArea) },
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

  /**
   * Covers every display with a region picker overlay. The panel hides; the bubble stays above
   * the overlays so it can still be placed. `onClosed` runs if the pickers go away on their own
   * (closed by the system, or the displays changed).
   */
  openRegionPicker(onClosed: () => void): void {
    this.closeRegionPicker();
    this.onRegionPickerClosed = onClosed;
    const displays = screen.getAllDisplays();
    this.regionPickerStart = restoreRegion(this.windowState.region, displays);
    // Keyboard focus goes to the display with the remembered region, else the one with the mouse.
    const focusId =
      this.regionPickerStart?.displayId ??
      screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).id;
    this.hideControl();
    for (const display of displays) {
      const win = createOverlayWindow("region", display.bounds);
      win.once("ready-to-show", () => {
        // Windows sizes a window created on a display with another scale factor wrongly.
        win.setBounds(display.bounds);
        if (display.id === focusId) {
          win.show();
          win.focus();
        } else {
          win.showInactive();
        }
        this.raiseFloatingWindows();
      });
      win.on("closed", () => {
        // closeRegionPicker() forgets its windows first; anything else is a cancel.
        if (this.regionPickers.get(display.id) === win) this.onRegionPickerClosed?.();
      });
      this.regionPickers.set(display.id, win);
    }
  }

  closeRegionPicker(): void {
    const pickers = [...this.regionPickers.values()];
    this.regionPickers.clear();
    this.onRegionPickerClosed = null;
    for (const win of pickers) if (!win.isDestroyed()) win.close();
  }

  /** The display a region picker covers, or null when `win` isn't one. */
  regionPickerDisplayId(win: BrowserWindow | null): number | null {
    for (const [displayId, picker] of this.regionPickers) if (picker === win) return displayId;
    return null;
  }

  regionPickerContext(win: BrowserWindow | null): RegionContext | null {
    const displayId = this.regionPickerDisplayId(win);
    const display = screen.getAllDisplays().find((candidate) => candidate.id === displayId);
    if (!display) return null;
    const start = this.regionPickerStart;
    return {
      displayId: display.id,
      bounds: display.bounds,
      scaleFactor: display.scaleFactor,
      selection: start?.displayId === display.id ? start : null,
    };
  }

  /** Tells the pickers on other displays where the selection is now, so they clear theirs. */
  forwardRegionSelection(region: DisplayRegion | null, from: BrowserWindow): void {
    for (const win of this.regionPickers.values()) {
      if (win !== from && !win.isDestroyed()) win.webContents.send(Channels.regionChanged, region);
    }
  }

  /**
   * Turns a picked region into what the recording needs, and remembers it for next time. Null
   * when it isn't usable (its display is gone, or it is too small).
   */
  acceptRegion(region: DisplayRegion): RegionSelection | null {
    const displays = screen
      .getAllDisplays()
      .filter((display) => this.regionPickers.has(display.id));
    const area = normalizeRegion(region, displays);
    const display = displays.find((candidate) => candidate.id === area?.displayId);
    if (!area || !display) return null;
    this.windowState.rememberRegion(area);
    const { displayId, ...rect } = area;
    return { displayId, display: display.bounds, area: rect };
  }

  /** A thin frame just outside the recorded region, excluded from capture and click-through. */
  showRegionFrame(area: Rect): void {
    const bounds = {
      x: area.x - REGION_FRAME_INSET,
      y: area.y - REGION_FRAME_INSET,
      width: area.width + REGION_FRAME_INSET * 2,
      height: area.height + REGION_FRAME_INSET * 2,
    };
    const existing = this.regionFrame;
    if (existing && !existing.isDestroyed()) {
      existing.setBounds(bounds);
      if (!existing.isVisible()) existing.showInactive();
      this.raiseFloatingWindows();
      return;
    }
    const win = createOverlayWindow("frame", bounds);
    win.setContentProtection(true);
    win.setIgnoreMouseEvents(true);
    win.once("ready-to-show", () => {
      if (this.regionFrame !== win) return;
      win.setBounds(bounds);
      win.showInactive();
      this.raiseFloatingWindows();
    });
    this.regionFrame = win;
  }

  hideRegionFrame(): void {
    const win = this.regionFrame;
    this.regionFrame = null;
    if (win && !win.isDestroyed()) win.close();
  }

  applyBubble(settings: AppSettings): void {
    this.settings = settings;
    const win = this.bubble;
    if (!win || win.isDestroyed()) return;
    const bounds = win.getBounds();
    const size = bubbleWindowSize(settings);
    if (size.width !== bounds.width || size.height !== bounds.height) {
      // Keep the bottom-left corner anchored while resizing, but never past a screen edge.
      const resized = { x: bounds.x, y: bounds.y + bounds.height - size.height, ...size };
      const area = screen.getDisplayMatching(bounds).workArea;
      win.setBounds({ ...resized, ...clampIntoArea(resized, area) });
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
    if (shown) {
      this.keepBubbleOnScreen();
      if (!win.isVisible()) win.showInactive();
    } else if (win.isVisible()) {
      win.hide();
    }
    // The bubble starts and stops the camera on this signal.
    win.webContents.send(Channels.bubbleVisibility, shown);
    this.raiseFloatingWindows();
  }

  /**
   * Puts the floating windows (region picker and frame, bubble, toolbar, countdown) back at the
   * very top of the window stack, above other always-on-top windows, without taking focus.
   * Repeats while any of them is visible.
   */
  private raiseFloatingWindows(): void {
    let anyVisible = false;
    // Bottom to top: the bubble stays above the region picker, so it can be placed while picking.
    const stack = [
      ...this.regionPickers.values(),
      this.regionFrame,
      this.bubble,
      this.toolbar,
      this.countdown,
    ];
    for (const win of stack) {
      if (!win || win.isDestroyed() || !win.isVisible()) continue;
      anyVisible = true;
      // Re-applied every time: Windows can drop the level after a hide/show cycle.
      win.setAlwaysOnTop(true, "screen-saver");
      win.moveTop();
    }
    if (anyVisible && !this.keepOnTopTimer) {
      this.keepOnTopTimer = setInterval(() => this.raiseFloatingWindows(), KEEP_ON_TOP_INTERVAL_MS);
    } else if (!anyVisible && this.keepOnTopTimer) {
      clearInterval(this.keepOnTopTimer);
      this.keepOnTopTimer = null;
    }
  }

  /** Moves the bubble back to the default corner if it isn't fully on any display. */
  private keepBubbleOnScreen(): void {
    const win = this.bubble;
    if (!win || win.isDestroyed()) return;
    const bounds = win.getBounds();
    const areas = screen.getAllDisplays().map((display) => display.workArea);
    if (isFullyVisible(bounds, areas)) return;
    const position = resolveBubblePosition(
      null,
      bounds,
      areas,
      screen.getPrimaryDisplay().workArea,
    );
    win.setPosition(position.x, position.y);
  }

  private rememberBubblePosition(): void {
    const win = this.bubble;
    if (!win || win.isDestroyed()) return;
    const [x = 0, y = 0] = win.getPosition();
    this.windowState.rememberBubble({ x, y });
  }

  /** Whether the bubble window is on screen. */
  isBubbleVisible(): boolean {
    return !!this.bubble && !this.bubble.isDestroyed() && this.bubble.isVisible();
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
