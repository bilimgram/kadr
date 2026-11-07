import { CameraPipeline, needsSegmentation } from "@kadr/compositor";
import type { AppSettings } from "../../../shared/api";
import { recordingCameraEffects } from "../../../shared/camera";
import { loadBackgroundImage, loadPersonSegmenter } from "../camera/effects";
import { canCropVideo } from "./crop";

// Chromium's Insertable Streams for MediaStreamTrack (also declared in crop.ts, file-local there).
declare class MediaStreamTrackProcessor {
  constructor(init: { track: MediaStreamTrack });
  readonly readable: ReadableStream<VideoFrame>;
}
declare class MediaStreamTrackGenerator extends MediaStreamTrack {
  constructor(init: { kind: "video" });
  readonly writable: WritableStream<VideoFrame>;
}

export interface ProcessedCamera {
  track: MediaStreamTrack;
  dispose(): void;
}

/**
 * Runs the camera pipeline on every frame of `track` and returns the processed track, or null when
 * no effect is on or this system can't process frames (the raw camera is recorded then). Frames
 * come from the track itself, so hidden-window timer throttling never affects them.
 */
export function processCameraTrack(
  track: MediaStreamTrack,
  settings: AppSettings,
): ProcessedCamera | null {
  let effects = recordingCameraEffects(settings.bubble);
  if (!needsSegmentation(effects) || !canCropVideo() || typeof OffscreenCanvas === "undefined") {
    return null;
  }
  const canvas = new OffscreenCanvas(1, 1);
  const pipeline = CameraPipeline.create(canvas);
  if (!pipeline) return null;

  let disposed = false;
  let image: ImageBitmap | null = null;
  void loadPersonSegmenter().then((segmenter) => {
    if (!disposed) pipeline.setSegmenter(segmenter);
  });
  if (effects.background.mode === "image") {
    void loadBackgroundImage().then((bitmap) => {
      if (disposed) bitmap?.close();
      else {
        image = bitmap;
        pipeline.setBackgroundImage(bitmap);
      }
    });
  }
  const unsubscribe = window.kadr.settings.onChange((next) => {
    effects = recordingCameraEffects(next.bubble);
  });

  const processor = new MediaStreamTrackProcessor({ track });
  const generator = new MediaStreamTrackGenerator({ kind: "video" });
  const transform = new TransformStream<VideoFrame, VideoFrame>({
    transform(frame, controller) {
      try {
        const width = frame.displayWidth;
        const height = frame.displayHeight;
        if (canvas.width !== width) canvas.width = width;
        if (canvas.height !== height) canvas.height = height;
        if (pipeline.ready) {
          pipeline.render(frame, { width, height }, effects, frame.timestamp / 1000);
          controller.enqueue(
            new VideoFrame(canvas, {
              timestamp: frame.timestamp,
              ...(frame.duration !== null && { duration: frame.duration }),
            }),
          );
        } else {
          // GPU context lost: keep recording the unprocessed camera.
          controller.enqueue(frame.clone());
        }
      } finally {
        frame.close();
      }
    },
  });
  void processor.readable
    .pipeThrough(transform)
    .pipeTo(generator.writable)
    .catch(() => undefined);

  return {
    track: generator,
    dispose() {
      if (disposed) return;
      disposed = true;
      unsubscribe();
      generator.stop();
      pipeline.dispose();
      image?.close();
    },
  };
}
