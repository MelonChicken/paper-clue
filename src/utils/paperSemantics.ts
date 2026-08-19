import {
  AiRecommendation,
  BibliographicStatus,
  CodeStatus,
  DataStatus,
  DimensionScore,
  EvaluationStatus,
  GroundedEvidenceItem,
  PaperCandidate,
  PerformanceEvidenceStatus,
  PublicationStatus,
} from "../types";

export const CORE_SCORE_KEYS = [
  "topicRelevance",
  "methodNovelty",
  "researchValue",
  "academicReliability",
  "reproducibility",
] as const;

export type CoreScoreKey = (typeof CORE_SCORE_KEYS)[number];

export const CORE_SCORE_LABELS: Record<CoreScoreKey, string> = {
  topicRelevance: "주제 적합도",
  methodNovelty: "방법론 신규성",
  researchValue: "연구 가치",
  academicReliability: "학술 신뢰도",
  reproducibility: "재현 가능성",
};

export type CanonicalAxisScores = Record<CoreScoreKey, number | null>;

export type CanonicalEvidenceGroups = {
  paperEvidence: GroundedEvidenceItem[];
  externalEvidence: GroundedEvidenceItem[];
  performanceEvidence: GroundedEvidenceItem[];
  resourceEvidence: GroundedEvidenceItem[];
  aiInterpretation: GroundedEvidenceItem[];
};

export type EvidenceClaimType =
  | "METHOD"
  | "QUANTITATIVE_RESULT"
  | "ABSENCE_OF_QUANTITATIVE_RESULT"
  | "BASELINE_COMPARISON"
  | "RESOURCE"
  | "PUBLICATION"
  | "DATASET"
  | "LIMITATION"
  | "OTHER";

export type EvidenceClaimSourceType =
  | "PAPER_FULL_TEXT"
  | "PAPER_TABLE"
  | "PAPER_ABSTRACT"
  | "OFFICIAL_METADATA"
  | "OFFICIAL_REPOSITORY"
  | "EXTERNAL_SOURCE"
  | "BRIEFING"
  | "LLM_INFERENCE";

export type EvidenceClaimVerificationStatus = "VERIFIED" | "PARTIAL" | "UNVERIFIED";

export type EvidenceClaim = {
  id: string;
  paperId: string;
  type: EvidenceClaimType;
  claim: string;
  sourceType: EvidenceClaimSourceType;
  verificationStatus: EvidenceClaimVerificationStatus;
  usableForScoring: boolean;
  sourceLocation?: string | null;
  sourceUrl?: string | null;
  metric?: {
    name: string;
    value?: number | string | null;
    unit?: string | null;
    direction?: "INCREASE" | "DECREASE" | "NONE";
    comparisonTarget?: string | null;
  };
  evidenceItem?: GroundedEvidenceItem;
  notes?: string | null;
};

export type CanonicalPaperEvaluation = {
  paperId: string;
  sourcePaper: PaperCandidate;
  identity: {
    title: string;
    authors: string[];
    year: number | null;
    doi: string | null;
    arxivId: string | null;
    venue: string | null;
    primaryUrl: string | null;
  };
  verification: {
    bibliographicStatus: BibliographicStatus;
    publicationStatus: PublicationStatus;
    codeStatus: CodeStatus;
    dataStatus: DataStatus;
    performanceEvidenceStatus: PerformanceEvidenceStatus;
    evaluationStatus: EvaluationStatus;
  };
  labels: {
    bibliographicStatus: string;
    publicationStatus: string;
    publicationDisplay: string;
    codeStatus: string;
    dataStatus: string;
    performanceEvidenceStatus: string;
    evaluationStatus: string;
    scoreDisplay: string;
  };
  evaluation: CanonicalAxisScores & {
    evidenceClaimIds: Partial<Record<CoreScoreKey, string[]>>;
    overallScore: number | null;
    validAxisCount: number;
    totalAxisCount: number;
    coverageDisplay: string;
  };
  evidence: CanonicalEvidenceGroups;
  evidenceClaims: EvidenceClaim[];
  interpretation: {
    strengths: string[];
    limitations: string[];
    evaluationRationales: Partial<Record<CoreScoreKey, string>>;
  };
  uncertainty: {
    factVerification: string[];
    insufficientEvidence: string[];
    openQuestions: string[];
  };
  readingGuide: {
    questions: string[];
    nextSteps: string[];
    preReadingChecks: string[];
  };
};

export type CanonicalRecommendationResult = {
  highestScoringPaperId: string | null;
  recommendedPaperId: string | null;
  tradeoffExplanation: string | null;
  recommendedPaper: CanonicalPaperEvaluation | null;
  highestScoringPaper: CanonicalPaperEvaluation | null;
};
export type CanonicalRankingEntry = {
  paperId: string;
  canonical: CanonicalPaperEvaluation;
  rank: number;
  rankLabel: string;
  isTie: boolean;
  score: number | null;
  validAxisCount: number;
};

export function getCoreScore(paper: PaperCandidate, key: CoreScoreKey): DimensionScore | undefined {
  const scores = paper.scores as any;
  const fallback: Record<CoreScoreKey, string> = {
    topicRelevance: "trendImportance",
    methodNovelty: "novelty",
    researchValue: "practicalValue",
    academicReliability: "academicSignificance",
    reproducibility: "reproducibility",
  };
  return scores?.[key] || scores?.[fallback[key]];
}

export function getCoreScoreEntries(paper: PaperCandidate): Array<{ key: CoreScoreKey; label: string; score: DimensionScore | undefined }> {
  return CORE_SCORE_KEYS.map((key) => ({ key, label: CORE_SCORE_LABELS[key], score: getCoreScore(paper, key) }));
}

export function calculateCoreEvaluation(paperOrScores: PaperCandidate | any): {
  validScores: number[];
  validScoresCount: number;
  totalDimensions: number;
  overallScore: number | null;
  evaluationCoverage: number;
  coverageDisplay: string;
} {
  const paper = paperOrScores?.scores ? paperOrScores : { scores: paperOrScores };
  const values = CORE_SCORE_KEYS.map((key) => getCoreScore(paper, key)?.score);
  const validScores = values.filter((s): s is number => typeof s === "number" && !Number.isNaN(s));
  const totalDimensions = CORE_SCORE_KEYS.length;
  const overallScore = validScores.length > 0
    ? Math.round((validScores.reduce((a, b) => a + b, 0) / validScores.length) * 10) / 10
    : null;
  const evaluationCoverage = Math.round((validScores.length / totalDimensions) * 100);
  return {
    validScores,
    validScoresCount: validScores.length,
    totalDimensions,
    overallScore,
    evaluationCoverage,
    coverageDisplay: `${validScores.length}/${totalDimensions} (${evaluationCoverage}%)`,
  };
}


