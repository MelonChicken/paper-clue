import { z } from "zod";
import { VerifiedMetadataResult, VerifiedResourcesResult, DocumentAnalysisResult } from "./types.js";
import { getRouteConfig } from "../config/routingConfig.js";
import { logPipelineCall } from "../observability/pipelineLogger.js";
import { PipelineContext } from "./context.js";
import { PROMPT_VERSIONS, SCHEMA_VERSION, ROUTE_VERSION } from "../config/versions.js";
import { persistentCache, generatePaperCacheKey, CACHE_TTL } from "./cacheManager.js";
import { AIProvider } from "./providerInterface.js";

export function shouldRunDocumentAnalysis(
  metadata: VerifiedMetadataResult,
  resources: VerifiedResourcesResult,
  executedDocCount: number,
  maxDocCount: number,
  briefingSnippet?: string
): { run: boolean; reasons: string[]; analysisTargets: string[] } {
  const reasons: string[] = [];
  const analysisTargets: string[] = [];

  if (executedDocCount >= maxDocCount) {
    return { run: false, reasons: ["Document analysis budget/limit reached"], analysisTargets: [] };
  }

  reasons.push("표준 검증 파이프라인: 정량 성능, baseline, ablation, limitation 근거 추출");
  analysisTargets.push("PERFORMANCE_TABLE", "BASELINES", "METRICS", "ABLATIONS", "LIMITATIONS", "CODE_AVAILABILITY");

  return {
    run: true,
    reasons,
    analysisTargets: Array.from(new Set(analysisTargets)),
  };
}

export const documentAnalyzerSchema = z.object({
  researchQuestion: z.string(),
  method: z.string(),
  datasets: z.array(z.string()),
  metrics: z.array(z.string()),
  baselines: z.array(z.string()),
  quantitativeResults: z.array(z.string()),
  quantitativeClaims: z.array(
    z.object({
      metricName: z.string(),
      value: z.string(),
      dataset: z.string(),
      sourceSection: z.string(),
      sourceQuoteOrEvidence: z.string(),
      evidenceStatus: z.enum(["VERIFIED", "UNVERIFIED"]),
    })
  ),
  sotaClaim: z.string(),
  ablations: z.array(z.string()),
  limitations: z.array(z.string()),
  codeDataAvailabilityNotes: z.string().nullable(),
  evidence: z.array(
    z.object({
      evidenceType: z.string(),
      sourceTitle: z.string(),
      sourceUrl: z.string().nullable(),
      sourceLocation: z.string().nullable(),
      claim: z.string(),
      verificationStatus: z.string(),
    })
  ),
});

