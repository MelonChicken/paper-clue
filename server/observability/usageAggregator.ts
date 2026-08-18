import { PipelineCallLog, AnalysisRunUsageSummary, StageName, AnalysisMode } from "./types";
import { PRICING_CONFIG } from "../config/pricingConfig";

export function aggregateAnalysisRunUsage(
  analysisRunId: string,
  analysisMode: AnalysisMode,
  paperCount: number,
  callLogs: PipelineCallLog[],
  startedAtIso: string,
  completedAtIso: string,
  briefingTitle?: string,
  budgetStatus: "WITHIN_BUDGET" | "BUDGET_LIMIT_REACHED" | "PARTIAL_ANALYSIS" = "WITHIN_BUDGET",
  budgetDetails?: string
): AnalysisRunUsageSummary {
  const startedAt = new Date(startedAtIso).getTime();
  const completedAt = new Date(completedAtIso).getTime();
  const durationMs = Math.max(0, completedAt - startedAt);

  let totalApiCalls = 0;
  let successfulCalls = 0;
  let failedCalls = 0;
  let retriedCalls = 0;
  let skippedCalls = 0;
  let escalatedCalls = 0;

  let cacheHits = 0;
  let cacheMisses = 0;

  let documentAnalyzerExecuted = 0;
  let documentAnalyzerSkipped = 0;

  let totalPromptTokens = 0;
  let totalCachedInputTokens = 0;
  let totalOutputTokens = 0;
  let totalThinkingTokens = 0;

  let totalSearchRequests = 0;
  let totalSearchQueries = 0;

  let estimatedTokenCostUsd = 0;
  let estimatedSearchCostUsd = 0;
  let totalEstimatedCostUsd = 0;
  let estimatedCacheSavingsUsd = 0;

  const costByStage: Record<StageName, number> = {
    BRIEFING_PARSER: 0,
    METADATA_VERIFIER: 0,
    RESOURCE_VERIFIER: 0,
    DOCUMENT_ANALYZER: 0,
    COMPARISON_FINDER: 0,
    PAPER_EVALUATOR: 0,
    RECOMMENDATION_ENGINE: 0,
    MARKDOWN_REPORT_GENERATOR: 0,
  };

  const tokenUsageByStage: Record<StageName, number> = {
    BRIEFING_PARSER: 0,
    METADATA_VERIFIER: 0,
    RESOURCE_VERIFIER: 0,
    DOCUMENT_ANALYZER: 0,
    COMPARISON_FINDER: 0,
    PAPER_EVALUATOR: 0,
    RECOMMENDATION_ENGINE: 0,
    MARKDOWN_REPORT_GENERATOR: 0,
  };

  const callCountByStage: Record<StageName, number> = {
    BRIEFING_PARSER: 0,
    METADATA_VERIFIER: 0,
    RESOURCE_VERIFIER: 0,
    DOCUMENT_ANALYZER: 0,
    COMPARISON_FINDER: 0,
    PAPER_EVALUATOR: 0,
    RECOMMENDATION_ENGINE: 0,
    MARKDOWN_REPORT_GENERATOR: 0,
  };

  const durationByStage: Record<StageName, number> = {
    BRIEFING_PARSER: 0,
    METADATA_VERIFIER: 0,
    RESOURCE_VERIFIER: 0,
    DOCUMENT_ANALYZER: 0,
    COMPARISON_FINDER: 0,
    PAPER_EVALUATOR: 0,
    RECOMMENDATION_ENGINE: 0,
    MARKDOWN_REPORT_GENERATOR: 0,
  };

  const costByPaper: Record<string, number> = {};

  let partialResultCount = 0;
  let fallbackUsedCount = 0;

  for (const log of callLogs) {
    if (log.skipped) {
      skippedCalls++;
      if (log.stage === "DOCUMENT_ANALYZER") {
        documentAnalyzerSkipped++;
      }
      if (log.cacheHit) {
        cacheHits++;
        // REQUIREMENT 7: Aggregate actual cost saved from log.cost or original envelope cost
        const savedCost = log.cost.totalEstimatedCostUsd || 0.0005;
        estimatedCacheSavingsUsd += savedCost;
      }
      continue;
    }

    totalApiCalls++;
    callCountByStage[log.stage] = (callCountByStage[log.stage] || 0) + 1;
    durationByStage[log.stage] = (durationByStage[log.stage] || 0) + log.durationMs;

    if (log.success) {
      successfulCalls++;
    } else {
      failedCalls++;
    }

    if (log.attempt > 1) {
      retriedCalls++;
    }

    if (log.escalated) {
      escalatedCalls++;
    }

    if (log.cacheHit) {
      cacheHits++;
      const savedCost = log.cost.totalEstimatedCostUsd || 0.0005;
      estimatedCacheSavingsUsd += savedCost;
    } else {
      cacheMisses++;
    }

    if (log.stage === "DOCUMENT_ANALYZER") {
      documentAnalyzerExecuted++;
    }

    // Token accumulation
    const prompt = log.tokenUsage.promptTokens || 0;
    const cachedInput = log.tokenUsage.cachedInputTokens || 0;
    const output = log.tokenUsage.outputTokens || 0;
    const thinking = log.tokenUsage.thinkingTokens || 0;
    const totalTokens = log.tokenUsage.totalTokens || (prompt + output);

    totalPromptTokens += prompt;
    totalCachedInputTokens += cachedInput;
    totalOutputTokens += output;
    totalThinkingTokens += thinking;

    tokenUsageByStage[log.stage] = (tokenUsageByStage[log.stage] || 0) + totalTokens;

    // Search usage
    if (log.searchUsage.groundingEnabled) {
      totalSearchRequests += log.searchUsage.searchRequestCount || 1;
      if (log.searchUsage.searchQueryCount !== null) {
        totalSearchQueries += log.searchUsage.searchQueryCount;
      }
    }

    // Cost accumulation
    const callCost = log.cost.totalEstimatedCostUsd || 0;
    estimatedTokenCostUsd += (log.cost.inputCostUsd || 0) + (log.cost.outputCostUsd || 0) + (log.cost.cachedInputCostUsd || 0);
    estimatedSearchCostUsd += log.cost.searchCostUsd || 0;
    totalEstimatedCostUsd += callCost;

    costByStage[log.stage] = (costByStage[log.stage] || 0) + callCost;

    if (log.paperId) {
      costByPaper[log.paperId] = (costByPaper[log.paperId] || 0) + callCost;
    }
  }

  const cacheTotal = cacheHits + cacheMisses;
  const cacheHitRate = cacheTotal > 0 ? Number((cacheHits / cacheTotal).toFixed(2)) : 0;

  // Find most expensive & slowest stage
  let mostExpensiveStage: StageName | null = null;
  let maxCost = -1;
  let slowestStage: StageName | null = null;
  let maxDuration = -1;

  (Object.keys(costByStage) as StageName[]).forEach((stg) => {
    if (costByStage[stg] > maxCost && callCountByStage[stg] > 0) {
      maxCost = costByStage[stg];
      mostExpensiveStage = stg;
    }
    if (durationByStage[stg] > maxDuration && callCountByStage[stg] > 0) {
      maxDuration = durationByStage[stg];
      slowestStage = stg;
    }
  });

  return {
    analysisRunId,
    briefingTitle,
    analysisMode,
    startedAt: startedAtIso,
    completedAt: completedAtIso,
    durationMs,
    paperCount,
    totalApiCalls,
    successfulCalls,
    failedCalls,
    retriedCalls,
    skippedCalls,
    escalatedCalls,
    cacheHits,
    cacheMisses,
    cacheHitRate,
    estimatedCacheSavingsUsd: Number(estimatedCacheSavingsUsd.toFixed(4)),
    documentAnalyzerExecuted,
    documentAnalyzerSkipped,
    totalPromptTokens,
    totalCachedInputTokens,
    totalOutputTokens,
    totalThinkingTokens,
    totalTokens: totalPromptTokens + totalOutputTokens,
    totalSearchRequests,
    totalSearchQueries,
    estimatedTokenCostUsd: Number(estimatedTokenCostUsd.toFixed(4)),
    estimatedSearchCostUsd: Number(estimatedSearchCostUsd.toFixed(4)),
    totalEstimatedCostUsd: Number(totalEstimatedCostUsd.toFixed(4)),
    costByStage,
    tokenUsageByStage,
    callCountByStage,
    durationByStage,
    costByPaper,
    mostExpensiveStage,
    slowestStage,
    budgetStatus,
    budgetDetails,
    partialResultCount,
    fallbackUsedCount,
    pricingVersion: PRICING_CONFIG.pricingVersion,
    pricingDate: PRICING_CONFIG.effectiveFrom,
  };
}
