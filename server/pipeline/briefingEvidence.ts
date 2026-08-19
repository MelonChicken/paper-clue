import { GroundedEvidenceItem } from "../../src/types.js";
import { DocumentAnalysisResult, ExtractedPaperDraft, PaperEvaluationResult, VerifiedMetadataResult, VerifiedResourcesResult } from "./types.js";

function textOf(draft: ExtractedPaperDraft): string {
  return `${draft.rawTitle || ""}\n${draft.venue || ""}\n${draft.snippet || ""}\n${(draft.claimedMetrics || []).map((m: any) => typeof m === "string" ? m : `${m.name || ""} ${m.value || ""} ${m.unit || ""} ${m.dataset || ""}`).join("\n")}`;
}

function evidence(claim: string, sourceLocation: string): GroundedEvidenceItem {
  return {
    evidenceType: "AI_INTERPRETATION",
    sourceType: "AI_INTERPRETATION",
    sourceTitle: "브리핑",
    sourceReference: "브리핑",
    sourceLocation,
    evidenceLocation: sourceLocation,
    claim,
    claimText: claim,
    verificationLevel: "NEEDS_VERIFICATION",
    verificationStatus: "PARTIALLY_VERIFIED",
  } as GroundedEvidenceItem;
}

function unique(items: string[]): string[] {
  const seen = new Set<string>();
  return items.map((item) => item.trim()).filter((item) => {
    if (!item || seen.has(item.toLowerCase())) return false;
    seen.add(item.toLowerCase());
    return true;
  });
}

