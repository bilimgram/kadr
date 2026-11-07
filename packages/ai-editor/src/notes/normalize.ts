/**
 * Text normalization for matching spoken phrases in transcripts, with a map back to the original
 * text so matches can be cut out of it. Speech-to-text writes Uzbek in Latin or Cyrillic script and
 * spells the o'/g' apostrophe in half a dozen ways, so both are folded here.
 */

export interface NormalizedText {
  text: string;
  /** For each character of `text`, the index of the original character it came from. */
  sourceIndex: number[];
}

const APOSTROPHES = /[‘’ʻʼ`´′]/;

/** Uzbek Cyrillic → Latin (the official 1995 alphabet); Russian-only letters map to their sound. */
const UZBEK_LATIN: Readonly<Record<string, string>> = {
  а: "a",
  б: "b",
  в: "v",
  г: "g",
  д: "d",
  е: "e",
  ё: "yo",
  ж: "j",
  з: "z",
  и: "i",
  й: "y",
  к: "k",
  л: "l",
  м: "m",
  н: "n",
  о: "o",
  п: "p",
  р: "r",
  с: "s",
  т: "t",
  у: "u",
  ф: "f",
  х: "x",
  ц: "ts",
  ч: "ch",
  ш: "sh",
  щ: "sh",
  ъ: "'",
  ь: "",
  ы: "i",
  э: "e",
  ю: "yu",
  я: "ya",
  ў: "o'",
  қ: "q",
  ғ: "g'",
  ҳ: "h",
};

/**
 * Lower-cases, unifies apostrophes, turns other punctuation into spaces and collapses whitespace.
 * With `latin`, Cyrillic letters are transliterated to Uzbek Latin as well.
 */
export function normalizeSpeech(original: string, { latin = false } = {}): NormalizedText {
  const out: string[] = [];
  const sourceIndex: number[] = [];
  const push = (value: string, index: number) => {
    for (const char of value) {
      // Collapse runs of spaces, and never start with one.
      if (char === " " && (out.length === 0 || out[out.length - 1] === " ")) continue;
      out.push(char);
      sourceIndex.push(index);
    }
  };
  for (let index = 0; index < original.length; index++) {
    const char = (original[index] ?? "").toLowerCase();
    if (APOSTROPHES.test(char) || char === "'") push("'", index);
    else if (/[\p{L}\p{N}]/u.test(char)) push(latin ? (UZBEK_LATIN[char] ?? char) : char, index);
    else push(" ", index);
  }
  while (out[out.length - 1] === " ") {
    out.pop();
    sourceIndex.pop();
  }
  return { text: out.join(""), sourceIndex };
}

/** Number words in English, Uzbek (Latin, after normalization) and Russian. */
const NUMBER_WORDS: Readonly<Record<string, number>> = {
  // English
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
  thirteen: 13,
  fourteen: 14,
  fifteen: 15,
  sixteen: 16,
  seventeen: 17,
  eighteen: 18,
  nineteen: 19,
  twenty: 20,
  thirty: 30,
  forty: 40,
  fifty: 50,
  sixty: 60,
  // Uzbek
  bir: 1,
  ikki: 2,
  uch: 3,
  "to'rt": 4,
  besh: 5,
  olti: 6,
  yetti: 7,
  sakkiz: 8,
  "to'qqiz": 9,
  "o'n": 10,
  yigirma: 20,
  "o'ttiz": 30,
  qirq: 40,
  ellik: 50,
  oltmish: 60,
  // Russian
  один: 1,
  одну: 1,
  два: 2,
  две: 2,
  три: 3,
  четыре: 4,
  пять: 5,
  шесть: 6,
  семь: 7,
  восемь: 8,
  девять: 9,
  десять: 10,
  одиннадцать: 11,
  двенадцать: 12,
  пятнадцать: 15,
  двадцать: 20,
  тридцать: 30,
  сорок: 40,
  пятьдесят: 50,
  шестьдесят: 60,
};

/**
 * Parses "5", "five", "twenty five", "o'n besh" or "двадцать пять" into a number; null otherwise.
 * Tens followed by a unit are added up.
 */
export function parseSpokenNumber(words: readonly string[]): number | null {
  const [first, second] = words;
  if (!first) return null;
  if (/^\d+(\.\d+)?$/.test(first)) return Number(first);
  const tens = NUMBER_WORDS[first];
  if (tens === undefined) return null;
  const unit = second ? NUMBER_WORDS[second] : undefined;
  if (tens >= 10 && tens % 10 === 0 && unit !== undefined && unit < 10) return tens + unit;
  return tens;
}
