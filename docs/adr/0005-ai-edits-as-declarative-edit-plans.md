# 0005. AI edits as declarative, validated edit plans (BYOK)

- Status: Accepted
- Date: 2026-10-27

## Context

Users should get a good edit automatically after recording, using their own AI provider key or a local
model. AI output can be wrong, and the project must not pay for users' inference.

## Decision

- The AI never edits media directly. It returns an **`EditPlan`**: a list of typed operations (cut,
  speed, zoom, bubble layout, blur, chapter) plus title and summary, defined in `@kadr/project-format`.
- Every plan is **validated** (schema, time ranges within duration, non-overlapping cuts) before it is
  shown. Each operation carries a reason and confidence and can be accepted or rejected individually.
- A **deterministic pre-pass** (silences, filler words) runs without any AI and feeds the LLM as hints.
- Providers sit behind small adapter interfaces; adapters use each provider's official SDK. An
  OpenAI-compatible adapter covers local servers (Ollama, llama.cpp, vLLM, LocalAI).
- **BYOK:** keys stay on the client (OS keychain on desktop) and requests go directly to the provider.
  Managed AI (no key) is a paid Kadr Cloud feature.

## Consequences

- Edits are reversible, reviewable, reproducible, and portable (export to OpenTimelineIO).
- Prompt and schema changes are versioned (`promptVersion`) and covered by evaluation fixtures.
- Quality depends on the transcript; local transcription must be good enough by default (whisper.cpp).

## Alternatives considered

- **Generative video editing (model outputs pixels):** expensive, slow, unpredictable, and hard to review.
- **Server-side AI with our own keys:** simple for users, but makes the free product cost us money per
  edit; kept only as the paid managed option.
