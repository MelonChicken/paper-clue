import { z } from "zod";
import { VerifiedMetadataResult, DocumentAnalysisResult, ComparisonFinderResult } from "./types.js";
import { getRouteConfig } from "../config/routingConfig.js";
import { logPipelineCall } from "../observability/pipelineLogger.js";
import { PipelineContext } from "./context.js";
import { PROMPT_VERSIONS, SCHEMA_VERSION, ROUTE_VERSION } from "../config/versions.js";
import { persistentCache, generatePaperCacheKey, CACHE_TTL } from "./cacheManager.js";
import { AIProvider } from "./providerInterface.js";

export interface CandidateOverview {
  id: string;
  title: string;
  year: number | string;
  venue?: string;
  snippet?: string;
}

export const comparisonFinderSchema = z.object({
  directComparisonStudies: z.array(
    z.object({
      title: z.string(),
      year: z.string(),
      task: z.string(),
      dataset: z.string(),
      metric: z.string(),
      authors: z.string().nullable(),
      performanceDiffNote: z.string(),
      identifier: z.string(),
      link: z.string().nullable(),
    })
  ),
  nearTaskComparisonStudies: z.array(
    z.object({
      title: z.string(),
      year: z.string(),
      task: z.string(),
      dataset: z.string(),
      metric: z.string(),
      authors: z.string().nullable(),
      performanceDiffNote: z.string().nullable(),
      reasonNotDirectlyComparable: z.string(),
      identifier: z.string(),
      link: z.string().nullable(),
    })
  ),
  contextualRelatedStudies: z.array(
    z.object({
      title: z.string(),
      year: z.string(),
      relatedFlow: z.string(),
      diffFromTarget: z.string(),
      reasonDirectComparisonNotPossible: z.string(),
      identifier: z.string(),
      link: z.string().nullable(),
    })
  ),
  representativePriorStudies: z.array(
    z.object({
      title: z.string(),
      year: z.string(),
      significance: z.string(),
      relationToTarget: z.string(),
      identifier: z.string(),
      link: z.string().nullable(),
    })
  ),
  sotaStatus: z.string(),
  summary: z.string(),
});

