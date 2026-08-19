import { PaperCandidate, DimensionScore, EntityType, IdentityStatus, VerificationLevel, RecommendationStatus } from "../types.js";
import { CORE_SCORE_KEYS, buildCanonicalPaperEvaluation, calculateCoreEvaluation, getCoreScore, labelStatus, rankCanonicalPapers } from "./paperSemantics.js";

export type EvaluationStatusType = "COMPLETE" | "PARTIAL" | "HOLD";

export interface PaperEvaluationStatus {
  status: EvaluationStatusType;
  label: "평가 완료" | "부분 평가" | "평가 보류";
  badgeClass: string;
  overallScore: number | null;
  scoreDisplay: string;
  scoreDescription: string;
  validScoresCount: number;
  totalDimensions: number;
  evaluationCoverage: number; // percentage (0 - 100)
  coverageDisplay: string;    // e.g. "5/6 (83%)"
  isRecommendationEligible: boolean;
  ineligibilityReason?: string;
}

export function computePaperEvaluationCoverage(paperOrScores: PaperCandidate | any): {
  scoredDimensions: number;
  totalDimensions: number;
  evaluationCoverage: number;
  coverageDisplay: string;
} {
  const result = calculateCoreEvaluation(paperOrScores);
  return {
    scoredDimensions: result.validScoresCount,
    totalDimensions: result.totalDimensions,
    evaluationCoverage: result.evaluationCoverage,
    coverageDisplay: result.coverageDisplay,
  };
}

export function determineRecommendationStatus(paper: Pick<PaperCandidate, "entityType" | "identityStatus" | "crossVerificationStatus" | "isRankingEligible" | "evaluationCoverage" | "scores">): RecommendationStatus {
  let coverage = paper.evaluationCoverage;
  if (coverage === null) {
    return "PENDING_EVALUATION";
  }
  if (coverage === undefined) {
    if (!paper.scores) return "PENDING_EVALUATION";
    coverage = computePaperEvaluationCoverage(paper.scores).evaluationCoverage;
  }

  const identity: IdentityStatus = paper.identityStatus || (paper.crossVerificationStatus === "NOT_FOUND" ? "IDENTITY_NOT_FOUND" : "POSSIBLE_MATCH");
  const entityType = paper.entityType || "UNKNOWN";

  if (entityType !== "PAPER" || paper.isRankingEligible === false) {
    return "NOT_ELIGIBLE";
  }

  if (
    identity !== "IDENTITY_VERIFIED" ||
    paper.crossVerificationStatus === "NOT_FOUND" ||
    paper.crossVerificationStatus === "CONFLICTING"
  ) {
    return "NOT_ELIGIBLE";
  }

  return coverage >= 60 ? "ELIGIBLE" : "NOT_ELIGIBLE";
}

export function checkCandidateRecommendationEligibility(paper: PaperCandidate): {
  isEligible: boolean;
  recommendationStatus: RecommendationStatus;
  reason?: string;
} {
  const recommendationStatus = determineRecommendationStatus(paper);
  if (recommendationStatus === "ELIGIBLE") {
    return { isEligible: true, recommendationStatus };
  }

  if (recommendationStatus === "PENDING_EVALUATION") {
    return {
      isEligible: false,
      recommendationStatus,
      reason: "평가가 아직 수행되지 않아 추천 가능 여부를 계산하지 않습니다.",
    };
  }

  const identity = paper.identityStatus || (paper.crossVerificationStatus === "NOT_FOUND" ? "IDENTITY_NOT_FOUND" : "POSSIBLE_MATCH");
  const entityType = paper.entityType || "UNKNOWN";
  if (entityType !== "PAPER" || paper.isRankingEligible === false) {
    return { isEligible: false, recommendationStatus, reason: "논문 ranking 대상이 아닌 supporting resource입니다." };
  }

  if (identity === "METADATA_CONFLICT" || paper.crossVerificationStatus === "CONFLICTING") {
    return { isEligible: false, recommendationStatus, reason: "identifier와 canonical metadata가 충돌하여 추천 대상에서 제외됩니다." };
  }

  if (identity !== "IDENTITY_VERIFIED") {
    return { isEligible: false, recommendationStatus, reason: "논문 신원 검증 완료 후에만 추천 대상이 됩니다." };
  }

  return {
    isEligible: false,
    recommendationStatus,
    reason: `주요 평가 축 검증 근거 부족(평가 커버리지 ${paper.evaluationCoverage}%, 최소 60% 필요)`,
  };
}

