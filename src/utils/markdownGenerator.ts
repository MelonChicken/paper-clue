import { BriefingAnalysisResponse, CandidateUserStatus, GroundedEvidenceItem } from "../types";
import {
  CORE_SCORE_KEYS,
  CORE_SCORE_LABELS,
  CanonicalPaperEvaluation,
  EvidenceClaim,
  buildCanonicalPaperEvaluations,
  buildCanonicalRecommendationResult,
  containsBrokenEncoding,
  sanitizeUserText,
  formatEvidenceForUser,
  formatStrengthForUser,
  formatUncertaintyForUser,
  formatOpenQuestionForUser,
  formatCanonicalMetricClaim,
  getCanonicalRanking,
} from "./paperSemantics";

function sanitizeCell(val: string | number | undefined | null): string {
  if (val === undefined || val === null || val === "") return "-";
  return sanitizeUserText(String(val), "추가 확인 필요").replace(/\r?\n/g, " ").replace(/\|/g, "\\|").trim();
}

function scoreText(score: number | null): string {
  return typeof score === "number" ? `${score}점` : "근거 부족";
}

function listItems(items: string[] | undefined, empty = "- 없음"): string {
  const cleaned = (items || []).map((item) => formatEvidenceForUser(item)).filter(Boolean);
  return cleaned.length > 0 ? cleaned.map((item) => `- ${item}`).join("\n") : empty;
}

function evidenceItemLine(item: GroundedEvidenceItem, fallbackSource: string): string {
  const source = sanitizeCell(item.sourceLocation || item.sourceTitle || fallbackSource);
  return `  - [${source}] ${formatEvidenceForUser(item.claim || item.text)}`;
}

function claimLine(claim: EvidenceClaim): string {
  const statusLabel = claim.verificationStatus === "VERIFIED" ? "검증됨" : claim.verificationStatus === "PARTIAL" ? "부분 확인" : "원문 확인 필요";
  const metric = claim.metric ? ` (${formatCanonicalMetricClaim(claim)})` : "";
  const source = claim.sourceLocation ? ` · ${sanitizeCell(claim.sourceLocation)}` : "";
  return `- **${statusLabel}**${metric}${source}: ${formatEvidenceForUser(claim.claim)}`;
}
function evidenceLines(canonical: CanonicalPaperEvaluation): string[] {
  const quantitativeClaims = canonical.evidenceClaims.filter((claim) => (claim.type === "QUANTITATIVE_RESULT" || claim.type === "BASELINE_COMPARISON") && claim.metric);
  const unverifiedClaims = canonical.evidenceClaims.filter((claim) => claim.verificationStatus === "UNVERIFIED" && (claim.type === "QUANTITATIVE_RESULT" || claim.type === "METHOD" || claim.type === "OTHER"));
  const absenceClaims = canonical.evidenceClaims.filter((claim) => claim.type === "ABSENCE_OF_QUANTITATIVE_RESULT");
  return [
    "- **정량 근거**:",
    quantitativeClaims.length ? quantitativeClaims.map(claimLine).join("\n") : (absenceClaims.length ? "  - 현재 확보한 원문에서는 직접적인 정량 비교 결과를 확인하지 못했습니다." : "  - 현재 확보된 원문/공식 출처 범위에서는 정량 결과를 직접 확인하지 못했습니다."),
    "- **논문 원문 근거**:",
    canonical.evidence.paperEvidence.length
      ? canonical.evidence.paperEvidence.map((e) => evidenceItemLine(e, "논문 원문")).join("\n")
      : "  - 명시적인 원문 근거가 아직 확보되지 않았습니다.",
    "- **외부 출처 근거**:",
    canonical.evidence.externalEvidence.length
      ? canonical.evidence.externalEvidence.map((e) => evidenceItemLine(e, "외부 출처")).join("\n")
      : "  - 외부 교차검증 정보가 아직 확보되지 않았습니다.",
    "- **AI 종합 해석**:",
    canonical.evidence.aiInterpretation.length
      ? canonical.evidence.aiInterpretation.map((e) => `  - ${formatEvidenceForUser(e.claim || e.text)}`).join("\n")
      : Object.entries(canonical.interpretation.evaluationRationales).length
      ? Object.entries(canonical.interpretation.evaluationRationales)
          .map(([key, reason]) => `  - ${CORE_SCORE_LABELS[key as keyof typeof CORE_SCORE_LABELS]}: ${formatEvidenceForUser(reason)}`)
          .join("\n")
      : "  - AI 종합 해석 없음",
    "- **미검증 Claim**:",
    unverifiedClaims.length ? unverifiedClaims.map(claimLine).join("\n") : "  - 없음",
  ];
}

