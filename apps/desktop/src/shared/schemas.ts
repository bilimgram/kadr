import { BubbleShapeId } from "@kadr/project-format";
import { z } from "zod";

/** Runtime validation for persisted settings and every IPC payload crossing into the main process. */

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

export const BubbleSizePreset = z.enum(["small", "medium", "large"]);

export const DesktopBubbleSettings = z.object({
  /** Camera bubble on/off (only shown in "screenAndCamera" and "camera" modes). */
  visible: z.boolean(),
  shape: BubbleShapeId,
  size: BubbleSizePreset,
  mirror: z.boolean(),
  /** Automatic light correction for dark webcam images. */
  touchUp: z.boolean(),
  cameraDeviceId: z.string().max(512).optional(),
});

export const RecordingMode = z.enum(["screenAndCamera", "screen", "camera"]);

export const CountdownSeconds = z.union([z.literal(0), z.literal(3), z.literal(5)]);

export const RecordingSettings = z.object({
  mode: RecordingMode,
  countdownSeconds: CountdownSeconds,
  countdownSound: z.boolean(),
  microphoneEnabled: z.boolean(),
  microphoneDeviceId: z.string().max(512).optional(),
  /** System audio loopback (Windows only for now). */
  systemAudio: z.boolean(),
});

export const ThemePreference = z.enum(["light", "dark", "system"]);

export const AppearanceSettings = z.object({
  theme: ThemePreference,
});

export const UpdateChannel = z.enum(["stable", "beta"]);

export const UpdateSettings = z.object({
  channel: UpdateChannel,
  /** Download updates in the background; when off, only manual checks run. */
  automatic: z.boolean(),
});

export const SystemSettings = z.object({
  /** Start Kadr (hidden, in the tray) when the user signs in to the computer. */
  openAtLogin: z.boolean(),
});

export const AppSettings = z.object({
  bubble: DesktopBubbleSettings,
  recording: RecordingSettings,
  appearance: AppearanceSettings,
  updates: UpdateSettings,
  system: SystemSettings,
});

export const AppSettingsPatch = z.object({
  bubble: DesktopBubbleSettings.partial().optional(),
  recording: RecordingSettings.partial().optional(),
  appearance: AppearanceSettings.partial().optional(),
  updates: UpdateSettings.partial().optional(),
  system: SystemSettings.partial().optional(),
});

// ---------------------------------------------------------------------------
// Recording session
// ---------------------------------------------------------------------------

export const SessionStatus = z.enum([
  "idle",
  "preparing",
  "countdown",
  "recording",
  "paused",
  "saving",
]);

export const FilePath = z.string().min(1).max(4096);

export const RecordingResult = z.object({
  path: FilePath,
  durationMs: z.number().nonnegative(),
  sizeBytes: z.number().int().nonnegative(),
});

export const SessionSnapshot = z.object({
  status: SessionStatus,
  mode: RecordingMode,
  /** Recorded time before the current segment (pauses excluded). */
  accumulatedMs: z.number().nonnegative(),
  /** Epoch milliseconds when the current segment started; null unless recording. */
  segmentStartedAt: z.number().nullable(),
  microphone: z.enum(["on", "muted", "unavailable"]),
  lastResult: RecordingResult.nullable(),
  error: z.string().max(2000).nullable(),
});

export const SessionCommand = z.enum([
  "start",
  "stop",
  "pause",
  "resume",
  "togglePause",
  "restart",
  "discard",
  "toggleMicrophone",
  "toggleCamera",
]);

/** Auto-update lifecycle, as shown in the UI. */
export const UpdateState = z.object({
  status: z.enum([
    "disabled",
    "idle",
    "checking",
    /** A newer version exists; it downloads right away (manual or automatic check). */
    "available",
    "downloading",
    "downloaded",
    "up-to-date",
    "error",
  ]),
  currentVersion: z.string(),
  availableVersion: z.string().nullable(),
  /** Download progress, 0–100. */
  progress: z.number().min(0).max(100).nullable(),
  /** Epoch milliseconds of the last completed check. */
  lastCheckedAt: z.number().nullable(),
  /** Why updates are disabled, or the last error. */
  message: z.string().max(500).nullable(),
});

export const CountdownConfig = z.object({
  seconds: z.number().int().min(1).max(10),
  sound: z.boolean(),
});

export const CountdownResult = z.enum(["completed", "skipped", "cancelled"]);

// ---------------------------------------------------------------------------
// Files and windows
// ---------------------------------------------------------------------------

export const RecordingExtension = z.enum(["mp4", "webm"]);

export const RecordingId = z.uuid();

export const RecordingChunk = z.custom<ArrayBuffer | ArrayBufferView>(
  (value) => value instanceof ArrayBuffer || ArrayBuffer.isView(value),
  { message: "Expected binary chunk" },
);

export const ScreenCoordinate = z.number().int().min(-100_000).max(100_000);

export const PanelHeight = z.number().int().min(40).max(1200);

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type BubbleSizePreset = z.infer<typeof BubbleSizePreset>;
export type DesktopBubbleSettings = z.infer<typeof DesktopBubbleSettings>;
export type RecordingMode = z.infer<typeof RecordingMode>;
export type CountdownSeconds = z.infer<typeof CountdownSeconds>;
export type RecordingSettings = z.infer<typeof RecordingSettings>;
export type ThemePreference = z.infer<typeof ThemePreference>;
export type UpdateChannel = z.infer<typeof UpdateChannel>;
export type UpdateSettings = z.infer<typeof UpdateSettings>;
export type UpdateState = z.infer<typeof UpdateState>;
export type AppSettings = z.infer<typeof AppSettings>;
export type AppSettingsPatch = z.infer<typeof AppSettingsPatch>;
export type SessionStatus = z.infer<typeof SessionStatus>;
export type RecordingResult = z.infer<typeof RecordingResult>;
export type SessionSnapshot = z.infer<typeof SessionSnapshot>;
export type SessionCommand = z.infer<typeof SessionCommand>;
export type CountdownConfig = z.infer<typeof CountdownConfig>;
export type CountdownResult = z.infer<typeof CountdownResult>;
export type RecordingExtension = z.infer<typeof RecordingExtension>;
