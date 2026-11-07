import { type NormalizedText, normalizeSpeech } from "./normalize";

export type NoteLanguage = "en" | "uz" | "ru";

/**
 * Spoken phrases that start a note, matched on normalized text (normalize.ts). They are deliberately
 * specific ("add a note", not "note") so ordinary narration rarely triggers one, and suffixes are
 * allowed where Uzbek and Russian inflect ("eslatma qo'shaman", "добавлю заметку").
 */
export const NOTE_TRIGGERS: Readonly<Record<NoteLanguage, readonly RegExp[]>> = {
  en: [
    /\badd(?:ing)? (?:a |an |another )?(?:quick )?note\b/,
    /\beditor'?s? note\b/,
    /\bnote (?:for|to) (?:the )?editor\b/,
    /\bkadr note\b/,
  ],
  // Matched after Cyrillic → Latin transliteration, so "эслатма қўш" works too.
  uz: [/(?:^| )(?:eslatma|izoh|zametka) (?:qo'sh|qoldir|yoz)\S*/, /(?:^| )kadr eslatma\S*/],
  ru: [
    /(?:^| )добав\S* (?:замет|помет)\S*/,
    /(?:^| )замет\S* для (?:монтаж|редактор)\S*/,
    /(?:^| )кадр замет\S*/,
  ],
};

export interface SpokenNote {
  language: NoteLanguage;
  /** Offset of the trigger phrase in the original text. */
  start: number;
  /** Offset where the note's own words begin. */
  textStart: number;
  /** The note: everything said after the trigger phrase. */
  text: string;
}

interface Match {
  language: NoteLanguage;
  start: number;
  end: number;
}

function firstMatch(normalized: NormalizedText, languages: readonly NoteLanguage[]): Match | null {
  let best: Match | null = null;
  for (const language of languages) {
    for (const pattern of NOTE_TRIGGERS[language]) {
      const match = pattern.exec(normalized.text);
      if (!match) continue;
      // Skip the leading space some patterns consume.
      const leading = match[0].startsWith(" ") ? 1 : 0;
      const startIndex = match.index + leading;
      const endIndex = match.index + match[0].length - 1;
      const start = normalized.sourceIndex[startIndex] ?? 0;
      const end = (normalized.sourceIndex[endIndex] ?? start) + 1;
      if (!best || start < best.start) best = { language, start, end };
    }
  }
  return best;
}

/**
 * Finds a spoken note in transcribed text: the first trigger phrase ("add a note", "eslatma
 * qo'sh", "добавь заметку") and the words after it. Null when there is no trigger.
 */
export function findSpokenNote(text: string): SpokenNote | null {
  const plain = firstMatch(normalizeSpeech(text), ["en", "ru"]);
  const latin = firstMatch(normalizeSpeech(text, { latin: true }), ["en", "uz"]);
  const match =
    plain && latin ? (latin.start < plain.start ? latin : plain) : (plain ?? latin ?? null);
  if (!match) return null;
  // Drop the punctuation people (or transcribers) put after the trigger: "add a note: …".
  const rest = text.slice(match.end);
  const skipped = rest.length - rest.replace(/^[\s:;,.!?—–-]+/, "").length;
  const textStart = match.end + skipped;
  return {
    language: match.language,
    start: match.start,
    textStart,
    text: text.slice(textStart).trim(),
  };
}
