import { BubbleShapeId } from "@kadr/project-format";
import { describe, expect, it } from "vitest";
import {
  BUBBLE_SIZE_PRESETS,
  bubbleRect,
  DEFAULT_BUBBLE_LAYOUT,
  fitContain,
  fitCover,
  hitTestBubble,
  moveBubble,
} from "./layout";
import {
  faceLuma,
  isSkinTone,
  meanLuma,
  NEUTRAL_TONE,
  smoothTone,
  TARGET_FACE_LUMA,
  toneCssFilter,
  toneForLuma,
} from "./light";
import { BUBBLE_SHAPE_IDS, BUBBLE_SHAPES } from "./shapes";

const frame = { width: 1920, height: 1080 };

describe("shapes", () => {
  it("defines every shape id from the project format", () => {
    expect([...BUBBLE_SHAPE_IDS].sort()).toEqual([...BubbleShapeId.options].sort());
    for (const id of BUBBLE_SHAPE_IDS) expect(BUBBLE_SHAPES[id].id).toBe(id);
  });

  it("keeps path shapes inside the unit box", () => {
    for (const shape of Object.values(BUBBLE_SHAPES)) {
      if (shape.kind !== "path") continue;
      const numbers = shape.d.match(/-?\d*\.?\d+/g)?.map(Number) ?? [];
      // Arc flags and radii are also numbers in [0, 1], so a simple range check covers all of them.
      expect(numbers.every((n) => n >= 0 && n <= 1)).toBe(true);
      expect(shape.d.trim().endsWith("Z")).toBe(true);
    }
  });
});

describe("bubbleRect", () => {
  it("sizes the bubble from the frame height and the shape's aspect ratio", () => {
    const circle = bubbleRect({ ...DEFAULT_BUBBLE_LAYOUT, center: { x: 0.5, y: 0.5 } }, frame);
    expect(circle.height).toBeCloseTo(BUBBLE_SIZE_PRESETS.medium * 1080);
    expect(circle.width).toBeCloseTo(circle.height);

    const card = bubbleRect({ ...DEFAULT_BUBBLE_LAYOUT, shape: "card" }, frame);
    expect(card.width / card.height).toBeCloseTo(16 / 9);
  });

  it("keeps the bubble fully inside the frame", () => {
    const r = bubbleRect({ ...DEFAULT_BUBBLE_LAYOUT, center: { x: 1, y: 1 } }, frame);
    expect(r.x + r.width).toBeCloseTo(frame.width);
    expect(r.y + r.height).toBeCloseTo(frame.height);
  });
});

describe("fit helpers", () => {
  it("letterboxes with fitContain", () => {
    expect(fitContain({ width: 1000, height: 1000 }, frame)).toEqual({
      x: 420,
      y: 0,
      width: 1080,
      height: 1080,
    });
  });

  it("crops the center with fitCover", () => {
    expect(fitCover({ width: 1280, height: 720 }, { width: 200, height: 200 })).toEqual({
      x: 280,
      y: 0,
      width: 720,
      height: 720,
    });
  });
});

describe("dragging", () => {
  it("moves and hit-tests the bubble in frame pixels", () => {
    const moved = moveBubble(DEFAULT_BUBBLE_LAYOUT, { x: 960, y: 540 }, frame);
    expect(moved.center).toEqual({ x: 0.5, y: 0.5 });
    expect(hitTestBubble(moved, { x: 960, y: 540 }, frame)).toBe(true);
    expect(hitTestBubble(moved, { x: 10, y: 10 }, frame)).toBe(false);
  });
});

describe("light correction", () => {
  it("lifts a dark face to the target and only gently lifts well-lit faces", () => {
    const dark = toneForLuma(0.3);
    expect(0.3 ** dark.gamma).toBeCloseTo(TARGET_FACE_LUMA, 2);
    expect(dark.saturation).toBeGreaterThan(1.05);

    const bright = toneForLuma(0.7);
    expect(bright.gamma).toBeCloseTo(0.88);
    expect(bright.gamma).toBeLessThan(1);
    expect(dark.denoise).toBeGreaterThan(bright.denoise);
  });

  it("caps the lift for near-black frames", () => {
    expect(toneForLuma(0).gamma).toBeCloseTo(0.45);
    expect(toneForLuma(Number.NaN).gamma).toBeCloseTo(0.45);
  });

  /** A 48×27 frame: `background` everywhere, a `face` ellipse in the middle, a dark shirt below. */
  function backlitFrame(background: RGB, face: RGB, faceCenterX = 0.5) {
    const width = 48;
    const height = 27;
    const rgba = new Uint8ClampedArray(width * height * 4);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const u = (x + 0.5) / width;
        const v = (y + 0.5) / height;
        const inFace = ((u - faceCenterX) / 0.15) ** 2 + ((v - 0.45) / 0.33) ** 2 <= 1;
        const color = inFace ? face : v > 0.8 ? ([40, 40, 48] as RGB) : background;
        rgba.set([...color, 255], (y * width + x) * 4);
      }
    }
    return { rgba, width, height };
  }
  type RGB = [number, number, number];
  const face: RGB = [70, 52, 45];
  const faceLumaValue = (0.2126 * 70 + 0.7152 * 52 + 0.0722 * 45) / 255;

  it("meters the face, not the bright background behind it", () => {
    const { rgba, width, height } = backlitFrame([205, 210, 215], face);
    expect(meanLuma(rgba)).toBeGreaterThan(0.6);
    expect(faceLuma(rgba, width, height)).toBeCloseTo(faceLumaValue, 2);
  });

  it("isn't fooled by a skin-coloured (beige) wall", () => {
    const { rgba, width, height } = backlitFrame([225, 205, 175], face);
    expect(isSkinTone(225, 205, 175)).toBe(true);
    expect(faceLuma(rgba, width, height)).toBeLessThan(faceLumaValue + 0.05);
  });

  it("follows a detected face away from the centre", () => {
    const { rgba, width, height } = backlitFrame([205, 210, 215], face, 0.25);
    const detected = { x: 0.1, y: 0.12, width: 0.3, height: 0.66 };
    expect(faceLuma(rgba, width, height, detected)).toBeCloseTo(faceLumaValue, 2);
  });

  it("recognises skin tones across the range but not grey or blue", () => {
    for (const skin of [
      [255, 224, 196],
      [224, 172, 138],
      [141, 85, 54],
      [70, 45, 35],
    ] as RGB[]) {
      expect(isSkinTone(...skin)).toBe(true);
    }
    expect(isSkinTone(128, 128, 128)).toBe(false);
    expect(isSkinTone(60, 90, 160)).toBe(false);
  });

  it("eases tone changes and falls back to a CSS filter", () => {
    const eased = smoothTone(NEUTRAL_TONE, toneForLuma(0.2), 0.5);
    expect(eased.gamma).toBeGreaterThan(toneForLuma(0.2).gamma);
    expect(eased.gamma).toBeLessThan(1);
    expect(toneCssFilter(NEUTRAL_TONE, 0.5)).toBe("none");
    expect(toneCssFilter(toneForLuma(0.3), 0.3)).toContain("brightness(");
  });
});
