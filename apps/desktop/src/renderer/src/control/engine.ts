import {
  extensionForMimeType,
  type MixedAudio,
  mixAudioStreams,
  pickMimeType,
  stopStreams,
  TrackRecorder,
} from "@kadr/recorder-core";
import type { AppSettings, SessionCommand, SessionSnapshot } from "../../../shared/api";
import { elapsedMs, IDLE_SNAPSHOT } from "../../../shared/session";
import { describeMediaError } from "./media-errors";

interface Capture {
  streams: MediaStream[];
  output: MediaStream;
  audio: MixedAudio | null;
  microphone: MediaStreamTrack | null;
  mimeType: string;
}

interface Take {
  id: string;
  recorder: TrackRecorder;
  stats: { bytes: number };
}

const VIDEO_BITRATE = 8_000_000;

/**
 * The recording engine. It lives in the control window (which keeps running while hidden), owns
 * the media pipeline, executes commands one at a time, and publishes every state change to main,
 * which relays it to the toolbar and choreographs the windows.
 */
export class RecordingEngine {
  private snapshot: SessionSnapshot = IDLE_SNAPSHOT;
  private capture: Capture | null = null;
  private take: Take | null = null;
  private queue: Promise<void> = Promise.resolve();
  private readonly listeners = new Set<() => void>();

  getSnapshot = (): SessionSnapshot => this.snapshot;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  dispatch(command: SessionCommand): Promise<void> {
    this.queue = this.queue.then(() => this.run(command)).catch((error) => this.fail(error));
    return this.queue;
  }

  dismissResult(): void {
    if (this.snapshot.status === "idle") this.update({ lastResult: null, error: null });
  }

  private async run(command: SessionCommand): Promise<void> {
    const { status } = this.snapshot;
    const active = status === "recording" || status === "paused";
    switch (command) {
      case "start":
        if (status === "idle") await this.start();
        break;
      case "stop":
        if (active) await this.stop();
        break;
      case "pause":
        if (status === "recording") this.pause();
        break;
      case "resume":
        if (status === "paused") this.resume();
        break;
      case "togglePause":
        if (status === "recording") this.pause();
        else if (status === "paused") this.resume();
        break;
      case "restart":
        if (active) await this.restart();
        break;
      case "discard":
        if (active) await this.discard();
        break;
      case "toggleMicrophone":
        this.toggleMicrophone();
        break;
      case "toggleCamera":
        break; // handled by main (bubble visibility)
    }
  }

  private async start(): Promise<void> {
    const settings = await window.kadr.settings.get();
    const { mode } = settings.recording;
    this.update({ ...IDLE_SNAPSHOT, status: "preparing", mode });

    this.capture = await this.acquire(settings);
    this.update({ microphone: this.capture.microphone ? "on" : "unavailable" });

    await this.beginTake();
    await this.countdownThenRecord(settings);
  }

  private async acquire(settings: AppSettings): Promise<Capture> {
    const streams: MediaStream[] = [];
    try {
      let video: MediaStreamTrack | undefined;
      if (settings.recording.mode === "camera") {
        const camera = await navigator.mediaDevices.getUserMedia({
          video: {
            width: { ideal: 1920 },
            height: { ideal: 1080 },
            ...(settings.bubble.cameraDeviceId && {
              deviceId: { exact: settings.bubble.cameraDeviceId },
            }),
          },
        });
        streams.push(camera);
        video = camera.getVideoTracks()[0];
      } else {
        const screen = await navigator.mediaDevices.getDisplayMedia({
          video: { frameRate: { ideal: 30 } },
          audio: settings.recording.systemAudio,
        });
        streams.push(screen);
        video = screen.getVideoTracks()[0];
        // Stop cleanly if capture ends from outside (display unplugged, access revoked).
        video?.addEventListener("ended", () => void this.dispatch("stop"), { once: true });
      }
      if (!video) throw new Error("No video track available");

      let microphone: MediaStreamTrack | null = null;
      if (settings.recording.microphoneEnabled) {
        const mic = await navigator.mediaDevices
          .getUserMedia({
            audio: {
              echoCancellation: true,
              noiseSuppression: true,
              autoGainControl: true,
              ...(settings.recording.microphoneDeviceId && {
                deviceId: { exact: settings.recording.microphoneDeviceId },
              }),
            },
          })
          .catch(() => null);
        if (mic) {
          streams.push(mic);
          microphone = mic.getAudioTracks()[0] ?? null;
        }
      }

      const audioSources = streams.filter((stream) => stream.getAudioTracks().length > 0);
      const audio = audioSources.length > 0 ? mixAudioStreams(audioSources) : null;
      const output = new MediaStream([video, ...(audio?.stream.getAudioTracks() ?? [])]);
      return { streams, output, audio, microphone, mimeType: pickMimeType() };
    } catch (error) {
      stopStreams(...streams);
      throw error;
    }
  }

