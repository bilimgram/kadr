import type { Rect } from "../../../shared/placement";
import { cropRect } from "../../../shared/region";

// Chromium's Insertable Streams for MediaStreamTrack; TypeScript's DOM library doesn't declare them.
declare class MediaStreamTrackProcessor {
  constructor(init: { track: MediaStreamTrack });
  readonly readable: ReadableStream<VideoFrame>;
}
declare class MediaStreamTrackGenerator extends MediaStreamTrack {
  constructor(init: { kind: "video" });
  readonly writable: WritableStream<VideoFrame>;
}

/** Whether this runtime can crop a capture to a region. */
export function canCropVideo(): boolean {
  return "MediaStreamTrackProcessor" in window && "MediaStreamTrackGenerator" in window;
}

/**
 * Crops a captured display to `area` (both in DIPs; `display` is the captured display's bounds).
 * Each frame only gets a smaller visible rectangle, so nothing is copied or redrawn, and it runs on
 * the capture's own frames, unaffected by the hidden window's timers. The crop follows the frame
 * size, so a change of display scaling mid-recording still records the same area.
 */
export function cropVideoTrack(
  track: MediaStreamTrack,
  area: Rect,
  display: Rect,
): MediaStreamTrack {
  const processor = new MediaStreamTrackProcessor({ track });
  const generator = new MediaStreamTrackGenerator({ kind: "video" });
  const crop = new TransformStream<VideoFrame, VideoFrame>({
    transform(frame, controller) {
      try {
        const source = frame.visibleRect ?? {
          x: 0,
          y: 0,
          width: frame.codedWidth,
          height: frame.codedHeight,
        };
        const rect = cropRect(area, display, source);
        controller.enqueue(
          new VideoFrame(frame, {
            visibleRect: { ...rect, x: source.x + rect.x, y: source.y + rect.y },
          }),
        );
      } finally {
        frame.close();
      }
    },
  });
  // Ends by itself when the capture stops (the source track ends) or the generator is stopped.
  void processor.readable
    .pipeThrough(crop)
    .pipeTo(generator.writable)
    .catch(() => undefined);
  return generator;
}
