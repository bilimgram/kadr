import type { NormalizedPoint } from "@kadr/project-format";
import type { ScreenRect } from "./schemas";

/**
 * A screen point (global DIPs) as a position on the recorded area, (0, 0) top-left to (1, 1)
 * bottom-right, or null when the pointer is outside it.
 */
export function normalizeToArea(
  point: { x: number; y: number },
  area: ScreenRect,
): NormalizedPoint | null {
  if (area.width <= 0 || area.height <= 0) return null;
  const x = (point.x - area.x) / area.width;
  const y = (point.y - area.y) / area.height;
  if (x < 0 || x > 1 || y < 0 || y > 1) return null;
  // Rounded: four decimals are finer than a pixel on any display, and keep the log small.
  return { x: Math.round(x * 10_000) / 10_000, y: Math.round(y * 10_000) / 10_000 };
}
