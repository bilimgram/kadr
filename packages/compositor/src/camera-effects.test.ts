import { describe, expect, it } from "vitest";
import {
  BACKGROUND_PRESETS,
  CAMERA_BACKGROUND_MODES,
  DEFAULT_CAMERA_BACKGROUND,
  findBackgroundPreset,
  hexToRgb,
} from "./background";
import { needsSegmentation, resolveBackground } from "./camera-pipeline";
import {
  DEFAULT_FACE_REGION,
  faceLuma,
  NEUTRAL_GAINS,
  NEUTRAL_TONE,
  smoothGains,
  smoothTone,
  toneForLuma,
  whiteBalanceGains,
} from "./light";
import {
  blendMasks,
  estimateFaceRegion,
  maskCoverage,
  maskFromConfidence,
  type PersonMask,
  removeMaskIslands,
  sampleMaskGrid,
} from "./mask";

/** A head-and-shoulders silhouette: an ellipse head on a wider body, like a webcam frame. */
function silhouette(width: number, height: number, centerX = 0.5): PersonMask {
  const data = new Uint8Array(width * height);
  const headCx = centerX * width;
  const headCy = 0.35 * height;
  const headRx = 0.1 * width;
  const headRy = 0.2 * height;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const inHead = ((x - headCx) / headRx) ** 2 + ((y - headCy) / headRy) ** 2 <= 1;
      const inBody = y >= 0.58 * height && Math.abs(x - headCx) <= 0.28 * width;
      data[y * width + x] = inHead || inBody ? 255 : 0;
    }
  }
  return { width, height, data };
}

describe("person masks", () => {
  it("converts model confidences and reuses the buffer", () => {
    const first = maskFromConfidence(new Float32Array([0, 0.5, 1, 2, -1, 0.25]), 3, 2);
    expect([...first.data]).toEqual([0, 128, 255, 255, 0, 64]);
    const second = maskFromConfidence(new Float32Array(6).fill(1), 3, 2, first);
    expect(second).toBe(first);
    expect(maskFromConfidence(new Float32Array(4), 2, 2, first)).not.toBe(first);
  });

  it("smooths flicker but follows real movement at once", () => {
    const previous: PersonMask = { width: 2, height: 1, data: new Uint8Array([200, 0]) };
    const next: PersonMask = { width: 2, height: 1, data: new Uint8Array([180, 255]) };
    const blended = blendMasks(previous, next);
    // A small change is damped…
    expect(blended.data[0]).toBeGreaterThan(180);
    expect(blended.data[0]).toBeLessThan(200);
    // …a person moving into a pixel shows immediately.
    expect(blended.data[1]).toBe(255);
  });

  it("starts fresh when there is no previous mask or the size changed", () => {
    const next: PersonMask = { width: 1, height: 1, data: new Uint8Array([77]) };
    const fresh = blendMasks(null, next);
    expect(fresh.data[0]).toBe(77);
    expect(fresh.data).not.toBe(next.data);
    expect(blendMasks({ width: 2, height: 1, data: new Uint8Array(2) }, next).width).toBe(1);
  });

  it("measures coverage and resamples onto a coarser grid", () => {
    const mask = silhouette(64, 64);
    expect(maskCoverage(mask)).toBeGreaterThan(0.2);
    expect(maskCoverage(mask)).toBeLessThan(0.5);
    const grid = sampleMaskGrid(mask, 8, 8);
    expect(grid).toHaveLength(64);
    expect(grid[7 * 8 + 4]).toBe(255); // bottom middle: body
    expect(grid[0]).toBe(0); // top left: background
  });
});

describe("mask islands", () => {
  it("drops small specks away from the person but keeps a second person", () => {
    const mask = silhouette(64, 64, 0.35);
    // A speck (a lamp or poster) in the top right corner, with a soft edge…
    for (const [x, y, v] of [
      [58, 4, 255],
      [59, 4, 255],
      [58, 5, 255],
      [60, 4, 90],
    ] as const) {
      mask.data[y * 64 + x] = v;
    }
    removeMaskIslands(mask);
    expect(mask.data[4 * 64 + 58]).toBe(0);
    expect(mask.data[4 * 64 + 60]).toBe(0);
    expect(mask.data[40 * 64 + Math.round(0.35 * 64)]).toBe(255);

    // …while two people of similar size both stay.
    const two = silhouette(64, 64, 0.25);
    const other = silhouette(64, 64, 0.75);
    for (let i = 0; i < two.data.length; i++) {
      two.data[i] = Math.max(two.data[i] ?? 0, other.data[i] ?? 0);
    }
    const before = maskCoverage(two);
    removeMaskIslands(two);
    expect(maskCoverage(two)).toBe(before);
  });
});

describe("face region from the mask", () => {
  it("finds the face at the top of a centred silhouette", () => {
    const face = estimateFaceRegion(silhouette(128, 128));
    expect(face).not.toBeNull();
    if (!face) return;
    const centerX = face.x + face.width / 2;
    expect(centerX).toBeCloseTo(0.5, 1);
    // The head spans 15%–55% of the frame height; the face sits inside it.
    expect(face.y).toBeGreaterThan(0.15);
    expect(face.y + face.height).toBeLessThan(0.75);
    expect(face.width).toBeLessThan(0.3);
  });

  it("follows the person off-centre", () => {
    const face = estimateFaceRegion(silhouette(128, 128, 0.72));
    expect(face && face.x + face.width / 2).toBeCloseTo(0.72, 1);
  });

  it("returns null when nobody is in the frame", () => {
    expect(estimateFaceRegion({ width: 16, height: 16, data: new Uint8Array(256) })).toBeNull();
    expect(estimateFaceRegion({ width: 0, height: 0, data: new Uint8Array(0) })).toBeNull();
  });
});

