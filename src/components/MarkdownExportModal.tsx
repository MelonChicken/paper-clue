import React, { useState } from "react";
import { BriefingAnalysisResponse, CandidateUserStatus } from "../types";
import { generateReportMarkdown } from "../utils/markdownGenerator";
import { X, Copy, Check, Download, FileText } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

interface MarkdownExportModalProps {
  data: BriefingAnalysisResponse;
  userSelections: Record<string, CandidateUserStatus>;
  finalChoicePaperId: string | null;
  onClose: () => void;
}

export const MarkdownExportModal: React.FC<MarkdownExportModalProps> = ({
  data,
  userSelections,
  finalChoicePaperId,
  onClose,
}) => {
  const [copied, setCopied] = useState(false);
  const [activeTab, setActiveTab] = useState<"preview" | "code">("preview");

  const markdownContent = generateReportMarkdown(data, userSelections, finalChoicePaperId);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(markdownContent);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Copy error:", err);
    }
  };

  const handleDownload = () => {
    const blob = new Blob([markdownContent], { type: "text/markdown;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", `nonmungalph_report_${new Date().toISOString().slice(0, 10)}.md`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/70 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl max-w-4xl w-full border border-slate-200 shadow-2xl overflow-hidden my-6 flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="bg-slate-900 text-white p-4 sm:p-5 flex items-center justify-between border-b border-slate-800 shrink-0">
          <div className="flex items-center space-x-2">
            <FileText className="w-5 h-5 text-indigo-400" />
            <div>
              <h3 className="text-base font-bold text-white">최종 연구 분석 및 선택 리포트</h3>
              <p className="text-xs text-slate-400">논문갈피 리포트를 복사하거나 Markdown 파일로 내려받을 수 있습니다.</p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Toolbar Tabs & Copy Actions */}
        <div className="bg-slate-100 px-4 py-2.5 border-b border-slate-200 flex items-center justify-between shrink-0 text-xs">
          <div className="flex items-center space-x-2 bg-slate-200/80 p-1 rounded-lg">
            <button
              onClick={() => setActiveTab("preview")}
              className={`px-3 py-1 rounded-md font-medium transition-colors ${
                activeTab === "preview"
                  ? "bg-white text-slate-900 shadow-2xs font-bold"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              미리보기
            </button>
            <button
              onClick={() => setActiveTab("code")}
              className={`px-3 py-1 rounded-md font-medium transition-colors ${
                activeTab === "code"
                  ? "bg-white text-slate-900 shadow-2xs font-bold"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              Markdown 코드
            </button>
          </div>

          <div className="flex items-center space-x-2">
            <button
              onClick={handleDownload}
              className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 font-semibold shadow-2xs transition-colors"
            >
              <Download className="w-3.5 h-3.5 text-slate-600" />
              <span>.md 다운로드</span>
            </button>

            <button
              onClick={handleCopy}
              className="inline-flex items-center space-x-1.5 px-3.5 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-semibold shadow-sm transition-colors"
            >
              {copied ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-300" />
                  <span>복사 완료!</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" />
                  <span>전체 복사</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Content Body */}
        <div className="p-6 overflow-y-auto flex-1 bg-white">
          {activeTab === "preview" ? (
            <div className="prose prose-slate max-w-none text-xs sm:text-sm">
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={{
                  table: ({ children }) => (
                    <div className="overflow-x-auto my-4 border border-slate-200 rounded-lg shadow-2xs">
                      <table className="w-full text-xs text-left border-collapse bg-white">
                        {children}
                      </table>
                    </div>
                  ),
                  thead: ({ children }) => (
                    <thead className="bg-slate-100 text-slate-800 font-bold border-b border-slate-200">
                      {children}
                    </thead>
                  ),
                  th: ({ children }) => (
                    <th className="px-3 py-2 border-r border-slate-200 last:border-r-0 whitespace-nowrap">
                      {children}
                    </th>
                  ),
                  td: ({ children }) => (
                    <td className="px-3 py-2 border-t border-r border-slate-200 last:border-r-0 text-slate-700">
                      {children}
                    </td>
                  ),
                  h1: ({ children }) => (
                    <h1 className="text-lg sm:text-xl font-bold text-slate-900 mt-6 mb-3 pb-2 border-b border-slate-200">
                      {children}
                    </h1>
                  ),
                  h2: ({ children }) => (
                    <h2 className="text-base sm:text-lg font-bold text-slate-800 mt-5 mb-2 pb-1 border-b border-slate-100">
                      {children}
                    </h2>
                  ),
                  h3: ({ children }) => (
                    <h3 className="text-sm sm:text-base font-semibold text-slate-800 mt-4 mb-2">
                      {children}
                    </h3>
                  ),
                  h4: ({ children }) => (
                    <h4 className="text-xs sm:text-sm font-semibold text-slate-700 mt-3 mb-1">
                      {children}
                    </h4>
                  ),
                  p: ({ children }) => (
                    <p className="my-2 leading-relaxed text-slate-700">{children}</p>
                  ),
                  ul: ({ children }) => (
                    <ul className="list-disc list-inside my-2 space-y-1 text-slate-700">{children}</ul>
                  ),
                  ol: ({ children }) => (
                    <ol className="list-decimal list-inside my-2 space-y-1 text-slate-700">{children}</ol>
                  ),
                  li: ({ children }) => <li className="my-0.5">{children}</li>,
                  blockquote: ({ children }) => (
                    <blockquote className="border-l-4 border-indigo-500 bg-indigo-50/50 p-3 my-3 text-slate-700 rounded-r-lg">
                      {children}
                    </blockquote>
                  ),
                  hr: () => <hr className="my-5 border-slate-200" />,
                  code: ({ children }) => (
                    <code className="bg-slate-100 text-pink-600 px-1.5 py-0.5 rounded text-xs font-mono border border-slate-200">
                      {children}
                    </code>
                  ),
                }}
              >
                {markdownContent}
              </ReactMarkdown>
            </div>
          ) : (
            <pre className="p-4 bg-slate-900 text-slate-100 font-mono text-xs rounded-xl overflow-x-auto whitespace-pre-wrap leading-relaxed select-all">
              {markdownContent}
            </pre>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 bg-slate-50 border-t border-slate-200 text-right shrink-0">
          <button
            onClick={onClose}
            className="px-5 py-2 bg-slate-800 hover:bg-slate-700 text-white font-semibold text-xs rounded-xl transition-colors"
          >
            닫기
          </button>
        </div>
      </div>
    </div>
  );
};

