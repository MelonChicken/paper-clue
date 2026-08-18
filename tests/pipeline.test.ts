import { describe, it, expect } from "vitest";
import { getRouteConfig, isProEscalationEnabled } from "../server/config/routingConfig.ts";
import { calculatePublishingReliability, calculateRecencyScore } from "../server/pipeline/scoringUtils.ts";
import { classifyGeminiError } from "../server/pipeline/errorUtils.ts";
import { generateBriefingParseCacheKey, generatePaperCacheKey } from "../server/pipeline/cacheManager.ts";
import { generateFallbackAnalysis } from "../server/fallbackAnalyzer.ts";
import { resolveCandidateIdentity, validateCanonicalIdentity } from "../server/pipeline/candidateResolver.ts";
import { computePaperEvaluationCoverage, isCandidateEligibleForRecommendation, determineRecommendationStatus } from "../src/utils/evaluationHelpers.ts";

describe("Pipeline Architecture & Routing Tests", () => {
  it("Scenario A: Default routing uses default model config", () => {
    delete process.env.ENABLE_PRO_ESCALATION;

    const stages = [
      "BRIEFING_PARSER",
      "METADATA_VERIFIER",
      "RESOURCE_VERIFIER",
      "DOCUMENT_ANALYZER",
      "COMPARISON_FINDER",
      "PAPER_EVALUATOR",
      "RECOMMENDATION_ENGINE",
    ] as const;

    stages.forEach((stage) => {
      const config = getRouteConfig(stage);
      expect(config.defaultModel).toBe("gpt-4.1-mini");
    });
  });

  it("Scenario B: Escalation models are configured for evaluators when ENABLE_PRO_ESCALATION=true", () => {
    process.env.ENABLE_PRO_ESCALATION = "true";

    const evaluatorConfig = getRouteConfig("PAPER_EVALUATOR");
    expect(evaluatorConfig.defaultModel).toBe("gpt-4.1-mini");
    expect(evaluatorConfig.escalationModel).toBe("gpt-4.1-o");

    const parserConfig = getRouteConfig("BRIEFING_PARSER");
    expect(parserConfig.defaultModel).toBe("gpt-4.1-mini");
    expect(parserConfig.escalationModel).toBe("gpt-4.1-o");

    delete process.env.ENABLE_PRO_ESCALATION;
  });

  it("Scenario C: Deterministic scoring utilities", () => {
    expect(calculatePublishingReliability({ peerReviewed: true, venueOrPreprint: "CVPR 2025" })).toBe(5);
    expect(calculatePublishingReliability({ peerReviewed: false, venueOrPreprint: "arXiv" })).toBe(3);
    expect(calculateRecencyScore(2026, 2026)).toBe(5);
    expect(calculateRecencyScore(2024, 2026)).toBe(3);
  });

  it("Scenario D: Error classification accurately categorizes Gemini API errors", () => {
    const quotaErr = new Error("429 RESOURCE_EXHAUSTED: Quota exceeded for gemini-2.5-pro");
    expect(classifyGeminiError(quotaErr).code).toBe("QUOTA_EXHAUSTED");

    const schemaErr = new Error("Quality Gate Failed: Invalid JSON schema output");
    expect(classifyGeminiError(schemaErr).code).toBe("SCHEMA_VALIDATION_FAILED");

    const genericErr = new Error("Fetch failed: Network socket reset");
    expect(classifyGeminiError(genericErr).code).toBe("NETWORK_OR_TIMEOUT");
  });

  it("Scenario E: Cache key generation includes title/doi or provenance hash", () => {
    const paperCacheKey = generatePaperCacheKey({
      rawTitle: "Agent-Centric Animal Pose Forecasting",
      title: "Agent-Centric Animal Pose Forecasting",
    });
    expect(paperCacheKey).toBeTypeOf("string");
    expect(paperCacheKey.length).toBe(32);

    const doiCacheKey = generatePaperCacheKey({
      doi: "10.1016/j.cell.2025.01.001",
    });
    expect(doiCacheKey).toBeTypeOf("string");
    expect(doiCacheKey.length).toBe(32);

    const parseCacheKey = generateBriefingParseCacheKey(
      "OPENAI",
      "hash123",
      "STANDARD",
      "v1",
      "v1",
      "v1",
      "gpt-4.1-mini"
    );
    expect(parseCacheKey).toBeTypeOf("string");
    expect(parseCacheKey.length).toBe(64);
  });

  it("Scenario F: Fallback analyzer produces deterministic candidates without AI recommendation", () => {
    const sampleBriefing = `
# Weekly Research Briefing
1. Agent-Centric Animal Pose Forecasting
   - arXiv: https://arxiv.org/abs/2607.19548
   - GitHub: https://github.com/kristinbranson/AnimalPoseForecasting
2. Comparison of Multiple Video Tracking-Based Behavioral Summary
   - bioRxiv: https://www.biorxiv.org/
    `;

    const result = generateFallbackAnalysis(sampleBriefing, "Test fallback");
    expect(result.fallbackUsed).toBe(true);
    expect(result.candidates.length).toBeLessThanOrEqual(5);
    expect(result.candidates.length).toBeGreaterThan(0);
    expect(result.aiRecommendation).toBeDefined();
    expect(result.aiRecommendation?.topRecommendedPaperId).toBeNull();
  });
});