describe("light metering with a person mask", () => {
  it("ignores a skin-coloured wall that the person mask excludes", () => {
    const width = 32;
    const height = 18;
    const rgba = new Uint8ClampedArray(width * height * 4);
    const person = new Uint8Array(width * height);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const i = (y * width + x) * 4;
        const onPerson = x >= 12 && x < 20;
        // Dark face on the person; a bright beige wall (also "skin-coloured") everywhere else.
        const [r, g, b] = onPerson ? [90, 62, 50] : [230, 190, 160];
        rgba.set([r, g, b, 255], i);
        person[y * width + x] = onPerson ? 255 : 0;
      }
    }
    const wide = { x: 0.1, y: 0.1, width: 0.8, height: 0.8 };
    const withMask = faceLuma(rgba, width, height, wide, person);
    const withoutMask = faceLuma(rgba, width, height, wide);
    expect(withMask).toBeLessThan(0.3);
    expect(withoutMask).toBeGreaterThan(withMask);
  });
});

describe("tone curve", () => {
  it("restores more contrast the more it lifts, and none when neutral", () => {
    expect(NEUTRAL_TONE.contrast).toBe(1);
    expect(toneForLuma(0.15).contrast).toBeGreaterThan(toneForLuma(0.6).contrast);
    expect(toneForLuma(0.6).contrast).toBeGreaterThan(1);
    expect(smoothTone(NEUTRAL_TONE, toneForLuma(0.15), 0.5).contrast).toBeGreaterThan(1);
  });
});

describe("white balance", () => {
  const frame = (r: number, g: number, b: number, count = 400) => {
    const rgba = new Uint8ClampedArray(count * 4);
    for (let i = 0; i < count; i++) rgba.set([r, g, b, 255], i * 4);
    return rgba;
  };
  const luma = (gains: readonly number[]) =>
    0.2126 * (gains[0] ?? 0) + 0.7152 * (gains[1] ?? 0) + 0.0722 * (gains[2] ?? 0);

  it("cools a warm cast on neutral surfaces without changing brightness", () => {
    const gains = whiteBalanceGains(frame(200, 175, 150));
    expect(gains[2]).toBeGreaterThan(gains[0]);
    expect(luma(gains)).toBeCloseTo(1, 5);
  });

  it("warms a blue cast", () => {
    const gains = whiteBalanceGains(frame(150, 170, 200));
    expect(gains[0]).toBeGreaterThan(gains[2]);
  });

  it("leaves neutral frames, skin-only frames and dark frames alone", () => {
    expect(whiteBalanceGains(frame(128, 128, 128))).toEqual(
      expect.arrayContaining([expect.closeTo(1, 5)]),
    );
    expect(whiteBalanceGains(frame(200, 140, 110))).toEqual(NEUTRAL_GAINS); // saturated skin
    expect(whiteBalanceGains(frame(10, 10, 12))).toEqual(NEUTRAL_GAINS); // too dark to tell
  });

  it("never pushes a channel far enough to turn skin grey", () => {
    const gains = whiteBalanceGains(frame(230, 180, 120), 1);
    for (const gain of gains) {
      expect(gain).toBeGreaterThan(0.8);
      expect(gain).toBeLessThan(1.25);
    }
  });

  it("eases gains", () => {
    expect(smoothGains([1, 1, 1], [1.2, 1, 0.8], 0.5)).toEqual([1.1, 1, 0.9]);
  });
});

describe("backgrounds", () => {
  it("parses preset colours and resolves unknown presets to the first", () => {
    expect(hexToRgb("#ff0000")).toEqual([1, 0, 0]);
    expect(hexToRgb("#0f0")).toEqual([0, 1, 0]);
    expect(hexToRgb("nope")).toEqual([0, 0, 0]);
    expect(findBackgroundPreset("missing")).toBe(BACKGROUND_PRESETS[0]);
    for (const preset of BACKGROUND_PRESETS) {
      expect(preset.top).toMatch(/^#[0-9a-f]{6}$/);
      expect(preset.bottom).toMatch(/^#[0-9a-f]{6}$/);
    }
  });

  it("needs the mask for anything but the plain camera without touch-up", () => {
    const base = { touchUp: false, mirror: true, background: DEFAULT_CAMERA_BACKGROUND };
    expect(needsSegmentation(base)).toBe(false);
    expect(needsSegmentation({ ...base, touchUp: true })).toBe(true);
    for (const mode of CAMERA_BACKGROUND_MODES.filter((m) => m !== "none")) {
      expect(needsSegmentation({ ...base, background: { ...base.background, mode } })).toBe(true);
    }
  });

  it("resolves a background for the shader", () => {
    const resolved = resolveBackground({ mode: "color", blur: 0.3, presetId: "ocean" });
    expect(resolved.mode).toBe("color");
    expect(resolved.top).toEqual(hexToRgb("#3b82c4"));
  });

  it("keeps the default face region inside the frame", () => {
    expect(DEFAULT_FACE_REGION.x + DEFAULT_FACE_REGION.width).toBeLessThanOrEqual(1);
  });
});
