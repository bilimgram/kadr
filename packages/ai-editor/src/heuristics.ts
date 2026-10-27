import type { TimeRange, TranscriptWord } from "@kadr/project-format";

export interface SilenceOptions {
  /** Gaps between words longer than this become cut candidates. */
  minGapUs?: number;
  /** Silence kept on each side of a cut so speech doesn't sound clipped. */
  paddingUs?: number;
  /** Recording duration, to also catch silence before the first and after the last word. */
  durationUs?: number;
}

/** Finds long pauses between words. Deterministic and offline: no AI provider needed. */
export function detectSilences(
  words: readonly TranscriptWord[],
  { minGapUs = 1_500_000, paddingUs = 200_000, durationUs }: SilenceOptions = {},
): TimeRange[] {
  const boundaries: Array<[number, number]> = [];
  let previousEnd = 0;
  for (const word of words) {
    boundaries.push([previousEnd, word.startUs]);
    previousEnd = Math.max(previousEnd, word.endUs);
  }
  if (durationUs !== undefined) boundaries.push([previousEnd, durationUs]);

  return boundaries
    .filter(([start, end]) => end - start >= minGapUs)
    .map(([start, end]) => ({ startUs: start + paddingUs, endUs: end - paddingUs }))
    .filter((range) => range.endUs > range.startUs);
}

/** Single-word fillers per language. Multi-word fillers ("you know") are left to the LLM. */
export const DEFAULT_FILLERS: Readonly<Record<string, readonly string[]>> = {
  en: ["um", "umm", "uh", "uhh", "erm", "er", "ah", "hmm", "mm"],
  ru: ["э", "ээ", "эм", "ммм"],
  uz: ["ee", "eee", "hmm", "mmm"],
};

export interface FillerHit {
  range: TimeRange;
  word: string;
}

/** Finds filler words in a transcript, ignoring case and surrounding punctuation. */
export function detectFillerWords(
  words: readonly TranscriptWord[],
  fillers: readonly string[] = DEFAULT_FILLERS.en ?? [],
): FillerHit[] {
  const set = new Set(fillers.map((filler) => filler.toLowerCase()));
  return words
    .filter((word) => set.has(normalizeWord(word.text)) && word.endUs > word.startUs)
    .map((word) => ({ range: { startUs: word.startUs, endUs: word.endUs }, word: word.text }));
}

function normalizeWord(text: string): string {
  return text.toLowerCase().replace(/^[\p{P}\s]+|[\p{P}\s]+$/gu, "");
}
