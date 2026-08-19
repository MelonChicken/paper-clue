import { BriefingAnalysisResponse, PaperCandidate, SupportingResource } from "../../src/types";
import { parseBriefing } from "./briefingParser";
import { verifyPaperMetadata, PaperSearchContext } from "./metadataVerifier";
import { verifyPaperResources } from "./resourceVerifier";
import { analyzePaperDocument } from "./documentAnalyzer";
import { findComparisonStudies } from "./comparisonFinder";
import { evaluatePaper } from "./paperEvaluator";
import { generateRecommendation } from "./recommendationEngine";
import { ProgressCallback } from "./types";
import { generateFallbackAnalysis } from "../fallbackAnalyzer";
import { PipelineCallLog } from "../observability/types";
import { globalUsageStore } from "../observability/usageStore";
import { aggregateAnalysisRunUsage } from "../observability/usageAggregator";
import { STANDARD_ANALYSIS_BUDGET } from "../config/routingConfig";
import { createPipelineContext } from "./context";
import { verifyPipelineIntegrity } from "./integrityVerifier";
import { AIProvider } from "./providerInterface";
import { getAIProvider } from "./getProvider";
import { determineRecommendationStatus } from "../../src/utils/evaluationHelpers";
import { calculateCoreEvaluation } from "../../src/utils/paperSemantics";

