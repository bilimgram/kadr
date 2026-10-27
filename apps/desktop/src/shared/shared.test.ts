import { describe, expect, it } from "vitest";
import { elapsedMs, IDLE_SNAPSHOT } from "./session";
import { DEFAULT_SETTINGS, isBubbleShown, mergeSettings, parseStoredSettings } from "./settings";

describe("elapsedMs", () => {
  it("adds the running segment only while recording", () => {
    const recording = {
      ...IDLE_SNAPSHOT,
      status: "recording" as const,
      accumulatedMs: 5_000,
      segmentStartedAt: 1_000,
    };
    expect(elapsedMs(recording, 3_500)).toBe(7_500);
    expect(elapsedMs({ ...recording, status: "paused", segmentStartedAt: null }, 9_999)).toBe(
      5_000,
    );
    // Clock skew between processes must never produce negative time.
    expect(elapsedMs(recording, 500)).toBe(5_000);
  });
});

describe("settings", () => {
  it("merges partial updates and validates them", () => {
    const next = mergeSettings(DEFAULT_SETTINGS, { recording: { countdownSeconds: 5 } });
    expect(next.recording.countdownSeconds).toBe(5);
    expect(next.bubble).toEqual(DEFAULT_SETTINGS.bubble);
    expect(() =>
      mergeSettings(DEFAULT_SETTINGS, { recording: { countdownSeconds: 4 as 3 } }),
    ).toThrow();
  });

  it("recovers from missing, corrupted, or partially invalid files", () => {
    expect(parseStoredSettings(null)).toEqual(DEFAULT_SETTINGS);
    expect(parseStoredSettings("garbage")).toEqual(DEFAULT_SETTINGS);
    const partial = parseStoredSettings({
      bubble: { shape: "hexagon" },
      recording: { countdownSeconds: 42 },
    });
    expect(partial.bubble.shape).toBe("hexagon");
    expect(partial.recording).toEqual(DEFAULT_SETTINGS.recording);
  });

  it("hides the bubble in screen-only mode", () => {
    expect(isBubbleShown(DEFAULT_SETTINGS)).toBe(true);
    expect(isBubbleShown(mergeSettings(DEFAULT_SETTINGS, { recording: { mode: "screen" } }))).toBe(
      false,
    );
  });
});
