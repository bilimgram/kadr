# Kadr — Master Plan

> **Status:** Draft v0.1 · **Last updated:** 2026-10-27
> **Kadr** ("frame") is a working codename. Rename before the first public release (see [Open decisions](#11-open-decisions)).

Kadr is an open-source, local-first screen recorder for async video messages: screen + live webcam
bubble, instant sharing, and AI editing that works with the user's own API key or fully offline.

Companion documents:

- [ARCHITECTURE.md](ARCHITECTURE.md) — how the system is built
- [adr/](adr/README.md) — architecture decision records (the "why")

---

## 1. Goals and non-goals

**Goals**

1. Recording experience on par with Loom (fast start, smooth live webcam bubble, instant result), and
   better in a few deliberate places: bubble shapes, separate tracks, AI auto-editing, no time limits.
2. Desktop (Windows, macOS, then Linux) and web, sharing one UI codebase.
3. Enterprise-grade from day one: secure by default, policy-manageable, auditable, self-hostable.
4. A healthy open-source project: permissive license, open formats, documented decisions, easy to contribute to.

**Non-goals (for 1.0)**

- Live streaming, video conferencing, or a general-purpose NLE (we export to real editors instead).
- Mobile recording apps (a mobile-friendly watch page is in scope).
- Copying Loom's code, assets, branding, or private APIs. We reimplement behavior from public, observable
  product features only (clean-room). See [ADR-0003](adr/0003-license-and-open-core.md).

## 2. Principles

| Principle                        | What it means in practice                                                                                       |
| -------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| **Local-first**                  | Recording, editing, AI and export work offline on the user's machine. Recordings are plain files the user owns. |
| **Server-optional**              | No server is required to use the product. Servers add sharing, teams, and billing — never core function.        |
| **Bring your own key (BYOK)**    | AI runs on the user's own provider key (or a local model). Keys never touch our servers.                        |
| **Open formats**                 | MP4/WebM, WebVTT/SRT, JSON Schema-described project files, OpenTimelineIO export. No lock-in.                   |
| **Privacy by default**           | Telemetry off by default, no keystroke contents ever recorded, event capture is opt-in and local.               |
| **Performance is a feature**     | Budgets are written down (see [§6](#6-performance-budgets)) and enforced by benchmarks in CI.                   |
| **Secure by default**            | Hardened Electron, signed builds, SBOMs, provenance, least-privilege IPC.                                       |
| **Accessible and international** | WCAG 2.2 AA, keyboard-first, i18n from the first UI string.                                                     |

## 3. Do we need a server?

**Short answer: no, not for the product itself.** A server is needed only for features that are
inherently multi-user or commercial. It stays a separate, optional, self-hostable component.

| Capability                                                     | Server needed?         | How it works                                                                                |
| -------------------------------------------------------------- | ---------------------- | ------------------------------------------------------------------------------------------- |
| Record screen + camera + mic, live bubble                      | **No**                 | Desktop app / browser APIs                                                                  |
| Save, edit, export, captions                                   | **No**                 | Local files, local rendering                                                                |
| AI editing                                                     | **No**                 | App calls the provider directly with the user's key, or a local model (whisper.cpp, Ollama) |
| Auto-updates                                                   | **No**                 | Static update feed (metadata + installers) on object storage — Cloudflare R2                |
| Web version                                                    | **No**                 | Static site (PWA) on any static host                                                        |
| Share link (basic)                                             | **No** (user's bucket) | Upload to the user's own S3/R2/MinIO bucket + static watch page                             |
| Rich link previews in Slack/Notion (oEmbed, per-video OG tags) | Yes (tiny)             | Edge function or Kadr Server                                                                |
| Comments, reactions, view analytics, workspaces                | Yes                    | Kadr Server (self-hosted or our cloud)                                                      |
| **Subscription / billing**                                     | Yes (tiny)             | Merchant-of-record webhooks → signed license tokens verified offline by the app             |
| Managed AI (no key needed)                                     | Yes                    | Cloud proxy with metered credits — a natural paid feature                                   |
| SSO/SAML, SCIM, audit logs, admin policies                     | Yes                    | Kadr Server Enterprise (self-hosted or dedicated)                                           |

Consequence: the first public releases ship **without any backend**. The server arrives in Phase 5
and is never on the critical path for recording.

## 4. Editions and business model (open core)

|                                                                            | **Community** (free, Apache-2.0) | **Cloud** (subscription) | **Enterprise** (annual license) |
| -------------------------------------------------------------------------- | -------------------------------- | ------------------------ | ------------------------------- |
| Recorder, bubble shapes, editor, export                                    | ✅                               | ✅                       | ✅                              |
| AI editing with own key / local models                                     | ✅                               | ✅                       | ✅                              |
| Share via own bucket + static watch page                                   | ✅                               | ✅                       | ✅                              |
| Self-host Kadr Server (single team)                                        | ✅                               | —                        | ✅                              |
| Hosted share links + storage, custom domain                                | —                                | ✅                       | ✅ (dedicated)                  |
| Managed AI credits (no key required)                                       | —                                | ✅                       | ✅                              |
| Comments, analytics, team workspaces                                       | Self-host                        | ✅                       | ✅                              |
| SSO (OIDC/SAML), SCIM, audit logs, policies/MDM, retention, data residency | —                                | —                        | ✅                              |
| Support SLA                                                                | Community                        | Email                    | Contractual                     |
- Licensing details and the `ee/` directory model: [ADR-0003](adr/0003-license-and-open-core.md).
- Billing via a merchant of record (Paddle, Polar, or Lemon Squeezy — verify support for the company's
  country) so global VAT/sales tax is handled for us.
- License checks gate **hosted services and enterprise admin features only**. Client-side checks in an
  open-source app are not DRM; the durable value is hosting, managed AI, support, and enterprise features.

## 5. Roadmap

Estimates assume 1–2 engineers working with Claude Code. Each phase has measurable exit criteria.

### Phase 0 — Foundation (1–2 weeks) · _this commit starts it_

- Monorepo (pnpm + Turborepo), TypeScript strict, Biome, Vitest, Changesets.
- Governance: license, CONTRIBUTING (DCO), Code of Conduct, SECURITY, GOVERNANCE, ADRs.
- CI on Windows/macOS/Linux; CodeQL, dependency review, OpenSSF Scorecard, Dependabot.
- `@kadr/project-format` v1 schemas (bundle manifest, events, transcript, edit plan) + JSON Schema export.
- Desktop skeleton: hardened Electron, custom `kadr://` protocol, floating bubble window with live
  shape switching, basic screen recording to disk.
- Web skeleton: browser recorder with live composited bubble.

**Exit:** green CI on 3 OSes; a contributor can clone, `pnpm install`, `pnpm dev:desktop` in < 10 min.

### Phase 1 — Desktop recorder MVP (4–6 weeks)

> **Progress (2026-10-27):** done — tray-based control panel, live bubble with shapes and light
> correction, 3-2-1 countdown with sound, floating recording toolbar (stop, pause, restart, discard,
> mic mute, camera toggle), global shortcuts with fallbacks, persisted settings, Loom-sized bubble.
> Next — WebCodecs pipeline with separate tracks, Mode B, source picker, event log, benchmarks.
- Control bar (screen / window / region / camera-only modes), device pickers, 3-2-1 countdown,
  pause/resume/restart/discard, global hotkeys, tray.
- Live bubble: drag, resize presets, shapes (circle, squircle, rounded, hexagon, heart, blob, 16:9 card,
  9:16 portrait), mirror, border ring; background blur via MediaPipe (Apache-2.0).
- Recording pipeline v1 on Chromium capture: WebCodecs hardware encoding → fragmented MP4 per track
  (crash-safe), plus a live composite. "Mode B" (bubble excluded from screen capture, re-composited) on
  Windows; "Mode A" (bubble captured with the screen) as macOS fallback until Phase 4.
- Event log v1: cursor (60 Hz), clicks (opt-in, `uiohook-napi`), window focus, bubble layout, markers
  ("mark mistake" hotkey).
- Benchmark harness: CPU/GPU/RAM, dropped frames, A/V drift — measured side-by-side with Loom.

**Exit:** 60-min 1080p30 recording on a mid-range Windows laptop and an M1 Mac within the budgets in §6;
zero data loss when the app is killed mid-recording (≤ 2 s of footage lost).

### Phase 2 — Editor and web parity (3–4 weeks)

- Timeline editor: trim, cut, split, speed, bubble re-layout, captions; non-destructive (edit plans).
- Export: MP4 (H.264/AAC), WebM (VP9/AV1/Opus), GIF; WebVTT/SRT; OpenTimelineIO.
- Web recorder parity using the same recorder core (worker-based compositor, WebCodecs).
- Open/save `.kadr` bundles; drag-and-drop import.

**Exit:** a recording made on web opens and edits identically on desktop and vice versa.

### Phase 3 — AI editing, BYOK (4–6 weeks)

- Transcription: local whisper.cpp (default, free) or cloud providers; live streaming transcription
  during capture so results are ready at stop.
- Deterministic pre-pass (no AI needed): silence and filler-word detection.
- LLM pass → validated edit plan: remove retakes/fillers/silences, auto-zoom on clicks, speed up idle,
  smart bubble placement, title/summary/chapters, blur detected secrets.
- Provider adapters: Anthropic, OpenAI, Google, OpenRouter, and any OpenAI-compatible endpoint
  (Ollama, llama.cpp, vLLM, LocalAI). Keys in the OS keychain.
- Review UI: every AI operation is previewable and individually accept/reject-able; cost estimate shown
  before running.

**Exit:** for a 10-min recording, edit plan ready ≤ 30 s after stop (cloud LLM) and ≥ 80% of proposed
cuts accepted in internal dogfooding.

### Phase 4 — Native core in Rust (6–8 weeks)

- `crates/kadr-native` via napi-rs: Windows Graphics Capture, ScreenCaptureKit, PipeWire; hardware
  encoders (Media Foundation/NVENC/QSV/AMF, VideoToolbox, VA-API); cursor as a separate track.
- Reliable window exclusion on all platforms → Mode B everywhere.
- 4K60 capture; Screen Studio-style auto-zoom and cursor smoothing driven by the cursor track.

**Exit:** CPU usage ≤ 60% of the Phase 1 pipeline on the same machines; 4K60 without dropped frames on
reference hardware.

### Phase 5 — Sharing and Kadr Server (4–6 weeks)

- BYO-bucket sharing (S3 API: AWS, R2, MinIO, B2) + static watch page; upload-while-recording.
- Kadr Server (self-hostable, Docker/Helm): share pages with OG/oEmbed, comments, reactions, view
  analytics, workspaces; PostgreSQL + S3-compatible storage.
- Kadr Cloud (hosted) + subscriptions + managed AI credits.

**Exit:** link copied ≤ 3 s after stop for a 10-min recording on a 20 Mbps uplink.

### Phase 6 — Teams and Enterprise (8–12 weeks)

- SSO (OIDC, SAML 2.0), SCIM 2.0, RBAC, audit log with SIEM export.
- Admin policies delivered via MDM: Windows Group Policy (ADMX) / registry, macOS configuration
  profiles, JSON policy file on Linux. Examples: allowed AI providers, forced storage target,
  disable local export, retention, watermark, update channel.
- Deployment: MSI/MSIX, PKG, silent per-machine installs, internal update mirror.
- Compliance readiness: SOC 2 Type II (cloud), GDPR DPA, VPAT (WCAG 2.2 AA), external pen-test.

**Exit:** a 500-seat pilot deploys via MDM with SSO + SCIM and passes their security review.

### Later

Linux GA, plugin SDK (custom AI operations, storage targets, exporters), PeerTube/YouTube publishing,
AI voice translation/dubbing, teleprompter, mobile watch-page PWA polish.

## 6. Performance budgets

Targets for reference hardware (to be calibrated against Loom in Phase 1; failing budgets block release):

| Metric                                       | Phase 1 target         | Phase 4 target   |
| -------------------------------------------- | ---------------------- | ---------------- |
| Click → recording (after countdown)          | ≤ 1.0 s                | ≤ 0.5 s          |
| CPU, 1080p30 screen + 720p camera, HW encode | ≤ Loom on same machine | ≤ 60% of Phase 1 |
| Dropped frames                               | < 0.5%                 | < 0.1%           |
| A/V drift over 60 min                        | ≤ ±40 ms               | ≤ ±20 ms         |
| Bubble preview latency (camera → screen)     | ≤ 100 ms               | ≤ 60 ms          |
| Footage lost on crash                        | ≤ 2 s                  | ≤ 1 s            |
| Idle RAM (tray, not recording)               | ≤ 250 MB               | ≤ 200 MB         |
| Installer size                               | ≤ 150 MB               | ≤ 150 MB         |

## 7. Enterprise readiness checklist

**Security**
- [ ] Electron hardening: context isolation, sandbox, no Node in renderers, strict CSP, custom protocol,
  navigation/window-open blocked, permission handler allowlist, IPC validated with Zod (Phase 0 ✅ baseline).
- [ ] Electron Fuses (disable `RunAsNode`, `OnlyLoadAppFromAsar`, ASAR integrity).
- [ ] Secrets in OS keychain (`safeStorage`); never in plain files or logs.
- [ ] Threat model (STRIDE) for desktop, web, and server; reviewed each major release.
- [ ] Code signing + notarization (Apple), Windows signing (Azure Trusted Signing or EV cert).
- [ ] SBOM (CycloneDX) and build provenance (GitHub artifact attestations / SLSA) for every release.
- [ ] OpenSSF Scorecard ≥ 8 and OpenSSF Best Practices "passing" badge before 1.0.
- [ ] Coordinated disclosure policy (SECURITY.md ✅), later a bug bounty.

**Administration** — policies via MDM, silent install, update control, audit logs, SSO/SCIM, RBAC.

**Data** — data residency (bucket region), encryption in transit (TLS 1.2+) and at rest (SSE/KMS,
customer-managed keys for Enterprise), retention and legal hold, export and deletion (GDPR).

**Quality** — unit, integration, E2E (Playwright for Electron and web), media golden tests (frame
hashes, A/V sync), performance benchmarks per release, crash-free sessions ≥ 99.5%.

## 8. Open-source ecosystem compatibility

We follow the conventions of top open-source projects and interoperate through open standards:

| Area                | Standard / project                                                                 |
| ------------------- | ---------------------------------------------------------------------------------- |
| Media               | MP4 (H.264/HEVC/AV1 + AAC/Opus), WebM, fragmented MP4, HLS (hls.js)                |
| Captions            | WebVTT, SRT                                                                        |
| Editing interchange | OpenTimelineIO → DaVinci Resolve, Premiere, Kdenlive and others                    |
| Storage             | S3 API → AWS S3, Cloudflare R2, MinIO, Ceph, Garage, SeaweedFS, Backblaze B2       |
| Local AI            | whisper.cpp, Ollama, llama.cpp server, vLLM, LocalAI (OpenAI-compatible API)       |
| Identity            | OIDC, SAML 2.0, SCIM 2.0 → Keycloak, Authentik, Zitadel, Okta, Entra ID            |
| Embeds              | oEmbed, Open Graph → Slack, Mattermost, Rocket.Chat, Discourse, Notion             |
| Observability       | OpenTelemetry → Grafana, Jaeger, Prometheus; Sentry/GlitchTip for crashes (opt-in) |
| Publishing          | PeerTube API (later YouTube)                                                       |
| Self-hosting        | Docker Compose, Helm; works on Coolify, Dokploy                                    |
| Project hygiene     | SemVer, Conventional Commits, Changesets, DCO, ADRs, SPDX license identifiers      |
| Security            | OpenSSF Scorecard, CodeQL, CycloneDX SBOM, Sigstore/SLSA provenance                |

**Dependency license policy:** shipped code may depend on MIT, BSD, ISC, Apache-2.0, MPL-2.0, Zlib
licensed code. No GPL/AGPL code in shipped artifacts (this keeps Apache-2.0 compatibility for
downstream users). Note: Cap's `scap-*` and `cap-camera*` crates are MIT and may be reused with
attribution; the rest of Cap is AGPL and must not be copied.

## 9. Process

- **Decisions:** significant technical choices get an ADR (`docs/adr/`); larger product changes get an
  RFC as a GitHub Discussion before code.
- **Branching:** trunk-based on `main`, short-lived branches, squash merges, Conventional Commit PR titles.
- **Releases:** Changesets for versioning; channels `beta` → `stable`; desktop auto-update
  per channel from a static feed on R2 (docs/RELEASING.md); release notes generated from changesets.
- **Quality gates on every PR:** lint, typecheck, unit tests, build on 3 OSes, CodeQL, dependency review.

## 10. Risks and mitigations

| Risk                                                    | Impact                                          | Mitigation                                                                  |
| ------------------------------------------------------- | ----------------------------------------------- | --------------------------------------------------------------------------- |
| macOS window exclusion unreliable with ScreenCaptureKit | Bubble can't be re-composited on Mac in Phase 1 | Mode A fallback; native ScreenCaptureKit exclusion in Phase 4               |
| Browser throttles hidden tabs (web recorder freezes)    | Web recordings stall                            | Worker-driven compositor, MediaStreamTrackProcessor + WebCodecs             |
| A/V drift across separate tracks                        | Bad sync in long videos                         | Single monotonic clock, timestamps on every frame/sample, drift tests in CI |
| AI edits remove the wrong content                       | Trust loss                                      | Non-destructive edit plans, per-operation review, confidence scores, undo   |
| Electron footprint criticism                            | Perception                                      | Lazy windows, measured budgets, Rust core for heavy work                    |
| Legal (trade dress, copyright)                          | Takedown risk                                   | Clean-room policy, original brand/UI, trademark search before naming        |
| Maintainer burnout / bus factor                         | Project stalls                                  | GOVERNANCE.md, ≥ 2 maintainers per area via CODEOWNERS, good-first-issues   |
| Native capture differences across OS versions           | Bugs in the field                               | Device lab matrix, crash reporting (opt-in), staged rollouts                |

## 11. Open decisions

| #   | Decision                        | Recommendation                                                                           | Owner   |
| --- | ------------------------------- | ---------------------------------------------------------------------------------------- | ------- |
| D1  | Product name + trademark search | Replace "Kadr" codename before public launch                                             | Founder |
| D2  | License                         | Apache-2.0 core + source-available `ee/` ([ADR-0003](adr/0003-license-and-open-core.md)) | Founder |
| D3  | Merchant of record              | Paddle vs Polar vs Lemon Squeezy (country support, fees)                                 | Founder |
| D4  | Cloud hosting & region          | Start with one region (EU or US) + R2 storage                                            | Eng     |
| D5  | First desktop OS focus          | Windows + macOS together; Linux after Phase 4                                            | Eng     |
| D6  | UI kit                          | Tailwind CSS v4 + Radix primitives (accessible, MIT)                                     | Eng     |
