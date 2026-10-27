/** Window placement rules for the floating bubble: always fully visible on some display. */

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Point {
  x: number;
  y: number;
}

/** Gap between the bubble and the edges of the screen. */
export const BUBBLE_MARGIN = 24;

/** Whether `rect` lies entirely inside one of the work areas. */
export function isFullyVisible(rect: Rect, areas: readonly Rect[]): boolean {
  return areas.some(
    (area) =>
      rect.x >= area.x &&
      rect.y >= area.y &&
      rect.x + rect.width <= area.x + area.width &&
      rect.y + rect.height <= area.y + area.height,
  );
}

/** Where the bubble starts: the bottom-left corner of the work area, like Loom's. */
export function defaultBubblePosition(
  size: { width: number; height: number },
  area: Rect,
  margin = BUBBLE_MARGIN,
): Point {
  return { x: area.x + margin, y: area.y + area.height - size.height - margin };
}

/**
 * The remembered position when the bubble would be fully visible there, otherwise the default
 * spot on the primary display (a monitor was unplugged, or the resolution changed).
 */
export function resolveBubblePosition(
  saved: Point | null,
  size: { width: number; height: number },
  areas: readonly Rect[],
  primary: Rect,
): Point {
  if (saved && isFullyVisible({ ...saved, ...size }, areas)) return saved;
  return defaultBubblePosition(size, primary);
}

/** Moves `rect` the least distance needed to fit inside `area` (e.g. after growing near an edge). */
export function clampIntoArea(rect: Rect, area: Rect): Point {
  const x = Math.min(Math.max(rect.x, area.x), area.x + area.width - rect.width);
  const y = Math.min(Math.max(rect.y, area.y), area.y + area.height - rect.height);
  return { x: Math.max(x, area.x), y: Math.max(y, area.y) };
}