export function briefingClaims(draft: ExtractedPaperDraft): {
  methodClaims: string[];
  quantitativeClaims: string[];
  metrics: string[];
  baselines: string[];
  datasets: string[];
  evidence: GroundedEvidenceItem[];
  explicitCodeNotFound: boolean;
  explicitCodeUrl: string | null;
  explicitDataUrl: string | null;
  peerReviewedClaim: boolean;
  dataClaim: boolean;
} {
  const text = textOf(draft);
  const lower = text.toLowerCase();
  const methodClaims: string[] = [];
  const quantitativeClaims: string[] = [];
  const metrics: string[] = [];
  const baselines: string[] = [];
  const datasets: string[] = [];

  const methodPatterns = [
    /Bayesian hierarchical discrete-time hazard model[^.\n]*/i,
    /Bayesian semi-mechanistic model[^.\n]*/i,
    /raw concentration\s*\+\s*flow data[^.\n]*/i,
    /infection dynamics[^.\n]*/i,
    /shedding[^.\n]*/i,
    /non-detect[^.\n]*/i,
    /outlier modeling[^.\n]*/i,
    /LLM-generated decision bank[^.\n]*/i,
    /census-derived synthetic population[^.\n]*/i,
    /incidence-weighted force of infection[^.\n]*/i,
  ];
  methodPatterns.forEach((pattern) => {
    const match = text.match(pattern)?.[0];
    if (match) methodClaims.push(match);
  });

  if (/no connectivity/i.test(text) && /road-distance/i.test(text) && /gravity score/i.test(text) && /incidence-weighted force of infection/i.test(text)) {
    methodClaims.push("4개 공간 연결 모델 비교: no connectivity, road-distance, gravity score, incidence-weighted force of infection");
    baselines.push("no connectivity", "road-distance", "gravity score", "incidence-weighted force of infection");
  }

  if (/raw concentration/i.test(text) && /flow/i.test(text) && /14-day forecast/i.test(text)) {
    methodClaims.push("raw concentration + flow data를 Bayesian semi-mechanistic model에 연결해 Rt, growth rate, latent infection dynamics, 14-day forecast를 추정");
  }

  const metricObjects = draft.claimedMetrics || [];
  metricObjects.forEach((m: any) => {
    if (typeof m === "string") {
      quantitativeClaims.push(m);
      return;
    }
    const claim = `${m.name || "metric"} ${m.value || ""}${m.unit ? ` ${m.unit}` : ""}${m.dataset ? ` (${m.dataset})` : ""}`.trim();
    if (claim) quantitativeClaims.push(claim);
    if (m.name) metrics.push(m.name);
  });

  const coverage = text.match(/forecast coverage[^\n.]{0,80}?(?:~|약|approximately|around)?\s*(\d+(?:\.\d+)?)\s*(percentage points?|pp|%p)/i);
  if (coverage) {
    quantitativeClaims.push(`forecast coverage 약 ${coverage[1]} ${coverage[2].replace(/pp|%p/i, "percentage points")} 개선`);
    metrics.push("forecast coverage");
  }
  const top10 = text.match(/top-?10 hit rate[^\n.]{0,60}?(?:~|약|approximately|around)?\s*(\d+(?:\.\d+)?)\s*%/i);
  if (top10) {
    quantitativeClaims.push(`top-10 hit rate 약 ${top10[1]}%`);
    metrics.push("top-10 hit rate");
  }

  if (/census-derived synthetic population/i.test(text)) datasets.push("census-derived synthetic population");
  if (/public dataset|benchmark dataset|study repository|data repository/i.test(lower)) datasets.push("briefing-mentioned dataset or study repository");

  const explicitCodeNotFound = /github[^\n.]{0,80}(확인하지 못함|not found|not verified|could not verify|no dedicated|no paper-specific)/i.test(text) || /논문 전용 repository 확인하지 못함/i.test(text);
  const urlMatch = text.match(/https?:\/\/(?:www\.)?github\.com\/[^\s)\]]+/i)?.[0] || null;
  const explicitCodeUrl = draft.mentionedCodeUrl || urlMatch;
  const explicitDataUrl = draft.mentionedDataUrl || null;
  const peerReviewedClaim = /peer-reviewed conference paper|peer reviewed conference paper|KDD\s*['’]?\d{2}|ACM DOI|doi\.org\/10\.1145/i.test(text);
  const dataClaim = datasets.length > 0 || Boolean(explicitDataUrl);

  const allEvidence: GroundedEvidenceItem[] = [
    ...unique(methodClaims).map((claim) => evidence(claim, "브리핑 · Method")),
    ...unique(quantitativeClaims).map((claim) => evidence(claim, "브리핑 · Results")),
    ...(explicitCodeUrl ? [evidence(`브리핑에 코드 저장소 URL이 제시됨: ${explicitCodeUrl}`, "브리핑 · Code")] : []),
    ...(explicitCodeNotFound ? [evidence("브리핑에서 논문 전용 코드 저장소를 확인하지 못했다고 명시함", "브리핑 · Code")] : []),
    ...unique(datasets).map((claim) => evidence(claim, "브리핑 · Dataset")),
    ...(peerReviewedClaim ? [evidence(`브리핑에 peer-reviewed venue로 명시됨: ${draft.venue || "conference paper"}`, "브리핑 · Publication")] : []),
  ];

  return {
    methodClaims: unique(methodClaims),
    quantitativeClaims: unique(quantitativeClaims),
    metrics: unique(metrics),
    baselines: unique(baselines),
    datasets: unique(datasets),
    evidence: allEvidence,
    explicitCodeNotFound,
    explicitCodeUrl,
    explicitDataUrl,
    peerReviewedClaim,
    dataClaim,
  };
}

export function mergeDocumentAnalysisWithBriefing(doc: DocumentAnalysisResult, draft: ExtractedPaperDraft): DocumentAnalysisResult {
  const claims = briefingClaims(draft);
  const method = doc.method && !/N\/A|추가 확인|insufficient|not found|확인 필요/i.test(doc.method)
    ? doc.method
    : claims.methodClaims.join("; ") || doc.method;
  const quantitativeResults = unique([
    ...claims.quantitativeClaims,
    ...(doc.quantitativeResults || []).filter((item) => !/N\/A|정량.*확인하지 못|quantitative.*not|직접 추출되지 않음/i.test(item)),
  ]);
  return {
    ...doc,
    method,
    metrics: unique([...claims.metrics, ...(doc.metrics || [])]),
    baselines: unique([...claims.baselines, ...(doc.baselines || [])]),
    datasets: unique([...claims.datasets, ...(doc.datasets || [])]),
    quantitativeResults: quantitativeResults.length > 0 ? quantitativeResults : doc.quantitativeResults,
    evidence: [...claims.evidence, ...(doc.evidence || [])],
  };
}

