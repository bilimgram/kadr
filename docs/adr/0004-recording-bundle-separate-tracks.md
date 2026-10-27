# 0004. Recording bundle with separate tracks and an event log

- Status: Accepted
- Date: 2026-10-27

## Context

The bubble must be live during recording (what you see is what you get), yet AI and manual editing
should be able to move, resize, or hide the bubble, zoom on clicks, and cut precisely afterwards. Loom
bakes the bubble into the screen recording, which makes this impossible.

## Decision

- A recording is a **bundle folder** (`.kadr`) containing separate media tracks (screen, camera,
  microphone, system audio), an optional live composite, an `events.jsonl` event log, a word-level
  transcript, and non-destructive edit plans. Schemas live in `@kadr/project-format`.
- All timestamps are **integer microseconds since recording start on one monotonic clock**.
- Media tracks are **fragmented MP4** (crash-safe, streamable); WebM is accepted on import.
- The event log records cursor, clicks, keyboard activity counts (never contents), window focus, bubble
  layout changes, markers, and pause/resume.
- The format is versioned; readers reject unknown major versions and ignore unknown fields.

## Consequences

- Editing and AI can re-layout the bubble and apply zooms without quality loss.
- Disk usage is higher (several tracks); mitigated by hardware encoding and optional cleanup of raw
  tracks after export.
- Other tools can read and write bundles via the published JSON Schemas.

## Alternatives considered

- **Single composited file (Loom-style):** simplest, but no post-recording layout changes, and AI edits
  are limited to cuts.
- **Proprietary project database (SQLite):** fast queries, but opaque to users and other tools.