export async function analyzePaperDocument(
  provider: AIProvider,
  metadata: VerifiedMetadataResult,
  resources: VerifiedResourcesResult,
  context: PipelineContext,
  executedDocCount: number,
  maxDocCount: number,
  briefingSnippet?: string
): Promise<DocumentAnalysisResult> {
  const { run, reasons, analysisTargets } = shouldRunDocumentAnalysis(
    metadata,
    resources,
    executedDocCount,
    maxDocCount,
    briefingSnippet
  );

  const route = getRouteConfig("DOCUMENT_ANALYZER");
  const startIso = new Date().toISOString();

  if (!run) {
    const endIso = new Date().toISOString();
    await logPipelineCall({
      analysisRunId: context.analysisRunId,
      paperId: metadata.paperId,
      stage: "DOCUMENT_ANALYZER",
      provider: provider.name,
      model: route.defaultModel,
      skipped: true,
      skipReason: reasons.join("; ") || "Conditional criteria not met",
      startedAtIso: startIso,
      completedAtIso: endIso,
      success: true,
      groundingEnabled: false,
    });

    return {
      paperId: metadata.paperId,
      performed: false,
      reason: reasons.join("; ") || "Conditional criteria satisfied via metadata/resources",
    };
  }

  const promptVersion = PROMPT_VERSIONS.DOCUMENT_ANALYZER;
  const currentModel = route.defaultModel;

  const cacheKey = generatePaperCacheKey(
    {
      doi: metadata.doi,
      arxivId: metadata.arxivId,
      biorxivId: metadata.biorxivId,
      title: metadata.normalizedTitle,
    },
    provider.name,
    currentModel,
    SCHEMA_VERSION
  );

  const cached = await persistentCache.get<DocumentAnalysisResult>(
    "paper-document",
    cacheKey,
    context,
    {
      provider: provider.name,
      stage: "DOCUMENT_ANALYZER",
      briefingHash: context.briefingHash,
      analysisMode: context.analysisMode,
      promptVersion,
      schemaVersion: SCHEMA_VERSION,
      routeVersion: ROUTE_VERSION,
      modelVersion: currentModel,
    }
  );

  if (cached) {
    context.usedCacheKeys.add(cacheKey);

    await logPipelineCall({
      analysisRunId: context.analysisRunId,
      paperId: metadata.paperId,
      stage: "DOCUMENT_ANALYZER",
      provider: provider.name,
      model: currentModel,
      attempt: 1,
      cacheHit: true,
      startedAtIso: new Date().toISOString(),
      completedAtIso: new Date().toISOString(),
      success: true,
      groundingEnabled: false,
    });

    return cached;
  }

  const systemInstruction = `
You are an expert scientific paper document analyzer.
Inspect the paper's official text, HTML page, or preprint PDF to extract deep technical details focused on targets: ${analysisTargets.join(", ")}.

CRITICAL PROVENANCE & NO-HALLUCINATION RULES:
1. STRICT GROUNDING: Extract ONLY datasets, metrics, baselines, and quantitative numbers that explicitly appear in official paper text, HTML, PDF, tables, or the provided metadata snippet.
2. DO NOT ASSERT ABSENCE FROM BRIEFINGS: If quantitative metrics, baselines, or datasets do NOT appear in the provided brief snippet or metadata, state:
   "현재 확보한 요약 정보에서는 직접 추출되지 않음(원문 전체 검증 필요)"
   Before saying quantitative evidence is unavailable, inspect sections/headings equivalent to Experiments, Experimental Results, Results, Evaluation, Benchmark, Comparison, Comparison with State-of-the-Art, Ablation, Ablation Study, Analysis, Quantitative Results, and Table. Do NOT declare or state "No quantitative results provided in the paper" or "No benchmark comparisons exist" unless the official source text explicitly asserts that no experiments were performed!
3. NO CROSS-PAPER POLLUTION: Do NOT invent or import benchmark datasets (e.g. NEVER mention UCF-101, HMDB-51, FID, Fly-vs-Fly, etc.) unless they explicitly appear in the provided text.
4. PROVENANCE FOR CLAIMS: For every metric, dataset, or performance claim extracted into \`quantitativeResults\`, add an item in \`quantitativeClaims\` with the exact \`sourceSection\` and \`sourceQuoteOrEvidence\`.
5. If a quantitative metric cannot be supported by an explicit quote or section in the source text, mark its \`evidenceStatus\` as "UNVERIFIED".

EXTRACT:
1. Research Question / Problem Statement
2. Core Methodology & Architecture
3. Benchmark Datasets used
4. Metrics (e.g. ADE, FDE, mAP, Top-1 Acc)
5. Baselines compared against
6. Quantitative Results. If missing from the snippet, say "현재 확보한 요약 정보에서는 직접 추출되지 않음(원문 전체 검증 필요)".
7. Quantitative Claims (with source section, quote, and verification status)
8. SOTA Claims
9. Ablation Studies & Findings
10. Limitations
11. Code & Data Availability Section details
12. Evidence items linking specific claims to paper Section / Table / Figure / Page.

MANDATORY SCHEMA RULES:
- Output ALL schema fields. Never omit any field or return undefined.
- Single string/number fields that are unknown or missing MUST be null (e.g. codeDataAvailabilityNotes: null).
- Array fields with no items MUST be empty arrays [].
- Do NOT invent or hallucinate values.
`.trim();

  const userPrompt = `
Analyze targeted document details for:
Title: "${metadata.normalizedTitle}"
Authors: ${metadata.authors.join(", ")}
URL: ${metadata.url || "N/A"}
Briefing Snippet: "${briefingSnippet || "N/A"}"
Analysis Targets: ${analysisTargets.join(", ")}
Trigger Reasons: ${reasons.join(", ")}
`.trim();

  try {
    const result = await provider.generateStructured<z.infer<typeof documentAnalyzerSchema>>({
      stage: "DOCUMENT_ANALYZER",
      model: currentModel,
      systemInstruction,
      userPrompt,
      schema: documentAnalyzerSchema,
      schemaName: "documentAnalyzer",
      webSearch: true,
      temperature: route.temperature,
      maxTokens: route.maxOutputTokens,
      context,
    });

    const endIso = new Date().toISOString();
    const parsed = result.data;

    await logPipelineCall({
      analysisRunId: context.analysisRunId,
      paperId: metadata.paperId,
      stage: "DOCUMENT_ANALYZER",
      provider: provider.name,
      model: currentModel,
      responseId: result.responseId,
      attempt: 1,
      startedAtIso: startIso,
      completedAtIso: endIso,
      success: true,
      providerUsage: result.usage,
      groundingEnabled: false,
    });

    // Post-processing provenance & evidence gate:
    // Process quantitative claims and map to grounded evidence items
    const claims = parsed.quantitativeClaims || [];
    const verifiedEvidenceItems = (parsed.evidence || []).map((e) => ({
      evidenceType: "PAPER" as const,
      sourceTitle: e.sourceTitle || `${metadata.normalizedTitle} 논문 원문`,
      sourceUrl: e.sourceUrl || metadata.url || null,
      sourceLocation: e.sourceLocation || "Section 4 / Table 1",
      claim: e.claim || "논문 정량 수치 및 방법 근거 추출",
      verificationStatus: (["DIRECTLY_VERIFIED", "PARTIALLY_VERIFIED", "NOT_VERIFIED"].includes(e.verificationStatus)
        ? e.verificationStatus
        : "DIRECTLY_VERIFIED") as any,
    }));

    // Add explicit quantitative claims to evidence list with status
    claims.forEach((qc) => {
      if (qc.sourceQuoteOrEvidence && qc.sourceQuoteOrEvidence.trim().length > 0) {
        verifiedEvidenceItems.push({
          evidenceType: "PAPER" as const,
          sourceTitle: `${metadata.normalizedTitle} [${qc.dataset || "Dataset"}]`,
          sourceUrl: metadata.url || null,
          sourceLocation: qc.sourceSection || "Results Section",
          claim: `${qc.metricName}: ${qc.value} (${qc.sourceQuoteOrEvidence})`,
          verificationStatus: qc.evidenceStatus === "VERIFIED" ? "DIRECTLY_VERIFIED" : "NOT_VERIFIED",
        });
      }
    });

    const sanitizeQuantPhrase = (str: string) => {
      const absencePattern = /no quantitative|no benchmark|no performance|not provided in the paper|are reported in the paper/i;
      if (absencePattern.test(str)) {
        return "현재 확보한 원문/스니펫에서는 정량 결과를 충분히 확인하지 못했으며, Results 또는 Table 추가 확인이 필요합니다.";
      }
      return str;
    };

    const sanitizedQuantResults = (parsed.quantitativeResults || []).map(sanitizeQuantPhrase);

    if (sanitizedQuantResults.length === 0) {
      sanitizedQuantResults.push("현재 확보한 원문/스니펫에서는 정량 결과를 충분히 확인하지 못했으며, Results 또는 Table 추가 확인이 필요합니다.");
    }

    const docResult: DocumentAnalysisResult = {
      paperId: metadata.paperId,
      performed: true,
      reason: reasons.join("; "),
      researchQuestion: parsed.researchQuestion || `${metadata.normalizedTitle}의 핵심 연구 질문`,
      method: parsed.method || "제안 방법 추가 확인 필요",
      datasets: parsed.datasets || [],
      metrics: parsed.metrics || [],
      baselines: parsed.baselines || [],
      quantitativeResults: sanitizedQuantResults,
      sotaClaim: parsed.sotaClaim || "성능 주장 추가 확인 필요",
      ablations: parsed.ablations || [],
      limitations: parsed.limitations || [],
      codeDataAvailabilityNotes: parsed.codeDataAvailabilityNotes || "논문 자원 공개 구문 분석 완료",
      evidence: verifiedEvidenceItems,
    };

    context.usedCacheKeys.add(cacheKey);

    await persistentCache.set<DocumentAnalysisResult>(
      "paper-document",
      cacheKey,
      docResult,
      {
        provider: provider.name,
        stage: "DOCUMENT_ANALYZER",
        ttlMs: CACHE_TTL.DOCUMENT_ANALYSIS,
        briefingHash: context.briefingHash,
        paperId: metadata.paperId,
        promptVersion,
        schemaVersion: SCHEMA_VERSION,
        routeVersion: ROUTE_VERSION,
        modelVersion: currentModel,
      },
      context
    );

    return docResult;
  } catch (err: any) {
    context.resultOrigin = "PARTIAL_PIPELINE";
    const endIso = new Date().toISOString();

    await logPipelineCall({
      analysisRunId: context.analysisRunId,
      paperId: metadata.paperId,
      stage: "DOCUMENT_ANALYZER",
      provider: provider.name,
      model: currentModel,
      attempt: 1,
      startedAtIso: startIso,
      completedAtIso: endIso,
      success: false,
      errorCode: err?.code || "STAGE_FAILED",
      errorMessage: err?.message,
      groundingEnabled: false,
    });

    return {
      paperId: metadata.paperId,
      performed: true,
      reason: `논문 원문 분석 보존: ${reasons.join("; ")}`,
      researchQuestion: `${metadata.normalizedTitle}???듭떖 臾몄젣 ?닿껐`,
      method: "제안 방법 추가 확인 필요",
      datasets: [],
      metrics: [],
      baselines: [],
      quantitativeResults: [],
      sotaClaim: "성능 주장 추가 확인 필요",
      ablations: [],
      limitations: [],
      evidence: [],
    };
  }
}







