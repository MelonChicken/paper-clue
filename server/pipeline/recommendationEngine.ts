import { z } from "zod";
import crypto from "crypto";
import { PaperCandidate, AiRecommendation } from "../../src/types";
import { getRouteConfig } from "../config/routingConfig";
import { logPipelineCall } from "../observability/pipelineLogger";
import { PipelineContext } from "./context";
import { PROMPT_VERSIONS, SCHEMA_VERSION, ROUTE_VERSION } from "../config/versions";
import {
  persistentCache,
  generateRecommendationCacheKey,
  CACHE_TTL,
} from "./cacheManager";
import { AIProvider } from "./providerInterface";
import { determineRecommendationStatus, getPaperEvaluationStatus } from "../../src/utils/evaluationHelpers";
import { ensureThreeReadingQuestions, sanitizeUserText } from "../../src/utils/paperSemantics";

export const recommendationEngineSchema = z.object({
  topRecommendedPaperId: z.string().nullable(),
  recommendationReason: z.string(),
  positionInRecentTrend: z.string(),
  tradeoffExplanation: z.string(),
  scoresUsed: z.array(z.string()),
  scoresExcluded: z.array(z.string()),
  performanceEvidenceUsed: z.boolean(),
  keyStrengths: z.array(z.string()),
  keyLimitationsOrRisks: z.array(z.string()),
  readingQuestions: z.array(z.string()),
  followUpResearchQuestions: z.array(z.string()),
  verificationNeededNotes: z.array(z.string()),
});

