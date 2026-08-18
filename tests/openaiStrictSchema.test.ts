import { describe, it, expect } from "vitest";
import { assertOpenAIStrictSchemaCompatible } from "../server/pipeline/schemaValidator";
import { briefingParserSchema } from "../server/pipeline/briefingParser";
import { metadataVerifierSchema } from "../server/pipeline/metadataVerifier";
import { resourceVerifierSchema } from "../server/pipeline/resourceVerifier";
import { documentAnalyzerSchema } from "../server/pipeline/documentAnalyzer";
import { comparisonFinderSchema } from "../server/pipeline/comparisonFinder";
import { paperEvaluatorSchema } from "../server/pipeline/paperEvaluator";
import { recommendationEngineSchema } from "../server/pipeline/recommendationEngine";
import { parseBriefing } from "../server/pipeline/briefingParser";
import { createPipelineContext } from "../server/pipeline/context";
import { SCHEMA_VERSION } from "../server/config/versions";
import { z } from "zod";

describe("OpenAI Strict Schema & Structured Outputs Compatibility Tests", () => {
  it("BriefingParser schema has no optional fields and passes strict schema assertion", () => {
    expect(() => assertOpenAIStrictSchemaCompatible(briefingParserSchema, "BRIEFING_PARSER")).not.toThrow();
  });

  it("MetadataVerifier schema has no optional fields and passes strict schema assertion", () => {
    expect(() => assertOpenAIStrictSchemaCompatible(metadataVerifierSchema, "METADATA_VERIFIER")).not.toThrow();
  });

  it("ResourceVerifier schema has no optional fields and passes strict schema assertion", () => {
    expect(() => assertOpenAIStrictSchemaCompatible(resourceVerifierSchema, "RESOURCE_VERIFIER")).not.toThrow();
  });

  it("DocumentAnalyzer schema has no optional fields and passes strict schema assertion", () => {
    expect(() => assertOpenAIStrictSchemaCompatible(documentAnalyzerSchema, "DOCUMENT_ANALYZER")).not.toThrow();
  });

  it("ComparisonFinder schema has no optional fields and passes strict schema assertion", () => {
    expect(() => assertOpenAIStrictSchemaCompatible(comparisonFinderSchema, "COMPARISON_FINDER")).not.toThrow();
  });

  it("PaperEvaluator schema has no optional fields and passes strict schema assertion", () => {
    expect(() => assertOpenAIStrictSchemaCompatible(paperEvaluatorSchema, "PAPER_EVALUATOR")).not.toThrow();
  });

  it("RecommendationEngine schema has no optional fields and passes strict schema assertion", () => {
    expect(() => assertOpenAIStrictSchemaCompatible(recommendationEngineSchema, "RECOMMENDATION_ENGINE")).not.toThrow();
  });

  it("Catches optional fields or undefined unions if introduced into a schema", () => {
    const invalidSchemaWithOptional = z.object({
      id: z.string(),
      claimedMetrics: z.array(z.string()).optional(),
    });

    expect(() =>
      assertOpenAIStrictSchemaCompatible(invalidSchemaWithOptional, "TEST_INVALID")
    ).toThrowError(/optional/i);

    const invalidSchemaWithUndefined = z.object({
      title: z.union([z.string(), z.undefined()]),
    });

    expect(() =>
      assertOpenAIStrictSchemaCompatible(invalidSchemaWithUndefined, "TEST_UNDEFINED")
    ).toThrowError(/undefined/i);
  });

  it("Ensures claimedMetrics is array, doi defaults to null, authors is array, all object properties required", () => {
    const sampleBriefingData = {
      briefingTitle: "AI Weekly Digest",
      referenceDate: "2026-08-06",
      coreTopic: "Animal Pose Estimation",
      topicKeywords: ["Pose", "Vision"],
      papers: [
        {
          id: "paper-1",
          rawTitle: "Agent-Centric Animal Pose Forecasting",
          authors: ["Alice Smith", "Bob Jones"],
          year: "2026",
          venue: "CVPR 2026",
          snippet: "A novel approach for pose forecasting in wild animals.",
          claimedMetrics: [], // empty array when none
          mentionedCodeUrl: null, // null when missing
          mentionedDataUrl: null, // null when missing
        },
      ],
      datasets: [],
      tools: [],
      unverifiedItems: [],
    };

    const parsed = briefingParserSchema.parse(sampleBriefingData);
    expect(parsed.papers[0].claimedMetrics).toEqual([]);
    expect(parsed.papers[0].mentionedCodeUrl).toBeNull();
    expect(parsed.papers[0].authors).toEqual(["Alice Smith", "Bob Jones"]);

    const metadataData = {
      entityType: "PAPER" as const,
      identityStatus: "IDENTITY_VERIFIED" as const,
      canonicalTitle: "Agent-Centric Animal Pose Forecasting",
      canonicalUrl: null,
      matchConfidence: 1.0,
      matchReason: "Direct match",
      normalizedTitle: "Agent-Centric Animal Pose Forecasting",
      authors: ["Alice Smith"],
      year: "2026",
      venueOrPreprint: "CVPR 2026",
      doi: null, // null when missing
      arxivId: null,
      biorxivId: null,
      url: null,
      publicationStatus: "PEER_REVIEWED",
      peerReviewed: true,
      isPreprint: false,
      crossVerificationStatus: "VERIFIED",
      versionInfo: {
        publicationStatus: "PEER_REVIEWED",
        version: null,
        firstPublishedAt: null,
        lastUpdatedAt: null,
        isLatestVersion: true,
      },
      publishingReliabilityDetails: {
        conferenceName: "CVPR",
        journalName: null,
        peerReviewed: true,
        isPreprint: false,
        scoreReason: "CVPR top-tier conference",
        officialSourceUrl: null,
      },
      evidence: [],
    };

    const parsedMetadata = metadataVerifierSchema.parse(metadataData);
    expect(parsedMetadata.doi).toBeNull();
  });

  it("Schema version is updated to v5.3-identity-preservation to avoid reusing outdated optional/undefined cache", () => {
    expect(SCHEMA_VERSION).toBe("v5.3-identity-preservation");
  });

  it("Parser quality gate filters out general Markdown headings from candidate paper list", async () => {
    const mockProvider = {
      name: "OPENAI" as const,
      generateStructured: async () => ({
        data: {
          briefingTitle: "Test Briefing",
          referenceDate: "2026-08-06",
          coreTopic: "Test Topic",
          topicKeywords: ["Test"],
          papers: [
            {
              id: "paper-1",
              rawTitle: "핵심 문제", // Heading to be filtered out
              authors: [],
              year: "2026",
              venue: "arXiv",
              snippet: "Non paper heading",
              claimedMetrics: [],
              mentionedCodeUrl: null,
              mentionedDataUrl: null,
            },
            {
              id: "paper-2",
              rawTitle: "Valid Animal Pose Estimation Paper",
              authors: ["John Doe"],
              year: "2026",
              venue: "CVPR 2026",
              snippet: "Real research paper snippet",
              claimedMetrics: [],
              mentionedCodeUrl: "https://github.com/example/repo",
              mentionedDataUrl: null,
            },
          ],
          datasets: [],
          tools: [],
          unverifiedItems: [],
        },
        rawText: "{}",
        provider: "OPENAI" as const,
        model: "gpt-4.1-mini",
        responseId: "resp_test123",
        usage: { inputTokens: 100, outputTokens: 50, totalTokens: 150 },
      }),
    };

    const context = createPipelineContext("run-123", "test briefing content");
    const result = await parseBriefing(mockProvider as any, "test markdown", context);

    expect(result.papers.length).toBe(1);
    expect(result.papers[0].rawTitle).toBe("Valid Animal Pose Estimation Paper");
    expect(result.papers[0].claimedMetrics).toEqual([]);
    expect(result.papers[0].mentionedCodeUrl).toBe("https://github.com/example/repo");
  });
});
