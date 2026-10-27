import type {
  AppSettings,
  AppSettingsPatch,
  BubbleSizePreset,
  CaptureArea,
  CountdownConfig,
  CountdownResult,
  CountdownSeconds,
  DesktopBubbleSettings,
  RecordingExtension,
  RecordingMode,
  RecordingResult,
  Region,
  RegionContext,
  RegionSelection,
  SessionCommand,
  SessionSnapshot,
  SessionStatus,
  ThemePreference,
  UpdateChannel,
  UpdateState,
} from "./schemas";

export type {
  AppSettings,
  AppSettingsPatch,
  BubbleSizePreset,
  CaptureArea,
  CountdownConfig,
  CountdownResult,
  CountdownSeconds,
  DesktopBubbleSettings,
  RecordingExtension,
  RecordingMode,
  RecordingResult,
  Region,
  RegionContext,
  RegionSelection,
  SessionCommand,
  SessionSnapshot,
  SessionStatus,
  ThemePreference,
  UpdateChannel,
  UpdateState,
};

/** IPC channel names. The preload bridge is the only code that uses them in renderers. */
export const Channels = {
  settingsGet: "settings:get",
  settingsUpdate: "settings:update",
  settingsChanged: "settings:changed",
  sessionGet: "session:get",
  sessionReport: "session:report",
  sessionCommand: "session:command",
  sessionChanged: "session:changed",
  sessionRunCommand: "session:run-command",
  countdownRun: "countdown:run",
  countdownGetConfig: "countdown:get-config",
  countdownFinish: "countdown:finish",
  recordingBegin: "recording:begin",
  recordingChunk: "recording:chunk",
  recordingFinish: "recording:finish",
  recordingDiscard: "recording:discard",
  shellShowInFolder: "shell:show-in-folder",
  shellOpenPath: "shell:open-path",
  shellOpenRecordings: "shell:open-recordings",
  shellCopyFile: "shell:copy-file",
  regionSelect: "region:select",
  regionGetContext: "region:get-context",
  regionUpdate: "region:update",
  regionConfirm: "region:confirm",
  regionCancel: "region:cancel",
  regionChanged: "region:changed",
  windowSetIgnoreMouse: "window:set-ignore-mouse",
  windowMoveTo: "window:move-to",
  shortcutsGet: "shortcuts:get",
  panelResize: "panel:resize",
  panelHide: "panel:hide",
  panelVisibility: "panel:visibility",
  bubbleVisibilityGet: "bubble:visibility:get",
  bubbleVisibility: "bubble:visibility",
  appQuit: "app:quit",
  updatesGet: "updates:get",
  updatesCheck: "updates:check",
  updatesInstall: "updates:install",
  updatesChanged: "updates:changed",
} as const;

/**
 * Global keyboard shortcuts (Electron accelerators) in order of preference. Another app may already
 * own one, so main registers the first free candidate and reports what it got.
 */
export const SHORTCUT_CANDIDATES = {
  startStop: ["Alt+Shift+R", "Alt+Shift+K", "CommandOrControl+Alt+R"],
  pauseResume: ["Alt+Shift+P", "CommandOrControl+Alt+P"],
} as const;

export type ShortcutAction = keyof typeof SHORTCUT_CANDIDATES;

/** The accelerator actually registered per action, or null when every candidate was taken. */
export type ActiveShortcuts = Record<ShortcutAction, string | null>;

/** The typed API exposed to renderers as `window.kadr`. */
export interface KadrApi {
  readonly platform: string;
  readonly settings: {
    get(): Promise<AppSettings>;
    update(patch: AppSettingsPatch): Promise<AppSettings>;
    onChange(listener: (settings: AppSettings) => void): () => void;
  };
  readonly session: {
    get(): Promise<SessionSnapshot>;
    /** Recording engine → main: publish the latest state. */
    report(snapshot: SessionSnapshot): void;
    /** Any window → main: request an action (toolbar buttons, shortcuts). */
    command(command: SessionCommand): Promise<void>;
    onChange(listener: (snapshot: SessionSnapshot) => void): () => void;
    /** Main → recording engine: perform an action. */
    onCommand(listener: (command: SessionCommand) => void): () => void;
  };
  readonly countdown: {
    run(config: CountdownConfig): Promise<CountdownResult>;
    getConfig(): Promise<CountdownConfig>;
    finish(result: CountdownResult): Promise<void>;
  };
  readonly recording: {
    begin(extension: RecordingExtension): Promise<{ id: string; path: string }>;
    appendChunk(id: string, data: Uint8Array): Promise<void>;
    finish(id: string): Promise<string>;
    discard(id: string): Promise<void>;
  };
  readonly shell: {
    showInFolder(path: string): Promise<void>;
    openPath(path: string): Promise<void>;
    openRecordingsFolder(): Promise<void>;
    /** Put a recording on the clipboard as a file (pastes into chats, emails and folders). */
    copyToClipboard(path: string): Promise<void>;
  };
  readonly region: {
    /** Recording engine: let the user pick the area to record; null when they cancel. */
    select(): Promise<RegionSelection | null>;
    /** Region picker: the display this overlay covers and the area to start from. */
    getContext(): Promise<RegionContext>;
    /** Region picker: the selection changed (pickers on other displays clear theirs). */
    update(region: Region | null): void;
    /** Region picker: record this area. */
    confirm(region: Region): void;
    /** Region picker: give up (Esc). */
    cancel(): void;
    /** Region picker: the selection moved to another display, or was cleared. */
    onChange(listener: (region: Region | null) => void): () => void;
  };
  readonly window: {
    /** Let clicks pass through transparent parts of floating windows. */
    setIgnoreMouseEvents(ignore: boolean): void;
    moveTo(x: number, y: number): void;
  };
  readonly shortcuts: {
    get(): Promise<ActiveShortcuts>;
  };
  readonly panel: {
    /** Fit the control panel window to its content height (CSS pixels). */
    resize(height: number): void;
    /** Hide the panel; the app keeps running in the tray. */
    hide(): void;
    /** Panel shown/hidden (Page Visibility can't tell: the panel never throttles). */
    onVisibilityChange(listener: (visible: boolean) => void): () => void;
  };
  readonly bubble: {
    /** Whether the bubble window is on screen; it holds the camera only while it is. */
    isVisible(): Promise<boolean>;
    /** Bubble shown/hidden (Page Visibility doesn't update for hidden overlay windows). */
    onVisibilityChange(listener: (visible: boolean) => void): () => void;
  };
  readonly app: {
    quit(): void;
  };
  readonly updates: {
    get(): Promise<UpdateState>;
    /** Check now (manual checks also run when automatic updates are off). */
    check(): Promise<void>;
    /** Restart and install a downloaded update (refused while recording). */
    install(): Promise<void>;
    onChange(listener: (state: UpdateState) => void): () => void;
  };
}
