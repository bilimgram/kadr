import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import { BLOCKED_REQUEST_URLS } from "./security";

/** The metrics host, or any web request to a Google host ("type.googleapis.com/…" are protobuf names). */
function reportsUsage(text: string): boolean {
  return text.includes("odml.pa.googleapis.com") || /https?:\/\/[a-z0-9.-]*google/i.test(text);
}

describe("bundled third-party code", () => {
  // MediaPipe Tasks 1.x posts usage metrics to Google by itself (ADR 0009). Kadr pins a release
  // without that code; this fails if an upgrade brings it back.
  it("person segmentation contains no usage reporting", () => {
    const root = dirname(createRequire(import.meta.url).resolve("@mediapipe/tasks-vision"));
    for (const file of ["vision_bundle.mjs", "vision_bundle.cjs", "wasm/vision_wasm_internal.js"]) {
      expect(reportsUsage(readFileSync(join(root, file), "utf8")), file).toBe(false);
    }
    const wasm = readFileSync(join(root, "wasm/vision_wasm_internal.wasm")).toString("latin1");
    expect(wasm.includes("odml.pa.googleapis.com")).toBe(false);
  });

  it("the main process blocks the metrics host anyway", () => {
    expect(BLOCKED_REQUEST_URLS).toContain("https://odml.pa.googleapis.com/*");
  });
});
