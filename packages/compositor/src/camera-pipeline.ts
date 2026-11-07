import {
  type CameraBackground,
  type CameraEffects,
  findBackgroundPreset,
  hexToRgb,
} from "./background";
import { type BackgroundRender, CameraEnhancer } from "./camera-enhancer";
import type { Size } from "./layout";
import {
  DEFAULT_FACE_REGION,
  LightMeter,
  NEUTRAL_GAINS,
  NEUTRAL_TONE,
  type RgbGains,
  smoothGains,
  smoothTone,
  type ToneParams,
  toneForLuma,
} from "./light";
import { estimateFaceRegion, type PersonMask, sampleMaskGrid } from "./mask";
import type { PersonSegmenter } from "./segmentation";

/** Anything that is both a texture source and a canvas image source. */
export type CameraFrameSource =
  | HTMLVideoElement
  | HTMLCanvasElement
  | OffscreenCanvas
  | ImageBitmap
  | VideoFrame;

/**
 * Share of the person's lift the room behind them gets when touch-up is on: the room still looks
 * natural, and the person stands out from it like under a key light.
 */
const BACKGROUND_LIFT = 0.45;
/** Re-meter the face this often; tone changes ease in between. */
const METER_INTERVAL_MS = 250;
/** Above this average segmentation time, segment every other frame (the mask moves little). */
const SLOW_SEGMENTATION_MS = 14;

/** Whether these effects need the person mask. */
export function needsSegmentation(effects: CameraEffects): boolean {
  return effects.touchUp || effects.background.mode !== "none";
}

/** Resolves a background setting into colours the shader can use. */
export function resolveBackground(background: CameraBackground): BackgroundRender {
  const preset = findBackgroundPreset(background.presetId);
  return {
    mode: background.mode,
    blur: background.blur,
    top: hexToRgb(preset.top),
    bottom: hexToRgb(preset.bottom),
  };
}

/**
 * The camera pipeline shared by the desktop bubble, camera-only recordings and the web compositor:
 * person segmentation (optional, see `setSegmenter`), face metering, smoothed tone and white
 * balance, and GPU rendering with the chosen background. Returns null from `create` without WebGL2.
 */
export class CameraPipeline {
  private segmenter: PersonSegmenter | null = null;
  private mask: PersonMask | null = null;
  private readonly meter = new LightMeter();
  private tone: ToneParams = NEUTRAL_TONE;
  private targetTone: ToneParams = NEUTRAL_TONE;
  private gains: RgbGains = NEUTRAL_GAINS;
  private targetGains: RgbGains = NEUTRAL_GAINS;
  private lastMeteredAt = Number.NEGATIVE_INFINITY;
  private segmentationMs = 0;
  private frame = 0;

  private constructor(readonly enhancer: CameraEnhancer) {}

  static create(canvas: HTMLCanvasElement | OffscreenCanvas): CameraPipeline | null {
    const enhancer = CameraEnhancer.create(canvas);
    return enhancer ? new CameraPipeline(enhancer) : null;
  }

  get canvas(): HTMLCanvasElement | OffscreenCanvas {
    return this.enhancer.canvas;
  }

  /** False after the GPU context was lost; callers should fall back to the raw video. */
  get ready(): boolean {
    return this.enhancer.ready;
  }

  /** The segmenter to use from now on (not owned: the caller closes it). */
  setSegmenter(segmenter: PersonSegmenter | null): void {
    this.segmenter = segmenter;
    if (!segmenter) this.clearMask();
  }

  /** The image for the "image" background (not owned: the caller closes it). */
  setBackgroundImage(image: ImageBitmap | null): void {
    this.enhancer.setBackgroundImage(image, image ?? { width: 0, height: 0 });
  }

  /** Renders one camera frame into the canvas. `nowMs` is a monotonic timestamp of the frame. */
  render(source: CameraFrameSource, size: Size, effects: CameraEffects, nowMs: number): void {
    if (!this.ready || size.width === 0 || size.height === 0) return;

    if (needsSegmentation(effects) && this.segmenter) {
      if (this.segmentationMs < SLOW_SEGMENTATION_MS || this.frame % 2 === 0) {
        const started = performance.now();
        const mask = this.segmenter.segment(source, nowMs);
        this.segmentationMs = this.segmentationMs * 0.9 + (performance.now() - started) * 0.1;
        if (mask) {
          this.mask = mask;
          this.enhancer.setMask(mask);
        }
      }
    } else {
      this.clearMask();
    }
    this.frame++;

    if (!effects.touchUp) {
      this.targetTone = NEUTRAL_TONE;
      this.targetGains = NEUTRAL_GAINS;
    } else if (nowMs - this.lastMeteredAt >= METER_INTERVAL_MS) {
      this.lastMeteredAt = nowMs;
      const face = this.mask ? estimateFaceRegion(this.mask) : null;
      const person =
        this.mask && face
          ? sampleMaskGrid(this.mask, this.meter.width, this.meter.height)
          : undefined;
      const reading = this.meter.measure(source, face ?? DEFAULT_FACE_REGION, person);
      if (reading) {
        this.targetTone = toneForLuma(reading.luma);
        this.targetGains = reading.whiteBalance;
      }
    }
    this.tone = smoothTone(this.tone, this.targetTone, 0.12);
    this.gains = smoothGains(this.gains, this.targetGains, 0.12);

    this.enhancer.render(source, size, {
      ...this.tone,
      mirror: effects.mirror,
      whiteBalance: this.gains,
      backgroundLift: effects.touchUp ? BACKGROUND_LIFT : 1,
      background: resolveBackground(effects.background),
    });
  }

  /** Frees GPU resources (the segmenter and background image belong to the caller). */
  dispose(): void {
    this.enhancer.dispose();
  }

  private clearMask(): void {
    if (!this.mask) return;
    this.mask = null;
    this.enhancer.setMask(null);
  }
}
