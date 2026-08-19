export type PipelineStage =
  | "BRIEFING_PARSER"
  | "METADATA_VERIFIER"
  | "RESOURCE_VERIFIER"
  | "DOCUMENT_ANALYZER"
  | "COMPARISON_FINDER"
  | "PAPER_EVALUATOR"
  | "RECOMMENDATION_ENGINE"
  | "MARKDOWN_REPORT_GENERATOR";

export type StageName = PipelineStage;

export type AnalysisMode = "STANDARD";

export type MeasurementStatus = "MEASURED" | "ESTIMATED" | "UNAVAILABLE";

export interface TokenUsageRecord {
  promptTokens: number | null;
  cachedInputTokens: number | null;
  outputTokens: number | null;
  thinkingTokens: number | null;
  totalTokens: number | null;
  measurementStatus: MeasurementStatus;
}

export interface SearchUsageRecord {
  groundingEnabled: boolean;
  searchRequestCount: number | null;
  searchQueryCount: number | null;
  measurementStatus: MeasurementStatus;
  note?: string;
}

export interface CostEstimate {
  inputCostUsd: number | null;
  cachedInputCostUsd: number | null;
  outputCostUsd: number | null;
  thinkingCostUsd: number | null;
  searchCostUsd: number | null;
  estimatedSearchCostWithoutFreeAllowanceUsd?: number | null;
  totalEstimatedCostUsd: number | null;
  pricingVersion: string;
  pricingSource: string;
  estimatedAt: string;
  measurementStatus: MeasurementStatus;
  note?: string;
}

export interface PipelineCallLog {
  callId: string;
  analysisRunId: string;
  paperId?: string;
  stage: StageName;

  provider: "OPENAI" | "GEMINI";
  model: string;
  responseId?: string;
  attempt: number;
  cacheHit: boolean;
  skipped: boolean;
  skipReason?: string;

  startedAt: string;
  completedAt: string;
  durationMs: number;

  success: boolean;
  errorCode?: string;
  errorMessage?: string;

  escalated?: boolean;
  escalationReason?: string;

  tokenUsage: TokenUsageRecord;
  searchUsage: SearchUsageRecord;
  cost: CostEstimate;
}

export interface AnalysisRunUsageSummary {
  analysisRunId: string;
  briefingTitle?: string;
  analysisMode: AnalysisMode;
  startedAt: string;
  completedAt: string;
  durationMs: number;

  paperCount: number;

  totalApiCalls: number;
  successfulCalls: number;
  failedCalls: number;
  retriedCalls: number;
  skippedCalls: number;
  escalatedCalls: number;

  cacheHits: number;
  cacheMisses: number;
  cacheHitRate: number;
  estimatedCacheSavingsUsd: number;

  documentAnalyzerExecuted: number;
  documentAnalyzerSkipped: number;

  totalPromptTokens: number;
  totalCachedInputTokens: number;
  totalOutputTokens: number;
  totalThinkingTokens: number;
  totalTokens: number;

  totalSearchRequests: number | null;
  totalSearchQueries: number | null;

  estimatedTokenCostUsd: number | null;
  estimatedSearchCostUsd: number | null;
  totalEstimatedCostUsd: number | null;

  costByStage: Record<StageName, number | null>;
  tokenUsageByStage: Record<StageName, number>;
  callCountByStage: Record<StageName, number>;
  durationByStage: Record<StageName, number>;

  costByPaper: Record<string, number | null>;

  mostExpensiveStage: StageName | null;
  slowestStage: StageName | null;

  budgetStatus: "WITHIN_BUDGET" | "BUDGET_LIMIT_REACHED" | "PARTIAL_ANALYSIS";
  budgetDetails?: string;

  partialResultCount: number;
  fallbackUsedCount: number;
  pricingVersion: string;
  pricingDate: string;
}

export interface AnalysisBudget {
  maxApiCalls: number;
  maxInputTokens: number;
  maxOutputTokens: number;
  maxSearchQueries: number;
  maxEstimatedCostUsd: number;
  maxDocumentAnalyses: number;
}

