import React from "react";
import { AiRecommendation, PaperCandidate } from "../types.js";
import { BookmarkCheck, Compass, CheckCircle2, AlertTriangle, HelpCircle, BookOpen, Check, FileSearch } from "lucide-react";
import { getPaperEvaluationStatus } from "../utils/evaluationHelpers.js";

interface AiRecommendationBannerProps {
  recommendation: AiRecommendation;
  candidates: PaperCandidate[];
  finalChoicePaperId: string | null;
  onSelectFinalChoice: (paperId: string) => void;
  onOpenEvidence: (paper: PaperCandidate) => void;
}

export const AiRecommendationBanner: React.FC<AiRecommendationBannerProps> = ({
  recommendation,
  candidates,
  finalChoicePaperId,
  onSelectFinalChoice,
  onOpenEvidence,
}) => {
  const recommendedPaper = candidates.find((c) => c.id === recommendation.topRecommendedPaperId);

  if (!recommendedPaper || !recommendation.topRecommendedPaperId || recommendation.isHeldDueToInsufficientEvidence) {
    return (
      <div className="bg-slate-900 rounded-xl border border-amber-500/40 p-6 sm:p-8 text-white shadow-lg mb-10 relative overflow-hidden">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-700/80 pb-4 mb-6">
          <div className="flex items-center space-x-2">
            <div className="w-8 h-8 rounded-lg bg-amber-500/15 border border-amber-400/30 flex items-center justify-center text-amber-300">
              <AlertTriangle className="w-4 h-4 text-amber-400" />
            </div>
            <div>
              <span className="text-xs font-semibold text-amber-300 uppercase tracking-wider">추천 보류</span>
              <h2 className="text-xl font-bold text-white">검증 가능한 근거가 더 필요합니다</h2>
            </div>
          </div>
          <div className="text-xs px-3 py-1 bg-amber-500/10 border border-amber-500/30 text-amber-300 rounded-lg font-medium">
            최종 선택 전 확인 필요
          </div>
        </div>

        <div className="bg-slate-950/70 rounded-xl p-5 border border-slate-700/60 mb-4">
          <p className="text-slate-200 text-sm leading-relaxed mb-3">
            <strong className="text-amber-300">보류 사유: </strong>
            {recommendation.recommendationReason || "충분한 검증 근거가 없어 추천을 보류합니다."}
          </p>
          <div className="text-xs text-slate-400 bg-slate-950/80 p-3 rounded-lg border border-slate-800">
            <span className="text-amber-300 font-semibold">근거 보완 안내: </span>
            {recommendation.tradeoffExplanation || "공식 서지 정보, 원문 근거, 평가 커버리지가 확보되면 우선 추천을 다시 계산합니다."}
          </div>
        </div>
      </div>
    );
  }

  const isFinalChoice = finalChoicePaperId === recommendedPaper.id;
  const evalStatus = getPaperEvaluationStatus(recommendedPaper);
  const hasUncertainty =
    evalStatus.status === "PARTIAL" ||
    (recommendedPaper.uncertainty?.factVerificationItems?.length || 0) > 0 ||
    (recommendation.verificationNeededNotes?.length || 0) > 0;

  return (
    <div className="bg-slate-900 rounded-xl border border-indigo-800/70 p-6 sm:p-8 text-white shadow-lg mb-10 relative overflow-hidden">
      <div className="absolute top-0 right-0 w-80 h-80 bg-indigo-500/5 rounded-full blur-3xl pointer-events-none" />

      <div className="relative z-10">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-indigo-900/80 pb-4 mb-6">
          <div className="flex items-center space-x-2">
            <div className="w-8 h-8 rounded-lg bg-indigo-500/15 border border-indigo-400/30 flex items-center justify-center text-indigo-300">
              <BookmarkCheck className="w-4 h-4 text-indigo-300" />
            </div>
            <div>
              <span className="text-xs font-semibold text-indigo-300 uppercase tracking-wider">논문갈피 추천 근거</span>
              <h2 className="text-xl font-bold text-white">현재 검증 가능한 후보 중 우선 추천</h2>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <button
              onClick={() => onOpenEvidence(recommendedPaper)}
              className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-indigo-200 border border-indigo-800/70 text-xs font-medium transition-colors"
            >
              평가 근거 보기
            </button>

            <button
              onClick={() => onSelectFinalChoice(recommendedPaper.id)}
              className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all shadow-md flex items-center space-x-1.5 ${
                isFinalChoice ? "bg-emerald-500 text-white shadow-emerald-500/20" : "bg-indigo-500 hover:bg-indigo-400 text-white shadow-indigo-500/30"
              }`}
            >
              {isFinalChoice ? (
                <><Check className="w-3.5 h-3.5" /><span>이번 주 선택 논문</span></>
              ) : (
                <span>이 논문 선택</span>
              )}
            </button>
          </div>
        </div>

        {hasUncertainty && (
          <div className="mb-5 bg-amber-500/12 border border-amber-400/30 rounded-xl p-3.5 text-xs text-amber-200 flex items-start space-x-2.5">
            <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
            <div className="leading-relaxed">
              <strong className="font-semibold text-amber-300">근거 확인 권장:</strong> 일부 평가 항목에 추가 확인 사항이 포함되어 있습니다. 점수만 보지 말고 원문 및 교차검증 근거를 함께 확인한 뒤 선택하세요.
            </div>
          </div>
        )}

        <div className="bg-slate-950/60 rounded-xl p-5 border border-indigo-900/70 mb-6">
          <div className="flex items-center space-x-2 text-xs text-indigo-300 font-semibold mb-1.5">
            <span>{recommendedPaper.venueOrPreprint} ({recommendedPaper.year})</span>
            <span>·</span>
            <span className="px-2 py-0.5 rounded text-[10px] bg-indigo-500/15 text-indigo-200 border border-indigo-500/25">
              {evalStatus.label} ({evalStatus.scoreDisplay})
            </span>
          </div>
          <h3 className="text-xl font-bold text-white mb-3 leading-snug">{recommendedPaper.title}</h3>
          <p className="text-slate-300 text-xs sm:text-sm leading-relaxed mb-3">
            <strong className="text-indigo-200">추천 근거: </strong>
            {recommendation.recommendationReason}
          </p>
          <div className="text-xs text-slate-400 bg-slate-900/80 p-3 rounded-lg border border-slate-800">
            <span className="text-indigo-300 font-semibold">최근 연구 흐름에서의 위치: </span>
            {recommendation.positionInRecentTrend}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6 text-xs">
          <div className="bg-slate-950/35 p-4 rounded-xl border border-indigo-900/50 space-y-2">
            <div className="font-bold text-emerald-300 flex items-center space-x-1.5">
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              <span>주요 강점</span>
            </div>
            <ul className="space-y-1.5 text-slate-300 pl-4 list-disc">
              {recommendation.keyStrengths.map((s, i) => <li key={i}>{s}</li>)}
            </ul>
          </div>

          <div className="bg-slate-950/35 p-4 rounded-xl border border-indigo-900/50 space-y-2">
            <div className="font-bold text-rose-300 flex items-center space-x-1.5">
              <AlertTriangle className="w-4 h-4 text-rose-400" />
              <span>한계 및 위험</span>
            </div>
            <ul className="space-y-1.5 text-slate-300 pl-4 list-disc">
              {recommendation.keyLimitationsOrRisks.map((l, i) => <li key={i}>{l}</li>)}
            </ul>
          </div>

          <div className="bg-slate-950/35 p-4 rounded-xl border border-indigo-900/50 space-y-2">
            <div className="font-bold text-amber-300 flex items-center space-x-1.5">
              <HelpCircle className="w-4 h-4 text-amber-400" />
              <span>추가 확인 사항</span>
            </div>
            <ul className="space-y-1.5 text-slate-300 pl-4 list-disc">
              {(recommendation.verificationNeededNotes || recommendation.consideredUncertainties || []).map((v, i) => <li key={i}>{v}</li>)}
            </ul>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-slate-950/70 p-5 rounded-xl border border-indigo-900/80 text-xs">
          <div>
            <div className="font-bold text-indigo-300 mb-2 flex items-center space-x-1.5">
              <BookOpen className="w-4 h-4 text-indigo-400" />
              <span>읽을 때 확인할 질문</span>
            </div>
            <ol className="space-y-2 text-slate-300 list-decimal pl-4">
              {recommendation.readingQuestions.map((q, idx) => <li key={idx} className="leading-relaxed">{q}</li>)}
            </ol>
          </div>

          <div>
            <div className="font-bold text-purple-300 mb-2 flex items-center space-x-1.5">
              <FileSearch className="w-4 h-4 text-purple-400" />
              <span>후속 연구 질문</span>
            </div>
            <ul className="space-y-2 text-slate-300 list-disc pl-4">
              {recommendation.followUpResearchQuestions.map((q, idx) => <li key={idx} className="leading-relaxed">{q}</li>)}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
};