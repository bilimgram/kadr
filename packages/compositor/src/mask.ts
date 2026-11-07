import type { FaceRegion } from "./light";

/**
 * A person mask in camera-frame coordinates (row-major, top row first): 0 is background, 255 is
 * the person. Produced at the segmentation model's resolution (256×256) and stretched over the
 * whole frame, like the model's input.
 */
export interface PersonMask {
  width: number;
  height: number;
  data: Uint8Array;
}

/** Converts model confidences (0..1) into a mask, reusing `into` when it has the right size. */
export function maskFromConfidence(
  confidence: Float32Array,
  width: number,
  height: number,
  into?: PersonMask,
): PersonMask {
  const mask =
    into && into.width === width && into.height === height
      ? into
      : { width, height, data: new Uint8Array(width * height) };
  const count = Math.min(confidence.length, mask.data.length);
  for (let i = 0; i < count; i++) {
    const value = confidence[i] ?? 0;
    mask.data[i] = value <= 0 ? 0 : value >= 1 ? 255 : Math.round(value * 255);
  }
  return mask;
}

/**
 * Temporal smoothing that removes edge flicker without ghosting: pixels that barely changed are
 * averaged with the previous frame, pixels that changed a lot (the person moved) follow at once.
 * Writes into `previous` and returns it; returns a copy of `next` when sizes differ.
 */
export function blendMasks(previous: PersonMask | null, next: PersonMask): PersonMask {
  if (!previous || previous.width !== next.width || previous.height !== next.height) {
    return { width: next.width, height: next.height, data: new Uint8Array(next.data) };
  }
  const out = previous.data;
  const incoming = next.data;
  for (let i = 0; i < out.length; i++) {
    const before = out[i] ?? 0;
    const after = incoming[i] ?? 0;
    const delta = after - before;
    // 0.35 for flicker-sized changes, rising to 1 for a full flip.
    const follow = Math.min(1, 0.35 + (Math.abs(delta) / 255) * 1.3);
    out[i] = Math.round(before + delta * follow);
  }
  return previous;
}

/** Mask value from which a pixel belongs to a region, so an island's soft edge goes with it. */
const ISLAND_EDGE = 64;

/**
 * Clears small islands: connected regions (with their soft edges, mask ≥ 25%) smaller than
 * `minShare` of the largest one.
 * The model sometimes marks a lamp, a poster or text next to the head as "person"; those specks are
 * disconnected from the body. Regions of similar size (two people) are kept. Works in place.
 */
export function removeMaskIslands(mask: PersonMask, minShare = 0.12): PersonMask {
  const { width, height, data } = mask;
  const labels = new Int32Array(width * height).fill(-1);
  const sizes: number[] = [];
  const stack: number[] = [];
  for (let start = 0; start < data.length; start++) {
    if ((labels[start] ?? 0) !== -1 || (data[start] ?? 0) < ISLAND_EDGE) continue;
    const label = sizes.length;
    let size = 0;
    labels[start] = label;
    stack.push(start);
    while (stack.length > 0) {
      const index = stack.pop() as number;
      size++;
      const x = index % width;
      const neighbours = [
        x > 0 ? index - 1 : -1,
        x < width - 1 ? index + 1 : -1,
        index - width,
        index + width,
      ];
      for (const next of neighbours) {
        if (next < 0 || next >= data.length) continue;
        if ((labels[next] ?? 0) !== -1 || (data[next] ?? 0) < ISLAND_EDGE) continue;
        labels[next] = label;
        stack.push(next);
      }
    }
    sizes.push(size);
  }
  if (sizes.length < 2) return mask;
  const threshold = Math.max(...sizes) * minShare;
  for (let i = 0; i < data.length; i++) {
    const label = labels[i] ?? -1;
    if (label >= 0 && (sizes[label] ?? 0) < threshold) data[i] = 0;
  }
  return mask;
}

