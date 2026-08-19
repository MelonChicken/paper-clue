import React from "react";
import { PaperCandidate } from "../types.js";
import {
  ResponsiveContainer,
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  ZAxis,
  Tooltip as ChartTooltip,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
} from "recharts";
import { AlertTriangle, Layers, Plus, X } from "lucide-react";
import {
  computeScatterCollisionOffsets,
  generatePaperShortLabel,
  getPaperEvaluationStatus,
  getRadarEligibility,
  getScatterEligibility,
  sortCandidatesByEvaluation,
} from "../utils/evaluationHelpers.js";

interface CandidateComparisonProps {
  candidates: PaperCandidate[];
  aiRecommendedId: string;
  finalChoicePaperId: string | null;
  comparedPaperIds: string[];
  onToggleCompare: (paperId: string) => void;
  onSelectPaperToView: (paper: PaperCandidate) => void;
}

type ScatterDatum = {
  id: string;
  paper: PaperCandidate;
  title: string;
  canonicalTitle: string;
  shortLabel: string;
  displayLabel: string;
  color: string;
  x: number;
  y: number;
  overallScoreDisplay: string;
  evalLabel: string;
  isCompared: boolean;
  isAi: boolean;
  isChoice: boolean;
};

const RADAR_AXES = [
  { key: "topicRelevance", label: "주제 적합도" },
  { key: "methodNovelty", label: "방법론 신규성" },
  { key: "academicReliability", label: "학술 신뢰도" },
  { key: "reproducibility", label: "재현 가능성" },
  { key: "researchValue", label: "연구 가치" },
];

const PAPER_COLORS = ["#4f46e5", "#059669", "#d97706", "#2563eb", "#7c3aed", "#0f766e", "#dc2626"];

const LABEL_PLACEMENT: Record<string, { dx: number; dy: number; anchor: "start" | "middle" | "end" }> = {
  right: { dx: 13, dy: 4, anchor: "start" },
  left: { dx: -13, dy: 4, anchor: "end" },
  top: { dx: 0, dy: -13, anchor: "middle" },
  bottom: { dx: 0, dy: 18, anchor: "middle" },
};

const getStatusPrefix = (isAi: boolean, isChoice: boolean) => `${isAi ? "★" : ""}${isChoice ? "✓" : ""}`;

const CustomScatterDot = (props: any) => {
  const { cx, cy, payload } = props;
  if (cx === undefined || cy === undefined || !payload) return null;

  const dx = payload.renderOffsetDx || 0;
  const dy = payload.renderOffsetDy || 0;
  const finalX = cx + dx;
  const finalY = cy + dy;
  const clusterSize = payload.clusterSize || 1;
  const label = payload.displayLabel || payload.shortLabel || "";
  const labelPlacement = LABEL_PLACEMENT[payload.labelPlacement || "right"] || LABEL_PLACEMENT.right;
  const labelX = finalX + labelPlacement.dx;
  const labelY = finalY + labelPlacement.dy;
  const labelWidth = Math.max(Math.min(label.length, 20) * 6.4 + 8, 34);

  return (
    <g className="cursor-pointer">
      {clusterSize > 1 && (dx !== 0 || dy !== 0) && (
        <line x1={cx} y1={cy} x2={finalX} y2={finalY} stroke="#cbd5e1" strokeWidth={1} strokeDasharray="2 2" opacity={0.5} />
      )}
      <circle cx={finalX} cy={finalY} r={7.5} fill={payload.color} fillOpacity={payload.isCompared ? 1 : 0.9} stroke="#ffffff" strokeWidth={2} />
      {label && (
        <g className="pointer-events-none select-none">
          <rect
            x={labelPlacement.anchor === "start" ? labelX - 3 : labelPlacement.anchor === "end" ? labelX - labelWidth + 3 : labelX - labelWidth / 2}
            y={labelY - 11}
            width={labelWidth}
            height={15}
            rx={3}
            fill="#ffffff"
            fillOpacity={0.92}
            stroke="#e2e8f0"
          />
          <text x={labelX} y={labelY} textAnchor={labelPlacement.anchor} style={{ fontSize: 10.5, fontWeight: 800, fill: "#1e293b" }}>
            {label}
          </text>
        </g>
      )}
    </g>
  );
};

