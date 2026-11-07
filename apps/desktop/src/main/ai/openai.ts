import type { AiTestResult, NotesLanguage, TranscriptionResult } from "../../shared/api";

/**
 * Speech-to-text for spoken notes with the user's own OpenAI key (ADR 0010). One multipart request
 * per utterance; the host is fixed and bodies are never logged.
 */
export const OPENAI_API = "https://api.openai.com/v1";
/** OpenAI's recommended transcription model (the gpt-4o and whisper models retire in Feb 2027). */
export const OPENAI_TRANSCRIBE_MODEL = "gpt-transcribe";

/** Words that help the model hear the note triggers in every supported language. */
export const NOTE_KEYWORDS = [
  "add a note",
  "editor's note",
  "eslatma qo'sh",
  "izoh",
  "добавь заметку",
  "Kadr",
];

const PROMPT =
  "Narration of a screen recording. The speaker may say “add a note”, “eslatma qo'sh” or " +
  "“добавь заметку”, followed by an instruction for the video editor.";

const REQUEST_TIMEOUT_MS = 20_000;

export type ProviderErrorKind = "auth" | "quota" | "rate" | "network" | "invalid" | "server";

/** A provider failure with a message that can be shown to the user as is. */
export class ProviderError extends Error {
  constructor(
    readonly kind: ProviderErrorKind,
    message: string,
  ) {
    super(message);
    this.name = "ProviderError";
  }
}

type Fetch = typeof fetch;

async function errorFor(response: Response): Promise<ProviderError> {
  let code = "";
  try {
    const body = (await response.json()) as { error?: { code?: unknown } };
    code = typeof body.error?.code === "string" ? body.error.code : "";
  } catch {
    // Not JSON; the status says enough.
  }
  if (response.status === 401) return new ProviderError("auth", "OpenAI rejected the API key.");
  if (response.status === 403) {
    return new ProviderError("auth", "This OpenAI key can't use the transcription model.");
  }
  if (response.status === 429) {
    return code === "insufficient_quota"
      ? new ProviderError("quota", "Your OpenAI account is out of credit.")
      : new ProviderError("rate", "OpenAI is busy (rate limit). Notes will resume shortly.");
  }
  if (response.status >= 500) return new ProviderError("server", "OpenAI is having trouble.");
  return new ProviderError("invalid", `OpenAI couldn't process the audio (${response.status}).`);
}

async function send(fetchImpl: Fetch, url: string, init: RequestInit): Promise<Response> {
  try {
    return await fetchImpl(url, { ...init, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
  } catch {
    throw new ProviderError("network", "Can't reach OpenAI. Check the connection.");
  }
}

/** Transcribes one WAV clip. A language the API doesn't accept falls back to auto-detection. */
export async function transcribeWithOpenAi(
  key: string,
  wav: Uint8Array,
  language: NotesLanguage,
  fetchImpl: Fetch = fetch,
): Promise<TranscriptionResult> {
  const request = async (withLanguage: boolean) => {
    const form = new FormData();
    form.append("model", OPENAI_TRANSCRIBE_MODEL);
    form.append("file", new Blob([new Uint8Array(wav)], { type: "audio/wav" }), "note.wav");
    form.append("prompt", PROMPT);
    for (const keyword of NOTE_KEYWORDS) form.append("keywords[]", keyword);
    if (withLanguage && language !== "auto") form.append("languages[]", language);
    return send(fetchImpl, `${OPENAI_API}/audio/transcriptions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}` },
      body: form,
    });
  };

  let response = await request(true);
  if (response.status === 400 && language !== "auto") response = await request(false);
  if (!response.ok) throw await errorFor(response);

  const body = (await response.json()) as { text?: unknown; languages?: unknown };
  const text = typeof body.text === "string" ? body.text.slice(0, 10_000) : "";
  const languages = Array.isArray(body.languages)
    ? body.languages
        .map((entry: unknown) =>
          typeof entry === "object" && entry !== null && "code" in entry ? String(entry.code) : "",
        )
        .filter((code) => code.length > 0 && code.length <= 16)
        .slice(0, 8)
    : [];
  return { text, languages };
}

/** Checks that the key works and can use the transcription model. */
export async function testOpenAiKey(key: string, fetchImpl: Fetch = fetch): Promise<AiTestResult> {
  try {
    const response = await send(fetchImpl, `${OPENAI_API}/models/${OPENAI_TRANSCRIBE_MODEL}`, {
      headers: { Authorization: `Bearer ${key}` },
    });
    if (response.ok) return { ok: true, message: "Connected. Spoken notes are ready." };
    if (response.status === 404) {
      return { ok: false, message: "This key works, but can't use OpenAI's transcription model." };
    }
    return { ok: false, message: (await errorFor(response)).message };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : String(error) };
  }
}
