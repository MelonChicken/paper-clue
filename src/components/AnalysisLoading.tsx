import React, { useEffect, useState } from "react";
import { Loader2, Check, Bookmark } from "lucide-react";

const STAGES = [
  { id: "parse", label: "주간 연구 브리핑 파싱" },
  { id: "extract", label: "후보 논문 추출 및 메타데이터 정리" },
  { id: "verify_meta", label: "학술 출처 및 게재 상태 검증" },
  { id: "check_res", label: "코드 저장소 및 데이터셋 확인" },
  { id: "eval_val", label: "연구 가치 및 신뢰도 다각도 평가" },
  { id: "build_comp", label: "다변 비교 데이터 및 추천 생성" },
];

export const AnalysisLoading: React.FC = () => {
  const [activeStageIndex, setActiveStageIndex] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setActiveStageIndex((prev) => {
        if (prev < STAGES.length - 1) return prev + 1;
        return prev;
      });
    }, 2400);

    return () => clearInterval(timer);
  }, []);

  return (
    <div className="max-w-xl mx-auto my-16 lg:my-20 p-7 sm:p-9 lg:p-10 bg-white rounded-xl border border-slate-200 shadow-sm text-center">
      <div className="w-14 h-14 mx-auto mb-5 rounded-xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600 relative">
        <Loader2 className="w-7 h-7 animate-spin" />
        <Bookmark className="absolute -right-1 -top-1 w-4 h-4 text-emerald-500 fill-emerald-100" />
      </div>

      <div className="text-xs font-extrabold text-indigo-700 mb-1">논문갈피</div>
      <h2 className="text-xl lg:text-2xl font-bold text-slate-900 mb-2">후보 논문 분석 중</h2>
      <p className="text-sm text-slate-500 mb-7">
        논문 신원, 학술 출처, 코드/데이터셋, 신뢰도 근거를 차례로 확인하고 있습니다.
      </p>

      <div className="space-y-3 text-left bg-slate-50 p-5 rounded-xl border border-slate-200/80">
        {STAGES.map((stage, idx) => {
          const isCompleted = idx < activeStageIndex;
          const isCurrent = idx === activeStageIndex;

          return (
            <div
              key={stage.id}
              className={`flex items-center space-x-3 text-sm py-1.5 transition-colors ${
                isCurrent ? "text-indigo-900 font-bold" : isCompleted ? "text-slate-700" : "text-slate-400 opacity-60"
              }`}
            >
              <div className="w-5 h-5 flex items-center justify-center shrink-0">
                {isCompleted ? (
                  <span className="w-5 h-5 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center">
                    <Check className="w-3.5 h-3.5" />
                  </span>
                ) : isCurrent ? (
                  <span className="w-3 h-3 rounded-full bg-indigo-600 animate-pulse" />
                ) : (
                  <span className="w-3 h-3 rounded-full border border-slate-300" />
                )}
              </div>
              <span className="leading-snug">{stage.label}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
};