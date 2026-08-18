export interface ProviderModelPricing {
  provider: "OPENAI" | "GEMINI";
  model: string;
  inputUsdPerMillionTokens: number;
  cachedInputUsdPerMillionTokens?: number;
  outputUsdPerMillionTokens: number;
  effectiveFrom: string;
  source: string;
}

export const PROVIDER_MODEL_PRICING: Record<string, ProviderModelPricing> = {
  "gpt-4.1-mini": {
    provider: "OPENAI",
    model: "gpt-4.1-mini",
    inputUsdPerMillionTokens: 0.15,
    cachedInputUsdPerMillionTokens: 0.075,
    outputUsdPerMillionTokens: 0.60,
    effectiveFrom: "2026-08-05",
    source: "OpenAI Official Pricing",
  },
  "gpt-4.1-o": {
    provider: "OPENAI",
    model: "gpt-4.1-o",
    inputUsdPerMillionTokens: 2.50,
    cachedInputUsdPerMillionTokens: 1.25,
    outputUsdPerMillionTokens: 10.00,
    effectiveFrom: "2026-08-05",
    source: "OpenAI Official Pricing",
  },
  "gpt-4o-mini": {
    provider: "OPENAI",
    model: "gpt-4o-mini",
    inputUsdPerMillionTokens: 0.15,
    cachedInputUsdPerMillionTokens: 0.075,
    outputUsdPerMillionTokens: 0.60,
    effectiveFrom: "2026-08-05",
    source: "OpenAI Official Pricing",
  },
  "gpt-4o": {
    provider: "OPENAI",
    model: "gpt-4o",
    inputUsdPerMillionTokens: 2.50,
    cachedInputUsdPerMillionTokens: 1.25,
    outputUsdPerMillionTokens: 10.00,
    effectiveFrom: "2026-08-05",
    source: "OpenAI Official Pricing",
  },
  "gemini-2.5-flash": {
    provider: "GEMINI",
    model: "gemini-2.5-flash",
    inputUsdPerMillionTokens: 0.10,
    cachedInputUsdPerMillionTokens: 0.025,
    outputUsdPerMillionTokens: 0.40,
    effectiveFrom: "2026-08-05",
    source: "Google AI Studio Official Pricing Schedule",
  },
  "gemini-2.5-pro": {
    provider: "GEMINI",
    model: "gemini-2.5-pro",
    inputUsdPerMillionTokens: 1.25,
    cachedInputUsdPerMillionTokens: 0.3125,
    outputUsdPerMillionTokens: 5.00,
    effectiveFrom: "2026-08-05",
    source: "Google AI Studio Official Pricing Schedule",
  },
};

export const WEB_SEARCH_CALL_COST_USD = {
  OPENAI: 0.01,
  GEMINI: 0.035,
};

export function getProviderModelPricing(model: string): ProviderModelPricing | null {
  return PROVIDER_MODEL_PRICING[model] || null;
}
