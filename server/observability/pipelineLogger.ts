import { PipelineCallLog, StageName, TokenUsageRecord, SearchUsageRecord } from "./types";
import { calculateEstimatedCost } from "./costCalculator";
import { globalUsageStore } from "./usageStore";
import { ProviderUsage } from "../pipeline/providerInterface";

export async function logPipelineCall(params: {
  analysisRunId: string;
  stage: StageName;
  provider: "OPENAI" | "GEMINI";
  model: string;
  responseId?: string;
  paperId?: string;
  attempt?: number;
  cacheHit?: boolean;
  skipped?: boolean;
  skipReason?: string;
  escalated?: boolean;
  escalationReason?: string;
  startedAtIso: string;
  completedAtIso: string;
  success: boolean;
  errorCode?: string;
  errorMessage?: string;
  providerUsage?: ProviderUsage | null;
  groundingEnabled?: boolean;
}): Promise<PipelineCallLog> {
  const started = new Date(params.startedAtIso).getTime();
  const completed = new Date(params.completedAtIso).getTime();
  const durationMs = Math.max(0, completed - started);

  const usage = params.providerUsage;

  const tokenUsage: TokenUsageRecord = {
    promptTokens: usage?.inputTokens ?? null,
    cachedInputTokens: usage?.cachedInputTokens ?? null,
    outputTokens: usage?.outputTokens ?? null,
    thinkingTokens: 0,
    totalTokens: usage?.totalTokens ?? null,
    measurementStatus: usage && usage.totalTokens !== null ? "MEASURED" : "UNAVAILABLE",
  };

  const isGrounding = Boolean(params.groundingEnabled);
  const searchCalls = usage?.webSearchCalls ?? 0;

  const searchUsage: SearchUsageRecord = {
    groundingEnabled: isGrounding,
    searchRequestCount: searchCalls,
    searchQueryCount: searchCalls,
    measurementStatus: isGrounding ? "MEASURED" : "UNAVAILABLE",
  };

  const cost = calculateEstimatedCost(
    params.provider,
    params.model,
    tokenUsage,
    searchUsage
  );

  const log: PipelineCallLog = {
    callId: `call_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    analysisRunId: params.analysisRunId,
    paperId: params.paperId,
    stage: params.stage,
    provider: params.provider,
    model: params.model,
    responseId: params.responseId,
    attempt: params.attempt || 1,
    cacheHit: Boolean(params.cacheHit),
    skipped: Boolean(params.skipped),
    skipReason: params.skipReason,
    escalated: Boolean(params.escalated),
    escalationReason: params.escalationReason,
    startedAt: params.startedAtIso,
    completedAt: params.completedAtIso,
    durationMs,
    success: params.success,
    errorCode: params.errorCode,
    errorMessage: params.errorMessage,
    tokenUsage,
    searchUsage,
    cost,
  };

  await globalUsageStore.saveCallLog(log);
  return log;
}
