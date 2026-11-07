# 0008. AI Director: cloud speech-to-text and voice-driven edit plans

- Status: Proposed
- Date: 2026-10-28

## Context

Users want to control and edit a recording by voice while recording ("pause", "cut the last four
seconds", "retake"), and to see a live to-do list of the edits (what to cut, what to retake, what to
re-record) during the recording instead of trying to remember them afterwards. [ADR-0005](0005-ai-edits-as-declarative-edit-plans.md) covers AI edit
plans after recording; it doesn't cover live input.

PLAN.md expects local transcription (whisper.cpp) by default. Shipping it first means a model
download, CPU load during recording, and native work before any AI feature exists. Chromium's Web
Speech API isn't usable in Electron (it needs a Google API key), and Claude's API doesn't accept
audio. The feature plan is [AI_DIRECTOR.md](../AI_DIRECTOR.md).

## Decision

1. **Live AI produces data only.** Voice commands and AI insights become session commands from a
   fixed set (pause, resume, stop), markers, and an edit to-do list in a new `todos.json`. Each to-do
   links to the edit operations that carry it out in a live "director" edit plan (ADR-0005); to-dos
   Kadr can't carry out yet (re-record, zoom) have none. The recording itself is never modified;
   checked to-dos are applied at export.
2. **Version 1 is cloud-only, with the user's own key: OpenAI and Gemini**, through their official
   SDKs. Users choose a provider per job: _listening_ (speech-to-text) and _brain_ (command
   fallback, edit to-dos, edit plans). Local models and Claude are deferred; they fit the same
   `TranscriptionProvider` and `LlmProvider` interfaces.
3. **Provider calls run in the main process.** Keys are encrypted with `safeStorage`; renderers send
   audio over IPC and never receive keys. Provider hosts are fixed: no custom endpoints in v1.
4. **Commands are explicit.** Tapping a global shortcut or the toolbar button starts a command clip.
   Rules parse common commands; the brain handles the rest, and its output is validated against
   the intent schema. Destructive session commands (restart, discard) are not available by voice.
5. **Only microphone audio is sent**, only while AI Director is on, and never silence. Continuous
   listening stops while paused.
6. **Cut boundaries snap to silences measured locally** from microphone levels, so cut quality
   doesn't depend on provider timestamps.
7. **Format additions stay within `FORMAT_VERSION` 1:** a `voice.command` event, `todos.json`,
   `Transcript.timing`, and an optional `origin` on edit operations. No new operation types.

## Consequences

- AI Director needs a network connection and a key; without them Kadr records exactly as before.
  Offline AI (PLAN.md §2 and Phase 3) moves to a later release, and a new ADR will cover local
  providers.
- Users pay their provider, so the app shows cost estimates and enforces a per-recording limit.
- Edited videos need an export step; the raw take stays available immediately. The desktop app
  gains a director panel window, a review window, and a read-only media route on the app protocol.
- Recordings made with AI Director on are bundles (raw take + sidecars) next to the exported file.
- `PRIVACY.md` must describe the new network traffic before release.

## Alternatives considered

- **Local whisper.cpp and Ollama first:** free and private, but a 75–500 MB download, CPU load while
  recording, and native work that delays every AI feature. Deferred, not rejected.
- **Wake word / always-on commands:** hands-free, but misfires on normal speech and needs
  continuous recognition. Later.
- **Provider calls from renderers with ephemeral tokens:** needs a looser CSP and puts credentials
  in more code.
- **Applying edits to the recording live:** `MediaRecorder` can't take back data it has already
  emitted, and destructive edits can't be undone.
- **Realtime streaming APIs:** lower latency, but provider-specific protocols; one short request per
  command clip and speech chunk is enough for v1.