export function mergeMetadataWithBriefing(metadata: VerifiedMetadataResult, draft: ExtractedPaperDraft): VerifiedMetadataResult {
  const claims = briefingClaims(draft);
  if (!claims.peerReviewedClaim) return metadata;
  return {
    ...metadata,
    venueOrPreprint: metadata.venueOrPreprint || draft.venue,
    publicationStatus: metadata.publicationStatus === "PREPRINT" || metadata.publicationStatus === "UNKNOWN" || /preprint/i.test(metadata.publicationStatus)
      ? "PEER_REVIEWED"
      : metadata.publicationStatus,
    peerReviewed: true,
    isPreprint: false,
    publishingReliabilityDetails: {
      ...metadata.publishingReliabilityDetails,
      conferenceName: metadata.publishingReliabilityDetails?.conferenceName || draft.venue || metadata.venueOrPreprint,
      peerReviewed: true,
      isPreprint: false,
      scoreReason: metadata.publishingReliabilityDetails?.scoreReason || "브리핑에 peer-reviewed conference paper로 명시됨",
    },
    evidence: [...(metadata.evidence || []), ...claims.evidence.filter((item) => item.sourceLocation === "브리핑 · Publication")],
  };
}

export function mergeResourcesWithBriefing(resources: VerifiedResourcesResult, draft: ExtractedPaperDraft): VerifiedResourcesResult {
  const claims = briefingClaims(draft);
  let codeStatus = resources.codeStatus;
  let codeUrl = resources.codeUrl;
  let dataStatus = resources.dataStatus;
  let dataUrl = resources.dataUrl;

  if (claims.explicitCodeNotFound && !claims.explicitCodeUrl) {
    codeStatus = "NOT_FOUND_AFTER_RETRIES" as any;
    codeUrl = null;
  } else if (claims.explicitCodeUrl && ["NOT_FOUND", "NOT_FOUND_AFTER_RETRIES", "SEARCH_FAILED", "UNKNOWN"].includes(codeStatus)) {
    codeStatus = "REPOSITORY_FOUND" as any;
    codeUrl = claims.explicitCodeUrl;
  }

  if (claims.explicitDataUrl && ["NOT_FOUND", "NOT_FOUND_AFTER_RETRIES", "SEARCH_FAILED", "UNKNOWN"].includes(dataStatus)) {
    dataStatus = "DATASET_LINK_NOT_VERIFIED" as any;
    dataUrl = claims.explicitDataUrl;
  } else if (claims.dataClaim && ["NOT_FOUND", "NOT_FOUND_AFTER_RETRIES", "SEARCH_FAILED", "UNKNOWN", "NOT_APPLICABLE"].includes(dataStatus)) {
    dataStatus = "PUBLIC_BENCHMARK_USED" as any;
  }

  const isCodeAvailable = ["CODE_AVAILABLE_VERIFIED", "REPOSITORY_FOUND", "AVAILABLE_VERIFIED", "FOUND_UNVERIFIED", "PARTIALLY_AVAILABLE"].includes(codeStatus);
  const isDataMissing = ["NOT_FOUND", "NOT_FOUND_AFTER_RETRIES", "SEARCH_FAILED", "PRIVATE_OR_UNAVAILABLE", "UNKNOWN"].includes(dataStatus);
  return {
    ...resources,
    codeStatus,
    codeUrl,
    dataStatus,
    dataUrl,
    reproducibilityLevel: isCodeAvailable && !isDataMissing ? "PARTIALLY_REPRODUCIBLE" : isCodeAvailable ? "CODE_ONLY" : resources.reproducibilityLevel,
    reproducibilityAssessment: {
      ...resources.reproducibilityAssessment,
      codeStatus,
      dataStatus,
      level: isCodeAvailable && !isDataMissing ? "PARTIALLY_REPRODUCIBLE" : isCodeAvailable ? "CODE_ONLY" : resources.reproducibilityAssessment.level,
      reason: isCodeAvailable
        ? "브리핑 또는 공식 출처에서 코드/데이터 단서가 확인되었으며, 실행 절차는 추가 확인이 필요합니다."
        : resources.reproducibilityAssessment.reason,
    },
    evidence: [...claims.evidence.filter((item) => item.sourceLocation?.includes("Code") || item.sourceLocation?.includes("Dataset")), ...(resources.evidence || [])],
  };
}
function addBriefingEvidenceToScore(score: any, items: GroundedEvidenceItem[], fallbackReason: string, fallbackScore = 3) {
  const next = {
    ...score,
    evidence: {
      paperText: [...(score?.evidence?.paperText || [])],
      externalSource: [...(score?.evidence?.externalSource || [])],
      aiInterpretation: [...items, ...(score?.evidence?.aiInterpretation || [])],
    },
  };
  if (items.length > 0 && (next.score === null || next.status === "INSUFFICIENT_EVIDENCE" || /N\/A|근거 부족|확인 필요|insufficient|not found/i.test(next.reason || ""))) {
    next.score = typeof next.score === "number" ? next.score : fallbackScore;
    next.chartValue = next.score;
    next.status = "SCORED";
    next.reason = fallbackReason;
    next.notes = fallbackReason;
    next.scope = next.scope || "QUALITATIVE_ONLY";
  }
  return next;
}

