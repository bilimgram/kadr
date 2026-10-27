# Kadr

**Open-source, local-first screen recorder** — screen + live webcam bubble (in any shape), instant
results, and AI editing with your own API key or fully offline.

> ⚠️ Early development (Phase 0). "Kadr" is a working codename.

## Why Kadr

- **Live bubble, your shape** — circle, squircle, rounded, hexagon, heart, blob, 16:9 card, 9:16
  portrait. Change it while recording.
- **Separate tracks** — screen, camera, mic, and system audio are recorded separately, so the bubble
  can be moved, resized, or hidden after recording without quality loss.
- **AI auto-editing** — removes silences, filler words, and retakes, adds zooms, chapters, captions,
  and titles. Bring your own key (Anthropic, OpenAI, Google, OpenRouter) or run locally (whisper.cpp,
  Ollama).
- **No server required** — everything works offline. Share through your own S3/R2/MinIO bucket, or
  self-host Kadr Server for teams.
- **Open formats** — MP4/WebM, WebVTT/SRT, OpenTimelineIO, and a documented project format.

## Repository layout

| Path                                                 | What                                                                                   |
| ---------------------------------------------------- | -------------------------------------------------------------------------------------- |
| [`apps/desktop`](apps/desktop)                       | Electron desktop app                                                                   |
| [`apps/web`](apps/web)                               | Browser recorder (static web app)                                                      |
| [`packages/project-format`](packages/project-format) | Recording bundle, events, transcript and edit-plan schemas                             |
| [`packages/compositor`](packages/compositor)         | Bubble shapes, layout math, canvas compositor                                          |
| [`packages/recorder-core`](packages/recorder-core)   | Browser recording primitives                                                           |
| [`packages/ai-editor`](packages/ai-editor)           | Provider-agnostic AI editing                                                           |
| [`packages/ui`](packages/ui)                         | Shared React components                                                                |
| [`crates/kadr-native`](crates/kadr-native)           | Rust native core (napi-rs)                                                             |
| [`docs`](docs)                                       | [Plan](docs/PLAN.md), [architecture](docs/ARCHITECTURE.md), [ADRs](docs/adr/README.md) |

## Getting started

Requirements: Node.js ≥ 22.12 (24 recommended), pnpm via Corepack, Rust (only for `crates/`).
On Windows, clone into a short path (e.g. `C:\dev\kadr`) or enable long paths, because some tools
still fail on paths longer than 260 characters.

```bash
corepack enable
corepack pnpm install
corepack pnpm dev:desktop   # Electron app
corepack pnpm dev:web       # web recorder at http://localhost:5173
corepack pnpm check         # lint + typecheck + tests
```

More in the [development guide](docs/DEVELOPMENT.md) and [release process](docs/RELEASING.md).

## Contributing

Contributions are welcome. Read [CONTRIBUTING.md](CONTRIBUTING.md) and our
[Code of Conduct](CODE_OF_CONDUCT.md). Report security issues privately — see [SECURITY.md](SECURITY.md).

## License

[Apache-2.0](LICENSE). See [NOTICE](NOTICE) for attributions.
