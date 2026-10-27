import { describe, expect, it } from "vitest";
import {
  cropRect,
  fitInside,
  MIN_REGION_SIZE,
  moveRect,
  normalizeRegion,
  outputSize,
  pickScreenSource,
  rectFromDrag,
  resizeRect,
  resizeTo,
  restoreRegion,
  snapPoint,
  snapRect,
  withAspectRatio,
} from "./region";

const display = { x: 0, y: 0, width: 1920, height: 1080 };
const secondary = { x: 1920, y: -200, width: 1280, height: 1024 };

describe("drawing a selection", () => {
  it("spans the drag in any direction", () => {
    expect(rectFromDrag({ x: 100, y: 100 }, { x: 500, y: 400 }, display, null)).toEqual({
      x: 100,
      y: 100,
      width: 400,
      height: 300,
    });
    expect(rectFromDrag({ x: 500, y: 400 }, { x: 100, y: 100 }, display, null)).toEqual({
      x: 100,
      y: 100,
      width: 400,
      height: 300,
    });
  });

  it("stops at the display edges", () => {
    expect(rectFromDrag({ x: 1800, y: 1000 }, { x: 2500, y: 1400 }, display, null)).toEqual({
      x: 1800,
      y: 1000,
      width: 120,
      height: 80,
    });
  });

  it("keeps a locked aspect ratio, also when the edge cuts it short", () => {
    expect(rectFromDrag({ x: 0, y: 0 }, { x: 320, y: 50 }, display, 16 / 9)).toEqual({
      x: 0,
      y: 0,
      width: 320,
      height: 180,
    });
    const nearEdge = rectFromDrag({ x: 100, y: 900 }, { x: 1000, y: 1080 }, display, 16 / 9);
    expect(nearEdge.height).toBe(180);
    expect(nearEdge.width).toBe(320);
  });

  it("grows a tiny drag to the minimum size on release", () => {
    const rect = rectFromDrag({ x: 50, y: 50 }, { x: 60, y: 58 }, display, null, MIN_REGION_SIZE);
    expect(rect).toEqual({ x: 50, y: 50, width: MIN_REGION_SIZE, height: MIN_REGION_SIZE });
  });
});

describe("adjusting a selection", () => {
  const rect = { x: 400, y: 300, width: 400, height: 300 };

  it("resizes from a corner around the opposite corner", () => {
    expect(resizeRect(rect, "se", { x: 1000, y: 700 }, display, null)).toEqual({
      x: 400,
      y: 300,
      width: 600,
      height: 400,
    });
    expect(resizeRect(rect, "nw", { x: 300, y: 200 }, display, null)).toEqual({
      x: 300,
      y: 200,
      width: 500,
      height: 400,
    });
  });

  it("resizes from an edge without touching the other axis", () => {
    expect(resizeRect(rect, "e", { x: 900, y: 0 }, display, null)).toEqual({
      x: 400,
      y: 300,
      width: 500,
      height: 300,
    });
    expect(resizeRect(rect, "n", { x: 0, y: 100 }, display, null)).toEqual({
      x: 400,
      y: 100,
      width: 400,
      height: 500,
    });
  });

  it("grows the other axis around its centre when the ratio is locked", () => {
    const square = resizeRect(rect, "e", { x: 1000, y: 0 }, display, 1);
    expect(square).toEqual({ x: 400, y: 150, width: 600, height: 600 });
  });

  it("never shrinks below the minimum size", () => {
    const tiny = resizeRect(rect, "se", { x: 401, y: 301 }, display, null);
    expect(tiny.width).toBe(MIN_REGION_SIZE);
    expect(tiny.height).toBe(MIN_REGION_SIZE);
  });

  it("moves without leaving the display", () => {
    expect(moveRect(rect, 5000, -5000, display)).toEqual({
      x: 1520,
      y: 0,
      width: 400,
      height: 300,
    });
  });

  it("snaps to display edges while moving or dragging", () => {
    expect(snapRect({ x: 6, y: 300, width: 400, height: 300 }, display)).toMatchObject({ x: 0 });
    expect(snapRect({ x: 1515, y: 775, width: 400, height: 300 }, display)).toMatchObject({
      x: 1520,
      y: 780,
    });
    expect(snapPoint({ x: 1914, y: 5 }, display)).toEqual({ x: 1920, y: 0 });
    expect(snapPoint({ x: 500, y: 500 }, display)).toEqual({ x: 500, y: 500 });
  });

  it("switches aspect ratio around the centre, keeping roughly the area", () => {
    const wide = withAspectRatio({ x: 660, y: 240, width: 600, height: 600 }, 16 / 9, display);
    expect(wide.width / wide.height).toBeCloseTo(16 / 9);
    expect(wide.x + wide.width / 2).toBeCloseTo(960);
    expect(wide.y + wide.height / 2).toBeCloseTo(540);
    expect(wide.width * wide.height).toBeCloseTo(360_000);
    expect(withAspectRatio(rect, null, display)).toBe(rect);
  });

  it("takes typed-in sizes, clamped to the display", () => {
    expect(resizeTo(rect, 1280, 720, display)).toEqual({
      x: 400,
      y: 300,
      width: 1280,
      height: 720,
    });
    expect(resizeTo(rect, 9999, 10, display)).toEqual({
      x: 0,
      y: 300,
      width: 1920,
      height: MIN_REGION_SIZE,
    });
  });

  it("fits oversized rectangles inside", () => {
    expect(fitInside({ x: -10, y: -10, width: 3000, height: 50 }, display)).toEqual({
      x: 0,
      y: 0,
      width: 1920,
      height: 50,
    });
  });
});