describe("Candidate Identity Resolution & Evidence Semantics Regression Tests", () => {
  it("Regression Test A (Exact Match): Known identifier / exact title resolves to IDENTITY_VERIFIED", () => {
    // Case 1: With explicit ArXiv ID
    const exactArxiv = resolveCandidateIdentity({
      rawTitle: "Agent-Centric Animal Pose Forecasting",
      arxivId: "2607.19548",
      snippet: "arXiv:2607.19548",
    });

    expect(exactArxiv.identityStatus).toBe("IDENTITY_VERIFIED");
    expect(exactArxiv.matchConfidence).toBeGreaterThanOrEqual(0.9);
    expect(exactArxiv.entityType).toBe("PAPER");
    expect(exactArxiv.arxivId).toBe("2607.19548");

    // Case 2: Exact known catalog title
    const exactTitle = resolveCandidateIdentity({
      rawTitle: "Attention Is All You Need",
    });

    expect(exactTitle.identityStatus).toBe("IDENTITY_VERIFIED");
    expect(exactTitle.canonicalTitle).toBe("Attention Is All You Need");
    expect(exactTitle.entityType).toBe("PAPER");

    // Case 3: Exact VLA Paper: "Decoding Task Progress from VLA Representations"
    const exactVLA = resolveCandidateIdentity({
      rawTitle: "Decoding Task Progress from VLA Representations",
    });
    expect(exactVLA.identityStatus).toBe("IDENTITY_VERIFIED");
    expect(exactVLA.canonicalTitle).toBe("Decoding Task Progress from VLA Representations");
    expect(exactVLA.entityType).toBe("PAPER");
    expect(exactVLA.matchConfidence).toBeGreaterThanOrEqual(0.9);
  });

  it("Regression Test B (Fuzzy/Possible Match): Typo or variant title resolves cleanly", () => {
    // Typo / variant title with extra words
    const fuzzyCandidate = resolveCandidateIdentity({
      rawTitle: "Deep Residual Learning for Image Recognition (CVPR 2016 Oral)",
    });

    expect(["IDENTITY_VERIFIED", "POSSIBLE_MATCH"]).toContain(fuzzyCandidate.identityStatus);
    expect(fuzzyCandidate.canonicalTitle).toBe("Deep Residual Learning for Image Recognition");
    expect(fuzzyCandidate.matchConfidence).toBeGreaterThanOrEqual(0.7);

    // Variant / Abbreviated: "ForeWAM ??Foresight Without Seeing"
    const forewamCand = resolveCandidateIdentity({
      rawTitle: "ForeWAM ??Foresight Without Seeing",
    });
    expect(["IDENTITY_VERIFIED", "POSSIBLE_MATCH", "RESOLVED_FROM_METHOD_OR_PROJECT"]).toContain(forewamCand.identityStatus);
    expect(forewamCand.canonicalTitle).toBe("Foresight Without Seeing: Latent Futures for World Action Models");
    expect(forewamCand.matchConfidence).toBeGreaterThanOrEqual(0.75);
  });

  it("Regression Test C (Method/Model Resolution): Method or Model mention classifies and resolves", () => {
    const methodCandidate = resolveCandidateIdentity({
      rawTitle: "YOLOv8 Real-Time Object Detection Architecture",
    });

    expect(["MODEL", "METHOD"]).toContain(methodCandidate.entityType);
    expect(methodCandidate.identityStatus).toBe("RESOLVED_FROM_METHOD_OR_PROJECT");
    expect(methodCandidate.canonicalTitle).toContain("YOLOv8");

    // Method to Paper: "Gated VLA-Cache"
    const vlaCacheCand = resolveCandidateIdentity({
      rawTitle: "Gated VLA-Cache",
    });
    expect(["METHOD", "MODEL"]).toContain(vlaCacheCand.entityType);
    expect(vlaCacheCand.identityStatus).toBe("RESOLVED_FROM_METHOD_OR_PROJECT");
    expect(vlaCacheCand.canonicalTitle).toBe("Neural Introspection Gating for Adaptive KV-Cache Reuse in Vision-Language-Action Models");
    expect(vlaCacheCand.matchConfidence).toBeGreaterThanOrEqual(0.75);
  });

  it("Recommendation Eligibility & Coverage Test: Enforces 60% threshold and verified identity", () => {
    // Valid candidate with 5/6 scored dimensions (83%)
    const validCandidate: any = {
      id: "paper-1",
      entityType: "PAPER",
      identityStatus: "IDENTITY_VERIFIED",
      crossVerificationStatus: "VERIFIED",
      scores: {
        performance: { score: 4, status: "SCORED" },
        novelty: { score: 4, status: "SCORED" },
        trendImportance: { score: 5, status: "SCORED" },
        academicSignificance: { score: 4, status: "SCORED" },
        practicalValue: { score: 4, status: "SCORED" },
        reproducibility: { score: null, status: "INSUFFICIENT_EVIDENCE" },
      },
    };

    const coverage = computePaperEvaluationCoverage(validCandidate.scores);
    expect(coverage.evaluationCoverage).toBe(83);
    expect(isCandidateEligibleForRecommendation(validCandidate)).toBe(true);

    // Ineligible candidate: coverage < 60% (e.g. 2/6 = 33%)
    const lowCoverageCand: any = {
      id: "paper-2",
      entityType: "PAPER",
      identityStatus: "IDENTITY_VERIFIED",
      crossVerificationStatus: "VERIFIED",
      scores: {
        performance: { score: null, status: "INSUFFICIENT_EVIDENCE" },
        novelty: { score: 4, status: "SCORED" },
        trendImportance: { score: 5, status: "SCORED" },
        academicSignificance: { score: null, status: "INSUFFICIENT_EVIDENCE" },
        practicalValue: { score: null, status: "INSUFFICIENT_EVIDENCE" },
        reproducibility: { score: null, status: "INSUFFICIENT_EVIDENCE" },
      },
    };

    expect(isCandidateEligibleForRecommendation(lowCoverageCand)).toBe(false);

    // Ineligible candidate: NOT_FOUND identity
    const notFoundCand: any = {
      entityType: "PAPER",
      id: "paper-3",
      identityStatus: "IDENTITY_NOT_FOUND",
      crossVerificationStatus: "NOT_FOUND",
      scores: {
        performance: { score: 4, status: "SCORED" },
        novelty: { score: 4, status: "SCORED" },
        trendImportance: { score: 4, status: "SCORED" },
        academicSignificance: { score: 4, status: "SCORED" },
        practicalValue: { score: 4, status: "SCORED" },
        reproducibility: { score: 4, status: "SCORED" },
      },
    };

    expect(isCandidateEligibleForRecommendation(notFoundCand)).toBe(false);
  });
});


