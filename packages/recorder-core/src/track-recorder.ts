import { pickMimeType } from "./mime";

export interface TrackRecorderOptions {
  mimeType?: string;
  videoBitsPerSecond?: number;
  audioBitsPerSecond?: number;
  /** Chunk interval; chunks are delivered to `onChunk` as they are produced. */
  timesliceMs?: number;
  /** Receives chunks in order. Async handlers are awaited one at a time (e.g. disk or upload writes). */
  onChunk?: (chunk: Blob) => void | Promise<void>;
  /** Keep chunks in memory so `stop()` can return the full recording. Disable for long recordings. */
  retainChunks?: boolean;
}

/**
 * Thin wrapper around `MediaRecorder` that streams ordered chunks and resolves the whole recording on
 * stop. Phase 0 pipeline; Phase 1 replaces it with WebCodecs + a fragmented-MP4 muxer.
 */
export class TrackRecorder {
  readonly mimeType: string;
  private readonly recorder: MediaRecorder;
  private readonly chunks: Blob[] = [];
  private pending: Promise<void> = Promise.resolve();
  private chunkError: unknown = null;

  constructor(
    stream: MediaStream,
    private readonly options: TrackRecorderOptions = {},
  ) {
    this.mimeType = options.mimeType ?? pickMimeType();
    const recorderOptions: MediaRecorderOptions = { mimeType: this.mimeType };
    if (options.videoBitsPerSecond) recorderOptions.videoBitsPerSecond = options.videoBitsPerSecond;
    if (options.audioBitsPerSecond) recorderOptions.audioBitsPerSecond = options.audioBitsPerSecond;
    this.recorder = new MediaRecorder(stream, recorderOptions);
    this.recorder.ondataavailable = (event) => this.handleChunk(event.data);
  }

  get state(): RecordingState {
    return this.recorder.state;
  }

  start(): void {
    this.recorder.start(this.options.timesliceMs ?? 1000);
  }

  pause(): void {
    if (this.recorder.state === "recording") this.recorder.pause();
  }

  resume(): void {
    if (this.recorder.state === "paused") this.recorder.resume();
  }

  /** Stops recording, waits for every chunk handler, and returns the retained recording. */
  stop(): Promise<Blob> {
    // Never started (e.g. countdown cancelled) or already stopped: nothing more will arrive.
    if (this.recorder.state === "inactive") return this.pending.then(() => this.result());
    return new Promise((resolve, reject) => {
      this.recorder.addEventListener(
        "stop",
        () => {
          this.pending.then(() => this.result()).then(resolve, reject);
        },
        { once: true },
      );
      this.recorder.stop();
    });
  }

  private result(): Blob {
    if (this.chunkError) throw this.chunkError;
    return new Blob(this.chunks, { type: this.mimeType });
  }

  private handleChunk(chunk: Blob): void {
    if (chunk.size === 0) return;
    if (this.options.retainChunks ?? true) this.chunks.push(chunk);
    const { onChunk } = this.options;
    if (!onChunk) return;
    this.pending = this.pending
      .then(() => onChunk(chunk))
      .catch((error: unknown) => {
        this.chunkError ??= error;
      });
  }
}
