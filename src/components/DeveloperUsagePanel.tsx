import React, { useState, useEffect } from "react";
import {
  DollarSign,
  Zap,
  Activity,
  Layers,
  FileText,
  Search,
  Database,
  Clock,
  CheckCircle,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  RefreshCw,
  Info,
  ShieldCheck,
  Cpu
} from "lucide-react";
import { AnalysisRunUsageSummary, PipelineCallLog } from "../../server/observability/types.js";

interface DeveloperUsagePanelProps {
  currentUsageSummary?: AnalysisRunUsageSummary | null;
  onClose?: () => void;
}

export const DeveloperUsagePanel: React.FC<DeveloperUsagePanelProps> = ({
  currentUsageSummary,
  onClose,
}) => {
  const [selectedRunId, setSelectedRunId] = useState<string | undefined>(
    currentUsageSummary?.analysisRunId
  );
  const [summary, setSummary] = useState<AnalysisRunUsageSummary | null>(
    currentUsageSummary || null
  );
  const [allSummaries, setAllSummaries] = useState<AnalysisRunUsageSummary[]>([]);
  const [callLogs, setCallLogs] = useState<PipelineCallLog[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [showLogsTable, setShowLogsTable] = useState(false);

  useEffect(() => {
    if (currentUsageSummary) {
      setSummary(currentUsageSummary);
      setSelectedRunId(currentUsageSummary.analysisRunId);
    }
  }, [currentUsageSummary]);

  const fetchRunSummaries = async () => {
    try {
      setIsLoading(true);
      const res = await fetch("/api/usage-summary");
      if (res.ok) {
        const json = await res.json();
        if (json.success && json.summaries) {
          setAllSummaries(json.summaries);
          if (!summary && json.summaries.length > 0) {
            setSummary(json.summaries[0]);
            setSelectedRunId(json.summaries[0].analysisRunId);
          }
        }
      }
    } catch (err) {
      console.warn("Failed to fetch usage summaries:", err);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchRunDetail = async (runId: string) => {
    try {
      setIsLoading(true);
      const res = await fetch(`/api/usage-summary/${runId}`);
      if (res.ok) {
        const json = await res.json();
        if (json.success) {
          setSummary(json.summary);
          setCallLogs(json.callLogs || []);
        }
      }
    } catch (err) {
      console.warn("Failed to fetch run details:", err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchRunSummaries();
  }, []);

  useEffect(() => {
    if (selectedRunId) {
      fetchRunDetail(selectedRunId);
    }
  }, [selectedRunId]);

  if (!summary) {
    return (
      <div className="p-6 text-center text-slate-500 bg-slate-50 rounded-2xl border border-slate-200">
        <Activity className="w-8 h-8 text-indigo-500 mx-auto mb-2 animate-spin" />
        <p className="text-sm">분석 실행 사용량 및 예상 비용 데이터를 불러오는 중...</p>
      </div>
    );
  }

  const formatUsd = (val?: number | null) => {
    if (val === undefined || val === null) return "$0.0000";
    return `$${val.toFixed(4)}`;
  };

  const formatTokens = (val?: number | null) => {
    if (val === undefined || val === null) return "0";
    return val.toLocaleString();
  };

  const stageLabels: Record<string, string> = {
    BRIEFING_PARSER: "1. 브리핑 파싱 (briefingParser)",
    METADATA_VERIFIER: "2. 메타데이터 검증 (metadataVerifier)",
    RESOURCE_VERIFIER: "3. 코드/데이터 탐색 (resourceVerifier)",
    DOCUMENT_ANALYZER: "4. 원문 정밀 분석 (documentAnalyzer)",
    COMPARISON_FINDER: "5. 비교 연구 탐색 (comparisonFinder)",
    PAPER_EVALUATOR: "6. 6축 평가 연산 (paperEvaluator)",
    RECOMMENDATION_ENGINE: "7. AI 추천 의사결정 (recommendationEngine)",
    MARKDOWN_REPORT_GENERATOR: "8. 리포트 생성 (markdownReportGenerator)",
  };

  return (
    <div className="bg-slate-900 rounded-2xl border border-slate-800 p-6 text-slate-100 shadow-2xl space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-4">
        <div>
          <div className="inline-flex items-center space-x-2 px-2.5 py-1 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 text-xs font-semibold mb-1">
            <Cpu className="w-3.5 h-3.5" />
            <span>Developer Observability & Cost Control</span>
          </div>
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            Gemini API 사용량 & 예상 비용 분석 패널
          </h2>
          <p className="text-xs text-slate-400">
            단단계/논문별 Gemini API 호출, 토큰 소비량, 검색 그래운딩, 캐시 적중률 및 단가 기준 예상 비용
          </p>
        </div>

        <div className="flex items-center space-x-3">
          {allSummaries.length > 0 && (
            <select
              value={selectedRunId}
              onChange={(e) => setSelectedRunId(e.target.value)}
              className="bg-slate-800 text-slate-200 text-xs rounded-lg border border-slate-700 px-3 py-1.5 focus:ring-2 focus:ring-indigo-500"
            >
              {allSummaries.map((s) => (
                <option key={s.analysisRunId} value={s.analysisRunId}>
                  [{s.analysisMode}] {s.briefingTitle?.substring(0, 20) || "Run"} ({s.analysisRunId.substring(0, 8)})
                </option>
              ))}
            </select>
          )}

          <button
            onClick={() => selectedRunId && fetchRunDetail(selectedRunId)}
            className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors"
            title="새로고침"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? "animate-spin text-indigo-400" : ""}`} />
          </button>

          {onClose && (
            <button
              onClick={onClose}
              className="text-xs font-medium px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300"
            >
              닫기
            </button>
          )}
        </div>
      </div>

      {/* Overview Cards Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {/* Total Cost */}
        <div className="bg-slate-800/60 rounded-xl p-4 border border-indigo-500/30">
          <div className="flex items-center justify-between text-xs text-indigo-300 mb-1">
            <span className="font-semibold">총 예상 비용</span>
            <DollarSign className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-xl font-extrabold text-white">
            {formatUsd(summary.totalEstimatedCostUsd)}
          </div>
          <div className="text-[11px] text-slate-400 mt-1 flex items-center justify-between">
            <span>토큰: {formatUsd(summary.estimatedTokenCostUsd)}</span>
            <span>검색: {formatUsd(summary.estimatedSearchCostUsd)}</span>
          </div>
        </div>

        {/* Total Tokens */}
        <div className="bg-slate-800/60 rounded-xl p-4 border border-slate-700">
          <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
            <span className="font-semibold">총 소비 토큰</span>
            <Zap className="w-4 h-4 text-amber-400" />
          </div>
          <div className="text-xl font-extrabold text-white">
            {formatTokens(summary.totalTokens)}
          </div>
          <div className="text-[11px] text-slate-400 mt-1 flex justify-between">
            <span>입력: {formatTokens(summary.totalPromptTokens)}</span>
            <span>출력: {formatTokens(summary.totalOutputTokens)}</span>
          </div>
        </div>

        {/* Cache Hit Rate */}
        <div className="bg-slate-800/60 rounded-xl p-4 border border-slate-700">
          <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
            <span className="font-semibold">영속 캐시 적중률</span>
            <Database className="w-4 h-4 text-cyan-400" />
          </div>
          <div className="text-xl font-extrabold text-white">
            {Math.round(summary.cacheHitRate * 100)}%
          </div>
          <div className="text-[11px] text-emerald-400 mt-1">
            절감 효과: {formatUsd(summary.estimatedCacheSavingsUsd)}
          </div>
        </div>

        {/* Budget Status */}
        <div className="bg-slate-800/60 rounded-xl p-4 border border-slate-700">
          <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
            <span className="font-semibold">분석 모드 & 예산</span>
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="inline-flex items-center px-2 py-0.5 rounded text-xs font-bold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
            {summary.analysisMode} MODE
          </div>
          <div className="text-[11px] text-slate-400 mt-1 flex items-center gap-1">
            <CheckCircle className="w-3 h-3 text-emerald-400 shrink-0" />
            <span>{summary.budgetStatus}</span>
          </div>
        </div>
      </div>

      {/* Stage Breakdown Table */}
      <div className="bg-slate-800/40 rounded-xl border border-slate-800 overflow-hidden">
        <div className="px-4 py-3 bg-slate-800/80 border-b border-slate-800 flex items-center justify-between text-xs font-semibold text-slate-300">
          <span className="flex items-center gap-1.5">
            <Layers className="w-4 h-4 text-indigo-400" />
            파이프라인 단계별 사용량 및 비용 상세
          </span>
          <span className="text-slate-400">총 호출 수: {summary.totalApiCalls}회</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left text-slate-300">
            <thead className="bg-slate-900/60 text-slate-400 font-medium border-b border-slate-800">
              <tr>
                <th className="p-3">파이프라인 단계</th>
                <th className="p-3 text-center">호출 횟수</th>
                <th className="p-3 text-right">소비 토큰</th>
                <th className="p-3 text-right">소요 시간(ms)</th>
                <th className="p-3 text-right">예상 비용(USD)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {(Object.keys(stageLabels) as Array<keyof typeof stageLabels>).map((stg) => {
                const calls = summary.callCountByStage[stg] || 0;
                const tokens = summary.tokenUsageByStage[stg] || 0;
                const duration = summary.durationByStage[stg] || 0;
                const cost = summary.costByStage[stg] || 0;
                const isSlowest = summary.slowestStage === stg;
                const isMostExpensive = summary.mostExpensiveStage === stg;

                return (
                  <tr key={stg} className="hover:bg-slate-800/40 transition-colors">
                    <td className="p-3 font-medium flex items-center gap-2">
                      <span>{stageLabels[stg]}</span>
                      {stg === "MARKDOWN_REPORT_GENERATOR" && (
                        <span className="px-1.5 py-0.5 rounded text-[10px] bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                          Code Only (0 LLM Call)
                        </span>
                      )}
                      {stg === "DOCUMENT_ANALYZER" && (
                        <span className="px-1.5 py-0.5 rounded text-[10px] bg-amber-500/20 text-amber-300 border border-amber-500/30">
                          조건부 실행 ({summary.documentAnalyzerExecuted}회 실행, {summary.documentAnalyzerSkipped}회 생략)
                        </span>
                      )}
                    </td>
                    <td className="p-3 text-center font-mono">{calls}회</td>
                    <td className="p-3 text-right font-mono">{formatTokens(tokens)}</td>
                    <td className="p-3 text-right font-mono">
                      <span className={isSlowest ? "text-amber-300 font-bold" : ""}>
                        {duration.toLocaleString()} ms
                      </span>
                    </td>
                    <td className="p-3 text-right font-mono">
                      <span className={isMostExpensive ? "text-emerald-400 font-bold" : ""}>
                        {formatUsd(cost)}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pricing Config & Metadata Footer */}
      <div className="flex flex-col sm:flex-row items-center justify-between text-xs text-slate-400 pt-2 border-t border-slate-800 gap-2">
        <div className="flex items-center space-x-2">
          <Info className="w-3.5 h-3.5 text-slate-500 shrink-0" />
          <span>
            단가 적용 버전: <strong>{summary.pricingVersion}</strong> (기준일: {summary.pricingDate})
          </span>
        </div>

        <button
          onClick={() => setShowLogsTable(!showLogsTable)}
          className="inline-flex items-center space-x-1.5 text-indigo-400 hover:text-indigo-300 font-semibold transition-colors"
        >
          <span>개별 API 호출 로그 ({callLogs.length}건)</span>
          {showLogsTable ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
        </button>
      </div>

      {/* Call Logs Drawer */}
      {showLogsTable && callLogs.length > 0 && (
        <div className="bg-slate-950 rounded-xl border border-slate-800 p-4 space-y-3">
          <h4 className="text-xs font-bold text-slate-300 flex items-center justify-between">
            <span>실행 개별 API 호출 로그</span>
            <span className="text-slate-500 font-normal">Run ID: {summary.analysisRunId}</span>
          </h4>

          <div className="overflow-x-auto max-h-60">
            <table className="w-full text-[11px] text-left text-slate-400">
              <thead className="bg-slate-900 border-b border-slate-800 font-medium">
                <tr>
                  <th className="p-2">단계</th>
                  <th className="p-2">논문 ID</th>
                  <th className="p-2">모델</th>
                  <th className="p-2 text-center">시도</th>
                  <th className="p-2 text-center">상태</th>
                  <th className="p-2 text-right">토큰(P/O)</th>
                  <th className="p-2 text-right">소요시간</th>
                  <th className="p-2 text-right">비용</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-900 font-mono">
                {callLogs.map((log) => (
                  <tr key={log.callId} className="hover:bg-slate-900/60">
                    <td className="p-2 text-slate-200">{log.stage}</td>
                    <td className="p-2">{log.paperId || "-"}</td>
                    <td className="p-2 text-indigo-300">{log.model}</td>
                    <td className="p-2 text-center">{log.attempt}</td>
                    <td className="p-2 text-center">
                      {log.skipped ? (
                        <span className="text-cyan-400">SKIPPED</span>
                      ) : log.success ? (
                        <span className="text-emerald-400">SUCCESS</span>
                      ) : (
                        <span className="text-rose-400">FAILED</span>
                      )}
                    </td>
                    <td className="p-2 text-right">
                      {log.tokenUsage.promptTokens || 0} / {log.tokenUsage.outputTokens || 0}
                    </td>
                    <td className="p-2 text-right">{log.durationMs}ms</td>
                    <td className="p-2 text-right text-emerald-400">
                      {formatUsd(log.cost.totalEstimatedCostUsd)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
