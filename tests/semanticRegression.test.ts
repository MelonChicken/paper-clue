import { describe, expect, it } from "vitest";
import { PaperCandidate, BriefingAnalysisResponse } from "../src/types.js";
import { computePaperEvaluationCoverage, getPaperEvaluationStatus } from "../src/utils/evaluationHelpers.js";
import { normalizePublicationStatus, labelPublicationStatus, containsBrokenEncoding, buildCanonicalPaperEvaluation, buildCanonicalRecommendationResult, CORE_SCORE_KEYS, buildCanonicalPaperEvaluations, formatEvidenceForUser, formatStrengthForUser, formatCanonicalMetricClaim, rankCanonicalPapers } from "../src/utils/paperSemantics.js";
import { generateReportMarkdown } from "../src/utils/markdownGenerator.js";
import { mergeDocumentAnalysisWithBriefing, mergeEvaluationWithBriefing, mergeMetadataWithBriefing, mergeResourcesWithBriefing } from "../server/pipeline/briefingEvidence.js";

const emptyEvidence = { paperText: [], externalSource: [], aiInterpretation: [] };
const dim = (score: number | null, reason = "근거 확인", status: any = score === null ? "INSUFFICIENT_EVIDENCE" : "SCORED") => ({
  score,
  status,
  reason,
  scope: "QUALITATIVE_ONLY" as const,
  evidence: emptyEvidence,
});

function paper(overrides: Partial<PaperCandidate>): PaperCandidate {
  const base: PaperCandidate = {
    id: "p1",
    title: "Sample Paper",
    authors: ["A. Author"],
    year: 2026,
    venueOrPreprint: "arXiv preprint",
    doi: null,
    arxivId: "2601.12345",
    biorxivId: null,
    url: "https://arxiv.org/abs/2601.12345",
    publicationStatus: "PREPRINT",
    bibliographicStatus: "VERIFIED",
    performanceEvidenceStatus: "PARTIAL",
    evaluationStatus: "PARTIAL",
    crossVerificationStatus: "VERIFIED",
    rawMention: "Sample Paper",
    entityType: "PAPER",
    canonicalTitle: "Sample Paper",
    identityStatus: "IDENTITY_VERIFIED",
    isRankingEligible: true,
    matchConfidence: 0.95,
    matchReason: "서지 확인 완료",
    scoredDimensions: 4,
    totalDimensions: 5,
    evaluationCoverage: 80,
    codeStatus: "REPOSITORY_FOUND",
    codeUrl: "https://github.com/example/repo",
    codeAvailable: true,
    dataStatus: "PUBLIC_BENCHMARK_USED",
    dataUrl: null,
    dataAvailable: true,
    reproducibilityStatus: "PARTIALLY_REPRODUCIBLE",
    reproducibilityAssessment: {
      codeStatus: "REPOSITORY_FOUND",
      dataStatus: "PUBLIC_BENCHMARK_USED",
      checkpointStatus: "NOT_FOUND",
      documentationStatus: "MEDIUM",
      executionVerification: "NOT_PERFORMED",
      level: "PARTIALLY_REPRODUCIBLE",
      score: 3,
      reason: "코드 저장소는 확인되었으나 학습 설정과 데이터 준비 절차는 추가 확인이 필요합니다.",
    },
    scores: {
      topicRelevance: dim(5, "브리핑 주제와 직접 관련"),
      methodNovelty: dim(4, "방법론 신규성 확인"),
      researchValue: dim(4, "연구 가치 확인"),
      academicReliability: dim(3, "Preprint라 동료심사 여부는 별도 확인"),
      performance: dim(null, "성능 근거 추가 확인 필요"),
      novelty: dim(4),
      trendImportance: dim(5),
      academicSignificance: dim(3),
      practicalValue: dim(4),
      reproducibility: dim(null, "재현 절차 추가 확인 필요"),
    },
    publishingReliabilityScore: null,
    publishingReliabilityDetails: { peerReviewed: false, isPreprint: true, scoreReason: "Preprint" },
    recencyScore: 5,
    recencyNotes: "2026 preprint",
    comparisonModule: { directComparisonStudies: [], nearTaskComparisonStudies: [], contextualRelatedStudies: [], representativePriorStudies: [], sotaStatus: "부분 확인", summary: "Results table 확인" },
    uncertainty: { factVerificationItems: [], insufficientEvidenceItems: [], researchOpenQuestions: [] },
    verificationNeededItems: [],
  };
  return { ...base, ...overrides, scores: { ...base.scores, ...(overrides.scores as any || {}) } };
}

