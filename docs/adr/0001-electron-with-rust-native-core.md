# 0001. Electron shell with a Rust native core

- Status: Accepted
- Date: 2026-10-27

## Context

We need a desktop recorder for Windows and macOS (Linux later) with a smooth, always-on-top, shaped
webcam bubble, high-quality capture (up to 4K60), low CPU usage, and a web version that shares as much
code as possible. The team writes TypeScript/React day to day.

Loom's desktop app uses the same split: an Electron UI on top of native recording/encoding layers
(Swift on macOS, C++ on Windows), adopted after browser-based capture struggled above 720p–1080p.

## Decision

- **Electron** for the application shell and all UI (control bar, bubble, editor, settings).
- Phase 1 records with Chromium's capture stack (`desktopCapturer` / `getDisplayMedia`, WebCodecs
  hardware encoders) to ship quickly.
- Phase 4 moves capture, compositing, and encoding into **one Rust crate** (`crates/kadr-native`)
  exposed to Node via **napi-rs**, using Windows Graphics Capture, ScreenCaptureKit, PipeWire, `wgpu`,
  and OS hardware encoders.

## Consequences

- Same Chromium everywhere: consistent rendering, WebCodecs/WebGPU available, and the web app reuses
  the renderer code.
- One native codebase (Rust) instead of one per OS. MIT-licensed crates (e.g. Cap's `scap-*`) can be
  reused with attribution.
- Larger installer (~100 MB+) and higher idle RAM than a system-webview app; mitigated by performance
  budgets and lazy windows.
- We must maintain a native build pipeline (prebuilt `.node` binaries per OS/arch in CI).

## Alternatives considered

- **Tauri + Rust:** smaller and leaner, but uses the system webview (WebKit on macOS, WebKitGTK on Linux)
  where `getDisplayMedia` support is limited or historically broken, so all capture must be Rust and the
  web version needs a second pipeline. Rendering also differs per OS.
- **Fully native per OS (Swift/C++/…):** best performance, but three UI codebases and no web reuse.
- **Electron only, forever:** fastest to build, but unreliable window exclusion on macOS, no separate
  cursor track, and weaker 4K60 performance.
