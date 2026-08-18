import { BriefingAnalysisResponse, CandidateUserStatus } from "../types";

function sanitizeCell(val: string | number | undefined | null): string {
  if (val === undefined || val === null || val === "") return "-";
  return String(val).replace(/\r?\n/g, " ").replace(/\|/g, "\\|").trim();
}

function codeStatus(val: string | undefined | null): string {
  return val ? `\`${val}\`` : "-";
}

function scoreText(score: number | null | undefined, status?: string): string {
  if (score !== null && score !== undefined) return `${score}점`;
  if (status === "NOT_APPLICABLE") return "N/A";
  return "추가 확인 필요";
}

function listItems(items: string[] | undefined, empty = "- 없음"): string {
  return items && items.length > 0 ? items.map((item) => `- ${item}`).join("\n") : empty;
}

function indentedList(items: string[] | undefined, empty = "  - 특이사항 없음"): string {
  return items && items.length > 0 ? items.map((item) => `  - ${item}`).join("\n") : empty;
}

export function generateReportMarkdown(
  data: BriefingAnalysisResponse,
  userSelections: Record<string, CandidateUserStatus>,
  finalChoicePaperId: string | null
): string {
  void userSelections;

  const dateStr = new Date().toLocaleDateString("ko-KR", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const finalChosenPaper = data.candidates.find((c) => c.id === finalChoicePaperId);
  const aiRecommendedPaper = data.candidates.find((c) => c.id === data.aiRecommendation.topRecommendedPaperId);

  const lines: string[] = [
    "# [논문갈피] 주간 논문 분석 및 최종 선택 리포트",
    `> **분석 기준일**: ${dateStr}  `,
    `> **연구 브리핑 제목**: ${data.briefingTitle || "주간 연구 브리핑"}  `,
    "> **서비스**: 논문갈피 · 근거 기반 연구 의사결정 지원 서비스",
    "",
    "---",
    "",
    "## 1. 종합 선택 요약",
    "",
    "| 구분 | 논문 제목 | 출판 / 버전 | 교차검증 상태 | 주요 특징 및 연구 위치 |",
    "| :--- | :--- | :--- | :---: | :--- |",
    `| **현재 검증 가능한 후보 중 우선 추천** | ${sanitizeCell(aiRecommendedPaper?.title || "추천 보류")} | ${sanitizeCell(aiRecommendedPaper?.venueOrPreprint)} | ${codeStatus(aiRecommendedPaper?.crossVerificationStatus)} | ${sanitizeCell(data.aiRecommendation.positionInRecentTrend)} |`,
    `| **사용자 최종 선택** | ${finalChosenPaper ? `**${sanitizeCell(finalChosenPaper.title)}**` : "*아직 선택되지 않음*"} | ${sanitizeCell(finalChosenPaper?.venueOrPreprint)} | ${codeStatus(finalChosenPaper?.crossVerificationStatus)} | ${finalChosenPaper ? "이번 주 읽기 지정 논문" : "-"} |`,
    "",
  ];

  if (finalChoicePaperId && finalChoicePaperId !== data.aiRecommendation.topRecommendedPaperId) {
    lines.push("> 참고: AI 추천과 사용자 최종 선택이 다릅니다. 논문갈피는 근거를 제시하고, 최종 결정은 연구자가 수행합니다.", "");
  }

  lines.push(
    "---",
    "",
    "## 2. 브리핑 추출 및 검증 분류 현황",
    "",
    `- **추출된 논문 후보**: 총 ${data.extraction?.extractedPaperCount ?? data.candidates.length}편 (검증 완료: ${data.candidates.filter((c) => c.crossVerificationStatus !== "NOT_FOUND").length}편, 평가 제외: ${data.candidates.filter((c) => c.crossVerificationStatus === "NOT_FOUND").length}편)`,
    `- **데이터셋**: ${data.extraction?.datasetCount ?? 0}개 (${data.extraction?.datasets?.map((d) => d.name).join(", ") || "없음"})`,
    `- **GitHub 도구/저장소**: ${data.extraction?.githubToolCount ?? 0}개 (${data.extraction?.githubTools?.map((g) => g.name).join(", ") || "없음"})`,
    `- **평가 제외 항목**: ${data.extraction?.excludedItems?.join(", ") || "없음"}`,
    "- **불확실성 현황**:",
    `  - 사실 검증 필요: ${data.extraction?.uncertaintySummary?.factVerificationCount ?? 0}건`,
    `  - 평가 근거 부족: ${data.extraction?.uncertaintySummary?.insufficientEvidenceCount ?? 0}건`,
    `  - 연구 Open Question: ${data.extraction?.uncertaintySummary?.researchOpenQuestionCount ?? 0}건`,
    "",
    "---",
    "",
    "## 3. 후보 논문 종합 평가 비교표",
    "",
    "| 논문명 | 교차검증 | 성능 경쟁력 | 방법론 신규성 | 연구 흐름 | 학술 유의미성 | 실무·연구 적용 | 재현 가능성 | 출판 신뢰도 | 최신성 |",
    "| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |"
  );

  data.candidates.forEach((c) => {
    const isSelected = c.id === finalChoicePaperId;
    const isAiRec = c.id === data.aiRecommendation.topRecommendedPaperId;
    let badge = "";
    if (isSelected && isAiRec) badge = " [추천 및 최종 선택]";
    else if (isSelected) badge = " [최종 선택]";
    else if (isAiRec) badge = " [우선 추천]";

    lines.push(
      `| **${sanitizeCell(c.title)}**${badge} | ${codeStatus(c.crossVerificationStatus)} | ${scoreText(c.scores.performance.score, c.scores.performance.status)} | ${scoreText(c.scores.novelty.score, c.scores.novelty.status)} | ${scoreText(c.scores.trendImportance.score, c.scores.trendImportance.status)} | ${scoreText(c.scores.academicSignificance.score, c.scores.academicSignificance.status)} | ${scoreText(c.scores.practicalValue.score, c.scores.practicalValue.status)} | ${scoreText(c.scores.reproducibility.score, c.scores.reproducibility.status)} | ${scoreText(c.publishingReliabilityScore)} | ${scoreText(c.recencyScore)} |`
    );
  });

  lines.push(
    "",
    "---",
    "",
    "## 4. 추천 근거 및 위치 분석",
    "",
    `### 현재 검증 가능한 후보 중 우선 추천: ${aiRecommendedPaper?.title || "N/A"}`,
    "",
    `- **추천 이유**: ${data.aiRecommendation.recommendationReason}`,
    `- **최근 연구 흐름에서의 위치**: ${data.aiRecommendation.positionInRecentTrend}`,
    "",
    "#### 주요 강점",
    listItems(data.aiRecommendation.keyStrengths),
    "",
    "#### 주요 한계 및 위험요소",
    listItems(data.aiRecommendation.keyLimitationsOrRisks),
    "",
    "#### 검증 필요 사항",
    listItems(data.aiRecommendation.verificationNeededNotes),
    "",
    "---",
    "",
    "## 5. 선택 논문 상세 읽기 가이드 (Reading Checklist)",
    ""
  );

  if (finalChosenPaper) {
    const identifier = finalChosenPaper.doi
      ? `DOI: ${finalChosenPaper.doi}`
      : finalChosenPaper.arxivId
      ? `arXiv: ${finalChosenPaper.arxivId}`
      : finalChosenPaper.url || "링크 정보 확인 필요";

    lines.push(
      `### 최종 선택 논문: ${finalChosenPaper.title}`,
      "",
      `- **저자**: ${finalChosenPaper.authors.join(", ")} (${finalChosenPaper.year})`,
      `- **출판/Preprint**: ${finalChosenPaper.venueOrPreprint} (${finalChosenPaper.publicationStatus})`,
      `- **식별자 주소**: ${identifier}`,
      `- **코드 상태**: ${codeStatus(finalChosenPaper.codeStatus)} (${finalChosenPaper.codeUrl || "URL 미제공"})`,
      `- **데이터 상태**: ${codeStatus(finalChosenPaper.dataStatus)} (${finalChosenPaper.dataUrl || "URL 미제공"})`,
      `- **재현 가능성**: ${codeStatus(finalChosenPaper.reproducibilityStatus)}`,
      "",
      "#### 읽을 때 집중해서 검토할 질문",
      data.aiRecommendation.readingQuestions.map((q, idx) => `${idx + 1}. **${q}**`).join("\n") || "- 없음",
      "",
      "#### 후속 연구 및 아이디어 확장 질문",
      listItems(data.aiRecommendation.followUpResearchQuestions),
      ""
    );
  } else {
    lines.push("*아직 최종 논문을 선택하지 않았습니다. 화면에서 [이 논문 선택] 버튼을 눌러 확정하세요.*", "");
  }

  lines.push(
    "---",
    "",
    "## 6. 각 후보 논문별 평가 근거 (Grounded Evidence) & 불확실성 분해",
    ""
  );

  data.candidates.forEach((c, idx) => {
    lines.push(
      `### ${idx + 1}. ${c.title}`,
      `- **출판 정보**: ${c.venueOrPreprint} (교차검증 상태: ${codeStatus(c.crossVerificationStatus)})`,
      "- **6개 평가 축 점수 요약**:",
      `  - 성능 경쟁력: ${scoreText(c.scores.performance.score, c.scores.performance.status)} [상태: ${c.scores.performance.status}] (${c.scores.performance.reason || c.scores.performance.notes || "설명 없음"})`,
      `  - 방법론 신규성: ${scoreText(c.scores.novelty.score, c.scores.novelty.status)} [상태: ${c.scores.novelty.status}] (${c.scores.novelty.reason || c.scores.novelty.notes || "설명 없음"})`,
      `  - 연구 흐름 중요도: ${scoreText(c.scores.trendImportance.score, c.scores.trendImportance.status)} [상태: ${c.scores.trendImportance.status}] (${c.scores.trendImportance.reason || c.scores.trendImportance.notes || "설명 없음"})`,
      `  - 학술 유의미성: ${scoreText(c.scores.academicSignificance.score, c.scores.academicSignificance.status)} [상태: ${c.scores.academicSignificance.status}] (${c.scores.academicSignificance.reason || c.scores.academicSignificance.notes || "설명 없음"})`,
      `  - 실무·연구 적용 가치: ${scoreText(c.scores.practicalValue.score, c.scores.practicalValue.status)} [상태: ${c.scores.practicalValue.status}] (${c.scores.practicalValue.reason || c.scores.practicalValue.notes || "설명 없음"})`,
      `  - 재현 가능성: ${scoreText(c.scores.reproducibility.score, c.scores.reproducibility.status)} [상태: ${c.scores.reproducibility.status}] (${c.scores.reproducibility.reason || c.scores.reproducibility.notes || "설명 없음"})`,
      "",
      "#### 비교 연구 모듈",
      `- **SOTA 및 성능 위치**: ${c.comparisonModule?.sotaStatus || "검증 진행 중"}`,
      "- **1) 직접 비교 연구 (Direct Comparison)**:",
      c.comparisonModule?.directComparisonStudies?.length
        ? c.comparisonModule.directComparisonStudies.map((s) => `  - **${s.title}** (${s.year}): 과업 [${s.task}] | 데이터셋 [${s.dataset}] | 지표 [${s.metric}] | 성능 차이: ${s.performanceDiffNote} (식별자: ${s.identifier})`).join("\n")
        : "  - 해당 동일 조건 직접 비교 연구 없음",
      "- **2) 유사 과업 연구 (Near Task Comparison / 정량 직접 비교 제외)**:",
      c.comparisonModule?.nearTaskComparisonStudies?.length
        ? c.comparisonModule.nearTaskComparisonStudies.map((s) => `  - **${s.title}** (${s.year}): 과업 [${s.task}] | 데이터셋 [${s.dataset}] | 지표 [${s.metric}] | 간접 비교 사유: ${s.reasonNotDirectlyComparable || s.performanceDiffNote}`).join("\n")
        : "  - 해당 유사 과업 비교 연구 없음",
      "- **3) 맥락상 관련 연구 (Contextual Related)**:",
      c.comparisonModule?.contextualRelatedStudies?.length
        ? c.comparisonModule.contextualRelatedStudies.map((s) => `  - **${s.title}** (${s.year}): 관련 흐름 [${s.relatedFlow}] | 직접 비교 불가 사유: ${s.reasonDirectComparisonNotPossible}`).join("\n")
        : "  - 해당 맥락 관련 연구 없음",
      "- **4) 대표 선행 연구 (Representative Prior)**:",
      c.comparisonModule?.representativePriorStudies?.length
        ? c.comparisonModule.representativePriorStudies.map((s) => `  - **${s.title}** (${s.year}): 선행 연구 의의 [${s.significance}] | 관계: ${s.relationToTarget}`).join("\n")
        : "  - 해당 대표 선행 연구 없음",
      "",
      "#### 불확실성 3분할 (Uncertainty Breakdown)",
      "- **1) 사실 검증 필요 (Fact Verification)**:",
      indentedList(c.uncertainty?.factVerificationItems),
      "- **2) 평가 근거 부족 (Insufficient Evidence)**:",
      indentedList(c.uncertainty?.insufficientEvidenceItems),
      "- **3) 연구 Open Question**:",
      indentedList(c.uncertainty?.researchOpenQuestions),
      "",
      "#### 근거 원문 (Grounded Evidence)"
    );

    if (c.crossVerificationStatus === "NOT_FOUND") {
      lines.push(
        "- **논문 원문 근거**:",
        "  - 논문 식별 및 원문을 확인하지 못함",
        "- **외부 출처 근거**:",
        "  - 검증 가능한 동일 논문 출처를 확인하지 못함",
        "- **AI 종합 해석**:",
        "  - 논문 식별 미확정으로 평가 대상에서 제외"
      );
    } else {
      lines.push(
        "- **논문 원문 근거**:",
        c.scores.performance.evidence.paperText.map((p) => `  - [${p.sourceLocation || "원문"}] ${p.claim}`).join("\n") || "  - 원문 스니펫에서 직접 추출되지 않음",
        "- **외부 출처 근거**:",
        c.scores.performance.evidence.externalSource.map((e) => `  - [${e.sourceTitle || "외부"}] ${e.claim}`).join("\n") || "  - 외부 기록 확인 필요",
        "- **AI 종합 해석**:",
        c.scores.performance.evidence.aiInterpretation.map((a) => `  - ${a.claim}`).join("\n") || "  - AI 종합 분석 없음"
      );
    }

    lines.push("");
  });

  lines.push("", "*논문갈피 · 근거 기반 연구 의사결정 지원 서비스*", "");

  return lines.join("\n");
}