import { runAnalysisPipeline } from "../server/pipeline/orchestrator.ts";
import { AIProvider, StructuredGenerationRequest } from "../server/pipeline/providerInterface.ts";

const usage = { inputTokens: null, cachedInputTokens: null, outputTokens: null, totalTokens: null, webSearchCalls: null };

function makeStabilizationMockProvider(): AIProvider {
  return {
    name: "OPENAI",
    async generateStructured<T>(request: StructuredGenerationRequest<T>) {
      const prompt = request.userPrompt || "";
      let data: any;
      if (request.stage === "BRIEFING_PARSER") {
        data = {
          briefingTitle: "VLA Weekly Regression Briefing",
          referenceDate: "2026-08-17",
          coreTopic: "vision-language-action robotics",
          topicKeywords: ["VLA", "robotics", "benchmark"],
          papers: [
            { id: "p-reflex", rawTitle: "Reflex: Enabling Fast and Predictive Vision-Language-Action Models for Reaction-Critical Manipulation", authors: ["Anonymous Authors"], year: "2026", venue: "arXiv preprint", snippet: "Wrong identifier arXiv:2608.13474", claimedMetrics: [], mentionedCodeUrl: null, mentionedDataUrl: null },
            { id: "p-repo", rawTitle: "OpenGalaxea repository", authors: [], year: "2026", venue: "GitHub", snippet: "Repository for GalaxeaVLA", claimedMetrics: [], mentionedCodeUrl: "https://github.com/OpenGalaxea/GalaxeaVLA", mentionedDataUrl: null },
            { id: "p-robotwin", rawTitle: "RoboTwin 2.0", authors: ["RoboTwin Authors"], year: "2026", venue: "arXiv preprint", snippet: "RoboTwin 2.0 reports quantitative benchmark results in the abstract.", claimedMetrics: ["success rate improvement"], mentionedCodeUrl: null, mentionedDataUrl: null },
            { id: "p-vla-arena", rawTitle: "VLA-Arena benchmark", authors: [], year: "2026", venue: "Benchmark website", snippet: "VLA robotics benchmark artifact", claimedMetrics: [], mentionedCodeUrl: null, mentionedDataUrl: null },
          ],
          datasets: [{ name: "RoboTwin", description: "robotics benchmark dataset", link: "https://robotwin-benchmark.github.io/" }],
          tools: [{ name: "OpenGalaxea", description: "supporting repository", link: "https://github.com/OpenGalaxea/GalaxeaVLA" }],
          unverifiedItems: [],
        };
      } else if (request.stage === "METADATA_VERIFIER") {
        const isRepo = prompt.includes("OpenGalaxea repository");
        const isRoboTwin = prompt.includes("RoboTwin 2.0");
        const isArena = prompt.includes("VLA-Arena benchmark");
        data = {
          entityType: isRepo ? "REPOSITORY" : isArena ? "BENCHMARK" : "PAPER",
          identityStatus: isRepo || isArena ? "POSSIBLE_MATCH" : "IDENTITY_VERIFIED",
          canonicalTitle: isRepo ? "OpenGalaxea repository" : isRoboTwin ? "RoboTwin 2.0: A Scalable Data Generator and Benchmark for Bimanual Robotic Manipulation" : isArena ? "VLA-Arena benchmark" : "Reflex: Enabling Fast and Predictive Vision-Language-Action Models for Reaction-Critical Manipulation",
          normalizedTitle: isRepo ? "OpenGalaxea repository" : isRoboTwin ? "RoboTwin 2.0: A Scalable Data Generator and Benchmark for Bimanual Robotic Manipulation" : isArena ? "VLA-Arena benchmark" : "Reflex: Enabling Fast and Predictive Vision-Language-Action Models for Reaction-Critical Manipulation",
          matchConfidence: 0.95,
          matchReason: "mock metadata",
          authors: isRepo || isArena ? [] : ["Anonymous Authors"],
          year: "2026",
          venueOrPreprint: isRepo ? "GitHub" : isArena ? "Benchmark website" : "arXiv preprint",
          doi: null,
          arxivId: isRoboTwin ? "2601.00001" : isRepo || isArena ? null : "2608.13474",
          biorxivId: null,
          url: null,
          canonicalUrl: null,
          publicationStatus: "preprint",
          peerReviewed: false,
          isPreprint: true,
          crossVerificationStatus: isRepo || isArena ? "SINGLE_SOURCE" : "VERIFIED",
          versionInfo: { publicationStatus: "preprint", version: "v1", firstPublishedAt: "2026-01-01", lastUpdatedAt: null, isLatestVersion: true },
          publishingReliabilityDetails: { conferenceName: null, journalName: null, peerReviewed: false, isPreprint: true, scoreReason: "mock", officialSourceUrl: null },
          evidence: [],
        };
      } else if (request.stage === "RESOURCE_VERIFIER") {
        data = { codeStatus: "AVAILABLE_VERIFIED", codeUrl: "https://github.com/example/repo", dataStatus: "AVAILABLE_VERIFIED", dataUrl: "https://example.com/data", checkpointStatus: "NOT_APPLICABLE", documentationStatus: "HIGH", executionVerification: "NOT_PERFORMED", reproducibilityLevel: "CODE_ONLY", evidence: [] };
      } else if (request.stage === "DOCUMENT_ANALYZER") {
        data = { researchQuestion: "VLA robotics manipulation", method: "robotics VLA benchmark", datasets: ["RoboTwin"], metrics: ["success rate"], baselines: ["baseline policy"], quantitativeResults: ["The paper reports quantitative success-rate results."], quantitativeClaims: [{ metricName: "success rate", value: "reported improvement", dataset: "RoboTwin", sourceSection: "Abstract", sourceQuoteOrEvidence: "reports quantitative benchmark results", evidenceStatus: "VERIFIED" }], sotaClaim: "paper-reported", ablations: [], limitations: [], codeDataAvailabilityNotes: null, evidence: [] };
      } else if (request.stage === "COMPARISON_FINDER") {
        data = { directComparisonStudies: [], nearTaskComparisonStudies: [], contextualRelatedStudies: [], representativePriorStudies: [], sotaStatus: "candidate-scoped comparison only", summary: "No unrelated LLM benchmark description." };
      } else {
        data = { scores: { performance: { score: 4, status: "SCORED", reason: "Paper reports quantitative robotics benchmark evidence.", scope: "EXTERNAL_BENCHMARK", evidence: [{ claimText: "reports quantitative benchmark results", sourceType: "PAPER", sourceReference: "RoboTwin 2.0", evidenceLocation: "Abstract", verificationLevel: "PAPER_REPORTED_VERIFIED" }] }, novelty: { score: 4, status: "SCORED", reason: "Grounded in candidate metadata.", scope: "QUALITATIVE_ONLY", evidence: [] }, trendImportance: { score: 4, status: "SCORED", reason: "VLA robotics relevance.", scope: "QUALITATIVE_ONLY", evidence: [] }, academicSignificance: { score: 4, status: "SCORED", reason: "Academic preprint metadata.", scope: "QUALITATIVE_ONLY", evidence: [] }, practicalValue: { score: 4, status: "SCORED", reason: "Verified resources.", scope: "QUALITATIVE_ONLY", evidence: [] }, reproducibility: { score: 3, status: "SCORED", reason: "Code/data available, execution not independently verified.", scope: "QUALITATIVE_ONLY", evidence: [] } }, uncertainty: { factVerificationItems: [], insufficientEvidenceItems: [], researchOpenQuestions: [] }, topRecommendedPaperId: "p-robotwin", recommendationReason: "RoboTwin is the ranking-eligible paper with grounded evidence.", positionInRecentTrend: "VLA robotics benchmark", tradeoffExplanation: "candidate scoped", scoresUsed: ["grounded evidence"], scoresExcluded: [], performanceEvidenceUsed: true, keyStrengths: [], keyLimitationsOrRisks: [], readingQuestions: [], followUpResearchQuestions: [], verificationNeededNotes: [] };
      }
      return { data, provider: "OPENAI", model: request.model || "mock", usage } as any;
    },
  };
}

