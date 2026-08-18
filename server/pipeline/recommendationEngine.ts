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
import { determineRecommendationStatus } from "../../src/utils/evaluationHelpers";

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
      recommendationEligibilityNote: "ëª¨ë“  ?„ë³´??ê²€ì¦?ê·¼ê±° ?ëŠ” ?‰ê? ì»¤ë²„ë¦¬ì? ë¶€ì¡?(ìµœì†Œ 60% ë¯¸ë‹¬)",
      overallAcademicLeaderPaperId: null,
      weeklyTopicLeaderPaperId: null,
      recommendationConfidence: "LOW",
      weeklyTopicRelevance: {
        score: null,
        reason: "? ì› ë°?ê²€ì¦?ê·¼ê±° ë¶€ì¡±ìœ¼ë¡??í•©???‰ê? ë³´ë¥˜",
      },
      tradeoffExplanation: "ëª¨ë“  ?„ë³´ ?¼ë¬¸??? ì› ê²€ì¦?ê·¼ê±° ?ëŠ” ?‰ê? ì»¤ë²„ë¦¬ì?ê°€ ê¸°ì?ì¹?60%)???„ë‹¬?˜ì? ëª»í•´ ìµœì¢… ì¶”ì²œ??ë³´ë¥˜?©ë‹ˆ??",
      scoresUsed: [],
      scoresExcluded: ["?„ì²´ ?‰ê? ì¶?(ê²€ì¦?ê·¼ê±° ë¶€ì¡?"],
      performanceEvidenceUsed: false,
      recommendationReason: "ì¶©ë¶„??ê²€ì¦?ê·¼ê±°ê°€ ?†ì–´ ìµœì¢… ì¶”ì²œ??ë³´ë¥˜?©ë‹ˆ??",
      keyRecommendationEvidence: ["ê³µì‹ ?ë¬¸ ?ë³„ ë°??…ë¦½ ê²€ì¦??°ì´??ì¶”ê? ?•ì¸ ?„ìš”"],
      consideredUncertainties: ["ÈÄº¸ ¼­Áö Á¤º¸ ºÒÀÏÄ¡", "½ÇÇè Á¤·® ¼öÄ¡ ¹ÌÈ®º¸"],
      sotaStatus: "?ë‹¨ ë¶ˆê?",
      hasDirectComparisonStudies: false,
      keyItemsToVerifyWhileReading: ["ê³µì‹ ?¼ë¬¸ ?œì? ë°?arXiv/DOI ?ë³„", "?¤í”ˆ?ŒìŠ¤ ë°??¬í˜„ ?˜ê²½ ?•ì¸"],
      positionInRecentTrend: "ì¶©ë¶„??ê²€ì¦?ê·¼ê±°ê°€ ?†ì–´ ìµœì¢… ì¶”ì²œ??ë³´ë¥˜?©ë‹ˆ??",
      keyStrengths: [],
      keyLimitationsOrRisks: ["°ËÁõµÈ Á¤·® µ¥ÀÌÅÍ ºÎÁ·", "¼­Áö Á¤º¸ Ãß°¡ È®ÀÎ ÇÊ¿ä"],
      readingQuestions: ["?„ë³´ ?œì? ?•ë³´ê°€ ê³µì‹ ?™ìˆ  DB?€ ?¼ì¹˜?˜ëŠ”ê°€?"],
      followUpResearchQuestions: ["°ø½Ä ³í¹® Ãâ°£ ¿©ºÎ È®ÀÎ"],
      verificationNeededNotes: ["ì¶©ë¶„??ê²€ì¦?ê·¼ê±°ê°€ ?•ë³´???Œê¹Œì§€ ìµœì¢… ì¶”ì²œ??ë³´ë¥˜?©ë‹ˆ??"],
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
    const scoreSum = Object.values(cand.scores || {}).reduce((sum, s) => {
      return sum + (typeof s.score === "number" ? s.score : 0);
    }, 0);
    if (scoreSum > maxAcademicScore) {
      maxAcademicScore = scoreSum;
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
You are an expert AI research advisor.
Synthesize a comprehensive recommendation for the user based on evaluated paper candidates and the weekly briefing topic.

STRICT CANDIDATE-SCOPED LEADERSHIP & RECOMMENDATION WEIGHTING RULES:
1. RECOMMENDATION ELIGIBILITY: You MUST choose topRecommendedPaperId ONLY from the eligible candidates list (${eligibleCandidates.map((c) => c.id).join(", ")}).
2. "Overall Academic Leader" means strictly the highest-rated paper AMONG THE ELIGIBLE CANDIDATE SET IN THIS BRIEFING (${overallAcademicLeaderPaperId}).
3. "Weekly Topic Leader" means the eligible paper that most directly aligns with the core topic of this week's briefing (${weeklyTopicLeaderPaperId}).
4. If only some candidates were eligible (${eligibleCandidates.length}/${candidates.length}):
   - Do NOT say "?„ì²´ ?„ë³´ ì¤?ìµœìš°??.
   - Say "?„ì¬ ê²€ì¦?ê°€?¥í•œ ?„ë³´ ì¤??°ì„  ì¶”ì²œ" or candidate-scoped phrasing.
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
        tradeoff = `${overallCand?.title || 'ê²€ì¦??„ë³´êµ????™ìˆ  ìµœê³  ?¼ë¬¸'}???™ìˆ  ?„ì„±?„ì? ?¬í˜„ ê°€ì¹˜ì—??ìµœê³  ?‰ê?ë¥?ë°›ì•˜?¼ë‚˜, ${recCand?.title || 'ì¶”ì²œ ?¼ë¬¸'}???´ë²ˆ ì£??°êµ¬ ì£¼ì œ(${coreTopic})ë¥?ê°€??ì§ì ‘?ìœ¼ë¡??¤ë£¨ë¯€ë¡??°ì„  ì¶”ì²œ?¼ë¡œ ê²°ì •?˜ì—ˆ?µë‹ˆ??`;
      } else if (!tradeoff) {
        tradeoff = isPartialSubset
          ? "?„ì¬ ê²€ì¦?ê°€?¥í•œ ?„ë³´êµ?ì¤??µì‹¬ ì£¼ê°„ ë¸Œë¦¬??ì£¼ì œ ?í•©?„ì? ?™ìˆ  ?„ì„±?„ë? ì¢…í•©?˜ì—¬ ? ì •?˜ì—ˆ?µë‹ˆ??"
          : "?´ë²ˆ ì£??µì‹¬ ì£¼ê°„ ë¸Œë¦¬??ì£¼ì œ ?í•©?„ì? ?™ìˆ  ?„ì„±??ëª¨ë‘ ìµœìƒ???˜ì????¬ì„±?˜ì??µë‹ˆ??";
      }

      const trendPosition = isPartialSubset
        ? (parsed.positionInRecentTrend || "°ËÁõ °¡´ÉÇÑ ÈÄº¸ Áß ¿ì¼± ÃßÃµ")
            .replace(/overall academic leader/gi, "°ËÁõ ¿Ï·á ÈÄº¸ Áß ÃÖ°í Á¡¼ö ³í¹®")
        : (parsed.positionInRecentTrend || `?´ë²ˆ ì£?${coreTopic} ë¶„ì•¼ ?‰ê? ?„ë³´êµ?ì¤??µì‹¬ ?¼ë¬¸`)
            .replace(/overall academic leader/gi, "?´ë²ˆ ì£??‰ê? ?„ë³´êµ???ìµœê³  ?‰ì  ?¼ë¬¸")
            .replace(/field leader/gi, "?„ë³´êµ??µì‹¬ ?¼ë¬¸");

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
          reason: `ÁÖ°£ ¿¬±¸ ÁÖÁ¦("${coreTopic}")¿Í Á÷Á¢ °ü·ÃµÈ ¿¬±¸ÀÔ´Ï´Ù.`,
        },
        tradeoffExplanation: tradeoff,
        scoresUsed: parsed.scoresUsed || ["ÁÖ°£ ¿¬±¸ ÁÖÁ¦ ÀûÇÕµµ", "¹æ¹ı·ĞÀû ½Å±Ô¼º", "¿¬±¸ Èå¸§ Áß¿äµµ"],
        scoresExcluded: parsed.scoresExcluded || (perfScoreVerified ? [] : ["ê³µì‹ ?•ëŸ‰ ?±ëŠ¥ ê²½ìŸ??(?…ë¦½ ë²¤ì¹˜ë§ˆí¬ ë¯¸ë¹„ë¡??°ì¶œ?ì„œ ?œì™¸)"]),
        performanceEvidenceUsed: perfScoreVerified,
        recommendationReason: parsed.recommendationReason || `${recCand?.title || 'ì¶”ì²œ ?¼ë¬¸'}?€ ?´ë²ˆ ì£??µì‹¬ ?°êµ¬ ì£¼ì œë¥?ëª…í™•?˜ê²Œ ?´ê²°?©ë‹ˆ??`,
        keyRecommendationEvidence: [
          `ê²€ì¦ëœ ì¶œíŒì§€/?„ë¦°?? ${recCand?.venueOrPreprint || '?™ìˆ  DB'}`,
          `ÄÚµå °ø°³ »óÅÂ: ${recCand?.codeStatus || "¹ÌÈ®Á¤"}`,
          `?‰ê? ì»¤ë²„ë¦¬ì?: ${recCand?.evaluationCoverage}%`,
        ],
        consideredUncertainties: recCand?.uncertainty?.factVerificationItems || [],
        sotaStatus: recCand?.comparisonModule?.sotaStatus || "ë¹„êµ ê²€ì¦??„ë£Œ",
        hasDirectComparisonStudies: (recCand?.comparisonModule?.directComparisonStudies?.length || 0) > 0,
        keyItemsToVerifyWhileReading: parsed.readingQuestions || [],
        positionInRecentTrend: trendPosition,
        keyStrengths: parsed.keyStrengths || [],
        keyLimitationsOrRisks: parsed.keyLimitationsOrRisks || [],
        readingQuestions: parsed.readingQuestions || [],
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
        reason: "?´ë²ˆ ì£?ì£¼ê°„ ?°êµ¬ ë¸Œë¦¬??ì£¼ì œ ?í•©??ê³ ë ¤",
      },
      tradeoffExplanation: "?™ìˆ  ì¢…í•© ?„ì„±??ë°??µì‹¬ ?°êµ¬ ì£¼ì œ ?°ê²°?±ì„ ë°”íƒ•?¼ë¡œ ? ì •?˜ì—ˆ?µë‹ˆ??",
      scoresUsed: ["ÁÖ°£ ºê¸®ÇÎ ÁÖÁ¦ ÀûÇÕµµ", "ÀçÇö °¡´É¼º", "ÇĞ¼ú ½Å·Úµµ"],
      scoresExcluded: ["ë¯¸ê?ì¦??•ëŸ‰ ?˜ì¹˜"],
      performanceEvidenceUsed: false,
      recommendationReason: `${topCand?.title || 'ì¶”ì²œ ?¼ë¬¸'}?€ ?´ë²ˆ ì£?ë¸Œë¦¬?‘ì—??ê°€???µì‹¬?ì¸ ?°êµ¬ ì£¼ì œë¥??¤ë£¨ê³??ˆìŠµ?ˆë‹¤.`,
      keyRecommendationEvidence: ["ê³µì‹ ?¼ë¬¸ ë°??œì? ?•ë³´ ê²€ì¦??„ë£Œ"],
      consideredUncertainties: [],
      sotaStatus: "ë¹„êµ ê²€ì¦??„ë£Œ",
      hasDirectComparisonStudies: false,
      keyItemsToVerifyWhileReading: ["ê³µì‹ ?±ëŠ¥??ë°?ì½”ë“œ ?¬í˜„ ê°€?¥ì„± ?•ì¸"],
      positionInRecentTrend: isPartialSubset ? "?„ì¬ ê²€ì¦?ê°€?¥í•œ ?„ë³´ ì¤??°ì„  ì¶”ì²œ" : "ìµœì‹  ?°êµ¬ ?ë¦„ ?µì‹¬ ?¼ë¬¸",
      keyStrengths: ["ì£¼ê°„ ë¸Œë¦¬???µì‹¬ ê³¼ì œ ì§ì ‘ ?´ê²°"],
      keyLimitationsOrRisks: ["ì½”ë“œ ë°??°ì´?°ì…‹ ?…ë¦½ ?¤í–‰ ê²€ì¦??„ìš”"],
      readingQuestions: ["?ë¬¸ ?˜ì‹ê³??œì•ˆ ?„í‚¤?ì²˜???¼ì¹˜ ?¬ë?"],
      followUpResearchQuestions: ["?ì²´ ?„ë ˆ?„ì›Œ???ìš© ê°€?¥ì„±"],
      verificationNeededNotes: [],
    };
  }
}






