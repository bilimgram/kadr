import { describe, expect, it } from "vitest";
import { normalizeToArea } from "./cursor";
import { baseName, buildNotesFiles, hasNotesContent } from "./notes-files";
import { NotesSidecar, SessionCommand } from "./schemas";
import { DEFAULT_SETTINGS, parseStoredSettings } from "./settings";

const s = (seconds: number) => Math.round(seconds * 1_000_000);

const sidecar: NotesSidecar = {
  segments: [
    { startUs: 0, endUs: s(20) },
    { startUs: s(30), endUs: s(60) },
  ],
  durationUs: s(60),
  events: [
    { t: 0, type: "recording.resume" },
    { t: s(5), type: "cursor.move", position: { x: 0.4, y: 0.5 } },
    {
      t: s(40),
      type: "note",
      id: "note-1",
      source: "voice",
      text: "cut the last 3 seconds",
      speech: { startUs: s(40), endUs: s(42) },
      position: { x: 0.4, y: 0.5 },
    },
  ],
  speech: [{ startUs: s(35), endUs: s(42) }],
  transcript: null,
};

const context = {
  videoFile: "Kadr 2026-11-07T10-00-00-000Z.mp4",
  id: "6f1c0a52-8a8e-4a63-9a43-6b1df1f1b0a1",
  createdAt: new Date("2026-11-07T10:00:00.000Z"),
  appVersion: "0.3.0",
  platform: "win32" as const,
};

describe("notes saved next to a recording", () => {
  it("builds a bundle and readable notes named after the video", () => {
    const files = buildNotesFiles(sidecar, context);
    expect(files.bundleName).toBe("Kadr 2026-11-07T10-00-00-000Z.kadr");
    expect(Object.keys(files.bundle).sort()).toEqual([
      "edits/notes.json",
      "events.jsonl",
      "manifest.json",
    ]);
    const manifest = JSON.parse(files.bundle["manifest.json"] ?? "{}");
    expect(manifest.media).toEqual({ file: context.videoFile });
    expect(manifest.segments).toHaveLength(2);
    expect(files.bundle["events.jsonl"]?.trim().split("\n")).toHaveLength(3);
    const plan = JSON.parse(files.bundle["edits/notes.json"] ?? "{}");
    // The note at 40 s (video 0:30) and the 3 s before it.
    expect(plan.operations).toMatchObject([{ range: { startUs: s(37), endUs: s(42) } }]);
    expect(files.markdown?.name).toBe("Kadr 2026-11-07T10-00-00-000Z notes.md");
    expect(files.markdown?.content).toContain(
      "| 1 | 0:30 | cut the last 3 seconds | 40% across, 50% down |",
    );
  });

  it("saves only when there are notes or a transcript", () => {
    const quiet = { ...sidecar, events: sidecar.events.slice(0, 2) };
    expect(hasNotesContent(quiet)).toBe(false);
    expect(hasNotesContent(sidecar)).toBe(true);
    const transcribed = {
      ...quiet,
      transcript: {
        formatVersion: 1 as const,
        language: "uz",
        provider: "openai",
        timing: "segment" as const,
        words: [{ text: "salom", startUs: 0, endUs: s(1) }],
      },
    };
    expect(hasNotesContent(transcribed)).toBe(true);
    const files = buildNotesFiles(transcribed, context);
    expect(files.bundle["transcript.json"]).toContain("salom");
    expect(files.markdown).toBeNull();
  });

  it("validates what the engine hands over", () => {
    expect(NotesSidecar.safeParse(sidecar).success).toBe(true);
    expect(NotesSidecar.safeParse({ ...sidecar, segments: [] }).success).toBe(false);
    expect(
      NotesSidecar.safeParse({
        ...sidecar,
        events: [{ t: 1, type: "note", id: "x", source: "mind" }],
      }).success,
    ).toBe(false);
    expect(baseName("Kadr 1.webm")).toBe("Kadr 1");
  });
});

describe("pointer position on the recorded area", () => {
  const area = { x: 100, y: 50, width: 800, height: 400 };

  it("maps screen points onto the area and ignores points outside it", () => {
    expect(normalizeToArea({ x: 100, y: 50 }, area)).toEqual({ x: 0, y: 0 });
    expect(normalizeToArea({ x: 500, y: 250 }, area)).toEqual({ x: 0.5, y: 0.5 });
    expect(normalizeToArea({ x: 900, y: 450 }, area)).toEqual({ x: 1, y: 1 });
    expect(normalizeToArea({ x: 99, y: 250 }, area)).toBeNull();
    expect(normalizeToArea({ x: 500, y: 451 }, area)).toBeNull();
    expect(normalizeToArea({ x: 0, y: 0 }, { ...area, width: 0 })).toBeNull();
  });
});

describe("notes settings", () => {
  it("default to the offline shortcut only, and survive older settings files", () => {
    expect(DEFAULT_SETTINGS.notes).toEqual({ listen: false, language: "auto" });
    expect(parseStoredSettings({ notes: { listen: true, language: "uz" } }).notes).toEqual({
      listen: true,
      language: "uz",
    });
    expect(parseStoredSettings({ notes: { language: "klingon" } }).notes).toEqual(
      DEFAULT_SETTINGS.notes,
    );
    expect(parseStoredSettings({}).notes).toEqual(DEFAULT_SETTINGS.notes);
  });

  it("adds a note command", () => {
    expect(SessionCommand.parse("addNote")).toBe("addNote");
  });
});
