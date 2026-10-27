//! Kadr native core.
//!
//! Phase 4 moves capture (Windows Graphics Capture, `ScreenCaptureKit`, `PipeWire`), GPU compositing
//! (`wgpu`) and hardware encoding into this crate, writing the same `.kadr` bundle layout as the
//! Chromium pipeline. Until then it only exposes version and capability probes so the build and
//! packaging pipeline for native binaries can be exercised from day one.

use napi_derive::napi;

/// Version of the native core; the app checks it against the version it was built with.
#[napi]
#[must_use]
pub fn native_version() -> String {
    env!("CARGO_PKG_VERSION").to_string()
}

/// Screen capture backends this build targets on the current platform.
#[napi]
#[must_use]
pub fn capture_backends() -> Vec<String> {
    let backends: &[&str] = if cfg!(target_os = "windows") {
        &["windows-graphics-capture"]
    } else if cfg!(target_os = "macos") {
        &["screencapturekit"]
    } else {
        &["pipewire"]
    };
    backends
        .iter()
        .map(|backend| (*backend).to_string())
        .collect()
}
