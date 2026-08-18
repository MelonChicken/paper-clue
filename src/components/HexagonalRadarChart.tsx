import React, { useState } from "react";
import { PaperCandidate } from "../types";
import {
  ResponsiveContainer,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
  Legend,
  Tooltip,
} from "recharts";
import { Hexagon, AlertCircle, Eye, EyeOff } from "lucide-react";

interface HexagonalRadarChartProps {
  candidates: PaperCandidate[];
  aiRecommendedId: string;
  finalChoicePaperId: string | null;
  onOpenEvidence: (paper: PaperCandidate, dimensionKey?: string) => void;
}

const AXIS_KEYS = [
  { key: "performance", label: "성능 경쟁력" },
  { key: "novelty", label: "방법론적 신규성" },
  { key: "trendImportance", label: "연구 흐름 중요도" },
  { key: "academicSignificance", label: "학술적 유의미성" },
  { key: "practicalValue", label: "실무·연구 적용 가치" },
  { key: "reproducibility", label: "재현 가능성" },
];

const CANDIDATE_COLORS = [
  "#4f46e5", // Indigo
  "#10b981", // Emerald
  "#f59e0b", // Amber
  "#8b5cf6", // Purple
  "#ec4899", // Pink
];

export const HexagonalRadarChart: React.FC<HexagonalRadarChartProps> = ({
  candidates,
  aiRecommendedId,
  finalChoicePaperId,
  onOpenEvidence,
}) => {
  // State for toggling visible candidates on radar chart
  const [selectedPaperIds, setSelectedPaperIds] = useState<string[]>(
    candidates.map((c) => c.id)
  );

  const togglePaper = (id: string) => {
    setSelectedPaperIds((prev) =>
      prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]
    );
  };

  // Build dataset for Recharts
  const chartData = AXIS_KEYS.map((axis) => {
    const row: Record<string, any> = {
      subject: axis.label,
      axisKey: axis.key,
    };

    candidates.forEach((cand) => {
      const dimScore = cand.scores[axis.key as keyof typeof cand.scores];
      // If score is null ('추가 확인 필요'), we use 0 for plot but keep flag
      row[cand.id] = dimScore?.score ?? 0;
      row[`${cand.id}_isVerified`] = dimScore?.score !== null;
    });

    return row;
  });

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 sm:p-6 mb-10">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-slate-100 pb-4 mb-6 gap-3">
        <div>
          <div className="flex items-center space-x-2">
            <Hexagon className="w-5 h-5 text-indigo-600 fill-indigo-50" />
            <h3 className="text-base font-bold text-slate-900 font-serif">
              6축 육각형 역량 비교 레이더 차트
            </h3>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            성능 경쟁력, 방법론 신규성, 연구 흐름 중요도, 학술 유의미성, 실무 적용 가치, 재현 가능성을 1~5점으로 평가합니다.
          </p>
        </div>

        {/* Paper Toggle Controls */}
        <div className="flex flex-wrap items-center gap-2">
          {candidates.map((cand, idx) => {
            const isVisible = selectedPaperIds.includes(cand.id);
            const isAi = cand.id === aiRecommendedId;
            const isChoice = cand.id === finalChoicePaperId;
            const color = CANDIDATE_COLORS[idx % CANDIDATE_COLORS.length];

            return (
              <button
                key={cand.id}
                onClick={() => togglePaper(cand.id)}
                className={`inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
                  isVisible
                    ? "bg-slate-900 text-white border-slate-800 shadow-sm"
                    : "bg-slate-50 text-slate-400 border-slate-200 line-through"
                }`}
              >
                <span
                  className="w-2.5 h-2.5 rounded-full"
                  style={{ backgroundColor: color }}
                />
                <span className="max-w-[120px] truncate">{cand.title}</span>
                {isAi && <span className="text-[10px] text-indigo-300">🤖</span>}
                {isChoice && <span className="text-[10px] text-emerald-300">✅</span>}
                {isVisible ? (
                  <Eye className="w-3 h-3 text-slate-300" />
                ) : (
                  <EyeOff className="w-3 h-3 text-slate-400" />
                )}
              </button>
            );
          })}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-center">
        {/* Radar Chart */}
        <div className="lg:col-span-7 h-[360px] sm:h-[400px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <RadarChart cx="50%" cy="50%" outerRadius="80%" data={chartData}>
              <PolarGrid stroke="#e2e8f0" />
              <PolarAngleAxis
                dataKey="subject"
                tick={{ fill: "#334155", fontSize: 12, fontWeight: 600 }}
              />
              <PolarRadiusAxis
                angle={30}
                domain={[0, 5]}
                tickCount={6}
                tick={{ fill: "#94a3b8", fontSize: 10 }}
              />
              <Tooltip
                formatter={(value: any, name: any) => {
                  const paper = candidates.find((c) => c.id === name);
                  const val = value === 0 ? "추가 확인 필요" : `${value} / 5 점`;
                  return [val, paper?.title || name];
                }}
                contentStyle={{
                  backgroundColor: "#0f172a",
                  borderColor: "#334155",
                  borderRadius: "0.75rem",
                  color: "#f8fafc",
                  fontSize: "12px",
                  padding: "10px",
                }}
              />

              {candidates.map((cand, idx) => {
                if (!selectedPaperIds.includes(cand.id)) return null;
                const color = CANDIDATE_COLORS[idx % CANDIDATE_COLORS.length];

                return (
                  <Radar
                    key={cand.id}
                    name={cand.id}
                    dataKey={cand.id}
                    stroke={color}
                    fill={color}
                    fillOpacity={0.25}
                    strokeWidth={2}
                  />
                );
              })}
            </RadarChart>
          </ResponsiveContainer>
        </div>

        {/* Dimension Breakdown Side Panel */}
        <div className="lg:col-span-5 bg-slate-50 p-4 rounded-xl border border-slate-200/80 space-y-3 text-xs">
          <div className="font-bold text-slate-800 border-b border-slate-200 pb-2 mb-2">
            📊 축별 상세 점수 & '추가 확인 필요' 배지
          </div>

          <div className="space-y-3 max-h-[320px] overflow-y-auto pr-1">
            {AXIS_KEYS.map((axis) => {
              return (
                <div key={axis.key} className="bg-white p-3 rounded-lg border border-slate-200 shadow-2xs">
                  <div className="font-bold text-slate-800 mb-1.5 flex items-center justify-between">
                    <span>{axis.label}</span>
                  </div>

                  <div className="space-y-1">
                    {candidates.map((cand, idx) => {
                      if (!selectedPaperIds.includes(cand.id)) return null;
                      const dimScore = cand.scores[axis.key as keyof typeof cand.scores];
                      const color = CANDIDATE_COLORS[idx % CANDIDATE_COLORS.length];

                      return (
                        <div
                          key={cand.id}
                          onClick={() => onOpenEvidence(cand, axis.key)}
                          className="flex items-center justify-between py-1 px-2 rounded hover:bg-slate-50 cursor-pointer transition-colors"
                        >
                          <div className="flex items-center space-x-2 truncate">
                            <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: color }} />
                            <span className="text-slate-700 truncate font-medium">{cand.title}</span>
                          </div>

                          {dimScore?.score !== null ? (
                            <span className="font-bold text-indigo-700 shrink-0 ml-2">
                              {dimScore.score}점
                            </span>
                          ) : (
                            <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-amber-100 text-amber-800 shrink-0 border border-amber-200 ml-2">
                              <AlertCircle className="w-3 h-3" />
                              <span>추가 확인 필요</span>
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};
