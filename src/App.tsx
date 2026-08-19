import React, { useState, useEffect } from "react";
import {
  BriefingAnalysisResponse,
  CandidateUserStatus,
  PaperCandidate,
} from "./types";
import { Navbar } from "./components/Navbar";
import { FlowStep } from "./components/StepperNav";
import { StartSection } from "./components/StartSection";
import { AnalysisLoading } from "./components/AnalysisLoading";
import { ResearchOverview } from "./components/ResearchOverview";
import { CandidateComparison } from "./components/CandidateComparison";
import { CandidateCards } from "./components/CandidateCards";
import { FinalRecommendation } from "./components/FinalRecommendation";
import { ComparisonTable } from "./components/ComparisonTable";
import { EvidenceModal } from "./components/EvidenceModal";
import { MarkdownExportModal } from "./components/MarkdownExportModal";
import { SAMPLE_RESEARCH_BRIEFING } from "./data/sampleBriefing";
import { getDefaultComparedCandidateIds } from "./utils/evaluationHelpers";
import { AlertCircle, RotateCcw } from "lucide-react";

export default function App() {
  const [viewState, setViewState] = useState<"start" | "loading" | "results">("start");
  const [analysisData, setAnalysisData] = useState<BriefingAnalysisResponse | null>(null);
  const [lastMarkdown, setLastMarkdown] = useState<string>("");
  const [userSelections, setUserSelections] = useState<Record<string, CandidateUserStatus>>({});
  const [finalChoicePaperId, setFinalChoicePaperId] = useState<string | null>(null);
  const [comparedPaperIds, setComparedPaperIds] = useState<string[]>([]);
  const [activeEvidence, setActiveEvidence] = useState<{
    paper: PaperCandidate;
    dimensionKey?: string;
  } | null>(null);
  const [isReportOpen, setIsReportOpen] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Stepper reflects page-level navigation only.
  const getCurrentStep = (): FlowStep => {
    if (viewState === "start") return "briefing";
    if (viewState === "loading") return "analyze";
    return "result";
  };

  const getCompletedSteps = (): FlowStep[] => {
    if (viewState === "start") return [];
    if (viewState === "loading") return ["briefing"];
    return ["briefing", "analyze"];
  };

  const handleStepClick = (step: FlowStep) => {
    if (step === "briefing" && viewState !== "start") {
      setViewState("start");
      return;
    }

    if (step === "result" && viewState === "results") {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  };

  const handleStartAnalysis = async (briefingMarkdown: string, forceRefresh = false) => {
    setViewState("loading");
    setErrorMessage(null);
    setLastMarkdown(briefingMarkdown);

    try {
      const response = await fetch("/api/analyze-briefing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ briefingMarkdown, forceRefresh }),
      });

      const responseText = await response.text();
      let resJson: any = null;
      try {
        resJson = JSON.parse(responseText);
      } catch (parseErr) {
        throw new Error(
          `서버 응답 오류 (HTTP ${response.status}): ${
            responseText.length > 200 ? responseText.slice(0, 200) + "..." : responseText
          }`
        );
      }

      if (!response.ok || !resJson.success) {
        throw new Error(resJson.error || resJson.details || "분석 중 오류가 발생했습니다.");
      }

      const data: BriefingAnalysisResponse = resJson.data;
      setAnalysisData(data);

      // Default user final choice to AI recommendation initial suggestion
      const aiRecId = data.aiRecommendation?.topRecommendedPaperId;
      if (aiRecId) {
        setFinalChoicePaperId(aiRecId);
      } else if (data.candidates.length > 0) {
        setFinalChoicePaperId(data.candidates[0].id);
      }

      // Default compared papers: only eligible papers with completed/sufficient evaluations (max 3)
      const initialCompare = getDefaultComparedCandidateIds(data.candidates, aiRecId);
      setComparedPaperIds(initialCompare);

      setViewState("results");
    } catch (err: any) {
      console.error("Analysis Error:", err);
      setErrorMessage(err?.message || "연구 브리핑 분석에 실패했습니다. 다시 시도해 주세요.");
      setViewState("start");
    }
  };

  const handleToggleCompare = (paperId: string) => {
    setComparedPaperIds((prev) => {
      if (prev.includes(paperId)) {
        return prev.filter((id) => id !== paperId);
      }
      if (prev.length >= 3) {
        // Replace oldest or cap at 3
        return [...prev.slice(1), paperId];
      }
      return [...prev, paperId];
    });
  };

  const handleSelectUserStatus = (paperId: string, status: CandidateUserStatus) => {
    setUserSelections((prev) => ({
      ...prev,
      [paperId]: status,
    }));
  };

  const handleSelectFinalChoice = (paperId: string) => {
    setFinalChoicePaperId(paperId);
  };

  const handleReset = () => {
    setViewState("start");
    setAnalysisData(null);
    setUserSelections({});
    setFinalChoicePaperId(null);
    setComparedPaperIds([]);
    setErrorMessage(null);
  };

  const handleSelectPaperFromChart = (paper: PaperCandidate) => {
    const el = document.getElementById(`paper-card-${paper.id}`);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      el.classList.add("ring-2", "ring-indigo-500");
      setTimeout(() => {
        el.classList.remove("ring-2", "ring-indigo-500");
      }, 2000);
    }
  };

  return (
    <div className="min-h-screen bg-slate-100/70 text-slate-900 flex flex-col font-sans antialiased">
      {/* Navbar with page-level Stepper */}
      <Navbar
        onLoadSample={() => handleStartAnalysis(SAMPLE_RESEARCH_BRIEFING)}
        onReset={handleReset}
        onOpenReport={() => setIsReportOpen(true)}
        hasResults={viewState === "results"}
        currentStep={getCurrentStep()}
        completedSteps={getCompletedSteps()}
        onStepClick={handleStepClick}
      />

      {/* Main Body */}
      <main className="flex-1 max-w-[1520px] w-full mx-auto px-4 sm:px-6 lg:px-10 py-7 lg:py-8 text-[15px] lg:text-base">
        {/* Error Notification Alert */}
        {errorMessage && (
          <div className="max-w-3xl mx-auto mb-6 p-4 bg-rose-50 border border-rose-200 rounded-2xl flex items-start space-x-3 text-xs text-rose-900 shadow-xs">
            <AlertCircle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
            <div className="flex-1">
              <strong className="font-bold text-sm block mb-1">분석 오류 발생</strong>
              <p>{errorMessage}</p>
            </div>
            <button
              onClick={() => setErrorMessage(null)}
              className="p-1 hover:bg-rose-100 rounded text-rose-700 font-semibold"
            >
              닫기
            </button>
          </div>
        )}

        {/* View State 1: Start Screen (Option A & Option B Onboarding) */}
        {viewState === "start" && (
          <StartSection
            onStartAnalysis={handleStartAnalysis}
            isLoading={false}
          />
        )}

        {/* View State 2: Analysis Loading Screen */}
        {viewState === "loading" && <AnalysisLoading />}

        {/* View State 3: Analysis Results Screen */}
        {viewState === "results" && analysisData && (
          <div className="space-y-8 animate-in fade-in duration-200">
            {/* Fallback Warning Banner if Fallback Mode was used */}
            {analysisData.fallbackUsed && (
              <div className="bg-amber-50 border-2 border-amber-300 rounded-2xl p-5 shadow-xs space-y-3">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start space-x-3">
                    <AlertCircle className="w-6 h-6 text-amber-600 shrink-0 mt-0.5" />
                    <div>
                      <h3 className="text-sm font-bold text-amber-900">
                        Deterministic Fallback Mode 실행됨</h3>
                      <p className="text-xs text-amber-800 mt-1 leading-relaxed">
                        {analysisData.fallbackReason || "일부 서비스 제한으로 원문 기반 대체 분석 결과가 표시되었습니다."}
                      </p>
                    </div>
                  </div>

                  <button
                    onClick={() => handleStartAnalysis(lastMarkdown, true)}
                    className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold rounded-xl shadow-xs transition-all shrink-0 inline-flex items-center space-x-1.5"
                  >
                    <RotateCcw className="w-4 h-4" />
                    <span>Gemini로 다시 분석 (강제 새로고침)</span>
                  </button>
                </div>
              </div>
            )}

            {/* 1. Research Overview (Metric Cards) */}
            <ResearchOverview data={analysisData} />

            {/* 2. Candidate Comparison (Scatter Plot + Radar Chart + Compare Manager) */}
            <CandidateComparison
              candidates={analysisData.candidates}
              aiRecommendedId={analysisData.aiRecommendation.topRecommendedPaperId}
              finalChoicePaperId={finalChoicePaperId}
              comparedPaperIds={comparedPaperIds}
              onToggleCompare={handleToggleCompare}
              onSelectPaperToView={handleSelectPaperFromChart}
            />

            {/* 3. Paper Candidates (Progressive Disclosure Cards) */}
            <CandidateCards
              candidates={analysisData.candidates}
              aiRecommendedId={analysisData.aiRecommendation.topRecommendedPaperId}
              userSelections={userSelections}
              finalChoicePaperId={finalChoicePaperId}
              comparedPaperIds={comparedPaperIds}
              onToggleCompare={handleToggleCompare}
              onSelectUserStatus={handleSelectUserStatus}
              onSelectFinalChoice={handleSelectFinalChoice}
              onOpenEvidenceModal={(paper, dimKey) =>
                setActiveEvidence({ paper, dimensionKey: dimKey })
              }
            />

            {/* Comprehensive Matrix Table */}
            <ComparisonTable
              candidates={analysisData.candidates}
              aiRecommendedId={analysisData.aiRecommendation.topRecommendedPaperId}
              finalChoicePaperId={finalChoicePaperId}
              onOpenEvidence={(paper, dimKey) =>
                setActiveEvidence({ paper, dimensionKey: dimKey })
              }
              onSelectFinalChoice={handleSelectFinalChoice}
            />

            {/* 4. Final Recommendation ("This Week's Pick") */}
            <FinalRecommendation
              recommendation={analysisData.aiRecommendation}
              candidates={analysisData.candidates}
              finalChoicePaperId={finalChoicePaperId}
              onSelectFinalChoice={handleSelectFinalChoice}
              onOpenReport={() => setIsReportOpen(true)}
            />
          </div>
        )}
      </main>

      {/* Grounded Evidence Modal */}
      {activeEvidence && (
        <EvidenceModal
          paper={activeEvidence.paper}
          dimensionKey={activeEvidence.dimensionKey}
          onClose={() => setActiveEvidence(null)}
        />
      )}

      {/* Export Markdown Modal */}
      {isReportOpen && analysisData && (
        <MarkdownExportModal
          data={analysisData}
          userSelections={userSelections}
          finalChoicePaperId={finalChoicePaperId}
          onClose={() => setIsReportOpen(false)}
        />
      )}

      {/* Footer */}
      <footer className="bg-slate-900 text-slate-400 py-6 text-xs border-t border-slate-800 text-center">
        <div className="max-w-[1520px] mx-auto px-4 sm:px-6 lg:px-10">
          <p className="text-slate-300 font-extrabold mb-1">논문갈피</p>
          <p className="text-slate-500">논문갈피 · 근거 기반 연구 의사결정 지원 서비스</p>
        </div>
      </footer>
    </div>
  );
}





