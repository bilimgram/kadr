import {
  type EditOperation,
  EditPlan,
  FORMAT_VERSION,
  type RecorderEvent,
  type TimeRange,
} from "@kadr/project-format";
import { PROMPT_VERSION } from "../plan";
import { interpretNote, type NoteIntent } from "./intent";

export type NoteEvent = Extract<RecorderEvent, { type: "note" }>;

export interface NotesPlanInput {
  notes: readonly NoteEvent[];
  /** Utterances detected from microphone levels (clock time), used to find where a retake starts. */
  speech: readonly TimeRange[];
  /** End of the recording on its clock. */
  durationUs: number;
  now?: () => Date;
}

/** How far back a retake may reach. */
const MAX_RETAKE_US = 60_000_000;
/** A trigger this far into an utterance means the flubbed part is the same utterance's start. */
const MIN_ATTEMPT_US = 300_000;
/** Tolerance when lining up the note with detected utterances. */
const ALIGN_US = 250_000;

/**
 * Where the attempt a note asks to redo begins: the start of the utterance the note interrupts, or,
 * when the note starts a fresh utterance, the start of the one before it. Null without speech data.
 */
export function retakeStart(noteStartUs: number, speech: readonly TimeRange[]): number | null {
  const containing = speech.find(
    (range) => range.startUs + MIN_ATTEMPT_US <= noteStartUs && noteStartUs <= range.endUs,
  );
  let start: number | null = containing?.startUs ?? null;
  if (start === null) {
    const before = speech.filter((range) => range.endUs <= noteStartUs + ALIGN_US);
    const previous = before.filter((range) => range.startUs < noteStartUs - MIN_ATTEMPT_US).at(-1);
    start = previous?.startUs ?? null;
  }
  if (start === null) return null;
  return Math.max(start, noteStartUs - MAX_RETAKE_US, 0);
}

interface Candidate {
  range: TimeRange;
  reason: string;
  confidence: number;
}

