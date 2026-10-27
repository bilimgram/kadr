# kadr-native

Rust native core for Kadr, exposed to the Electron main process through
[napi-rs](https://napi.rs). See [ADR-0001](../../docs/adr/0001-electron-with-rust-native-core.md).

| Phase   | Scope                                                                                                             |
| ------- | ----------------------------------------------------------------------------------------------------------------- |
| 0 (now) | Crate skeleton, version and capability probes, CI (`fmt`, `clippy`, `check`)                                      |
| 4       | Capture (WGC / ScreenCaptureKit / PipeWire), `wgpu` compositor, hardware encoders, cursor track, window exclusion |

```bash
cargo check -p kadr-native
cargo clippy -p kadr-native -- -D warnings
```

Prebuilt `.node` binaries per OS/arch will be produced in CI with `@napi-rs/cli` once the addon is
wired into the desktop app.