export async function runAnalysisPipeline(
  providerInput: AIProvider | null | undefined,
  briefingMarkdown: string,
  forceRefresh = false,
  onProgress?: ProgressCallback
): Promise<BriefingAnalysisResponse> {
  const provider = providerInput || getAIProvider();

  const context = createPipelineContext(
    `run_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    briefingMarkdown,
    forceRefresh
  );
  const analysisRunId = context.analysisRunId;
  const startedAtIso = new Date().toISOString();
  const budget = STANDARD_ANALYSIS_BUDGET;

  const notify = (
    stage: Parameters<ProgressCallback>[0]["stage"],
    label: string,
    paperIndex?: number,
    totalPapers?: number,
    paperTitle?: string,
    details?: string
  ) => {
    if (onProgress) {
      onProgress({ stage, label, paperIndex, totalPapers, paperTitle, details });
    }
  };

  const searchContextMap = new Map<string, PaperSearchContext>();
  let executedDocAnalyses = 0;

  try {
    // Step 1: Parse Briefing Structure
    notify("briefingParser", "브리핑 파싱: 주간 연구 브리핑 구조와 논문 후보를 추출 중...");
    const parsedBriefing = await parseBriefing(provider, briefingMarkdown, context, 5);
    const paperDrafts = parsedBriefing.papers || [];

    notify(
      "briefingParser",
      `브리핑 파싱 완료: 총 ${paperDrafts.length}편의 논문 후보 추출`,
      0,
      paperDrafts.length
    );

    const evaluatedCandidates: PaperCandidate[] = [];

    // Pass 1: Verify Metadata & Resources for all paper drafts
    const verifiedPass1: Array<{
      draft: typeof paperDrafts[0];
      metadata: Awaited<ReturnType<typeof verifyPaperMetadata>>;
      resources: Awaited<ReturnType<typeof verifyPaperResources>>;
    }> = [];

    for (let i = 0; i < paperDrafts.length; i++) {
      const draft = paperDrafts[i];
      const paperNum = i + 1;
      const total = paperDrafts.length;

      // Step 2: Metadata Verification
      notify(
        "metadataVerifier",
        `논문 메타데이터 검증: "${draft.rawTitle}" 교차검증 중...`,
        paperNum,
        total,
        draft.rawTitle
      );
      const metadata = await verifyPaperMetadata(provider, draft, context, searchContextMap);

      // Step 3: Resource Verification
      notify(
        "resourceVerifier",
        `肄붾뱶쨌?곗씠?걔룹껜?ы룷?명듃 ?먯깋: "${metadata.normalizedTitle}" 怨듭떇 ??μ냼 議곗궗 以?..`,
        paperNum,
        total,
        metadata.normalizedTitle
      );
      const resources = await verifyPaperResources(
        provider,
        metadata,
        context,
        searchContextMap,
        draft.mentionedCodeUrl,
        draft.mentionedDataUrl
      );

      verifiedPass1.push({ draft, metadata, resources });
    }

    // Build verified candidates list for comparison (strictly exclude NOT_FOUND papers)
    const verifiedCandidatesForComparison = verifiedPass1
      .filter((item) => item.metadata.crossVerificationStatus !== "NOT_FOUND")
      .map((item) => ({
        id: item.draft.id,
        title: item.metadata.normalizedTitle,
        year: item.metadata.year,
        venue: item.metadata.venueOrPreprint,
        snippet: item.draft.snippet,
      }));

    // Pass 2: Conditional Document Analysis, Comparison Finder, Paper Evaluation
    for (let i = 0; i < verifiedPass1.length; i++) {
      const { draft, metadata, resources } = verifiedPass1[i];
      const paperNum = i + 1;
      const total = verifiedPass1.length;
      const isUnverified = metadata.crossVerificationStatus === "NOT_FOUND";

      let docAnalysis: Awaited<ReturnType<typeof analyzePaperDocument>>;
      let comparison: Awaited<ReturnType<typeof findComparisonStudies>>;

      if (isUnverified) {
        // Exclude unverified paper from document analysis & comparison finder
        docAnalysis = {
          performed: false,
          paperId: metadata.paperId,
          reason: "논문 신원 미확정(NOT_FOUND)으로 분석에서 제외",
          method: "논문 신원 미확정(NOT_FOUND)으로 분석에서 제외",
          datasets: [],
          metrics: [],
          quantitativeResults: ["논문 신원 미확정으로 정량 성능 분석 제외"],
          sotaClaim: "논문 신원 미확정으로 SOTA 비교 분석 제외",
        };

        comparison = {
          paperId: metadata.paperId,
          comparisonModule: {
            directComparisonStudies: [],
            nearTaskComparisonStudies: [],
            contextualRelatedStudies: [],
            representativePriorStudies: [],
            sotaStatus: "평가 제외",
            summary: "논문 신원이 확정되지 않아 비교 분석 대상에서 제외되었습니다.",
          },
        };
      } else {
        // Step 4: Conditional Document Analysis
        notify(
          "documentAnalyzer",
          `조건부 원문 정보 분석: "${metadata.normalizedTitle}" 형식/성능 근거 확인...`,
          paperNum,
          total,
          metadata.normalizedTitle
        );
        docAnalysis = await analyzePaperDocument(
          provider,
          metadata,
          resources,
          context,
          executedDocAnalyses,
          budget.maxDocumentAnalyses,
          draft.snippet
        );

        if (docAnalysis.performed) {
          executedDocAnalyses++;
        }

        // Step 5: Comparison Research Finder
        notify(
          "comparisonFinder",
          `비교 연구 탐색: "${metadata.normalizedTitle}" 최근 유사 및 선행 논문 조사 중...`,
          paperNum,
          total,
          metadata.normalizedTitle
        );
        const otherCandidates = verifiedCandidatesForComparison.filter((c) => c.id !== draft.id);

        comparison = await findComparisonStudies(
          provider,
          metadata,
          docAnalysis,
          context,
          otherCandidates
        );
      }

      // Step 6: Paper Evaluation
      notify(
        "paperEvaluator",
        `?됯? 洹쇨굅 ?앹꽦: "${metadata.normalizedTitle}" 6異???웾 ?먯닔 諛?援먯감 寃利??앹꽦 以?..`,
        paperNum,
        total,
        metadata.normalizedTitle
      );
      const evaluation = await evaluatePaper(
        provider,
        metadata,
        resources,
        docAnalysis,
        comparison,
        context
      );

      const coreEvaluation = calculateCoreEvaluation(evaluation.scores);
      const validScoresCount = coreEvaluation.validScoresCount;
      const totalDimensions = coreEvaluation.totalDimensions;
      const evaluationCoverage = coreEvaluation.evaluationCoverage;

      const cand: PaperCandidate = {
        id: draft.id,
        title: metadata.canonicalTitle || metadata.normalizedTitle,
        authors: metadata.authors,
        year: metadata.year,
        venueOrPreprint: metadata.venueOrPreprint,
        doi: metadata.doi,
        arxivId: metadata.arxivId,
        biorxivId: metadata.biorxivId,
        url: metadata.canonicalUrl || metadata.url,
        publicationStatus: metadata.publicationStatus,
        bibliographicStatus: metadata.crossVerificationStatus === "VERIFIED" ? "VERIFIED" : metadata.crossVerificationStatus === "SINGLE_SOURCE" ? "PARTIAL" : "UNVERIFIED",
        performanceEvidenceStatus: evaluation.scores.performance?.status === "SCORED" ? "VERIFIED" : ((docAnalysis.quantitativeResults?.length || 0) + (docAnalysis.metrics?.length || 0) + (docAnalysis.baselines?.length || 0) > 0 ? "PARTIAL" : "NOT_VERIFIED"),
        evaluationStatus: validScoresCount === totalDimensions ? "FULL" : validScoresCount > 0 ? "PARTIAL" : "INSUFFICIENT_EVIDENCE",
        versionInfo: metadata.versionInfo,
        crossVerificationStatus: metadata.crossVerificationStatus,

        // Identity resolution pipeline fields
        rawMention: metadata.rawMention || draft.rawTitle,
        entityType: metadata.entityType || "PAPER",
        canonicalTitle: metadata.canonicalTitle || metadata.normalizedTitle,
        canonicalUrl: metadata.canonicalUrl || metadata.url || null,
        identityStatus: metadata.identityStatus || (isUnverified ? "IDENTITY_NOT_FOUND" : "IDENTITY_VERIFIED"),
        metadataConflict: metadata.metadataConflict,
        paperRole: metadata.paperRole,
        isRankingEligible: metadata.isRankingEligible,
        matchConfidence: metadata.matchConfidence ?? (isUnverified ? 0 : 0.95),
        matchReason: metadata.matchReason || (isUnverified ? "Paper identity not verified" : "Metadata verified"),

        // Evaluation coverage metrics
        scoredDimensions: validScoresCount,
        totalDimensions: totalDimensions,
        evaluationCoverage: evaluationCoverage,
        recommendationStatus: determineRecommendationStatus({
          entityType: metadata.entityType || "PAPER",
          identityStatus: metadata.identityStatus || (isUnverified ? "IDENTITY_NOT_FOUND" : "IDENTITY_VERIFIED"),
          crossVerificationStatus: metadata.crossVerificationStatus,
          isRankingEligible: metadata.isRankingEligible,
          evaluationCoverage,
          scores: evaluation.scores,
        } as PaperCandidate),

        codeStatus: resources.codeStatus,
        codeUrl: resources.codeUrl,
        codeAvailable: ["CODE_AVAILABLE_VERIFIED", "REPOSITORY_FOUND", "AVAILABLE_VERIFIED", "FOUND_UNVERIFIED"].includes(resources.codeStatus),
        dataStatus: resources.dataStatus,
        dataUrl: resources.dataUrl,
        dataAvailable: ["PUBLIC_DATASET_VERIFIED", "PUBLIC_BENCHMARK_USED", "AVAILABLE_VERIFIED", "AVAILABLE_WITH_RESTRICTIONS"].includes(resources.dataStatus),
        reproducibilityStatus: resources.reproducibilityLevel,
        reproducibilityAssessment: resources.reproducibilityAssessment,
        verificationScope: evaluation.verificationScope,
        overallBadgeStatus: isUnverified ? "IDENTITY_NOT_FOUND" : evaluation.overallBadgeStatus,
        scores: evaluation.scores,
        publishingReliabilityScore: isUnverified ? null : (metadata.publicationStatus === "PEER_REVIEWED" ? 5 : metadata.publicationStatus === "PUBLISHED" ? 4 : null),
        publishingReliabilityDetails: metadata.publishingReliabilityDetails,
        recencyScore: isUnverified ? null : 5,
        recencyNotes: isUnverified ? "논문 신원이 확인되지 않아 최신성 metadata를 제외했습니다." : `${metadata.year} publication/preprint`,
        comparisonModule: comparison.comparisonModule,
        uncertainty: evaluation.uncertainty,
        verificationBadges: evaluation.verificationBadges,
        verificationNeededItems: evaluation.uncertainty.factVerificationItems,
      };

      evaluatedCandidates.push(cand);
    }

    const isRankingCandidate = (candidate: PaperCandidate) =>
      candidate.entityType === "PAPER" &&
      candidate.isRankingEligible !== false &&
      candidate.identityStatus === "IDENTITY_VERIFIED" &&
      candidate.crossVerificationStatus !== "CONFLICTING" &&
      candidate.crossVerificationStatus !== "NOT_FOUND" &&
      candidate.recommendationStatus === "ELIGIBLE";

    const rankingCandidatesForRecommendation = evaluatedCandidates.filter(isRankingCandidate);
    const supportingResources: SupportingResource[] = [
      ...evaluatedCandidates
        .filter((candidate) => !isRankingCandidate(candidate))
        .map((candidate) => ({
          name: candidate.canonicalTitle || candidate.title,
          entityType: candidate.entityType,
          canonicalUrl: candidate.canonicalUrl || candidate.url || null,
          verificationStatus: candidate.crossVerificationStatus,
          relatedPaper: null,
          whyRelevant: candidate.metadataConflict
            ? candidate.metadataConflict.resolutionReason
            : `${candidate.entityType} entity is not eligible for paper ranking`,
        })),
      ...(parsedBriefing.datasets || []).map((dataset) => ({
        name: dataset.name,
        entityType: "DATASET" as const,
        canonicalUrl: dataset.link || null,
        verificationStatus: "SINGLE_SOURCE",
        relatedPaper: null,
        whyRelevant: dataset.description,
      })),
      ...(parsedBriefing.tools || []).map((tool) => ({
        name: tool.name,
        entityType: "TOOL" as const,
        canonicalUrl: tool.link || null,
        verificationStatus: "SINGLE_SOURCE",
        relatedPaper: null,
        whyRelevant: tool.description,
      })),
    ];

    // Step 7: Recommendation Engine
    notify("recommendationEngine", "최종 추천 결정: 점수, 주제 적합도, 검증 상태의 tradeoff를 계산 중...");
    const aiRecommendation = await generateRecommendation(
      provider,
      rankingCandidatesForRecommendation,
      parsedBriefing.coreTopic || "AI ?곌뎄",
      context
    );

    // Integrity Check: Verify briefing Hash, parsed IDs, foreign paper injection, recommendation targets, and fixture pollution
    const parsedPaperIds = paperDrafts.map((d) => d.id);
    verifyPipelineIntegrity(
      context,
      briefingMarkdown,
      parsedPaperIds,
      evaluatedCandidates,
      aiRecommendation,
      Array.from(context.usedCacheKeys)
    );

    // Requirement 8: Server Post-Processing (validate -> filter -> deduplicate -> rank -> slice(0, 5))
    const BANNED_PATTERNS = ["summary", "dataset", "tool", "resource", "heading"];
    let finalCandidates = rankingCandidatesForRecommendation.filter((c) => {
      if (!c.title || typeof c.title !== "string") return false;
      const lower = c.title.trim().toLowerCase();
      if (BANNED_PATTERNS.some((b) => lower.includes(b))) return false;
      return c.title.trim().length > 3;
    });

    const seenKeys = new Set<string>();
    finalCandidates = finalCandidates.filter((c) => {
      const key = (c.doi || c.arxivId || c.biorxivId || c.title).toLowerCase().trim();
      if (seenKeys.has(key)) return false;
      seenKeys.add(key);
      return true;
    });

    if (finalCandidates.length > 5) {
      finalCandidates = finalCandidates.slice(0, 5);
    }

    // Extraction Summary Construction
    const factCount = finalCandidates.reduce(
      (sum, c) => sum + (c.uncertainty?.factVerificationItems?.length || 0),
      0
    );
    const insuffCount = finalCandidates.reduce(
      (sum, c) => sum + (c.uncertainty?.insufficientEvidenceItems?.length || 0),
      0
    );
    const openCount = finalCandidates.reduce(
      (sum, c) => sum + (c.uncertainty?.researchOpenQuestions?.length || 0),
      0
    );

    const extraction = {
      extractedPaperCount: finalCandidates.length,
      supportingResourceCount: supportingResources.length,
      supportingResourceBreakdown: supportingResources.reduce<Record<string, number>>((acc, resource) => {
        acc[resource.entityType] = (acc[resource.entityType] || 0) + 1;
        return acc;
      }, {}),
      datasetCount: (parsedBriefing.datasets || []).length,
      githubToolCount: (parsedBriefing.tools || []).length,
      datasets: parsedBriefing.datasets || [],
      githubTools: parsedBriefing.tools || [],
      researchTrends: parsedBriefing.topicKeywords || [parsedBriefing.coreTopic],
      excludedItems: parsedBriefing.unverifiedItems || [],
      uncertaintySummary: {
        factVerificationCount: factCount,
        insufficientEvidenceCount: insuffCount,
        researchOpenQuestionCount: openCount,
      },
      verificationNeededCount: factCount + insuffCount,
    };

    const completedAtIso = new Date().toISOString();
    const callLogs: PipelineCallLog[] = await globalUsageStore.getCallLogs(analysisRunId);

    const usageSummary = aggregateAnalysisRunUsage(
      analysisRunId,
      "STANDARD",
      finalCandidates.length,
      callLogs,
      startedAtIso,
      completedAtIso,
      parsedBriefing.briefingTitle || "Weekly Research Briefing Analysis Report",
      "WITHIN_BUDGET"
    );

    await globalUsageStore.saveRunSummary(usageSummary);

    const finalResponse: BriefingAnalysisResponse = {
      briefingTitle: parsedBriefing.briefingTitle || "Weekly Research Briefing Analysis Report",
      extraction,
      candidates: finalCandidates,
      aiRecommendation,
      supportingResources,
      analysisRunId,
      analysisMode: "STANDARD",
      usageSummary,
      fallbackUsed: false,
      verificationLevel: "HIGH",
      resultOrigin: "LIVE_PIPELINE",
    } as any;

    notify("completed", "분석 완료: 리포트 및 후보 카드 생성 완료");
    return finalResponse;
  } catch (err: any) {
    console.warn("[Orchestrator Warning] AI pipeline failed or integrity check failed, using fallback analyzer:", err?.message);
    const fallbackReason = `AI Pipeline Error: ${err?.message || String(err)}`;
    const fallback = generateFallbackAnalysis(briefingMarkdown, fallbackReason);
    fallback.analysisRunId = analysisRunId;
    fallback.analysisMode = "STANDARD";
    notify("completed", "遺꾩꽍 ?꾨즺 (Dynamic Fallback ?곸슜)");
    return fallback;
  }
}










