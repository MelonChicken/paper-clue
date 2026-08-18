import React from "react";
import { PaperCandidate } from "../types";
import { Table, BookmarkCheck, Check, HelpCircle } from "lucide-react";
import { getPaperEvaluationStatus, sortCandidatesByEvaluation } from "../utils/evaluationHelpers";

interface ComparisonTableProps {
  candidates: PaperCandidate[];
  aiRecommendedId: string;
  finalChoicePaperId: string | null;
  onOpenEvidence: (paper: PaperCandidate, dimensionKey?: string) => void;
  onSelectFinalChoice: (paperId: string) => void;
}

const SCORE_COLUMNS = [
  ["performance", "성능 경쟁력"],
  ["novelty", "방법론 신규성"],
  ["trendImportance", "연구 흐름"],
  ["academicSignificance", "학술 유의미성"],
  ["practicalValue", "실무·연구 적용"],
  ["reproducibility", "재현 가능성"],
] as const;

export const ComparisonTable: React.FC<ComparisonTableProps> = ({
  candidates,
  aiRecommendedId,
  finalChoicePaperId,
  onOpenEvidence,
  onSelectFinalChoice,
}) => {
  const sortedCandidates = sortCandidatesByEvaluation(candidates, aiRecommendedId);

  const renderScoreCell = (paper: PaperCandidate, dimensionKey: keyof PaperCandidate["scores"], score: number | null) => {
    const dimObj = paper.scores[dimensionKey];
    const status = dimObj?.status;

    if (score === null) {
      const isNA = status === "NOT_APPLICABLE";
      const isNeedsVerification = status === "NEEDS_VERIFICATION";
      const label = isNA ? "해당 없음" : isNeedsVerification ? "추가 확인" : "평가 보류";
      return (
        <td onClick={() => onOpenEvidence(paper, dimensionKey)} className="p-3 text-center cursor-pointer hover:bg-slate-100/80 transition-colors">
          <span
            className={`inline-flex items-center space-x-1 px-2 py-0.5 rounded text-[10px] font-semibold ${
              isNA
                ? "bg-slate-100 text-slate-600 border border-slate-200"
                : isNeedsVerification
                ? "bg-blue-50 text-blue-700 border border-blue-200"
                : "bg-amber-100 text-amber-800 border border-amber-200"
            }`}
          >
            <HelpCircle className="w-3 h-3" />
            <span>{label}</span>
          </span>
        </td>
      );
    }

    let colorClass = "bg-slate-100 text-slate-800 border-slate-200";
    if (score >= 4) colorClass = "bg-indigo-100 text-indigo-900 border-indigo-300 font-bold";
    else if (score <= 2) colorClass = "bg-rose-50 text-rose-800 border-rose-200";

    return (
      <td onClick={() => onOpenEvidence(paper, dimensionKey)} className="p-3 text-center cursor-pointer hover:bg-slate-100/80 transition-colors">
        <span className={`inline-block px-2.5 py-1 rounded-md text-xs border ${colorClass}`}>{score}점</span>
      </td>
    );
  };

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 sm:p-6 mb-10 overflow-hidden">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-slate-100 pb-4 mb-4 gap-2">
        <div>
          <div className="flex items-center space-x-2">
            <Table className="w-5 h-5 text-indigo-600" />
            <h3 className="text-base font-bold text-slate-900">후보 논문 종합 평가 비교표</h3>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            셀을 클릭하면 해당 논문 및 평가 항목의 원문, 외부 출처, AI 해석 근거를 확인할 수 있습니다.
          </p>
        </div>
      </div>

      <div className="overflow-x-auto -mx-5 sm:-mx-6">
        <table className="w-full text-left text-xs border-collapse min-w-[960px]">
          <thead>
            <tr className="bg-slate-900 text-slate-200 border-b border-slate-800">
              <th className="p-3 font-semibold pl-6 min-w-[220px]">논문 후보명</th>
              <th className="p-3 font-semibold text-center">평가 상태</th>
              {SCORE_COLUMNS.map(([, label]) => (
                <th key={label} className="p-3 font-semibold text-center">{label}</th>
              ))}
              <th className="p-3 font-semibold text-center bg-slate-800">출판 신뢰도</th>
              <th className="p-3 font-semibold text-center bg-slate-800">최신성</th>
              <th className="p-3 font-semibold text-center pr-6">최종 선택</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {sortedCandidates.map((paper) => {
              const isAiRec = paper.id === aiRecommendedId;
              const isFinalChoice = paper.id === finalChoicePaperId;
              const evalStatus = getPaperEvaluationStatus(paper);

              return (
                <tr
                  key={paper.id}
                  className={`transition-colors ${
                    isFinalChoice ? "bg-emerald-50/50 hover:bg-emerald-50" : isAiRec ? "bg-indigo-50/40 hover:bg-indigo-50/70" : "hover:bg-slate-50"
                  }`}
                >
                  <td className="p-3 pl-6 font-semibold text-slate-900">
                    <div className="flex items-center space-x-1.5 mb-0.5">
                      {isAiRec && (
                        <span className="px-1.5 py-0.5 text-[10px] bg-indigo-600 text-white rounded font-bold inline-flex items-center space-x-0.5">
                          <BookmarkCheck className="w-2.5 h-2.5" /> <span>AI 추천</span>
                        </span>
                      )}
                      {isFinalChoice && (
                        <span className="px-1.5 py-0.5 text-[10px] bg-emerald-600 text-white rounded font-bold inline-flex items-center space-x-0.5">
                          <Check className="w-2.5 h-2.5" /> <span>선택됨</span>
                        </span>
                      )}
                    </div>
                    <button className="line-clamp-2 text-left text-slate-800 hover:text-indigo-600" onClick={() => onOpenEvidence(paper)}>
                      {paper.title}
                    </button>
                    <div className="text-[11px] text-slate-400 font-normal mt-0.5">
                      {paper.venueOrPreprint} ({paper.year})
                    </div>
                  </td>

                  <td className="p-3 text-center">
                    <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold border ${evalStatus.badgeClass}`}>{evalStatus.label}</span>
                    <div className="text-[10px] text-slate-500 font-medium mt-0.5">{evalStatus.scoreDisplay}</div>
                  </td>

                  {SCORE_COLUMNS.map(([key]) => renderScoreCell(paper, key, paper.scores[key].score))}

                  {renderScoreCell(paper, "academicSignificance", paper.publishingReliabilityScore)}
                  {renderScoreCell(paper, "trendImportance", paper.recencyScore)}

                  <td className="p-3 pr-6 text-center">
                    <button
                      type="button"
                      onClick={() => onSelectFinalChoice(paper.id)}
                      className={`px-3 py-1.5 rounded-lg font-bold text-[11px] transition-all ${
                        isFinalChoice ? "bg-emerald-600 text-white shadow-xs" : "bg-white text-slate-700 border border-slate-300 hover:bg-slate-50"
                      }`}
                    >
                      {isFinalChoice ? "선택됨" : "이 논문 선택"}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};