import type { TimeRange } from "@kadr/project-format";

/** Loudness of a block of samples in dBFS (−100 for silence). */
export function levelDb(samples: Float32Array): number {
  if (samples.length === 0) return -100;
  let sum = 0;
  for (const sample of samples) sum += sample * sample;
  const rms = Math.sqrt(sum / samples.length);
  return rms > 1e-5 ? Math.max(-100, 20 * Math.log10(rms)) : -100;
}

export interface SpeechDetectorOptions {
  /** Speech is this much louder than the noise floor. */
  thresholdDb?: number;
  /** Sound must last this long to start an utterance (ignores clicks and taps). */
  minSpeechUs?: number;
  /** An utterance ends after this much quiet. */
  hangoverUs?: number;
  /** Long monologues are split into utterances of at most this length. */
  maxUtteranceUs?: number;
}

/**
 * Splits microphone levels into utterances: no AI, just an adaptive noise floor (it follows a quiet
 * room down quickly and a noisy one up slowly) and hysteresis. Feed it one level per block, in
 * order; it returns each utterance when it ends.
 */
export class SpeechDetector {
  private floorDb: number | null = null;
  private candidateStartUs: number | null = null;
  private startUs: number | null = null;
  private lastVoicedUs = 0;
  private readonly thresholdDb: number;
  private readonly minSpeechUs: number;
  private readonly hangoverUs: number;
  private readonly maxUtteranceUs: number;

  constructor({
    thresholdDb = 10,
    minSpeechUs = 150_000,
    hangoverUs = 600_000,
    maxUtteranceUs = 20_000_000,
  }: SpeechDetectorOptions = {}) {
    this.thresholdDb = thresholdDb;
    this.minSpeechUs = minSpeechUs;
    this.hangoverUs = hangoverUs;
    this.maxUtteranceUs = maxUtteranceUs;
  }

  /** Whether an utterance is in progress, and since when. */
  get currentStartUs(): number | null {
    return this.startUs;
  }

  /** The level of one block that ends at `tUs`; returns an utterance that just ended, if any. */
  push(tUs: number, db: number): TimeRange | null {
    // The first block seeds the floor; it adapts from there.
    const floor = this.floorDb ?? Math.max(db, -90);
    const voiced = db > floor + this.thresholdDb;
    // Fast down, slow up: a pause in speech lowers the floor, speech barely raises it. Between
    // utterances it rises faster, so a noisy room is learned in about a second.
    const rise = this.startUs === null ? 0.01 : 0.002;
    const next =
      db < floor ? floor + (db - floor) * 0.2 : floor + (Math.min(db, -20) - floor) * rise;
    this.floorDb = Math.max(next, -90);

    if (this.startUs === null) {
      if (!voiced) {
        this.candidateStartUs = null;
        return null;
      }
      this.candidateStartUs ??= tUs;
      if (tUs - this.candidateStartUs >= this.minSpeechUs) {
        this.startUs = this.candidateStartUs;
        this.lastVoicedUs = tUs;
      }
      return null;
    }

    if (voiced) this.lastVoicedUs = tUs;
    if (tUs - this.lastVoicedUs >= this.hangoverUs) {
      return this.end(this.lastVoicedUs);
    }
    if (tUs - this.startUs >= this.maxUtteranceUs) {
      const ended = this.end(tUs);
      // Still talking: the next utterance starts right away.
      this.startUs = tUs;
      this.lastVoicedUs = tUs;
      return ended;
    }
    return null;
  }

  /** Ends an utterance in progress (recording stopped or paused). */
  flush(tUs: number): TimeRange | null {
    if (this.startUs === null) return null;
    return this.end(
      Math.max(this.lastVoicedUs, Math.min(tUs, this.lastVoicedUs + this.hangoverUs)),
    );
  }

  private end(endUs: number): TimeRange | null {
    const startUs = this.startUs;
    this.startUs = null;
    this.candidateStartUs = null;
    return startUs !== null && endUs > startUs ? { startUs, endUs } : null;
  }
}

interface PcmChunk {
  startUs: number;
  samples: Float32Array;
}

/** The last few seconds of mono audio with their timestamps, to cut clips out of. */
export class PcmBuffer {
  private chunks: PcmChunk[] = [];

  constructor(
    readonly sampleRate: number,
    private readonly capacityUs = 30_000_000,
  ) {}

  /** Adds samples whose first one plays at `startUs`; drops audio older than the capacity. */
  append(samples: Float32Array, startUs: number): void {
    this.chunks.push({ startUs, samples });
    const endUs = startUs + this.durationUs(samples.length);
    while (this.chunks.length > 1) {
      const first = this.chunks[0];
      if (
        !first ||
        first.startUs + this.durationUs(first.samples.length) >= endUs - this.capacityUs
      )
        break;
      this.chunks.shift();
    }
  }

  /** The samples between two times (as much as is still buffered). */
  slice(startUs: number, endUs: number): Float32Array {
    const parts: Float32Array[] = [];
    let length = 0;
    for (const chunk of this.chunks) {
      const chunkEnd = chunk.startUs + this.durationUs(chunk.samples.length);
      if (chunkEnd <= startUs || chunk.startUs >= endUs) continue;
      const from = Math.max(0, Math.round(((startUs - chunk.startUs) * this.sampleRate) / 1e6));
      const to = Math.min(
        chunk.samples.length,
        Math.round(((endUs - chunk.startUs) * this.sampleRate) / 1e6),
      );
      if (to > from) {
        parts.push(chunk.samples.subarray(from, to));
        length += to - from;
      }
    }
    const out = new Float32Array(length);
    let offset = 0;
    for (const part of parts) {
      out.set(part, offset);
      offset += part.length;
    }
    return out;
  }

  clear(): void {
    this.chunks = [];
  }

  private durationUs(samples: number): number {
    return (samples / this.sampleRate) * 1e6;
  }
}

/** Encodes mono samples (−1..1) as a 16-bit PCM WAV file. */
export function encodeWav(samples: Float32Array, sampleRate: number): Uint8Array {
  const bytes = new Uint8Array(44 + samples.length * 2);
  const view = new DataView(bytes.buffer);
  const ascii = (offset: number, text: string) => {
    for (let i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i));
  };
  ascii(0, "RIFF");
  view.setUint32(4, 36 + samples.length * 2, true);
  ascii(8, "WAVE");
  ascii(12, "fmt ");
  view.setUint32(16, 16, true); // fmt chunk size
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true); // byte rate
  view.setUint16(32, 2, true); // block align
  view.setUint16(34, 16, true); // bits per sample
  ascii(36, "data");
  view.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i++) {
    const clamped = Math.max(-1, Math.min(1, samples[i] ?? 0));
    view.setInt16(44 + i * 2, clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff, true);
  }
  return bytes;
}
