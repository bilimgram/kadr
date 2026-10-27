import { parseEventsJsonl } from "@kadr/project-format";
import { describe, expect, it } from "vitest";
import { RecordingClock } from "./clock";
import { EventLog } from "./event-log";
import { extensionForMimeType, pickMimeType } from "./mime";

function fakeTime(startMs = 1000) {
  let nowMs = startMs;
  return {
    now: () => nowMs,
    advance: (ms: number) => {
      nowMs += ms;
    },
  };
}

describe("RecordingClock", () => {
  it("tracks segments across pauses and maps to media time", () => {
    const time = fakeTime();
    const clock = new RecordingClock(time.now);
    clock.start();
    time.advance(2000);
    clock.pause();
    time.advance(5000);
    clock.resume();
    time.advance(1000);

    expect(clock.nowUs()).toBe(8_000_000);
    expect(clock.segments()).toEqual([
      { startUs: 0, endUs: 2_000_000 },
      { startUs: 7_000_000, endUs: 8_000_000 },
    ]);
    expect(clock.toMediaTimeUs(1_000_000)).toBe(1_000_000);
    expect(clock.toMediaTimeUs(4_000_000)).toBe(2_000_000); // inside the pause
    expect(clock.toMediaTimeUs(7_500_000)).toBe(2_500_000);
  });

  it("refuses to start twice", () => {
    const clock = new RecordingClock(fakeTime().now);
    clock.start();
    expect(() => clock.start()).toThrow();
  });
});

describe("EventLog", () => {
  it("timestamps events and serializes valid JSONL", () => {
    const time = fakeTime();
    const clock = new RecordingClock(time.now);
    clock.start();
    const log = new EventLog(clock);

    time.advance(250);
    log.record({ type: "marker", kind: "mistake" });
    time.advance(250);
    log.record({ type: "cursor.click", position: { x: 0.1, y: 0.2 }, button: "left" });

    const parsed = parseEventsJsonl(log.toJsonl());
    expect(parsed.issues).toEqual([]);
    expect(parsed.events.map((event) => event.t)).toEqual([250_000, 500_000]);
  });
});

describe("pickMimeType", () => {
  it("prefers MP4 and falls back to WebM", () => {
    expect(pickMimeType(() => true)).toBe("video/mp4;codecs=avc1,mp4a.40.2");
    expect(pickMimeType((type) => type.startsWith("video/webm"))).toBe(
      "video/webm;codecs=vp9,opus",
    );
    expect(() => pickMimeType(() => false)).toThrow();
  });

  it("maps MIME types to file extensions", () => {
    expect(extensionForMimeType("video/mp4;codecs=avc1")).toBe("mp4");
    expect(extensionForMimeType("video/webm;codecs=vp9")).toBe("webm");
  });
});
