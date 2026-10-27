import type { BubbleShape } from "@kadr/compositor/shapes";

/** Small preview of a bubble shape, drawn from the same definition the bubble and compositor use. */
export function ShapeIcon({ shape, size = 22 }: { shape: BubbleShape; size?: number }) {
  if (shape.kind === "path") {
    return (
      <svg width={size} height={size} viewBox="0 0 1 1" aria-hidden="true">
        <path d={shape.d} fill="currentColor" />
      </svg>
    );
  }
  const width = Math.min(shape.aspectRatio, 1);
  const height = Math.min(1 / shape.aspectRatio, 1);
  const radius = shape.radius * Math.min(width, height);
  return (
    <svg width={size} height={size} viewBox="0 0 1 1" aria-hidden="true">
      <rect
        x={(1 - width) / 2}
        y={(1 - height) / 2}
        width={width}
        height={height}
        rx={radius}
        fill="currentColor"
      />
    </svg>
  );
}