  /** Creates the file and recorder for a new take (not started yet). */
  private async beginTake(): Promise<void> {
    const capture = this.requireCapture();
    const { id } = await window.kadr.recording.begin(extensionForMimeType(capture.mimeType));
    const stats = { bytes: 0 };
    const recorder = new TrackRecorder(capture.output, {
      mimeType: capture.mimeType,
      videoBitsPerSecond: VIDEO_BITRATE,
      retainChunks: false,
      onChunk: async (chunk) => {
        stats.bytes += chunk.size;
        await window.kadr.recording.appendChunk(id, new Uint8Array(await chunk.arrayBuffer()));
      },
    });
    this.take = { id, recorder, stats };
  }

  private async countdownThenRecord(settings: AppSettings): Promise<void> {
    const { countdownSeconds, countdownSound } = settings.recording;
    if (countdownSeconds > 0) {
      this.update({ status: "countdown", accumulatedMs: 0, segmentStartedAt: null });
      const result = await window.kadr.countdown.run({
        seconds: countdownSeconds,
        sound: countdownSound,
      });
      if (result === "cancelled") {
        await this.abortTake();
        this.releaseCapture();
        this.update({ ...IDLE_SNAPSHOT, mode: this.snapshot.mode });
        return;
      }
    }
    this.requireTake().recorder.start();
    this.update({ status: "recording", accumulatedMs: 0, segmentStartedAt: Date.now() });
  }

  private pause(): void {
    this.requireTake().recorder.pause();
    this.update({
      status: "paused",
      accumulatedMs: elapsedMs(this.snapshot),
      segmentStartedAt: null,
    });
  }

  private resume(): void {
    this.requireTake().recorder.resume();
    this.update({ status: "recording", segmentStartedAt: Date.now() });
  }

  private async stop(): Promise<void> {
    const take = this.requireTake();
    const durationMs = elapsedMs(this.snapshot);
    this.update({ status: "saving", accumulatedMs: durationMs, segmentStartedAt: null });
    await take.recorder.stop();
    const path = await window.kadr.recording.finish(take.id);
    this.take = null;
    this.releaseCapture();
    this.update({
      ...IDLE_SNAPSHOT,
      mode: this.snapshot.mode,
      lastResult: { path, durationMs, sizeBytes: take.stats.bytes },
    });
  }

  private async restart(): Promise<void> {
    await this.abortTake();
    this.update({ accumulatedMs: 0, segmentStartedAt: null });
    await this.beginTake();
    await this.countdownThenRecord(await window.kadr.settings.get());
  }

  private async discard(): Promise<void> {
    await this.abortTake();
    this.releaseCapture();
    this.update({ ...IDLE_SNAPSHOT, mode: this.snapshot.mode });
  }

  private toggleMicrophone(): void {
    const track = this.capture?.microphone;
    if (!track) return;
    // A disabled track feeds silence into the mix; the recording keeps running.
    track.enabled = !track.enabled;
    this.update({ microphone: track.enabled ? "on" : "muted" });
  }

  /** Stops the current take and deletes its file. */
  private async abortTake(): Promise<void> {
    const take = this.take;
    this.take = null;
    if (!take) return;
    await take.recorder.stop().catch(() => undefined);
    await window.kadr.recording.discard(take.id);
  }

  private releaseCapture(): void {
    if (!this.capture) return;
    stopStreams(...this.capture.streams);
    this.capture.audio?.dispose();
    this.capture = null;
  }

  private async fail(error: unknown): Promise<void> {
    await this.abortTake().catch(() => undefined);
    this.releaseCapture();
    this.update({
      ...IDLE_SNAPSHOT,
      mode: this.snapshot.mode,
      error: describeMediaError(error, window.kadr.platform),
    });
  }

  private requireCapture(): Capture {
    if (!this.capture) throw new Error("No active capture");
    return this.capture;
  }

  private requireTake(): Take {
    if (!this.take) throw new Error("No active recording");
    return this.take;
  }

  private update(patch: Partial<SessionSnapshot>): void {
    this.snapshot = { ...this.snapshot, ...patch };
    for (const listener of this.listeners) listener();
    window.kadr.session.report(this.snapshot);
  }
}

/** One engine per control window; survives React re-mounts. */
export const engine = new RecordingEngine();
