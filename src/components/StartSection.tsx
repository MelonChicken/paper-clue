import React, { useState } from "react";
import {
  FileText,
  Copy,
  Check,
  ArrowRight,
  Search,
  BookOpen,
  Lightbulb,
  Bookmark,
} from "lucide-react";
import { SAMPLE_RESEARCH_BRIEFING } from "../data/sampleBriefing";

interface StartSectionProps {
  onStartAnalysis: (markdown: string) => void;
  isLoading: boolean;
}

const PROMPT_TEMPLATE = `Create a weekly research briefing for [TOPIC].

Prioritize recent papers, repositories, datasets, and tools from the past 1-2 weeks that are directly relevant to [TOPIC].

Also identify:

* important emerging subtopics,
* new methods or model architectures,
* datasets and benchmarks,
* open-source implementations,
* adjacent research that could meaningfully transfer to [TOPIC].

Check arXiv, relevant preprint servers, major conference and journal pages, Papers with Code, GitHub, Hugging Face, and major research lab pages where relevant.

Recommend only:

* 1-5 papers,
* 1-3 repositories, datasets, or tools if meaningful.

Clearly distinguish:

* peer-reviewed work,
* preprints,
* repositories or tools,
* speculative or cross-domain transfer ideas.

For each recommendation, explain:

* why it matters,
* how it relates to [TOPIC],
* what is genuinely new,
* implementation or reproduction difficulty,
* who would benefit from reading or trying it.

Include:

1. Weekly Overview
2. Core Trends
3. Recommended Papers
4. Recommended GitHub Repositories / Datasets / Tools
5. One-Week Mini Project
6. Suggested Reading Routine
7. Next-Week Watchlist

Use clear Markdown formatting.

For every recommended paper include, when available:

* Title
* Authors
* Publication or preprint status
* Venue
* Publication date
* Paper URL
* Abstract or concise research summary
* GitHub repository
* Dataset
* Related recent research

Include enough bibliographic and research information so that the resulting briefing can later be analyzed by another research analysis tool.`;

