import {
  Channels,
  type CountdownConfig,
  type CountdownResult,
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

/**
 * Coordinates a recording session across windows. The recording engine (in the control window)
 * owns the media pipeline and reports its state here; this class relays commands from the toolbar
 * and shortcuts to the engine, and shows or hides windows as the session moves between states.
 */
export class SessionCoordinator {
  private snapshot: SessionSnapshot = IDLE_SNAPSHOT;
  private pendingCountdown: PendingCountdown | null = null;

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

  /** Global start/stop shortcut: start when idle, stop when recording, cancel a countdown. */
  toggleStartStop(): void {
    const { status } = this.snapshot;
    if (status === "idle") this.command("start");
    else if (status === "countdown") this.finishCountdown("cancelled");
    else if (status === "recording" || status === "paused") this.command("stop");
  }

  runCountdown(config: CountdownConfig): Promise<CountdownResult> {
    this.finishCountdown("cancelled");
    return new Promise((resolve) => {
      this.pendingCountdown = { config, resolve };
      this.windows.openCountdown(() => this.finishCountdown("cancelled"));
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
      this.windows.hideToolbar();
      this.windows.showControl();
    }
  }
}
