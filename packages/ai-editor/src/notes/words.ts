import type { TimeRange, TranscriptWord } from "@kadr/project-format";

/**
 * Spreads a phrase over its time span word by word, weighted by length, for providers that only
 * time whole phrases (`Transcript.timing: "segment"`).
 */
export function spreadWords(text: string, range: TimeRange): TranscriptWord[] {
  const words = text.split(/\s+/).filter(Boolean);
  const total = words.reduce((sum, word) => sum + word.length + 1, 0);
  if (total === 0 || range.endUs <= range.startUs) return [];
  const span = range.endUs - range.startUs;
  let offset = 0;
  return words.map((word) => {
    const startUs = range.startUs + Math.round((offset / total) * span);
    offset += word.length + 1;
    const endUs = Math.max(startUs + 1, range.startUs + Math.round((offset / total) * span));
    return { text: word, startUs, endUs };
  });
}