function validateMarkdown(markdown: string): string {
  if (!containsBrokenEncoding(markdown)) return markdown;
  return markdown.replace(/\uFFFD|�|\?먮[^\]\s]*/g, "추가 확인 필요");
}

export function generateReportMarkdown(
  data: BriefingAnalysisResponse,
  userSelections: Record<string, CandidateUserStatus>,
  finalChoicePaperId: string | null
): string {
  void userSelections;

  const dateStr = new Date().toLocaleDateString("ko-KR", { year: "numeric", month: "long", day: "numeric" });
  const canonicalCandidates = buildCanonicalPaperEvaluations(data.candidates, data.aiRecommendation);
  const canonicalRanking = getCanonicalRanking(canonicalCandidates);
  const rankedCanonicalCandidates = canonicalRanking.map((entry) => entry.canonical);
  const topRankEntries = canonicalRanking.filter((entry) => entry.rank === 1 && entry.score !== null);
  const topRankDisplay = topRankEntries.length > 0
    ? topRankEntries.map((entry) => `${entry.canonical.identity.title} (${entry.canonical.labels.scoreDisplay} · ${entry.canonical.labels.evaluationStatus})`).join("<br>")
    : "-";
  const topRankJudgment = topRankEntries.length > 1 ? `공동 최고점 ${topRankEntries.length}편` : (topRankEntries[0]?.canonical.labels.scoreDisplay || "-");
  const canonicalById = new Map(canonicalCandidates.map((paper) => [paper.paperId, paper]));
  const recommendation = buildCanonicalRecommendationResult(data.candidates, data.aiRecommendation);
  const finalChosenPaper = finalChoicePaperId ? canonicalById.get(finalChoicePaperId) || null : null;
  const aiRecommendedPaper = recommendation.recommendedPaper;
  const highestScoringPaper = recommendation.highestScoringPaper;

  const lines: string[] = [
    "# [논문갈피] 주간 논문 분석 및 최종 선택 리포트",
    `> **분석 기준일**: ${dateStr}  `,
    `> **연구 브리핑 제목**: ${sanitizeCell(data.briefingTitle || "주간 연구 브리핑")}  `,
    "> **서비스**: 논문갈피 · 근거 기반 연구 의사결정 지원 서비스",
    "",
    "---",
    "",
    "## 1. 종합 선택 요약",
    "",
    "| 구분 | 논문 제목 | 출판 / 버전 | 서지 상태 | 주요 판단 |",
    "| :--- | :--- | :--- | :---: | :--- |",
    `| **5축 종합점수 1위** | ${sanitizeCell(topRankDisplay)} | ${topRankEntries.length > 1 ? "공동 순위" : sanitizeCell(highestScoringPaper?.labels.publicationDisplay || "-")} | ${topRankEntries.length > 1 ? "-" : sanitizeCell(highestScoringPaper?.labels.bibliographicStatus || "-")} | ${sanitizeCell(topRankJudgment)} |`,
    `| **AI 우선 추천** | ${sanitizeCell(aiRecommendedPaper?.identity.title || "추천 보류")} | ${sanitizeCell(aiRecommendedPaper?.labels.publicationDisplay || "-")} | ${sanitizeCell(aiRecommendedPaper?.labels.bibliographicStatus || "-")} | ${sanitizeCell(formatEvidenceForUser(data.aiRecommendation.positionInRecentTrend))} |`,
    `| **사용자 최종 선택** | ${finalChosenPaper ? `**${sanitizeCell(finalChosenPaper.identity.title)}**` : "*아직 선택되지 않음*"} | ${sanitizeCell(finalChosenPaper?.labels.publicationDisplay || "-")} | ${sanitizeCell(finalChosenPaper?.labels.bibliographicStatus || "-")} | ${finalChosenPaper ? "이번 주 읽기 지정 논문" : "-"} |`,
    "",
  ];

  if (recommendation.tradeoffExplanation) {
    lines.push("### 추천 역전 사유", recommendation.tradeoffExplanation, "");
  }

  lines.push(
    "---",
    "",
    "## 2. 브리핑 추출 및 검증 분류 현황",
    "",
    `- **추출된 논문 후보**: 총 ${data.extraction?.extractedPaperCount ?? data.candidates.length}편 (서지 확인: ${canonicalCandidates.filter((c) => c.verification.bibliographicStatus === "VERIFIED").length}편, 평가 제외 논문: ${data.candidates.filter((c) => c.crossVerificationStatus === "NOT_FOUND").length}편)`,
    `- **데이터셋**: ${data.extraction?.datasetCount ?? 0}개 (${data.extraction?.datasets?.map((d) => d.name).join(", ") || "없음"})`,
    `- **GitHub 도구/저장소**: ${data.extraction?.githubToolCount ?? 0}개 (${data.extraction?.githubTools?.map((g) => g.name).join(", ") || "없음"})`,
    `- **점수 산정에서 제외된 미검증 주장·아이디어**: ${data.extraction?.excludedItems?.map((item) => sanitizeUserText(item)).join(", ") || "없음"}`,
    "- **불확실성 현황**:",
    `  - 사실 검증 필요: ${data.extraction?.uncertaintySummary?.factVerificationCount ?? 0}건`,
    `  - 평가 근거 부족: ${data.extraction?.uncertaintySummary?.insufficientEvidenceCount ?? 0}건`,
    `  - 추가 연구 질문: ${data.extraction?.uncertaintySummary?.researchOpenQuestionCount ?? 0}건`,
    "",
    "---",
    "",
    "## 3. 후보 논문 종합 평가 비교표",
    "",
    "확인 가능한 평가 항목의 평균이며, 근거가 부족한 항목은 점수 계산에서 제외됩니다.",
    "",
    "| 논문명 | 평가 상태 | 주제 적합도 | 방법론 신규성 | 연구 가치 | 학술 신뢰도 | 재현 가능성 | 출판 상태 | 코드 상태 | 데이터 상태 |",
    "| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |"
  );

  rankedCanonicalCandidates.forEach((paper) => {
    lines.push(`| **${sanitizeCell(paper.identity.title)}** | ${paper.labels.evaluationStatus} · ${paper.labels.scoreDisplay} | ${CORE_SCORE_KEYS.map((key) => scoreText(paper.evaluation[key])).join(" | ")} | ${sanitizeCell(paper.labels.publicationStatus)} | ${sanitizeCell(paper.labels.codeStatus)} | ${sanitizeCell(paper.labels.dataStatus)} |`);
  });

  lines.push(
    "",
    "---",
    "",
    "## 4. 추천 근거 및 위치 분석",
    "",
    `### 현재 검증 가능한 후보 중 우선 추천: ${sanitizeCell(aiRecommendedPaper?.identity.title || "N/A")}`,
    "",
    `- **추천 이유**: ${formatStrengthForUser(recommendation.tradeoffExplanation || aiRecommendedPaper?.interpretation.strengths[0] || data.aiRecommendation.recommendationReason, aiRecommendedPaper?.verification.publicationStatus || "UNKNOWN")}`,
    `- **최근 연구 흐름에서의 위치**: ${formatEvidenceForUser(data.aiRecommendation.positionInRecentTrend)}`,
    `- **성능 근거 사용 여부**: ${data.aiRecommendation.performanceEvidenceUsed ? "사용" : "충분한 비교 근거가 없어 핵심 점수에서 제외"}`,
    "",
    "#### 주요 강점",
    listItems(aiRecommendedPaper?.interpretation.strengths, "- 추천 근거 추가 확인 필요"),
    "",
    "#### 주요 한계 및 위험요소",
    listItems(aiRecommendedPaper?.interpretation.limitations || data.aiRecommendation.keyLimitationsOrRisks),
    "",
    "#### 검증 필요 사항",
    listItems(aiRecommendedPaper ? [...aiRecommendedPaper.uncertainty.factVerification, ...aiRecommendedPaper.uncertainty.insufficientEvidence] : data.aiRecommendation.consideredUncertainties),
    "",
    "---",
    "",
    "## 5. 선택 논문 상세 읽기 가이드",
    ""
  );

  const readingTarget = finalChosenPaper || aiRecommendedPaper;
  if (readingTarget) {
    lines.push(
      `# 읽기 노트: ${readingTarget.identity.title}`,
      "",
      `저자: ${readingTarget.identity.authors.join(", ") || "확인 필요"}`,
      `발표/게재: ${readingTarget.labels.publicationDisplay}`,
      `링크: ${readingTarget.identity.primaryUrl || "확인 필요"}`,
      "",
      "## 선택 근거와 강점",
      listItems(readingTarget.interpretation.strengths.map((item) => formatStrengthForUser(item, readingTarget.verification.publicationStatus)), "- 추천 근거 추가 확인 필요"),
      ""
    );
    if (readingTarget.readingGuide.preReadingChecks.length > 0) {
      lines.push("## 읽기 전 확인 필요", listItems(readingTarget.readingGuide.preReadingChecks), "");
    }
    lines.push(
      "## 읽으면서 확인할 질문",
      readingTarget.readingGuide.questions.map((q, idx) => `${idx + 1}. ${formatEvidenceForUser(q)}`).join("\n"),
      "",
      "## 다음 단계",
      readingTarget.readingGuide.nextSteps.map((step, idx) => `${idx + 1}. ${step}`).join("\n"),
      ""
    );
  } else {
    lines.push("*아직 최종 논문을 선택하지 않았습니다.*", "");
  }

  lines.push("---", "", "## 6. 각 후보 논문별 평가 근거 및 불확실성", "");
  rankedCanonicalCandidates.forEach((paper, idx) => {
    lines.push(
      `### ${idx + 1}. ${paper.identity.title}`,
      `- **출판 정보**: ${paper.labels.publicationDisplay}`,
      `- **평가 상태**: ${paper.labels.evaluationStatus} · ${paper.labels.scoreDisplay}`,
      "- **5개 평가 축 점수 요약**:",
      ...CORE_SCORE_KEYS.map((key) => `  - ${CORE_SCORE_LABELS[key]}: ${scoreText(paper.evaluation[key])} (${formatEvidenceForUser(paper.interpretation.evaluationRationales[key], "근거 추가 확인 필요")})`),
      `- **성능 근거 상태**: ${paper.labels.performanceEvidenceStatus}`,
      `- **재현 가능성 설명**: ${formatEvidenceForUser(paper.interpretation.evaluationRationales.reproducibility)}`,
      "",
      "#### 근거 원문",
      ...evidenceLines(paper),
      "",
      "#### 불확실성",
      `${"- 사실 검증 필요: "}${paper.uncertainty.factVerification.map(formatUncertaintyForUser).join("; ") || "없음"}`,
      `${"- 평가 근거 부족: "}${paper.uncertainty.insufficientEvidence.map(formatUncertaintyForUser).join("; ") || "없음"}`,
      `${"- 추가 연구 질문: "}${paper.uncertainty.openQuestions.map(formatOpenQuestionForUser).join("; ") || "없음"}`,
      ""
    );
  });

  lines.push("", "*논문갈피 · 근거 기반 연구 의사결정 지원 서비스*", "");
  return validateMarkdown(lines.join("\n"));
}




