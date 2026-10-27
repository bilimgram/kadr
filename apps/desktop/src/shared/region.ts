import type { Point, Rect } from "./placement";

/**
 * Geometry for recording a region of the screen. The picker works in DIPs (CSS pixels of the
 * overlay covering one display); the recording crops device pixels out of the captured display.
 */

/** Edges and corners of a selection that can be dragged to resize it. */
export type ResizeHandle = "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw";

export const RESIZE_HANDLES: readonly ResizeHandle[] = ["nw", "n", "ne", "e", "se", "s", "sw", "w"];

/** Smallest area worth recording, in DIPs. */
export const MIN_REGION_SIZE = 40;
/** A press that moves less than this is a click (it selects the whole display). */
export const CLICK_TOLERANCE = 4;
/** Edges this close to the display edge snap onto it. */
export const SNAP_DISTANCE = 8;

export const ASPECT_PRESETS = [
  { id: "free", label: "Free", ratio: null },
  { id: "16:9", label: "16:9", ratio: 16 / 9 },
  { id: "4:3", label: "4:3", ratio: 4 / 3 },
  { id: "1:1", label: "1:1", ratio: 1 },
  { id: "9:16", label: "9:16", ratio: 9 / 16 },
] as const;

export type AspectPreset = (typeof ASPECT_PRESETS)[number]["id"];

/** An area on one display, in global DIPs (the coordinates `screen` and window bounds use). */
export interface DisplayRegion extends Rect {
  displayId: number;
}

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);
const right = (rect: Rect) => rect.x + rect.width;
const bottom = (rect: Rect) => rect.y + rect.height;

export function clampPoint(point: Point, bounds: Rect): Point {
  return {
    x: clamp(point.x, bounds.x, right(bounds)),
    y: clamp(point.y, bounds.y, bottom(bounds)),
  };
}

export function containsPoint(rect: Rect, point: Point): boolean {
  return (
    point.x >= rect.x && point.x <= right(rect) && point.y >= rect.y && point.y <= bottom(rect)
  );
}

/** Pulls a point onto a display edge when it is within `distance` of it. */
export function snapPoint(point: Point, bounds: Rect, distance = SNAP_DISTANCE): Point {
  const snap = (value: number, start: number, end: number) => {
    if (Math.abs(value - start) <= distance) return start;
    if (Math.abs(value - end) <= distance) return end;
    return value;
  };
  return { x: snap(point.x, bounds.x, right(bounds)), y: snap(point.y, bounds.y, bottom(bounds)) };
}

/** Moves a rectangle the least distance needed to lie inside `bounds`, shrinking it if larger. */
export function fitInside(rect: Rect, bounds: Rect): Rect {
  const width = Math.min(rect.width, bounds.width);
  const height = Math.min(rect.height, bounds.height);
  return {
    x: clamp(rect.x, bounds.x, right(bounds) - width),
    y: clamp(rect.y, bounds.y, bottom(bounds) - height),
    width,
    height,
  };
}

/**
 * The selection while dragging from `anchor` to `pointer`: inside the display, at least `min` in
 * both directions, and `ratio` (width / height) wide when an aspect ratio is locked.
 */
export function rectFromDrag(
  anchor: Point,
  pointer: Point,
  bounds: Rect,
  ratio: number | null,
  min = 0,
): Rect {
  const target = clampPoint(pointer, bounds);
  const towardsRight = target.x >= anchor.x;
  const towardsBottom = target.y >= anchor.y;
  // Space between the anchor and the display edge in the direction of the drag.
  const roomX = towardsRight ? right(bounds) - anchor.x : anchor.x - bounds.x;
  const roomY = towardsBottom ? bottom(bounds) - anchor.y : anchor.y - bounds.y;

  let width = Math.abs(target.x - anchor.x);
  let height = Math.abs(target.y - anchor.y);
  if (ratio) {
    width = Math.max(width, height * ratio, min, min * ratio);
    width = Math.min(width, roomX, roomY * ratio);
    height = width / ratio;
  } else {
    width = Math.min(Math.max(width, min), roomX);
    height = Math.min(Math.max(height, min), roomY);
  }
  return fitInside(
    {
      x: towardsRight ? anchor.x : anchor.x - width,
      y: towardsBottom ? anchor.y : anchor.y - height,
      width,
      height,
    },
    bounds,
  );
}

/** Drags one handle of `rect` to `pointer`; the opposite edge or corner stays put. */
export function resizeRect(
  rect: Rect,
  handle: ResizeHandle,
  pointer: Point,
  bounds: Rect,
  ratio: number | null,
  min = MIN_REGION_SIZE,
): Rect {
  const vertical = handle.includes("n") || handle.includes("s");
  const horizontal = handle.includes("e") || handle.includes("w");
  if (vertical && horizontal) {
    const anchor = {
      x: handle.includes("w") ? right(rect) : rect.x,
      y: handle.includes("n") ? bottom(rect) : rect.y,
    };
    return rectFromDrag(anchor, pointer, bounds, ratio, min);
  }

  const target = clampPoint(pointer, bounds);
  if (horizontal) {
    const anchorX = handle === "w" ? right(rect) : rect.x;
    let width = Math.max(Math.abs(target.x - anchorX), min);
    let height = rect.height;
    if (ratio) {
      height = Math.min(Math.max(width / ratio, min), bounds.height);
      width = height * ratio;
    }
    const x = target.x >= anchorX ? anchorX : anchorX - width;
    // A locked aspect ratio grows the other dimension around its centre.
    return fitInside({ x, y: rect.y + (rect.height - height) / 2, width, height }, bounds);
  }

  const anchorY = handle === "n" ? bottom(rect) : rect.y;
  let height = Math.max(Math.abs(target.y - anchorY), min);
  let width = rect.width;
  if (ratio) {
    width = Math.min(Math.max(height * ratio, min), bounds.width);
    height = width / ratio;
  }
  const y = target.y >= anchorY ? anchorY : anchorY - height;
  return fitInside({ x: rect.x + (rect.width - width) / 2, y, width, height }, bounds);
}

