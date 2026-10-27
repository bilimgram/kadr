import { type RecorderEvent, stringifyEventsJsonl } from "@kadr/project-format";
import type { RecordingClock } from "./clock";

/** `Omit` that distributes over a union, so each event variant keeps its own fields. */
export type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;

export type UntimedEvent = DistributiveOmit<RecorderEvent, "t">;

/** Collects timestamped recorder events in memory and serializes them as `events.jsonl`. */
export class EventLog {
  private readonly items: RecorderEvent[] = [];

  constructor(private readonly clock: RecordingClock) {}

  record(event: UntimedEvent): RecorderEvent {
    const timed = { ...event, t: this.clock.nowUs() } as RecorderEvent;
    this.items.push(timed);
    return timed;
  }

  events(): readonly RecorderEvent[] {
    return this.items;
  }

  toJsonl(): string {
    return stringifyEventsJsonl(this.items);
  }
}
