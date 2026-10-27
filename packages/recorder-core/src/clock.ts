import type { TimeRange } from "@kadr/project-format";

/**
 * The single monotonic clock of a recording. Time keeps running through pauses (events during a
 * pause still get a timestamp); recorded spans are tracked as segments, and `toMediaTimeUs` maps a
 * clock timestamp onto the paused-gaps-removed media timeline.
 */
export class RecordingClock {
  private startMs: number | null = null;
  private openSegmentStartUs: number | null = null;
  private readonly closedSegments: TimeRange[] = [];

  constructor(private readonly now: () => number = () => performance.now()) {}

  get running(): boolean {
    return this.openSegmentStartUs !== null;
  }

  start(): void {
    if (this.startMs !== null) throw new Error("Clock already started");
    this.startMs = this.now();
    this.openSegmentStartUs = 0;
  }

  /** Microseconds since `start()`, including paused time. */
  nowUs(): number {
    if (this.startMs === null) throw new Error("Clock not started");
    return Math.round((this.now() - this.startMs) * 1000);
  }

  pause(): void {
    if (this.openSegmentStartUs === null) return;
    const endUs = this.nowUs();
    if (endUs > this.openSegmentStartUs) {
      this.closedSegments.push({ startUs: this.openSegmentStartUs, endUs });
    }
    this.openSegmentStartUs = null;
  }

  resume(): void {
    if (this.startMs === null) throw new Error("Clock not started");
    if (this.openSegmentStartUs === null) this.openSegmentStartUs = this.nowUs();
  }

  /** Recorded spans so far, including the open one (ending now). */
  segments(): TimeRange[] {
    const segments = [...this.closedSegments];
    if (this.openSegmentStartUs !== null) {
      const endUs = this.nowUs();
      if (endUs > this.openSegmentStartUs)
        segments.push({ startUs: this.openSegmentStartUs, endUs });
    }
    return segments;
  }

  /** Maps a clock timestamp to media time (pauses removed). Times inside a pause snap to its start. */
  toMediaTimeUs(tUs: number): number {
    let mediaUs = 0;
    for (const segment of this.segments()) {
      if (tUs <= segment.startUs) break;
      mediaUs += Math.min(tUs, segment.endUs) - segment.startUs;
    }
    return mediaUs;
  }
}
