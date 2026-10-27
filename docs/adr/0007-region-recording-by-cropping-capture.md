# 0007. Region recording by cropping the display capture

- Status: Accepted
- Date: 2026-10-28

## Context

Users want to record part of a screen, not only a whole display. Chromium's `getDisplayMedia()`
captures whole displays or windows; it has no option to capture a rectangle. The desktop app records
in the control panel's renderer, which is hidden during a recording, so anything driven by
`requestAnimationFrame` or timers there is unreliable. Region selection also has to work across
several displays with different scale factors.

## Decision

- **Picking:** one transparent, always-on-top overlay per display (`region.html`). The overlay works
  in DIPs; geometry is pure and unit-tested (`apps/desktop/src/shared/region.ts`). The main process
  owns the selection: it validates the picked area against the display it is on, remembers it in
  `window-state.json`, and offers it again next time.
- **Capturing:** the main process answers `getDisplayMedia()` with the display that contains the
  region, and never another one (`pickScreenSource`). Recording another display and cropping it would
  show the wrong content.
- **Cropping:** the engine reads the captured track with `MediaStreamTrackProcessor`, re-wraps each
  `VideoFrame` with a smaller `visibleRect`, and feeds a `MediaStreamTrackGenerator` that
  `MediaRecorder` records. The crop is computed per frame from the frame's own size, in even device
  pixels (4:2:0 chroma alignment and H.264 need even values).
- **While recording:** a click-through, content-protected frame window marks the area from just
  outside it; the countdown is centred on the area.

## Consequences

- No pixels are copied or redrawn to crop, and the crop runs on the capture's frames, so a hidden
  window doesn't stall it.
- A change of display scaling mid-recording still records the same area.
- Like the full-screen capture today ("Mode A" in ADR 0004), the bubble is recorded when it is inside
  the area.
- `MediaStreamTrackProcessor` and `MediaStreamTrackGenerator` on `window` are Chromium extensions;
  the standard puts them in workers (`VideoTrackGenerator`). If Chromium drops the window versions, the
  crop moves into a dedicated worker with the same per-frame logic. The engine checks support first
  and reports a clear error instead of failing mid-recording.
- The e2e suite records a region on Windows and checks the MP4's pixel size and that content from
  the area's left half lands in the video's left half.

## Alternatives considered

- **Draw into a canvas and record `canvas.captureStream()`:** copies every frame, costs GPU/CPU, and
  depends on animation frames that a hidden window throttles.
- **Native capture of a rectangle (Rust core):** the long-term path for capture (ADR 0001), but Phase
  4 work; cropping keeps region recording on the same pipeline as full-screen recording until then.
- **Record the whole display and crop when exporting:** larger files, and the full screen (with
  whatever else is on it) is stored on disk although the user asked for an area.
