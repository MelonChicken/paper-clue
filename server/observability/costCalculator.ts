import { TokenUsageRecord, SearchUsageRecord, CostEstimate } from "./types.js";
import {
  PROVIDER_MODEL_PRICING,
  WEB_SEARCH_CALL_COST_USD,
  ProviderModelPricing,
} from "../config/providerPricing.js";

export function calculateEstimatedCost(
  provider: "OPENAI" | "GEMINI",
  model: string,
  usage: TokenUsageRecord,
  searchUsage: SearchUsageRecord
): CostEstimate {
  const modelPricing: ProviderModelPricing | undefined = PROVIDER_MODEL_PRICING[model];
  const estimatedAt = new Date().toISOString();

  if (!modelPricing) {
    return {
      inputCostUsd: null,
      cachedInputCostUsd: null,
      outputCostUsd: null,
      thinkingCostUsd: null,
      searchCostUsd: null,
      totalEstimatedCostUsd: null,
      pricingVersion: "v2026.08-provider",
      pricingSource: "Unknown Model Pricing",
      estimatedAt,
      measurementStatus: "UNAVAILABLE",
      note: `No pricing rules registered for model: ${model}`,
    };
  }

  let inputCostUsd: number | null = null;
  let cachedInputCostUsd: number | null = null;
  let outputCostUsd: number | null = null;
  let thinkingCostUsd: number | null = 0;

  if (usage.promptTokens !== null) {
    const cachedTokens = usage.cachedInputTokens || 0;
    const nonCachedTokens = Math.max(0, usage.promptTokens - cachedTokens);

    inputCostUsd = (nonCachedTokens / 1_000_000) * modelPricing.inputUsdPerMillionTokens;

    if (cachedTokens > 0) {
      const cachedRate =
        modelPricing.cachedInputUsdPerMillionTokens ??
        modelPricing.inputUsdPerMillionTokens * 0.5;
      cachedInputCostUsd = (cachedTokens / 1_000_000) * cachedRate;
    } else {
      cachedInputCostUsd = 0;
    }
  }

  if (usage.outputTokens !== null) {
    outputCostUsd = (usage.outputTokens / 1_000_000) * modelPricing.outputUsdPerMillionTokens;
  }

  // Web search cost calculation
  let searchCostUsd: number | null = 0;

  if (searchUsage.groundingEnabled) {
    if (provider === "OPENAI") {
      const searchCalls = searchUsage.searchRequestCount ?? 0;
      searchCostUsd = searchCalls * WEB_SEARCH_CALL_COST_USD.OPENAI;
    } else {
      const searchQueries = searchUsage.searchQueryCount ?? searchUsage.searchRequestCount ?? 0;
      searchCostUsd = searchQueries * WEB_SEARCH_CALL_COST_USD.GEMINI;
    }
  }

  const tokenCostSum =
    (inputCostUsd !== null ? inputCostUsd : 0) +
    (cachedInputCostUsd !== null ? cachedInputCostUsd : 0) +
    (outputCostUsd !== null ? outputCostUsd : 0);

  const totalEstimatedCostUsd =
    inputCostUsd === null || outputCostUsd === null
      ? null
      : tokenCostSum + (searchCostUsd || 0);

  const isMeasured = usage.measurementStatus === "MEASURED";

  return {
    inputCostUsd,
    cachedInputCostUsd,
    outputCostUsd,
    thinkingCostUsd,
    searchCostUsd,
    totalEstimatedCostUsd,
    pricingVersion: "v2026.08-provider",
    pricingSource: modelPricing.source,
    estimatedAt,
    measurementStatus: isMeasured ? "MEASURED" : "ESTIMATED",
  };
}