/** A note's text, shortened for reasons and labels. */
export function noteLabel(note: NoteEvent, max = 80): string {
  const text = note.text?.trim();
  if (!text) return note.source === "voice" ? "Spoken note" : "Note";
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

/**
 * Turns notes into a proposed edit plan (ADR 0005): the spoken note itself is cut, as is what it
 * asks to remove ("cut the last 5 seconds", "let me say that again"). Everything starts as
 * "proposed", so nothing is applied without review; free-form notes stay in events.jsonl for an AI
 * editor to read.
 */
export function notesEditPlan({
  notes,
  speech,
  durationUs,
  now = () => new Date(),
}: NotesPlanInput): EditPlan {
  const clamp = (us: number) => Math.min(durationUs, Math.max(0, Math.round(us)));
  const candidates: Candidate[] = [];
  notes.forEach((note, index) => {
    const label = `Note ${index + 1}`;
    const spokenStart = note.speech?.startUs ?? note.t;
    if (note.speech) {
      candidates.push({
        range: note.speech,
        reason: note.text
          ? `${label} (spoken while recording): "${noteLabel(note)}"`
          : `${label} (spoken while recording)`,
        confidence: note.source === "voice" ? 0.9 : 0.8,
      });
    }
    const intent: NoteIntent = note.text ? interpretNote(note.text) : { kind: "note" };
    if (intent.kind === "cutLast") {
      candidates.push({
        range: { startUs: spokenStart - intent.seconds * 1_000_000, endUs: spokenStart },
        reason: `${label} asks to cut the last ${intent.seconds} s`,
        confidence: 0.85,
      });
    } else if (intent.kind === "retake") {
      const start = retakeStart(spokenStart, speech);
      if (start !== null) {
        candidates.push({
          range: { startUs: start, endUs: spokenStart },
          reason: `${label} asks for a retake: the attempt before it is cut`,
          confidence: 0.75,
        });
      }
    }
  });

  const clamped = candidates
    .map((candidate) => ({
      ...candidate,
      range: { startUs: clamp(candidate.range.startUs), endUs: clamp(candidate.range.endUs) },
    }))
    .filter((candidate) => candidate.range.endUs > candidate.range.startUs);

  const operations: EditOperation[] = mergeCandidates(clamped).map((candidate, index) => ({
    id: `note-cut-${index + 1}`,
    type: "cut",
    status: "proposed",
    range: candidate.range,
    reason: candidate.reason,
    confidence: candidate.confidence,
  }));

  return EditPlan.parse({
    formatVersion: FORMAT_VERSION,
    id: "notes",
    createdAt: now().toISOString(),
    source: { kind: "user", promptVersion: PROMPT_VERSION },
    title: "Edits from notes made while recording",
    operations,
  });
}

/** Merges overlapping or touching cuts (cuts in a plan must not overlap), joining their reasons. */
function mergeCandidates(items: readonly Candidate[]): Candidate[] {
  const sorted = [...items].sort((a, b) => a.range.startUs - b.range.startUs);
  const merged: Candidate[] = [];
  for (const item of sorted) {
    const last = merged.at(-1);
    if (last && item.range.startUs <= last.range.endUs) {
      last.range = {
        startUs: last.range.startUs,
        endUs: Math.max(last.range.endUs, item.range.endUs),
      };
      last.reason = `${last.reason}; ${item.reason}`;
      last.confidence = Math.min(last.confidence, item.confidence);
    } else {
      merged.push({ ...item, range: { ...item.range } });
    }
  }
  return merged;
}

/** Maps a clock time to the position in a single-file recording (pauses removed). */
export function clockToMediaUs(tUs: number, segments: readonly TimeRange[]): number {
  let media = 0;
  for (const segment of segments) {
    if (tUs <= segment.startUs) break;
    media += Math.min(tUs, segment.endUs) - segment.startUs;
  }
  return media;
}

/** "1:05" or "1:02:03" from microseconds. */
export function formatTimestamp(us: number): string {
  const total = Math.max(0, Math.floor(us / 1_000_000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = String(total % 60).padStart(2, "0");
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, "0")}:${seconds}`
    : `${minutes}:${seconds}`;
}

export interface NotesMarkdownInput {
  /** File name of the video the notes belong to. */
  videoFile: string;
  notes: readonly NoteEvent[];
  plan: EditPlan;
  /** Recorded spans on the clock; times are shown as positions in the video. */
  segments: readonly TimeRange[];
}

function describePosition(note: NoteEvent): string {
  if (!note.position) return "";
  const across = Math.round(note.position.x * 100);
  const down = Math.round(note.position.y * 100);
  return `${across}% across, ${down}% down`;
}

/** Escapes text for a Markdown table cell. */
function cell(text: string): string {
  return text.replace(/\|/g, "\\|").replace(/\s+/g, " ").trim();
}

/**
 * A readable list of the notes and the cuts they suggest, saved next to the video. People can read
 * it, and so can any AI editor the video is handed to, with or without Kadr.
 */
export function formatNotesMarkdown({
  videoFile,
  notes,
  plan,
  segments,
}: NotesMarkdownInput): string {
  const at = (us: number) => formatTimestamp(clockToMediaUs(us, segments));
  const lines = [
    `# Editing notes: ${videoFile}`,
    "",
    "Notes made while recording with Kadr. Times are positions in the video. “Where” is the pointer",
    "on the recorded screen, measured from the top-left corner. Spoken notes are instructions for",
    "the editor and are not meant to stay in the final video.",
    "",
    "| # | Time | Note | Where |",
    "| - | ---- | ---- | ----- |",
    ...notes.map((note, index) => {
      const text =
        note.text?.trim() || (note.source === "voice" ? "(spoken note)" : "(marked moment)");
      return `| ${index + 1} | ${at(note.t)} | ${cell(text)} | ${describePosition(note)} |`;
    }),
  ];
  const cuts = plan.operations.filter(
    (op): op is Extract<EditOperation, { type: "cut" }> => op.type === "cut",
  );
  if (cuts.length > 0) {
    lines.push("", "## Suggested cuts", "");
    for (const cut of cuts) {
      lines.push(`- ${at(cut.range.startUs)}–${at(cut.range.endUs)}: ${cut.reason ?? "Cut"}`);
    }
  }
  return `${lines.join("\n")}\n`;
}
