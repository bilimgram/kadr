import { CAMERA_BACKGROUND_MODES } from "@kadr/compositor/background";
import { BubbleShapeId, RecorderEvent, TimeRange, Transcript } from "@kadr/project-format";
import { z } from "zod";

/** Runtime validation for persisted settings and every IPC payload crossing into the main process. */

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

export const BubbleSizePreset = z.enum(["small", "medium", "large"]);

export const CameraBackgroundMode = z.enum(CAMERA_BACKGROUND_MODES);

/** What is shown behind the person in the camera bubble (see packages/compositor/src/background.ts). */
export const CameraBackgroundSettings = z.object({
  mode: CameraBackgroundMode,
  /** Blur strength, 0..1. */
  blur: z.number().min(0).max(1),
  /** Colour preset for the "color" mode; unknown ids fall back to the first preset. */
  presetId: z.string().min(1).max(40),
  /** Changes whenever a new custom image is saved (in the user data folder); null until then. */
  imageRevision: z.number().int().nonnegative().nullable(),
});

export const DesktopBubbleSettings = z.object({
  /** Camera bubble on/off (only shown in "screenAndCamera" and "camera" modes). */
  visible: z.boolean(),
  shape: BubbleShapeId,
  size: BubbleSizePreset,
  mirror: z.boolean(),
  /** Automatic light correction for dark webcam images. */
  touchUp: z.boolean(),
  background: CameraBackgroundSettings,
  cameraDeviceId: z.string().max(512).optional(),
});

export const RecordingMode = z.enum(["screenAndCamera", "screen", "camera"]);

export const CountdownSeconds = z.union([z.literal(0), z.literal(3), z.literal(5)]);

/** What part of the screen a screen recording captures. */
export const CaptureArea = z.enum(["fullScreen", "region"]);

