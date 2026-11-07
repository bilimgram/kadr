import { PersonSegmenter } from "@kadr/compositor";
import modelUrl from "@kadr/compositor/assets/selfie_segmenter.tflite?url";
import wasmLoaderUrl from "@mediapipe/tasks-vision/vision_wasm_internal.js?url";
import wasmBinaryUrl from "@mediapipe/tasks-vision/vision_wasm_internal.wasm?url";
import { useEffect, useState } from "react";

let segmenter: Promise<PersonSegmenter | null> | null = null;

/**
 * The window's person segmenter, loaded once on first use from files bundled with the app (ADR
 * 0009). Resolves null when it can't start; the camera then works without background effects.
 */
export function loadPersonSegmenter(): Promise<PersonSegmenter | null> {
  segmenter ??= PersonSegmenter.create({ wasmLoaderUrl, wasmBinaryUrl, modelUrl }).catch(
    (error: unknown) => {
      console.warn("Person segmentation is unavailable:", error);
      return null;
    },
  );
  return segmenter;
}

/** Decodes the saved custom background image, or resolves null when there is none. */
export async function loadBackgroundImage(): Promise<ImageBitmap | null> {
  const image = await window.kadr.background.getImage();
  if (!image) return null;
  // Copy into a fresh ArrayBuffer: Blob parts must not be views of shared or resizable memory.
  const bytes = new Uint8Array(image.data);
  return createImageBitmap(new Blob([bytes], { type: image.mimeType }));
}

/** The custom background image as a bitmap while `revision` is set; closes old bitmaps. */
export function useBackgroundImage(revision: number | null): ImageBitmap | null {
  const [bitmap, setBitmap] = useState<ImageBitmap | null>(null);
  useEffect(() => {
    if (revision === null) {
      setBitmap(null);
      return;
    }
    let active = true;
    let loaded: ImageBitmap | null = null;
    loadBackgroundImage()
      .then((image) => {
        loaded = image;
        if (active) setBitmap(image);
        else image?.close();
      })
      .catch(() => {
        if (active) setBitmap(null);
      });
    return () => {
      active = false;
      loaded?.close();
    };
  }, [revision]);
  return bitmap;
}
