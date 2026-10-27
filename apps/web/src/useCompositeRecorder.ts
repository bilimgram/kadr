import { Compositor, startRenderLoop } from "@kadr/compositor";
import type { BubbleLayout } from "@kadr/project-format";
import {
  extensionForMimeType,
  type MixedAudio,
  mixAudioStreams,
  stopStreams,
  TrackRecorder,
} from "@kadr/recorder-core";
import { type RefObject, useCallback, useEffect, useRef, useState } from "react";
import { requestUserMedia } from "./requestUserMedia";

export type WebRecorderStatus =
  | "idle"
  | "starting"
  | "countdown"
  | "recording"
  | "paused"
  | "saving";

export interface RecordingResult {
  url: string;
  fileName: string;
  durationMs: number;
  sizeBytes: number;
}

export interface RecorderTiming {
  accumulatedMs: number;
  segmentStartedAt: number | null;
}

interface Session {
  recorder: TrackRecorder;
  stopLoop: () => void;
  streams: MediaStream[];
  audio: MixedAudio | null;
}

/** Chrome's CaptureController lets the page keep focus so the countdown stays visible. */
interface FocusCaptureController {
  setFocusBehavior(behavior: "focus-captured-surface" | "no-focus-change"): void;
}

const MAX_WIDTH = 1920;
const IDLE_TIMING: RecorderTiming = { accumulatedMs: 0, segmentStartedAt: null };

async function playStream(stream: MediaStream): Promise<HTMLVideoElement> {
  const video = document.createElement("video");
  video.muted = true;
  video.playsInline = true;
  video.srcObject = stream;
  await video.play();
  return video;
}

/** Even dimensions (required by H.264 encoders), scaled down to at most 1920 px wide. */
function outputSize(track: MediaStreamTrack): { width: number; height: number } {
  const { width = 1920, height = 1080 } = track.getSettings();
  const scale = Math.min(1, MAX_WIDTH / width);
  const even = (n: number) => Math.max(2, Math.round((n * scale) / 2) * 2);
  return { width: even(width), height: even(height) };
}

export function elapsedMs(timing: RecorderTiming, now: number): number {
  const running = timing.segmentStartedAt === null ? 0 : Math.max(0, now - timing.segmentStartedAt);
  return timing.accumulatedMs + running;
}

/**
 * Browser recording with a live composited bubble: screen + camera are drawn into a canvas by the
 * compositor and the canvas stream is recorded. Layout changes (shape, size, drag) apply live.
 * Flow: prepare() → optional countdown → begin() → pause()/resume() → stop() or cancel().
 */