/** Share of the frame covered by the person (mask ≥ 50%). */
export function maskCoverage(mask: PersonMask): number {
  if (mask.data.length === 0) return 0;
  let covered = 0;
  for (const value of mask.data) if (value >= 128) covered++;
  return covered / mask.data.length;
}

/** Nearest-neighbour resample of a mask onto a `width`×`height` grid (for the light meter). */
export function sampleMaskGrid(mask: PersonMask, width: number, height: number): Uint8Array {
  const out = new Uint8Array(width * height);
  if (mask.width === 0 || mask.height === 0) return out;
  for (let y = 0; y < height; y++) {
    const sourceY = Math.min(mask.height - 1, Math.floor(((y + 0.5) / height) * mask.height));
    for (let x = 0; x < width; x++) {
      const sourceX = Math.min(mask.width - 1, Math.floor(((x + 0.5) / width) * mask.width));
      out[y * width + x] = mask.data[sourceY * mask.width + sourceX] ?? 0;
    }
  }
  return out;
}

/** Below this share of the frame, the "person" is noise (or nobody is there). */
const MIN_PERSON_COVERAGE = 0.03;

/**
 * Where the face is, estimated from the person mask: webcam framing shows head and shoulders, so
 * the face is the top part of the silhouette, about as tall as 1.3× the head's width. Used to meter
 * light on the face wherever the person sits in the frame. Null when no person is visible.
 */
export function estimateFaceRegion(mask: PersonMask): FaceRegion | null {
  const { width, height, data } = mask;
  if (width === 0 || height === 0) return null;

  const rowCounts = new Array<number>(height).fill(0);
  let total = 0;
  for (let y = 0; y < height; y++) {
    let count = 0;
    for (let x = 0; x < width; x++) if ((data[y * width + x] ?? 0) >= 128) count++;
    rowCounts[y] = count;
    total += count;
  }
  if (total < width * height * MIN_PERSON_COVERAGE) return null;

  // The top of the head: the first row with a meaningful run of person pixels.
  const minRow = Math.max(2, width * 0.02);
  const top = rowCounts.findIndex((count) => count >= minRow);
  if (top < 0) return null;
  let bottom = height - 1;
  while (bottom > top && (rowCounts[bottom] ?? 0) < minRow) bottom--;
  const personHeight = bottom - top + 1;

  // Measure the head where it is widest above the shoulders: a band 8–20% down the silhouette.
  const bandStart = top + Math.floor(personHeight * 0.08);
  const bandEnd = Math.max(bandStart + 1, top + Math.ceil(personHeight * 0.2));
  let left = 0;
  let right = 0;
  let rows = 0;
  for (let y = bandStart; y < Math.min(bandEnd, height); y++) {
    let first = -1;
    let last = -1;
    for (let x = 0; x < width; x++) {
      if ((data[y * width + x] ?? 0) >= 128) {
        if (first < 0) first = x;
        last = x;
      }
    }
    if (first >= 0) {
      left += first;
      right += last + 1;
      rows++;
    }
  }
  if (rows === 0) return null;
  left /= rows;
  right /= rows;

  const headWidth = Math.max(1, right - left);
  const headHeight = Math.min(personHeight, Math.max(height * 0.1, headWidth * 1.3));
  // Hair takes the top of the head; the face starts about 15% down.
  const faceTop = top + headHeight * 0.15;
  const faceHeight = headHeight * 0.85;
  const region: FaceRegion = {
    x: left / width,
    y: faceTop / height,
    width: headWidth / width,
    height: faceHeight / height,
  };
  return clampRegion(region);
}

function clampRegion(region: FaceRegion): FaceRegion {
  const x = Math.min(0.98, Math.max(0, region.x));
  const y = Math.min(0.98, Math.max(0, region.y));
  return {
    x,
    y,
    width: Math.max(0.02, Math.min(1 - x, region.width)),
    height: Math.max(0.02, Math.min(1 - y, region.height)),
  };
}
