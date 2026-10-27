import type { BubbleLayout } from "@kadr/project-format";
import { CameraEnhancer } from "./camera-enhancer";
import { bubbleRect, fitContain, fitCover, type Rect, type Size } from "./layout";
import { LightMeter, NEUTRAL_TONE, smoothTone, type ToneParams, toneForLuma } from "./light";
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
}

/** Re-measure camera brightness every N frames (~3 times per second at 30 fps). */
const LIGHT_SAMPLE_INTERVAL = 10;

type Context2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

/**
 * Draws the screen (letterboxed) and the shaped camera bubble into a canvas. Works with
 * `HTMLCanvasElement` and `OffscreenCanvas`, so it can run on the main thread or in a worker.
 */
export class Compositor {
  private readonly ctx: Context2D;
  private readonly unitPaths = new Map<string, Path2D>();
  private lightMeter: LightMeter | null = null;
  /** undefined until first use; null when WebGL2 is unavailable. */
  private enhancer: CameraEnhancer | null | undefined;
  private tone: ToneParams = NEUTRAL_TONE;
  private targetTone: ToneParams = NEUTRAL_TONE;
  private frameCount = 0;

  constructor(
    private readonly canvas: HTMLCanvasElement | OffscreenCanvas,
    private readonly options: CompositorOptions = {},
  ) {
    const ctx = canvas.getContext("2d", { alpha: false, desynchronized: true });
    if (!ctx) throw new Error("Canvas 2D context is not available");
    this.ctx = ctx as Context2D;
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

    ctx.save();
    if (this.options.shadow ?? true) {
      ctx.shadowColor = "rgba(0, 0, 0, 0.35)";
      ctx.shadowBlur = rect.height * 0.06;
      ctx.fillStyle = "#000000";
      ctx.fill(path);
      ctx.shadowColor = "transparent";
    }
    ctx.clip(path);
    const enhanced = this.options.autoLight ? this.enhance(camera, rect, layout.mirror) : null;
    if (enhanced) {
      // Already cropped, mirrored and light-corrected on the GPU.
      ctx.drawImage(enhanced, rect.x, rect.y, rect.width, rect.height);
      ctx.restore();
      this.strokeBorder(path, layout);
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

  /** Renders the light-corrected camera at the bubble's size, or null to draw it unprocessed. */
  private enhance(camera: VideoSource, rect: Rect, mirror: boolean): CanvasImageSource | null {
    if (this.enhancer === undefined) {
      const canvas =
        typeof OffscreenCanvas !== "undefined"
          ? new OffscreenCanvas(1, 1)
          : document.createElement("canvas");
      this.enhancer = CameraEnhancer.create(canvas);
    }
    const enhancer = this.enhancer;
    if (!enhancer?.ready || camera.width === 0) return null;

    const width = Math.max(1, Math.round(rect.width));
    const height = Math.max(1, Math.round(rect.height));
    if (enhancer.canvas.width !== width) enhancer.canvas.width = width;
    if (enhancer.canvas.height !== height) enhancer.canvas.height = height;

    if (this.frameCount++ % LIGHT_SAMPLE_INTERVAL === 0) {
      this.lightMeter ??= new LightMeter();
      const luma = this.lightMeter.measure(camera.image);
      if (luma !== null) this.targetTone = toneForLuma(luma);
    }
    this.tone = smoothTone(this.tone, this.targetTone, 0.12);
    enhancer.render(camera.image as TexImageSource, camera, { ...this.tone, mirror });
    return enhancer.canvas;
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
