import React from "react";
import { Check } from "lucide-react";

export type FlowStep = "briefing" | "analyze" | "result";

interface StepperNavProps {
  currentStep: FlowStep;
  completedSteps: FlowStep[];
  onStepClick?: (step: FlowStep) => void;
}

const STEPS: { id: FlowStep; number: number; label: string }[] = [
  { id: "briefing", number: 1, label: "브리핑" },
  { id: "analyze", number: 2, label: "분석" },
  { id: "result", number: 3, label: "결과" },
];

export const StepperNav: React.FC<StepperNavProps> = ({ currentStep, completedSteps, onStepClick }) => {
  return (
    <nav aria-label="분석 진행 단계" className="w-full bg-slate-900/90 border-b border-slate-800 py-2.5 px-4">
      <div className="max-w-4xl mx-auto flex items-center justify-between">
        <ol className="flex items-center w-full justify-between gap-1 sm:gap-2">
          {STEPS.map((step, idx) => {
            const isCurrent = currentStep === step.id;
            const isCompleted = completedSteps.includes(step.id);
            const isClickable = Boolean((isCompleted || isCurrent) && onStepClick);

            return (
              <li key={step.id} className="flex items-center flex-1 last:flex-none">
                <button
                  type="button"
                  disabled={!isClickable}
                  onClick={() => isClickable && onStepClick?.(step.id)}
                  className={`group flex items-center space-x-2 text-xs transition-colors ${isClickable ? "cursor-pointer" : "cursor-default"}`}
                >
                  <span
                    className={`w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold transition-all ${
                      isCurrent
                        ? "bg-indigo-600 text-white ring-2 ring-indigo-400 ring-offset-2 ring-offset-slate-900 shadow-xs"
                        : isCompleted
                        ? "bg-emerald-600 text-white"
                        : "bg-slate-800 text-slate-400 border border-slate-700"
                    }`}
                  >
                    {isCompleted && !isCurrent ? <Check className="w-3.5 h-3.5 stroke-[2.5]" /> : step.number}
                  </span>
                  <span
                    className={`font-semibold text-xs transition-colors hidden sm:inline ${
                      isCurrent ? "text-white font-bold" : isCompleted ? "text-slate-300 group-hover:text-white" : "text-slate-500"
                    }`}
                  >
                    {step.label}
                  </span>
                </button>

                {idx < STEPS.length - 1 && (
                  <div
                    className={`flex-1 mx-2 sm:mx-3 h-0.5 rounded transition-colors ${
                      completedSteps.includes(STEPS[idx + 1].id) || (isCompleted && currentStep === STEPS[idx + 1].id)
                        ? "bg-emerald-600/70"
                        : isCompleted
                        ? "bg-indigo-600/50"
                        : "bg-slate-800"
                    }`}
                  />
                )}
              </li>
            );
          })}
        </ol>
      </div>
    </nav>
  );
};