export function isCandidateEligibleForRecommendation(paper: PaperCandidate): boolean {
  return checkCandidateRecommendationEligibility(paper).isEligible;
}

export function getPaperEvaluationStatus(paper: PaperCandidate): PaperEvaluationStatus {
  const canonical = buildCanonicalPaperEvaluation(paper);
  const core = canonical.evaluation;
  const totalDimensions = core.totalAxisCount;
  const eligibility = checkCandidateRecommendationEligibility(paper);

  if (canonical.verification.evaluationStatus === "INSUFFICIENT_EVIDENCE" || core.validAxisCount === 0) {
    return {
      status: "HOLD",
      label: "평가 보류",
      badgeClass: "bg-rose-50 text-rose-700 border-rose-200",
      overallScore: null,
      scoreDisplay: "평가 보류",
      scoreDescription: "충분한 평가 근거를 확보하지 못했습니다.",
      validScoresCount: 0,
      totalDimensions,
      evaluationCoverage: 0,
      coverageDisplay: "0/5 (0%)",
      isRecommendationEligible: false,
      ineligibilityReason: eligibility.reason || "유효 점수 부족",
    };
  }

  if (canonical.verification.evaluationStatus === "FULL") {
    return {
      status: "COMPLETE",
      label: "평가 완료",
      badgeClass: "bg-emerald-50 text-emerald-700 border-emerald-200",
      overallScore: core.overallScore,
      scoreDisplay: canonical.labels.scoreDisplay,
      scoreDescription: "5개 평가 축 검증 및 점수 산출 완료",
      validScoresCount: core.validAxisCount,
      totalDimensions,
      evaluationCoverage: 100,
      coverageDisplay: "5/5 (100%)",
      isRecommendationEligible: eligibility.isEligible,
      ineligibilityReason: eligibility.reason,
    };
  }

  return {
    status: "PARTIAL",
    label: "부분 평가",
    badgeClass: "bg-amber-50 text-amber-700 border-amber-200",
    overallScore: core.overallScore,
    scoreDisplay: canonical.labels.scoreDisplay,
    scoreDescription: `${core.validAxisCount}개 유효 지표 기반 부분 평가. 근거가 부족한 항목은 점수 계산에서 제외됩니다.`,
    validScoresCount: core.validAxisCount,
    totalDimensions,
    evaluationCoverage: Math.round((core.validAxisCount / totalDimensions) * 100),
    coverageDisplay: core.coverageDisplay,
    isRecommendationEligible: eligibility.isEligible,
    ineligibilityReason: eligibility.reason,
  };
}
export function getRadarEligibility(paper: PaperCandidate): {
  isEligible: boolean;
  validCount: number;
  reason: string;
  metrics: {
    topicRelevance: number | null;
    methodNovelty: number | null;
    academicReliability: number | null;
    reproducibility: number | null;
    researchValue: number | null;
  };
} {
  const canonical = buildCanonicalPaperEvaluation(paper);
  const metrics = {
    topicRelevance: canonical.evaluation.topicRelevance,
    methodNovelty: canonical.evaluation.methodNovelty,
    academicReliability: canonical.evaluation.academicReliability,
    reproducibility: canonical.evaluation.reproducibility,
    researchValue: canonical.evaluation.researchValue,
  };
  const validAxes = CORE_SCORE_KEYS.map((key) => metrics[key]).filter((s): s is number => s !== null && s !== undefined);
  const isEligible = validAxes.length >= 3 && paper.crossVerificationStatus !== "NOT_FOUND";

  return {
    isEligible,
    validCount: validAxes.length,
    reason: isEligible
      ? `${validAxes.length}/5개 평가 축 충족`
      : `평가 근거 부족(${validAxes.length}/5개 축만 유효, 최소 3개 필요)`,
    metrics,
  };
}
export function getScatterEligibility(paper: PaperCandidate): {
  isEligible: boolean;
  x: number | null;
  y: number | null;
  reason: string;
} {
  const canonical = buildCanonicalPaperEvaluation(paper);
  const x = canonical.evaluation.topicRelevance;
  const y = canonical.evaluation.academicReliability;
  const isEligible = x !== null && y !== null && paper.crossVerificationStatus !== "NOT_FOUND";

  let reason = "정상 표시";
  if (paper.crossVerificationStatus === "NOT_FOUND") {
    reason = "논문 식별 불가 (미확정)";
  } else if (x === null && y === null) {
    reason = "주제 적합도 및 학술 신뢰도 점수 미확보";
  } else if (x === null) {
    reason = "주제 적합도 점수 미확보";
  } else if (y === null) {
    reason = "학술 신뢰도 점수 미확보";
  }

  return { isEligible, x, y, reason };
}
export function sortCandidatesByEvaluation(
  candidates: PaperCandidate[],
  aiRecId?: string
): PaperCandidate[] {
  void aiRecId;
  const order = new Map(rankCanonicalPapers(candidates).map((entry, index) => [entry.paperId, index]));
  return [...candidates].sort((a, b) => (order.get(a.id) ?? Number.MAX_SAFE_INTEGER) - (order.get(b.id) ?? Number.MAX_SAFE_INTEGER));
}