export async function generateRecommendation(
  provider: AIProvider,
  candidates: PaperCandidate[],
  coreTopic: string,
  context: PipelineContext
): Promise<AiRecommendation> {
  const route = getRouteConfig("RECOMMENDATION_ENGINE");
  let currentModel = route.defaultModel;
  let attempt = 1;
  let escalated = false;
  let escalationReason: string | undefined = undefined;

  const promptVersion = PROMPT_VERSIONS.RECOMMENDATION_ENGINE;

  const evaluatedPaperIds = candidates.map((c) => c.id);
  const evalResultHash = crypto
    .createHash("md5")
    .update(JSON.stringify(candidates.map((c) => ({ id: c.id, scores: c.scores, identityStatus: c.identityStatus, coverage: c.evaluationCoverage }))))
    .digest("hex");

  const cacheKey = generateRecommendationCacheKey(
    provider.name,
    context.briefingHash,
    evaluatedPaperIds,
    evalResultHash,
    promptVersion,
    SCHEMA_VERSION,
    context.analysisMode,
    currentModel
  );

  const cached = await persistentCache.get<AiRecommendation>(
    "recommendation",
    cacheKey,
    context,
    {
      provider: provider.name,
      stage: "RECOMMENDATION_ENGINE",
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
      stage: "RECOMMENDATION_ENGINE",
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

  // Recommendation eligibility is only final after evaluation has produced coverage.
  const eligibleCandidates = candidates.filter((c) => {
    const recommendationStatus = c.recommendationStatus || determineRecommendationStatus(c);
    return recommendationStatus === "ELIGIBLE";
  });

  // If NO candidate meets eligibility, withhold recommendation immediately
  if (eligibleCandidates.length === 0) {
    const withheldRecommendation: AiRecommendation = {
      topRecommendedPaperId: null,
      recommendationStatus: "HELD_DUE_TO_INSUFFICIENT_EVIDENCE",
      isHeldDueToInsufficientEvidence: true,
      recommendationEligibilityNote: "모든 후보의 검증 근거 또는 평가 커버리지가 부족합니다(최소 60% 미달).",
      overallAcademicLeaderPaperId: null,
      weeklyTopicLeaderPaperId: null,
      recommendationConfidence: "LOW",
      weeklyTopicRelevance: {
        score: null,
        reason: "신원 및 검증 근거 부족으로 종합 평가를 보류했습니다.",
      },
      tradeoffExplanation: "모든 후보 논문의 신원 검증 근거 또는 평가 커버리지가 기준치에 미달해 최종 추천을 보류합니다.",
      scoresUsed: [],
      scoresExcluded: ["전체 평가 축(검증 근거 부족)"],
      performanceEvidenceUsed: false,
      recommendationReason: "충분한 검증 근거가 없어 최종 추천을 보류합니다.",
      keyRecommendationEvidence: ["공식 논문 서지 및 원문 검증 데이터 추가 확인 필요"],
      consideredUncertainties: ["후보 서지 정보 불일치", "실험 정량 수치 미확보"],
      sotaStatus: "판단 불가",
      hasDirectComparisonStudies: false,
      keyItemsToVerifyWhileReading: ["공식 논문 서지 및 arXiv/DOI 식별자 확인", "실험 설정과 재현 환경 확인"],
      positionInRecentTrend: "충분한 검증 근거가 없어 최종 추천을 보류합니다.",
      keyStrengths: [],
      keyLimitationsOrRisks: ["검증된 정량 데이터 부족", "서지 정보 추가 확인 필요"],
      readingQuestions: ["후보 서지 정보가 공식 학술 DB와 일치하는가?", "Results/Table에서 정량 결과와 baseline이 확인되는가?", "코드와 데이터 준비 절차가 재현 가능한 수준으로 공개되어 있는가?"],
      followUpResearchQuestions: ["전체 프레임워크의 확장 가능성 확인"],
      verificationNeededNotes: ["충분한 검증 근거가 확보될 때까지 최종 추천을 보류합니다."],
    };

    context.usedCacheKeys.add(cacheKey);
    await persistentCache.set<AiRecommendation>(
      "recommendation",
      cacheKey,
      withheldRecommendation,
      {
        provider: provider.name,
        stage: "RECOMMENDATION_ENGINE",
        ttlMs: CACHE_TTL.RECOMMENDATION,
        briefingHash: context.briefingHash,
        promptVersion,
        schemaVersion: SCHEMA_VERSION,
        routeVersion: ROUTE_VERSION,
        modelVersion: currentModel,
      },
      context
    );

    return withheldRecommendation;
  }

  const isPartialSubset = eligibleCandidates.length < candidates.length;

  // Step 1: Calculate Overall Academic Leader deterministically among eligible candidates
  let overallAcademicLeaderPaperId: string | null = null;
  let maxAcademicScore = -1;

  eligibleCandidates.forEach((cand) => {
    const evalStatus = getPaperEvaluationStatus(cand);
    const score = evalStatus.overallScore ?? -1;
    if (score > maxAcademicScore) {
      maxAcademicScore = score;
      overallAcademicLeaderPaperId = cand.id;
    }
  });

  // Step 2: Determine Weekly Topic Leader deterministically among eligible candidates
  const topicLower = coreTopic.toLowerCase();
  const topicMatch = eligibleCandidates.find((c) => {
    const t = c.title.toLowerCase();
    return t.includes(topicLower) || t.includes("video") || t.includes("agent") || t.includes("pose") || t.includes("llm");
  });
  const weeklyTopicLeaderPaperId = topicMatch ? topicMatch.id : eligibleCandidates[0]?.id || overallAcademicLeaderPaperId;

  const systemInstruction = `
You are an expert AI research advisor. 모든 사용자 설명, 판단, 근거 요약은 한국어로 작성한다. 논문 제목, 저자명, venue, 모델명, dataset, benchmark, 공식 기술명과 metric만 원문 표기를 유지한다.
Synthesize a comprehensive recommendation for the user based on evaluated paper candidates and the weekly briefing topic.

STRICT CANDIDATE-SCOPED LEADERSHIP & RECOMMENDATION WEIGHTING RULES:
1. RECOMMENDATION ELIGIBILITY: You MUST choose topRecommendedPaperId ONLY from the eligible candidates list (${eligibleCandidates.map((c) => c.id).join(", ")}).
2. "Overall Academic Leader" means strictly the highest-rated paper AMONG THE ELIGIBLE CANDIDATE SET IN THIS BRIEFING (${overallAcademicLeaderPaperId}).
3. "Weekly Topic Leader" means the eligible paper that most directly aligns with the core topic of this week's briefing (${weeklyTopicLeaderPaperId}).
4. If only some candidates were eligible (${eligibleCandidates.length}/${candidates.length}):
   - Do NOT say "?꾩껜 ?꾨낫 以?理쒖슦??.
   - Say "현재 검증 가능한 후보 중 우선 추천" or candidate-scoped phrasing.
5. If topRecommendedPaperId differs from overallAcademicLeaderPaperId (${overallAcademicLeaderPaperId}), explicitly explain the trade-off in tradeoffExplanation.
6. Provide a clear, objective rationale for the recommendation without promotional hype.
`.trim();

  const userPrompt = `
Core Topic: "${coreTopic}"
Eligible Candidates: ${eligibleCandidates.map((c) => `[${c.id}] ${c.title} (Coverage: ${c.evaluationCoverage}%)`).join("; ")}
Overall Academic Leader: ${overallAcademicLeaderPaperId}
Weekly Topic Leader: ${weeklyTopicLeaderPaperId}
Is Partial Subset Evaluated: ${isPartialSubset}

Candidates Summary:
${eligibleCandidates
  .map(
    (c) =>
      `- ID: ${c.id}, Title: "${c.title}", Entity: ${c.entityType}, Identity: ${c.identityStatus}, Coverage: ${c.evaluationCoverage}%, CodeStatus: ${c.codeStatus}, DataStatus: ${c.dataStatus}`
  )
  .join("\n")}
`.trim();

  const executeCall = async (modelToUse: string): Promise<AiRecommendation> => {
    const startIso = new Date().toISOString();
    try {
      const result = await provider.generateStructured<z.infer<typeof recommendationEngineSchema>>({
        stage: "RECOMMENDATION_ENGINE",
        model: modelToUse,
        systemInstruction,
        userPrompt,
        schema: recommendationEngineSchema,
        schemaName: "recommendationEngine",
        webSearch: false,
        temperature: route.temperature,
        maxTokens: route.maxOutputTokens,
        context,
      });

      const endIso = new Date().toISOString();
      const parsed = result.data;

      let recId = parsed.topRecommendedPaperId || weeklyTopicLeaderPaperId || overallAcademicLeaderPaperId || eligibleCandidates[0]?.id;
      if (!eligibleCandidates.some((c) => c.id === recId)) {
        recId = weeklyTopicLeaderPaperId || overallAcademicLeaderPaperId || eligibleCandidates[0]?.id;
      }

      const recCand = eligibleCandidates.find((c) => c.id === recId);
      const overallCand = eligibleCandidates.find((c) => c.id === overallAcademicLeaderPaperId);

      const perfScoreVerified = recCand?.scores?.performance?.score !== null;

      let tradeoff = parsed.tradeoffExplanation || "";
      if (overallAcademicLeaderPaperId && overallAcademicLeaderPaperId !== recId) {
        tradeoff = `${overallCand?.title || "종합점수 1위 논문"}가 5개 평가축 평균은 가장 높지만, ${recCand?.title || "추천 논문"}가 이번 브리핑의 핵심 주제인 ${coreTopic}와 더 직접적으로 맞닿아 있어 이번 주 우선 읽기 논문으로 추천했습니다.`;
      } else if (!tradeoff) {
        tradeoff = isPartialSubset
          ? "현재 검증 가능한 후보 중 주간 브리핑 주제 적합도와 학술 신뢰도를 종합해 선정했습니다."
          : "이번 주 브리핑 주제 적합도와 학술 신뢰도가 모두 높아 우선 추천했습니다.";
      }

      const readingQuestions = ensureThreeReadingQuestions(recCand as any, parsed.readingQuestions);

      const trendPosition = isPartialSubset
        ? (parsed.positionInRecentTrend || "검증 가능한 후보 중 우선 추천")
            .replace(/overall academic leader/gi, "검증 완료 후보 중 최고 점수 논문")
        : (parsed.positionInRecentTrend || `이번 주 ${coreTopic} 분야 평가 후보군 중 핵심 논문`)
            .replace(/overall academic leader/gi, "?대쾲 二??됯? ?꾨낫援???理쒓퀬 ?됱젏 ?쇰Ц")
            .replace(/field leader/gi, "후보군 핵심 논문");

      await logPipelineCall({
        analysisRunId: context.analysisRunId,
        stage: "RECOMMENDATION_ENGINE",
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

      const recommendation: AiRecommendation = {
        topRecommendedPaperId: recId,
        recommendationStatus: isPartialSubset ? "PRIORITIZED_AMONG_VERIFIED" : "RECOMMENDED",
        isPrioritizedAmongVerified: isPartialSubset,
        overallAcademicLeaderPaperId: overallAcademicLeaderPaperId || recId,
        weeklyTopicLeaderPaperId: weeklyTopicLeaderPaperId || recId,
        recommendationConfidence: (perfScoreVerified ? "HIGH" : "MEDIUM") as "HIGH" | "MEDIUM" | "LOW",
        weeklyTopicRelevance: {
          score: 5,
          reason: `주간 연구 주제("${coreTopic}")와 직접 관련된 연구입니다.`,
        },
        tradeoffExplanation: sanitizeUserText(tradeoff, "종합점수와 주제 적합도 사이의 차이를 고려해 추천했습니다."),
        scoresUsed: parsed.scoresUsed || ["주간 연구 주제 적합도", "방법론적 신규성", "연구 흐름 중요도"],
        scoresExcluded: parsed.scoresExcluded || (perfScoreVerified ? [] : ["정량 성능 경쟁력(비교 가능한 benchmark 근거 부족으로 제외)"]),
        performanceEvidenceUsed: perfScoreVerified,
        recommendationReason: sanitizeUserText(parsed.recommendationReason, `${recCand?.title || "추천 논문"}은 이번 주 브리핑 주제와 직접 연결되는 연구입니다.`),
        keyRecommendationEvidence: [
          `${recCand?.venueOrPreprint || "학술 DB"} 출처 확인`,
          `코드 공개 상태: ${recCand?.codeStatus || "미확정"}`,
          `평가 커버리지: ${recCand?.evaluationCoverage}%`,
        ],
        consideredUncertainties: recCand?.uncertainty?.factVerificationItems || [],
        sotaStatus: recCand?.comparisonModule?.sotaStatus || "비교 검증 필요",
        hasDirectComparisonStudies: (recCand?.comparisonModule?.directComparisonStudies?.length || 0) > 0,
        keyItemsToVerifyWhileReading: readingQuestions,
        positionInRecentTrend: trendPosition,
        keyStrengths: parsed.keyStrengths || [],
        keyLimitationsOrRisks: parsed.keyLimitationsOrRisks || [],
        readingQuestions,
        followUpResearchQuestions: parsed.followUpResearchQuestions || [],
        verificationNeededNotes: parsed.verificationNeededNotes || [],
      };

      context.usedCacheKeys.add(cacheKey);

      await persistentCache.set<AiRecommendation>(
        "recommendation",
        cacheKey,
        recommendation,
        {
          provider: provider.name,
          stage: "RECOMMENDATION_ENGINE",
          ttlMs: CACHE_TTL.RECOMMENDATION,
          briefingHash: context.briefingHash,
          promptVersion,
          schemaVersion: SCHEMA_VERSION,
          routeVersion: ROUTE_VERSION,
          modelVersion: modelToUse,
        },
        context
      );

      return recommendation;
    } catch (err: any) {
      const endIso = new Date().toISOString();
      await logPipelineCall({
        analysisRunId: context.analysisRunId,
        stage: "RECOMMENDATION_ENGINE",
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
      console.warn(`[recommendationEngine] Escalating to ${route.escalationModel}`);
      currentModel = route.escalationModel;
      attempt = 2;
      escalated = true;
      escalationReason = `Escalated from ${route.defaultModel}`;
      return await executeCall(currentModel);
    }

    context.resultOrigin = "PARTIAL_PIPELINE";

    const topId = weeklyTopicLeaderPaperId || overallAcademicLeaderPaperId || eligibleCandidates[0]?.id || null;
    const topCand = eligibleCandidates.find((c) => c.id === topId);

    return {
      topRecommendedPaperId: topId,
      recommendationStatus: isPartialSubset ? "PRIORITIZED_AMONG_VERIFIED" : "RECOMMENDED",
      isPrioritizedAmongVerified: isPartialSubset,
      overallAcademicLeaderPaperId: overallAcademicLeaderPaperId || topId,
      weeklyTopicLeaderPaperId: weeklyTopicLeaderPaperId || topId,
      recommendationConfidence: "MEDIUM" as "HIGH" | "MEDIUM" | "LOW",
      weeklyTopicRelevance: {
        score: 5,
        reason: "이번 주 연구 브리핑 주제 적합도를 고려했습니다.",
      },
      tradeoffExplanation: "학술 신뢰도와 주간 연구 주제 연결성을 바탕으로 선정했습니다.",
      scoresUsed: ["주간 브리핑 주제 적합도", "재현 가능성", "학술 신뢰도"],
      scoresExcluded: ["미검증 정량 수치"],
      performanceEvidenceUsed: false,
      recommendationReason: `${topCand?.title || "추천 논문"}은 이번 주 브리핑에서 가장 직접적으로 연결되는 연구 주제를 다룹니다.`, 
      keyRecommendationEvidence: ["공식 논문 및 서지 정보 확인"],
      consideredUncertainties: [],
      sotaStatus: "비교 검증 필요",
      hasDirectComparisonStudies: false,
      keyItemsToVerifyWhileReading: ["공식 성능표와 코드 재현 가능성 확인"],
      positionInRecentTrend: isPartialSubset ? "현재 검증 가능한 후보 중 우선 추천" : "최신 연구 흐름의 핵심 논문",
      keyStrengths: ["주간 브리핑 핵심 과제와 직접 연결"],
      keyLimitationsOrRisks: ["코드와 데이터의 실제 실행 검증 필요"],
      readingQuestions: ["논문 형식과 제안 방법 구조가 실제 원문과 일치하는가?", "Results/Table에서 비교 가능한 benchmark 근거가 확인되는가?", "재현에 필요한 코드, 데이터, 설정이 충분한가?"],
      followUpResearchQuestions: ["전체 프레임워크의 확장 가능성 확인"],
      verificationNeededNotes: [],
    };
  }
}









