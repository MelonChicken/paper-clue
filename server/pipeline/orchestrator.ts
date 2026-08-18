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
import { AnalysisMode, PipelineCallLog } from "../observability/types";
import { globalUsageStore } from "../observability/usageStore";
import { aggregateAnalysisRunUsage } from "../observability/usageAggregator";
import { MODE_BUDGETS } from "../config/routingConfig";
import { createPipelineContext } from "./context";
import { verifyPipelineIntegrity } from "./integrityVerifier";
import { AIProvider } from "./providerInterface";
import { getAIProvider } from "./getProvider";
import { determineRecommendationStatus } from "../../src/utils/evaluationHelpers";

export async function runAnalysisPipeline(
  providerInput: AIProvider | null | undefined,
  briefingMarkdown: string,
  forceRefresh = false,
  analysisMode: AnalysisMode = "STANDARD",
  onProgress?: ProgressCallback
): Promise<BriefingAnalysisResponse> {
  const provider = providerInput || getAIProvider();

  const context = createPipelineContext(
    `run_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    briefingMarkdown,
    analysisMode,
    forceRefresh
  );
  const analysisRunId = context.analysisRunId;
  const startedAtIso = new Date().toISOString();
  const budget = MODE_BUDGETS[analysisMode];

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
    notify("briefingParser", "Î∏åÎ¶¨???åÏã±: Ï£ºÍ∞Ñ ?∞Íµ¨ Î∏åÎ¶¨??Íµ¨Ï°∞ Î∞??ºÎ¨∏ ?ÑÎ≥¥ Ï∂îÏ∂ú Ï§?..");
    const parsedBriefing = await parseBriefing(provider, briefingMarkdown, context, 5);
    const paperDrafts = parsedBriefing.papers || [];

    notify(
      "briefingParser",
      `Î∏åÎ¶¨???åÏã± ?ÑÎ£å: Ï¥?${paperDrafts.length}?∏Ïùò ?ºÎ¨∏ ?ÑÎ≥¥ ?ÑÏ∂ú`,
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
        `?ºÎ¨∏ Î©îÌ??∞Ïù¥??Í≤ÄÏ¶? "${draft.rawTitle}" ÍµêÏ∞®Í≤ÄÏ¶?Ï§?..`,
        paperNum,
        total,
        draft.rawTitle
      );
      const metadata = await verifyPaperMetadata(provider, draft, context, searchContextMap);

      // Step 3: Resource Verification
      notify(
        "resourceVerifier",
        `ÏΩîÎìú¬∑?∞Ïù¥?∞¬∑Ï≤¥?¨Ìè¨?∏Ìä∏ ?êÏÉâ: "${metadata.normalizedTitle}" Í≥µÏãù ?Ä?•ÏÜå Ï°∞ÏÇ¨ Ï§?..`,
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
          reason: "?ºÎ¨∏ ?†Ïõê ÎØ∏Ìôï??NOT_FOUND)?ºÎ°ú Î∂ÑÏÑù ?úÏô∏",
          method: "?†Ïõê ÎØ∏Ìôï??NOT_FOUND)?ºÎ°ú Î∂ÑÏÑù ?úÏô∏",
          datasets: [],
          metrics: [],
          quantitativeResults: ["?ºÎ¨∏ ?†Ïõê ÎØ∏Ìôï?∏ÏúºÎ°??ïÎüâ ?±Îä• Î∂ÑÏÑù ?úÏô∏"],
          sotaClaim: "?ºÎ¨∏ ?†Ïõê ÎØ∏Ìôï?∏ÏúºÎ°?SOTA ÎπÑÍµê Î∂ÑÏÑù ?úÏô∏",
        };

        comparison = {
          paperId: metadata.paperId,
          comparisonModule: {
            directComparisonStudies: [],
            nearTaskComparisonStudies: [],
            contextualRelatedStudies: [],
            representativePriorStudies: [],
            sotaStatus: "?âÍ? ?úÏô∏",
            summary: "?ºÎ¨∏ ?†Ïõê???ïÏ†ï?òÏ? ?äÏïÑ ÎπÑÍµê Î∂ÑÏÑù ?Ä?ÅÏóê???úÏô∏?òÏóà?µÎãà??",
          },
        };
      } else {
        // Step 4: Conditional Document Analysis
        notify(
          "documentAnalyzer",
          `Ï°∞Í±¥Î∂Ä ?êÎ¨∏ ?ïÎ? Î∂ÑÏÑù: "${metadata.normalizedTitle}" ?òÏãù/?±Îä•???ïÎ? ?ïÏù∏...`,
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
          `ÎπÑÍµê ?∞Íµ¨ ?êÏÉâ: "${metadata.normalizedTitle}" ÏµúÍ∑º 1~2???†ÏÇ¨ Î∞??†Ìñâ ?ºÎ¨∏ Ï°∞ÏÇ¨ Ï§?..`,
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
        `?âÍ? Í∑ºÍ±∞ ?ùÏÑ±: "${metadata.normalizedTitle}" 6Ï∂???üâ ?êÏàò Î∞?ÍµêÏ∞® Í≤ÄÏ¶??ùÏÑ± Ï§?..`,
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

      const validScoresCount = [
        evaluation.scores.performance?.score,
        evaluation.scores.novelty?.score,
        evaluation.scores.trendImportance?.score,
        evaluation.scores.academicSignificance?.score,
        evaluation.scores.practicalValue?.score,
        evaluation.scores.reproducibility?.score,
      ].filter((s) => s !== null && s !== undefined && typeof s === "number" && !isNaN(s)).length;
      const totalDimensions = 6;
      const evaluationCoverage = Math.round((validScoresCount / totalDimensions) * 100);

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
        codeAvailable: ["AVAILABLE_VERIFIED", "FOUND_UNVERIFIED"].includes(resources.codeStatus),
        dataStatus: resources.dataStatus,
        dataUrl: resources.dataUrl,
        dataAvailable: ["AVAILABLE_VERIFIED", "AVAILABLE_WITH_RESTRICTIONS"].includes(resources.dataStatus),
        reproducibilityStatus: resources.reproducibilityLevel,
        reproducibilityAssessment: resources.reproducibilityAssessment,
        verificationScope: evaluation.verificationScope,
        overallBadgeStatus: isUnverified ? "IDENTITY_NOT_FOUND" : evaluation.overallBadgeStatus,
        scores: evaluation.scores,
        publishingReliabilityScore: isUnverified ? null : (metadata.peerReviewed ? 5 : 3),
        publishingReliabilityDetails: metadata.publishingReliabilityDetails,
        recencyScore: isUnverified ? null : 5,
        recencyNotes: isUnverified ? "Paper identity not verified; recency excluded" : `${metadata.year} publication/preprint`,
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
    notify("recommendationEngine", "ÏµúÏ¢Ö Ï∂îÏ≤ú Í≤∞Ï†ï: ??Ï∏µÏúÑ ?òÏÇ¨Í≤∞Ï†ï(?ôÏà† Î¶¨Îçî vs Ï£ºÍ∞Ñ Ï£ºÏ†ú Î¶¨Îçî) ?∞ÏÇ∞ Ï§?..");
    const aiRecommendation = await generateRecommendation(
      provider,
      rankingCandidatesForRecommendation,
      parsedBriefing.coreTopic || "AI ?∞Íµ¨",
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
      analysisMode,
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
      analysisMode,
      usageSummary,
      fallbackUsed: false,
      verificationLevel: "HIGH",
      resultOrigin: "LIVE_PIPELINE",
    } as any;

    notify("completed", "∫–ºÆ øœ∑·: ∏Æ∆˜∆Æ π◊ »ƒ∫∏ ƒ´µÂ ª˝º∫ øœ∑·");
    return finalResponse;
  } catch (err: any) {
    console.warn("[Orchestrator Warning] AI pipeline failed or integrity check failed, using fallback analyzer:", err?.message);
    const fallbackReason = `AI Pipeline Error: ${err?.message || String(err)}`;
    const fallback = generateFallbackAnalysis(briefingMarkdown, fallbackReason);
    fallback.analysisRunId = analysisRunId;
    fallback.analysisMode = analysisMode;
    notify("completed", "Î∂ÑÏÑù ?ÑÎ£å (Dynamic Fallback ?ÅÏö©)");
    return fallback;
  }
}





