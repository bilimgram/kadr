import { z } from "zod";

/** Current major version of the recording bundle format. */
export const FORMAT_VERSION = 1;

/** File extension of a zipped bundle; an unzipped bundle is a folder with the same suffix. */
export const BUNDLE_EXTENSION = ".kadr";

/** Paths inside a bundle, relative to its root. */
export const BUNDLE_LAYOUT = {
  manifest: "manifest.json",
  tracksDir: "tracks",
  composite: "composite.mp4",
  events: "events.jsonl",
  transcript: "transcript.json",
  editsDir: "edits",
  thumbsDir: "thumbs",
} as const;

/** Integer microseconds since recording start, on the recording's monotonic clock. */
export const Micros = z.number().int().nonnegative();

/** A point normalized to the captured surface: (0, 0) is top-left, (1, 1) is bottom-right. */
export const NormalizedPoint = z.object({
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
});

export const NormalizedRect = z.object({
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
  width: z.number().positive().max(1),
  height: z.number().positive().max(1),
});

export const TimeRange = z
  .object({ startUs: Micros, endUs: Micros })
  .refine((r) => r.endUs > r.startUs, { message: "endUs must be greater than startUs" });

// ---------------------------------------------------------------------------
// Manifest
// ---------------------------------------------------------------------------

export const TrackKind = z.enum(["screen", "camera", "microphone", "systemAudio"]);

export const Track = z.object({
  id: z.string().min(1),
  kind: TrackKind,
  /** Path relative to the bundle root, e.g. "tracks/screen-0.mp4". */
  file: z.string().min(1),
  container: z.enum(["mp4", "webm", "m4a"]),
  codec: z.string().min(1),
  /** Offset of the track's first sample from recording start. */
  startOffsetUs: Micros.default(0),
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
  frameRate: z.number().positive().optional(),
  sampleRate: z.number().int().positive().optional(),
  channels: z.number().int().positive().optional(),
  deviceLabel: z.string().optional(),
});

export const Manifest = z.object({
  formatVersion: z.literal(FORMAT_VERSION),
  id: z.uuid(),
  title: z.string().optional(),
  createdAt: z.iso.datetime(),
  app: z.object({
    name: z.string(),
    version: z.string(),
    platform: z.enum(["win32", "darwin", "linux", "web"]),
  }),
  durationUs: Micros,
  clock: z.object({ kind: z.literal("monotonic"), unit: z.literal("us") }),
  tracks: z.array(Track),
  /** Recorded spans; gaps between segments are pauses. */
  segments: z.array(TimeRange).min(1),
  composite: z.object({ file: z.string().min(1) }).optional(),
});

// ---------------------------------------------------------------------------
// Bubble layout (shared by events and edit plans)
// ---------------------------------------------------------------------------

export const BubbleShapeId = z.enum([
  "circle",
  "squircle",
  "roundedSquare",
  "hexagon",
  "heart",
  "blob",
  "card",
  "portrait",
]);

export const BubbleLayout = z.object({
  visible: z.boolean(),
  shape: BubbleShapeId,
  /** Center of the bubble, normalized to the output frame. */
  center: NormalizedPoint,
  /** Bubble height as a fraction of the output frame height. */
  size: z.number().min(0.05).max(1),
  mirror: z.boolean(),
  border: z.object({ width: z.number().nonnegative(), color: z.string() }).optional(),
});

// ---------------------------------------------------------------------------
// Event log (events.jsonl)
// ---------------------------------------------------------------------------

const at = { t: Micros };

