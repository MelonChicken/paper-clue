import { z } from "zod";
import {
  VerifiedMetadataResult,
  VerifiedResourcesResult,
  DocumentAnalysisResult,
  ComparisonFinderResult,
  PaperEvaluationResult,
} from "./types";
import {
  DimensionScore,
  ScoreStatus,
  ScoreScope,
  VerificationScope,
  SourceType,
  VerificationLevel,
} from "../../src/types";
import { getRouteConfig } from "../config/routingConfig";
import { logPipelineCall } from "../observability/pipelineLogger";
import { PipelineContext } from "./context";
import { PROMPT_VERSIONS, SCHEMA_VERSION, ROUTE_VERSION } from "../config/versions";
import { persistentCache, generatePaperCacheKey, CACHE_TTL } from "./cacheManager";
import { AIProvider } from "./providerInterface";

const evidenceClaimSchema = z.object({
  claimText: z.string(),
  sourceType: z.enum(["PAPER", "EXTERNAL_SOURCE", "AI_INTERPRETATION"]),
  sourceReference: z.string().nullable(),
  evidenceLocation: z.string().nullable(),
  verificationLevel: z.enum([
    "PAPER_REPORTED_VERIFIED",
    "EXTERNALLY_CORROBORATED",
    "INDEPENDENTLY_REPRODUCED",
    "NEEDS_VERIFICATION",
    "INSUFFICIENT_EVIDENCE",
  ]),
});

const dimensionSchema = z.object({
  score: z.number().nullable(),
  status: z.enum(["SCORED", "NEEDS_VERIFICATION", "NOT_APPLICABLE", "INSUFFICIENT_EVIDENCE"]),
  reason: z.string(),
  scope: z.enum(["EXTERNAL_BENCHMARK", "INTERNAL_EXPERIMENT", "QUALITATIVE_ONLY"]),
  evidence: z.array(evidenceClaimSchema),
});

export const paperEvaluatorSchema = z.object({
  scores: z.object({
    performance: dimensionSchema,
    novelty: dimensionSchema,
    trendImportance: dimensionSchema,
    academicSignificance: dimensionSchema,
    practicalValue: dimensionSchema,
    reproducibility: dimensionSchema,
  }),
  uncertainty: z.object({
    factVerificationItems: z.array(z.string()),
    insufficientEvidenceItems: z.array(z.string()),
    researchOpenQuestions: z.array(z.string()),
  }),
});

