import type { RecorderEvent, Transcript } from "@kadr/project-format";

export interface EditContextInput {
  transcript: Transcript;
  events: readonly RecorderEvent[];
  durationUs: number;
  /** A new transcript line starts after a pause at least this long. */
  lineBreakGapUs?: number;
}

/** Seconds with two decimals, the time unit used in prompts ("12.34"). */
export function formatSeconds(us: number): string {
  return (us / 1_000_000).toFixed(2);
}

/**
 * Builds the compact text context sent to the LLM: transcript lines with start/end times, plus a
 * summary of the events that matter for editing. Cursor moves and key activity are summarized away,
 * which keeps a 10-minute recording around 10–20k tokens.
 */
export function buildEditContext({
  transcript,
  events,
  durationUs,
  lineBreakGapUs = 700_000,
}: EditContextInput): string {
  const lines: string[] = [];
  let current: string[] = [];
  let lineStart = 0;
  let lineEnd = 0;

  const flush = () => {
    if (current.length === 0) return;
    lines.push(`[${formatSeconds(lineStart)}-${formatSeconds(lineEnd)}] ${current.join(" ")}`);
    current = [];
  };

  for (const word of transcript.words) {
    if (current.length > 0 && word.startUs - lineEnd >= lineBreakGapUs) flush();
    if (current.length === 0) lineStart = word.startUs;
    current.push(word.text);
    lineEnd = word.endUs;
  }
  flush();

  const eventLines = events.flatMap((event) => {
    const t = formatSeconds(event.t);
    switch (event.type) {
      case "cursor.click":
        return [
          `${t} click ${event.button} at (${event.position.x.toFixed(2)}, ${event.position.y.toFixed(2)})`,
        ];
      case "window.focus":
        return [`${t} focus ${event.app}${event.title ? ` — ${event.title}` : ""}`];
      case "marker":
        return [`${t} marker ${event.kind}${event.label ? `: ${event.label}` : ""}`];
      case "recording.pause":
        return [`${t} paused`];
      case "recording.resume":
        return [`${t} resumed`];
      default:
        return [];
    }
  });

  return [
    `Duration: ${formatSeconds(durationUs)}s. Language: ${transcript.language}.`,
    "",
    "## Transcript",
    ...lines,
    "",
    "## Events",
    ...(eventLines.length > 0 ? eventLines : ["(none)"]),
  ].join("\n");
}
