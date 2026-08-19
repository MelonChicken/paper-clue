import React from "react";
import { BriefingExtraction } from "../types.js";
import { Database, Github, FileText, AlertTriangle, CheckCircle2, ListFilter } from "lucide-react";

interface ExtractionSummaryCardProps {
  extraction: BriefingExtraction;
  candidateCount: number;
}

export const ExtractionSummaryCard: React.FC<ExtractionSummaryCardProps> = ({
  extraction,
  candidateCount,
}) => {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 sm:p-6 mb-8">
      <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4">
        <div className="flex items-center space-x-2">
          <ListFilter className="w-5 h-5 text-indigo-600" />
          <h3 className="text-base font-bold text-slate-800">
            입력 브리핑 자동 구문 분류 및 조사 상태
          </h3>
        </div>
        <span className="text-xs px-2.5 py-1 rounded-full bg-indigo-50 text-indigo-700 font-semibold border border-indigo-100">
          분석 완료
        </span>
      </div>

      {/* Grid Counts */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
        <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200/80">
          <div className="flex items-center space-x-2 text-slate-500 mb-1">
            <FileText className="w-4 h-4 text-indigo-600" />
            <span className="text-xs font-semibold">평가 논문 후보</span>
          </div>
          <div className="text-xl font-bold text-slate-900">
            {candidateCount} <span className="text-xs font-normal text-slate-500">/ 최대 5편</span>
          </div>
        </div>

        <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200/80">
          <div className="flex items-center space-x-2 text-slate-500 mb-1">
            <Database className="w-4 h-4 text-emerald-600" />
            <span className="text-xs font-semibold">추출 데이터셋</span>
          </div>
          <div className="text-xl font-bold text-slate-900">
            {extraction?.datasetCount ?? 0} <span className="text-xs font-normal text-slate-500">개</span>
          </div>
        </div>

        <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200/80">
          <div className="flex items-center space-x-2 text-slate-500 mb-1">
            <Github className="w-4 h-4 text-purple-600" />
            <span className="text-xs font-semibold">GitHub 도구</span>
          </div>
          <div className="text-xl font-bold text-slate-900">
            {extraction?.githubToolCount ?? 0} <span className="text-xs font-normal text-slate-500">개</span>
          </div>
        </div>

        <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200/80">
          <div className="flex items-center space-x-2 text-slate-500 mb-1">
            <AlertTriangle className="w-4 h-4 text-amber-500" />
            <span className="text-xs font-semibold">추가 확인 필요</span>
          </div>
          <div className="text-xl font-bold text-amber-600">
            {extraction?.verificationNeededCount ?? 
              ((extraction?.uncertaintySummary?.factVerificationCount || 0) + (extraction?.uncertaintySummary?.insufficientEvidenceCount || 0))
            } <span className="text-xs font-normal text-slate-500">건</span>
          </div>
        </div>
      </div>

      {/* Extracted Details lists */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
        {/* Datasets & Tools */}
        <div className="space-y-3 bg-slate-50/50 p-3.5 rounded-xl border border-slate-100">
          <div>
            <span className="font-semibold text-slate-700 flex items-center space-x-1.5 mb-1.5">
              <Database className="w-3.5 h-3.5 text-emerald-600" />
              <span>추출된 데이터셋 목록</span>
            </span>
            {extraction?.datasets && extraction.datasets.length > 0 ? (
              <ul className="space-y-1 pl-4 list-disc text-slate-600">
                {extraction.datasets.map((d, i) => (
                  <li key={`ds-${d.name}-${i}`}>
                    <strong className="text-slate-800">{d.name}</strong>: {d.description}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-slate-400 pl-2">브리핑 내 데이터셋 없음</p>
            )}
          </div>

          <div>
            <span className="font-semibold text-slate-700 flex items-center space-x-1.5 mb-1.5">
              <Github className="w-3.5 h-3.5 text-purple-600" />
              <span>추출된 GitHub 도구 목록</span>
            </span>
            {extraction?.githubTools && extraction.githubTools.length > 0 ? (
              <ul className="space-y-1 pl-4 list-disc text-slate-600">
                {extraction.githubTools.map((g, i) => (
                  <li key={`gh-${g.name}-${i}`}>
                    <strong className="text-slate-800">{g.name}</strong>: {g.description}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-slate-400 pl-2">브리핑 내 GitHub 도구 없음</p>
            )}
          </div>
        </div>

        {/* Trends & Uncertainty Breakdown */}
        <div className="space-y-3 bg-slate-50/50 p-3.5 rounded-xl border border-slate-100">
          <div>
            <span className="font-semibold text-slate-700 flex items-center space-x-1.5 mb-1.5">
              <CheckCircle2 className="w-3.5 h-3.5 text-indigo-600" />
              <span>분야 주요 동향 포인트</span>
            </span>
            {extraction?.researchTrends && extraction.researchTrends.length > 0 ? (
              <ul className="space-y-1 pl-4 list-disc text-slate-600">
                {extraction.researchTrends.map((t, i) => (
                  <li key={`trend-${i}`}>{t}</li>
                ))}
              </ul>
            ) : (
              <p className="text-slate-400 pl-2">특이 동향 없음</p>
            )}
          </div>

          <div>
            <span className="font-semibold text-amber-800 flex items-center space-x-1.5 mb-1.5">
              <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
              <span>불확실성 세부 수치 요약</span>
            </span>
            <div className="bg-white p-2.5 rounded-lg border border-amber-200 text-amber-900 grid grid-cols-3 gap-2 text-center text-[11px] font-medium">
              <div>
                <span className="block text-slate-500 text-[10px]">사실검증</span>
                <span className="font-bold text-amber-800">{extraction?.uncertaintySummary?.factVerificationCount ?? 0}건</span>
              </div>
              <div>
                <span className="block text-slate-500 text-[10px]">근거부족</span>
                <span className="font-bold text-amber-800">{extraction?.uncertaintySummary?.insufficientEvidenceCount ?? 0}건</span>
              </div>
              <div>
                <span className="block text-slate-500 text-[10px]">Open Questions</span>
                <span className="font-bold text-amber-800">{extraction?.uncertaintySummary?.researchOpenQuestionCount ?? 0}건</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