export function getDefaultComparedCandidateIds(
  candidates: PaperCandidate[],
  aiRecId?: string
): string[] {
  // Only eligible candidates (not HOLD and meets radar axes requirement)
  const eligibleCandidates = candidates.filter((c) => {
    const evalStatus = getPaperEvaluationStatus(c);
    const radar = getRadarEligibility(c);
    return evalStatus.status !== "HOLD" && radar.isEligible;
  });

  if (eligibleCandidates.length === 0) {
    return [];
  }

  // Sort eligible candidates by evaluation quality
  const sortedEligible = sortCandidatesByEvaluation(eligibleCandidates, aiRecId);

  const selectedIds: string[] = [];

  // Prioritize AI recommended paper if eligible
  if (aiRecId && sortedEligible.some((c) => c.id === aiRecId)) {
    selectedIds.push(aiRecId);
  }

  // Fill up to 3 candidates with highest evaluation ranking
  for (const candidate of sortedEligible) {
    if (!selectedIds.includes(candidate.id) && selectedIds.length < 3) {
      selectedIds.push(candidate.id);
    }
  }

  return selectedIds;
}

export function formatEnumKorean(val: string | undefined | null): string {
  return labelStatus(val);
}
export function generatePaperShortLabel(paper: {
  title?: string;
  canonicalTitle?: string;
  rawMention?: string;
  shortLabel?: string;
  name?: string;
}): string {
  if (paper.shortLabel && paper.shortLabel.trim().length > 0) {
    return paper.shortLabel.trim();
  }

  const rawMention = paper.rawMention?.trim() || "";
  if (rawMention && rawMention.length <= 16 && !rawMention.includes("http") && !rawMention.includes("/")) {
    return rawMention;
  }

  const title = (paper.canonicalTitle || paper.title || paper.name || "").trim();
  if (!title) return "논문";

  // Check for known prefix before ':' or '?? or '-' or '??
  const colonSplit = title.split(/[:竊싢붴?-]/);
  if (colonSplit.length > 1) {
    const prefix = colonSplit[0].trim();
    if (prefix.length >= 2 && prefix.length <= 16 && !/^(a|an|the|on|towards|study|evaluation|benchmark)$/i.test(prefix)) {
      return prefix;
    }
  }

  // Look for prominent capitalized model/framework acronyms like ForeWAM, StellaVLA, YOLOv8, ResNet, Transformer, Reflex
  const prominentMatches = title.match(/\b([A-Z][a-zA-Z0-9\-_]{2,14})\b/g);
  if (prominentMatches && prominentMatches.length > 0) {
    const nonKeywords = prominentMatches.filter(
      (m) => !/^(Towards|Learning|Deep|Neural|Visual|Action|Model|Robot|Task|Vision|Language|Prompt|Reasoning|Adaptive|Gated|Decoding)$/i.test(m)
    );
    if (nonKeywords.length > 0) {
      return nonKeywords[0];
    }
  }

  // Fallback: take first 2 meaningful words
  const words = title
    .replace(/[^\w\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 0 && !/^(a|an|the|on|for|with|in|by|of|to|and|from)$/i.test(w));

  if (words.length >= 2) {
    const combined = `${words[0]} ${words[1]}`;
    return combined.length <= 16 ? combined : words[0];
  } else if (words.length === 1) {
    return words[0].slice(0, 16);
  }

  return title.slice(0, 14);
}

export function computeScatterCollisionOffsets<T extends { id: string; x: number; y: number }>(
  items: T[],
  coordinateThreshold = 0.15
): Array<T & {
  renderOffsetDx: number;
  renderOffsetDy: number;
  clusterSize: number;
  clusterIndex: number;
  clusterKey: string;
  labelPlacement: "right" | "left" | "top" | "bottom";
}> {
  if (!items || items.length === 0) return [];

  // Group items into clusters by coordinate proximity
  const clusters: T[][] = [];
  const assigned = new Set<string>();

  for (let i = 0; i < items.length; i++) {
    const cur = items[i];
    if (assigned.has(cur.id)) continue;

    const cluster: T[] = [cur];
    assigned.add(cur.id);

    for (let j = i + 1; j < items.length; j++) {
      const other = items[j];
      if (assigned.has(other.id)) continue;

      if (
        Math.abs(cur.x - other.x) <= coordinateThreshold &&
        Math.abs(cur.y - other.y) <= coordinateThreshold
      ) {
        cluster.push(other);
        assigned.add(other.id);
      }
    }
    clusters.push(cluster);
  }

  const result: Array<T & {
    renderOffsetDx: number;
    renderOffsetDy: number;
    clusterSize: number;
    clusterIndex: number;
    clusterKey: string;
    labelPlacement: "right" | "left" | "top" | "bottom";
  }> = [];

  for (const cluster of clusters) {
    const k = cluster.length;
    const clusterKey = `${cluster[0].x.toFixed(1)}_${cluster[0].y.toFixed(1)}`;

    if (k === 1) {
      result.push({
        ...cluster[0],
        renderOffsetDx: 0,
        renderOffsetDy: 0,
        clusterSize: 1,
        clusterIndex: 0,
        clusterKey,
        labelPlacement: "right",
      });
      continue;
    }

    // Deterministic collision-aware offsets (8~14px)
    if (k === 2) {
      result.push({
        ...cluster[0],
        renderOffsetDx: -10,
        renderOffsetDy: -8,
        clusterSize: 2,
        clusterIndex: 0,
        clusterKey,
        labelPlacement: "left",
      });
      result.push({
        ...cluster[1],
        renderOffsetDx: 10,
        renderOffsetDy: 8,
        clusterSize: 2,
        clusterIndex: 1,
        clusterKey,
        labelPlacement: "right",
      });
    } else if (k === 3) {
      result.push({
        ...cluster[0],
        renderOffsetDx: 0,
        renderOffsetDy: -12,
        clusterSize: 3,
        clusterIndex: 0,
        clusterKey,
        labelPlacement: "top",
      });
      result.push({
        ...cluster[1],
        renderOffsetDx: -11,
        renderOffsetDy: 9,
        clusterSize: 3,
        clusterIndex: 1,
        clusterKey,
        labelPlacement: "left",
      });
      result.push({
        ...cluster[2],
        renderOffsetDx: 11,
        renderOffsetDy: 9,
        clusterSize: 3,
        clusterIndex: 2,
        clusterKey,
        labelPlacement: "right",
      });
    } else if (k === 4) {
      result.push({
        ...cluster[0],
        renderOffsetDx: -10,
        renderOffsetDy: -10,
        clusterSize: 4,
        clusterIndex: 0,
        clusterKey,
        labelPlacement: "left",
      });
      result.push({
        ...cluster[1],
        renderOffsetDx: 10,
        renderOffsetDy: -10,
        clusterSize: 4,
        clusterIndex: 1,
        clusterKey,
        labelPlacement: "right",
      });
      result.push({
        ...cluster[2],
        renderOffsetDx: -10,
        renderOffsetDy: 10,
        clusterSize: 4,
        clusterIndex: 2,
        clusterKey,
        labelPlacement: "left",
      });
      result.push({
        ...cluster[3],
        renderOffsetDx: 10,
        renderOffsetDy: 10,
        clusterSize: 4,
        clusterIndex: 3,
        clusterKey,
        labelPlacement: "right",
      });
    } else {
      // k >= 5: 1 at center, rest distributed evenly around radius 13px
      result.push({
        ...cluster[0],
        renderOffsetDx: 0,
        renderOffsetDy: 0,
        clusterSize: k,
        clusterIndex: 0,
        clusterKey,
        labelPlacement: "top",
      });

      const radius = 13;
      for (let i = 1; i < k; i++) {
        const angle = ((2 * Math.PI * (i - 1)) / (k - 1)) - (Math.PI / 2);
        const dx = Math.round(Math.cos(angle) * radius);
        const dy = Math.round(Math.sin(angle) * radius);
        result.push({
          ...cluster[i],
          renderOffsetDx: dx,
          renderOffsetDy: dy,
          clusterSize: k,
          clusterIndex: i,
          clusterKey,
          labelPlacement: dx < 0 ? "left" : "right",
        });
      }
    }
  }

  return result;
}