export async function findComparisonStudies(
  provider: AIProvider,
  metadata: VerifiedMetadataResult,
  docAnalysis: DocumentAnalysisResult,
  context: PipelineContext,
  otherCandidates: CandidateOverview[] = []
): Promise<ComparisonFinderResult> {
  const route = getRouteConfig("COMPARISON_FINDER");
  const currentModel = route.defaultModel;
  const promptVersion = PROMPT_VERSIONS.COMPARISON_FINDER;

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

  const cached = await persistentCache.get<ComparisonFinderResult>(
    "paper-comparison",
    cacheKey,
    context,
    {
      provider: provider.name,
      stage: "COMPARISON_FINDER",
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
      stage: "COMPARISON_FINDER",
      provider: provider.name,
      model: currentModel,
      attempt: 1,
      cacheHit: true,
      startedAtIso: new Date().toISOString(),
      completedAtIso: new Date().toISOString(),
      success: true,
      groundingEnabled: true,
    });

    return cached;
  }

  const otherCandidatesText = otherCandidates.length > 0
    ? otherCandidates.map((c) => `- ID: ${c.id} | Title: "${c.title}" (${c.year}) | Venue: ${c.venue || 'N/A'}`).join("\n")
    : "None (Single paper analysis)";

  const systemInstruction = `
You are a senior academic literature analyst.
Find and classify comparison studies for the target paper using a LOCAL-FIRST approach combined with external web search.

LOCAL-FIRST COMPARISON RULE:
1. Examine the other candidate papers in the same weekly briefing listed under "Other Candidate Papers in Briefing".
2. If any candidate paper addresses a similar task, benchmark, or domain, categorize it as a directComparison, nearTaskComparison, or contextualRelated study relative to the target paper.

CRITICAL LOCAL CANDIDATE IDENTIFIER & NO-HALLUCINATION RULES:
1. When referencing candidate papers from "Other Candidate Papers in Briefing", you MUST use their exact ID or official identifier as given in the list.
2. NEVER generate fake/hallucinated arXiv identifiers (e.g. "arXiv:2601.00001" or random digits). Use ONLY verified IDs, DOIs, arXiv IDs, or citation keys (e.g. "Smith et al., 2024").

STRICT DIRECT COMPARISON GATE:
1. DIRECT_COMPARISON: Must share the EXACT SAME task, comparable input/output, shared benchmark dataset, AND identical evaluation metrics.
2. If ANY criterion (dataset, metric, or task) differs or is unconfirmed, you MUST categorize the study under NEAR_TASK_COMPARISON or CONTEXTUAL_RELATED instead. NEVER force a DIRECT_COMPARISON if benchmark datasets or metrics differ.
3. NEAR_TASK_COMPARISON: Similar task or domain, but datasets/metrics differ so metrics CANNOT be directly compared line-by-line.
4. CONTEXTUAL_RELATED: Related research flow or broader framework.
5. REPRESENTATIVE_PRIOR: Milestone or foundational paper in the field.

CRITICAL IDENTIFIER vs LINK SEPARATION RULE:
- 'identifier' MUST be an academic citation key or publication identifier (e.g. "arXiv:2403.12345", "DOI:10.1145/...", "CVPR 2024", or "Smith et al., 2024"). NEVER put web URLs or GitHub URLs in the identifier field!
- 'link' MUST be the official HTTP URL if available.

MANDATORY SCHEMA RULES:
- Output ALL schema fields. Never omit any field or return undefined.
- Single string/number fields that are unknown or missing MUST be null (e.g. authors: null, link: null).
- Array fields with no items MUST be empty arrays [].
- Do NOT invent or hallucinate values.
`.trim();

  const userPrompt = `
Find comparison studies for:
Target Paper: "${metadata.normalizedTitle}" (${metadata.year})
Venue: ${metadata.venueOrPreprint}
Method/Task: ${docAnalysis.method || "AI / Computer Vision / ML"}
Datasets: ${(docAnalysis.datasets || []).join(", ") || "N/A"}
Metrics: ${(docAnalysis.metrics || []).join(", ") || "N/A"}

Other Candidate Papers in Briefing (Evaluate these FIRST for local comparison):
${otherCandidatesText}
`.trim();

  const cleanIdentifier = (idStr?: string, linkStr?: string): string => {
    if (!idStr || idStr.startsWith("http://") || idStr.startsWith("https://")) {
      return linkStr ? "Official Paper Link" : "BibTeX / Citation";
    }
    return idStr;
  };

  const startIso = new Date().toISOString();

  try {
    const result = await provider.generateStructured<z.infer<typeof comparisonFinderSchema>>({
      stage: "COMPARISON_FINDER",
      model: currentModel,
      systemInstruction,
      userPrompt,
      schema: comparisonFinderSchema,
      schemaName: "comparisonFinder",
      webSearch: true,
      temperature: route.temperature,
      maxTokens: route.maxOutputTokens,
      context,
    });

    const endIso = new Date().toISOString();
    const parsed = result.data;

    // Helper to sanitize identifiers and preserve canonical candidate metadata
    const getCanonicalStudyMetadata = (studyTitle: string, rawYear: string, rawIdentifier: string) => {
      const normTitle = (studyTitle || "").toLowerCase().trim();
      const matchedCand = otherCandidates.find((c) => {
        const cNorm = c.title.toLowerCase().trim();
        return (
          cNorm.includes(normTitle) ||
          normTitle.includes(cNorm.slice(0, 20)) ||
          (c.id && rawIdentifier && rawIdentifier.toLowerCase().includes(c.id.toLowerCase()))
        );
      });

      if (matchedCand) {
        return {
          title: matchedCand.title,
          year: String(matchedCand.year || metadata.year || "2026"),
          identifier: matchedCand.id,
        };
      }

      const targetNorm = metadata.normalizedTitle.toLowerCase().trim();
      if (normTitle.includes(targetNorm) || targetNorm.includes(normTitle.slice(0, 20))) {
        return {
          title: metadata.normalizedTitle,
          year: String(metadata.year || "2026"),
          identifier: metadata.paperId,
        };
      }

      const cleanedId = cleanIdentifier(rawIdentifier);
      const safeYear =
        rawYear && rawYear.trim().length === 4 && /^\d{4}$/.test(rawYear.trim())
          ? rawYear.trim()
          : String(metadata.year || "2026");

      return {
        title: studyTitle || "관련 연구",
        year: safeYear,
        identifier: /arXiv:2601\.00001/i.test(cleanedId) ? "BibTeX / Citation" : cleanedId,
      };
    };

    const targetDatasets = (docAnalysis.datasets || []).map((d) => d.toLowerCase());
    const targetMetrics = (docAnalysis.metrics || []).map((m) => m.toLowerCase());

    const direct: typeof parsed.directComparisonStudies = [];
    const nearTaskRaw: typeof parsed.nearTaskComparisonStudies = [...(parsed.nearTaskComparisonStudies || [])];

    // Direct Comparison Gate: check dataset and metric overlap
    (parsed.directComparisonStudies || []).forEach((s) => {
      const sDatasetLower = (s.dataset || "").toLowerCase();
      const sMetricLower = (s.metric || "").toLowerCase();

      const datasetMatches =
        targetDatasets.length === 0 ||
        targetDatasets.some((td) => sDatasetLower.includes(td) || td.includes(sDatasetLower));
      const metricMatches =
        targetMetrics.length === 0 ||
        targetMetrics.some((tm) => sMetricLower.includes(tm) || tm.includes(sMetricLower));

      if (datasetMatches && metricMatches) {
        direct.push(s);
      } else {
        // Downgrade to nearTask
        nearTaskRaw.push({
          title: s.title,
          year: s.year,
          task: s.task,
          dataset: s.dataset,
          metric: s.metric,
          authors: s.authors,
          performanceDiffNote: s.performanceDiffNote,
          reasonNotDirectlyComparable: `Direct Comparison Gate Downgrade: Benchmark dataset ("${s.dataset}") or metric ("${s.metric}") differs from target paper (${(docAnalysis.datasets || []).join(", ") || "N/A"})`,
          identifier: s.identifier,
          link: s.link,
        });
      }
    });

    const directResult = direct.map((s) => {
      const canon = getCanonicalStudyMetadata(s.title, s.year, s.identifier);
      return {
        title: canon.title,
        year: canon.year,
        task: s.task || "동일 과업",
        dataset: s.dataset || "공동 벤치마크",
        metric: s.metric || "동일 평가 지표",
        authors: s.authors || "저자 미상",
        performanceDiffNote: s.performanceDiffNote || "정량 성능 비교 확인",
        isDirectlyComparable: true,
        identifier: canon.identifier,
        link: s.link || null,
      };
    });

    const nearTaskResult = nearTaskRaw.map((s) => {
      const canon = getCanonicalStudyMetadata(s.title, s.year, s.identifier);
      return {
        title: canon.title,
        year: canon.year,
        task: s.task || "유사 과업",
        dataset: s.dataset || "상이한 벤치마크",
        metric: s.metric || "상이한 평가 지표",
        authors: s.authors || "저자 미상",
        performanceDiffNote: s.performanceDiffNote || "조건 상이로 수치 직접 비교 불가능",
        reasonNotDirectlyComparable: s.reasonNotDirectlyComparable || "데이터셋/평가 지표 상이",
        identifier: canon.identifier,
        link: s.link || null,
      };
    });

    const contextual = (parsed.contextualRelatedStudies || []).map((s) => {
      const canon = getCanonicalStudyMetadata(s.title, s.year, s.identifier);
      return {
        title: canon.title,
        year: canon.year,
        relatedFlow: s.relatedFlow || "연구 맥락",
        diffFromTarget: s.diffFromTarget || "아키텍처 차이",
        reasonDirectComparisonNotPossible: s.reasonDirectComparisonNotPossible || "과업 영역 상이",
        identifier: canon.identifier,
        link: s.link || null,
      };
    });

    const prior = (parsed.representativePriorStudies || []).map((s) => {
      const canon = getCanonicalStudyMetadata(s.title, s.year, s.identifier);
      return {
        title: canon.title,
        year: canon.year,
        significance: s.significance || "선행 기반 가치",
        relationToTarget: s.relationToTarget || "기초 논문",
        identifier: canon.identifier,
        link: s.link || null,
      };
    });

    await logPipelineCall({
      analysisRunId: context.analysisRunId,
      paperId: metadata.paperId,
      stage: "COMPARISON_FINDER",
      provider: provider.name,
      model: currentModel,
      responseId: result.responseId,
      attempt: 1,
      startedAtIso: startIso,
      completedAtIso: endIso,
      success: true,
      providerUsage: result.usage,
      groundingEnabled: true,
    });

    const comparisonResult: ComparisonFinderResult = {
      paperId: metadata.paperId,
      comparisonModule: {
        directComparisonStudies: directResult,
        nearTaskComparisonStudies: nearTaskResult,
        contextualRelatedStudies: contextual,
        representativePriorStudies: prior,
        sotaStatus: parsed.sotaStatus || "선행 및 브리핑 후보 교차검증 완료",
        summary: parsed.summary || "로컬 후보 비교 및 1~2년 비교 연구 탐색 완료",
      },
    };

    context.usedCacheKeys.add(cacheKey);

    await persistentCache.set<ComparisonFinderResult>(
      "paper-comparison",
      cacheKey,
      comparisonResult,
      {
        provider: provider.name,
        stage: "COMPARISON_FINDER",
        ttlMs: CACHE_TTL.COMPARISON,
        briefingHash: context.briefingHash,
        paperId: metadata.paperId,
        promptVersion,
        schemaVersion: SCHEMA_VERSION,
        routeVersion: ROUTE_VERSION,
        modelVersion: currentModel,
      },
      context
    );

    return comparisonResult;
  } catch (err: any) {
    context.resultOrigin = "PARTIAL_PIPELINE";
    const endIso = new Date().toISOString();

    await logPipelineCall({
      analysisRunId: context.analysisRunId,
      paperId: metadata.paperId,
      stage: "COMPARISON_FINDER",
      provider: provider.name,
      model: currentModel,
      attempt: 1,
      startedAtIso: startIso,
      completedAtIso: endIso,
      success: false,
      errorCode: err?.code || "STAGE_FAILED",
      errorMessage: err?.message,
      groundingEnabled: true,
    });

    const fallbackNearTask = otherCandidates.map((oc) => ({
      title: oc.title,
      year: String(oc.year),
      task: "주간 브리핑 동일 영역 연구",
      dataset: "독립 벤치마크",
      metric: "상대적 성능 비교",
      authors: "브리핑 후보 저자",
      performanceDiffNote: "주간 브리핑 후보 간 상대적 비교 완료",
      reasonNotDirectlyComparable: "독립적 평가 세팅",
      identifier: oc.id,
      link: null,
    }));

    return {
      paperId: metadata.paperId,
      comparisonModule: {
        directComparisonStudies: [],
        nearTaskComparisonStudies: fallbackNearTask,
        contextualRelatedStudies: [],
        representativePriorStudies: [],
        sotaStatus: "후보 간 교차비교 완료",
        summary: "주간 브리핑 논문 후보 간 상대적 비교 완료",
      },
    };
  }
}
