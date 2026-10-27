import { RecorderEvent } from "./schema";

export interface JsonlIssue {
  /** 1-based line number in the source text. */
  line: number;
  message: string;
}

export interface ParsedEvents {
  events: RecorderEvent[];
  issues: JsonlIssue[];
}

/**
 * Parses an `events.jsonl` file. Invalid lines are reported, not thrown, so a partially corrupted log
 * (for example after a crash mid-write) still yields every valid event.
 */
export function parseEventsJsonl(text: string): ParsedEvents {
  const events: RecorderEvent[] = [];
  const issues: JsonlIssue[] = [];

  text.split(/\r?\n/).forEach((raw, index) => {
    const line = raw.trim();
    if (line === "") return;
    let json: unknown;
    try {
      json = JSON.parse(line);
    } catch {
      issues.push({ line: index + 1, message: "Invalid JSON" });
      return;
    }
    const result = RecorderEvent.safeParse(json);
    if (result.success) {
      events.push(result.data);
    } else {
      issues.push({ line: index + 1, message: result.error.issues[0]?.message ?? "Invalid event" });
    }
  });

  return { events, issues };
}

/** Serializes events to JSONL, one event per line, with a trailing newline. */
export function stringifyEventsJsonl(events: readonly RecorderEvent[]): string {
  return events.map((event) => `${JSON.stringify(event)}\n`).join("");
}
