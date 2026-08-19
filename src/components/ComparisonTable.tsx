import React from "react";
import { PaperCandidate } from "../types.js";
import { Table, BookmarkCheck, Check, HelpCircle } from "lucide-react";
import { sortCandidatesByEvaluation } from "../utils/evaluationHelpers.js";
import { CORE_SCORE_KEYS, CORE_SCORE_LABELS, CoreScoreKey, buildCanonicalPaperEvaluation } from "../utils/paperSemantics.js";

interface ComparisonTableProps {
  candidates: PaperCandidate[];
  aiRecommendedId: string;
  finalChoicePaperId: string | null;
  onOpenEvidence: (paper: PaperCandidate, dimensionKey?: string) => void;
  onSelectFinalChoice: (paperId: string) => void;
}

export const ComparisonTable: React.FC<ComparisonTableProps> = ({
  candidates,
  aiRecommendedId,
  finalChoicePaperId,
  onOpenEvidence,
  onSelectFinalChoice,
}) => {
  const sortedCandidates = sortCandidatesByEvaluation(candidates, aiRecommendedId);

  const renderScoreCell = (paper: PaperCandidate, dimensionKey: CoreScoreKey, score: number | null) => {
    if (score === null) {
      return (
        <td onClick={() => onOpenEvidence(paper, dimensionKey)} className="p-3 text-center cursor-pointer hover:bg-slate-100/80 transition-colors">
          <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-amber-100 text-amber-800 border border-amber-200">
            <HelpCircle className="w-3 h-3" />
            <span>근거 부족</span>
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
        <table className="w-full text-left text-xs border-collapse min-w-[1040px]">
          <thead>
            <tr className="bg-slate-900 text-slate-200 border-b border-slate-800">
              <th className="p-3 font-semibold pl-6 min-w-[220px]">논문 후보명</th>
              <th className="p-3 font-semibold text-center">평가 상태</th>
              {CORE_SCORE_KEYS.map((key) => (
                <th key={key} className="p-3 font-semibold text-center">{CORE_SCORE_LABELS[key]}</th>
              ))}
              <th className="p-3 font-semibold text-center bg-slate-800">출판 상태</th>
              <th className="p-3 font-semibold text-center bg-slate-800">코드 상태</th>
              <th className="p-3 font-semibold text-center bg-slate-800">데이터 상태</th>
              <th className="p-3 font-semibold text-center pr-6">최종 선택</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {sortedCandidates.map((paper) => {
              const canonical = buildCanonicalPaperEvaluation(paper);
              const isAiRec = paper.id === aiRecommendedId;
              const isFinalChoice = paper.id === finalChoicePaperId;

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
                      {canonical.identity.title}
                    </button>
                    <div className="text-[11px] text-slate-400 font-normal mt-0.5">
                      {canonical.identity.venue || "출처 확인 필요"} ({canonical.identity.year || "연도 확인 필요"})
                    </div>
                  </td>

                  <td className="p-3 text-center">
                    <span className="inline-block px-2 py-0.5 rounded text-[10px] font-bold border bg-slate-100 text-slate-700 border-slate-200">{canonical.labels.evaluationStatus}</span>
                    <div className="text-[10px] text-slate-500 font-medium mt-0.5">{canonical.labels.scoreDisplay}</div>
                  </td>

                  {CORE_SCORE_KEYS.map((key) => renderScoreCell(paper, key, canonical.evaluation[key]))}
                  <td className="p-3 text-center bg-slate-50 text-[11px] text-slate-600">{canonical.labels.publicationStatus}</td>
                  <td className="p-3 text-center bg-slate-50 text-[11px] text-slate-600">{canonical.labels.codeStatus}</td>
                  <td className="p-3 text-center bg-slate-50 text-[11px] text-slate-600">{canonical.labels.dataStatus}</td>

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