export async function evaluatePaper(
  provider: AIProvider,
  metadata: VerifiedMetadataResult,
  resources: VerifiedResourcesResult,
  docAnalysis: DocumentAnalysisResult,
  comparison: ComparisonFinderResult,
  context: PipelineContext
): Promise<PaperEvaluationResult> {
  const route = getRouteConfig("PAPER_EVALUATOR");
  let currentModel = route.defaultModel;
  let attempt = 1;
  let escalated = false;
  let escalationReason: string | undefined = undefined;

  const promptVersion = PROMPT_VERSIONS.PAPER_EVALUATOR;

  const cacheKey = generatePaperCacheKey(
    {
      doi: metadata.doi,
      arxivId: metadata.arxivId,
      biorxivId: metadata.biorxivId,
      title: metadata.canonicalTitle || metadata.normalizedTitle,
    },
    provider.name,
    currentModel,
    SCHEMA_VERSION
  );

  const cached = await persistentCache.get<PaperEvaluationResult>(
    "paper-evaluation",
    cacheKey,
    context,
    {
      provider: provider.name,
      stage: "PAPER_EVALUATOR",
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
      stage: "PAPER_EVALUATOR",
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

  const isSupportingResourceEntity = ["REPOSITORY", "DATASET", "TOOL", "BENCHMARK", "UNKNOWN"].includes(metadata.entityType);
  if (isSupportingResourceEntity) {
    const notApplicableDimension = (reason: string): DimensionScore => ({
      score: null,
      status: "NOT_APPLICABLE",
      reason,
      notes: reason,
      scope: "QUALITATIVE_ONLY",
      chartValue: null,
      evidence: { paperText: [], externalSource: [], aiInterpretation: [] },
    });
    const reason = `${metadata.entityType} is a supporting resource, not a paper ranking candidate; paper evaluation dimensions are not applicable.`;

    return {
      paperId: metadata.paperId,
      scores: {
        performance: notApplicableDimension(reason),
        novelty: notApplicableDimension(reason),
        trendImportance: notApplicableDimension(reason),
        academicSignificance: notApplicableDimension(reason),
        practicalValue: notApplicableDimension(reason),
        reproducibility: notApplicableDimension(reason),
      },
      uncertainty: {
        factVerificationItems: [],
        insufficientEvidenceItems: [],
        researchOpenQuestions: [],
      },
      verificationBadges: {
        metadataVerified: metadata.crossVerificationStatus !== "NOT_FOUND",
        publicationVerified: false,
        codeVerified: false,
        dataVerified: false,
        performanceEvidenceVerified: false,
        reproducibilityVerified: false,
      },
      verificationScope: {
        metadata: metadata.crossVerificationStatus === "VERIFIED" ? "VERIFIED" : "SINGLE_SOURCE",
        publication: "NOT_CHECKED",
        code: "NOT_CHECKED",
        data: "NOT_CHECKED",
        performance: "NOT_CHECKED",
        reproducibility: "NOT_CHECKED",
      },
      overallBadgeStatus: "일부 정보 미확정" as any,
    };
  }
  // If candidate is NOT_FOUND or IDENTITY_NOT_FOUND, skip LLM call and return zero/null evaluation immediately
  if (
    metadata.crossVerificationStatus === "NOT_FOUND" ||
    metadata.identityStatus === "IDENTITY_NOT_FOUND"
  ) {
    const unverifiedDimension = (reason: string): DimensionScore => ({
      score: null,
      status: "INSUFFICIENT_EVIDENCE",
      reason,
      notes: reason,
      scope: "QUALITATIVE_ONLY",
      chartValue: null,
      evidence: { paperText: [], externalSource: [], aiInterpretation: [] },
    });

    return {
      paperId: metadata.paperId,
      scores: {
        performance: unverifiedDimension("?쇰Ц ?좎썝 誘명솗??NOT_FOUND)?쇰줈 ?됯? 蹂대쪟"),
        novelty: unverifiedDimension("?쇰Ц ?좎썝 誘명솗??NOT_FOUND)?쇰줈 ?됯? 蹂대쪟"),
        trendImportance: unverifiedDimension("?쇰Ц ?좎썝 誘명솗??NOT_FOUND)?쇰줈 ?됯? 蹂대쪟"),
        academicSignificance: unverifiedDimension("?쇰Ц ?좎썝 誘명솗??NOT_FOUND)?쇰줈 ?됯? 蹂대쪟"),
        practicalValue: unverifiedDimension("?쇰Ц ?좎썝 誘명솗??NOT_FOUND)?쇰줈 ?됯? 蹂대쪟"),
        reproducibility: unverifiedDimension("?쇰Ц ?좎썝 誘명솗??NOT_FOUND)?쇰줈 ?됯? 蹂대쪟"),
      },
      uncertainty: {
        factVerificationItems: ["?먮Ц ?앸퀎 ?ㅽ뙣濡??섏튂 寃利?遺덇?"],
        insufficientEvidenceItems: ["논문 서지 및 실험 데이터 미확보"],
        researchOpenQuestions: ["?숈씪 ?곌뎄???뺥솗???쒖? ?뺣낫 ?뺤씤 ?꾩슂"],
      },
      verificationBadges: {
        metadataVerified: false,
        publicationVerified: false,
        codeVerified: false,
        dataVerified: false,
        performanceEvidenceVerified: false,
        reproducibilityVerified: false,
      },
      verificationScope: {
        metadata: "NOT_FOUND",
        publication: "NOT_FOUND",
        code: "NOT_FOUND",
        data: "NOT_FOUND",
        performance: "NOT_CHECKED",
        reproducibility: "NOT_CHECKED",
      },
      overallBadgeStatus: "IDENTITY_NOT_FOUND",
    };
  }

  const systemInstruction = `
You are an expert peer reviewer and paper evaluation engine.
Evaluate the candidate paper across 6 core radar dimensions based on verified facts and evidence collected so far.

6 CORE RADAR DIMENSIONS:
1. performance (?깅뒫 寃쎌웳??: Evaluate quantitative performance claims against SOTA/baselines.
   - RULE: If performance table or benchmark evidence is reported directly in the paper, assign score based on paper evidence (with verificationLevel='PAPER_REPORTED_VERIFIED').
   - If performance numbers are NOT found or unverified, set score=null, status='NEEDS_VERIFICATION'. Do NOT assign arbitrary 3 or 4 points.
2. novelty (諛⑸쾿濡좎쟻 ?좉퇋??: Innovation of proposed architecture/formulation.
3. trendImportance (?곌뎄 ?먮쫫??以묒슂??: Relevance to current research trends.
4. academicSignificance (?숈닠???좎쓽誘몄꽦): Academic impact and rigour.
5. practicalValue (?ㅻТ쨌?곌뎄 ?곸슜 媛移?: Applicability, open code/weights, utility.
6. reproducibility (?ы쁽 媛?μ꽦): Code/data/checkpoint/environment availability.
   - Base reproducibility score strictly on verified code/data availability.
   - If code is NOT_FOUND or execution was NOT_PERFORMED, do NOT assign 4 or 5 points. Set score <= 2 or null.

EACH DIMENSION RETURN STRUCTURE:
{
  "score": number | null (1 to 5, or null if unverified / insufficient evidence),
  "status": "SCORED" | "NEEDS_VERIFICATION" | "NOT_APPLICABLE" | "INSUFFICIENT_EVIDENCE",
  "reason": "string (objective rationale with evidence references)",
  "scope": "EXTERNAL_BENCHMARK" | "INTERNAL_EXPERIMENT" | "QUALITATIVE_ONLY",
  "evidence": {
    "paperText": [...],
    "externalSource": [...],
    "aiInterpretation": [...]
  }
}

MANDATORY RULES:
- If evidence is insufficient for a dimension, MUST return score: null and status: 'INSUFFICIENT_EVIDENCE' or 'NEEDS_VERIFICATION'.
- NEVER put arbitrary default scores (e.g. 3.5).
`.trim();

  const userPrompt = `
Evaluate paper:
Title: "${metadata.canonicalTitle || metadata.normalizedTitle}" (Entity: ${metadata.entityType}, Identity: ${metadata.identityStatus})
Venue: ${metadata.venueOrPreprint} (Peer Reviewed: ${metadata.peerReviewed}, Preprint: ${metadata.isPreprint})
Code Status: ${resources.codeStatus} (${resources.codeUrl || "None"})
Data Status: ${resources.dataStatus} (${resources.dataUrl || "None"})
Reproducibility Level: ${resources.reproducibilityLevel}
Document Analysis:
- Method: ${docAnalysis.method || "N/A"}
- Quantitative Results: ${(docAnalysis.quantitativeResults || []).join("; ") || "N/A"}
- Baselines: ${(docAnalysis.baselines || []).join("; ") || "N/A"}
Comparison Module:
- Direct Comparisons: ${comparison.comparisonModule.directComparisonStudies.length}
- SOTA Status: ${comparison.comparisonModule.sotaStatus}
`.trim();

  const executeCall = async (modelToUse: string): Promise<PaperEvaluationResult> => {
    const startIso = new Date().toISOString();
    try {
      console.log(`[Diagnostic Log: PaperEvaluator Start] Attempt ${attempt} for paper: "${metadata.canonicalTitle || metadata.normalizedTitle}" using ${modelToUse}`);
      const result = await provider.generateStructured<z.infer<typeof paperEvaluatorSchema>>({
        stage: "PAPER_EVALUATOR",
        model: modelToUse,
        systemInstruction,
        userPrompt,
        schema: paperEvaluatorSchema,
        schemaName: "paperEvaluator",
        webSearch: false,
        temperature: route.temperature,
        maxTokens: route.maxOutputTokens,
        context,
      });

      const endIso = new Date().toISOString();
      const parsed = result.data;

      const rawScores = parsed.scores || {};
      const dimensions = [
        "performance",
        "novelty",
        "trendImportance",
        "academicSignificance",
        "practicalValue",
        "reproducibility",
      ] as const;

      const scores: any = {};

      dimensions.forEach((dimKey) => {
        const d = (rawScores as any)[dimKey] || {};
        let scoreVal = typeof d.score === "number" ? d.score : null;
        let status: ScoreStatus = d.status || (scoreVal !== null ? "SCORED" : "INSUFFICIENT_EVIDENCE");
        let reason = d.reason || "?됯? 洹쇨굅 寃利??꾨즺";
        const scope: ScoreScope = d.scope || "QUALITATIVE_ONLY";

        const rawEvidenceList = Array.isArray(d.evidence) ? d.evidence : [];

        const paperTextEv = rawEvidenceList
          .filter((ev: any) => ev.sourceType === "PAPER" || (!ev.sourceType && ev.evidenceType === "PAPER"))
          .map((ev: any) => ({
            evidenceType: "PAPER" as const,
            sourceType: "PAPER" as const,
            sourceTitle: ev.sourceReference || ev.sourceTitle || metadata.canonicalTitle,
            sourceReference: ev.sourceReference || ev.sourceTitle || metadata.canonicalTitle,
            sourceUrl: metadata.canonicalUrl || metadata.url || null,
            sourceLocation: ev.evidenceLocation || ev.sourceLocation || "?먮Ц",
            evidenceLocation: ev.evidenceLocation || ev.sourceLocation || "?먮Ц",
            claim: ev.claimText || ev.claim || "?먮Ц 蹂닿퀬 ?댁슜",
            claimText: ev.claimText || ev.claim || "?먮Ц 蹂닿퀬 ?댁슜",
            verificationLevel: (ev.verificationLevel || "PAPER_REPORTED_VERIFIED") as any,
            verificationStatus: (ev.verificationLevel === "NEEDS_VERIFICATION" || ev.verificationLevel === "INSUFFICIENT_EVIDENCE" ? "NOT_VERIFIED" : "DIRECTLY_VERIFIED") as any,
          }));

        const externalSourceEv = rawEvidenceList
          .filter((ev: any) => ev.sourceType === "EXTERNAL_SOURCE" || (!ev.sourceType && ev.evidenceType === "EXTERNAL"))
          .map((ev: any) => ({
            evidenceType: "EXTERNAL" as const,
            sourceType: "EXTERNAL_SOURCE" as const,
            sourceTitle: ev.sourceReference || ev.sourceTitle || "External academic verification",
            sourceReference: ev.sourceReference || ev.sourceTitle || "External academic verification",
            sourceUrl: ev.sourceUrl || null,
            sourceLocation: ev.evidenceLocation || ev.sourceLocation || "?몃? 異쒖쿂",
            evidenceLocation: ev.evidenceLocation || ev.sourceLocation || "?몃? 異쒖쿂",
            claim: ev.claimText || ev.claim || "?몃? 寃利??꾨즺",
            claimText: ev.claimText || ev.claim || "?몃? 寃利??꾨즺",
            verificationLevel: (ev.verificationLevel || "EXTERNALLY_CORROBORATED") as any,
            verificationStatus: (ev.verificationLevel === "NEEDS_VERIFICATION" || ev.verificationLevel === "INSUFFICIENT_EVIDENCE" ? "NOT_VERIFIED" : "DIRECTLY_VERIFIED") as any,
          }));

        const aiInterpEv = rawEvidenceList
          .filter((ev: any) => ev.sourceType === "AI_INTERPRETATION" || (!ev.sourceType && ev.evidenceType === "AI_INTERPRETATION"))
          .map((ev: any) => ({
            evidenceType: "AI_INTERPRETATION" as const,
            sourceType: "AI_INTERPRETATION" as const,
            sourceTitle: ev.sourceReference || ev.sourceTitle || "AI 醫낇빀 遺꾩꽍",
            sourceReference: ev.sourceReference || ev.sourceTitle || "AI 醫낇빀 遺꾩꽍",
            sourceUrl: null,
            sourceLocation: ev.evidenceLocation || ev.sourceLocation || "醫낇빀 ?댁꽍",
            evidenceLocation: ev.evidenceLocation || ev.sourceLocation || "醫낇빀 ?댁꽍",
            claim: ev.claimText || ev.claim || "醫낇빀 異붾줎",
            claimText: ev.claimText || ev.claim || "醫낇빀 異붾줎",
            verificationLevel: (ev.verificationLevel || "NEEDS_VERIFICATION") as any,
            verificationStatus: "NOT_VERIFIED" as any,
          }));

        if (paperTextEv.length === 0 && externalSourceEv.length === 0 && aiInterpEv.length === 0 && reason) {
          aiInterpEv.push({
            evidenceType: "AI_INTERPRETATION" as const,
            sourceType: "AI_INTERPRETATION" as const,
            sourceTitle: "?됯? 洹쇨굅 ?붿빟",
            sourceReference: "?됯? 洹쇨굅 ?붿빟",
            sourceUrl: null,
            sourceLocation: "醫낇빀 ?됯?",
            evidenceLocation: "醫낇빀 ?됯?",
            claim: reason,
            claimText: reason,
            verificationLevel: (status === "SCORED" ? "EXTERNALLY_CORROBORATED" : "NEEDS_VERIFICATION") as any,
            verificationStatus: (status === "SCORED" ? "DIRECTLY_VERIFIED" : "NOT_VERIFIED") as any,
          });
        }

        if (dimKey === "performance") {
          const hasDirectPerf =
            paperTextEv.length > 0 ||
            externalSourceEv.length > 0 ||
            (docAnalysis.quantitativeResults && docAnalysis.quantitativeResults.length > 0);

          if (!hasDirectPerf && scoreVal !== null && scoreVal > 3) {
            scoreVal = null;
            status = "NEEDS_VERIFICATION";
            reason = "?뺣웾 ?깅뒫 寃곌낵 誘명솗蹂대줈 ?먯닔 蹂대쪟 (異붽? ?뺤씤 ?꾩슂)";
          }
        }

        if (dimKey === "reproducibility") {
          reason = reason.replace(/reproducers confirm[^\\.]*/gi, "official resource verification");

          if (resources.executionVerification !== "PASSED" && scoreVal !== null && scoreVal > 3) {
            scoreVal = resources.codeStatus === "AVAILABLE_VERIFIED" ? 3 : 2;
            status = resources.codeStatus === "AVAILABLE_VERIFIED" ? "SCORED" : "NEEDS_VERIFICATION";
            reason = `${reason} (?낅┰ ?ㅽ뻾 寃利?誘몄떎?쒕줈 理쒕? 3???쒗븳)`;
          }

          if (
            ["NOT_FOUND", "NOT_FOUND_AFTER_RETRIES", "SEARCH_FAILED"].includes(resources.dataStatus) &&
            scoreVal !== null &&
            scoreVal > 3
          ) {
            scoreVal = resources.codeStatus === "AVAILABLE_VERIFIED" ? 3 : 1;
            reason = `${reason} (?곗씠?곗뀑 誘멸났媛쒕줈 理쒓퀬 ?먯닔 遺??遺덇?)`;
          }
        }

        // Enforce null score if status is not SCORED
        if (status !== "SCORED") {
          scoreVal = null;
        }

        scores[dimKey] = {
          score: scoreVal,
          status,
          reason,
          notes: reason,
          scope,
          chartValue: scoreVal,
          evidence: {
            paperText: paperTextEv,
            externalSource: externalSourceEv,
            aiInterpretation: aiInterpEv,
          },
        } as DimensionScore;
      });

      const hasMetadataVerified =
        metadata.crossVerificationStatus === "VERIFIED" ||
        metadata.crossVerificationStatus === "SINGLE_SOURCE" ||
        metadata.identityStatus === "IDENTITY_VERIFIED" ||
        metadata.identityStatus === "RESOLVED_FROM_METHOD_OR_PROJECT";
      const hasPubVerified = metadata.peerReviewed || metadata.isPreprint;
      const hasCodeVerified = resources.codeStatus === "AVAILABLE_VERIFIED";
      const hasDataVerified =
        resources.dataStatus === "AVAILABLE_VERIFIED" || resources.dataStatus === "AVAILABLE_WITH_RESTRICTIONS";
      const hasPerfVerified = scores.performance?.score !== null && scores.performance?.status === "SCORED";
      const hasReprVerified =
        resources.executionVerification === "PASSED" && resources.reproducibilityLevel === "REPRODUCIBLE";

      const verificationBadges = {
        metadataVerified: hasMetadataVerified,
        publicationVerified: hasPubVerified,
        codeVerified: hasCodeVerified,
        dataVerified: hasDataVerified,
        performanceEvidenceVerified: hasPerfVerified,
        reproducibilityVerified: hasReprVerified,
      };

      const verificationScope: VerificationScope = {
        metadata: hasMetadataVerified ? "VERIFIED" : "SINGLE_SOURCE",
        publication: hasPubVerified ? "VERIFIED" : "SINGLE_SOURCE",
        code: hasCodeVerified ? "VERIFIED" : "NOT_FOUND",
        data: hasDataVerified ? "VERIFIED" : "NOT_FOUND",
        performance: hasPerfVerified ? "VERIFIED" : "NOT_CHECKED",
        reproducibility: hasReprVerified ? "VERIFIED" : "NOT_CHECKED",
      };

      let overallBadgeStatus: "BASIC_INFO_VERIFIED" | "PARTIAL_INFO_UNVERIFIED" | "SOURCE_CONFLICT" | "IDENTITY_NOT_FOUND" = "BASIC_INFO_VERIFIED";
      if (!hasMetadataVerified) {
        overallBadgeStatus = "IDENTITY_NOT_FOUND";
      } else if (metadata.crossVerificationStatus === "CONFLICTING") {
        overallBadgeStatus = "SOURCE_CONFLICT";
      } else if (!hasCodeVerified || !hasDataVerified || !hasPerfVerified) {
        overallBadgeStatus = "PARTIAL_INFO_UNVERIFIED";
      }

      await logPipelineCall({
        analysisRunId: context.analysisRunId,
        paperId: metadata.paperId,
        stage: "PAPER_EVALUATOR",
        provider: provider.name,
        model: modelToUse,
        responseId: result.responseId,
        attempt,
        escalated,
        escalationReason,
        startedAtIso: startIso,
        completedAtIso: endIso,
        success: true,
        providerUsage: result.usage,
        groundingEnabled: false,
      });

      const evalResult: PaperEvaluationResult = {
        paperId: metadata.paperId,
        scores,
        uncertainty: {
          factVerificationItems: parsed.uncertainty?.factVerificationItems || [],
          insufficientEvidenceItems: parsed.uncertainty?.insufficientEvidenceItems || [],
          researchOpenQuestions: parsed.uncertainty?.researchOpenQuestions || [],
        },
        verificationBadges,
        verificationScope,
        overallBadgeStatus,
      };

      context.usedCacheKeys.add(cacheKey);

      await persistentCache.set<PaperEvaluationResult>(
        "paper-evaluation",
        cacheKey,
        evalResult,
        {
          provider: provider.name,
          stage: "PAPER_EVALUATOR",
          ttlMs: CACHE_TTL.EVALUATION,
          briefingHash: context.briefingHash,
          paperId: metadata.paperId,
          promptVersion,
          schemaVersion: SCHEMA_VERSION,
          routeVersion: ROUTE_VERSION,
          modelVersion: modelToUse,
        },
        context
      );

      return evalResult;
    } catch (err: any) {
      const endIso = new Date().toISOString();
      console.error(`[Diagnostic Log: PaperEvaluator Error] Failed evaluation for "${metadata.canonicalTitle || metadata.normalizedTitle}":`, {
        code: err?.code,
        message: err?.message,
        model: modelToUse,
        attempt,
        paperId: metadata.paperId,
        validationErrors: err?.errors || err?.issues,
      });
      await logPipelineCall({
        analysisRunId: context.analysisRunId,
        paperId: metadata.paperId,
        stage: "PAPER_EVALUATOR",
        provider: provider.name,
        model: modelToUse,
        attempt,
        escalated,
        escalationReason,
        startedAtIso: startIso,
        completedAtIso: endIso,
        success: false,
        errorCode: err?.code || "STAGE_FAILED",
        errorMessage: err?.message,
        groundingEnabled: false,
      });
      throw err;
    }
  };

  try {
    return await executeCall(currentModel);
  } catch (firstErr) {
    if (route.escalationModel) {
      console.warn(`[paperEvaluator] Escalating to ${route.escalationModel} for "${metadata.normalizedTitle}"`);
      currentModel = route.escalationModel;
      attempt = 2;
      escalated = true;
      escalationReason = `Escalated from ${route.defaultModel} on evaluator failure`;
      return await executeCall(currentModel);
    }

    context.resultOrigin = "PARTIAL_PIPELINE";

    const insufficientDimension = (reason: string): DimensionScore => ({
      score: null,
      status: "INSUFFICIENT_EVIDENCE",
      reason,
      notes: reason,
      scope: "QUALITATIVE_ONLY",
      chartValue: null,
      evidence: { paperText: [], externalSource: [], aiInterpretation: [] },
    });

    return {
      paperId: metadata.paperId,
      scores: {
        performance: insufficientDimension("?됯? ?붿쭊 ?묐떟 ?ㅻ쪟濡??먯닔 蹂대쪟"),
        novelty: insufficientDimension("?됯? ?붿쭊 ?묐떟 ?ㅻ쪟濡??먯닔 蹂대쪟"),
        trendImportance: insufficientDimension("?됯? ?붿쭊 ?묐떟 ?ㅻ쪟濡??먯닔 蹂대쪟"),
        academicSignificance: insufficientDimension("?됯? ?붿쭊 ?묐떟 ?ㅻ쪟濡??먯닔 蹂대쪟"),
        practicalValue: insufficientDimension("?됯? ?붿쭊 ?묐떟 ?ㅻ쪟濡??먯닔 蹂대쪟"),
        reproducibility: insufficientDimension("?됯? ?붿쭊 ?묐떟 ?ㅻ쪟濡??먯닔 蹂대쪟"),
      },
      uncertainty: {
        factVerificationItems: ["?먮Ц ?섏튂 ?ш?利??꾩슂"],
        insufficientEvidenceItems: ["?됯? ?④퀎 ?ㅻ쪟濡?洹쇨굅 蹂대쪟"],
        researchOpenQuestions: ["?꾩냽 ?곌뎄 ?뺤옣 媛?μ꽦 ?먯깋"],
      },
      verificationBadges: {
        metadataVerified: true,
        publicationVerified: true,
        codeVerified: false,
        dataVerified: false,
        performanceEvidenceVerified: false,
        reproducibilityVerified: false,
      },
      verificationScope: {
        metadata: "VERIFIED",
        publication: "VERIFIED",
        code: "NOT_FOUND",
        data: "NOT_FOUND",
        performance: "NOT_CHECKED",
        reproducibility: "NOT_CHECKED",
      },
      overallBadgeStatus: "PARTIAL_INFO_UNVERIFIED",
    };
  }
}





