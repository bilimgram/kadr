import type { BubbleLayout } from "@kadr/project-format";
import { getBubbleShape } from "./shapes";

export interface Size {
  width: number;
  height: number;
}

export interface Rect extends Size {
  x: number;
  y: number;
}

/** Bubble height as a fraction of the output frame height. */
export const BUBBLE_SIZE_PRESETS = { small: 0.14, medium: 0.19, large: 0.26 } as const;
export type BubbleSizePreset = keyof typeof BUBBLE_SIZE_PRESETS;

export const DEFAULT_BUBBLE_LAYOUT: BubbleLayout = {
  visible: true,
  shape: "circle",
  center: { x: 0.1, y: 0.86 },
  size: BUBBLE_SIZE_PRESETS.medium,
  mirror: true,
  border: { width: 0, color: "#ffffff" },
};

/** Pixel rectangle of the bubble inside a frame, kept fully inside the frame. */
export function bubbleRect(layout: BubbleLayout, frame: Size): Rect {
  const aspect = getBubbleShape(layout.shape).aspectRatio;
  let height = layout.size * frame.height;
  let width = height * aspect;
  if (width > frame.width) {
    width = frame.width;
    height = width / aspect;
  }
  const x = clamp(layout.center.x * frame.width - width / 2, 0, frame.width - width);
  const y = clamp(layout.center.y * frame.height - height / 2, 0, frame.height - height);
  return { x, y, width, height };
}

/** Largest rectangle with the source's aspect ratio that fits inside the target (letterboxed). */
export function fitContain(source: Size, target: Size): Rect {
  const scale = Math.min(target.width / source.width, target.height / source.height);
  const width = source.width * scale;
  const height = source.height * scale;
  return { x: (target.width - width) / 2, y: (target.height - height) / 2, width, height };
}

/** Centered crop of the source that fills the target's aspect ratio (like CSS `object-fit: cover`). */
export function fitCover(source: Size, target: Size): Rect {
  const scale = Math.max(target.width / source.width, target.height / source.height);
  const width = target.width / scale;
  const height = target.height / scale;
  return { x: (source.width - width) / 2, y: (source.height - height) / 2, width, height };
}

/** Moves a layout's center to a point in frame pixels (e.g. while dragging), normalized and clamped. */
export function moveBubble(layout: BubbleLayout, point: { x: number; y: number }, frame: Size) {
  return {
    ...layout,
    center: { x: clamp(point.x / frame.width, 0, 1), y: clamp(point.y / frame.height, 0, 1) },
  } satisfies BubbleLayout;
}

/** Whether a point in frame pixels hits the bubble's bounding box. */
export function hitTestBubble(layout: BubbleLayout, point: { x: number; y: number }, frame: Size) {
  const r = bubbleRect(layout, frame);
  return point.x >= r.x && point.x <= r.x + r.width && point.y >= r.y && point.y <= r.y + r.height;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), Math.max(min, max));
}
