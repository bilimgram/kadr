import { existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { app } from "electron";
import { autoUpdater, type ProgressInfo, type UpdateInfo } from "electron-updater";
import type { UpdateState } from "../shared/api";
import type { UpdateSettings } from "../shared/schemas";
import { describeUpdateError } from "../shared/updates";

/** First check shortly after launch, then every few hours while the app runs. */
const STARTUP_DELAY_MS = 15_000;
const CHECK_INTERVAL_MS = 4 * 60 * 60 * 1000;

export interface UpdateServiceOptions {
  getSettings(): UpdateSettings;
  /** True while a recording session is active: never check, download or restart then. */
  isBusy(): boolean;
  onChange(state: UpdateState): void;
}

/** Why this build can't update itself, or null when it can. */
function feedProblem(): string | null {
  if (process.env.KADR_DISABLE_UPDATES === "1")
    return "Updates are turned off by your administrator.";
  if (!app.isPackaged) {
    return process.env.KADR_DEV_UPDATE_URL
      ? null
      : "Updates are available in installed builds (set KADR_DEV_UPDATE_URL to test locally).";
  }
  // electron-builder writes app-update.yml only when the build had an update feed (KADR_UPDATE_URL).
  if (!existsSync(join(process.resourcesPath, "app-update.yml"))) {
    return "This build has no update feed configured.";
  }
  return null;
}

/**
 * Background updates via electron-updater from the static feed on Cloudflare R2 (electron-builder
 * "generic" provider; see docs/RELEASING.md). Updates download in the background and install when
 * the app quits, or immediately when the user chooses "Restart to update" — never mid-recording.
 */
export class UpdateService {
  private state: UpdateState = {
    status: "idle",
    currentVersion: app.getVersion(),
    availableVersion: null,
    progress: null,
    lastCheckedAt: null,
    message: null,
  };
  private timer: NodeJS.Timeout | null = null;
  private checking = false;

  constructor(private readonly options: UpdateServiceOptions) {}

  getState(): UpdateState {
    return this.state;
  }

  start(): void {
    const problem = feedProblem();
    if (problem) {
      this.set({ status: "disabled", message: problem });
      return;
    }

    const devFeed = process.env.KADR_DEV_UPDATE_URL;
    if (!app.isPackaged && devFeed) {
      // Local testing against a static server serving latest.yml and the installers. The updater
      // reads its feed and cache directory from this file (app-update.yml in packaged builds).
      if (!/^https?:\/\//u.test(devFeed)) throw new Error("KADR_DEV_UPDATE_URL must be http(s).");
      const configPath = join(app.getPath("temp"), "kadr-dev-app-update.yml");
      writeFileSync(
        configPath,
        `provider: generic\nurl: ${JSON.stringify(devFeed)}\nupdaterCacheDirName: kadr-dev-updater\n`,
      );
      autoUpdater.forceDevUpdateConfig = true;
      autoUpdater.updateConfigPath = configPath;
    }

    autoUpdater.logger = {
      info: (message: unknown) => console.info("[updater]", message),
      warn: (message: unknown) => console.warn("[updater]", message),
      error: (message: unknown) => console.error("[updater]", message),
      debug: () => undefined,
    };
    autoUpdater.autoDownload = true;
    // Kadr ships full NSIS installers; never fetch a web installer's payload from elsewhere.
    autoUpdater.disableWebInstaller = true;
    // A dev feed exercises checking and downloading; installing would replace a real install.
    autoUpdater.autoInstallOnAppQuit = app.isPackaged;
    this.applySettings();

    autoUpdater.on("checking-for-update", () => this.set({ status: "checking", message: null }));
    autoUpdater.on("update-available", (info: UpdateInfo) =>
      this.set({ status: "available", availableVersion: info.version, progress: 0, message: null }),
    );
    autoUpdater.on("update-not-available", () =>
      this.set({
        status: "up-to-date",
        availableVersion: null,
        progress: null,
        lastCheckedAt: Date.now(),
      }),
    );
    autoUpdater.on("download-progress", (progress: ProgressInfo) =>
      this.set({ status: "downloading", progress: Math.round(progress.percent) }),
    );
    autoUpdater.on("update-downloaded", (info: UpdateInfo) =>
      this.set({
        status: "downloaded",
        availableVersion: info.version,
        progress: 100,
        lastCheckedAt: Date.now(),
        message: null,
      }),
    );
    autoUpdater.on("error", (error: Error) =>
      this.set({
        status: "error",
        progress: null,
        lastCheckedAt: Date.now(),
        message: describeUpdateError(error),
      }),
    );

    this.timer = setTimeout(() => this.tick(), STARTUP_DELAY_MS);
  }

  /** Re-reads the channel; call after settings change. */
  applySettings(): void {
    if (this.state.status === "disabled") return;
    const beta = this.options.getSettings().channel === "beta";
    autoUpdater.allowPrerelease = beta;
    // "latest" reads latest*.yml; "beta" reads beta*.yml (prerelease versions like 1.2.0-beta.1).
    autoUpdater.channel = beta ? "beta" : "latest";
    // Setting a channel also enables downgrades. Never downgrade: a mistaken feed must not roll
    // back every install, and leaving beta takes effect with the next newer stable release.
    autoUpdater.allowDowngrade = false;
  }

  /** Checks now. Safe to call repeatedly; no-op while busy, checking, or already downloaded. */
  async check(): Promise<void> {
    const { status } = this.state;
    if (status === "disabled" || status === "downloading" || status === "downloaded") return;
    if (this.checking || this.options.isBusy()) return;
    this.checking = true;
    try {
      await autoUpdater.checkForUpdates();
    } catch (error) {
      this.set({
        status: "error",
        progress: null,
        lastCheckedAt: Date.now(),
        message: describeUpdateError(error),
      });
    } finally {
      this.checking = false;
    }
  }

  /**
   * Quits, installs the downloaded update silently, and relaunches Kadr. When that isn't possible
   * right now, says why in the update status instead of throwing (callers include the tray menu).
   */
  install(): void {
    if (this.state.status !== "downloaded") return;
    if (this.options.isBusy()) {
      this.set({ message: "Finish or stop the recording, then restart to update." });
      return;
    }
    if (!app.isPackaged) {
      this.set({ message: "Installing updates is disabled in development builds." });
      return;
    }
    autoUpdater.quitAndInstall(true, true);
  }

  dispose(): void {
    if (this.timer) clearTimeout(this.timer);
  }

  private tick(): void {
    if (this.options.getSettings().automatic) void this.check();
    this.timer = setTimeout(() => this.tick(), CHECK_INTERVAL_MS);
  }

  private set(patch: Partial<UpdateState>): void {
    this.state = { ...this.state, ...patch };
    this.options.onChange(this.state);
  }
}
