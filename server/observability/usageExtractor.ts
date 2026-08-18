import { TokenUsageRecord, SearchUsageRecord } from "./types";
import { GenerateContentResponse } from "@google/genai";

export function extractTokenUsage(response?: GenerateContentResponse | null): TokenUsageRecord {
  if (!response || !response.usageMetadata) {
    return {
      promptTokens: null,
      cachedInputTokens: null,
      outputTokens: null,
      thinkingTokens: null,
      totalTokens: null,
      measurementStatus: "UNAVAILABLE",
    };
  }

  const meta = response.usageMetadata as any;

  const promptTokens = typeof meta.promptTokenCount === "number" ? meta.promptTokenCount : null;
  const cachedInputTokens = typeof meta.cachedContentTokenCount === "number" ? meta.cachedContentTokenCount : null;
  const outputTokens = typeof meta.candidatesTokenCount === "number" ? meta.candidatesTokenCount : null;
  const thinkingTokens = typeof meta.thoughtsTokenCount === "number" ? meta.thoughtsTokenCount : (typeof meta.thinkingTokenCount === "number" ? meta.thinkingTokenCount : null);
  const totalTokens = typeof meta.totalTokenCount === "number" ? meta.totalTokenCount : null;

  const hasAny = promptTokens !== null || outputTokens !== null || totalTokens !== null;

  return {
    promptTokens,
    cachedInputTokens,
    outputTokens,
    thinkingTokens,
    totalTokens: totalTokens ?? ((promptTokens || 0) + (outputTokens || 0)),
    measurementStatus: hasAny ? "MEASURED" : "UNAVAILABLE",
  };
}

export function extractSearchUsage(
  response?: GenerateContentResponse | null,
  groundingEnabled = false
): SearchUsageRecord {
  if (!groundingEnabled) {
    return {
      groundingEnabled: false,
      searchRequestCount: 0,
      searchQueryCount: 0,
      measurementStatus: "MEASURED",
    };
  }

  const candidate = response?.candidates?.[0];
  const metadata = candidate?.groundingMetadata;

  if (!metadata) {
    return {
      groundingEnabled: true,
      searchRequestCount: 1,
      searchQueryCount: null,
      measurementStatus: "UNAVAILABLE",
      note: "Grounding enabled but groundingMetadata not returned in response",
    };
  }

  const webQueries = metadata.webSearchQueries as string[] | undefined;
  const queryCount = webQueries && Array.isArray(webQueries) ? webQueries.length : null;

  return {
    groundingEnabled: true,
    searchRequestCount: 1,
    searchQueryCount: queryCount,
    measurementStatus: queryCount !== null ? "MEASURED" : "ESTIMATED",
  };
}