describe("recording a region", () => {
  it("reports the video size in device pixels, rounded to even numbers", () => {
    expect(outputSize({ x: 0, y: 0, width: 1280, height: 720 }, 1)).toEqual({
      width: 1280,
      height: 720,
    });
    expect(outputSize({ x: 0, y: 0, width: 427, height: 241 }, 1.5)).toEqual({
      width: 640,
      height: 362,
    });
  });

  it("crops device pixels on even boundaries, inside the frame", () => {
    // 150% scaling: a 2880×1620 frame for a 1920×1080 DIP display.
    expect(
      cropRect({ x: 101, y: 51, width: 427, height: 241 }, display, { width: 2880, height: 1620 }),
    ).toEqual({ x: 150, y: 76, width: 640, height: 362 });
    // Regions on a secondary display are relative to that display's origin.
    expect(
      cropRect({ x: 2020, y: -100, width: 400, height: 300 }, secondary, {
        width: 1280,
        height: 1024,
      }),
    ).toEqual({ x: 100, y: 100, width: 400, height: 300 });
    // The whole display with an odd frame size never reaches past the frame.
    expect(cropRect(display, display, { width: 1365, height: 767 })).toEqual({
      x: 0,
      y: 0,
      width: 1364,
      height: 766,
    });
  });

  it("normalizes picker regions and rejects slivers or unknown displays", () => {
    const displays = [
      { id: 1, bounds: display },
      { id: 2, bounds: secondary },
    ];
    expect(
      normalizeRegion({ displayId: 2, x: 3000.4, y: 700.6, width: 400.2, height: 300 }, displays),
    ).toEqual({ displayId: 2, x: 2800, y: 524, width: 400, height: 300 });
    expect(normalizeRegion({ displayId: 1, x: 0, y: 0, width: 10, height: 300 }, displays)).toBe(
      null,
    );
    expect(normalizeRegion({ displayId: 9, x: 0, y: 0, width: 400, height: 300 }, displays)).toBe(
      null,
    );
  });

  it("restores a remembered region only while it still fits its display", () => {
    const saved = { displayId: 2, x: 2000, y: 0, width: 640, height: 360 };
    expect(restoreRegion(saved, [{ id: 2, bounds: secondary }])).toEqual(saved);
    expect(restoreRegion(saved, [{ id: 1, bounds: display }])).toBe(null);
    const shrunk = { x: 1920, y: 0, width: 600, height: 400 };
    expect(restoreRegion(saved, [{ id: 2, bounds: shrunk }])).toBe(null);
    expect(restoreRegion(null, [{ id: 1, bounds: display }])).toBe(null);
  });
});

describe("pickScreenSource", () => {
  const sources = [
    { id: "screen:0", display_id: "11" },
    { id: "screen:1", display_id: "22" },
  ];

  it("captures the primary display for full-screen recordings", () => {
    expect(pickScreenSource(sources, null, 22, 2)?.id).toBe("screen:1");
    expect(pickScreenSource(sources, null, 99, 2)?.id).toBe("screen:0");
  });

  it("captures exactly the region's display, or nothing", () => {
    expect(pickScreenSource(sources, 11, 22, 2)?.id).toBe("screen:0");
    expect(pickScreenSource(sources, 33, 22, 2)).toBeUndefined();
    // Linux may leave display ids empty: one source for one display is still unambiguous.
    expect(pickScreenSource([{ id: "screen:0", display_id: "" }], 7, 7, 1)?.id).toBe("screen:0");
    expect(pickScreenSource([{ id: "screen:0", display_id: "" }], 7, 7, 2)).toBeUndefined();
  });
});