describe("Final stabilization production regression tests", () => {
  it("Regression Test D: wrong arXiv identifier is detected, discarded, and not verified", () => {
    const result = resolveCandidateIdentity({
      rawTitle: "Reflex: Enabling Fast and Predictive Vision-Language-Action Models for Reaction-Critical Manipulation",
      arxivId: "2608.13474",
      snippet: "arXiv:2608.13474",
    });

    expect(result.identityStatus).toBe("METADATA_CONFLICT");
    expect(result.crossVerificationStatus).toBe("CONFLICTING");
    expect(result.metadataConflict?.conflictingIdentifier).toBe("arXiv:2608.13474");
    expect(result.canonicalTitle).toBe("Reflex: Enabling Fast and Predictive Vision-Language-Action Models for Reaction-Critical Manipulation");
    expect(result.arxivId).not.toBe("2608.13474");
  });

  it("Regression Tests E/F/G: production pipeline separates resources, preserves paper evidence, and avoids generic domain contamination", async () => {
    const result = await runAnalysisPipeline(makeStabilizationMockProvider(), "# VLA Weekly Regression", true, "STANDARD");

    const reflex = result.supportingResources?.find((r) => r.name.includes("Reflex"));
    expect(reflex?.verificationStatus).toBe("CONFLICTING");

    expect(result.candidates.every((candidate) => candidate.entityType === "PAPER")).toBe(true);
    expect(result.supportingResources?.some((r) => r.entityType === "REPOSITORY" || r.entityType === "TOOL")).toBe(true);
    expect(result.aiRecommendation.topRecommendedPaperId).toBe("p-robotwin");

    const roboTwin = result.candidates.find((candidate) => candidate.id === "p-robotwin");
    expect(roboTwin?.scores.performance.evidence.paperText.length).toBeGreaterThan(0);
    expect(roboTwin?.scores.performance.reason.toLowerCase()).not.toContain("no quantitative");

    const serialized = JSON.stringify(result).toLowerCase();
    expect(serialized).not.toContain("large language assistant benchmark");
  });
});

