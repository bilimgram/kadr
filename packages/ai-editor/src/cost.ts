import type { ModelPricing, TokenUsage } from "./providers";

/**
 * Rough token estimate (~4 characters per token) for showing a cost preview before a run. Use the
 * provider's token-counting endpoint when exact numbers matter.
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/** Estimated cost in US dollars for a token usage at the given per-million-token prices. */
export function estimateCostUsd(usage: TokenUsage, pricing: ModelPricing): number {
  const cached = usage.cacheReadTokens ?? 0;
  const uncachedInput = Math.max(usage.inputTokens - cached, 0);
  const cacheRate = pricing.cacheReadPerMTok ?? pricing.inputPerMTok;
  return (
    (uncachedInput * pricing.inputPerMTok +
      cached * cacheRate +
      usage.outputTokens * pricing.outputPerMTok) /
    1_000_000
  );
}
