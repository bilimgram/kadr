---
"@kadr/project-format": minor
"@kadr/recorder-core": minor
"@kadr/ai-editor": minor
"@kadr/desktop": minor
---

Notes while recording (ADR 0010). Press the note button or Alt+Shift+N and say what to fix: Kadr
records the moment, the pointer position and your spoken note, and saves `… notes.md` and a `.kadr`
bundle next to the video. With your own OpenAI key, say "add a note" (or "eslatma qo'sh",
"добавь заметку") hands-free. Rules turn retakes and "cut the last N seconds" into proposed cuts.
The format gains a `note` event, `Transcript.timing` and `Manifest.media` (additive).