/** Moves a rectangle by an offset without leaving the display. */
export function moveRect(rect: Rect, dx: number, dy: number, bounds: Rect): Rect {
  return fitInside({ ...rect, x: rect.x + dx, y: rect.y + dy }, bounds);
}

/** While moving: edges near the display edge stick to it. */
export function snapRect(rect: Rect, bounds: Rect, distance = SNAP_DISTANCE): Rect {
  let { x, y } = rect;
  if (Math.abs(x - bounds.x) <= distance) x = bounds.x;
  else if (Math.abs(right(rect) - right(bounds)) <= distance) x = right(bounds) - rect.width;
  if (Math.abs(y - bounds.y) <= distance) y = bounds.y;
  else if (Math.abs(bottom(rect) - bottom(bounds)) <= distance) y = bottom(bounds) - rect.height;
  return { ...rect, x, y };
}

/** Reshapes a selection to an aspect ratio, keeping its centre and roughly its area. */
export function withAspectRatio(rect: Rect, ratio: number | null, bounds: Rect): Rect {
  if (!ratio) return rect;
  let width = Math.sqrt(rect.width * rect.height * ratio);
  let height = width / ratio;
  const scale = Math.min(1, bounds.width / width, bounds.height / height);
  width *= scale;
  height *= scale;
  return fitInside(
    {
      x: rect.x + (rect.width - width) / 2,
      y: rect.y + (rect.height - height) / 2,
      width,
      height,
    },
    bounds,
  );
}

/** Sets an exact size (typed in by the user), keeping the top-left corner where possible. */
export function resizeTo(
  rect: Rect,
  width: number,
  height: number,
  bounds: Rect,
  min = MIN_REGION_SIZE,
): Rect {
  return fitInside(
    {
      ...rect,
      width: clamp(width, min, bounds.width),
      height: clamp(height, min, bounds.height),
    },
    bounds,
  );
}

const evenSize = (value: number) => Math.max(2, Math.round(value / 2) * 2);
const evenFloor = (value: number) => Math.max(0, Math.floor(value / 2) * 2);

/** Pixel size of the video for an area on a display with `scale` device pixels per DIP. */
export function outputSize(rect: Rect, scale: number): { width: number; height: number } {
  return { width: evenSize(rect.width * scale), height: evenSize(rect.height * scale) };
}

/**
 * The part of a captured display frame to keep for `area` (both in DIPs; `frame` in pixels).
 * Offsets and sizes are even: 4:2:0 video can only be cropped on even pixels, and H.264 needs
 * even dimensions.
 */
export function cropRect(
  area: Rect,
  display: Rect,
  frame: { width: number; height: number },
): Rect {
  const scaleX = frame.width / display.width;
  const scaleY = frame.height / display.height;
  const maxWidth = evenFloor(frame.width);
  const maxHeight = evenFloor(frame.height);
  const width = Math.min(evenSize(area.width * scaleX), maxWidth);
  const height = Math.min(evenSize(area.height * scaleY), maxHeight);
  return {
    x: Math.min(evenFloor((area.x - display.x) * scaleX), maxWidth - width),
    y: Math.min(evenFloor((area.y - display.y) * scaleY), maxHeight - height),
    width,
    height,
  };
}

/**
 * A region from the picker, made safe to record: whole DIPs, inside its display, and big enough.
 * Null when it can't be (its display is gone, or it is a sliver).
 */
export function normalizeRegion(
  region: DisplayRegion,
  displays: ReadonlyArray<{ id: number; bounds: Rect }>,
  min = MIN_REGION_SIZE,
): DisplayRegion | null {
  const display = displays.find((candidate) => candidate.id === region.displayId);
  if (!display) return null;
  const fitted = fitInside(
    {
      x: Math.round(region.x),
      y: Math.round(region.y),
      width: Math.round(region.width),
      height: Math.round(region.height),
    },
    display.bounds,
  );
  if (fitted.width < min || fitted.height < min) return null;
  return { displayId: display.id, ...fitted };
}

/** A remembered region, only while it still lies entirely on its (still connected) display. */
export function restoreRegion(
  saved: DisplayRegion | null,
  displays: ReadonlyArray<{ id: number; bounds: Rect }>,
): DisplayRegion | null {
  if (!saved) return null;
  const display = displays.find((candidate) => candidate.id === saved.displayId);
  if (!display) return null;
  const inside =
    saved.x >= display.bounds.x &&
    saved.y >= display.bounds.y &&
    right(saved) <= right(display.bounds) &&
    bottom(saved) <= bottom(display.bounds);
  return inside && saved.width >= MIN_REGION_SIZE && saved.height >= MIN_REGION_SIZE ? saved : null;
}

/**
 * The screen to capture. For a region, only that region's display will do: recording another
 * screen and cropping it would show the wrong content. A lone source whose display id the
 * platform leaves empty (some Linux setups) is fine when there is only one display.
 */
export function pickScreenSource<Source extends { display_id: string }>(
  sources: readonly Source[],
  wantedDisplayId: number | null,
  primaryDisplayId: number,
  displayCount: number,
): Source | undefined {
  if (wantedDisplayId !== null) {
    const match = sources.find((source) => source.display_id === String(wantedDisplayId));
    if (match) return match;
    return sources.length === 1 && displayCount === 1 ? sources[0] : undefined;
  }
  return sources.find((source) => source.display_id === String(primaryDisplayId)) ?? sources[0];
}