export function getCanonicalRanking(canonicalPapers: CanonicalPaperEvaluation[]): CanonicalRankingEntry[] {
  const sorted = [...canonicalPapers].sort((a, b) => {
    const scoreA = a.evaluation.overallScore ?? -Infinity;
    const scoreB = b.evaluation.overallScore ?? -Infinity;
    if (scoreB !== scoreA) return scoreB - scoreA;

    const validAxisDiff = b.evaluation.validAxisCount - a.evaluation.validAxisCount;
    if (validAxisDiff !== 0) return validAxisDiff;

    return a.identity.title.localeCompare(b.identity.title, "ko");
  });

  const scoreCounts = new Map<string, number>();
  sorted.forEach((paper) => {
    const key = paper.evaluation.overallScore === null ? "null" : paper.evaluation.overallScore.toFixed(1);
    scoreCounts.set(key, (scoreCounts.get(key) || 0) + 1);
  });

  let currentRank = 0;
  let previousScoreKey: string | null = null;
  return sorted.map((canonical, index) => {
    const scoreKey = canonical.evaluation.overallScore === null ? "null" : canonical.evaluation.overallScore.toFixed(1);
    if (scoreKey !== previousScoreKey) {
      currentRank = index + 1;
      previousScoreKey = scoreKey;
    }
    const isTie = (scoreCounts.get(scoreKey) || 0) > 1 && canonical.evaluation.overallScore !== null;
    return {
      paperId: canonical.paperId,
      canonical,
      rank: currentRank,
      rankLabel: isTie ? `공동 ${currentRank}위` : `${currentRank}위`,
      isTie,
      score: canonical.evaluation.overallScore,
      validAxisCount: canonical.evaluation.validAxisCount,
    };
  });
}

export function rankCanonicalPapers(candidates: PaperCandidate[], recommendation?: AiRecommendation): CanonicalRankingEntry[] {
  return getCanonicalRanking(buildCanonicalPaperEvaluations(candidates, recommendation));
}
export function normalizePublicationStatus(input: {

  publicationStatus?: string | null;
  venueOrPreprint?: string | null;
  arxivId?: string | null;
  biorxivId?: string | null;
  peerReviewed?: boolean | null;
  isPreprint?: boolean | null;
}): PublicationStatus {
  const joined = `${input.publicationStatus || ""} ${input.venueOrPreprint || ""}`.toLowerCase();
  const hasPreprintId = Boolean(input.arxivId || input.biorxivId);
  const isPreprintSource = hasPreprintId || /arxiv|biorxiv|preprint|openreview/.test(joined);
  const knownPeerVenue = /cvpr|iccv|eccv|neurips|iclr|icml|acl|emnlp|naacl|kdd|aaai|ijcai|siggraph|nature|science|ieee|acm|journal|proceedings/.test(joined);

  if (input.peerReviewed === true && !isPreprintSource) return "PEER_REVIEWED";
  if (knownPeerVenue && !isPreprintSource) return "PEER_REVIEWED";
  if (isPreprintSource || input.isPreprint === true) return "PREPRINT";
  if (/published|accepted|conference|journal/.test(joined)) return "PUBLISHED";
  return "UNKNOWN";
}

export function labelPublicationStatus(status?: string | null): string {
  const map: Record<string, string> = {
    PREPRINT: "Preprint",
    PEER_REVIEWED: "동료심사 완료",
    PUBLISHED: "게재 확인",
    UNKNOWN: "출판 상태 확인 필요",
  };
  return map[status || ""] || map[normalizePublicationStatus({ publicationStatus: status })];
}

export function labelPerformanceEvidenceStatus(status?: string | null): string {
  const map: Record<string, string> = {
    VERIFIED: "성능 근거 확인",
    PARTIAL: "성능 근거 부분 확인",
    NOT_VERIFIED: "성능 근거 미검증",
  };
  return map[status || ""] || map.NOT_VERIFIED;
}

export function labelEvaluationStatus(status?: string | null, validAxisCount?: number): string {
  if (status === "FULL") return "5/5 평가 완료";
  if (status === "PARTIAL") return `${validAxisCount ?? 0}/5 부분 평가`;
  return "평가 근거 부족";
}

export function labelStatus(val: string | undefined | null): string {
  if (!val) return "미확정";
  const map: Record<string, string> = {
    VERIFIED: "서지 확인 완료",
    PARTIAL: "부분 확인",
    UNVERIFIED: "미확인",
    BASIC_INFO_VERIFIED: "기본 정보 확인",
    PARTIAL_INFO_UNVERIFIED: "일부 정보 미확인",
    SOURCE_CONFLICT: "출처 충돌",
    IDENTITY_NOT_FOUND: "논문 식별 미확정",
    SINGLE_SOURCE: "단일 출처 확인",
    CONFLICTING: "출처 충돌",
    NOT_FOUND: "확인되지 않음",
    NOT_CHECKED: "미검증",
    NEEDS_VERIFICATION: "추가 확인 필요",
    INSUFFICIENT_EVIDENCE: "근거 부족",
    SCORED: "평가 완료",
    NOT_APPLICABLE: "해당 없음",
    CODE_AVAILABLE_VERIFIED: "코드 공개 확인",
    REPOSITORY_FOUND: "저장소 확인",
    PROJECT_PAGE_ONLY: "프로젝트 페이지만 확인",
    AVAILABLE_VERIFIED: "공개 확인",
    AVAILABLE_UNVERIFIED: "공개 미검증",
    FOUND_UNVERIFIED: "저장소 확인",
    AVAILABLE_WITH_RESTRICTIONS: "제한 공개",
    PARTIALLY_AVAILABLE: "일부 공개",
    CLAIMED_AVAILABLE: "공개 주장",
    SEARCH_FAILED: "검색 실패",
    NOT_FOUND_AFTER_RETRIES: "확인되지 않음",
    PUBLIC_DATASET_VERIFIED: "공개 데이터셋 확인",
    PUBLIC_BENCHMARK_USED: "공개 벤치마크 사용",
    DATASET_LINK_NOT_VERIFIED: "데이터 링크 추가 확인 필요",
    PRIVATE_OR_UNAVAILABLE: "비공개 또는 미공개",
    UNKNOWN: "미확정",
    REPRODUCIBLE: "재현 가능",
    PARTIALLY_REPRODUCIBLE: "부분 재현 가능",
    CODE_ONLY: "코드만 확인",
    PAPER_ONLY: "논문 정보만 확인",
    NOT_VERIFIED: "미검증",
    DIRECTLY_VERIFIED: "직접 확인",
    PARTIALLY_VERIFIED: "부분 확인",
    PAPER_REPORTED_VERIFIED: "논문 보고 근거",
    EXTERNALLY_CORROBORATED: "외부 교차검증",
    INDEPENDENTLY_REPRODUCED: "독립 재현",
    PAPER: "논문",
    METHOD: "방법",
    MODEL: "모델",
    PROJECT: "프로젝트",
    REPOSITORY: "저장소",
    DATASET: "데이터셋",
    BENCHMARK: "벤치마크",
    TOOL: "도구",
    EXTERNAL_SOURCE: "외부 출처",
    AI_INTERPRETATION: "AI 종합 해석",
    EXTERNAL_BENCHMARK: "외부 벤치마크",
    INTERNAL_EXPERIMENT: "내부 실험",
    QUALITATIVE_ONLY: "정성 평가",
  };
  return map[val] || val;
}

export function containsBrokenEncoding(text: string): boolean {
  return /\uFFFD|�|\?먮|\?쇰|\?뺣|\?꾨|\?됯|\?숈|\?곗|\?깅|\?쒖|\?ㅻ|\?ы|\?좎|硫|寃|遺|洹|怨|釉|諛|醫|異붿/.test(text);
}

export function sanitizeUserText(text: string | undefined | null, fallback = "추가 확인 필요"): string {
  if (!text) return fallback;
  return containsBrokenEncoding(text) ? fallback : text;
}

