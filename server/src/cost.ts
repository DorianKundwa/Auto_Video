/**
 * Token accounting. Prices are per 1M tokens in USD and are only an estimate —
 * they are intentionally kept in one table so they can be updated without
 * touching the LLM module. Verify against the provider's pricing page.
 */

export interface LlmUsage {
  inputTokens: number;
  outputTokens: number;
}

export interface Pricing {
  inputPerMillionUsd: number;
  outputPerMillionUsd: number;
}

export const PRICING: Record<string, Pricing> = {
  'deepseek-chat': { inputPerMillionUsd: 0.27, outputPerMillionUsd: 1.1 },
  'deepseek-reasoner': { inputPerMillionUsd: 0.55, outputPerMillionUsd: 2.19 },
};

export const DEFAULT_PRICING: Pricing = PRICING['deepseek-chat'] as Pricing;

export function pricingFor(model: string): Pricing {
  return PRICING[model] ?? DEFAULT_PRICING;
}

export function costForUsage(model: string, usage: LlmUsage): number {
  const pricing = pricingFor(model);
  const usd =
    (usage.inputTokens / 1_000_000) * pricing.inputPerMillionUsd +
    (usage.outputTokens / 1_000_000) * pricing.outputPerMillionUsd;
  return Math.round(usd * 1_000_000) / 1_000_000;
}

/** Rough token estimate used for mock mode and pre-flight cost hints. */
export function estimateUsage(...texts: string[]): LlmUsage {
  const chars = texts.reduce((sum, text) => sum + text.length, 0);
  return {
    inputTokens: Math.ceil(chars / 4),
    outputTokens: Math.max(1, Math.ceil(chars / 8)),
  };
}