export const CandidateComparison: React.FC<CandidateComparisonProps> = ({
  candidates,
  aiRecommendedId,
  finalChoicePaperId,
  comparedPaperIds,
  onToggleCompare,
  onSelectPaperToView,
}) => {
  const sortedCandidates = sortCandidatesByEvaluation(candidates, aiRecommendedId);
  const colorByPaperId = new Map(sortedCandidates.map((candidate, index) => [candidate.id, PAPER_COLORS[index % PAPER_COLORS.length]]));

  const scatterEligibilities = sortedCandidates.map((candidate) => ({
    candidate,
    ...getScatterEligibility(candidate),
    evalStatus: getPaperEvaluationStatus(candidate),
  }));

  const rawValidScatterData: ScatterDatum[] = scatterEligibilities
    .filter((item) => item.isEligible && item.x !== null && item.y !== null)
    .map((item) => {
      const paper = item.candidate;
      const shortLabel = generatePaperShortLabel(paper);
      const isAi = paper.id === aiRecommendedId;
      const isChoice = paper.id === finalChoicePaperId;
      const statusPrefix = getStatusPrefix(isAi, isChoice);
      return {
        id: paper.id,
        paper,
        title: paper.title,
        canonicalTitle: paper.canonicalTitle || paper.title,
        shortLabel,
        displayLabel: statusPrefix ? `${statusPrefix} ${shortLabel}` : shortLabel,
        color: colorByPaperId.get(paper.id) || PAPER_COLORS[0],
        x: item.x as number,
        y: item.y as number,
        overallScoreDisplay: item.evalStatus.scoreDisplay,
        evalLabel: item.evalStatus.label,
        isCompared: comparedPaperIds.includes(paper.id),
        isAi,
        isChoice,
      };
    });

  const sameCoordinateGroups = rawValidScatterData.reduce<Record<string, ScatterDatum[]>>((acc, item) => {
    const key = `${item.x.toFixed(3)}:${item.y.toFixed(3)}`;
    acc[key] = acc[key] || [];
    acc[key].push(item);
    return acc;
  }, {});

  const validScatterData = computeScatterCollisionOffsets(rawValidScatterData).map((item) => {
    const sameCoordinateItems = sameCoordinateGroups[`${item.x.toFixed(3)}:${item.y.toFixed(3)}`] || [item];
    return { ...item, sameCoordinateCount: sameCoordinateItems.length, sameCoordinateLabels: sameCoordinateItems.map((paper) => paper.shortLabel) };
  });

  const excludedScatterItems = scatterEligibilities.filter((item) => !item.isEligible);
  const comparedCandidates = sortedCandidates.filter((candidate) => comparedPaperIds.includes(candidate.id));
  const radarData = RADAR_AXES.map((axis) => {
    const row: Record<string, any> = { subject: axis.label };
    comparedCandidates.forEach((candidate) => {
      const eligibility = getRadarEligibility(candidate);
      const value = eligibility.metrics[axis.key as keyof typeof eligibility.metrics];
      row[candidate.id] = value;
    });
    return row;
  });

  return (
    <section id="candidate-comparison" className="bg-white rounded-2xl border border-slate-200 shadow-xs p-6 lg:p-7 mb-10 space-y-7">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-slate-100 pb-4 gap-3">
        <div>
          <div className="flex items-center space-x-2">
            <span className="text-xs font-bold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded border border-indigo-100">2단계 · 후보 비교</span>
            <span className="text-xs font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">평가 완료 논문 우선 표시</span>
          </div>
          <h2 className="text-[22px] lg:text-2xl font-bold text-slate-900 mt-1.5">후보 논문 다차원 비교 분석</h2>
        </div>
        <div className="text-sm text-slate-500">평가 근거가 확보된 후보를 기본 비교 대상으로 자동 선택합니다. 최대 3편까지 비교할 수 있습니다.</div>
      </div>

      <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 flex flex-col md:flex-row md:items-center justify-between gap-3 text-sm">
        <div className="flex items-center space-x-2">
          <Layers className="w-4 h-4 text-indigo-600 shrink-0" />
          <span className="font-bold text-slate-800">레이더 비교 대상 ({comparedCandidates.length}/3):</span>
          <span className="text-xs text-slate-500 hidden sm:inline">평가 근거가 부족한 논문은 선택할 수 없습니다.</span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {sortedCandidates.map((candidate, index) => {
            const isSelected = comparedPaperIds.includes(candidate.id);
            const radarCheck = getRadarEligibility(candidate);
            const evalStatus = getPaperEvaluationStatus(candidate);
            const canAdd = (comparedPaperIds.length < 3 || isSelected) && radarCheck.isEligible;
            return (
              <button
                key={candidate.id}
                type="button"
                disabled={!isSelected && !canAdd}
                onClick={() => onToggleCompare(candidate.id)}
                title={!radarCheck.isEligible ? radarCheck.reason : `종합 점수: ${evalStatus.scoreDisplay}`}
                className={`inline-flex items-center space-x-1.5 px-3 py-2 rounded-lg border text-sm transition-all ${isSelected ? "bg-indigo-600 text-white border-indigo-700 font-bold shadow-2xs ring-1 ring-indigo-500" : !radarCheck.isEligible ? "bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed opacity-70" : "bg-white text-slate-700 border-slate-300 hover:bg-slate-100 hover:border-slate-400"}`}
              >
                <span className="font-mono text-xs opacity-75">#{index + 1}</span>
                <span className="max-w-[140px] truncate">{generatePaperShortLabel(candidate)}</span>
                {!radarCheck.isEligible ? <span className="text-xs text-rose-600 font-medium px-1 rounded bg-rose-50 border border-rose-200">근거부족</span> : <span className={`text-xs px-1.5 rounded font-semibold ${isSelected ? "bg-indigo-700 text-indigo-100" : "bg-slate-100 text-slate-600"}`}>{evalStatus.overallScore ? `${evalStatus.overallScore.toFixed(1)}점` : "부분평가"}</span>}
                {isSelected ? <X className="w-4 h-4" /> : radarCheck.isEligible ? <Plus className="w-4 h-4 text-slate-400" /> : null}
              </button>
            );
          })}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-7 items-stretch">
        <div className="lg:col-span-6 bg-slate-50/70 p-5 lg:p-6 rounded-xl border border-slate-200 flex flex-col justify-between">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-3 gap-2">
            <div>
              <h3 className="text-sm font-bold text-slate-800">1. 전체 후보 분포 (Scatter Plot)</h3>
              <p className="text-xs text-indigo-700 font-semibold mt-1">전체 후보 {candidates.length}편 · 차트 표시 {validScatterData.length}편 · 평가 근거 부족으로 제외 {excludedScatterItems.length}편</p>
            </div>
            <span className="text-xs text-slate-500 shrink-0">점을 클릭하면 해당 논문 카드로 이동</span>
          </div>

          <div className="h-[330px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <ScatterChart margin={{ top: 34, right: 44, bottom: 28, left: 18 }}>
                <XAxis type="number" dataKey="x" name="주제 적합도" domain={[0.7, 5.3]} ticks={[1, 2, 3, 4, 5]} tick={{ fontSize: 12, fill: "#64748b" }} label={{ value: "주제 적합도", position: "insideBottom", offset: -14, fontSize: 12, fill: "#475569" }} />
                <YAxis type="number" dataKey="y" name="학술 신뢰도" domain={[0.7, 5.3]} ticks={[1, 2, 3, 4, 5]} tick={{ fontSize: 12, fill: "#64748b" }} label={{ value: "학술 신뢰도", angle: -90, position: "insideLeft", offset: 0, fontSize: 12, fill: "#475569" }} />
                <ZAxis range={[120, 160]} />
                <ChartTooltip
                  cursor={{ strokeDasharray: "3 3", stroke: "#cbd5e1" }}
                  content={({ payload }) => {
                    if (!payload || !payload.length) return null;
                    const paper = payload[0].payload;
                    if (!paper) return null;
                    return (
                      <div className="bg-slate-900/95 backdrop-blur-xs text-white p-3.5 rounded-xl shadow-xl border border-slate-700/80 text-sm max-w-xs space-y-2 z-50">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs font-bold px-2 py-0.5 rounded border font-mono" style={{ color: paper.color, borderColor: `${paper.color}66`, backgroundColor: `${paper.color}22` }}>{paper.displayLabel}</span>
                          {paper.isCompared && <span className="text-xs font-medium bg-slate-700/70 text-slate-200 px-1.5 py-0.5 rounded border border-slate-600">비교 대상</span>}
                        </div>
                        <div className="font-semibold text-slate-100 line-clamp-2 leading-tight">{paper.canonicalTitle || paper.title}</div>
                        <div className="grid grid-cols-2 gap-2 pt-1 border-t border-slate-700/60 text-xs">
                          <div className="bg-slate-800/80 p-2 rounded-lg"><span className="text-slate-400 block text-xs">주제 적합도</span><span className="font-bold text-indigo-300 text-base">{paper.x}</span><span className="text-slate-400 text-xs"> / 5</span></div>
                          <div className="bg-slate-800/80 p-2 rounded-lg"><span className="text-slate-400 block text-xs">학술 신뢰도</span><span className="font-bold text-emerald-300 text-base">{paper.y}</span><span className="text-slate-400 text-xs"> / 5</span></div>
                        </div>
                        <div className="grid grid-cols-2 gap-2 text-xs text-slate-300">
                          <span>AI 추천: <strong className="text-slate-100">{paper.isAi ? "예" : "아니오"}</strong></span>
                          <span>사용자 선택: <strong className="text-slate-100">{paper.isChoice ? "예" : "아니오"}</strong></span>
                        </div>
                        <div className="text-xs text-slate-300 flex items-center justify-between"><span className="text-slate-400">종합 평가 상태:</span><span className="font-semibold text-amber-300">{paper.overallScoreDisplay} ({paper.evalLabel})</span></div>
                        {paper.sameCoordinateCount > 1 && <div className="text-xs text-slate-300 bg-slate-800/60 px-2 py-1 rounded border border-slate-700/50">동일 평가 좌표 후보 {paper.sameCoordinateCount}편: {paper.sameCoordinateLabels.join(", ")}</div>}
                      </div>
                    );
                  }}
                />
                <Scatter data={validScatterData} shape={<CustomScatterDot />} onClick={(entry: any) => { const paper = entry?.paper || entry?.payload?.paper; if (paper) onSelectPaperToView(paper); }} className="cursor-pointer" />
              </ScatterChart>
            </ResponsiveContainer>
          </div>

          {excludedScatterItems.length > 0 && (
            <div className="mt-3 mb-2 p-3 rounded-lg bg-amber-50/80 border border-amber-200/80 text-xs text-amber-900 space-y-1">
              <div className="flex items-center space-x-1.5 font-bold text-amber-800"><AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" /><span>차트 제외 논문: {excludedScatterItems.length}편</span></div>
              <ul className="text-amber-800 text-xs space-y-0.5 pl-4 list-disc">
                {excludedScatterItems.map((item) => <li key={item.candidate.id}><strong>{item.candidate.title}</strong><span className="text-amber-700"> → {item.reason}</span></li>)}
              </ul>
            </div>
          )}

          <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1.5 text-xs text-slate-600 pt-3 border-t border-slate-200">
            {validScatterData.map((paper) => <span key={paper.id} className="flex items-center space-x-1.5"><span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: paper.color }} /><span>{paper.displayLabel}</span></span>)}
          </div>
        </div>

        <div className="lg:col-span-6 bg-slate-50/70 p-5 lg:p-6 rounded-xl border border-slate-200 flex flex-col justify-between">
          <div className="flex items-center justify-between mb-3"><h3 className="text-sm font-bold text-slate-800">2. 선택 후보 비교 (Radar Chart)</h3><span className="text-xs text-slate-500">{comparedCandidates.length === 0 ? "비교할 논문을 선택하세요" : `${comparedCandidates.length}편 비교 중`}</span></div>
          {comparedCandidates.length > 0 ? (
            <div className="h-[330px] w-full"><ResponsiveContainer width="100%" height="100%"><RadarChart cx="50%" cy="50%" outerRadius="76%" data={radarData}><PolarGrid stroke="#e2e8f0" /><PolarAngleAxis dataKey="subject" tick={{ fill: "#475569", fontSize: 11, fontWeight: 600 }} /><PolarRadiusAxis angle={30} domain={[0, 5]} tickCount={6} tick={{ fill: "#94a3b8", fontSize: 10 }} /><ChartTooltip contentStyle={{ backgroundColor: "#0f172a", borderColor: "#334155", borderRadius: "0.75rem", color: "#f8fafc", fontSize: "12px" }} />{comparedCandidates.map((candidate) => { const color = colorByPaperId.get(candidate.id) || PAPER_COLORS[0]; return <Radar key={candidate.id} name={generatePaperShortLabel(candidate)} dataKey={candidate.id} stroke={color} fill={color} fillOpacity={0.2} strokeWidth={2} />; })}</RadarChart></ResponsiveContainer></div>
          ) : (
            <div className="h-[330px] flex flex-col items-center justify-center text-center p-7 text-slate-400"><Layers className="w-9 h-9 text-slate-300 mb-2" /><p className="text-sm font-medium text-slate-600">비교할 논문이 선택되지 않았습니다.</p><p className="text-xs text-slate-400 mt-1 max-w-xs">후보 목록이나 논문 카드의 비교 추가 버튼으로 최대 3편까지 비교할 수 있습니다.</p></div>
          )}
          {comparedCandidates.length > 0 && <div className="flex flex-wrap items-center justify-center gap-3 text-xs text-slate-600 pt-3 border-t border-slate-200">{comparedCandidates.map((candidate) => { const color = colorByPaperId.get(candidate.id) || PAPER_COLORS[0]; return <div key={candidate.id} className="flex items-center space-x-1.5 truncate max-w-[180px]"><span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: color }} /><span className="truncate">{generatePaperShortLabel(candidate)}</span></div>; })}</div>}
        </div>
      </div>
    </section>
  );
};

