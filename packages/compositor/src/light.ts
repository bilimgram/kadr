/**
 * Camera light correction ("touch-up"). Webcams in typical indoor light underexpose faces, often
 * because a bright window or wall behind the person dominates the camera's own metering.
 *
 * 1. Meter the face, not the frame (`faceLuma`): skin-coloured pixels on the person, around the
 *    face found in the person mask (mask.ts) or, without one, where a face usually sits in a webcam
 *    frame. A bright window or a beige wall behind the person never counts.
 * 2. Pick a tone curve that maps that luminance onto a comfortable target (`toneForLuma`): a
 *    luminance gamma lifts shadows and midtones a lot and highlights barely, so nothing clips, and
 *    a gentle S-curve gives back the contrast that lifting takes away. Touch-up always adds a light
 *    lift and skin smoothing.
 * 3. Correct colour casts from warm bulbs or blue daylight (`whiteBalanceGains`), measured on
 *    near-neutral surfaces so skin tone itself never drives it.
 * 4. Render it on the GPU (`CameraEnhancer`): edge-preserving smoothing (which also hides the sensor
 *    noise that lifting reveals), and with a person mask the person gets the full lift while the
 *    background gets only part of it, which separates the speaker from the room like a key light.
 *
 * The desktop bubble and the web compositor use the same code, so preview and recording match.
 */

/** Target luminance (0..1) for the metered face. */
export const TARGET_FACE_LUMA = 0.56;
/** Strongest lift (luma gamma) for very dark faces; caps noise amplification. */
const MIN_GAMMA = 0.45;
/** Gentlest lift, applied even to well-lit faces while touch-up is on. */
const MAX_GAMMA = 0.88;

export interface ToneParams {
  /** Luminance gamma: 1 leaves the image unchanged, < 1 lifts shadows and midtones. */
  gamma: number;
  /** Saturation multiplier applied after lifting. */
  saturation: number;
  /** Edge-preserving smoothing strength, 0..1 (skin smoothing and denoise). */
  denoise: number;
  /** Warm shift for skin tones, 0..1. */
  warmth: number;
  /** S-curve strength after lifting: 1 is none; ~1.1 restores the punch a strong lift flattens. */
  contrast: number;
}

export const NEUTRAL_TONE: ToneParams = {
  gamma: 1,
  saturation: 1,
  denoise: 0,
  warmth: 0,
  contrast: 1,
};

/** Tone curve that brings the metered face luminance up to the target. Never darkens. */
export function toneForLuma(meteredLuma: number, target = TARGET_FACE_LUMA): ToneParams {
  const luma = Math.min(0.98, Math.max(0.02, Number.isFinite(meteredLuma) ? meteredLuma : 0.02));
  // Solve luma^gamma = target; faces already at or above the target get the gentle baseline lift.
  const gamma = Math.min(MAX_GAMMA, Math.max(MIN_GAMMA, Math.log(target) / Math.log(luma)));
  const lift = (MAX_GAMMA - gamma) / (MAX_GAMMA - MIN_GAMMA); // 0 (baseline) … 1 (maximum)
  return {
    gamma,
    saturation: 1.05 + 0.13 * lift,
    denoise: 0.35 + 0.4 * lift,
    warmth: 0.25 + 0.45 * lift,
    contrast: 1.03 + 0.09 * lift,
  };
}

/** Eases tone parameters towards a new target so exposure never jumps visibly. */
export function smoothTone(current: ToneParams, target: ToneParams, amount = 0.25): ToneParams {
  const ease = (a: number, b: number) => a + (b - a) * amount;
  return {
    gamma: ease(current.gamma, target.gamma),
    saturation: ease(current.saturation, target.saturation),
    denoise: ease(current.denoise, target.denoise),
    warmth: ease(current.warmth, target.warmth),
    contrast: ease(current.contrast, target.contrast),
  };
}

