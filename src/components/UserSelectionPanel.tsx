import React from "react";
import { PaperCandidate } from "../types.js";
import { UserCheck, BookmarkCheck, CheckCircle2, Info } from "lucide-react";

interface UserSelectionPanelProps {
  candidates: PaperCandidate[];
  aiRecommendedId: string;
  finalChoicePaperId: string | null;
  onSelectFinalChoice: (paperId: string) => void;
  onOpenReport: () => void;
}

export const UserSelectionPanel: React.FC<UserSelectionPanelProps> = ({
  candidates,
  aiRecommendedId,
  finalChoicePaperId,
  onSelectFinalChoice,
  onOpenReport,
}) => {
  const chosenPaper = candidates.find((c) => c.id === finalChoicePaperId);
  const aiPaper = candidates.find((c) => c.id === aiRecommendedId);
  const isDiff = Boolean(finalChoicePaperId && finalChoicePaperId !== aiRecommendedId);

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 sm:p-6 mb-10">
      <div className="flex items-center justify-between border-b border-slate-100 pb-4 mb-4">
        <div className="flex items-center space-x-2">
          <UserCheck className="w-5 h-5 text-emerald-600" />
          <h3 className="text-base font-bold text-slate-900">사용자 최종 선택</h3>
        </div>
        <span className="text-xs font-semibold px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200">
          이번 주 읽을 논문 결정
        </span>
      </div>

      <p className="text-xs text-slate-500 mb-4">
        AI는 조사 결과를 바탕으로 근거를 제시합니다. 최종 선택은 연구자의 실제 연구 상황과 목적에 맞춰 직접 결정합니다.
      </p>

      {isDiff && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-3.5 mb-5 text-xs text-blue-900 flex items-start space-x-2">
          <Info className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
          <div>
            <strong className="font-bold">AI 추천과 다른 논문을 최종 선택했습니다.</strong>
            <p className="text-blue-800 mt-0.5">
              AI 추천(<strong>{aiPaper?.title}</strong>)과 사용자 선택(<strong>{chosenPaper?.title}</strong>)이 리포트에 구분되어 기록됩니다.
            </p>
          </div>
        </div>
      )}

      <div className="space-y-3 mb-6">
        {candidates.map((cand) => {
          const isChosen = cand.id === finalChoicePaperId;
          const isAi = cand.id === aiRecommendedId;

          return (
            <div
              key={cand.id}
              onClick={() => onSelectFinalChoice(cand.id)}
              className={`p-4 rounded-xl border transition-all cursor-pointer flex items-center justify-between gap-4 relative overflow-hidden ${
                isChosen ? "bg-emerald-50/80 border-emerald-400 ring-1 ring-emerald-400 shadow-xs" : "bg-slate-50 border-slate-200 hover:border-slate-300 hover:bg-white"
              }`}
            >
              {isChosen && <div className="absolute top-0 right-4 w-4 h-7 bg-emerald-500 rounded-b-sm" aria-hidden="true" />}
              <div className="flex-1 min-w-0 pr-4">
                <div className="flex items-center space-x-2 mb-1">
                  {isAi && (
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-indigo-600 text-white flex items-center space-x-1">
                      <BookmarkCheck className="w-2.5 h-2.5" /> <span>AI 추천</span>
                    </span>
                  )}
                  {isChosen && (
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-600 text-white flex items-center space-x-1">
                      <CheckCircle2 className="w-2.5 h-2.5" /> <span>사용자 최종 선택</span>
                    </span>
                  )}
                  <span className="text-xs text-slate-500">{cand.venueOrPreprint}</span>
                </div>

                <h4 className="font-bold text-slate-900 text-sm truncate">{cand.title}</h4>
                <p className="text-xs text-slate-500 truncate">{cand.authors.join(", ")} ({cand.year})</p>
              </div>

              <div className="shrink-0">
                <button
                  type="button"
                  className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${
                    isChosen ? "bg-emerald-600 text-white shadow-sm" : "bg-white text-slate-700 border border-slate-300 hover:bg-slate-100"
                  }`}
                >
                  {isChosen ? "선택됨" : "이 논문 선택"}
                </button>
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex items-center justify-between pt-4 border-t border-slate-100 gap-4">
        <div className="text-xs text-slate-500">
          선택을 마치면 최종 리포트를 복사하거나 Markdown 파일로 내려받을 수 있습니다.
        </div>

        <button
          onClick={onOpenReport}
          disabled={!finalChoicePaperId}
          className={`px-6 py-2.5 rounded-xl text-xs font-bold text-white shadow-md transition-all ${
            !finalChoicePaperId ? "bg-slate-300 cursor-not-allowed shadow-none" : "bg-emerald-600 hover:bg-emerald-500 shadow-emerald-600/20"
          }`}
        >
          Markdown 리포트 보기
        </button>
      </div>
    </div>
  );
};