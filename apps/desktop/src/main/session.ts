import {
  Channels,
  type CountdownConfig,
  type CountdownResult,
  type Region,
  type RegionSelection,
  type SessionCommand,
  type SessionSnapshot,
  type SessionStatus,
} from "../shared/api";
import { ACTIVE_STATUSES, IDLE_SNAPSHOT } from "../shared/session";
import type { SettingsStore } from "./settings-store";
import type { WindowManager } from "./windows";

interface PendingCountdown {
  config: CountdownConfig;
  resolve(result: CountdownResult): void;
}

/** Statuses during which the frame around a recorded region is shown. */
const FRAMED_STATUSES: ReadonlySet<SessionStatus> = new Set(["countdown", "recording", "paused"]);

/**
 * Coordinates a recording session across windows. The recording engine (in the control window)
 * owns the media pipeline and reports its state here; this class relays commands from the toolbar
 * and shortcuts to the engine, and shows or hides windows as the session moves between states.
 */
export class SessionCoordinator {
  private snapshot: SessionSnapshot = IDLE_SNAPSHOT;
  private pendingCountdown: PendingCountdown | null = null;
  private pendingRegion: ((selection: RegionSelection | null) => void) | null = null;
  /** The region being recorded in this session, if any. */
  private region: RegionSelection | null = null;

  constructor(
    private readonly windows: WindowManager,
    private readonly settings: SettingsStore,
  ) {}

  getSnapshot(): SessionSnapshot {
    return this.snapshot;
  }

  /** True from the moment a recording starts preparing until it is saved or discarded. */
  isActive(): boolean {
    return this.snapshot.status !== "idle";
  }

  report(next: SessionSnapshot): void {
    const previous = this.snapshot.status;
    this.snapshot = next;
    this.windows.broadcast(Channels.sessionChanged, next);
    if (previous !== next.status) this.choreograph(next.status);
  }

  command(command: SessionCommand): void {
    if (command === "toggleCamera") {
      const { bubble } = this.settings.get();
      this.settings.update({ bubble: { visible: !bubble.visible } });
      return;
    }
    this.windows.control?.webContents.send(Channels.sessionRunCommand, command);
  }

  /**
   * Global start/stop shortcut: start when idle, stop when recording, cancel a countdown or the
   * region picker.
   */
  toggleStartStop(): void {
    const { status } = this.snapshot;
    if (status === "idle") this.command("start");
    else if (status === "preparing" && this.pendingRegion) this.finishRegion(null);
    else if (status === "countdown") this.finishCountdown("cancelled");
    else if (status === "recording" || status === "paused") this.command("stop");
  }

  runCountdown(config: CountdownConfig): Promise<CountdownResult> {
    this.finishCountdown("cancelled");
    return new Promise((resolve) => {
      this.pendingCountdown = { config, resolve };
      this.windows.openCountdown(() => this.finishCountdown("cancelled"), this.region?.area);
    });
  }

  getCountdownConfig(): CountdownConfig | null {
    return this.pendingCountdown?.config ?? null;
  }

  finishCountdown(result: CountdownResult): void {
    const pending = this.pendingCountdown;
    this.pendingCountdown = null;
    this.windows.closeCountdown();
    pending?.resolve(result);
  }

  /** Recording engine: shows the region picker; resolves with the area, or null if cancelled. */
  selectRegion(): Promise<RegionSelection | null> {
    this.finishRegion(null);
    return new Promise((resolve) => {
      this.pendingRegion = resolve;
      this.windows.openRegionPicker(() => this.finishRegion(null));
    });
  }

  /** Region picker: the user chose an area. An unusable one leaves the picker open. */
  confirmRegion(region: Region): void {
    if (!this.pendingRegion) return;
    const selection = this.windows.acceptRegion(region);
    if (selection) this.finishRegion(selection);
  }

  finishRegion(selection: RegionSelection | null): void {
    const resolve = this.pendingRegion;
    this.pendingRegion = null;
    this.windows.closeRegionPicker();
    if (selection) this.region = selection;
    resolve?.(selection);
  }

  /** The display getDisplayMedia() should capture: the region's, or null for the primary. */
  captureDisplayId(): number | null {
    return this.region?.displayId ?? null;
  }

  private choreograph(next: SessionStatus): void {
    // Keeps the bubble visible while the panel is hidden during a session.
    this.windows.setSessionActive(next !== "idle");
    if (next === "countdown") {
      this.windows.hideControl();
      this.windows.hideToolbar();
    } else if (ACTIVE_STATUSES.has(next)) {
      this.windows.hideControl();
      this.windows.showToolbar();
    } else if (next === "idle") {
      // The engine gave up (an error) while the picker was still open.
      this.finishRegion(null);
      this.region = null;
      this.windows.hideToolbar();
      this.windows.showControl();
    }
    if (this.region && FRAMED_STATUSES.has(next)) this.windows.showRegionFrame(this.region.area);
    else this.windows.hideRegionFrame();
  }
}