/** Rec. 709 luma (0..255) of one RGB pixel. */
function luma709(r: number, g: number, b: number): number {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Average Rec. 709 luminance (0..1) of RGBA pixel data. */
export function meanLuma(rgba: Uint8ClampedArray): number {
  let sum = 0;
  for (let i = 0; i < rgba.length; i += 4) {
    sum += luma709(rgba[i] ?? 0, rgba[i + 1] ?? 0, rgba[i + 2] ?? 0);
  }
  const pixels = rgba.length / 4;
  return pixels > 0 ? sum / pixels / 255 : 0;
}

/**
 * Chroma-only skin classifier (YCbCr ranges from Chai & Ngan, 1999). It ignores brightness, so it
 * matches skin in shadow as well as in light, across skin tones.
 */
export function isSkinTone(r: number, g: number, b: number): boolean {
  const cb = 128 - 0.168736 * r - 0.331264 * g + 0.5 * b;
  const cr = 128 + 0.5 * r - 0.418688 * g - 0.081312 * b;
  return cb >= 77 && cb <= 127 && cr >= 133 && cr <= 173;
}

/** A face box in normalized frame coordinates (0..1), e.g. from a face tracker. */
export interface FaceRegion {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Where a face usually is in a webcam frame: centred, slightly above the middle. */
export const DEFAULT_FACE_REGION: FaceRegion = { x: 0.34, y: 0.15, width: 0.32, height: 0.6 };

/** Below this share of the metering weight, too little skin is visible to trust it. */
const MIN_SKIN_SHARE = 0.08;
/** Meter slightly below the median so the shadowed side of the face counts. */
const FACE_QUANTILE = 0.4;

/** Weighted quantile of `[value, weight]` samples. */
function weightedQuantile(samples: Array<[number, number]>, quantile: number): number {
  if (samples.length === 0) return 0;
  samples.sort((a, b) => a[0] - b[0]);
  let total = 0;
  for (const [, weight] of samples) total += weight;
  let seen = 0;
  for (const [value, weight] of samples) {
    seen += weight;
    if (seen >= total * quantile) return value;
  }
  return samples[samples.length - 1]?.[0] ?? 0;
}

/**
 * Face luminance (0..1) of RGBA pixel data: a Gaussian weight around `face` (sigma = half the
 * box), counting only skin-coloured pixels when enough are visible and falling back to all pixels
 * near the face otherwise. A low quantile instead of the mean keeps a bright window, lamp or wall
 * beside the face from pulling the reading up. `person` (one value per pixel, 0..255, e.g. from
 * `sampleMaskGrid`) restricts metering to the person.
 */
export function faceLuma(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  face: FaceRegion = DEFAULT_FACE_REGION,
  person?: Uint8Array,
): number {
  const centerX = face.x + face.width / 2;
  const centerY = face.y + face.height / 2;
  const sigmaX = Math.max(0.04, face.width / 2);
  const sigmaY = Math.max(0.04, face.height / 2);
  const all: Array<[number, number]> = [];
  const skin: Array<[number, number]> = [];
  let allWeight = 0;
  let skinWeight = 0;

  for (let y = 0; y < height; y++) {
    const dy = ((y + 0.5) / height - centerY) / sigmaY;
    for (let x = 0; x < width; x++) {
      const dx = ((x + 0.5) / width - centerX) / sigmaX;
      if (person && (person[y * width + x] ?? 0) < 128) continue;
      const weight = Math.exp(-(dx * dx + dy * dy) / 2);
      if (weight < 0.01) continue;
      const i = (y * width + x) * 4;
      const r = rgba[i] ?? 0;
      const g = rgba[i + 1] ?? 0;
      const b = rgba[i + 2] ?? 0;
      const luma = luma709(r, g, b);
      all.push([luma, weight]);
      allWeight += weight;
      // Near-black and blown-out pixels have no reliable chroma.
      if (luma > 10 && luma < 248 && isSkinTone(r, g, b)) {
        skin.push([luma, weight]);
        skinWeight += weight;
      }
    }
  }
  if (allWeight === 0) return 0;
  const samples = skinWeight >= allWeight * MIN_SKIN_SHARE ? skin : all;
  return weightedQuantile(samples, FACE_QUANTILE) / 255;
}

/** Per-channel gains that neutralize a colour cast, normalized to keep brightness. */
export type RgbGains = [number, number, number];

export const NEUTRAL_GAINS: RgbGains = [1, 1, 1];

/** How far gains may move from 1: enough for warm bulbs, never enough to turn skin grey. */
const GAIN_LIMITS = { min: 0.86, max: 1.18 };
/** Below this share of near-neutral pixels there is nothing reliable to balance on. */
const MIN_NEUTRAL_SHARE = 0.05;

/**
 * White-balance gains from near-neutral pixels (walls, ceilings, shirts): their average should be
 * grey, so their tint is the light's tint. Skin is too saturated to qualify, so it never drives the
 * correction, whatever the skin tone. `strength` applies part of the correction, because webcams
 * already balance and a fully corrected warm room looks clinical.
 */
export function whiteBalanceGains(rgba: Uint8ClampedArray, strength = 0.6): RgbGains {
  let r = 0;
  let g = 0;
  let b = 0;
  let neutral = 0;
  let usable = 0;
  for (let i = 0; i < rgba.length; i += 4) {
    const red = rgba[i] ?? 0;
    const green = rgba[i + 1] ?? 0;
    const blue = rgba[i + 2] ?? 0;
    const luma = luma709(red, green, blue);
    if (luma < 30 || luma > 235) continue;
    usable++;
    const max = Math.max(red, green, blue);
    const min = Math.min(red, green, blue);
    if (max === 0 || (max - min) / max > 0.3) continue;
    r += red;
    g += green;
    b += blue;
    neutral++;
  }
  if (neutral < 20 || neutral < usable * MIN_NEUTRAL_SHARE || r === 0 || g === 0 || b === 0) {
    return [...NEUTRAL_GAINS];
  }
  const grey = (r + g + b) / 3;
  const limit = (gain: number) =>
    Math.min(GAIN_LIMITS.max, Math.max(GAIN_LIMITS.min, 1 + (gain - 1) * strength));
  const gains: RgbGains = [limit(grey / r), limit(grey / g), limit(grey / b)];
  // Keep luminance unchanged; the tone curve owns brightness.
  const luma = 0.2126 * gains[0] + 0.7152 * gains[1] + 0.0722 * gains[2];
  return [gains[0] / luma, gains[1] / luma, gains[2] / luma];
}

/** Eases white-balance gains so the camera's own white balance never makes colours jump. */
export function smoothGains(current: RgbGains, target: RgbGains, amount = 0.15): RgbGains {
  return [
    current[0] + (target[0] - current[0]) * amount,
    current[1] + (target[1] - current[1]) * amount,
    current[2] + (target[2] - current[2]) * amount,
  ];
}

/** One light measurement of a camera frame. */
export interface LightReading {
  /** Face luminance, 0..1. */
  luma: number;
  whiteBalance: RgbGains;
}

type SampleContext = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

/** Samples a camera frame at low resolution and meters it. Cheap enough to run several times a second. */
export class LightMeter {
  private readonly context: SampleContext | null;
  readonly width = 64;
  readonly height = 36;

  constructor() {
    const canvas =
      typeof OffscreenCanvas !== "undefined"
        ? new OffscreenCanvas(this.width, this.height)
        : Object.assign(document.createElement("canvas"), {
            width: this.width,
            height: this.height,
          });
    this.context = canvas.getContext("2d", { willReadFrequently: true }) as SampleContext | null;
  }

  /**
   * Meters the frame, or returns null if the source isn't ready yet. `face` (e.g. from
   * `estimateFaceRegion`) says where to meter, and `person` (a mask already sampled onto this
   * meter's grid with `sampleMaskGrid`) limits metering to the person.
   */
  measure(
    source: CanvasImageSource,
    face: FaceRegion = DEFAULT_FACE_REGION,
    person?: Uint8Array,
  ): LightReading | null {
    if (!this.context) return null;
    try {
      this.context.drawImage(source, 0, 0, this.width, this.height);
      const { data } = this.context.getImageData(0, 0, this.width, this.height);
      return {
        luma: faceLuma(data, this.width, this.height, face, person),
        whiteBalance: whiteBalanceGains(data),
      };
    } catch {
      return null;
    }
  }
}

/**
 * CSS-filter approximation of `tone`, for environments without WebGL. Coarser than the shader
 * (brightness clips highlights), so it is only a fallback.
 */
export function toneCssFilter(tone: ToneParams, meteredLuma: number): string {
  if (tone.gamma >= 0.999) return "none";
  const luma = Math.max(0.02, meteredLuma);
  const brightness = Math.min(1.8, luma ** tone.gamma / luma);
  return `brightness(${brightness.toFixed(3)}) saturate(${tone.saturation.toFixed(3)})`;
}
