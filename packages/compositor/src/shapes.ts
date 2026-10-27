import { BubbleShapeId } from "@kadr/project-format";

/**
 * A bubble shape is defined once and used everywhere: as an SVG clip path (CSS, desktop bubble
 * window) and as a canvas `Path2D` (compositor), so the live preview and the recording always match.
 *
 * - `path` shapes are square, with `d` drawn in a 0..1 unit box (SVG `objectBoundingBox` units).
 * - `roundRect` shapes have their own aspect ratio; `radius` is a fraction of the shorter side, so
 *   corners stay circular instead of stretching.
 */
export type BubbleShape =
  | { id: BubbleShapeId; label: string; kind: "path"; aspectRatio: 1; d: string }
  | { id: BubbleShapeId; label: string; kind: "roundRect"; aspectRatio: number; radius: number };

export const BUBBLE_SHAPES: Readonly<Record<BubbleShapeId, BubbleShape>> = {
  circle: {
    id: "circle",
    label: "Circle",
    kind: "path",
    aspectRatio: 1,
    d: "M0.5,0 A0.5,0.5 0 1 1 0.5,1 A0.5,0.5 0 1 1 0.5,0 Z",
  },
  squircle: {
    id: "squircle",
    label: "Squircle",
    kind: "path",
    aspectRatio: 1,
    d: "M0.5,0 C0.9,0 1,0.1 1,0.5 C1,0.9 0.9,1 0.5,1 C0.1,1 0,0.9 0,0.5 C0,0.1 0.1,0 0.5,0 Z",
  },
  roundedSquare: {
    id: "roundedSquare",
    label: "Rounded square",
    kind: "roundRect",
    aspectRatio: 1,
    radius: 0.18,
  },
  hexagon: {
    id: "hexagon",
    label: "Hexagon",
    kind: "path",
    aspectRatio: 1,
    d: "M0.5,0 L0.933,0.25 L0.933,0.75 L0.5,1 L0.067,0.75 L0.067,0.25 Z",
  },
  heart: {
    id: "heart",
    label: "Heart",
    kind: "path",
    aspectRatio: 1,
    d: "M0.5,0.95 C0.2,0.74 0,0.55 0,0.32 C0,0.14 0.14,0.02 0.3,0.02 C0.4,0.02 0.47,0.07 0.5,0.15 C0.53,0.07 0.6,0.02 0.7,0.02 C0.86,0.02 1,0.14 1,0.32 C1,0.55 0.8,0.74 0.5,0.95 Z",
  },
  blob: {
    id: "blob",
    label: "Blob",
    kind: "path",
    aspectRatio: 1,
    d: "M0.52,0.02 C0.76,0 0.97,0.18 0.98,0.45 C1,0.72 0.82,0.97 0.53,0.98 C0.26,1 0.03,0.83 0.02,0.55 C0,0.27 0.27,0.04 0.52,0.02 Z",
  },
  card: { id: "card", label: "16:9 card", kind: "roundRect", aspectRatio: 16 / 9, radius: 0.12 },
  portrait: {
    id: "portrait",
    label: "9:16 portrait",
    kind: "roundRect",
    aspectRatio: 9 / 16,
    radius: 0.12,
  },
};

/** Shape ids in display order. */
export const BUBBLE_SHAPE_IDS: readonly BubbleShapeId[] = BubbleShapeId.options;

export function getBubbleShape(id: BubbleShapeId): BubbleShape {
  return BUBBLE_SHAPES[id];
}
