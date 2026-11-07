import type { TimeRange } from "@kadr/project-format";
import { describe, expect, it } from "vitest";
import { encodeWav, levelDb, PcmBuffer, SpeechDetector } from "./audio";

const FRAME_US = 20_000;

/** Feeds a level timeline ([seconds, dB] steps) to a detector in 20 ms frames. */
function detect(steps: Array<[number, number]>, endSeconds: number): TimeRange[] {
  const detector = new SpeechDetector();
  const found: TimeRange[] = [];
  for (let t = FRAME_US; t <= endSeconds * 1e6; t += FRAME_US) {
    const step = [...steps].reverse().find(([from]) => t > from * 1e6);
    const ended = detector.push(t, step?.[1] ?? -100);
    if (ended) found.push(ended);
  }
  const last = detector.flush(endSeconds * 1e6);
  if (last) found.push(last);
  return found;
}

describe("levelDb", () => {
  it("measures RMS loudness in dBFS", () => {
    expect(levelDb(new Float32Array(160).fill(1))).toBeCloseTo(0);
    expect(levelDb(new Float32Array(160).fill(0.1))).toBeCloseTo(-20);
    expect(levelDb(new Float32Array(160))).toBe(-100);
    expect(levelDb(new Float32Array())).toBe(-100);
  });
});

describe("SpeechDetector", () => {
  it("finds utterances over a quiet room and ignores short clicks", () => {
    const utterances = detect(
      [
        [0, -60],
        [1, -25], // speech 1–3 s
        [3, -60],
        [4, -20], // a 60 ms click
        [4.06, -60],
        [5, -28], // speech 5–6.5 s
        [6.5, -60],
      ],
      9,
    );
    expect(utterances).toHaveLength(2);
    expect(utterances[0]?.startUs).toBeCloseTo(1_020_000, -5);
    expect(utterances[0]?.endUs).toBeCloseTo(3_000_000, -5);
    expect(utterances[1]?.startUs).toBeCloseTo(5_020_000, -5);
  });

  it("learns a noisy room instead of treating it as speech", () => {
    const utterances = detect(
      [
        [0, -42], // fan noise
        [3, -18], // speech 3–4 s
        [4, -42],
      ],
      6,
    );
    expect(utterances).toHaveLength(1);
    expect(utterances[0]?.startUs).toBeGreaterThan(2_900_000);
  });

  it("splits a monologue and ends an utterance on flush", () => {
    // 45 s of talking: words at -25 dB with 100 ms gaps between them, never a real pause.
    const steps: Array<[number, number]> = [[0, -60]];
    for (let t = 0.5; t < 45; t += 0.5) steps.push([t, -25], [t + 0.4, -55]);
    const utterances = detect(steps, 45);
    expect(utterances.length).toBeGreaterThanOrEqual(2);
    for (const utterance of utterances) {
      expect(utterance.endUs - utterance.startUs).toBeLessThanOrEqual(20_000_000 + FRAME_US);
    }
    expect(utterances.at(-1)?.endUs).toBeLessThanOrEqual(45_000_000);
  });
});

describe("PcmBuffer", () => {
  it("slices across chunks and forgets audio past its capacity", () => {
    const buffer = new PcmBuffer(1000, 2_000_000); // 1 kHz keeps the numbers readable
    for (let second = 0; second < 5; second++) {
      buffer.append(new Float32Array(1000).fill(second), second * 1_000_000);
    }
    const clip = buffer.slice(3_500_000, 4_500_000);
    expect(clip).toHaveLength(1000);
    expect(clip[0]).toBe(3);
    expect(clip[999]).toBe(4);
    // Seconds 0–1 are gone.
    expect(buffer.slice(0, 1_000_000)).toHaveLength(0);
    buffer.clear();
    expect(buffer.slice(0, 10_000_000)).toHaveLength(0);
  });
});

describe("encodeWav", () => {
  it("writes a 16-bit mono PCM header and clamps samples", () => {
    const wav = encodeWav(new Float32Array([0, 1, -1, 2]), 16_000);
    const view = new DataView(wav.buffer);
    expect(new TextDecoder().decode(wav.slice(0, 4))).toBe("RIFF");
    expect(new TextDecoder().decode(wav.slice(8, 12))).toBe("WAVE");
    expect(view.getUint32(24, true)).toBe(16_000);
    expect(view.getUint16(34, true)).toBe(16);
    expect(view.getUint32(40, true)).toBe(8);
    expect(view.getInt16(46, true)).toBe(0x7fff);
    expect(view.getInt16(48, true)).toBe(-0x8000);
    expect(view.getInt16(50, true)).toBe(0x7fff);
  });
});