describe("Semantic consistency regression tests", () => {
  it("Case 1/2: distinguishes arXiv-only preprints from peer-reviewed papers", () => {
    expect(normalizePublicationStatus({ venueOrPreprint: "arXiv, cs.CV", arxivId: "2601.12345", peerReviewed: true })).toBe("PREPRINT");
    expect(labelPublicationStatus("PREPRINT")).toBe("Preprint");
    expect(normalizePublicationStatus({ venueOrPreprint: "CVPR 2026", peerReviewed: true })).toBe("PEER_REVIEWED");
    expect(labelPublicationStatus("PEER_REVIEWED")).toBe("동료심사 완료");
  });

  it("Case 3/8: separates bibliographic verification from code and benchmark dataset status", () => {
    const p = paper({ bibliographicStatus: "VERIFIED", codeStatus: "UNKNOWN", dataStatus: "PUBLIC_BENCHMARK_USED", dataUrl: null });
    expect(p.bibliographicStatus).toBe("VERIFIED");
    expect(p.codeStatus).toBe("UNKNOWN");
    expect(p.dataStatus).toBe("PUBLIC_BENCHMARK_USED");
    expect(p.dataStatus).not.toBe("NOT_APPLICABLE");
  });

  it("Case 4: missing axes are N/A/null, not zero, and averages use valid axes only", () => {
    const p = paper({ scores: { reproducibility: dim(null), topicRelevance: dim(5), methodNovelty: dim(4), researchValue: dim(3), academicReliability: dim(null) } as any });
    const coverage = computePaperEvaluationCoverage(p);
    const status = getPaperEvaluationStatus(p);
    expect(p.scores.reproducibility.score).toBeNull();
    expect(coverage.scoredDimensions).toBe(3);
    expect(status.overallScore).toBe(4);
    expect(status.label).toBe("부분 평가");
  });

  it("Case 5/6/7: report shows recommendation reversal, results evidence, and no broken Korean encoding", () => {
    const high = paper({ id: "high", title: "High Score Paper", scores: { topicRelevance: dim(3), methodNovelty: dim(5), researchValue: dim(5), academicReliability: dim(5), reproducibility: dim(5) } as any });
    const rec = paper({ id: "rec", title: "Topic Matched Paper", scores: { topicRelevance: dim(5), methodNovelty: dim(4), researchValue: dim(4), academicReliability: dim(3), reproducibility: dim(3), performance: { ...dim(4), evidence: { paperText: [{ evidenceType: "PAPER", sourceTitle: "논문 원문", sourceLocation: "Table 2", claim: "Table 2 reports benchmark gains", verificationStatus: "DIRECTLY_VERIFIED" }], externalSource: [], aiInterpretation: [] } } } as any });
    const data: BriefingAnalysisResponse = {
      briefingTitle: "한글 브리핑",
      extraction: { extractedPaperCount: 2, datasetCount: 0, githubToolCount: 0, datasets: [], githubTools: [], researchTrends: ["self-supervised visual representation learning"], excludedItems: [], uncertaintySummary: { factVerificationCount: 0, insufficientEvidenceCount: 0, researchOpenQuestionCount: 0 } },
      candidates: [high, rec],
      aiRecommendation: {
        topRecommendedPaperId: "rec",
        overallAcademicLeaderPaperId: "high",
        weeklyTopicLeaderPaperId: "rec",
        recommendationConfidence: "MEDIUM",
        recommendationReason: "Topic Matched Paper가 이번 주 주제와 더 직접적으로 연결됩니다.",
        tradeoffExplanation: "High Score Paper가 종합 평점은 가장 높지만 Topic Matched Paper가 이번 브리핑의 핵심 주제와 직접 맞닿아 있습니다.",
        keyRecommendationEvidence: [],
        consideredUncertainties: [],
        sotaStatus: "부분 확인",
        hasDirectComparisonStudies: false,
        keyItemsToVerifyWhileReading: [],
        positionInRecentTrend: "주제 직접 연결",
        keyStrengths: ["주제 적합도 높음"],
        keyLimitationsOrRisks: ["성능 근거 추가 확인 필요"],
        readingQuestions: ["Table 2의 benchmark gain은 어떤 baseline 대비 개선인가?"],
        followUpResearchQuestions: [],
        scoresUsed: ["주제 적합도"],
        scoresExcluded: [],
        performanceEvidenceUsed: true,
      },
    };
    const md = generateReportMarkdown(data, {}, "rec");
    expect(md).toContain("추천 역전 사유");
    expect(md).toContain("Table 2 reports benchmark gains");
    expect(md).not.toContain("�");
    expect(md).not.toContain("?먮");
    expect(containsBrokenEncoding(md)).toBe(false);
  });
  it("Canonical Test 1/2/8/10: section values share one publication, score, status, and five-axis source", () => {
    const p = paper({ publicationStatus: "PUBLISHED", venueOrPreprint: "arXiv, cs.CV", arxivId: "2601.12345", publishingReliabilityDetails: { peerReviewed: true, isPreprint: true, scoreReason: "arXiv only" } });
    const canonical = buildCanonicalPaperEvaluation(p);
    const candidatePublication = canonical.labels.publicationStatus;
    const detailPublication = canonical.labels.publicationStatus;
    const tablePublication = canonical.labels.publicationStatus;
    const markdownPublication = canonical.labels.publicationStatus;

    expect(canonical.verification.publicationStatus).toBe("PREPRINT");
    expect([candidatePublication, detailPublication, tablePublication, markdownPublication]).toEqual(["Preprint", "Preprint", "Preprint", "Preprint"]);
    expect(canonical.evaluation.topicRelevance).toBe(5);
    expect(canonical.labels.scoreDisplay).toBe(`${canonical.evaluation.overallScore?.toFixed(1)} / 5.0`);
    expect(CORE_SCORE_KEYS).toEqual(["topicRelevance", "methodNovelty", "researchValue", "academicReliability", "reproducibility"]);
  });

  it("Canonical Test 3/4/10: evaluation status is separate from verification, data, and performance status", () => {
    const p = paper({
      evaluationStatus: "FULL",
      dataStatus: "UNKNOWN",
      bibliographicStatus: "VERIFIED",
      performanceEvidenceStatus: "PARTIAL",
      scores: {
        topicRelevance: dim(5),
        methodNovelty: dim(4),
        researchValue: dim(4),
        academicReliability: dim(4),
        reproducibility: dim(3),
      } as any,
    });
    const canonical = buildCanonicalPaperEvaluation(p);
    expect(canonical.labels.evaluationStatus).toBe("5/5 평가 완료");
    expect(canonical.labels.dataStatus).toBe("데이터 상태 확인 필요");
    expect(canonical.labels.bibliographicStatus).toBe("서지 확인 완료");
    expect(canonical.labels.performanceEvidenceStatus).toBe("성능 근거 부분 확인");
  });

  it("Canonical Test 5/8: recommendation tradeoff uses the same canonical source as Markdown", () => {
    const high = paper({ id: "high", title: "Highest", scores: { topicRelevance: dim(3), methodNovelty: dim(5), researchValue: dim(5), academicReliability: dim(5), reproducibility: dim(5) } as any });
    const rec = paper({ id: "rec", title: "Recommended", scores: { topicRelevance: dim(5), methodNovelty: dim(4), researchValue: dim(4), academicReliability: dim(3), reproducibility: dim(3) } as any });
    const aiRecommendation = {
      topRecommendedPaperId: "rec",
      recommendationReason: "Recommended가 브리핑 주제에 직접 연결됩니다.",
      tradeoffExplanation: "Highest가 종합 평점은 가장 높지만 Recommended가 이번 주 핵심 주제와 더 직접적으로 연결됩니다.",
      keyRecommendationEvidence: [],
      consideredUncertainties: [],
      sotaStatus: "부분 확인",
      hasDirectComparisonStudies: false,
      keyItemsToVerifyWhileReading: [],
      positionInRecentTrend: "주제 직접 연결",
      keyStrengths: ["주제 적합도 높음"],
      keyLimitationsOrRisks: [],
      readingQuestions: [],
      followUpResearchQuestions: [],
      performanceEvidenceUsed: false,
    };
    const canonicalRec = buildCanonicalRecommendationResult([high, rec], aiRecommendation as any);
    const data: BriefingAnalysisResponse = {
      briefingTitle: "정합성 테스트",
      extraction: { extractedPaperCount: 2, datasetCount: 0, githubToolCount: 0, datasets: [], githubTools: [], researchTrends: [], excludedItems: [], uncertaintySummary: { factVerificationCount: 0, insufficientEvidenceCount: 0, researchOpenQuestionCount: 0 } },
      candidates: [high, rec],
      aiRecommendation: aiRecommendation as any,
    };
    const md = generateReportMarkdown(data, {}, "rec");
    expect(canonicalRec.highestScoringPaperId).toBe("high");
    expect(canonicalRec.recommendedPaperId).toBe("rec");
    expect(canonicalRec.tradeoffExplanation).toBe(aiRecommendation.tradeoffExplanation);
    expect(md).toContain(aiRecommendation.tradeoffExplanation);
  });

  it("Canonical Test 6/7/9: uncertainty is hygienic, questions are grounded, and table evidence prevents false negative", () => {
    const p = paper({
      uncertainty: {
        factVerificationItems: ["코드 공개 확인 완료", "공식 데이터셋 URL 추가 확인 필요"],
        insufficientEvidenceItems: ["다른 지역 일반화 실험 근거 부족"],
        researchOpenQuestions: ["낮은 유병률 조건에서 coverage가 유지되는가?"],
      },
      scores: {
        methodNovelty: dim(4, "Permutation entropy를 forecasting window 선택에 활용합니다."),
        performance: {
          ...dim(null, "Table 1 reports WIS 0.42 vs baseline 0.51."),
          evidence: {
            paperText: [{ evidenceType: "PAPER", sourceTitle: "논문 원문", sourceLocation: "Table 1", claim: "WIS 0.42 vs baseline 0.51", verificationStatus: "DIRECTLY_VERIFIED" }],
            externalSource: [],
            aiInterpretation: [],
          },
        },
      } as any,
      performanceEvidenceStatus: undefined,
    });
    const canonical = buildCanonicalPaperEvaluation(p);
    expect(canonical.uncertainty.factVerification).toEqual(["공식 데이터셋 URL 추가 확인 필요"]);
    expect(canonical.readingGuide.questions.some((q) => q.includes("Permutation entropy"))).toBe(true);
    expect(canonical.verification.performanceEvidenceStatus).not.toBe("NOT_VERIFIED");
    expect(canonical.evidence.performanceEvidence.some((item) => item.claim.includes("WIS 0.42"))).toBe(true);
  });
  it("Claim Test 1/3/4/8: verified quantitative claim is consistent, metric-preserving, and not listed as unverified", () => {
    const coverageEvidence = {
      evidenceType: "PAPER" as const,
      sourceTitle: "EpiFlow paper",
      sourceLocation: "Table 2",
      claim: "wastewater signal incorporation improves forecast coverage by approximately 20 percentage points over baseline",
      verificationStatus: "DIRECTLY_VERIFIED" as const,
    };
    const p = paper({
      id: "epiflow",
      title: "EpiFlow",
      uncertainty: {
        factVerificationItems: [coverageEvidence.claim, "공식 데이터셋 URL 추가 확인 필요"],
        insufficientEvidenceItems: [],
        researchOpenQuestions: [],
      },
      scores: {
        performance: { ...dim(4, coverageEvidence.claim), evidence: { paperText: [coverageEvidence], externalSource: [], aiInterpretation: [] } },
        researchValue: { ...dim(4, "forecast coverage 개선 claim에 기반"), evidence: { paperText: [coverageEvidence], externalSource: [], aiInterpretation: [] } },
      } as any,
    });
    const canonical = buildCanonicalPaperEvaluation(p);
    const claim = canonical.evidenceClaims.find((item) => item.claim.includes("forecast coverage") && item.metric);
    const md = generateReportMarkdown({
      briefingTitle: "Claim parity",
      extraction: { extractedPaperCount: 1, datasetCount: 0, githubToolCount: 0, datasets: [], githubTools: [], researchTrends: [], excludedItems: [], uncertaintySummary: { factVerificationCount: 0, insufficientEvidenceCount: 0, researchOpenQuestionCount: 0 } },
      candidates: [p],
      aiRecommendation: { topRecommendedPaperId: "epiflow", recommendationReason: "주제 적합도", keyRecommendationEvidence: [], consideredUncertainties: [], sotaStatus: "부분 확인", hasDirectComparisonStudies: false, keyItemsToVerifyWhileReading: [], positionInRecentTrend: "직접 관련", keyStrengths: [], keyLimitationsOrRisks: [], readingQuestions: [], followUpResearchQuestions: [], performanceEvidenceUsed: true },
    }, {}, "epiflow");

    expect(claim?.verificationStatus).toBe("VERIFIED");
    expect(claim?.usableForScoring).toBe(true);
    expect(claim?.metric?.name).toMatch(/forecast coverage/i);
    expect(claim?.metric?.unit).toMatch(/percentage points/i);
    expect(canonical.uncertainty.factVerification).not.toContain(coverageEvidence.claim);
    expect(md).toContain("forecast coverage");
    expect(md).toContain("20 percentage points");
    expect(md).not.toMatch(/accuracy 20%|정확도 20%|F1 20%/i);
    expect(md).not.toContain("Quantitative Results: N/A");
  });

  it("Claim Test 2/5: briefing-only quantitative claim is unverified and prohibited from scoring", () => {
    const p = paper({
      id: "incidence",
      title: "Incidence-weighted Forecasting",
      uncertainty: {
        factVerificationItems: ["top-10 hit rate 약 42.6%"],
        insufficientEvidenceItems: [],
        researchOpenQuestions: [],
      },
      scores: {
        performance: dim(null, "현재 확보된 원문 범위에서는 top-10 hit rate 수치를 직접 확인하지 못했습니다."),
        researchValue: dim(null, "브리핑 수치만으로는 점수 산정 제외"),
      } as any,
    });
    const canonical = buildCanonicalPaperEvaluation(p);
    const claim = canonical.evidenceClaims.find((item) => item.claim.includes("42.6"));
    expect(claim?.verificationStatus).toBe("UNVERIFIED");
    expect(claim?.usableForScoring).toBe(false);
    expect(canonical.readingGuide.preReadingChecks.join("\n")).toContain("브리핑에서");
    expect(canonical.readingGuide.preReadingChecks.join("\\n")).toMatch(/\uC6D0\uBB38 \uD655\uC778|\uC9C1\uC811 \uD655\uC778/);
    expect(canonical.evaluation.evidenceClaimIds.researchValue || []).toEqual([]);
  });

  it("Claim Test 6: summary counts are derived from canonical publication and resource status", () => {
    const papers = [
      paper({ id: "p1", publicationStatus: "PUBLISHED", venueOrPreprint: "arXiv", arxivId: "2601.1", publishingReliabilityDetails: { peerReviewed: true, isPreprint: true, scoreReason: "arXiv" }, codeStatus: "CODE_AVAILABLE_VERIFIED", dataStatus: "PUBLIC_DATASET_VERIFIED" }),
      paper({ id: "p2", publicationStatus: "PREPRINT", venueOrPreprint: "arXiv", arxivId: "2601.2" }),
      paper({ id: "p3", publicationStatus: "PREPRINT", venueOrPreprint: "bioRxiv", biorxivId: "2026.01.01" }),
    ];
    const canonical = buildCanonicalPaperEvaluations(papers);
    expect(canonical.filter((p) => p.verification.publicationStatus === "PREPRINT")).toHaveLength(3);
    expect(canonical.filter((p) => p.verification.publicationStatus === "PEER_REVIEWED")).toHaveLength(0);
    expect(canonical.filter((p) => p.verification.codeStatus === "CODE_AVAILABLE_VERIFIED")).toHaveLength(1);
    expect(canonical.filter((p) => p.verification.dataStatus === "PUBLIC_DATASET_VERIFIED")).toHaveLength(1);
  });

  it("Claim Test 7/9: non-null axes are traceable and canonical user-facing text is sanitized", () => {
    const p = paper({
      scores: {
        topicRelevance: dim(5, "?먮 깨진 텍스트"),
        methodNovelty: dim(4, "Permutation entropy method"),
      } as any,
      uncertainty: {
        factVerificationItems: ["?먮 깨진 미검증 항목", "공식 코드 URL 추가 확인 필요"],
        insufficientEvidenceItems: [],
        researchOpenQuestions: [],
      },
    });
    const canonical = buildCanonicalPaperEvaluation(p);
    const userFacingCanonical = JSON.stringify({ labels: canonical.labels, interpretation: canonical.interpretation, uncertainty: canonical.uncertainty, readingGuide: canonical.readingGuide, evidenceClaims: canonical.evidenceClaims });
    expect(userFacingCanonical).not.toContain("?먮");
    expect(userFacingCanonical).not.toContain("�");
    for (const key of CORE_SCORE_KEYS) {
      if (canonical.evaluation[key] !== null) {
        expect((canonical.evaluation.evidenceClaimIds[key]?.length || 0) > 0 || Boolean(canonical.interpretation.evaluationRationales[key])).toBe(true);
      }
    }
  });
  it("Final P0 Test 1/2/3: years, conference years, and zero counts are not quantitative metrics", () => {
    const evidenceItems = [
      { evidenceType: "PAPER" as const, sourceTitle: "Paper", sourceLocation: "Abstract", claim: "2026 Bundibugyo virus outbreak", verificationStatus: "DIRECTLY_VERIFIED" as const },
      { evidenceType: "PAPER" as const, sourceTitle: "Paper", sourceLocation: "Venue", claim: "KDD '26", verificationStatus: "DIRECTLY_VERIFIED" as const },
      { evidenceType: "AI_INTERPRETATION" as const, sourceTitle: "AI", sourceLocation: "Comparison", claim: "Direct Comparisons: 0", verificationStatus: "PARTIALLY_VERIFIED" as const },
      { evidenceType: "PAPER" as const, sourceTitle: "Paper", sourceLocation: "Table 3", claim: "Table 3", verificationStatus: "DIRECTLY_VERIFIED" as const },
      { evidenceType: "PAPER" as const, sourceTitle: "Paper", sourceLocation: "Data", claim: "5 datasets", verificationStatus: "DIRECTLY_VERIFIED" as const },
    ];
    const p = paper({
      scores: {
        performance: { ...dim(null), evidence: { paperText: evidenceItems.filter((e) => e.evidenceType === "PAPER") as any, externalSource: [], aiInterpretation: evidenceItems.filter((e) => e.evidenceType === "AI_INTERPRETATION") as any } },
      } as any,
    });
    const canonical = buildCanonicalPaperEvaluation(p);
    expect(canonical.evidenceClaims.filter((claim) => claim.type === "QUANTITATIVE_RESULT" && claim.metric)).toHaveLength(0);
    expect(canonical.evidenceClaims.map((claim) => claim.metric?.value).filter(Boolean)).not.toEqual(expect.arrayContaining(["2026", "26", "0"]));
  });

  it("Final P0 Test 4/5: valid metric is recognized and semantic wording is preserved", () => {
    const evidence = { evidenceType: "PAPER" as const, sourceTitle: "Paper", sourceLocation: "Results", claim: "forecast coverage improved by 20 percentage points over baseline", verificationStatus: "DIRECTLY_VERIFIED" as const };
    const p = paper({ scores: { performance: { ...dim(4, evidence.claim), evidence: { paperText: [evidence], externalSource: [], aiInterpretation: [] } } } as any });
    const canonical = buildCanonicalPaperEvaluation(p);
    const claim = canonical.evidenceClaims.find((item) => item.claim.includes("forecast coverage") && item.metric);
    const md = generateReportMarkdown({
      briefingTitle: "Metric preservation",
      extraction: { extractedPaperCount: 1, datasetCount: 0, githubToolCount: 0, datasets: [], githubTools: [], researchTrends: [], excludedItems: [], uncertaintySummary: { factVerificationCount: 0, insufficientEvidenceCount: 0, researchOpenQuestionCount: 0 } },
      candidates: [p],
      aiRecommendation: { topRecommendedPaperId: "p1", recommendationReason: "forecast coverage 근거 확인", keyRecommendationEvidence: [], consideredUncertainties: [], sotaStatus: "부분 확인", hasDirectComparisonStudies: false, keyItemsToVerifyWhileReading: [], positionInRecentTrend: "직접 관련", keyStrengths: [], keyLimitationsOrRisks: [], readingQuestions: [], followUpResearchQuestions: [], performanceEvidenceUsed: true },
    }, {}, "p1");
    expect(claim?.type).toBe("QUANTITATIVE_RESULT");
    expect(claim?.metric?.name).toBe("forecast coverage");
    expect(claim?.metric?.value).toBe("20");
    expect(claim?.metric?.unit).toBe("percentage points");
    expect(md).toContain("forecast coverage");
    expect(md).toContain("20 percentage points");
    expect(md).not.toMatch(/accuracy 20%|정확도 20%|F1 20%/i);
  });

  it("Final P0 Test 6: absence of quantitative result is not listed as quantitative evidence", () => {
    const evidence = { evidenceType: "PAPER" as const, sourceTitle: "Paper", sourceLocation: "Results", claim: "No quantitative results were reported.", verificationStatus: "DIRECTLY_VERIFIED" as const };
    const p = paper({ scores: { performance: { ...dim(null, evidence.claim), evidence: { paperText: [evidence], externalSource: [], aiInterpretation: [] } } } as any });
    const canonical = buildCanonicalPaperEvaluation(p);
    expect(canonical.evidenceClaims.some((claim) => claim.type === "ABSENCE_OF_QUANTITATIVE_RESULT")).toBe(true);
    expect(canonical.evidenceClaims.filter((claim) => claim.type === "QUANTITATIVE_RESULT" && claim.metric)).toHaveLength(0);
    const md = generateReportMarkdown({
      briefingTitle: "Absence",
      extraction: { extractedPaperCount: 1, datasetCount: 0, githubToolCount: 0, datasets: [], githubTools: [], researchTrends: [], excludedItems: [], uncertaintySummary: { factVerificationCount: 0, insufficientEvidenceCount: 0, researchOpenQuestionCount: 0 } },
      candidates: [p],
      aiRecommendation: { topRecommendedPaperId: "p1", recommendationReason: "정량 결과 원문 확인 필요", keyRecommendationEvidence: [], consideredUncertainties: [], sotaStatus: "부분 확인", hasDirectComparisonStudies: false, keyItemsToVerifyWhileReading: [], positionInRecentTrend: "직접 관련", keyStrengths: [], keyLimitationsOrRisks: [], readingQuestions: [], followUpResearchQuestions: [], performanceEvidenceUsed: false },
    }, {}, "p1");
    expect(md).toContain("직접적인 정량 비교 결과를 확인하지 못했습니다");
    expect(md).not.toContain("검증됨 (quantitative metric");
  });

  it("Final P0 Test 7/8: unsupported score is nulled, but low score with verified method evidence is preserved", () => {
    const unsupported = paper({ scores: { methodNovelty: dim(4, "세부 방법론 기술 부재로 원문 확인 필요") } as any });
    const unsupportedCanonical = buildCanonicalPaperEvaluation(unsupported);
    expect(unsupportedCanonical.evaluation.methodNovelty).toBeNull();

    const methodEvidence = { evidenceType: "PAPER" as const, sourceTitle: "Paper", sourceLocation: "Method", claim: "Method section describes a standard linear baseline architecture", verificationStatus: "DIRECTLY_VERIFIED" as const };
    const supportedLow = paper({ scores: { methodNovelty: { ...dim(2, "방법론을 확인했으나 기존 접근과 차이가 제한적입니다."), evidence: { paperText: [methodEvidence], externalSource: [], aiInterpretation: [] } } } as any });
    const supportedCanonical = buildCanonicalPaperEvaluation(supportedLow);
    expect(supportedCanonical.evaluation.methodNovelty).toBe(2);
    expect(supportedCanonical.evaluation.evidenceClaimIds.methodNovelty?.length).toBeGreaterThan(0);
  });

  it("Final P1 Test 9/10: presentation formatter hides raw enums and keeps Korean reading note text", () => {
    expect(formatEvidenceForUser("Code Status: CODE_AVAILABLE_VERIFIED")).toBe("코드 상태: 코드 공개 확인");
    expect(formatEvidenceForUser("Quantitative Results: N/A")).toContain("정량 결과 원문 확인 필요");
    const formatted = formatStrengthForUser("KDD에서 peer-reviewed preprint로 accepted paper입니다.", "PREPRINT");
    expect(formatted).not.toMatch(/peer-reviewed|accepted paper|동료심사 완료/);
    expect(formatted).toContain("Preprint로 공개된 연구");

    const p = paper({ codeStatus: "CODE_AVAILABLE_VERIFIED", scores: { methodNovelty: dim(null, "Method: N/A"), performance: dim(null, "Quantitative Results: N/A") } as any });
    const canonical = buildCanonicalPaperEvaluation(p);
    const noteText = [...canonical.interpretation.strengths, ...canonical.readingGuide.questions, ...canonical.readingGuide.preReadingChecks].join("\n");
    expect(noteText).not.toMatch(/CODE_AVAILABLE_VERIFIED|NOT_FOUND_AFTER_RETRIES|PUBLIC_DATASET_VERIFIED|Quantitative Results:\s*N\/A|Method:\s*N\/A/);
    expect(noteText).toMatch(/[가-힣]/);
  });
  it("Presentation Cleanup 1: canonical metric wording is preserved downstream", () => {
    const evidence = { evidenceType: "PAPER" as const, sourceTitle: "Paper", sourceLocation: "Results", claim: "forecast coverage improved by 20 percentage points over baseline", verificationStatus: "DIRECTLY_VERIFIED" as const };
    const p = paper({ scores: { performance: { ...dim(4, evidence.claim), evidence: { paperText: [evidence], externalSource: [], aiInterpretation: [] } } } as any });
    const canonical = buildCanonicalPaperEvaluation(p);
    const claim = canonical.evidenceClaims.find((item) => item.metric?.name === "forecast coverage");
    const downstream = [
      claim ? formatCanonicalMetricClaim(claim) : "",
      ...canonical.interpretation.strengths,
      ...canonical.readingGuide.questions,
      generateReportMarkdown({
        briefingTitle: "Metric downstream",
        extraction: { extractedPaperCount: 1, datasetCount: 0, githubToolCount: 0, datasets: [], githubTools: [], researchTrends: [], excludedItems: [], uncertaintySummary: { factVerificationCount: 0, insufficientEvidenceCount: 0, researchOpenQuestionCount: 0 } },
        candidates: [p],
        aiRecommendation: { topRecommendedPaperId: "p1", recommendationReason: "forecast coverage 근거 확인", keyRecommendationEvidence: [], consideredUncertainties: [], sotaStatus: "부분 확인", hasDirectComparisonStudies: false, keyItemsToVerifyWhileReading: [], positionInRecentTrend: "직접 관련", keyStrengths: [], keyLimitationsOrRisks: [], readingQuestions: [], followUpResearchQuestions: [], performanceEvidenceUsed: true },
      }, {}, "p1"),
    ].join("\n");
    expect(downstream).toContain("forecast coverage");
    expect(downstream).toContain("20 percentage points");
    expect(downstream).not.toMatch(/accuracy\s*20|정확도\s*20|F1\s*20/i);
  });

  it("Presentation Cleanup 2/7: negative or unknown states are not strengths", () => {
    const p = paper({
      dataStatus: "UNKNOWN",
      dataAvailable: false,
      dataUrl: null,
      uncertainty: { factVerificationItems: ["공식 데이터 공개 여부를 확인하지 못했습니다."], insufficientEvidenceItems: [], researchOpenQuestions: [] },
      scores: { researchValue: dim(4, "데이터 확인되지 않음") } as any,
    });
    const canonical = buildCanonicalPaperEvaluation(p);
    expect(canonical.interpretation.strengths.join("\n")).not.toMatch(/데이터.*확인되지 않음|데이터 상태: 확인 필요|미공개|추가 확인/);
    expect(canonical.readingGuide.preReadingChecks.join("\n")).toContain("공식 데이터 공개 여부를 확인하지 못했습니다");
  });

  it("Presentation Cleanup 3: evidence limitation is classified as insufficientEvidence, not factVerification", () => {
    const p = paper({
      uncertainty: {
        factVerificationItems: ["No external validation available", "Performance improvement claim is supported by internal quantitative results without external benchmark comparison."],
        insufficientEvidenceItems: [],
        researchOpenQuestions: [],
      },
    });
    const canonical = buildCanonicalPaperEvaluation(p);
    expect(canonical.uncertainty.factVerification).toEqual([]);
    expect(canonical.uncertainty.insufficientEvidence.join("\n")).toContain("독립적인 외부 검증 결과가 아직 확인되지 않았습니다");
    expect(canonical.uncertainty.insufficientEvidence.join("\n")).toContain("외부 benchmark와의 직접 비교 근거는 제한적입니다");
  });

  it("Presentation Cleanup 4: reading questions avoid full paper title and generic title-as-subject phrasing", () => {
    const longTitle = "A framework for improving the utility of wastewater signals for disease forecasting";
    const p = paper({
      title: longTitle,
      scores: {
        methodNovelty: dim(4, "EpiFlow preprocesses wastewater viral-load signals for forecasting."),
      } as any,
    });
    const canonical = buildCanonicalPaperEvaluation(p);
    expect(canonical.readingGuide.questions).toHaveLength(3);
    expect(canonical.readingGuide.questions.join("\n")).not.toContain(longTitle);
    expect(canonical.readingGuide.questions[0]).toMatch(/EpiFlow|폐수 바이러스 부하 신호|제안 방법/);
  });

  it("Presentation Cleanup 5: known English user-facing sentences are Koreanized", () => {
    const p = paper({
      uncertainty: {
        factVerificationItems: ["No external validation or peer-review confirmation yet."],
        insufficientEvidenceItems: [],
        researchOpenQuestions: ["How generalizable is the EpiFlow framework to other diseases or geographic regions?"],
      },
    });
    const canonical = buildCanonicalPaperEvaluation(p);
    const output = [...canonical.uncertainty.insufficientEvidence, ...canonical.uncertainty.openQuestions, ...canonical.readingGuide.questions].join("\n");
    expect(output).toContain("독립적인 외부 검증 결과와 동료심사 결과는 아직 확인되지 않았습니다");
    expect(output).toContain("EpiFlow가 다른 질병이나 지역에서도 동일한 효과를 보이는지 확인할 필요가 있습니다");
    expect(output).not.toMatch(/No external validation|How generalizable/i);
  });

  it("Presentation Cleanup 6: unknown is not stated as absent", () => {
    expect(formatEvidenceForUser("Quantitative Results: N/A")).toContain("정량 결과 원문 확인 필요");
    expect(formatEvidenceForUser("정량 결과 부재")).toContain("현재 확보된 원문 범위에서는 정량 결과를 확인하지 못했습니다");
    expect(formatEvidenceForUser("방법론 설명 부재")).toContain("현재 확보된 원문 범위에서는 방법론 설명을 확인하지 못했습니다");
  });

  it("Final Consistency 1/2/6: tied scores share canonical ranking in helper and Markdown", () => {
    const realTime = paper({
      id: "real-time",
      title: "Real-time Estimation",
      scores: {
        topicRelevance: dim(4),
        methodNovelty: dim(4),
        researchValue: dim(4),
        academicReliability: dim(4),
        reproducibility: dim(4),
      } as any,
    });
    const epiflow = paper({
      id: "epiflow",
      title: "EpiFlow",
      scores: {
        topicRelevance: dim(5),
        methodNovelty: dim(4),
        researchValue: dim(4),
        academicReliability: dim(3),
        reproducibility: dim(null),
      } as any,
    });
    const leakage = paper({
      id: "leakage",
      title: "Information Leakage",
      scores: {
        topicRelevance: dim(5),
        methodNovelty: dim(4),
        researchValue: dim(4),
        academicReliability: dim(3),
        reproducibility: dim(null),
      } as any,
    });
    const candidates = [realTime, epiflow, leakage];
    const recommendation = {
      topRecommendedPaperId: "epiflow",
      recommendationReason: "EpiFlow가 이번 주 주제와 직접 연결됩니다.",
      tradeoffExplanation: null,
      keyRecommendationEvidence: [],
      consideredUncertainties: [],
      sotaStatus: "부분 확인",
      hasDirectComparisonStudies: false,
      keyItemsToVerifyWhileReading: [],
      positionInRecentTrend: "직접 관련",
      keyStrengths: [],
      keyLimitationsOrRisks: [],
      readingQuestions: [],
      followUpResearchQuestions: [],
      performanceEvidenceUsed: false,
    };
    const ranking = rankCanonicalPapers(candidates, recommendation as any);
    expect(ranking).toHaveLength(3);
    expect(ranking.every((entry) => entry.rank === 1 && entry.rankLabel === "공동 1위")).toBe(true);
    expect(new Set(ranking.map((entry) => entry.paperId))).toEqual(new Set(["real-time", "epiflow", "leakage"]));

    const md = generateReportMarkdown({
      briefingTitle: "Ranking parity",
      extraction: { extractedPaperCount: 3, datasetCount: 0, githubToolCount: 0, datasets: [], githubTools: [], researchTrends: [], excludedItems: [], uncertaintySummary: { factVerificationCount: 0, insufficientEvidenceCount: 0, researchOpenQuestionCount: 0 } },
      candidates,
      aiRecommendation: recommendation as any,
    }, {}, "epiflow");

    expect(md).toContain("공동 최고점 3편");
    expect(md).toContain("Real-time Estimation (4.0 / 5.0 · 5/5 평가 완료)");
    expect(md).toContain("EpiFlow (4.0 / 5.0 · 4/5 부분 평가)");
    expect(md).toContain("Information Leakage (4.0 / 5.0 · 4/5 부분 평가)");
    expect(md).toContain("AI 우선 추천");
    expect(md).toContain("EpiFlow");
  });

  it("Final Consistency 3/4: target paper reading guide does not use claims from another paper", () => {
    const epiflowMethod = { evidenceType: "PAPER" as const, sourceTitle: "EpiFlow", sourceLocation: "Method", claim: "EpiFlow preprocesses wastewater viral-load signals for forecasting", verificationStatus: "DIRECTLY_VERIFIED" as const };
    const epiflow = paper({
      id: "epiflow",
      title: "EpiFlow",
      scores: { methodNovelty: { ...dim(4, epiflowMethod.claim), evidence: { paperText: [epiflowMethod], externalSource: [], aiInterpretation: [] } } } as any,
    });
    const leakage = paper({
      id: "leakage",
      title: "Information Leakage",
      scores: { methodNovelty: dim(4, "data revision leakage is defined and mitigated") } as any,
    });
    const recommendation = {
      topRecommendedPaperId: "epiflow",
      recommendationReason: "데이터 리비전 누수, 공간적 위험 순위화, 행동 시뮬레이션을 융합합니다.",
      tradeoffExplanation: null,
      keyRecommendationEvidence: [],
      consideredUncertainties: [],
      sotaStatus: "부분 확인",
      hasDirectComparisonStudies: false,
      keyItemsToVerifyWhileReading: [],
      positionInRecentTrend: "후보 전체 흐름",
      keyStrengths: [],
      keyLimitationsOrRisks: [],
      readingQuestions: ["데이터 리비전 누수 문제는 어떻게 정의되고 대응되는가?", "How is data revision leakage handled?"],
      followUpResearchQuestions: [],
      performanceEvidenceUsed: false,
    };
    const canonical = buildCanonicalPaperEvaluation(epiflow, recommendation as any);
    const targetOutput = [...canonical.interpretation.strengths, ...canonical.readingGuide.questions].join("\n");
    expect(targetOutput).not.toMatch(/data revision leakage|데이터 리비전 누수/i);

    const md = generateReportMarkdown({
      briefingTitle: "Paper isolation",
      extraction: { extractedPaperCount: 2, datasetCount: 0, githubToolCount: 0, datasets: [], githubTools: [], researchTrends: [], excludedItems: [], uncertaintySummary: { factVerificationCount: 0, insufficientEvidenceCount: 0, researchOpenQuestionCount: 0 } },
      candidates: [epiflow, leakage],
      aiRecommendation: recommendation as any,
    }, {}, "epiflow");
    const readingNote = md.slice(md.indexOf("# 읽기 노트: EpiFlow"), md.indexOf("## 다음 단계"));
    expect(readingNote).not.toMatch(/data revision leakage|데이터 리비전 누수/i);
  });

  it("Final Consistency 5: final and Markdown prose paths use Korean formatter coverage", () => {
    const p = paper({
      id: "epiflow",
      title: "EpiFlow",
      codeStatus: "CODE_AVAILABLE_VERIFIED",
      dataStatus: "PUBLIC_DATASET_VERIFIED",
      scores: {
        topicRelevance: dim(5, "arXiv preprint, code and data available, quantitative results presented but no peer-reviewed publication yet"),
        reproducibility: dim(4, "Code and public dataset are available via GitHub, enabling partial reproducibility"),
      } as any,
    });
    const recommendation = {
      topRecommendedPaperId: "epiflow",
      recommendationReason: "arXiv preprint, code and data available, quantitative results presented but no peer-reviewed publication yet",
      tradeoffExplanation: null,
      keyRecommendationEvidence: [],
      consideredUncertainties: [],
      sotaStatus: "부분 확인",
      hasDirectComparisonStudies: false,
      keyItemsToVerifyWhileReading: [],
      positionInRecentTrend: "Code and public dataset are available via GitHub, enabling partial reproducibility",
      keyStrengths: [],
      keyLimitationsOrRisks: ["peer-reviewed 학술지 발표 미상황"],
      readingQuestions: [],
      followUpResearchQuestions: [],
      performanceEvidenceUsed: false,
    };
    const canonical = buildCanonicalPaperEvaluation(p, recommendation as any);
    const md = generateReportMarkdown({
      briefingTitle: "Formatter coverage",
      extraction: { extractedPaperCount: 1, datasetCount: 0, githubToolCount: 0, datasets: [], githubTools: [], researchTrends: [], excludedItems: [], uncertaintySummary: { factVerificationCount: 0, insufficientEvidenceCount: 0, researchOpenQuestionCount: 0 } },
      candidates: [p],
      aiRecommendation: recommendation as any,
    }, {}, "epiflow");
    const output = [
      ...canonical.interpretation.strengths,
      ...canonical.interpretation.limitations.map((item) => formatEvidenceForUser(item)),
      ...canonical.readingGuide.questions,
      md,
    ].join("\n");
    expect(output).toContain("arXiv에 공개된 preprint");
    expect(output).toContain("공개 코드와 데이터셋을 활용해 일부 실험을 재현할 수 있으나 전체 재현 절차는 추가 확인이 필요합니다");
    expect(output).toContain("동료심사를 거친 출판 여부는 아직 확인되지 않았습니다");
    expect(output).not.toMatch(/arXiv preprint, code and data available, quantitative results presented but no peer-reviewed publication yet|Code and public dataset are available via GitHub, enabling partial reproducibility|peer-reviewed 학술지 발표 미상황/i);
  });
  it("Final Cleanup Test 1/5: verified semantic claim is not also unverified or uncertainty", () => {
    const verifiedEvidence = { evidenceType: "PAPER" as const, sourceTitle: "EpiFlow", sourceLocation: "Results", claim: "forecast coverage improved by 20 percentage points over baseline", verificationStatus: "DIRECTLY_VERIFIED" as const };
    const p = paper({
      id: "epiflow",
      title: "EpiFlow",
      uncertainty: {
        factVerificationItems: ["20 percentage point forecast coverage improvement", "코드 공개 확인"],
        insufficientEvidenceItems: ["공식 출판됨"],
        researchOpenQuestions: [],
      },
      scores: {
        performance: { ...dim(4, verifiedEvidence.claim), evidence: { paperText: [verifiedEvidence], externalSource: [], aiInterpretation: [] } },
        researchValue: { ...dim(4, "forecast coverage improvement"), evidence: { paperText: [verifiedEvidence], externalSource: [], aiInterpretation: [] } },
      } as any,
    });
    const canonical = buildCanonicalPaperEvaluation(p);
    const coverageClaims = canonical.evidenceClaims.filter((claim) => claim.metric?.name === "forecast coverage" && String(claim.metric?.value) === "20");
    expect(coverageClaims).toHaveLength(1);
    expect(coverageClaims[0].verificationStatus).toBe("VERIFIED");
    expect(canonical.uncertainty.factVerification.join("\n")).not.toMatch(/20 percentage point|forecast coverage|코드 공개 확인|공식 출판/);
    expect(canonical.readingGuide.preReadingChecks.join("\n")).not.toMatch(/20 percentage point forecast coverage improvement|원문 확인 필요/);
  });

  it("Final Cleanup Test 2: final strengths contain positive evidence only", () => {
    const p = paper({
      id: "epiflow",
      title: "EpiFlow",
      codeStatus: "CODE_AVAILABLE_VERIFIED",
      dataStatus: "UNKNOWN",
      dataUrl: null,
      scores: {
        topicRelevance: dim(5, "Venue: arXiv (Peer Reviewed: false, Preprint: true)"),
        reproducibility: dim(4, "Code Status: CODE_AVAILABLE_VERIFIED; Data Status: UNKNOWN (None)"),
      } as any,
    });
    const canonical = buildCanonicalPaperEvaluation(p);
    const strengths = canonical.interpretation.strengths.join("\n");
    expect(strengths).not.toMatch(/Venue:|Peer Reviewed:|Code Status:|Data Status:|None|UNKNOWN|NOT_FOUND|확인되지 않음|추가 확인 필요/i);
    expect(strengths).not.toMatch(/데이터.*확인/i);
  });

  it("Final Cleanup Test 3/4: reading questions are structured, short, and free of metadata diagnostics", () => {
    const longRationale = "EpiFlow는 wastewater 바이러스 부하 신호를 활용하는 새로운 예측 프레임워크로 동일 분야 및 메트릭 하에서 상세 비교가 필요하다는 평가 rationale 전체 문장입니다. ".repeat(5);
    const p = paper({
      id: "epiflow",
      title: "EpiFlow",
      scores: {
        methodNovelty: dim(4, longRationale),
        performance: dim(null, "Quantitative Results: N/A"),
      } as any,
    });
    const canonical = buildCanonicalPaperEvaluation(p);
    expect(canonical.readingGuide.questions).toHaveLength(3);
    for (const question of canonical.readingGuide.questions) {
      expect(question.length).toBeLessThanOrEqual(180);
      expect(question).not.toMatch(/Venue:|Peer Reviewed:|Preprint:|Code Status:|Data Status:|N\/A|NOT_FOUND|CODE_AVAILABLE_VERIFIED/i);
      expect(question).not.toContain(longRationale.slice(0, 60));
    }
  });

  it("Final Cleanup Test 6: generated Markdown AI prose sections do not leak English explanatory sentences", () => {
    const ai = { evidenceType: "AI_INTERPRETATION" as const, sourceTitle: "AI", sourceLocation: "AI", claim: "No external validation available.", verificationStatus: "PARTIALLY_VERIFIED" as const };
    const p = paper({
      id: "epiflow",
      title: "EpiFlow",
      uncertainty: {
        factVerificationItems: [],
        insufficientEvidenceItems: ["No direct comparison reported."],
        researchOpenQuestions: ["How generalizable is the EpiFlow framework to other diseases or geographic regions?"],
      },
      scores: {
        topicRelevance: { ...dim(5, "No external validation available."), evidence: { paperText: [], externalSource: [], aiInterpretation: [ai] } },
      } as any,
    });
    const md = generateReportMarkdown({
      briefingTitle: "Markdown Korean prose",
      extraction: { extractedPaperCount: 1, datasetCount: 0, githubToolCount: 0, datasets: [], githubTools: [], researchTrends: [], excludedItems: [], uncertaintySummary: { factVerificationCount: 0, insufficientEvidenceCount: 1, researchOpenQuestionCount: 1 } },
      candidates: [p],
      aiRecommendation: { topRecommendedPaperId: "epiflow", recommendationReason: "No external validation available.", keyRecommendationEvidence: [], consideredUncertainties: [], sotaStatus: "부분 확인", hasDirectComparisonStudies: false, keyItemsToVerifyWhileReading: [], positionInRecentTrend: "No direct comparison reported.", keyStrengths: [], keyLimitationsOrRisks: ["peer-reviewed 학술지 발표 미상황"], readingQuestions: [], followUpResearchQuestions: [], performanceEvidenceUsed: false },
    }, {}, "epiflow");
    expect(md).not.toMatch(/No external validation available|No direct comparison reported|How generalizable is/i);
    expect(md).not.toMatch(/peer-reviewed 학술지 발표 미상황/i);
  });

  it("Final Cleanup Test 7: Markdown reading note serializes the same canonical strengths and questions", () => {
    const methodEvidence = { evidenceType: "PAPER" as const, sourceTitle: "EpiFlow", sourceLocation: "Method", claim: "EpiFlow preprocesses wastewater viral-load signals and analyzes lead-lag relationships", verificationStatus: "DIRECTLY_VERIFIED" as const };
    const p = paper({
      id: "epiflow",
      title: "EpiFlow",
      scores: {
        methodNovelty: { ...dim(4, methodEvidence.claim), evidence: { paperText: [methodEvidence], externalSource: [], aiInterpretation: [] } },
      } as any,
    });
    const recommendation = { topRecommendedPaperId: "epiflow", recommendationReason: "EpiFlow recommendation", keyRecommendationEvidence: [], consideredUncertainties: [], sotaStatus: "부분 확인", hasDirectComparisonStudies: false, keyItemsToVerifyWhileReading: [], positionInRecentTrend: "직접 관련", keyStrengths: [], keyLimitationsOrRisks: [], readingQuestions: [], followUpResearchQuestions: [], performanceEvidenceUsed: false };
    const canonical = buildCanonicalPaperEvaluation(p, recommendation as any);
    const md = generateReportMarkdown({
      briefingTitle: "Parity",
      extraction: { extractedPaperCount: 1, datasetCount: 0, githubToolCount: 0, datasets: [], githubTools: [], researchTrends: [], excludedItems: [], uncertaintySummary: { factVerificationCount: 0, insufficientEvidenceCount: 0, researchOpenQuestionCount: 0 } },
      candidates: [p],
      aiRecommendation: recommendation as any,
    }, {}, "epiflow");
    for (const strength of canonical.interpretation.strengths.slice(0, 3)) expect(md).toContain(formatStrengthForUser(strength, canonical.verification.publicationStatus));
    for (const question of canonical.readingGuide.questions.slice(0, 3)) expect(md).toContain(formatEvidenceForUser(question));
  });
  it("Source Fidelity 1: EpiFlow briefing metric remains forecast coverage, not accuracy", () => {
    const draft: any = { id: "epiflow", rawTitle: "EpiFlow", authors: [], year: "2026", venue: "arXiv preprint", snippet: "EpiFlow reports forecast coverage 약 20 percentage points 개선 over baseline.", claimedMetrics: [{ name: "forecast coverage", value: "20", unit: "percentage points", dataset: null, sourceLocation: "briefing" }], mentionedCodeUrl: null, mentionedDataUrl: null };
    const doc = mergeDocumentAnalysisWithBriefing({ paperId: "epiflow", performed: true, reason: "search failed", method: "Method N/A", datasets: [], metrics: [], baselines: [], quantitativeResults: ["현재 확보한 요약 정보에서는 직접 추출되지 않음"], sotaClaim: "", evidence: [] } as any, draft);
    expect(doc.quantitativeResults.join("\n")).toContain("forecast coverage");
    expect(doc.quantitativeResults.join("\n")).toContain("20 percentage points");
    expect(doc.quantitativeResults.join("\n")).not.toMatch(/accuracy|정확도/i);
  });

  it("Source Fidelity 2/3/4: Bundibugyo briefing method, 42.6 metric, and code-not-found survive merge", () => {
    const draft: any = {
      id: "bundibugyo",
      rawTitle: "Bundibugyo risk ranking",
      authors: [],
      year: "2026",
      venue: "preprint",
      snippet: "Bayesian hierarchical discrete-time hazard model. 4개 모델 비교: no connectivity, road-distance, gravity score, incidence-weighted force of infection. top-10 hit rate 약 42.6%. GitHub: 이번 스캔에서 논문 전용 repository 확인하지 못함.",
      claimedMetrics: [{ name: "top-10 hit rate", value: "42.6", unit: "%", dataset: null, sourceLocation: "briefing" }],
      mentionedCodeUrl: null,
      mentionedDataUrl: null,
    };
    const doc = mergeDocumentAnalysisWithBriefing({ paperId: "bundibugyo", performed: true, reason: "official source unavailable", method: "Method N/A", datasets: [], metrics: [], baselines: [], quantitativeResults: ["Quantitative Results: N/A"], sotaClaim: "", evidence: [] } as any, draft);
    const resources = mergeResourcesWithBriefing({ paperId: "bundibugyo", codeStatus: "CODE_AVAILABLE_VERIFIED", codeUrl: "https://github.com/wrong/repo", dataStatus: "UNKNOWN", dataUrl: null, checkpointStatus: "NOT_FOUND", documentationStatus: "LOW", executionVerification: "NOT_PERFORMED", reproducibilityLevel: "NOT_VERIFIED", reproducibilityAssessment: { codeStatus: "CODE_AVAILABLE_VERIFIED", dataStatus: "UNKNOWN", checkpointStatus: "NOT_FOUND", documentationStatus: "LOW", executionVerification: "NOT_PERFORMED", level: "NOT_VERIFIED", score: 1, reason: "" }, evidence: [] } as any, draft);
    expect(doc.method).toMatch(/Bayesian hierarchical discrete-time hazard model|incidence-weighted force of infection/);
    expect(doc.quantitativeResults.join("\n")).toContain("top-10 hit rate");
    expect(doc.quantitativeResults.join("\n")).toContain("42.6");
    expect(resources.codeStatus).not.toBe("CODE_AVAILABLE_VERIFIED");
    expect(resources.codeUrl).toBeNull();
  });

  it("Source Fidelity 5: EpiSewer briefing method evidence reaches evaluation", () => {
    const draft: any = { id: "episewer", rawTitle: "Real-time estimation with EpiSewer", authors: [], year: "2026", venue: "preprint", snippet: "raw concentration + flow data -> Bayesian semi-mechanistic model -> infection dynamics / shedding / noise / non-detect / outlier modeling -> Rt / growth rate / latent infection dynamics / 14-day forecast", claimedMetrics: [], mentionedCodeUrl: "https://github.com/example/episewer", mentionedDataUrl: null };
    const evaluation = mergeEvaluationWithBriefing({ paperId: "episewer", scores: { performance: dim(null), novelty: dim(null, "방법론 세부 구조 확인 필요"), trendImportance: dim(null), academicSignificance: dim(null), practicalValue: dim(null), reproducibility: dim(null) }, uncertainty: { factVerificationItems: [], insufficientEvidenceItems: [], researchOpenQuestions: [] }, verificationBadges: {} as any, verificationScope: {} as any, overallBadgeStatus: "PARTIAL_INFO_UNVERIFIED" } as any, draft);
    expect(evaluation.scores.novelty.score).not.toBeNull();
    expect(evaluation.scores.novelty.evidence.aiInterpretation.some((item: any) => item.claim.includes("Bayesian semi-mechanistic") || item.claim.includes("raw concentration"))).toBe(true);
  });

  it("Source Fidelity 6/7: KDD briefing publication, code, data, and method are not downgraded by search failure", () => {
    const draft: any = { id: "kdd", rawTitle: "LLM simulation", authors: [], year: "2026", venue: "KDD '26", snippet: "Peer-reviewed conference paper. KDD '26. ACM DOI https://doi.org/10.1145/123. GitHub repository https://github.com/example/kdd-sim. census-derived synthetic population. LLM-generated decision bank.", claimedMetrics: [], mentionedCodeUrl: "https://github.com/example/kdd-sim", mentionedDataUrl: null };
    const metadata = mergeMetadataWithBriefing({ paperId: "kdd", rawMention: draft.rawTitle, entityType: "PAPER", canonicalTitle: draft.rawTitle, normalizedTitle: draft.rawTitle, authors: [], year: "2026", venueOrPreprint: "Preprint", doi: null, arxivId: null, biorxivId: null, url: null, canonicalUrl: null, identityStatus: "IDENTITY_VERIFIED", matchConfidence: 0.8, matchReason: "", publicationStatus: "PREPRINT", peerReviewed: false, isPreprint: true, versionInfo: { publicationStatus: "PREPRINT" }, crossVerificationStatus: "SINGLE_SOURCE", publishingReliabilityDetails: { peerReviewed: false, isPreprint: true, scoreReason: "" }, evidence: [] } as any, draft);
    const resources = mergeResourcesWithBriefing({ paperId: "kdd", codeStatus: "NOT_FOUND_AFTER_RETRIES", codeUrl: null, dataStatus: "UNKNOWN", dataUrl: null, checkpointStatus: "NOT_FOUND", documentationStatus: "LOW", executionVerification: "NOT_PERFORMED", reproducibilityLevel: "NOT_VERIFIED", reproducibilityAssessment: { codeStatus: "NOT_FOUND_AFTER_RETRIES", dataStatus: "UNKNOWN", checkpointStatus: "NOT_FOUND", documentationStatus: "LOW", executionVerification: "NOT_PERFORMED", level: "NOT_VERIFIED", score: 1, reason: "" }, evidence: [] } as any, draft);
    const doc = mergeDocumentAnalysisWithBriefing({ paperId: "kdd", performed: true, reason: "search failed", method: "Method N/A", datasets: [], metrics: [], baselines: [], quantitativeResults: [], sotaClaim: "", evidence: [] } as any, draft);
    expect(metadata.peerReviewed).toBe(true);
    expect(metadata.publicationStatus).toBe("PEER_REVIEWED");
    expect(resources.codeStatus).toBe("REPOSITORY_FOUND");
    expect(resources.dataStatus).not.toBe("UNKNOWN");
    expect(doc.method).toMatch(/census-derived synthetic population|LLM-generated decision bank/);
  });});

