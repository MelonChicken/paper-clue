export interface ModelPricing {
  model: string;
  inputUsdPerMillionTokens: number;
  cachedInputUsdPerMillionTokens?: number;
  outputUsdPerMillionTokens: number;
  thinkingBillingMode:
    | "INCLUDED_IN_OUTPUT"
    | "SEPARATE"
    | "NOT_APPLICABLE"
    | "UNKNOWN";
  thinkingUsdPerMillionTokens?: number;
  effectiveFrom: string;
  source: string;
}

export interface SearchPricing {
  provider: "GOOGLE_SEARCH_GROUNDING";
  freeAllowanceDescription?: string;
  usdPerQuery?: number;
  effectiveFrom: string;
  source: string;
}

export interface PricingConfig {
  pricingVersion: string;
  effectiveFrom: string;
  models: Record<string, ModelPricing>;
  search: SearchPricing;
}

export const PRICING_CONFIG: PricingConfig = {
  pricingVersion: "v2026.08.05",
  effectiveFrom: "2026-08-05",
  models: {
    "gemini-2.5-flash": {
      model: "gemini-2.5-flash",
      inputUsdPerMillionTokens: 0.075,
      cachedInputUsdPerMillionTokens: 0.01875,
      outputUsdPerMillionTokens: 0.30,
      thinkingBillingMode: "INCLUDED_IN_OUTPUT",
      effectiveFrom: "2026-08-05",
      source: "Google AI Studio Official Pricing Schedule",
    },
    "gemini-2.5-pro": {
      model: "gemini-2.5-pro",
      inputUsdPerMillionTokens: 1.25,
      cachedInputUsdPerMillionTokens: 0.3125,
      outputUsdPerMillionTokens: 5.00,
      thinkingBillingMode: "INCLUDED_IN_OUTPUT",
      effectiveFrom: "2026-08-05",
      source: "Google AI Studio Official Pricing Schedule",
    },
    "gemini-3.6-flash": {
      model: "gemini-3.6-flash",
      inputUsdPerMillionTokens: 0.10,
      cachedInputUsdPerMillionTokens: 0.025,
      outputUsdPerMillionTokens: 0.40,
      thinkingBillingMode: "INCLUDED_IN_OUTPUT",
      effectiveFrom: "2026-08-05",
      source: "Google AI Studio Official Pricing Schedule",
    },
    "gemini-3.1-flash-lite": {
      model: "gemini-3.1-flash-lite",
      inputUsdPerMillionTokens: 0.05,
      cachedInputUsdPerMillionTokens: 0.0125,
      outputUsdPerMillionTokens: 0.20,
      thinkingBillingMode: "NOT_APPLICABLE",
      effectiveFrom: "2026-08-05",
      source: "Google AI Studio Official Pricing Schedule",
    },
    "gemini-3.1-pro-preview": {
      model: "gemini-3.1-pro-preview",
      inputUsdPerMillionTokens: 1.25,
      cachedInputUsdPerMillionTokens: 0.3125,
      outputUsdPerMillionTokens: 5.00,
      thinkingBillingMode: "INCLUDED_IN_OUTPUT",
      effectiveFrom: "2026-08-05",
      source: "Google AI Studio Official Pricing Schedule",
    },
    "gemini-flash-latest": {
      model: "gemini-flash-latest",
      inputUsdPerMillionTokens: 0.10,
      cachedInputUsdPerMillionTokens: 0.025,
      outputUsdPerMillionTokens: 0.40,
      thinkingBillingMode: "INCLUDED_IN_OUTPUT",
      effectiveFrom: "2026-08-05",
      source: "Google AI Studio Official Pricing Schedule",
    },
  },
  search: {
    provider: "GOOGLE_SEARCH_GROUNDING",
    freeAllowanceDescription: "First 1,500 queries/day free",
    usdPerQuery: 0.035,
    effectiveFrom: "2026-08-05",
    source: "Google Search Grounding Pricing Schedule",
  },
};
