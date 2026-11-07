import { ImageSegmenter, type ImageSource } from "@mediapipe/tasks-vision";
import { blendMasks, maskFromConfidence, type PersonMask, removeMaskIslands } from "./mask";

/**
 * Where the segmentation runtime and model are served from. Apps pass URLs from their bundler
 * (e.g. Vite `?url` imports) so this package stays bundler-agnostic and nothing is downloaded at
 * runtime: everything ships inside the app.
 */
export interface SegmenterAssets {
  /** `@mediapipe/tasks-vision/vision_wasm_internal.js` */
  wasmLoaderUrl: string;
  /** `@mediapipe/tasks-vision/vision_wasm_internal.wasm` */
  wasmBinaryUrl: string;
  /** `@kadr/compositor/assets/selfie_segmenter.tflite` */
  modelUrl: string;
}

/**
 * On-device person segmentation (MediaPipe selfie segmenter, Apache-2.0, see ADR 0009). Frames are
 * processed locally on the GPU, or on the CPU when WebGL is unavailable; nothing leaves the
 * machine. Masks are smoothed over time so edges don't flicker.
 */
export class PersonSegmenter {
  private previous: PersonMask | null = null;
  private scratch: PersonMask | undefined;
  private lastTimestamp = 0;
  private closed = false;

  private constructor(private readonly segmenter: ImageSegmenter) {}

  /** Loads the model; rejects when neither the GPU nor the CPU backend can start. */
  static async create(assets: SegmenterAssets): Promise<PersonSegmenter> {
    const fileset = { wasmLoaderPath: assets.wasmLoaderUrl, wasmBinaryPath: assets.wasmBinaryUrl };
    const options = (delegate: "GPU" | "CPU") => ({
      baseOptions: { modelAssetPath: assets.modelUrl, delegate },
      runningMode: "VIDEO" as const,
      outputConfidenceMasks: true,
      outputCategoryMask: false,
    });
    try {
      return new PersonSegmenter(await ImageSegmenter.createFromOptions(fileset, options("GPU")));
    } catch {
      return new PersonSegmenter(await ImageSegmenter.createFromOptions(fileset, options("CPU")));
    }
  }

  /** The person mask for one video frame, or null if this frame couldn't be segmented. */
  segment(frame: ImageSource, timestampMs: number): PersonMask | null {
    if (this.closed) return null;
    // VIDEO mode requires strictly increasing timestamps.
    const timestamp = Math.max(timestampMs, this.lastTimestamp + 1);
    this.lastTimestamp = timestamp;
    try {
      const result = this.segmenter.segmentForVideo(frame, timestamp);
      try {
        const masks = result.confidenceMasks ?? [];
        // One mask (person) for the selfie model; multiclass models put background first.
        const mask = masks.length > 1 ? masks[1] : masks[0];
        if (!mask) return null;
        this.scratch = removeMaskIslands(
          maskFromConfidence(mask.getAsFloat32Array(), mask.width, mask.height, this.scratch),
        );
        this.previous = blendMasks(this.previous, this.scratch);
        return this.previous;
      } finally {
        result.close();
      }
    } catch {
      return null;
    }
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.segmenter.close();
  }
}