export const StartSection: React.FC<StartSectionProps> = ({
  onStartAnalysis,
  isLoading,
}) => {
  const [activeTab, setActiveTab] = useState<"have_briefing" | "need_briefing">("have_briefing");
  const [inputText, setInputText] = useState("");
  const [researchTopic, setResearchTopic] = useState("");
  const [generatedPrompt, setGeneratedPrompt] = useState("");
  const [copiedPrompt, setCopiedPrompt] = useState(false);

  const handleGeneratePrompt = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const topicToUse = researchTopic.trim() || "Animal Behaviour Analysis";
    setGeneratedPrompt(PROMPT_TEMPLATE.split("[TOPIC]").join(topicToUse));
  };

  const handleCopyPrompt = async () => {
    const promptToCopy = generatedPrompt || PROMPT_TEMPLATE.split("[TOPIC]").join(researchTopic.trim() || "Animal Behaviour Analysis");
    try {
      await navigator.clipboard.writeText(promptToCopy);
      setCopiedPrompt(true);
      setTimeout(() => setCopiedPrompt(false), 2200);
    } catch (err) {
      console.error("Clipboard copy failed:", err);
    }
  };

  const handleLoadSample = () => {
    setInputText(SAMPLE_RESEARCH_BRIEFING);
    setActiveTab("have_briefing");
  };

  const handleAnalyzeSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim() || isLoading) return;
    onStartAnalysis(inputText);
  };

  return (
    <div className="max-w-4xl mx-auto py-5 sm:py-9 px-4">
      <div className="text-center mb-8">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-slate-100 border border-slate-200 text-[11px] font-bold text-slate-600 mb-4">
          <Bookmark className="w-3.5 h-3.5 text-indigo-600 fill-indigo-100" />
          검증하고 비교해, 이번 주 읽을 논문을 고르다
        </div>
        <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-950 mb-2">
          이번 주 읽을 논문의 갈피를 잡아보세요
        </h1>
        <p className="text-sm sm:text-base text-slate-600 max-w-2xl mx-auto leading-relaxed">
          연구 브리핑 속 후보를 검증하고 비교해,<br className="hidden sm:block" />
          지금 읽을 한 편을 선택합니다.
        </p>
      </div>

      <div className="flex border-b border-slate-200 mb-6">
        <button
          type="button"
          onClick={() => setActiveTab("have_briefing")}
          className={`flex-1 pb-3 text-sm font-semibold border-b-2 text-center transition-colors ${
            activeTab === "have_briefing"
              ? "border-indigo-600 text-indigo-700"
              : "border-transparent text-slate-500 hover:text-slate-800"
          }`}
        >
          브리핑이 있어요
        </button>
        <button
          type="button"
          onClick={() => {
            setActiveTab("need_briefing");
            if (!generatedPrompt && researchTopic) handleGeneratePrompt();
          }}
          className={`flex-1 pb-3 text-sm font-semibold border-b-2 text-center transition-colors ${
            activeTab === "need_briefing"
              ? "border-indigo-600 text-indigo-700"
              : "border-transparent text-slate-500 hover:text-slate-800"
          }`}
        >
          브리핑이 없어요
        </button>
      </div>

      {activeTab === "have_briefing" && (
        <form onSubmit={handleAnalyzeSubmit} className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 sm:p-7">
          <div className="flex items-center justify-between mb-3">
            <label htmlFor="briefingMarkdown" className="text-sm font-bold text-slate-800 flex items-center space-x-2">
              <FileText className="w-4 h-4 text-indigo-600" />
              <span>주간 연구 브리핑</span>
            </label>

            <button
              type="button"
              onClick={handleLoadSample}
              className="inline-flex items-center space-x-1 px-3 py-1.5 text-xs font-semibold rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 transition-colors"
            >
              <BookOpen className="w-3.5 h-3.5 text-indigo-600" />
              <span>예시 브리핑 불러오기</span>
            </button>
          </div>

          <div className="relative mb-5">
            <textarea
              id="briefingMarkdown"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              placeholder="주간 연구 브리핑을 Markdown 형식으로 붙여넣어 주세요."
              rows={11}
              className="w-full p-4 text-sm font-mono bg-slate-50 rounded-xl border border-slate-300 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-slate-800 placeholder-slate-400 resize-y"
            />
            {inputText.length > 0 && (
              <div className="absolute bottom-3 right-4 text-xs text-slate-400 bg-white/90 px-2 py-0.5 rounded border border-slate-200">
                {inputText.length.toLocaleString()}자
              </div>
            )}
          </div>
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-1">
            <button
              type="button"
              onClick={() => setActiveTab("need_briefing")}
              className="text-xs text-indigo-600 hover:text-indigo-800 hover:underline font-medium inline-flex items-center space-x-1"
            >
              <Lightbulb className="w-3.5 h-3.5" />
              <span>브리핑 프롬프트가 필요하신가요?</span>
            </button>

            <button
              type="submit"
              disabled={!inputText.trim() || isLoading}
              className={`w-full sm:w-auto inline-flex items-center justify-center space-x-2 px-7 py-3 text-sm font-bold rounded-xl text-white shadow-md transition-all ${
                !inputText.trim() || isLoading ? "bg-slate-300 cursor-not-allowed shadow-none" : "bg-indigo-600 hover:bg-indigo-500 active:scale-98 shadow-indigo-600/20"
              }`}
            >
              <Search className="w-4 h-4" />
              <span>브리핑 분석하기</span>
              <ArrowRight className="w-4 h-4 ml-1" />
            </button>
          </div>
        </form>
      )}

      {activeTab === "need_briefing" && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 sm:p-7 space-y-5">
          <div>
            <h2 className="text-base font-bold text-slate-900 mb-1">어떤 연구 주제를 보고 계신가요?</h2>
            <p className="text-xs text-slate-500">
              주제만 입력하면 최신 연구를 조사할 수 있는 주간 브리핑 프롬프트를 만듭니다.
            </p>
          </div>

          <form onSubmit={handleGeneratePrompt} className="flex flex-col sm:flex-row gap-2">
            <input
              type="text"
              value={researchTopic}
              onChange={(e) => setResearchTopic(e.target.value)}
              placeholder="예: Video Action Recognition, 동물 행동 분석, VLM"
              className="flex-1 px-4 py-2.5 text-sm bg-slate-50 rounded-xl border border-slate-300 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-slate-900 placeholder-slate-400"
            />
            <button
              type="submit"
              className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs rounded-xl shadow-xs transition-colors shrink-0 inline-flex items-center justify-center space-x-1.5"
            >
              <FileText className="w-3.5 h-3.5" />
              <span>브리핑 프롬프트 만들기</span>
            </button>
          </form>

          <div className="space-y-3 pt-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-700">생성된 브리핑 프롬프트</span>
              <button
                type="button"
                onClick={handleCopyPrompt}
                className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-900 hover:bg-slate-800 text-white shadow-xs transition-colors"
              >
                {copiedPrompt ? (
                  <><Check className="w-3.5 h-3.5 text-emerald-400" /><span>복사 완료</span></>
                ) : (
                  <><Copy className="w-3.5 h-3.5" /><span>프롬프트 복사</span></>
                )}
              </button>
            </div>

            <div className="bg-slate-900 rounded-xl p-4 text-slate-200 font-mono text-xs max-h-72 overflow-y-auto leading-relaxed border border-slate-800 select-all">
              <pre className="whitespace-pre-wrap font-sans text-xs text-slate-200">
                {generatedPrompt || PROMPT_TEMPLATE.split("[TOPIC]").join(researchTopic.trim() || "Animal Behaviour Analysis")}
              </pre>
            </div>

            <div className="bg-indigo-50/70 border border-indigo-100 rounded-xl p-3.5 text-xs text-indigo-950 flex items-start space-x-2.5">
              <Lightbulb className="w-4 h-4 text-indigo-600 shrink-0 mt-0.5" />
              <p className="leading-relaxed">
                검색이 가능한 AI에 이 프롬프트를 입력하세요. 생성된 브리핑을 복사한 뒤 논문갈피로 돌아오면 검증과 비교를 이어갈 수 있습니다.
              </p>
            </div>

            <div className="flex items-center justify-between pt-2 border-t border-slate-100">
              <span className="text-xs text-slate-500">브리핑이 준비되었다면:</span>
              <button
                type="button"
                onClick={() => setActiveTab("have_briefing")}
                className="inline-flex items-center space-x-1.5 px-4 py-2 rounded-xl text-xs font-bold bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 transition-colors"
              >
                <span>브리핑을 붙여넣을게요</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
