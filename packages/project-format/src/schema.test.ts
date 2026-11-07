import { describe, expect, it } from "vitest";
import { parseEventsJsonl, stringifyEventsJsonl } from "./events";
import { toJsonSchemas } from "./json-schema";
import {
  EditPlan,
  Manifest,
  type RecorderEvent,
  RecorderEvent as RecorderEventSchema,
  Transcript,
} from "./schema";

const manifest = {
  formatVersion: 1,
  id: "6f1c0a52-8a8e-4a63-9a43-6b1df1f1b0a1",
  createdAt: "2026-10-27T10:00:00.000Z",
  app: { name: "kadr-desktop", version: "0.0.0", platform: "win32" },
  durationUs: 61_000_000,
  clock: { kind: "monotonic", unit: "us" },
  tracks: [
    {
      id: "screen-0",
      kind: "screen",
      file: "tracks/screen-0.mp4",
      container: "mp4",
      codec: "avc1.640028",
      width: 1920,
      height: 1080,
      frameRate: 30,
    },
  ],
  segments: [{ startUs: 0, endUs: 61_000_000 }],
};

describe("Manifest", () => {
  it("accepts a valid manifest and applies defaults", () => {
    const parsed = Manifest.parse(manifest);
    expect(parsed.tracks[0]?.startOffsetUs).toBe(0);
  });

  it("rejects unknown format versions", () => {
    expect(Manifest.safeParse({ ...manifest, formatVersion: 2 }).success).toBe(false);
  });

  it("can point at a single-file recording next to the bundle", () => {
    const parsed = Manifest.parse({ ...manifest, tracks: [], media: { file: "Kadr 1.mp4" } });
    expect(parsed.media?.file).toBe("Kadr 1.mp4");
    expect(Manifest.safeParse({ ...manifest, media: { file: "" } }).success).toBe(false);
  });

  it("rejects empty or inverted segments", () => {
    expect(Manifest.safeParse({ ...manifest, segments: [] }).success).toBe(false);
    expect(Manifest.safeParse({ ...manifest, segments: [{ startUs: 10, endUs: 5 }] }).success).toBe(
      false,
    );
  });
});

describe("events.jsonl", () => {
  const events: RecorderEvent[] = [
    { t: 0, type: "recording.resume" },
    { t: 1_000, type: "cursor.move", position: { x: 0.5, y: 0.25 } },
    { t: 2_000, type: "cursor.click", position: { x: 0.5, y: 0.25 }, button: "left" },
    { t: 3_000, type: "marker", kind: "mistake" },
    {
      t: 4_000_000,
      type: "note",
      id: "note-1",
      source: "voice",
      text: "cut the last few seconds, I'm saying it again",
      speech: { startUs: 4_000_000, endUs: 6_500_000 },
      position: { x: 0.25, y: 0.75 },
    },
    { t: 9_000_000, type: "note", id: "note-2", source: "shortcut" },
  ];

  it("round-trips events", () => {
    const parsed = parseEventsJsonl(stringifyEventsJsonl(events));
    expect(parsed.issues).toEqual([]);
    expect(parsed.events).toEqual(events);
  });

  it("keeps valid lines and reports broken ones", () => {
    const text = `${stringifyEventsJsonl(events.slice(0, 2))}{"t":5,"type":"nope"}\n{"t":6,"ty`;
    const parsed = parseEventsJsonl(text);
    expect(parsed.events).toHaveLength(2);
    expect(parsed.issues.map((issue) => issue.line)).toEqual([3, 4]);
  });
});

describe("note events", () => {
  it("require an id and a known source, and a forward speech range", () => {
    const note = { t: 1, type: "note", id: "n", source: "shortcut" };
    expect(RecorderEventSchema.safeParse(note).success).toBe(true);
    expect(RecorderEventSchema.safeParse({ ...note, id: "" }).success).toBe(false);
    expect(RecorderEventSchema.safeParse({ ...note, source: "telepathy" }).success).toBe(false);
    expect(
      RecorderEventSchema.safeParse({ ...note, speech: { startUs: 5, endUs: 2 } }).success,
    ).toBe(false);
  });
});

describe("Transcript", () => {
  it("records how precise word times are", () => {
    const transcript = { formatVersion: 1, language: "uz", provider: "openai", words: [] };
    expect(Transcript.parse(transcript).timing).toBeUndefined();
    expect(Transcript.parse({ ...transcript, timing: "segment" }).timing).toBe("segment");
    expect(Transcript.safeParse({ ...transcript, timing: "vibes" }).success).toBe(false);
  });
});

describe("EditPlan", () => {
  it("defaults operation status to proposed", () => {
    const plan = EditPlan.parse({
      formatVersion: 1,
      id: "plan-1",
      createdAt: "2026-10-27T10:00:00.000Z",
      source: { kind: "ai", provider: "anthropic", model: "claude-opus-5-5", promptVersion: "0.1" },
      operations: [
        { id: "op-1", type: "cut", range: { startUs: 1_000_000, endUs: 2_500_000 }, reason: "um" },
      ],
    });
    expect(plan.operations[0]?.status).toBe("proposed");
  });
});

describe("toJsonSchemas", () => {
  it("exports a JSON Schema for every public format", () => {
    const schemas = toJsonSchemas();
    expect(Object.keys(schemas)).toEqual(["manifest", "event", "transcript", "editPlan"]);
    expect(schemas.manifest).toHaveProperty("properties.tracks");
    expect(schemas.manifest).toHaveProperty("properties.media");
    expect(JSON.stringify(schemas.event)).toContain('"note"');
    expect(schemas.transcript).toHaveProperty("properties.timing");
  });
});
