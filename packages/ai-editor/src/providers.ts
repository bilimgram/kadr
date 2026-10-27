import type { Transcript } from "@kadr/project-format";

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens?: number;
}

export interface CompletionRequest {
  system: string;
  prompt: string;
  /** JSON Schema the response must follow (providers with structured outputs enforce it). */
  responseSchema?: Record<string, unknown>;
  /** Optional keyframes for vision-capable models (PNG/JPEG bytes). */
  images?: ReadonlyArray<{ mediaType: "image/png" | "image/jpeg"; data: Uint8Array }>;
  signal?: AbortSignal;
}

export interface CompletionResult {
  text: string;
  usage: TokenUsage;
  model: string;
}

/**
 * An LLM backend. Adapters live in separate entry points and wrap each provider's official SDK
 * (e.g. `@anthropic-ai/sdk`); an OpenAI-compatible adapter covers Ollama, llama.cpp, vLLM and LocalAI.
 * Keys are supplied by the user and never leave the client.
 */
export interface LlmProvider {
  readonly id: string;
  readonly model: string;
  complete(request: CompletionRequest): Promise<CompletionResult>;
}

export interface TranscriptionRequest {
  audio: Blob;
  /** BCP 47 hint; omit for auto-detection. */
  language?: string;
  signal?: AbortSignal;
}

/** Speech-to-text backend: local whisper.cpp by default, cloud providers optionally. */
export interface TranscriptionProvider {
  readonly id: string;
  transcribe(request: TranscriptionRequest): Promise<Transcript>;
}

/** Per-million-token prices, entered or fetched per provider/model and shown before each run. */
export interface ModelPricing {
  inputPerMTok: number;
  outputPerMTok: number;
  cacheReadPerMTok?: number;
}
