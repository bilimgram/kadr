import { describe, expect, it } from "vitest";
import {
  clampIntoArea,
  defaultBubblePosition,
  isFullyVisible,
  resolveBubblePosition,
} from "./placement";

const primary = { x: 0, y: 0, width: 1920, height: 1040 };
const secondary = { x: 1920, y: 0, width: 1280, height: 1024 };
const size = { width: 200, height: 200 };

describe("bubble placement", () => {
  it("starts in the bottom-left corner of the primary work area", () => {
    expect(defaultBubblePosition(size, primary)).toEqual({ x: 24, y: 816 });
  });

  it("knows whether the bubble is fully on some display", () => {
    expect(isFullyVisible({ x: 100, y: 100, ...size }, [primary])).toBe(true);
    expect(isFullyVisible({ x: 1800, y: 100, ...size }, [primary])).toBe(false);
    expect(isFullyVisible({ x: 2000, y: 100, ...size }, [primary, secondary])).toBe(true);
  });

  it("keeps a remembered position only while it is fully visible", () => {
    expect(resolveBubblePosition({ x: 300, y: 400 }, size, [primary], primary)).toEqual({
      x: 300,
      y: 400,
    });
    // The second monitor was unplugged: back to the default corner instead of lost off screen.
    expect(resolveBubblePosition({ x: 2500, y: 300 }, size, [primary], primary)).toEqual({
      x: 24,
      y: 816,
    });
    expect(resolveBubblePosition(null, size, [primary], primary)).toEqual({ x: 24, y: 816 });
  });

  it("pulls a bubble that grew past an edge back inside the work area", () => {
    expect(clampIntoArea({ x: 1800, y: 950, width: 280, height: 280 }, primary)).toEqual({
      x: 1640,
      y: 760,
    });
    expect(clampIntoArea({ x: -50, y: -20, ...size }, primary)).toEqual({ x: 0, y: 0 });
    expect(clampIntoArea({ x: 500, y: 500, ...size }, primary)).toEqual({ x: 500, y: 500 });
  });
});
