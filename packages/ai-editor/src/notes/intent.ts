import { normalizeSpeech, parseSpokenNumber } from "./normalize";

/**
 * What a note asks for, as far as simple rules can tell. Anything else stays a free-form note for
 * a person or an AI editor to read.
 */
export type NoteIntent =
  /** "cut the last 5 seconds": remove that much right before the note. */
  | { kind: "cutLast"; seconds: number }
  /** "cut the last few seconds, I'm restating it": remove the attempt before the note. */
  | { kind: "retake" }
  | { kind: "note" };

/** Longest "cut the last N seconds" a note can ask for. */
export const MAX_CUT_LAST_SECONDS = 60;

// "the last N seconds" / "oxirgi N soniya" / "последние N секунд", N in words or digits.
const LAST_SECONDS = [
  /\blast (\S+)(?: (\S+))? (?:seconds?|secs?)\b/,
  /(?:^| )(?:oxirgi|so'nggi) (\S+)(?: (\S+))? (?:soniya|sekund)\S*/,
  /(?:^| )последн\S* (\S+)(?: (\S+))? секунд\S*/,
];

const CUT_VERBS = [
  /\b(?:cut|remove|delete|trim|drop|lose|get rid of)\b/,
  /(?:^| )(?:kes|qirq|o'chir|olib tashla|olib tashlang)\S*/,
  /(?:^| )(?:выреж|выреза|удал|убер|убра|отреж)\S*/,
];

const RETAKE = [
  /\b(?:restat\S*|re-?take|redo\S*|start over|starting over|try (?:it |that )?again|one more time|let me repeat|say (?:it|that|this) again|saying (?:it|that|this) again|said (?:it|that) wrong)\b/,
  /\b(?:cut|remove|delete) (?:this|that|it)\b/,
  /\blast (?:few|couple|several)\b/,
  /(?:^| )(?:qaytadan|boshqatdan|takrorla\S*|yana bir marta|qayta ayt\S*|qayta yoz\S*)/,
  /(?:^| )(?:buni|shuni|shu joyini|bu joyini) (?:kes|o'chir|olib tashla)\S*/,
  /(?:^| )(?:oxirgi|so'nggi) bir necha/,
  /(?:^| )(?:заново|ещ[её] раз|переснят\S*|перескаж\S*|повторю|повторяю|перезапиш\S*)/,
  /(?:^| )(?:выреж|удал|убер)\S* (?:это|этот|эту)/,
  /(?:^| )последн\S* несколько/,
];

/** Reads a note's text for the edits rules can carry out: cutting the last N seconds or a retake. */
export function interpretNote(text: string): NoteIntent {
  const forms = [normalizeSpeech(text).text, normalizeSpeech(text, { latin: true }).text];
  const asksToCut = forms.some((form) => CUT_VERBS.some((verb) => verb.test(form)));
  if (asksToCut) {
    for (const form of forms) {
      for (const pattern of LAST_SECONDS) {
        const match = pattern.exec(form);
        if (!match) continue;
        const seconds = parseSpokenNumber([match[1] ?? "", match[2] ?? ""].filter(Boolean));
        if (seconds !== null && seconds > 0) {
          return { kind: "cutLast", seconds: Math.min(MAX_CUT_LAST_SECONDS, seconds) };
        }
      }
    }
  }
  if (forms.some((form) => RETAKE.some((pattern) => pattern.test(form)))) return { kind: "retake" };
  return { kind: "note" };
}