export const RecorderEvent = z.discriminatedUnion("type", [
  z.object({ ...at, type: z.literal("cursor.move"), position: NormalizedPoint }),
  z.object({
    ...at,
    type: z.literal("cursor.click"),
    position: NormalizedPoint,
    button: z.enum(["left", "right", "middle"]),
  }),
  /** Keyboard activity as a count per bucket. Key contents are never recorded. */
  z.object({
    ...at,
    type: z.literal("key.activity"),
    count: z.number().int().positive(),
    bucketUs: Micros,
  }),
  z.object({
    ...at,
    type: z.literal("window.focus"),
    app: z.string(),
    /** Only present when the user opted in to recording window titles. */
    title: z.string().optional(),
    bounds: NormalizedRect.optional(),
  }),
  z.object({ ...at, type: z.literal("bubble.layout"), layout: BubbleLayout }),
  z.object({
    ...at,
    type: z.literal("marker"),
    kind: z.enum(["mistake", "highlight", "chapter"]),
    label: z.string().optional(),
  }),
  z.object({ ...at, type: z.literal("recording.pause") }),
  z.object({ ...at, type: z.literal("recording.resume") }),
]);

// ---------------------------------------------------------------------------
// Transcript
// ---------------------------------------------------------------------------

export const TranscriptWord = z.object({
  text: z.string(),
  startUs: Micros,
  endUs: Micros,
  confidence: z.number().min(0).max(1).optional(),
  speaker: z.string().optional(),
});

export const Transcript = z.object({
  formatVersion: z.literal(FORMAT_VERSION),
  /** BCP 47 language tag, e.g. "en", "uz", "ru". */
  language: z.string().min(2),
  provider: z.string(),
  model: z.string().optional(),
  words: z.array(TranscriptWord),
});

// ---------------------------------------------------------------------------
// Edit plans (edits/<id>.json)
// ---------------------------------------------------------------------------

const operationBase = {
  id: z.string().min(1),
  /** Review state; AI proposals start as "proposed". */
  status: z.enum(["proposed", "accepted", "rejected"]).default("proposed"),
  reason: z.string().optional(),
  confidence: z.number().min(0).max(1).optional(),
};

export const EditOperation = z.discriminatedUnion("type", [
  z.object({ ...operationBase, type: z.literal("cut"), range: TimeRange }),
  z.object({
    ...operationBase,
    type: z.literal("speed"),
    range: TimeRange,
    rate: z.number().min(0.25).max(16),
  }),
  z.object({
    ...operationBase,
    type: z.literal("zoom"),
    range: TimeRange,
    rect: NormalizedRect,
    easing: z.enum(["linear", "easeInOut"]).default("easeInOut"),
  }),
  z.object({
    ...operationBase,
    type: z.literal("bubbleLayout"),
    range: TimeRange,
    layout: BubbleLayout,
  }),
  z.object({ ...operationBase, type: z.literal("blur"), range: TimeRange, rect: NormalizedRect }),
  z.object({
    ...operationBase,
    type: z.literal("chapter"),
    atUs: Micros,
    title: z.string().min(1),
  }),
]);

export const EditPlan = z.object({
  formatVersion: z.literal(FORMAT_VERSION),
  id: z.string().min(1),
  createdAt: z.iso.datetime(),
  source: z.object({
    kind: z.enum(["ai", "heuristic", "user"]),
    provider: z.string().optional(),
    model: z.string().optional(),
    promptVersion: z.string().optional(),
  }),
  title: z.string().optional(),
  summary: z.string().optional(),
  operations: z.array(EditOperation),
});

// ---------------------------------------------------------------------------
// Inferred types
// ---------------------------------------------------------------------------

export type Micros = z.infer<typeof Micros>;
export type NormalizedPoint = z.infer<typeof NormalizedPoint>;
export type NormalizedRect = z.infer<typeof NormalizedRect>;
export type TimeRange = z.infer<typeof TimeRange>;
export type TrackKind = z.infer<typeof TrackKind>;
export type Track = z.infer<typeof Track>;
export type Manifest = z.infer<typeof Manifest>;
export type BubbleShapeId = z.infer<typeof BubbleShapeId>;
export type BubbleLayout = z.infer<typeof BubbleLayout>;
export type RecorderEvent = z.infer<typeof RecorderEvent>;
export type TranscriptWord = z.infer<typeof TranscriptWord>;
export type Transcript = z.infer<typeof Transcript>;
export type EditOperation = z.infer<typeof EditOperation>;
export type EditPlan = z.infer<typeof EditPlan>;