export function useCompositeRecorder(
  canvasRef: RefObject<HTMLCanvasElement | null>,
  layout: BubbleLayout,
  options: { withCamera: boolean; withMicrophone: boolean; countdownSeconds: number },
) {
  const [status, setStatus] = useState<WebRecorderStatus>("idle");
  const [result, setResult] = useState<RecordingResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [timing, setTiming] = useState<RecorderTiming>(IDLE_TIMING);
  const layoutRef = useRef(layout);
  layoutRef.current = layout;
  const session = useRef<Session | null>(null);

  useEffect(
    () => () => {
      if (result) URL.revokeObjectURL(result.url);
    },
    [result],
  );

  const release = useCallback(() => {
    const current = session.current;
    session.current = null;
    if (!current) return;
    current.stopLoop();
    stopStreams(...current.streams);
    current.audio?.dispose();
  }, []);

  const begin = useCallback(() => {
    if (!session.current) return;
    session.current.recorder.start();
    setTiming({ accumulatedMs: 0, segmentStartedAt: Date.now() });
    setStatus("recording");
  }, []);

  const cancel = useCallback(() => {
    void session.current?.recorder.stop().catch(() => undefined);
    release();
    setTiming(IDLE_TIMING);
    setStatus("idle");
  }, [release]);

  const pause = useCallback(() => {
    session.current?.recorder.pause();
    setTiming((t) => ({ accumulatedMs: elapsedMs(t, Date.now()), segmentStartedAt: null }));
    setStatus("paused");
  }, []);

  const resume = useCallback(() => {
    session.current?.recorder.resume();
    setTiming((t) => ({ ...t, segmentStartedAt: Date.now() }));
    setStatus("recording");
  }, []);

  const stop = useCallback(async () => {
    const current = session.current;
    if (!current) return;
    const durationMs = elapsedMs(timing, Date.now());
    setStatus("saving");
    try {
      const blob = await current.recorder.stop();
      const stamp = new Date().toISOString().replace(/[:.]/g, "-");
      setResult({
        url: URL.createObjectURL(blob),
        fileName: `kadr-${stamp}.${extensionForMimeType(current.recorder.mimeType)}`,
        durationMs,
        sizeBytes: blob.size,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      release();
      setTiming(IDLE_TIMING);
      setStatus("idle");
    }
  }, [release, timing]);

  // The "ended" listener must always call the latest stop() (which closes over current timing).
  const stopRef = useRef(stop);
  stopRef.current = stop;

  const prepare = useCallback(async () => {
    const canvas = canvasRef.current;
    if (!canvas || session.current) return;
    setStatus("starting");
    setError(null);
    setWarning(null);

    const streams: MediaStream[] = [];
    try {
      const Controller = (
        window as unknown as { CaptureController?: new () => FocusCaptureController }
      ).CaptureController;
      const controller = Controller ? new Controller() : undefined;
      const screen = await navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: { ideal: 30 } },
        audio: true,
        ...(controller && { controller }),
      } as DisplayMediaStreamOptions);
      try {
        controller?.setFocusBehavior("no-focus-change");
      } catch {
        // Only tabs and windows support focus control; entire screens don't.
      }
      streams.push(screen);

      const camera = await requestUserMedia(
        (constraints) => navigator.mediaDevices.getUserMedia(constraints),
        options,
      );
      if (camera) streams.push(camera);

      const screenTrack = screen.getVideoTracks()[0];
      if (!screenTrack) throw new Error("No screen video track");
      const screenVideo = await playStream(new MediaStream([screenTrack]));
      const cameraTrack = camera?.getVideoTracks()[0];
      const missing: string[] = [];
      if (options.withCamera && !cameraTrack)
        missing.push("Camera unavailable — recording your screen without a camera bubble.");
      if (options.withMicrophone && !camera?.getAudioTracks().length)
        missing.push("Microphone unavailable — your voice will not be recorded.");
      if (missing.length) setWarning(missing.join(" "));
      const cameraVideo = cameraTrack ? await playStream(new MediaStream([cameraTrack])) : null;

      Object.assign(canvas, outputSize(screenTrack));
      const compositor = new Compositor(canvas, { autoLight: true });
      const stopLoop = startRenderLoop(30, () => {
        compositor.render({
          screen: {
            image: screenVideo,
            width: screenVideo.videoWidth,
            height: screenVideo.videoHeight,
          },
          ...(cameraVideo && {
            camera: {
              image: cameraVideo,
              width: cameraVideo.videoWidth,
              height: cameraVideo.videoHeight,
            },
          }),
          layout: layoutRef.current,
        });
      });

      const audioSources = streams.filter((s) => s.getAudioTracks().length > 0);
      const audio = audioSources.length > 0 ? mixAudioStreams(audioSources) : null;
      const output = new MediaStream([
        ...canvas.captureStream(30).getVideoTracks(),
        ...(audio?.stream.getAudioTracks() ?? []),
      ]);
      const recorder = new TrackRecorder(output, { videoBitsPerSecond: 8_000_000 });

      session.current = { recorder, stopLoop, streams, audio };
      // Keep the previous preview if the browser's sharing dialog is cancelled.
      setResult(null);
      screenTrack.addEventListener("ended", () => void stopRef.current(), { once: true });

      if (options.countdownSeconds > 0) setStatus("countdown");
      else begin();
    } catch (err) {
      stopStreams(...streams);
      const denied = err instanceof DOMException && err.name === "NotAllowedError";
      setError(
        denied
          ? "Screen sharing was cancelled or blocked. Allow it in your browser to record."
          : err instanceof Error
            ? err.message
            : String(err),
      );
      setStatus("idle");
    }
  }, [canvasRef, options.withCamera, options.withMicrophone, options.countdownSeconds, begin]);

  return { status, timing, result, error, warning, prepare, begin, cancel, pause, resume, stop };
}
