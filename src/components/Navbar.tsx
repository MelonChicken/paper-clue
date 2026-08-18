import React from "react";
import { Bookmark, BookOpen, FileText, RotateCcw } from "lucide-react";
import { StepperNav, FlowStep } from "./StepperNav";

interface NavbarProps {
  onLoadSample: () => void;
  onReset: () => void;
  onOpenReport?: () => void;
  hasResults: boolean;
  currentStep: FlowStep;
  completedSteps: FlowStep[];
  onStepClick?: (step: FlowStep) => void;
}

const BrandMark = () => (
  <div className="relative w-9 h-9 rounded-lg bg-indigo-600 flex items-center justify-center shadow-sm shadow-indigo-600/25 border border-indigo-400/20">
    <FileText className="w-5 h-5 text-white" />
    <Bookmark className="absolute -right-0.5 -top-0.5 w-4 h-4 text-emerald-300 fill-emerald-300" />
  </div>
);

export const Navbar: React.FC<NavbarProps> = ({
  onLoadSample,
  onReset,
  onOpenReport,
  hasResults,
  currentStep,
  completedSteps,
  onStepClick,
}) => {
  return (
    <header className="sticky top-0 z-40 bg-slate-900 border-b border-slate-800 text-slate-100 shadow-sm">
      <div className="max-w-[1520px] mx-auto px-4 sm:px-6 lg:px-10 h-15 flex items-center justify-between">
        <button
          type="button"
          className="flex items-center space-x-3 cursor-pointer select-none text-left"
          onClick={onReset}
          aria-label="논문갈피 처음으로"
        >
          <BrandMark />
          <div className="flex items-baseline gap-2">
            <span className="font-extrabold text-lg tracking-tight text-white">논문갈피</span>
            <span className="hidden sm:inline text-[11px] font-semibold text-slate-400">Research Decision Support</span>
          </div>
        </button>

        <div className="flex items-center space-x-2 sm:space-x-3">
          {!hasResults && (
            <button
              onClick={onLoadSample}
              className="inline-flex items-center space-x-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition-colors"
              title="예시 연구 브리핑 불러오기"
            >
              <BookOpen className="w-3.5 h-3.5 text-indigo-400" />
              <span>예시 브리핑</span>
            </button>
          )}

          {hasResults && (
            <>
              <button
                onClick={onReset}
                className="inline-flex items-center space-x-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition-colors"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">다시 분석</span>
              </button>

              <button
                onClick={onOpenReport}
                className="inline-flex items-center space-x-1.5 px-3.5 py-1.5 text-xs font-semibold rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white shadow-xs shadow-indigo-600/30 transition-all"
              >
                <FileText className="w-3.5 h-3.5" />
                <span>Markdown 리포트</span>
              </button>
            </>
          )}
        </div>
      </div>

      <StepperNav
        currentStep={currentStep}
        completedSteps={completedSteps}
        onStepClick={onStepClick}
      />
    </header>
  );
};