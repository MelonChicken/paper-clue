import React from "react";
import { BriefingAnalysisResponse } from "../types.js";
import { buildCanonicalPaperEvaluations } from "../utils/paperSemantics.js";
import {
  FileText,
  ShieldCheck,
  FileCode2,
  Code2,
  Database,
  AlertTriangle,
} from "lucide-react";

interface ResearchOverviewProps {
  data: BriefingAnalysisResponse;
}

export const ResearchOverview: React.FC<ResearchOverviewProps> = ({ data }) => {
  const candidates = data.candidates || [];
  const canonicalPapers = buildCanonicalPaperEvaluations(candidates, data.aiRecommendation);
  const papersAnalyzed = canonicalPapers.length;

  const peerReviewedCount = canonicalPapers.filter((c) => c.verification.publicationStatus === "PEER_REVIEWED").length;
  const preprintsCount = canonicalPapers.filter((c) => c.verification.publicationStatus === "PREPRINT").length;
  const codeAvailableCount = canonicalPapers.filter((c) => c.verification.codeStatus === "CODE_AVAILABLE_VERIFIED").length;
  const datasetAvailableCount = canonicalPapers.filter((c) => c.verification.dataStatus === "PUBLIC_DATASET_VERIFIED").length;
  const needsVerificationCount = canonicalPapers.filter(
    (c) => c.uncertainty.factVerification.length > 0 || c.uncertainty.insufficientEvidence.length > 0 || c.verification.evaluationStatus === "INSUFFICIENT_EVIDENCE"
  ).length;
  const metrics = [
    {
      label: "분석된 논문",
      value: `${papersAnalyzed}편`,
      icon: FileText,
      color: "text-slate-900",
      bgColor: "bg-slate-50",
      borderColor: "border-slate-200",
    },
    {
      label: "동료심사 완료",
      value: `${peerReviewedCount}편`,
      icon: ShieldCheck,
      color: "text-blue-700",
      bgColor: "bg-blue-50/70",
      borderColor: "border-blue-200/80",
    },
    {
      label: "프리프린트",
      value: `${preprintsCount}편`,
      icon: FileCode2,
      color: "text-amber-700",
      bgColor: "bg-amber-50/70",
      borderColor: "border-amber-200/80",
    },
    {
      label: "코드 공개",
      value: `${codeAvailableCount}편`,
      icon: Code2,
      color: "text-emerald-700",
      bgColor: "bg-emerald-50/70",
      borderColor: "border-emerald-200/80",
    },
    {
      label: "데이터셋 공개",
      value: `${datasetAvailableCount}편`,
      icon: Database,
      color: "text-purple-700",
      bgColor: "bg-purple-50/70",
      borderColor: "border-purple-200/80",
    },
    {
      label: "추가 확인 필요",
      value: `${needsVerificationCount}건`,
      icon: AlertTriangle,
      color: "text-rose-700",
      bgColor: "bg-rose-50/70",
      borderColor: "border-rose-200/80",
    },
  ];

  return (
    <section id="research-overview" className="bg-white rounded-2xl border border-slate-200 shadow-xs p-5 sm:p-6 mb-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-slate-100 pb-3 mb-4 gap-2">
        <div>
          <span className="text-[11px] font-bold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded border border-indigo-100">
            1단계 · 연구 개요
          </span>
          <h2 className="text-lg font-bold text-slate-900 mt-1">
            {data.briefingTitle || "주간 연구 브리핑 분석 개요"}
          </h2>
        </div>
        <div className="text-xs text-slate-500">
          총 후보: <strong className="text-slate-800">{papersAnalyzed}편</strong>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {metrics.map((metric, i) => {
          const Icon = metric.icon;
          return (
            <div
              key={i}
              className={`p-3.5 rounded-xl border ${metric.borderColor} ${metric.bgColor} flex flex-col justify-between`}
            >
              <div className="flex items-center justify-between mb-1">
                <span className="text-[11px] font-medium text-slate-600 truncate">
                  {metric.label}
                </span>
                <Icon className={`w-3.5 h-3.5 ${metric.color} shrink-0`} />
              </div>
              <div className={`text-xl font-bold font-mono ${metric.color}`}>
                {metric.value}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
};

