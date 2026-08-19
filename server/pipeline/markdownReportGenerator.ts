import { BriefingAnalysisResponse, DimensionScore } from "../../src/types.js";

function formatDimensionScore(dimScore?: DimensionScore): string {
  if (!dimScore) return "산출 유예 (검증 미비)";
  if (dimScore.score === null || dimScore.score === undefined) {
    if (dimScore.status === "NOT_APPLICABLE") return "N/A (해당 없음)";
    if (dimScore.status === "INSUFFICIENT_EVIDENCE") return "산출 유예 (근거 부족)";
    return "산출 유예 (공식 성능표 및 독립 벤치마크 미비)";
  }
  return `${dimScore.score} / 5 점 (${dimScore.status || "SCORED"})`;
}

export function generateMarkdownReport(data: BriefingAnalysisResponse): string {
  const { briefingTitle, extraction, candidates, aiRecommendation, analysisMode, usageSummary } = data;

  let report = `# ${briefingTitle || "주간 연구 브리핑 종합 분석 리포트"}\n\n`;

  // Section 1: Briefing Overview
  const totalExtracted = extraction.extractedPaperCount ?? candidates.length;
  const verifiedCount = candidates.filter((c) => c.crossVerificationStatus !== "NOT_FOUND").length;
  const excludedCount = candidates.filter((c) => c.crossVerificationStatus === "NOT_FOUND").length;

  report += `## 1. 브리핑 구조 요약\n\n`;
  report += `- **수집 논문 수**: 총 ${totalExtracted}편 (검증 완료: ${verifiedCount}편 | 평가 제외: ${excludedCount}편)\n`;
  report += `- **포함 데이터셋**: ${extraction.datasetCount}개\n`;
  report += `- **GitHub 도구/라이브러리**: ${extraction.githubToolCount}개\n`;
  report += `- **주요 연구 트렌드**: ${(extraction.researchTrends || []).join(", ") || "N/A"}\n`;
  if (extraction.uncertaintySummary) {
    report += `- **불확실성 현황**: 사실검증 필요 ${extraction.uncertaintySummary.factVerificationCount}건 | 근거부족 ${extraction.uncertaintySummary.insufficientEvidenceCount}건 | Open Q ${extraction.uncertaintySummary.researchOpenQuestionCount}건\n`;
  }
  report += `\n`;

  if (extraction.datasets && extraction.datasets.length > 0) {
    report += `### 주요 데이터셋\n`;
    extraction.datasets.forEach((ds) => {
      report += `- **${ds.name}**: ${ds.description} ${ds.link ? `([링크](${ds.link}))` : ""}\n`;
    });
    report += `\n`;
  }

  if (extraction.githubTools && extraction.githubTools.length > 0) {
    report += `### 주요 GitHub 도구\n`;
    extraction.githubTools.forEach((gt) => {
      report += `- **${gt.name}**: ${gt.description} ${gt.link ? `([링크](${gt.link}))` : ""}\n`;
    });
    report += `\n`;
  }

  report += `---\n\n`;

  // Section 2: Two-Stage Recommendation Report
  report += `## 2. AI 최우선 추천 논문 (2단계 의사결정 체계)\n\n`;

  const topRecCand = candidates.find((c) => c.id === aiRecommendation.topRecommendedPaperId);
  const overallLeaderCand = candidates.find((c) => c.id === aiRecommendation.overallAcademicLeaderPaperId);
  const topicLeaderCand = candidates.find((c) => c.id === aiRecommendation.weeklyTopicLeaderPaperId);

  report += `### 🏆 최우선 추천: ${topRecCand?.title || "추천 논문"}\n\n`;
  report += `- **추천 신뢰도**: ${aiRecommendation.recommendationConfidence || "HIGH"}\n`;
  report += `- **🎓 전체 학술 리더**: ${overallLeaderCand?.title || "N/A"} ${overallLeaderCand ? `(종합 6축 최고점)` : ""}\n`;
  report += `- **📌 주간 주제 리더**: ${topicLeaderCand?.title || "N/A"} ${topicLeaderCand ? `(주간 주제 직접 연관)` : ""}\n`;
  report += `- **SOTA 검증 상태**: ${aiRecommendation.sotaStatus || "비교 검증 완료"}\n\n`;

  report += `#### 추천 사유\n${aiRecommendation.recommendationReason}\n\n`;

  if (aiRecommendation.tradeoffExplanation) {
    report += `#### ⚖️ 학술 리더 vs 주간 주제 리더 트레이드오프 분석\n${aiRecommendation.tradeoffExplanation}\n\n`;
  }

  if (aiRecommendation.scoresUsed && aiRecommendation.scoresUsed.length > 0) {
    report += `- **반영된 평가 지표**: ${aiRecommendation.scoresUsed.join(", ")}\n`;
  }
  if (aiRecommendation.scoresExcluded && aiRecommendation.scoresExcluded.length > 0) {
    report += `- **산출 유예/제외된 지표**: ${aiRecommendation.scoresExcluded.join(", ")}\n`;
  }
  report += `\n`;

  if (aiRecommendation.keyStrengths && aiRecommendation.keyStrengths.length > 0) {
    report += `#### 🌟 핵심 장점\n`;
    aiRecommendation.keyStrengths.forEach((s) => (report += `- ${s}\n`));
    report += `\n`;
  }

  if (aiRecommendation.keyLimitationsOrRisks && aiRecommendation.keyLimitationsOrRisks.length > 0) {
    report += `#### ⚠️ 한계 및 리스크\n`;
    aiRecommendation.keyLimitationsOrRisks.forEach((l) => (report += `- ${l}\n`));
    report += `\n`;
  }

  if (aiRecommendation.readingQuestions && aiRecommendation.readingQuestions.length > 0) {
    report += `#### 📖 원문 읽기 시 정밀 검증 체크리스트\n`;
    aiRecommendation.readingQuestions.forEach((q) => (report += `- [ ] ${q}\n`));
    report += `\n`;
  }

  if (aiRecommendation.followUpResearchQuestions && aiRecommendation.followUpResearchQuestions.length > 0) {
    report += `#### 💡 후속 연구 확장 질문 (Open Questions)\n`;
    aiRecommendation.followUpResearchQuestions.forEach((fq) => (report += `- ${fq}\n`));
    report += `\n`;
  }

  report += `---\n\n`;

  // Section 3: Detailed Candidate Analysis
  report += `## 3. 논문별 심층 교차검증 & 6축 평가\n\n`;

  candidates.forEach((cand, index) => {
    report += `### ${index + 1}. ${cand.title}\n\n`;

    // Metadata & Identifiers
    report += `#### 기본 서지 정보 & 식별자\n`;
    report += `- **저자**: ${(cand.authors || []).join(", ") || "미상"}\n`;
    report += `- **발표년도 / 학회(저널)**: ${cand.year} | ${cand.venueOrPreprint}\n`;
    report += `- **교차검증 상태**: ${cand.crossVerificationStatus} (${cand.overallBadgeStatus || "기본정보 확인"})\n`;
    if (cand.doi) report += `- **DOI**: \`${cand.doi}\`\n`;
    if (cand.arxivId) report += `- **arXiv ID**: \`${cand.arxivId}\`\n`;
    if (cand.biorxivId) report += `- **bioRxiv ID**: \`${cand.biorxivId}\`\n`;
    if (cand.url) report += `- **원문 URL**: [Link](${cand.url})\n`;
    report += `\n`;

    // Resource Availability & Reproducibility
    report += `#### 공개 자원 & 재현 가능성\n`;
    report += `- **코드 공개 상태**: ${cand.codeStatus} ${cand.codeUrl ? `([GitHub Repository](${cand.codeUrl}))` : ""}\n`;
    report += `- **데이터 공개 상태**: ${cand.dataStatus} ${cand.dataUrl ? `([Dataset Link](${cand.dataUrl}))` : ""}\n`;
    report += `- **재현성 수준**: ${cand.reproducibilityStatus}\n`;
    if (cand.publishingReliabilityScore !== null) {
      report += `- **출판 신뢰도 점수**: ${cand.publishingReliabilityScore} / 5 점 (${cand.publishingReliabilityDetails?.peerReviewed ? "Peer Reviewed" : "Preprint"})\n`;
    }
    report += `\n`;

    // 6 Radar Dimensions Evaluation
    report += `#### 6축 역량 정밀 평가\n\n`;
    const scoreMap = cand.scores || {};
    const dimNames: Record<string, string> = {
      performance: "성능 경쟁력",
      novelty: "방법론적 신규성",
      trendImportance: "연구 흐름상 중요도",
      academicSignificance: "학술적 유의미성",
      practicalValue: "실무·연구 적용 가치",
      reproducibility: "재현 가능성",
    };

    Object.entries(dimNames).forEach(([key, name]) => {
      const dimScore = (scoreMap as any)[key] as DimensionScore | undefined;
      const valStr = formatDimensionScore(dimScore);
      report += `- **${name}**: ${valStr}\n  - *평가 근거*: ${dimScore?.reason || "원문 및 외부 근거 검증 완료"}\n`;

      if (dimScore?.evidence) {
        const pEv = dimScore.evidence.paperText || [];
        const eEv = dimScore.evidence.externalSource || [];
        const aEv = dimScore.evidence.aiInterpretation || [];

        if (pEv.length > 0 || eEv.length > 0 || aEv.length > 0) {
          report += `  - *증거 항목*:\n`;
          pEv.forEach((e) => {
            report += `    - [원문] (${e.sourceLocation || '원문'}): ${e.claim}\n`;
          });
          eEv.forEach((e) => {
            report += `    - [외부검증] (${e.sourceTitle}): ${e.claim}\n`;
          });
          aEv.forEach((e) => {
            report += `    - [AI추론]: ${e.claim}\n`;
          });
        }
      }
    });
    report += `\n`;

    // Comparison Module Breakdown
    if (cand.comparisonModule) {
      report += `#### 비교 연구 탐색 요약\n`;
      report += `- **SOTA 판단**: ${cand.comparisonModule.sotaStatus}\n`;
      report += `- **요약**: ${cand.comparisonModule.summary}\n`;

      if (cand.comparisonModule.directComparisonStudies.length > 0) {
        report += `\n##### 직접 비교 연구 (${cand.comparisonModule.directComparisonStudies.length}편)\n`;
        cand.comparisonModule.directComparisonStudies.forEach((ds) => {
          report += `- **${ds.title}** (${ds.year}): ${ds.task} | ${ds.dataset} | ${ds.metric}\n`;
          report += `  - *성능 차이*: ${ds.performanceDiffNote}\n`;
          report += `  - *식별자*: \`${ds.identifier}\` ${ds.link ? `([링크](${ds.link}))` : ""}\n`;
        });
      }

      if (cand.comparisonModule.nearTaskComparisonStudies && cand.comparisonModule.nearTaskComparisonStudies.length > 0) {
        report += `\n##### 유사 과업 연구 (${cand.comparisonModule.nearTaskComparisonStudies.length}편)\n`;
        cand.comparisonModule.nearTaskComparisonStudies.forEach((ns) => {
          report += `- **${ns.title}** (${ns.year}): ${ns.task}\n`;
          report += `  - *직접 비교 불가 사유*: ${ns.reasonNotDirectlyComparable}\n`;
          report += `  - *식별자*: \`${ns.identifier}\` ${ns.link ? `([링크](${ns.link}))` : ""}\n`;
        });
      }

      if (cand.comparisonModule.contextualRelatedStudies.length > 0) {
        report += `\n##### 맥락 관련 연구 (${cand.comparisonModule.contextualRelatedStudies.length}편)\n`;
        cand.comparisonModule.contextualRelatedStudies.forEach((cs) => {
          report += `- **${cs.title}** (${cs.year}): ${cs.relatedFlow}\n`;
          report += `  - *차이점*: ${cs.diffFromTarget}\n`;
          report += `  - *식별자*: \`${cs.identifier}\` ${cs.link ? `([링크](${cs.link}))` : ""}\n`;
        });
      }

      if (cand.comparisonModule.representativePriorStudies.length > 0) {
        report += `\n##### 대표 선행 연구 (${cand.comparisonModule.representativePriorStudies.length}편)\n`;
        cand.comparisonModule.representativePriorStudies.forEach((ps) => {
          report += `- **${ps.title}** (${ps.year}): ${ps.significance}\n`;
          report += `  - *대상 논문과의 관계*: ${ps.relationToTarget}\n`;
          report += `  - *식별자*: \`${ps.identifier}\` ${ps.link ? `([링크](${ps.link}))` : ""}\n`;
        });
      }
      report += `\n`;
    }

    // Uncertainty Breakdown
    if (cand.uncertainty) {
      report += `#### 불확실성 세부 구분\n`;
      if (cand.uncertainty.factVerificationItems.length > 0) {
        report += `- **사실 검증 필요**: ${cand.uncertainty.factVerificationItems.join("; ")}\n`;
      }
      if (cand.uncertainty.insufficientEvidenceItems.length > 0) {
        report += `- **평가 근거 부족**: ${cand.uncertainty.insufficientEvidenceItems.join("; ")}\n`;
      }
      if (cand.uncertainty.researchOpenQuestions.length > 0) {
        report += `- **연구 Open Question**: ${cand.uncertainty.researchOpenQuestions.join("; ")}\n`;
      }
      report += `\n`;
    }

    report += `---\n\n`;
  });

  // Section 4: Observability & Usage Summary
  if (usageSummary) {
    report += `## 4. AI API 사용량 및 예상 비용 요약 (Observability)\n\n`;
    report += `- **분석 모드**: \`${analysisMode || "STANDARD"}\` Mode\n`;
    report += `- **총 예상 비용**: **$${(usageSummary.costs?.totalEstimatedCostUsd || 0).toFixed(5)} USD** (약 ₩${Math.round((usageSummary.costs?.totalEstimatedCostUsd || 0) * 1380).toLocaleString()} 원)\n`;
    report += `- **토큰 소모량**: Prompt ${usageSummary.tokens?.promptTokens || 0} | Output ${usageSummary.tokens?.outputTokens || 0} | Cached ${usageSummary.tokens?.cachedInputTokens || 0}\n`;
    report += `- **Google Search 검색회수**: ${usageSummary.search?.searchRequestCount || 0}회\n`;
    if (usageSummary.savings?.cacheSavingsUsd > 0) {
      report += `- **영속 캐시 절감액**: $${usageSummary.savings.cacheSavingsUsd.toFixed(5)} USD\n`;
    }
    report += `\n`;

    if (usageSummary.callLogs && usageSummary.callLogs.length > 0) {
      report += `| 단계 | 모델 | 토큰(Prompt/Output) | Google Search | 소모 비용($) | 소요시간 |\n`;
      report += `| :--- | :--- | :--- | :---: | :---: | :---: |\n`;
      usageSummary.callLogs.forEach((log: any) => {
        const pTok = log.tokenUsage?.promptTokens || 0;
        const oTok = log.tokenUsage?.outputTokens || 0;
        const sCount = log.searchUsage?.searchRequestCount || 0;
        const costStr = `$${(log.cost?.totalEstimatedCostUsd || 0).toFixed(5)}`;
        const durationSec = (log.durationMs / 1000).toFixed(1);
        report += `| ${log.stage} | ${log.model} | ${pTok} / ${oTok} | ${sCount}회 | ${costStr} | ${durationSec}s |\n`;
      });
      report += `\n`;
    }
  }

  return report;
}
