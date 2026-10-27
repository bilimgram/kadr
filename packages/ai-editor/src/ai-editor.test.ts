import type { Transcript, TranscriptWord } from "@kadr/project-format";
import { describe, expect, it } from "vitest";
import { buildEditContext } from "./context";
import { estimateCostUsd, estimateTokens } from "./cost";
import { detectFillerWords, detectSilences } from "./heuristics";
import { heuristicEditPlan, validateEditPlan } from "./plan";

const s = (seconds: number) => Math.round(seconds * 1_000_000);
const word = (text: string, start: number, end: number): TranscriptWord => ({
  text,
  startUs: s(start),
  endUs: s(end),
});

const transcript: Transcript = {
  formatVersion: 1,
  language: "en",
  provider: "test",
  words: [
    word("Hi", 0.5, 0.8),
    word("team,", 0.8, 1.2),
    word("um,", 1.4, 1.7),
    word("today", 1.8, 2.2),
    word("I'll", 5.0, 5.3), // 2.8 s pause before this word
    word("demo", 5.3, 5.7),
    word("Kadr.", 5.7, 6.1),
  ],
};

describe("heuristics", () => {
  it("detects long silences with padding, including the tail", () => {
    expect(detectSilences(transcript.words, { durationUs: s(9) })).toEqual([
      { startUs: s(2.4), endUs: s(4.8) },
      { startUs: s(6.3), endUs: s(8.8) },
    ]);
  });

  it("detects filler words regardless of case and punctuation", () => {
    expect(detectFillerWords(transcript.words)).toEqual([
      { range: { startUs: s(1.4), endUs: s(1.7) }, word: "um," },
    ]);
  });

  it("builds a valid heuristic edit plan without any AI provider", () => {
    const plan = heuristicEditPlan({
      transcript,
      durationUs: s(9),
      now: () => new Date("2026-10-27T10:00:00Z"),
    });
    expect(plan.source.kind).toBe("heuristic");
    expect(plan.operations.map((op) => op.type)).toEqual(["cut", "cut", "cut"]);
    expect(validateEditPlan(plan, s(9)).ok).toBe(true);
  });
});

describe("buildEditContext", () => {
  it("groups words into timed lines and summarizes events", () => {
    const context = buildEditContext({
      transcript,
      durationUs: s(9),
      events: [
        { t: s(5.5), type: "cursor.click", position: { x: 0.25, y: 0.5 }, button: "left" },
        { t: s(6), type: "cursor.move", position: { x: 0.3, y: 0.5 } },
        { t: s(7), type: "marker", kind: "mistake" },
      ],
    });
    expect(context).toContain("[0.50-2.20] Hi team, um, today");
    expect(context).toContain("[5.00-6.10] I'll demo Kadr.");
    expect(context).toContain("5.50 click left at (0.25, 0.50)");
    expect(context).toContain("7.00 marker mistake");
    expect(context).not.toContain("cursor.move");
  });
});

describe("validateEditPlan", () => {
  const base = {
    formatVersion: 1,
    id: "plan",
    createdAt: "2026-10-27T10:00:00.000Z",
    source: { kind: "ai" },
  };

  it("rejects overlapping cuts and ranges past the end", () => {
    const result = validateEditPlan(
      {
        ...base,
        operations: [
          { id: "a", type: "cut", range: { startUs: 0, endUs: 2_000_000 } },
          { id: "b", type: "cut", range: { startUs: 1_000_000, endUs: 3_000_000 } },
          { id: "c", type: "chapter", atUs: 99_000_000, title: "Late" },
        ],
      },
      10_000_000,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues).toHaveLength(2);
      expect(result.issues.join(" ")).toContain("overlaps");
    }
  });

  it("reports schema errors with their path", () => {
    const result = validateEditPlan({ ...base, operations: [{ id: "x", type: "explode" }] }, 1);
    expect(result.ok).toBe(false);
  });
});

describe("cost", () => {
  it("estimates tokens and dollars, pricing cache reads separately", () => {
    expect(estimateTokens("abcdefgh")).toBe(2);
    const usd = estimateCostUsd(
      { inputTokens: 15_000, outputTokens: 5_000, cacheReadTokens: 5_000 },
      { inputPerMTok: 4, outputPerMTok: 20, cacheReadPerMTok: 0.4 },
    );
    expect(usd).toBeCloseTo(0.04 + 0.002 + 0.1);
  });
});
