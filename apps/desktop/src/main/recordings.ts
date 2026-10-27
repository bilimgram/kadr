import { randomUUID } from "node:crypto";
import { createWriteStream, type WriteStream } from "node:fs";
import { mkdir, rm } from "node:fs/promises";
import { isAbsolute, join, relative } from "node:path";
import { app } from "electron";
import type { RecordingExtension } from "../shared/api";

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