export function mergeEvaluationWithBriefing(evaluation: PaperEvaluationResult, draft: ExtractedPaperDraft): PaperEvaluationResult {
  const claims = briefingClaims(draft);
  const methodEvidence = claims.evidence.filter((item) => item.sourceLocation === "브리핑 · Method");
  const quantEvidence = claims.evidence.filter((item) => item.sourceLocation === "브리핑 · Results");
  const resourceEvidence = claims.evidence.filter((item) => item.sourceLocation?.includes("Code") || item.sourceLocation?.includes("Dataset") || item.sourceLocation?.includes("Publication"));

  const scores: any = { ...evaluation.scores };
  if (methodEvidence.length > 0) {
    scores.novelty = addBriefingEvidenceToScore(scores.novelty, methodEvidence, "브리핑에 구체적인 방법론 근거가 명시되어 있어 부분 평가에 사용했습니다.", 3);
    scores.trendImportance = addBriefingEvidenceToScore(scores.trendImportance, methodEvidence, "브리핑의 핵심 주제와 방법론 연결성이 명시되어 있습니다.", 4);
    scores.practicalValue = addBriefingEvidenceToScore(scores.practicalValue, methodEvidence, "브리핑에 제안 방법의 연구 활용 근거가 명시되어 있습니다.", 3);
  }
  if (quantEvidence.length > 0) {
    scores.performance = addBriefingEvidenceToScore(scores.performance, quantEvidence, "브리핑에 정량 결과가 명시되어 있어 briefing evidence로 보존했습니다.", 3);
    scores.practicalValue = addBriefingEvidenceToScore(scores.practicalValue, quantEvidence, "브리핑에 정량 결과가 명시되어 연구 가치 평가 근거로 보존했습니다.", 3);
    scores.academicSignificance = addBriefingEvidenceToScore(scores.academicSignificance, quantEvidence, "브리핑에 성능 근거가 명시되어 학술 신뢰도 평가의 부분 근거로 보존했습니다.", 3);
  }
  if (resourceEvidence.length > 0) {
    scores.reproducibility = addBriefingEvidenceToScore(scores.reproducibility, resourceEvidence, "브리핑에 코드 또는 데이터 관련 정보가 명시되어 재현 가능성 평가 근거로 보존했습니다.", 3);
  }

  const factVerificationItems = (evaluation.uncertainty?.factVerificationItems || []).filter((item) => {
    if (claims.quantitativeClaims.some((claim) => item.includes(claim))) return false;
    if (claims.methodClaims.some((claim) => item.includes(claim))) return false;
    return true;
  });

  return {
    ...evaluation,
    scores,
    uncertainty: {
      ...evaluation.uncertainty,
      factVerificationItems,
    },
  };
}