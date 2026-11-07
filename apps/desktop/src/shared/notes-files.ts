import { formatNotesMarkdown, type NoteEvent, notesEditPlan } from "@kadr/ai-editor";
import {
  BUNDLE_EXTENSION,
  BUNDLE_LAYOUT,
  FORMAT_VERSION,
  Manifest,
  stringifyEventsJsonl,
} from "@kadr/project-format";
import type { NotesSidecar } from "./schemas";

export interface NotesFilesContext {
  /** File name of the recording (e.g. "Kadr 2026-11-07T10-00-00.mp4"). */
  videoFile: string;
  id: string;
  createdAt: Date;
  appVersion: string;
  platform: "win32" | "darwin" | "linux";
}

export interface NotesFiles {
  /** Folder name of the bundle, next to the video. */
  bundleName: string;
  /** Files inside the bundle, by relative path. */
  bundle: Record<string, string>;
  /** File name and content of the readable notes, next to the video; null without notes. */
  markdown: { name: string; content: string } | null;
}

/** The video file name without its extension. */
export function baseName(videoFile: string): string {
  return videoFile.replace(/\.[^.\\/]+$/, "");
}

/** Whether a recording produced anything worth saving next to it. */
export function hasNotesContent(sidecar: NotesSidecar): boolean {
  return (
    sidecar.events.some((event) => event.type === "note") ||
    (sidecar.transcript?.words.length ?? 0) > 0
  );
}

/**
 * Builds what is saved next to a recording made with notes (ADR 0010): a `.kadr` bundle with the
 * manifest, `events.jsonl`, the transcript and the edit plan the notes suggest, plus a readable
 * `… notes.md` for people and for any AI editor the video is handed to.
 */
export function buildNotesFiles(sidecar: NotesSidecar, context: NotesFilesContext): NotesFiles {
  const base = baseName(context.videoFile);
  const notes = sidecar.events.filter((event): event is NoteEvent => event.type === "note");
  const plan = notesEditPlan({
    notes,
    speech: sidecar.speech,
    durationUs: sidecar.durationUs,
    now: () => context.createdAt,
  });
  const manifest = Manifest.parse({
    formatVersion: FORMAT_VERSION,
    id: context.id,
    title: base,
    createdAt: context.createdAt.toISOString(),
    app: { name: "kadr-desktop", version: context.appVersion, platform: context.platform },
    durationUs: sidecar.durationUs,
    clock: { kind: "monotonic", unit: "us" },
    tracks: [],
    segments: sidecar.segments,
    media: { file: context.videoFile },
  });

  const bundle: Record<string, string> = {
    [BUNDLE_LAYOUT.manifest]: `${JSON.stringify(manifest, null, 2)}\n`,
    [BUNDLE_LAYOUT.events]: stringifyEventsJsonl(sidecar.events),
    [`${BUNDLE_LAYOUT.editsDir}/notes.json`]: `${JSON.stringify(plan, null, 2)}\n`,
  };
  if (sidecar.transcript && sidecar.transcript.words.length > 0) {
    bundle[BUNDLE_LAYOUT.transcript] = `${JSON.stringify(sidecar.transcript, null, 2)}\n`;
  }

  return {
    bundleName: `${base}${BUNDLE_EXTENSION}`,
    bundle,
    markdown:
      notes.length > 0
        ? {
            name: `${base} notes.md`,
            content: formatNotesMarkdown({
              videoFile: context.videoFile,
              notes,
              plan,
              segments: sidecar.segments,
            }),
          }
        : null,
  };
}
