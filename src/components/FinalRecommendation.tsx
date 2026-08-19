import React, { useState } from "react";
import { AiRecommendation, PaperCandidate } from "../types";
import { BookmarkCheck, CheckCircle2, ArrowRight, Copy, Check, FileDown, BookOpen, Info, ListChecks } from "lucide-react";
import { buildCanonicalPaperEvaluation, buildCanonicalRecommendationResult, sanitizeUserText, formatEvidenceForUser, formatStrengthForUser } from "../utils/paperSemantics";

interface FinalRecommendationProps {
  recommendation: AiRecommendation;
  candidates: PaperCandidate[];
  finalChoicePaperId: string | null;
  onSelectFinalChoice: (paperId: string) => void;
  onOpenReport: () => void;
}

export const FinalRecommendation: React.FC<FinalRecommendationProps> = ({
  recommendation,
  candidates,
  finalChoicePaperId,
  onSelectFinalChoice,
  onOpenReport,
}) => {
  const [copiedNote, setCopiedNote] = useState(false);
  const recommendedPaper = candidates.find((c) => c.id === recommendation.topRecommendedPaperId);
  const chosenPaper = candidates.find((c) => c.id === finalChoicePaperId);
  const targetPaper = chosenPaper || recommendedPaper;
  const targetCanonical = targetPaper ? buildCanonicalPaperEvaluation(targetPaper, recommendation) : null;
  const canonicalRecommendation = buildCanonicalRecommendationResult(candidates, recommendation);
  const isUserDiffChoice = Boolean(finalChoicePaperId && finalChoicePaperId !== recommendation.topRecommendedPaperId);
  const recommendationReason = formatStrengthForUser(
    canonicalRecommendation.tradeoffExplanation ||
      targetCanonical?.interpretation.strengths[0] ||
      sanitizeUserText(recommendation.recommendationReason, "추천 사유를 표시할 수 없습니다. 근거 상세를 확인해 주세요."),
    targetCanonical?.verification.publicationStatus || "UNKNOWN"
  );

  const handleCopyReadingNote = async () => {
    if (!targetPaper || !targetCanonical) return;

    const note = `# 읽기 노트: ${targetPaper.title}
저자: ${targetPaper.authors.join(", ")} (${targetPaper.year})
발표/게재: ${targetCanonical?.labels.publicationDisplay || "출판 상태 확인 필요"}
링크: ${targetCanonical?.identity.primaryUrl || "확인 필요"}

## 선택 근거와 강점
${(targetCanonical?.interpretation.strengths || []).slice(0, 3).map((s, i) => `${i + 1}. ${formatStrengthForUser(s, targetCanonical.verification.publicationStatus)}`).join("\n")}

${targetCanonical && targetCanonical.readingGuide.preReadingChecks.length > 0 ? `## 읽기 전 확인 필요\n${targetCanonical.readingGuide.preReadingChecks.map((item) => `- ${formatEvidenceForUser(item)}`).join("\n")}\n\n` : ""}## 읽으면서 확인할 질문\n${(targetCanonical?.readingGuide.questions || []).slice(0, 3).map((q, i) => `${i + 1}. ${formatEvidenceForUser(q)}`).join("\n")}

## 다음 단계
1. 방법론의 입력, 처리, 출력 구조를 확인한다.
2. 주요 벤치마크와 ablation 결과를 원문에서 확인한다.
3. 코드와 데이터 공개 상태를 재현 가능성 관점에서 확인한다.`;

    try {
      await navigator.clipboard.writeText(note);
      setCopiedNote(true);
      setTimeout(() => setCopiedNote(false), 2200);
    } catch (err) {
      console.error("Failed to copy reading note:", err);
    }
  };

  if (!targetPaper || !targetCanonical) return null;

  return (
    <section id="final-recommendation" className="bg-white rounded-xl border border-indigo-200 shadow-md p-6 sm:p-8 mb-10 relative overflow-hidden">
      <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-indigo-500 via-indigo-400 to-emerald-500" />

      <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-slate-100 pb-4 mb-6 gap-3">
        <div className="flex items-center space-x-2">
          <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center text-white">
            <BookmarkCheck className="w-4 h-4" />
          </div>
          <div>
            <span className="text-[11px] font-bold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded border border-indigo-100">
              4단계 · 이번 주 읽을 논문 정리
            </span>
            <h2 className="text-xl font-bold text-slate-900 mt-1">선택 논문 및 읽기 전략</h2>
          </div>
        </div>

        {finalChoicePaperId ? (
          <span className="px-3 py-1 text-xs font-bold rounded-lg bg-emerald-100 text-emerald-800 border border-emerald-200 flex items-center space-x-1">
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>최종 선택 확정</span>
          </span>
        ) : (
          <span className="px-3 py-1 text-xs font-semibold rounded-lg bg-amber-50 text-amber-800 border border-amber-200">선택 대기 중</span>
        )}
      </div>

      {isUserDiffChoice && (
        <div className="bg-blue-50/80 border border-blue-200 rounded-xl p-3.5 mb-6 text-xs text-blue-900 flex items-start space-x-2.5">
          <Info className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
          <div>
            <strong className="font-bold">사용자 선택을 반영했습니다.</strong>
            <p className="text-blue-800 mt-0.5">
              AI 제안 논문(<strong>{recommendedPaper?.title}</strong>) 대신 직접 선택한 논문(<strong>{targetPaper.title}</strong>)을 기준으로 리포트와 체크리스트가 구성됩니다.
            </p>
          </div>
        </div>
      )}

      <div className="bg-slate-900 text-white rounded-xl p-6 sm:p-7 mb-6 shadow-sm">
        <div className="text-indigo-300 text-xs font-mono font-semibold mb-1"># 이번 주 읽을 논문</div>
        <h3 className="text-xl sm:text-2xl font-bold text-white leading-tight mb-2">{targetPaper.title}</h3>
        <p className="text-xs sm:text-sm text-slate-300 mb-4">
          {targetCanonical.identity.authors.join(", ")} · <span className="text-indigo-300">{targetCanonical.labels.publicationDisplay}</span> ({targetCanonical.identity.year || "연도 확인 필요"})
        </p>
        <p className="text-xs text-slate-300 bg-slate-800/80 p-3.5 rounded-xl border border-slate-700/80 leading-relaxed">
          {recommendationReason}
        </p>
        {canonicalRecommendation.tradeoffExplanation && !isUserDiffChoice && (
          <p className="text-xs text-amber-100 bg-amber-900/30 p-3.5 rounded-xl border border-amber-700/60 leading-relaxed mt-3">
            {canonicalRecommendation.tradeoffExplanation}
          </p>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-7 text-xs leading-relaxed">
        <div className="bg-indigo-50/50 p-5 rounded-xl border border-indigo-100 space-y-3">
          <h4 className="text-sm font-bold text-indigo-950 flex items-center space-x-1.5">
            <ListChecks className="w-4 h-4 text-indigo-600" />
            <span>선택 근거와 강점</span>
          </h4>
          <ul className="space-y-2 text-slate-800">
            {targetCanonical.interpretation.strengths.slice(0, 3).map((strength, idx) => (
              <li key={idx} className="flex items-start space-x-2">
                <span className="w-4 h-4 rounded-full bg-indigo-200/80 text-indigo-800 flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5">{idx + 1}</span>
                <span className="text-slate-800 font-medium">{formatStrengthForUser(strength, targetCanonical.verification.publicationStatus)}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="bg-emerald-50/50 p-5 rounded-xl border border-emerald-100 space-y-3">
          <h4 className="text-sm font-bold text-emerald-950 flex items-center space-x-1.5">
            <BookOpen className="w-4 h-4 text-emerald-600" />
            <span>읽으면서 확인할 질문</span>
          </h4>
          <ul className="space-y-2 text-slate-800">
            {targetCanonical.readingGuide.questions.slice(0, 3).map((q, idx) => (
              <li key={idx} className="flex items-start space-x-2">
                <span className="w-4 h-4 rounded-full bg-emerald-200/80 text-emerald-800 flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5">{idx + 1}</span>
                <span className="text-slate-800 font-medium">{formatEvidenceForUser(q)}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-5 border-t border-slate-100">
        <button
          type="button"
          onClick={() => targetPaper && onSelectFinalChoice(targetPaper.id)}
          className="inline-flex items-center justify-center space-x-2 px-4 py-2 rounded-lg text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white shadow-xs"
        >
          <CheckCircle2 className="w-3.5 h-3.5" />
          <span>이 논문 선택</span>
        </button>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleCopyReadingNote}
            className="inline-flex items-center justify-center space-x-2 px-4 py-2 rounded-lg text-xs font-bold bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-200"
          >
            {copiedNote ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
            <span>{copiedNote ? "복사 완료" : "읽기 노트 복사"}</span>
          </button>
          <button
            type="button"
            onClick={onOpenReport}
            className="inline-flex items-center justify-center space-x-2 px-4 py-2 rounded-lg text-xs font-bold bg-indigo-600 hover:bg-indigo-500 text-white shadow-xs"
          >
            <FileDown className="w-3.5 h-3.5" />
            <span>리포트 열기</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </section>
  );
};