export const RecordingSettings = z.object({
  mode: RecordingMode,
  countdownSeconds: CountdownSeconds,
  countdownSound: z.boolean(),
  microphoneEnabled: z.boolean(),
  microphoneDeviceId: z.string().max(512).optional(),
  /** System audio loopback (Windows only for now). */
  systemAudio: z.boolean(),
  captureArea: CaptureArea,
  /** Put each finished recording on the clipboard, ready to paste into a chat or a folder. */
  copyToClipboard: z.boolean(),
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

/** Language hint for transcribing spoken notes; "auto" lets the provider detect it. */
export const NotesLanguage = z.enum(["auto", "en", "uz", "ru"]);

export const NotesSettings = z.object({
  /**
   * Transcribe the microphone while recording to catch spoken notes ("add a note …"). Off by
   * default: it sends microphone audio to the user's own OpenAI account (ADR 0010).
   */
  listen: z.boolean(),
  language: NotesLanguage,
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
  notes: NotesSettings,
});

export const AppSettingsPatch = z.object({
  bubble: DesktopBubbleSettings.partial().optional(),
  recording: RecordingSettings.partial().optional(),
  appearance: AppearanceSettings.partial().optional(),
  updates: UpdateSettings.partial().optional(),
  system: SystemSettings.partial().optional(),
  notes: NotesSettings.partial().optional(),
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
  /** Whether the file is on the clipboard. */
  copied: z.boolean(),
});

/** Notes made during the current recording, for the toolbar. */
export const NotesStatus = z.object({
  count: z.number().int().nonnegative(),
  /** Whether spoken notes are being listened for ("error": the provider failed, see `message`). */
  listening: z.enum(["off", "on", "error"]),
  /** The latest note's text, once transcribed. */
  lastText: z.string().max(300).nullable(),
  message: z.string().max(300).nullable(),
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
  notes: NotesStatus,
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
  /** Mark this moment with a note (the note shortcut or toolbar button). */
  "addNote",
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

// ---------------------------------------------------------------------------
// Notes
// ---------------------------------------------------------------------------

/** Longest audio clip sent for transcription: 30 s of 16 kHz 16-bit mono WAV is ~1 MB. */
export const MAX_CLIP_BYTES = 2 * 1024 * 1024;

export const AudioClip = z
  .custom<ArrayBuffer | ArrayBufferView>(
    (value) => value instanceof ArrayBuffer || ArrayBuffer.isView(value),
    { message: "Expected binary audio" },
  )
  .refine((value) => value.byteLength > 44 && value.byteLength <= MAX_CLIP_BYTES, {
    message: "Audio clip is empty or too long",
  });

export const TranscriptionResult = z.object({
  text: z.string().max(10_000),
  /** Languages the provider detected, when it says. */
  languages: z.array(z.string().max(16)).max(8),
});

/** What the recording engine hands over at stop to be saved next to the video. */
export const NotesSidecar = z.object({
  /** Recorded spans on the recording clock (gaps are pauses). */
  segments: z.array(TimeRange).min(1).max(10_000),
  durationUs: z.number().int().nonnegative(),
  events: z.array(RecorderEvent).max(500_000),
  /** Utterances detected from microphone levels, for finding retakes. */
  speech: z.array(TimeRange).max(100_000),
  transcript: Transcript.nullable(),
});

export const AiProvider = z.enum(["openai"]);

/** An API key as pasted by the user (trimmed); validated loosely, the provider decides. */
export const ApiKey = z
  .string()
  .trim()
  .min(20)
  .max(512)
  .regex(/^[\x21-\x7e]+$/, "An API key has no spaces or special characters");

export const AiKeyStatus = z.object({
  provider: AiProvider,
  hasKey: z.boolean(),
  /** Last four characters, so the user can tell keys apart. */
  hint: z.string().max(8).nullable(),
  /** False when the OS can't encrypt it: the key is kept only until Kadr quits. */
  persistent: z.boolean(),
});

export const AiTestResult = z.object({
  ok: z.boolean(),
  message: z.string().max(500),
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

const ScreenLength = z.number().int().min(1).max(100_000);

export const ScreenRect = z.object({
  x: ScreenCoordinate,
  y: ScreenCoordinate,
  width: ScreenLength,
  height: ScreenLength,
});

/** An area on one display, in global DIPs (see src/shared/region.ts). */
export const Region = ScreenRect.extend({
  displayId: z.number().int(),
});

/** The area the user picked, with the bounds of its display, for cropping the capture. */
export const RegionSelection = z.object({
  displayId: z.number().int(),
  display: ScreenRect,
  area: ScreenRect,
});

/** What one region picker overlay needs to know about the display it covers. */
export const RegionContext = z.object({
  displayId: z.number().int(),
  /** The display's bounds in global DIPs; the overlay covers exactly this. */
  bounds: ScreenRect,
  /** Device pixels per DIP. */
  scaleFactor: z.number().positive(),
  /** Where to start: the last recorded region, when it is on this display. */
  selection: Region.nullable(),
});

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type BubbleSizePreset = z.infer<typeof BubbleSizePreset>;
export type CameraBackgroundMode = z.infer<typeof CameraBackgroundMode>;
export type CameraBackgroundSettings = z.infer<typeof CameraBackgroundSettings>;
export type DesktopBubbleSettings = z.infer<typeof DesktopBubbleSettings>;
export type RecordingMode = z.infer<typeof RecordingMode>;
export type CaptureArea = z.infer<typeof CaptureArea>;
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
export type NotesLanguage = z.infer<typeof NotesLanguage>;
export type NotesSettings = z.infer<typeof NotesSettings>;
export type NotesStatus = z.infer<typeof NotesStatus>;
export type TranscriptionResult = z.infer<typeof TranscriptionResult>;
export type NotesSidecar = z.infer<typeof NotesSidecar>;
export type AiProvider = z.infer<typeof AiProvider>;
export type AiKeyStatus = z.infer<typeof AiKeyStatus>;
export type AiTestResult = z.infer<typeof AiTestResult>;
export type CountdownConfig = z.infer<typeof CountdownConfig>;
export type CountdownResult = z.infer<typeof CountdownResult>;
export type RecordingExtension = z.infer<typeof RecordingExtension>;
export type ScreenRect = z.infer<typeof ScreenRect>;
export type Region = z.infer<typeof Region>;
export type RegionSelection = z.infer<typeof RegionSelection>;
export type RegionContext = z.infer<typeof RegionContext>;