function uniqueClean(items: Array<string | undefined | null>): string[] {
  const seen = new Set<string>();
  return items
    .map((item) => sanitizeUserText(item, "").trim())
    .filter((item) => item.length > 0)
    .filter((item) => {
      if (seen.has(item)) return false;
      seen.add(item);
      return true;
    });
}

function uniqueEvidence(items: GroundedEvidenceItem[]): GroundedEvidenceItem[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = `${item.sourceTitle}|${item.sourceLocation}|${item.claim || item.text}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return !containsBrokenEncoding(item.claim || item.text || "");
  });
}

function evidenceItem(sourceTitle: string, claim: string, sourceLocation?: string): GroundedEvidenceItem {
  return {
    evidenceType: "AI_INTERPRETATION",
    sourceTitle,
    sourceLocation: sourceLocation || null,
    claim,
    verificationStatus: "PARTIALLY_VERIFIED",
  };
}

export function cleanUncertaintyItems(items: string[] | undefined): string[] {
  return uniqueClean(items || []).filter((item) => {
    if (/확인 완료|공개 확인|정량.*제시|성능 결과 제시|저장소 확인 완료|코드 공개 확인 완료/.test(item)) return false;
    if (/verified|confirmed|available/i.test(item) && !/필요|부족|없음|아직|uncertain|unverified|not verified|no |without|not |cannot/i.test(item)) return false;
    return true;
  });
}

function normalizeCodeStatus(paper: PaperCandidate): CodeStatus {
  if (paper.codeStatus === "AVAILABLE_VERIFIED") return "CODE_AVAILABLE_VERIFIED";
  if (paper.codeStatus === "FOUND_UNVERIFIED" || paper.codeStatus === "AVAILABLE_UNVERIFIED") return "REPOSITORY_FOUND";
  if (paper.codeStatus === "NOT_APPLICABLE") return "UNKNOWN";
  return paper.codeStatus || "UNKNOWN";
}

function normalizeDataStatus(paper: PaperCandidate): DataStatus {
  if (paper.dataStatus === "AVAILABLE_VERIFIED") return "PUBLIC_DATASET_VERIFIED";
  if (paper.dataStatus === "FOUND_UNVERIFIED" || paper.dataStatus === "CLAIMED_AVAILABLE") return "DATASET_LINK_NOT_VERIFIED";
  return paper.dataStatus || "UNKNOWN";
}

function stableClaimId(paperId: string, type: EvidenceClaimType, claim: string, index: number): string {
  const normalized = claim.toLowerCase().replace(/[^a-z0-9가-힣]+/g, "-").replace(/^-|-$/g, "").slice(0, 48);
  return `${paperId}:${type}:${normalized || "claim"}:${index}`;
}

function isAbsenceOfQuantitativeResult(text: string): boolean {
  return /no quantitative|no benchmark|no performance|no direct quantitative|정량.*없|정량.*확인하지 못|비교 결과.*없|성능 수치.*없|현재 확보.*정량 결과.*확인하지 못/i.test(text);
}

function hasMetricContext(text: string): boolean {
  return /accuracy|precision|recall|f1|auroc|auc|mAP|mIoU|RMSE|MAE|WIS|coverage|hit rate|success rate|error|loss|improvement|increase|decrease|gain|percentage point|baseline|정확도|재현율|정밀도|개선|증가|감소|베이스라인/i.test(text);
}

function isExcludedNumericOnlyContext(text: string): boolean {
  return /(^|\b)(19|20)\d{2}(\b|$)|KDD\s*[’]?\d{2}|arXiv:\s*\d{4}\.\d{4,5}|doi\s*[:/]|Table\s*\d+|Figure\s*\d+|Direct Comparisons:\s*\d+|Baselines:\s*\d+|\d+\s+datasets?\b|\d+\s+authors?\b/i.test(text);
}

function hasValidQuantitativeMetric(text: string): boolean {
  if (isAbsenceOfQuantitativeResult(text) || isExcludedNumericOnlyContext(text)) return false;
  const hasNumber = /\d+(?:\.\d+)?/.test(text);
  if (!hasNumber || !hasMetricContext(text)) return false;
  return Boolean(parseMetricFromClaim(text));
}

function classifyClaimType(text: string, sourceLocation?: string | null): EvidenceClaimType {
  const joined = `${text} ${sourceLocation || ""}`;
  const lower = joined.toLowerCase();
  if (isAbsenceOfQuantitativeResult(joined)) return "ABSENCE_OF_QUANTITATIVE_RESULT";
  if (hasValidQuantitativeMetric(joined)) return "QUANTITATIVE_RESULT";
  if (/code|github|repository|저장소|코드/.test(lower)) return "RESOURCE";
  if (/dataset|benchmark|data|데이터/.test(lower)) return "DATASET";
  if (/preprint|peer|published|venue|arxiv|doi|출판|게재|동료심사/.test(lower)) return "PUBLICATION";
  if (/method|architecture|model|framework|방법|구조/.test(lower)) return "METHOD";
  if (/baseline|compared|comparison|대비|비교/.test(lower)) return "BASELINE_COMPARISON";
  if (/limitation|risk|한계|제약/.test(lower)) return "LIMITATION";
  return "OTHER";
}

function claimSourceType(item: GroundedEvidenceItem): EvidenceClaimSourceType {
  const sourceText = `${item.sourceTitle || ""} ${item.sourceLocation || ""} ${item.sourceType || ""}`.toLowerCase();
  if (/table|표/.test(sourceText)) return "PAPER_TABLE";
  if (/abstract|초록/.test(sourceText)) return "PAPER_ABSTRACT";
  if (/github|repository|readme/.test(sourceText)) return "OFFICIAL_REPOSITORY";
  if (/metadata|doi|venue|publisher|proceedings/.test(sourceText)) return "OFFICIAL_METADATA";
  if (/external|papers with code|semantic scholar|crossref|외부/.test(sourceText)) return "EXTERNAL_SOURCE";
  if (item.evidenceType === "AI_INTERPRETATION") return "LLM_INFERENCE";
  return "PAPER_FULL_TEXT";
}

function claimVerificationStatus(item: GroundedEvidenceItem): EvidenceClaimVerificationStatus {
  if (item.verificationStatus === "DIRECTLY_VERIFIED") return "VERIFIED";
  if (item.verificationStatus === "PARTIALLY_VERIFIED") return "PARTIAL";
  return "UNVERIFIED";
}

function parseMetricFromClaim(claim: string): EvidenceClaim["metric"] | undefined {
  const text = claim.replace(/\s+/g, " ").trim();
  if (isAbsenceOfQuantitativeResult(text) || isExcludedNumericOnlyContext(text)) return undefined;

  const metricPatterns = [
    /forecast coverage/i,
    /top-?10 hit rate/i,
    /hit rate/i,
    /success rate/i,
    /coverage/i,
    /accuracy/i,
    /precision/i,
    /recall/i,
    /f1/i,
    /auroc/i,
    /auc/i,
    /mAP/i,
    /mIoU/i,
    /wis/i,
    /rmse/i,
    /mae/i,
    /error/i,
    /loss/i,
  ];
  const metricName = metricPatterns.find((pattern) => pattern.test(text))?.exec(text)?.[0] || null;
  const changeContext = /improv|increase|decrease|gain|lower|reduce|향상|개선|증가|감소|baseline|대비|percentage point/i.test(text);
  if (!metricName && !changeContext) return undefined;

  const valueMatch = text.match(/(?:\+|~|약|approximately|around)?\s*(\d+(?:\.\d+)?)\s*(percentage points|percentage point|pp|%|percent|퍼센트포인트|%p)?/i);
  if (!valueMatch) return undefined;

  const comparisonTarget = /baseline/i.test(text) ? "baseline" : /대비/.test(text) ? "비교 대상" : null;
  const direction = /improv|increase|gain|향상|개선|증가|\+\s*\d/i.test(text)
    ? "INCREASE"
    : /decrease|lower|reduce|감소|하락/i.test(text)
    ? "DECREASE"
    : "NONE";

  return {
    name: metricName || "quantitative change",
    value: valueMatch[1],
    unit: valueMatch[2] || null,
    direction,
    comparisonTarget,
  };
}
export function formatCanonicalMetricClaim(claim: EvidenceClaim): string {
  if (!claim.metric) return claim.claim;
  const value = claim.metric.value ? ` ${claim.metric.value}${claim.metric.unit ? ` ${claim.metric.unit}` : ""}` : "";
  const target = claim.metric.comparisonTarget ? `${claim.metric.comparisonTarget} 대비 ` : "";
  const direction = claim.metric.direction === "INCREASE" ? "개선" : claim.metric.direction === "DECREASE" ? "감소" : "보고";
  return `${target}${claim.metric.name}${value} ${direction}`.trim();
}

function buildEvidenceClaims(
  paper: PaperCandidate,
  paperEvidence: GroundedEvidenceItem[],
  externalEvidence: GroundedEvidenceItem[],
  resourceEvidence: GroundedEvidenceItem[],
  aiInterpretation: GroundedEvidenceItem[],
  publicationStatus: PublicationStatus,
  codeStatus: CodeStatus,
  dataStatus: DataStatus
): EvidenceClaim[] {
  const rawItems = [
    ...paperEvidence,
    ...externalEvidence,
    ...resourceEvidence,
    ...aiInterpretation,
  ];
  const claims: EvidenceClaim[] = rawItems.map((item, index) => {
    const claimText = sanitizeUserText(item.claim || item.text, "근거 내용 추가 확인 필요");
    const verificationStatus = claimVerificationStatus(item);
    return {
      id: stableClaimId(paper.id, classifyClaimType(claimText, item.sourceLocation || item.section), claimText, index),
      paperId: paper.id,
      type: classifyClaimType(claimText, item.sourceLocation || item.section),
      claim: claimText,
      sourceType: claimSourceType(item),
      verificationStatus,
      usableForScoring: verificationStatus !== "UNVERIFIED" && claimSourceType(item) !== "LLM_INFERENCE" && classifyClaimType(claimText, item.sourceLocation || item.section) !== "ABSENCE_OF_QUANTITATIVE_RESULT",
      sourceLocation: item.sourceLocation || item.section || null,
      sourceUrl: item.sourceUrl || item.url || null,
      metric: classifyClaimType(claimText, item.sourceLocation || item.section) === "QUANTITATIVE_RESULT" || classifyClaimType(claimText, item.sourceLocation || item.section) === "BASELINE_COMPARISON" ? parseMetricFromClaim(claimText) : undefined,
      evidenceItem: item,
      notes: item.limitations || null,
    };
  });

  const syntheticClaims: EvidenceClaim[] = [
    {
      id: `${paper.id}:PUBLICATION:canonical`,
      paperId: paper.id,
      type: "PUBLICATION",
      claim: `출판 상태: ${labelPublicationStatus(publicationStatus)}`,
      sourceType: paper.doi || paper.arxivId || paper.biorxivId ? "OFFICIAL_METADATA" : "LLM_INFERENCE",
      verificationStatus: paper.doi || paper.arxivId || paper.biorxivId ? "VERIFIED" : "PARTIAL",
      usableForScoring: false,
      sourceLocation: paper.venueOrPreprint || null,
      sourceUrl: paper.url || null,
    },
    {
      id: `${paper.id}:RESOURCE:code`,
      paperId: paper.id,
      type: "RESOURCE",
      claim: `코드 상태: ${codeStatus === "UNKNOWN" ? "코드 상태 확인 필요" : labelStatus(codeStatus)}`,
      sourceType: paper.codeUrl ? "OFFICIAL_REPOSITORY" : "LLM_INFERENCE",
      verificationStatus: codeStatus === "CODE_AVAILABLE_VERIFIED" ? "VERIFIED" : codeStatus === "UNKNOWN" || codeStatus === "NOT_FOUND" ? "UNVERIFIED" : "PARTIAL",
      usableForScoring: codeStatus === "CODE_AVAILABLE_VERIFIED",
      sourceLocation: "Code",
      sourceUrl: paper.codeUrl || null,
    },
    {
      id: `${paper.id}:DATASET:canonical`,
      paperId: paper.id,
      type: "DATASET",
      claim: `데이터 상태: ${dataStatus === "UNKNOWN" ? "데이터 상태 확인 필요" : labelStatus(dataStatus)}`,
      sourceType: paper.dataUrl ? "EXTERNAL_SOURCE" : "LLM_INFERENCE",
      verificationStatus: dataStatus === "PUBLIC_DATASET_VERIFIED" || dataStatus === "PUBLIC_BENCHMARK_USED" ? "VERIFIED" : dataStatus === "UNKNOWN" ? "UNVERIFIED" : "PARTIAL",
      usableForScoring: dataStatus === "PUBLIC_DATASET_VERIFIED" || dataStatus === "PUBLIC_BENCHMARK_USED",
      sourceLocation: "Data",
      sourceUrl: paper.dataUrl || null,
    },
  ];

  const unverifiedTextClaims = [
    ...(paper.uncertainty?.factVerificationItems || []),
    ...((paper as any).verificationNeededItems || []),
  ]
    .map((item) => sanitizeUserText(item, ""))
    .filter((item) => item.length > 0)
    .filter((item) => !/확인 완료|공개 확인|성능 결과 제시|정량.*제시/.test(item))
    .map((item, index): EvidenceClaim => ({
      id: stableClaimId(paper.id, classifyClaimType(item), item, rawItems.length + syntheticClaims.length + index),
      paperId: paper.id,
      type: classifyClaimType(item),
      claim: item,
      sourceType: "BRIEFING",
      verificationStatus: "UNVERIFIED",
      usableForScoring: false,
      metric: classifyClaimType(item) === "QUANTITATIVE_RESULT" || classifyClaimType(item) === "BASELINE_COMPARISON" ? parseMetricFromClaim(item) : undefined,
      notes: "브리핑 또는 평가 과정에서 언급되었으나 현재 원문/공식 출처에서 직접 확인되지 않았습니다.",
    }));

  const seen = new Set<string>();
  return [...claims, ...syntheticClaims, ...unverifiedTextClaims].filter((claim) => {
    const key = `${claim.type}|${claim.claim}|${claim.verificationStatus}`;
    if (seen.has(key) || containsBrokenEncoding(claim.claim)) return false;
    seen.add(key);
    return true;
  });
}

function isUnsupportedRationale(reason?: string | null): boolean {
  if (!reason) return false;
  return /확인되지 않음|정보 부족|근거 부족|평가 불가|판단 곤란|상세 부재|원문 확인 필요|확인하지 못|부재|insufficient|not verified|unverified|not found|cannot assess/i.test(reason);
}

function shouldNullifyAxisScore(key: CoreScoreKey, paper: PaperCandidate, claimIds: string[]): boolean {
  const score = getCoreScore(paper, key);
  if (!score || score.score === null) return false;
  return claimIds.length === 0 && isUnsupportedRationale(score.reason || score.notes);
}

function recalculateCanonicalOverall(axisScores: CanonicalAxisScores) {
  const validScores = CORE_SCORE_KEYS.map((key) => axisScores[key]).filter((score): score is number => typeof score === "number" && !Number.isNaN(score));
  const totalDimensions = CORE_SCORE_KEYS.length;
  const overallScore = validScores.length > 0 ? Math.round((validScores.reduce((a, b) => a + b, 0) / validScores.length) * 10) / 10 : null;
  const evaluationCoverage = Math.round((validScores.length / totalDimensions) * 100);
  return {
    validScoresCount: validScores.length,
    totalDimensions,
    overallScore,
    evaluationCoverage,
    coverageDisplay: `${validScores.length}/${totalDimensions} (${evaluationCoverage}%)`,
  };
}
function claimsForAxis(key: CoreScoreKey, paper: PaperCandidate, claims: EvidenceClaim[]): string[] {
  const score = getCoreScore(paper, key);
  if (!score || score.score === null) return [];
  const evidenceClaims = claims.filter((claim) => claim.usableForScoring && claim.verificationStatus !== "UNVERIFIED");
  if (key === "reproducibility") return evidenceClaims.filter((claim) => claim.type === "RESOURCE" || claim.type === "DATASET").map((claim) => claim.id);
  if (key === "academicReliability") return evidenceClaims.filter((claim) => claim.type === "PUBLICATION" || claim.type === "QUANTITATIVE_RESULT" || claim.type === "BASELINE_COMPARISON").map((claim) => claim.id);
  if (key === "researchValue") return evidenceClaims.filter((claim) => claim.type === "QUANTITATIVE_RESULT" || claim.type === "DATASET" || claim.type === "METHOD").map((claim) => claim.id);
  if (key === "methodNovelty") return evidenceClaims.filter((claim) => claim.type === "METHOD" || claim.type === "QUANTITATIVE_RESULT").map((claim) => claim.id);
  return evidenceClaims.filter((claim) => claim.type !== "RESOURCE").map((claim) => claim.id);
}

function isEvidenceLimitationText(text: string): boolean {
  return /외부 검증 없음|benchmark 비교 부족|벤치마크 비교 부족|SOTA 비교 없음|일반화 실험 부족|독립 재현 없음|실험 조건 제한|external validation|external benchmark|direct comparison|no direct comparison|not independently reproduced|generalizable|generalization|limited experimental|without external benchmark/i.test(text);
}

function isNegativeOrUncertainText(text: string): boolean {
  return /확인되지 않음|확인 필요|추가 확인|근거 부족|미검증|없음|미공개|부족|제한|실패|not verified|unverified|not found|no external|no direct|without external|unknown|insufficient|limited|부재/i.test(text);
}

function translateKnownEnglishUserText(text: string): string {
  return text
    .replace(/arXiv preprint, code and data available, quantitative results presented but no peer-reviewed publication yet\.?/gi, "arXiv에 공개된 preprint이며, 공식 코드와 공개 데이터가 확인되어 후속 검증이 가능합니다. 동료심사를 거친 출판 여부는 아직 확인되지 않았습니다.")
    .replace(/Code and public dataset are available via GitHub, enabling partial reproducibility\.?/gi, "공개 코드와 데이터셋을 활용해 일부 실험을 재현할 수 있으나 전체 재현 절차는 추가 확인이 필요합니다.")
    .replace(/peer-reviewed 학술지 발표 미상황/gi, "동료심사를 거친 출판 여부는 아직 확인되지 않았습니다.")
    .replace(/No external validation or peer-review confirmation yet\.?/gi, "독립적인 외부 검증 결과와 동료심사 결과는 아직 확인되지 않았습니다.")
    .replace(/No external validation available\.?/gi, "독립적인 외부 검증 결과가 아직 확인되지 않았습니다.")
    .replace(/No direct comparison(?: available| reported)?\.?/gi, "직접 비교 근거가 아직 확인되지 않았습니다.")
    .replace(/Performance improvement claim is supported by internal quantitative results without external benchmark comparison\.?/gi, "성능 개선 주장은 내부 정량 결과로는 확인되지만 외부 benchmark와의 직접 비교 근거는 제한적입니다.")
    .replace(/How generalizable is the ([A-Za-z0-9\-]+) framework to other diseases or geographic regions\?/gi, "$1가 다른 질병이나 지역에서도 동일한 효과를 보이는지 확인할 필요가 있습니다.")
    .replace(/How generalizable is this framework to other diseases or geographic regions\?/gi, "이 방법이 다른 질병이나 지역에서도 동일한 효과를 보이는지 확인할 필요가 있습니다.")
    .replace(/quantitative change/g, "정량 변화")
    .replace(/framework which preprocesses/gi, "framework가 전처리하는")
    .replace(/which preprocesses/gi, "전처리하는");
}

function normalizeUnknownVsAbsentText(text: string): string {
  return text
    .replace(/정량 결과 부재/g, "현재 확보된 원문 범위에서는 정량 결과를 확인하지 못했습니다")
    .replace(/방법론 설명 부재/g, "현재 확보된 원문 범위에서는 방법론 설명을 확인하지 못했습니다")
    .replace(/방법론 기술 부재/g, "현재 확보된 원문 범위에서는 방법론 기술을 확인하지 못했습니다")
    .replace(/데이터 미공개/g, "공식 데이터 공개 여부를 확인하지 못했습니다")
    .replace(/성능 수치 없음/g, "현재 확보된 원문 범위에서는 성능 수치를 확인하지 못했습니다");
}
export function formatResourceStatusForUser(text: string): string {
  return text
    .replace(/CODE_AVAILABLE_VERIFIED/g, "코드 공개 확인")
    .replace(/NOT_FOUND_AFTER_RETRIES/g, "확인되지 않음")
    .replace(/PUBLIC_DATASET_VERIFIED/g, "공개 데이터셋 확인")
    .replace(/PUBLIC_BENCHMARK_USED/g, "공개 벤치마크 사용")
    .replace(/REPOSITORY_FOUND/g, "저장소 확인")
    .replace(/PROJECT_PAGE_ONLY/g, "프로젝트 페이지만 확인")
    .replace(/UNKNOWN/g, "확인 필요");
}

export function formatEvidenceForUser(text: string | undefined | null, fallback = "근거 추가 확인 필요"): string {
  const sanitized = normalizeUnknownVsAbsentText(translateKnownEnglishUserText(sanitizeUserText(text, fallback)));
  return formatResourceStatusForUser(sanitized)
    .replace(/Quantitative Results:\s*N\/A/gi, "정량 결과 원문 확인 필요")
    .replace(/Method:\s*N\/A/gi, "방법론 세부 구조 추가 확인 필요")
    .replace(/\bN\/A\b/g, "확인 필요")
    .replace(/Code Status:\s*/gi, "코드 상태: ")
    .replace(/Data Status:\s*/gi, "데이터 상태: ")
    .trim();
}

function guardPublicationInterpretation(text: string, publicationStatus: PublicationStatus): string {
  if (publicationStatus === "PEER_REVIEWED") return text;
  return text
    .replace(/peer-reviewed preprint/gi, "Preprint로 공개된 연구")
    .replace(/peer-reviewed paper/gi, "Preprint로 공개된 연구")
    .replace(/동료심사(?:를)?\s*통과한\s*논문/g, "Preprint로 공개된 연구")
    .replace(/동료심사 완료(?:된)?\s*논문/g, "Preprint로 공개된 연구")
    .replace(/accepted\s+paper/gi, "Preprint로 공개된 연구")
    .replace(/게재 확정(?:된)?\s*논문/g, "Preprint로 공개된 연구");
}

export function formatStrengthForUser(text: string | undefined | null, publicationStatus: PublicationStatus = "UNKNOWN"): string {
  return guardPublicationInterpretation(formatEvidenceForUser(text, "검증 가능한 강점 근거 추가 확인 필요"), publicationStatus);
}

export function formatUncertaintyForUser(text: string | undefined | null): string {
  return formatEvidenceForUser(text, "추가 확인이 필요합니다.");
}

export function formatOpenQuestionForUser(text: string | undefined | null): string {
  return formatEvidenceForUser(text, "논문을 읽으며 추가 확인이 필요합니다.");
}

export function formatReadingQuestion(text: string | undefined | null): string {
  return formatEvidenceForUser(text, "읽으면서 확인할 질문을 추가 확인해야 합니다.")
    .replace(/^(.+?)\.이 실제 Method 섹션에서/, "이 방법이 실제 Method 섹션에서")
    .replace(/^(.+?)이 어떤 입력/, "제안 방법이 어떤 입력")
    .replace(/framework which/gi, "framework가")
    .trim();
}
function userFacingQuantClaim(claim: EvidenceClaim): string {
  const base = formatCanonicalMetricClaim(claim);
  if (claim.verificationStatus === "UNVERIFIED") return `브리핑에서 ${base}가 언급되었으나 현재 원문에서 직접 확인하지 못했습니다.`;
  if (claim.verificationStatus === "PARTIAL") return `${base}. 세부 조건과 비교 대상은 추가 확인이 필요합니다.`;
  return base;
}
function derivePerformanceEvidenceStatus(paper: PaperCandidate): PerformanceEvidenceStatus {
  if (paper.performanceEvidenceStatus) return paper.performanceEvidenceStatus;
  const perf = paper.scores?.performance;
  const paperEvidenceCount = perf?.evidence?.paperText?.length || 0;
  const externalEvidenceCount = perf?.evidence?.externalSource?.length || 0;
  const reasonText = `${perf?.reason || ""} ${(perf?.evidence?.paperText || []).map((e) => e.claim).join(" ")}`;
  const hasQuantSignal = /\d+(\.\d+)?\s*(%|점|pp)?|accuracy|f1|auroc|rmse|miou|baseline|benchmark|table|ablation|improvement|gain/i.test(reasonText);
  if (paperEvidenceCount > 0 && externalEvidenceCount > 0) return "VERIFIED";
  if (paperEvidenceCount > 0 || externalEvidenceCount > 0 || hasQuantSignal) return "PARTIAL";
  return "NOT_VERIFIED";
}

function deriveEvaluationStatus(validAxisCount: number, paper: PaperCandidate): EvaluationStatus {
  if (paper.evaluationStatus) return paper.evaluationStatus;
  if (validAxisCount === CORE_SCORE_KEYS.length) return "FULL";
  if (validAxisCount > 0) return "PARTIAL";
  return "INSUFFICIENT_EVIDENCE";
}

function publicationDisplay(paper: PaperCandidate, status: PublicationStatus): string {
  const id = paper.arxivId ? ` · arXiv:${paper.arxivId}` : paper.biorxivId ? ` · bioRxiv:${paper.biorxivId}` : "";
  const venue = paper.venueOrPreprint ? ` · ${paper.venueOrPreprint}` : "";
  return `${labelPublicationStatus(status)}${venue}${id}`;
}

function deriveStrengths(paper: PaperCandidate, claims: EvidenceClaim[]): string[] {
  const targetClaims = claims.filter((claim) => claim.paperId === paper.id);
  const usableClaims = targetClaims.filter((claim) => claim.usableForScoring && claim.verificationStatus !== "UNVERIFIED");
  const claimStrengths = usableClaims
    .filter((claim) => claim.type === "QUANTITATIVE_RESULT" || claim.type === "BASELINE_COMPARISON" || claim.type === "RESOURCE" || claim.type === "DATASET")
    .filter((claim) => !isNegativeOrUncertainText(claim.claim))
    .map((claim) => {
      if (claim.type === "QUANTITATIVE_RESULT" || claim.type === "BASELINE_COMPARISON") return formatStrengthForUser(userFacingQuantClaim(claim), normalizePublicationStatus({ publicationStatus: paper.publicationStatus, venueOrPreprint: paper.venueOrPreprint, arxivId: paper.arxivId, biorxivId: paper.biorxivId, peerReviewed: paper.publishingReliabilityDetails?.peerReviewed, isPreprint: paper.publishingReliabilityDetails?.isPreprint }));
      return formatStrengthForUser(claim.claim, normalizePublicationStatus({ publicationStatus: paper.publicationStatus, venueOrPreprint: paper.venueOrPreprint, arxivId: paper.arxivId, biorxivId: paper.biorxivId, peerReviewed: paper.publishingReliabilityDetails?.peerReviewed, isPreprint: paper.publishingReliabilityDetails?.isPreprint }));
    });
  const scoreStrengths = getCoreScoreEntries(paper)
    .filter((entry) => typeof entry.score?.score === "number" && (entry.score?.score || 0) >= 4)
    .filter((entry) => !isNegativeOrUncertainText(entry.score?.reason || ""))
    .filter((entry) => claimsForAxis(entry.key, paper, targetClaims).length > 0 || Boolean(entry.score?.reason))
    .map((entry) => formatStrengthForUser(`${entry.label} ${entry.score?.score}점: ${entry.score?.reason || "검증 가능한 강점으로 평가되었습니다."}`, normalizePublicationStatus({ publicationStatus: paper.publicationStatus, venueOrPreprint: paper.venueOrPreprint, arxivId: paper.arxivId, biorxivId: paper.biorxivId, peerReviewed: paper.publishingReliabilityDetails?.peerReviewed, isPreprint: paper.publishingReliabilityDetails?.isPreprint })));
  return uniqueClean([...claimStrengths, ...scoreStrengths]).slice(0, 3);
}
export function ensureThreeReadingQuestions(paper: PaperCandidate, questions?: string[]): string[] {
  const method = sanitizeUserText((paper.scores.methodNovelty || paper.scores.novelty)?.reason, "핵심 방법 구조");
  const perfEvidence = paper.scores.performance?.evidence?.paperText?.[0]?.claim || paper.scores.performance?.reason || "실험 결과와 벤치마크 근거";
  const repro = paper.reproducibilityAssessment?.reason || paper.scores.reproducibility?.reason || "코드, 데이터, 설정 공개 상태";
  const cleaned = (questions || []).filter((q) => q && !containsBrokenEncoding(q)).slice(0, 3);
  const defaults = [
    `핵심 방법은 어떤 구조로 작동하며 기존 접근과 무엇이 다른가? (${sanitizeUserText(method)})`,
    `주요 benchmark, baseline, metric에서 어떤 개선 근거가 확인되는가? (${sanitizeUserText(perfEvidence)})`,
    `Ablation, 한계, 재현 절차를 볼 때 실제로 확인해야 할 약한 고리는 무엇인가? (${sanitizeUserText(repro)})`,
  ];
  return [...cleaned, ...defaults].slice(0, 3);
}

function methodFocusForQuestion(paper: PaperCandidate, claims: EvidenceClaim[]): string {
  const source = `${paper.title} ${paper.scores.methodNovelty?.reason || paper.scores.novelty?.reason || ""} ${claims.map((claim) => claim.claim).join(" ")}`;
  if (/EpiFlow/i.test(source)) return "EpiFlow";
  if (/wastewater|viral-load|viral load|폐수/i.test(source)) return "폐수 바이러스 부하 신호";
  if (/Permutation entropy/i.test(source)) return "Permutation entropy";
  const acronym = source.match(/\b[A-Z][A-Za-z0-9\-]{2,14}\b/)?.[0];
  if (acronym && !/^(The|This|Method|Results|Table|Figure|Abstract|Paper)$/i.test(acronym)) return acronym;
  return "제안 방법";
}
function buildClaimGroundedReadingQuestions(paper: PaperCandidate, claims: EvidenceClaim[], fallbackQuestions?: string[]): string[] {
  void fallbackQuestions;
  const targetClaims = claims.filter((claim) => claim.paperId === paper.id);
  const methodClaim = targetClaims.find((claim) => claim.type === "METHOD" && claim.verificationStatus !== "UNVERIFIED");
  const quantClaim = targetClaims.find((claim) => (claim.type === "QUANTITATIVE_RESULT" || claim.type === "BASELINE_COMPARISON") && claim.verificationStatus !== "UNVERIFIED");
  const unverifiedQuantClaim = targetClaims.find((claim) => claim.type === "QUANTITATIVE_RESULT" && claim.verificationStatus === "UNVERIFIED");
  const limitationClaim = targetClaims.find((claim) => claim.type === "LIMITATION") || targetClaims.find((claim) => claim.type === "RESOURCE" || claim.type === "DATASET");
  const methodFocus = methodFocusForQuestion(paper, targetClaims);
  const methodReason = formatEvidenceForUser((paper.scores.methodNovelty || paper.scores.novelty)?.reason, "방법론의 구체 구조가 충분히 확인되지 않았습니다.");
  const questions = [
    methodClaim
      ? `${methodFocus}가 어떤 입력을 받아 어떤 처리 단계를 거쳐 결과를 생성하는지 Method 섹션에서 확인합니다.`
      : `현재 확보된 정보만으로 방법론의 구체적 구조가 충분히 확인되지 않습니다. Method 섹션에서 ${methodFocus}의 처리 흐름과 ${methodReason}을 우선 확인합니다.`,
    quantClaim
      ? `${formatEvidenceForUser(userFacingQuantClaim(quantClaim))}이 어떤 benchmark, baseline, split, horizon 조건에서 산출됐는지 확인합니다.`
      : unverifiedQuantClaim
      ? `${formatEvidenceForUser(userFacingQuantClaim(unverifiedQuantClaim))} 해당 수치의 원문 위치, 평가 조건, baseline을 우선 확인합니다.`
      : "현재 확보된 범위에서는 정량 결과를 직접 확인하지 못했습니다. Results/Table/Ablation 섹션에서 metric, baseline, 개선 폭을 확인합니다.",
    limitationClaim
      ? `${formatEvidenceForUser(limitationClaim.claim)}과 관련해 재현 절차, 데이터 조건, 한계가 실제 실험 해석에 어떤 영향을 주는지 확인합니다.`
      : "코드, 데이터, 설정, 평가 절차 공개 상태를 재현 가능성 관점에서 확인합니다.",
  ];

  return uniqueClean(questions.map(formatReadingQuestion)).slice(0, 3);
}
export function buildCanonicalPaperEvaluation(paper: PaperCandidate, recommendation?: AiRecommendation): CanonicalPaperEvaluation {
  const core = calculateCoreEvaluation(paper);
  const axisScores = CORE_SCORE_KEYS.reduce((acc, key) => {
    acc[key] = getCoreScore(paper, key)?.score ?? null;
    return acc;
  }, {} as CanonicalAxisScores);
  const publicationStatus = normalizePublicationStatus({
    publicationStatus: paper.publicationStatus,
    venueOrPreprint: paper.venueOrPreprint,
    arxivId: paper.arxivId,
    biorxivId: paper.biorxivId,
    peerReviewed: paper.publishingReliabilityDetails?.peerReviewed,
    isPreprint: paper.publishingReliabilityDetails?.isPreprint,
  });
  const codeStatus = normalizeCodeStatus(paper);
  const dataStatus = normalizeDataStatus(paper);
  const performanceEvidenceStatus = derivePerformanceEvidenceStatus(paper);
  const evaluationStatus = deriveEvaluationStatus(core.validScoresCount, paper);
  const bibliographicStatus: BibliographicStatus = paper.bibliographicStatus || (paper.crossVerificationStatus === "NOT_FOUND" ? "UNVERIFIED" : paper.crossVerificationStatus === "VERIFIED" ? "VERIFIED" : "PARTIAL");

  const scoreEvidence = getCoreScoreEntries(paper).flatMap((entry) => {
    const ev = entry.score?.evidence;
    return ev ? [...ev.paperText, ...ev.externalSource, ...ev.aiInterpretation] : [];
  });
  const performanceEvidence = paper.scores.performance?.evidence || { paperText: [], externalSource: [], aiInterpretation: [] };
  const paperEvidence = uniqueEvidence([...getCoreScoreEntries(paper).flatMap((entry) => entry.score?.evidence?.paperText || []), ...performanceEvidence.paperText]);
  const externalEvidence = uniqueEvidence([...getCoreScoreEntries(paper).flatMap((entry) => entry.score?.evidence?.externalSource || []), ...performanceEvidence.externalSource]);
  const aiInterpretation = uniqueEvidence([...getCoreScoreEntries(paper).flatMap((entry) => entry.score?.evidence?.aiInterpretation || []), ...performanceEvidence.aiInterpretation]);
  const resourceEvidence = uniqueEvidence([
    paper.codeUrl ? evidenceItem("resource verification", `코드 상태: ${labelStatus(codeStatus)} (${paper.codeUrl})`, "Code") : evidenceItem("resource verification", `코드 상태: ${labelStatus(codeStatus)}`, "Code"),
    paper.dataUrl ? evidenceItem("resource verification", `데이터 상태: ${labelStatus(dataStatus)} (${paper.dataUrl})`, "Data") : evidenceItem("resource verification", `데이터 상태: ${dataStatus === "UNKNOWN" ? "데이터 상태 확인 필요" : labelStatus(dataStatus)}`, "Data"),
    evidenceItem("resource verification", `재현 가능성: ${labelStatus(paper.reproducibilityStatus)}. ${sanitizeUserText(paper.reproducibilityAssessment?.reason || paper.scores.reproducibility?.reason)}`, "Reproducibility"),
  ]);

  const evidenceClaims = buildEvidenceClaims(
    paper,
    paperEvidence,
    externalEvidence,
    resourceEvidence,
    aiInterpretation,
    publicationStatus,
    codeStatus,
    dataStatus
  );
  const verifiedClaimTexts = new Set(evidenceClaims.filter((claim) => claim.verificationStatus === "VERIFIED").map((claim) => claim.claim));
  const evidenceClaimIds = CORE_SCORE_KEYS.reduce((acc, key) => {
    acc[key] = claimsForAxis(key, paper, evidenceClaims);
    return acc;
  }, {} as Partial<Record<CoreScoreKey, string[]>>);
  const guardedAxisScores = CORE_SCORE_KEYS.reduce((acc, key) => {
    acc[key] = shouldNullifyAxisScore(key, paper, evidenceClaimIds[key] || []) ? null : axisScores[key];
    return acc;
  }, {} as CanonicalAxisScores);
  const guardedCore = recalculateCanonicalOverall(guardedAxisScores);
  const guardedEvaluationStatus = deriveEvaluationStatus(guardedCore.validScoresCount, { ...paper, evaluationStatus: undefined } as PaperCandidate);

  const evaluationRationales = CORE_SCORE_KEYS.reduce((acc, key) => {
    const reason = getCoreScore(paper, key)?.reason;
    if (reason) acc[key] = guardPublicationInterpretation(formatEvidenceForUser(reason), publicationStatus);
    return acc;
  }, {} as Partial<Record<CoreScoreKey, string>>);

  const rawFactVerification = cleanUncertaintyItems(paper.uncertainty?.factVerificationItems).filter((item) => !verifiedClaimTexts.has(item));
  const limitationFromFact = rawFactVerification.filter(isEvidenceLimitationText).map(formatUncertaintyForUser);
  const factVerification = rawFactVerification.filter((item) => !isEvidenceLimitationText(item)).map(formatUncertaintyForUser);
  const insufficientEvidence = uniqueClean([
    ...cleanUncertaintyItems(paper.uncertainty?.insufficientEvidenceItems).filter((item) => !verifiedClaimTexts.has(item)),
    ...limitationFromFact,
  ].map(formatUncertaintyForUser));
  const openQuestions = uniqueClean((paper.uncertainty?.researchOpenQuestions || []).map(formatOpenQuestionForUser));
  const questions = buildClaimGroundedReadingQuestions(paper, evidenceClaims, recommendation?.topRecommendedPaperId === paper.id ? recommendation.readingQuestions : undefined);
  const preReadingChecks = [...factVerification, ...insufficientEvidence, ...evidenceClaims.filter((claim) => claim.verificationStatus === "UNVERIFIED" && claim.type === "QUANTITATIVE_RESULT").map((claim) => formatUncertaintyForUser(userFacingQuantClaim(claim)))].slice(0, 4);

  return {
    paperId: paper.id,
    sourcePaper: paper,
    identity: {
      title: paper.title,
      authors: paper.authors || [],
      year: typeof paper.year === "number" ? paper.year : Number.isFinite(Number(paper.year)) ? Number(paper.year) : null,
      doi: paper.doi || null,
      arxivId: paper.arxivId || paper.biorxivId || null,
      venue: paper.venueOrPreprint || null,
      primaryUrl: paper.url || paper.canonicalUrl || paper.doi || paper.arxivId || null,
    },
    verification: {
      bibliographicStatus,
      publicationStatus,
      codeStatus,
      dataStatus,
      performanceEvidenceStatus,
      evaluationStatus: guardedEvaluationStatus,
    },
    labels: {
      bibliographicStatus: labelStatus(bibliographicStatus),
      publicationStatus: labelPublicationStatus(publicationStatus),
      publicationDisplay: publicationDisplay(paper, publicationStatus),
      codeStatus: codeStatus === "UNKNOWN" ? "코드 상태 확인 필요" : labelStatus(codeStatus),
      dataStatus: dataStatus === "UNKNOWN" ? "데이터 상태 확인 필요" : labelStatus(dataStatus),
      performanceEvidenceStatus: labelPerformanceEvidenceStatus(performanceEvidenceStatus),
      evaluationStatus: labelEvaluationStatus(guardedEvaluationStatus, guardedCore.validScoresCount),
      scoreDisplay: guardedCore.overallScore !== null ? `${guardedCore.overallScore.toFixed(1)} / 5.0` : "평가 보류",
    },
    evaluation: {
      ...guardedAxisScores,
      evidenceClaimIds,
      overallScore: guardedCore.overallScore,
      validAxisCount: guardedCore.validScoresCount,
      totalAxisCount: guardedCore.totalDimensions,
      coverageDisplay: guardedCore.coverageDisplay,
    },
    evidence: {
      paperEvidence,
      externalEvidence,
      performanceEvidence: uniqueEvidence([...performanceEvidence.paperText, ...performanceEvidence.externalSource, ...scoreEvidence]),
      resourceEvidence,
      aiInterpretation,
    },
    evidenceClaims,
    interpretation: {
      strengths: deriveStrengths(paper, evidenceClaims),
      limitations: uniqueClean(recommendation?.topRecommendedPaperId === paper.id ? recommendation.keyLimitationsOrRisks : []).slice(0, 4),
      evaluationRationales,
    },
    uncertainty: {
      factVerification,
      insufficientEvidence,
      openQuestions,
    },
    readingGuide: {
      questions,
      preReadingChecks,
      nextSteps: [
        "Method 섹션에서 핵심 구조와 입력·출력 정의를 확인한다.",
        "Results/Table/Ablation에서 benchmark, baseline, metric, 개선 폭을 확인한다.",
        "코드, 데이터, 설정, 평가 절차 공개 상태를 재현 가능성 관점에서 확인한다.",
      ],
    },
  };
}

export function buildCanonicalPaperEvaluations(candidates: PaperCandidate[], recommendation?: AiRecommendation): CanonicalPaperEvaluation[] {
  return candidates.map((paper) => buildCanonicalPaperEvaluation(paper, recommendation));
}

export function buildCanonicalRecommendationResult(candidates: PaperCandidate[], recommendation: AiRecommendation): CanonicalRecommendationResult {
  const canonicalPapers = buildCanonicalPaperEvaluations(candidates, recommendation);
  const ranking = getCanonicalRanking(canonicalPapers);
  const topRankedPapers = ranking.filter((entry) => entry.rank === 1 && entry.score !== null).map((entry) => entry.canonical);
  const highestScoringPaper = topRankedPapers[0] || null;
  const recommendedPaper = canonicalPapers.find((paper) => paper.paperId === recommendation.topRecommendedPaperId) || null;
  const recommendedIsTopTie = Boolean(recommendedPaper && topRankedPapers.some((paper) => paper.paperId === recommendedPaper.paperId) && topRankedPapers.length > 1);
  const differs = Boolean(highestScoringPaper && recommendedPaper && highestScoringPaper.paperId !== recommendedPaper.paperId);
  const fallbackExplanation = recommendedIsTopTie
    ? `공동 최고점 후보 중 이번 주 주제와의 직접적 관련성을 고려해 ${recommendedPaper?.identity.title}를 우선 추천했습니다.`
    : `${highestScoringPaper?.identity.title}가 종합점수는 가장 높지만, ${recommendedPaper?.identity.title}가 이번 브리핑 주제와 더 직접적으로 연결되어 우선 추천했습니다.`;
  return {
    highestScoringPaperId: highestScoringPaper?.paperId || null,
    recommendedPaperId: recommendation.topRecommendedPaperId,
    highestScoringPaper,
    recommendedPaper,
    tradeoffExplanation: differs || recommendedIsTopTie ? formatStrengthForUser(sanitizeUserText(recommendation.tradeoffExplanation, fallbackExplanation), recommendedPaper?.verification.publicationStatus || "UNKNOWN") : null,
  };
}




















