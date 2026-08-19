import crypto from "crypto";

export interface PipelineContext {
  analysisRunId: string;
  briefingHash: string;
  analysisMode: "STANDARD";
  forceRefresh: boolean;
  parsedPaperIds: string[];
  stageResults: Map<string, unknown>;
  cacheHits: Map<string, boolean>;
  usedCacheKeys: Set<string>;
  resultOrigin: "LIVE_PIPELINE" | "PARTIAL_PIPELINE" | "FALLBACK";
  verificationLevel: "HIGH" | "MEDIUM" | "LOW";
  fallbackUsed: boolean;
  fallbackReason?: string;
  missingStages?: string[];
  integrityStatus: "PASSED" | "FAILED" | "NOT_RUN";
  cacheEligibility: "REUSABLE" | "SHORT_LIVED" | "DO_NOT_CACHE";
}

export function computeBriefingHash(markdown: string): string {
  const normalized = (markdown || "").replace(/\r\n/g, "\n").trim();
  return crypto.createHash("sha256").update(normalized).digest("hex");
}

export function createPipelineContext(
  analysisRunId: string,
  briefingMarkdown: string,
  forceRefresh = false
): PipelineContext {
  const briefingHash = computeBriefingHash(briefingMarkdown);
  return {
    analysisRunId,
    briefingHash,
    analysisMode: "STANDARD",
    forceRefresh,
    parsedPaperIds: [],
    stageResults: new Map(),
    cacheHits: new Map(),
    usedCacheKeys: new Set(),
    resultOrigin: "LIVE_PIPELINE",
    verificationLevel: "HIGH",
    fallbackUsed: false,
    integrityStatus: "PASSED",
    cacheEligibility: "REUSABLE",
  };
}

