import { randomUUID } from "node:crypto";
import { createWriteStream, type WriteStream } from "node:fs";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { basename, dirname, isAbsolute, join, relative } from "node:path";
import { app } from "electron";
import type { NotesSidecar, RecordingExtension } from "../shared/api";
import { buildNotesFiles, hasNotesContent } from "../shared/notes-files";

interface OpenRecording {
  path: string;
  stream: WriteStream;
}

/**
 * Streams recording chunks straight to disk so a crash loses at most the last chunk.
 * Phase 1 replaces the single file with the `.kadr` bundle writer (separate tracks + manifest).
 */
export class RecordingStore {
  private readonly open = new Map<string, OpenRecording>();

  get directory(): string {
    return join(app.getPath("videos"), "Kadr");
  }

  async begin(extension: RecordingExtension): Promise<{ id: string; path: string }> {
    await mkdir(this.directory, { recursive: true });
    const id = randomUUID();
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const path = join(this.directory, `Kadr ${stamp}.${extension}`);
    this.open.set(id, { path, stream: createWriteStream(path, { flags: "wx" }) });
    return { id, path };
  }

  append(id: string, data: Uint8Array): Promise<void> {
    const recording = this.get(id);
    return new Promise((resolve, reject) => {
      recording.stream.write(data, (error) => (error ? reject(error) : resolve()));
    });
  }

  finish(id: string): Promise<string> {
    const recording = this.get(id);
    this.open.delete(id);
    return new Promise((resolve, reject) => {
      recording.stream.once("error", reject);
      recording.stream.end(() => resolve(recording.path));
    });
  }

  /**
   * Saves the notes of a take that is still open (before `finish`) next to its file: a `.kadr`
   * bundle and a readable `… notes.md` (ADR 0010). Does nothing when there is nothing to save.
   */
  async saveNotes(id: string, sidecar: NotesSidecar): Promise<void> {
    if (!hasNotesContent(sidecar)) return;
    const { path } = this.get(id);
    const files = buildNotesFiles(sidecar, {
      videoFile: basename(path),
      id,
      createdAt: new Date(),
      appVersion: app.getVersion(),
      platform:
        process.platform === "darwin" || process.platform === "linux" ? process.platform : "win32",
    });
    const bundleDir = join(dirname(path), files.bundleName);
    for (const [relativePath, content] of Object.entries(files.bundle)) {
      const target = join(bundleDir, relativePath);
      if (!this.contains(target)) throw new Error("Notes path is outside the recordings folder");
      await mkdir(dirname(target), { recursive: true });
      await writeFile(target, content, "utf8");
    }
    if (files.markdown) {
      await writeFile(join(dirname(path), files.markdown.name), files.markdown.content, "utf8");
    }
  }

  /** Closes and deletes a take (restart / discard). Unknown ids are ignored. */
  async discard(id: string): Promise<void> {
    const recording = this.open.get(id);
    if (!recording) return;
    this.open.delete(id);
    await new Promise<void>((resolve) => recording.stream.end(() => resolve()));
    await rm(recording.path, { force: true });
  }

  async ensureDirectory(): Promise<string> {
    await mkdir(this.directory, { recursive: true });
    return this.directory;
  }

  /** Whether a path is inside the recordings directory (used to restrict shell access). */
  contains(path: string): boolean {
    const fromDir = relative(this.directory, path);
    return fromDir !== "" && !fromDir.startsWith("..") && !isAbsolute(fromDir);
  }

  private get(id: string): OpenRecording {
    const recording = this.open.get(id);
    if (!recording) throw new Error("Unknown recording");
    return recording;
  }
}
