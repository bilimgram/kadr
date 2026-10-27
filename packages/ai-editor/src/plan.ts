import {
  type EditOperation,
  EditPlan,
  FORMAT_VERSION,
  type TimeRange,
  type Transcript,
} from "@kadr/project-format";
import { detectFillerWords, detectSilences } from "./heuristics";

export const PROMPT_VERSION = "0.1.0";

/** System prompt for the edit-plan request. Versioned with `PROMPT_VERSION`. */
export const EDIT_PLAN_SYSTEM_PROMPT = `You edit screen recordings for async video messages.
You receive a timestamped transcript (seconds) and a summary of recording events (clicks, focus
changes, markers). Propose an edit plan that makes the video tighter and clearer without changing
its meaning:
- cut retakes and false starts (keep the last, best take), filler words, and long silences;
- treat "marker mistake" events as strong hints that the preceding sentence should be cut;
- add zooms around clicks when small UI details matter, and chapters at topic changes;
- write a short title and a one-paragraph summary in the transcript's language.
Return only JSON that matches the provided schema. Express times in microseconds. Give every
operation a short reason and a confidence between 0 and 1. When unsure, prefer fewer edits.`;

export type ValidationResult = { ok: true; plan: EditPlan } | { ok: false; issues: string[] };

/**
 * Validates an edit plan returned by a model: schema, time ranges inside the recording, and no
 * overlapping cuts. Invalid plans are never shown to the user.
 */
export function validateEditPlan(input: unknown, durationUs: number): ValidationResult {
  const parsed = EditPlan.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      issues: parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`),
    };
  }

  const issues: string[] = [];
  for (const op of parsed.data.operations) {
    const end = op.type === "chapter" ? op.atUs : op.range.endUs;
    if (end > durationUs)
      issues.push(`${op.id}: ends after the recording (${end} > ${durationUs})`);
  }

  const cuts = parsed.data.operations
    .filter((op): op is Extract<EditOperation, { type: "cut" }> => op.type === "cut")
    .map((op) => ({ id: op.id, ...op.range }))
    .sort((a, b) => a.startUs - b.startUs);
  for (let i = 1; i < cuts.length; i++) {
    const previous = cuts[i - 1];
    const current = cuts[i];
    if (previous && current && current.startUs < previous.endUs) {
      issues.push(`${current.id}: overlaps cut ${previous.id}`);
    }
  }

  return issues.length > 0 ? { ok: false, issues } : { ok: true, plan: parsed.data };
}

export interface HeuristicPlanInput {
  transcript: Transcript;
  durationUs: number;
  fillers?: readonly string[];
  now?: () => Date;
}

/**
 * Builds an edit plan from deterministic heuristics only (silences + filler words). This is the
 * "auto edit" available with no API key, and the hint list given to the LLM.
 */
export function heuristicEditPlan({
  transcript,
  durationUs,
  fillers,
  now = () => new Date(),
}: HeuristicPlanInput): EditPlan {
  const silences = detectSilences(transcript.words, { durationUs });
  const fillerHits = detectFillerWords(transcript.words, fillers);

  const candidates: Array<{ range: TimeRange; reason: string; confidence: number }> = [
    ...silences.map((range) => ({ range, reason: "Long silence", confidence: 0.9 })),
    ...fillerHits.map((hit) => ({
      range: hit.range,
      reason: `Filler word "${hit.word}"`,
      confidence: 0.7,
    })),
  ];

  const operations = mergeRanges(candidates).map((candidate, index) => ({
    id: `cut-${index + 1}`,
    type: "cut" as const,
    status: "proposed" as const,
    range: candidate.range,
    reason: candidate.reason,
    confidence: candidate.confidence,
  }));

  return EditPlan.parse({
    formatVersion: FORMAT_VERSION,
    id: `heuristic-${now().getTime()}`,
    createdAt: now().toISOString(),
    source: { kind: "heuristic", promptVersion: PROMPT_VERSION },
    operations,
  });
}

/** Merges overlapping or touching ranges, keeping the strongest reason. */
function mergeRanges<T extends { range: TimeRange; reason: string; confidence: number }>(
  items: readonly T[],
): T[] {
  const sorted = [...items].sort((a, b) => a.range.startUs - b.range.startUs);
  const merged: T[] = [];
  for (const item of sorted) {
    const last = merged.at(-1);
    if (last && item.range.startUs <= last.range.endUs) {
      last.range = {
        startUs: last.range.startUs,
        endUs: Math.max(last.range.endUs, item.range.endUs),
      };
      if (item.confidence > last.confidence) {
        last.reason = item.reason;
        last.confidence = item.confidence;
      }
    } else {
      merged.push({ ...item, range: { ...item.range } });
    }
  }
  return merged;
}
