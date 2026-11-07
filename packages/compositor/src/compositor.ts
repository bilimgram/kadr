import type { BubbleLayout } from "@kadr/project-format";
import { type CameraBackground, type CameraEffects, DEFAULT_CAMERA_BACKGROUND } from "./background";
import { type CameraFrameSource, CameraPipeline, needsSegmentation } from "./camera-pipeline";
import { bubbleRect, fitContain, fitCover, type Rect, type Size } from "./layout";
import type { PersonSegmenter } from "./segmentation";
import { type BubbleShape, getBubbleShape } from "./shapes";

export interface VideoSource extends Size {
  image: CanvasImageSource;
}

export interface CompositorFrame {
  screen?: VideoSource;
  camera?: VideoSource;
  layout: BubbleLayout;
}

export interface CompositorOptions {
  background?: string;
  shadow?: boolean;
  /** Light-correct the camera on the GPU (see light.ts and camera-enhancer.ts). */
  autoLight?: boolean;
  /** Blur, remove or replace the camera's background (needs `setSegmenter`). */
  cameraBackground?: CameraBackground;
}

type Context2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

/**
 * Draws the screen (letterboxed) and the shaped camera bubble into a canvas. Works with
 * `HTMLCanvasElement` and `OffscreenCanvas`, so it can run on the main thread or in a worker.
 */
export class Compositor {
  private readonly ctx: Context2D;
  private readonly unitPaths = new Map<string, Path2D>();
  /** undefined until first use; null when WebGL2 is unavailable. */
  private pipeline: CameraPipeline | null | undefined;
  private segmenter: PersonSegmenter | null = null;
  private backgroundImage: ImageBitmap | null = null;

  constructor(
    private readonly canvas: HTMLCanvasElement | OffscreenCanvas,
    private readonly options: CompositorOptions = {},
  ) {
    const ctx = canvas.getContext("2d", { alpha: false, desynchronized: true });
    if (!ctx) throw new Error("Canvas 2D context is not available");
    this.ctx = ctx as Context2D;
  }

  /** The person segmenter for background effects and face metering (not owned). */
  setSegmenter(segmenter: PersonSegmenter | null): void {
    this.segmenter = segmenter;
    this.pipeline?.setSegmenter(segmenter);
  }

  /** The image for the "image" camera background (not owned). */
  setBackgroundImage(image: ImageBitmap | null): void {
    this.backgroundImage = image;
    this.pipeline?.setBackgroundImage(image);
  }

  render(frame: CompositorFrame): void {
    const { ctx } = this;
    const size = { width: this.canvas.width, height: this.canvas.height };

    ctx.fillStyle = this.options.background ?? "#000000";
    ctx.fillRect(0, 0, size.width, size.height);

    if (frame.screen) {
      const r = fitContain(frame.screen, size);
      ctx.drawImage(frame.screen.image, r.x, r.y, r.width, r.height);
    }
    if (frame.camera && frame.layout.visible) {
      this.drawBubble(frame.camera, frame.layout, size);
    }
  }

  private drawBubble(camera: VideoSource, layout: BubbleLayout, frame: Size): void {
    const { ctx } = this;
    const rect = bubbleRect(layout, frame);
    const path = this.shapePath(getBubbleShape(layout.shape), rect);
    const effects: CameraEffects = {
      touchUp: this.options.autoLight ?? false,
      background: this.options.cameraBackground ?? DEFAULT_CAMERA_BACKGROUND,
      mirror: layout.mirror,
    };
    const processed = this.processCamera(camera, rect, effects);
    // With the background removed, the screen shows around the person: no shape, shadow or ring.
    const cutOut = processed !== null && effects.background.mode === "remove";

    ctx.save();
    if ((this.options.shadow ?? true) && !cutOut) {
      ctx.shadowColor = "rgba(0, 0, 0, 0.35)";
      ctx.shadowBlur = rect.height * 0.06;
      ctx.fillStyle = "#000000";
      ctx.fill(path);
      ctx.shadowColor = "transparent";
    }
    ctx.clip(path);
    if (processed) {
      // Already cropped, mirrored and processed on the GPU.
      ctx.drawImage(processed, rect.x, rect.y, rect.width, rect.height);
      ctx.restore();
      if (!cutOut) this.strokeBorder(path, layout);
      return;
    }
    if (layout.mirror) {
      // Flip horizontally around the bubble's vertical center line.
      ctx.translate(2 * rect.x + rect.width, 0);
      ctx.scale(-1, 1);
    }
    const crop = fitCover(camera, rect);
    ctx.drawImage(
      camera.image,
      crop.x,
      crop.y,
      crop.width,
      crop.height,
      rect.x,
      rect.y,
      rect.width,
      rect.height,
    );
    ctx.restore();
    this.strokeBorder(path, layout);
  }

  private strokeBorder(path: Path2D, layout: BubbleLayout): void {
    if (!layout.border || layout.border.width <= 0) return;
    const { ctx } = this;
    ctx.save();
    ctx.lineWidth = layout.border.width;
    ctx.strokeStyle = layout.border.color;
    ctx.stroke(path);
    ctx.restore();
  }

  /** Renders the processed camera at the bubble's size, or null to draw it unprocessed. */
  private processCamera(
    camera: VideoSource,
    rect: Rect,
    effects: CameraEffects,
  ): CanvasImageSource | null {
    if (!needsSegmentation(effects) || camera.width === 0) return null;
    if (this.pipeline === undefined) {
      const canvas =
        typeof OffscreenCanvas !== "undefined"
          ? new OffscreenCanvas(1, 1)
          : document.createElement("canvas");
      this.pipeline = CameraPipeline.create(canvas);
      this.pipeline?.setSegmenter(this.segmenter);
      this.pipeline?.setBackgroundImage(this.backgroundImage);
    }
    const pipeline = this.pipeline;
    if (!pipeline?.ready) return null;

    const width = Math.max(1, Math.round(rect.width));
    const height = Math.max(1, Math.round(rect.height));
    if (pipeline.canvas.width !== width) pipeline.canvas.width = width;
    if (pipeline.canvas.height !== height) pipeline.canvas.height = height;
    pipeline.render(camera.image as CameraFrameSource, camera, effects, performance.now());
    return pipeline.canvas;
  }

  private shapePath(shape: BubbleShape, rect: Rect): Path2D {
    const path = new Path2D();
    if (shape.kind === "roundRect") {
      path.roundRect(
        rect.x,
        rect.y,
        rect.width,
        rect.height,
        shape.radius * Math.min(rect.width, rect.height),
      );
      return path;
    }
    let unit = this.unitPaths.get(shape.d);
    if (!unit) {
      unit = new Path2D(shape.d);
      this.unitPaths.set(shape.d, unit);
    }
    path.addPath(
      unit,
      new DOMMatrix().translateSelf(rect.x, rect.y).scaleSelf(rect.width, rect.height),
    );
    return path;
  }
}