describe("Cache replay recommendation semantics regression tests", () => {
  it("Regression Test H: cached wrong identifier is revalidated and rejected", () => {
    const cachedCandidate = {
      canonicalTitle: "Reflex: Enabling Fast and Predictive Vision-Language-Action Models for Reaction-Critical Manipulation",
      arxivId: "2608.12519",
      doi: null,
      authors: ["Anonymous Authors"],
      identityStatus: "IDENTITY_VERIFIED",
    };

    const integrity = validateCanonicalIdentity({
      rawMention: cachedCandidate.canonicalTitle,
      canonicalTitle: cachedCandidate.canonicalTitle,
      authors: cachedCandidate.authors,
      arxivId: cachedCandidate.arxivId,
      doi: cachedCandidate.doi,
    });

    const replayResolution = resolveCandidateIdentity({
      rawTitle: cachedCandidate.canonicalTitle,
      authors: cachedCandidate.authors,
      arxivId: integrity.isValid ? cachedCandidate.arxivId : null,
      doi: integrity.isValid ? cachedCandidate.doi : null,
    });

    expect(integrity.isValid).toBe(false);
    expect(integrity.conflict?.conflictingIdentifier).toBe("arXiv:2608.12519");
    expect(integrity.discardedIdentifiers).toContain("arxiv:2608.12519");
    expect(replayResolution.arxivId).not.toBe("2608.12519");
  });

  it("Regression Test I: verified identity is pending until evaluation coverage exists", () => {
    const candidate: any = {
      entityType: "PAPER",
      identityStatus: "IDENTITY_VERIFIED",
      crossVerificationStatus: "VERIFIED",
      isRankingEligible: true,
      evaluationCoverage: null,
    };

    expect(determineRecommendationStatus(candidate)).toBe("PENDING_EVALUATION");
    expect(isCandidateEligibleForRecommendation(candidate)).toBe(false);
  });

  it("Regression Test J: possible-match repository is never eligible in resolver-only stage", () => {
    const candidate: any = {
      entityType: "REPOSITORY",
      identityStatus: "POSSIBLE_MATCH",
      crossVerificationStatus: "SINGLE_SOURCE",
      isRankingEligible: false,
      evaluationCoverage: null,
    };

    expect(determineRecommendationStatus(candidate)).not.toBe("ELIGIBLE");
    expect(isCandidateEligibleForRecommendation(candidate)).toBe(false);
  });
});
