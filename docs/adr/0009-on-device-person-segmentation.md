# 0009. On-device person segmentation for camera backgrounds and light

- Status: Proposed
- Date: 2026-11-07

## Context

Users want to blur, remove or replace the room behind them, and Kadr's light correction looked flat
next to other recorders. It lifted the whole frame with one curve and metered a fixed box where a
face usually is, so an off-centre face or a beige wall threw it off.

All of these need to know which pixels are the person. Doing that without a model (chroma key, or
subtracting a photo of the empty room) needs a green screen or breaks when the webcam adjusts its
own exposure, so in practice it takes a small segmentation model. Kadr is local-first: frames must
never leave the machine, and nothing may be downloaded at runtime.

While evaluating MediaPipe we found that `@mediapipe/tasks-vision` 1.x (July 2026 onwards) sends
usage metrics to `odml.pa.googleapis.com` every minute from inside the library. 0.10.x releases
(up to 0.10.35, April 2026) don't contain that code.

## Decision

1. **MediaPipe Tasks Vision with the selfie segmenter model** (Apache-2.0, 250 KB, 256×256 person
   mask). The model ships in `packages/compositor/assets/`, and the WebAssembly runtime is bundled
   by Vite. Apps pass the asset URLs, so the package stays bundler-agnostic.
2. **The runtime is pinned to exactly 0.10.35** in the pnpm catalog. A unit test
   (`apps/desktop/src/main/telemetry-guard.test.ts`) fails if the bundled runtime contains the
   metrics host or a request to any Google host. The main process also cancels requests to that
   host (`BLOCKED_REQUEST_URLS`), which covers dev mode, where pages have no CSP.
3. **One GPU pipeline** (`CameraPipeline` in `@kadr/compositor`) for the desktop bubble,
   camera-only recordings and the web compositor:
   - segmentation (GPU delegate, CPU fallback, every other frame when slow);
   - temporal smoothing and removal of small islands in the mask;
   - edge refinement in the shader, a joint bilateral filter against the full-resolution frame;
   - backgrounds: none, blur (mask-aware, so the person never bleeds into it), remove (transparent;
     the bubble shows only the person), colour gradients, or a custom image.
4. **Person-aware light correction:**
   - the face is metered where the mask finds it, on person pixels only;
   - the person gets the full lift and the room 45% of it;
   - white balance is measured on near-neutral pixels, so skin tone never drives it;
   - an S-curve restores the contrast that lifting flattens.
5. **The production CSP gains `'wasm-unsafe-eval'`**, which allows compiling WebAssembly and never
   JavaScript `eval`.
6. **Camera-only recordings run the same pipeline** on the camera track's frames
   (`MediaStreamTrackProcessor`). They are not mirrored, and "remove" becomes the chosen colour,
   because a video can't be transparent. In the other modes the bubble is captured with the
   screen, so recordings already match the preview.
7. **A custom background image** is copied into the user data folder. Renderers receive its bytes
   over IPC and never a path.

## Consequences

- The installer grows by about 11.5 MB (the WebAssembly runtime) plus the model.
- The bubble costs a few milliseconds of GPU or CPU per frame while an effect is on. Camera-only
  recordings with effects run a second pipeline in the engine.
- Hair and fast movement show the limits of a 256×256 model. A matting model (for example MODNet,
  Apache-2.0) can replace it behind the same `PersonSegmenter` interface.
- Upgrading MediaPipe means re-checking for telemetry; the guard test makes that explicit.
- Without WebGL2, light correction falls back to a CSS filter and backgrounds are off.

## Alternatives considered

- **Chroma key or clean-plate subtraction:** needs a green screen, or breaks with auto-exposure,
  shadows and clothes that match the wall.
- **MediaPipe 1.x:** it phones home, and blocking the request still leaves the code in the app.
- **ONNX Runtime Web with MODNet or similar:** better hair, but several MB of model, more GPU
  work, and our own pre- and post-processing. A good later upgrade.
- **Robust Video Matting:** GPL-3.0, which Kadr can't use.
- **The multiclass selfie model** (hair, face, body, clothes): 15.6 MB and slower. Its face-skin
  class could later limit smoothing to skin.
- **OS camera effects** (Windows Studio Effects, macOS Portrait): only on some hardware, with no
  control over the result, and not cross-platform.
