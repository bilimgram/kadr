# 0010. Notes while recording: shortcut notes and spoken notes

- Status: Proposed
- Date: 2026-11-07

## Context

Users want to leave instructions for the edit while they record, without stopping:

- "add a note: put a chart here";
- "eslatma qo'sh: shu joyini kes";
- "add a note: cut the last few seconds, I'm saying it again".

The notes must land on the timeline, together with where the pointer was, so that whoever edits
the video later can act on them: the user, Kadr's AI editing ([ADR-0005](0005-ai-edits-as-declarative-edit-plans.md)),
or another AI the video is handed to. Uzbek and Russian matter as much as English.

[ADR-0008](0008-ai-director-cloud-voice-editing.md) (proposed) plans voice commands with
tap-to-talk and cloud speech-to-text on the user's own key, and defers wake words because they
misfire on normal speech and need continuous recognition.

## Decision

1. **A note is data.** A new `note` event in `events.jsonl` (additive within `FORMAT_VERSION` 1)
   records:
   - `t`;
   - `source` (`shortcut` or `voice`);
   - `text`, once transcribed;
   - `speech`, the time range of the spoken note, so an editor can cut it;
   - `position`, the pointer on the recorded area.
2. **Shortcut notes work offline.** The toolbar's note button, or the note shortcut
   (<kbd>Alt</kbd>+<kbd>Shift</kbd>+<kbd>N</kbd>, falling back to
   <kbd>Ctrl</kbd>+<kbd>Alt</kbd>+<kbd>N</kbd>), marks the moment and the pointer. The utterance
   that starts within 4 s is the note's speech. Utterances are found from microphone levels
   (adaptive noise floor, `SpeechDetector`); no AI is involved. The shortcut is held only while
   recording.
3. **Spoken notes are opt-in and use the user's OpenAI key.** With _Listen for spoken notes_ on:
   - each utterance is sent from the main process as a 16 kHz WAV clip, and silence never is;
   - the model is `gpt-transcribe`, with the trigger phrases as `keywords[]` and an optional
     language hint;
   - a specific trigger phrase starts a note: "add a note", "editor's note", "eslatma qo'sh",
     "izoh qoldir", "добавь заметку" and their inflections, with Uzbek Cyrillic transliterated
     first.

   This **amends ADR-0008 for notes only**: notes never control the recorder or change footage, so
   a false trigger costs a stray note. Keys are stored as ADR-0008 describes (`safeStorage`, main
   process only).
4. **Rules read the notes:**
   - "cut the last N seconds" and retakes ("I'm restating it", "qaytadan", "заново") become cuts;
   - the spoken note itself is always proposed for cutting;
   - all of these go to `edits/notes.json` as `proposed` operations, so nothing is applied without
     review;
   - free-form notes stay in the event log, and the edit-plan prompt now tells the AI to follow
     them (`PROMPT_VERSION` 0.2.0).
5. **Files next to the video**, written only when there are notes or a transcript:
   - `<name>.kadr/`, holding `manifest.json`, `events.jsonl`, `transcript.json`
     (`timing: "segment"`) and `edits/notes.json`. The manifest's new optional `media` field names
     the video next to the bundle.
   - `<name> notes.md`, a readable table of times, notes and pointer positions plus the suggested
     cuts, for people and for any AI editor.
6. **A plain `fetch` call instead of OpenAI's SDK:** for one multipart endpoint this keeps the main
   bundle small. Adapters move into `@kadr/ai-editor` with the SDKs when AI Director needs more.

## Consequences

- With listening on, Kadr makes network requests to `api.openai.com` while recording, and the
  user's OpenAI account is billed. `PRIVACY.md` documents this, and it is off by default.
- Transcription runs a few seconds behind speech, so spoken notes appear on the toolbar with that
  delay. Stopping waits up to 8 s for transcriptions still in flight.
- How well Uzbek is recognized depends on the provider. The language hint falls back to
  auto-detection if the API rejects it.
- AI Director (ADR-0008) can reuse the audio tap, the speech detector, the transcription path and
  the note events for its to-do list.
- The web app doesn't record notes yet; the logic lives in shared packages.

## Alternatives considered

- **Chromium's Web Speech API:** not available in Electron, and it sends audio to Google.
- **Local keyword spotting (Vosk):** works offline, but needs a ~50 MB model per language, CPU while
  recording, and its browser build is unmaintained. A candidate local provider later.
- **Local Whisper:** a full 30-second encoder pass per clip on the CPU, and small models handle
  Uzbek poorly. Deferred to the local-provider ADR that ADR-0008 anticipates.
- **Shortcut only:** kept as the offline path, but it misses the hands-free use asked for.
- **Transcribing after the recording only:** simpler, but no live feedback that a note was taken,
  and the whole microphone track would be sent at once.
