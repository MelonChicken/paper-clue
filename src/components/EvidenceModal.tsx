import React from "react";
import { PaperCandidate, GroundedEvidence, GroundedEvidenceItem } from "../types";
import { X, BookOpen, Globe, FileText, ExternalLink, ShieldAlert, CheckCircle, AlertTriangle, HelpCircle, GitCompare } from "lucide-react";
import { formatEnumKorean, getPaperEvaluationStatus } from "../utils/evaluationHelpers";

interface EvidenceModalProps {
  paper: PaperCandidate | null;
  dimensionKey?: string;
  onClose: () => void;
}

const DIMENSION_TITLE_MAP: Record<string, string> = {
  performance: "성능 경쟁력",
  novelty: "방법론 신규성",
  trendImportance: "연구 흐름 중요도",
  academicSignificance: "학술 유의미성",
  practicalValue: "실무·연구 적용 가치",
  reproducibility: "재현 가능성",
};

export const EvidenceModal: React.FC<EvidenceModalProps> = ({ paper, dimensionKey, onClose }) => {
  if (!paper) return null;

  const dimTitle = dimensionKey ? DIMENSION_TITLE_MAP[dimensionKey] || dimensionKey : "전체 평가 근거";
  const currentScoreObj = dimensionKey
    ? paper.scores[dimensionKey as keyof typeof paper.scores]
    : paper.scores.novelty;

  const evidence: GroundedEvidence = currentScoreObj?.evidence || {
    paperText: [],
    externalSource: [],
    aiInterpretation: [],
  };

  const isNotFound = paper.crossVerificationStatus === "NOT_FOUND";
  const evalStatus = getPaperEvaluationStatus(paper);

  const renderStatusBadge = (status?: string) => {
    if (status === "DIRECTLY_VERIFIED" || status === "VERIFIED") {
      return (
        <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
          <CheckCircle className="w-3 h-3 text-emerald-600" />
          <span>{formatEnumKorean(status)}</span>
        </span>
      );
    }

    if (status === "PARTIALLY_VERIFIED" || status === "NEEDS_VERIFICATION") {
      return (
        <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-200">
          <AlertTriangle className="w-3 h-3 text-amber-600" />
          <span>{formatEnumKorean(status)}</span>
        </span>
      );
    }

    return (
      <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-700 border border-slate-200">
        <HelpCircle className="w-3 h-3 text-slate-500" />
        <span>{formatEnumKorean(status)}</span>
      </span>
    );
  };

  const renderItem = (item: GroundedEvidenceItem, defaultSource: string, itemKey?: string | number) => {
    const claimText = item.claim || item.text || "근거 내용 미상";
    const loc = item.sourceLocation || item.section;
    const srcTitle = item.sourceTitle || item.sourceName || defaultSource;
    const url = item.sourceUrl || item.url;

    return (
      <li key={itemKey} className="bg-white p-3 rounded-xl border border-slate-200 shadow-2xs space-y-1.5 leading-relaxed">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center space-x-1.5">
            <span className="font-bold text-slate-800 text-[11px] px-2 py-0.5 rounded bg-slate-100">{srcTitle}</span>
            {loc && <span className="font-semibold text-indigo-700 text-[11px]">[{loc}]</span>}
          </div>

          <div className="flex items-center space-x-2">
            {renderStatusBadge(item.verificationStatus)}
            {url && (
              <a
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-indigo-600 hover:underline inline-flex items-center space-x-0.5 text-[11px] font-medium"
              >
                <span>출처</span>
                <ExternalLink className="w-3 h-3" />
              </a>
            )}
          </div>
        </div>

        <p className="text-xs text-slate-800 font-medium">{claimText}</p>

        {item.limitations && (
          <p className="text-[11px] text-amber-800 bg-amber-50/80 p-1.5 rounded border border-amber-200/80">
            <strong className="font-semibold">제약 사항:</strong> {item.limitations}
          </p>
        )}
      </li>
    );
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl max-w-2xl w-full border border-slate-200 shadow-2xl overflow-hidden my-8 animate-in fade-in zoom-in duration-150">
        <div className="bg-slate-900 text-white p-5 flex items-center justify-between border-b border-slate-800">
          <div>
            <div className="flex items-center space-x-2">
              <span className="text-xs font-semibold px-2.5 py-0.5 rounded bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                {dimTitle} 근거 검증
              </span>
              <span className="text-xs font-mono text-slate-400">[{formatEnumKorean(currentScoreObj?.status)}]</span>
            </div>
            <h3 className="text-lg font-bold text-white mt-1 leading-snug">{paper.title}</h3>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors"
            aria-label="닫기"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-6 max-h-[70vh] overflow-y-auto">
          <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-4 text-xs text-indigo-950">
            <div className="font-bold text-sm text-indigo-900 mb-1 flex items-center justify-between">
              <span>
                평가 요약: {currentScoreObj?.score !== null && currentScoreObj?.score !== undefined ? `${currentScoreObj.score}점 / 5점` : "추가 확인 필요 (점수 미부여)"}
              </span>
              {currentScoreObj?.scope && (
                <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-indigo-200 text-indigo-900">{currentScoreObj.scope}</span>
              )}
            </div>
            <p className="leading-relaxed">{currentScoreObj?.reason || currentScoreObj?.notes || "해당 항목에 대한 추가 설명이 없습니다."}</p>
          </div>

          <div className="border border-blue-200 rounded-xl p-4 bg-blue-50/40 space-y-2">
            <div className="flex items-center space-x-2 text-blue-900 font-bold text-xs">
              <BookOpen className="w-4 h-4 text-blue-600" />
              <span>1. 논문 원문 근거</span>
            </div>
            <p className="text-[11px] text-blue-800/80 mb-2">논문 본문, 표, 그림, 공식 부록에서 출처 위치와 함께 확인된 내용입니다.</p>
            {evidence.paperText.length > 0 ? (
              <ul className="space-y-2.5 text-xs text-slate-800">{evidence.paperText.map((item, idx) => renderItem(item, "논문 원문", `paperText-${idx}`))}</ul>
            ) : isNotFound ? (
              <p className="text-xs text-rose-600 font-medium bg-white p-2.5 rounded-lg border border-rose-200">논문 원문을 확인하지 못했습니다.</p>
            ) : (
              <p className="text-xs text-slate-500 italic bg-white p-2.5 rounded-lg border border-blue-100">해당 항목에 대한 명시적인 원문 근거가 기재되지 않았습니다.</p>
            )}
          </div>

          <div className="border border-emerald-200 rounded-xl p-4 bg-emerald-50/40 space-y-2">
            <div className="flex items-center space-x-2 text-emerald-900 font-bold text-xs">
              <Globe className="w-4 h-4 text-emerald-600" />
              <span>2. 외부 학술 출처 근거</span>
            </div>
            <p className="text-[11px] text-emerald-800/80 mb-2">공식 학회/저널 DB, arXiv, bioRxiv, GitHub 스냅샷 저장소에서 교차 검증된 사실입니다.</p>
            {evidence.externalSource.length > 0 ? (
              <ul className="space-y-2.5 text-xs text-slate-800">{evidence.externalSource.map((item, idx) => renderItem(item, "외부 학술 출처", `externalSource-${idx}`))}</ul>
            ) : isNotFound ? (
              <p className="text-xs text-rose-600 font-medium bg-white p-2.5 rounded-lg border border-rose-200">검증 가능한 동일 논문 출처를 확인하지 못했습니다.</p>
            ) : (
              <p className="text-xs text-slate-500 italic bg-white p-2.5 rounded-lg border border-emerald-100">외부 출처 교차검증 정보가 아직 확보되지 않았습니다.</p>
            )}
          </div>

          <div className="border border-purple-200 rounded-xl p-4 bg-purple-50/40 space-y-2">
            <div className="flex items-center space-x-2 text-purple-900 font-bold text-xs">
              <FileText className="w-4 h-4 text-purple-600" />
              <span>3. AI 종합 해석</span>
            </div>
            <p className="text-[11px] text-purple-800/80 mb-2">논문 원문과 외부 검증 자료를 바탕으로 한 AI의 분석 의견입니다. 논문 자체의 직접 주장과 구분됩니다.</p>
            {evidence.aiInterpretation.length > 0 ? (
              <ul className="space-y-2.5 text-xs text-slate-800">{evidence.aiInterpretation.map((item, idx) => renderItem(item, "AI 종합 분석", `aiInterp-${idx}`))}</ul>
            ) : evalStatus.status === "HOLD" ? (
              <p className="text-xs text-rose-600 font-medium bg-white p-2.5 rounded-lg border border-rose-200">근거 부족으로 정량 평가를 수행하지 않았습니다.</p>
            ) : (
              <p className="text-xs text-slate-500 italic bg-white p-2.5 rounded-lg border border-purple-100">종합 분석 의견 생성 대기 중입니다.</p>
            )}
          </div>

          {paper.comparisonModule && (
            <div className="border border-indigo-200 rounded-xl p-4 bg-indigo-50/40 space-y-3">
              <div className="flex items-center space-x-2 text-indigo-900 font-bold text-xs">
                <GitCompare className="w-4 h-4 text-indigo-600" />
                <span>관련 연구 및 비교 분석</span>
              </div>

              {paper.comparisonModule.directComparisonStudies?.length > 0 && (
                <div>
                  <div className="font-bold text-indigo-900 text-[11px] mb-1">직접 비교 연구:</div>
                  <ul className="space-y-1.5 text-xs text-slate-800">
                    {paper.comparisonModule.directComparisonStudies.map((s, idx) => (
                      <li key={`direct-comp-${paper.id}-${s.title}-${idx}`} className="bg-white p-2 rounded border border-indigo-100">
                        <div className="font-bold text-indigo-900">{s.title} ({s.year}) - {s.authors}</div>
                        <div className="text-[11px] text-slate-600">과업: {s.task} | 벤치마크: {s.dataset} | 지표: {s.metric}</div>
                        <div className="text-[11px] text-emerald-800 font-medium">비교: {s.performanceDiffNote}</div>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {paper.comparisonModule.nearTaskComparisonStudies?.length > 0 && (
                <div>
                  <div className="font-bold text-amber-900 text-[11px] mb-1 flex items-center space-x-1">
                    <span className="px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 border border-amber-300 font-bold text-[10px]">간접 비교</span>
                    <span>유사 과업 연구:</span>
                  </div>
                  <ul className="space-y-1.5 text-xs text-slate-800">
                    {paper.comparisonModule.nearTaskComparisonStudies.map((s, idx) => (
                      <li key={`near-task-${paper.id}-${s.title}-${idx}`} className="bg-white p-2 rounded border border-amber-200 bg-amber-50/30">
                        <div className="font-bold text-amber-950">{s.title} ({s.year}) - {s.authors}</div>
                        <div className="text-[11px] text-slate-600">과업: {s.task} | 벤치마크: {s.dataset} | 지표: {s.metric}</div>
                        <div className="text-[11px] text-amber-900 font-semibold italic">간접 비교 사유: {s.reasonNotDirectlyComparable || s.performanceDiffNote}</div>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {paper.comparisonModule.contextualRelatedStudies?.length > 0 && (
                <div>
                  <div className="font-bold text-slate-800 text-[11px] mb-1">맥락상 관련 연구:</div>
                  <ul className="space-y-1 text-xs text-slate-700">
                    {paper.comparisonModule.contextualRelatedStudies.map((s, idx) => (
                      <li key={`context-comp-${paper.id}-${s.title}-${idx}`} className="bg-white p-2 rounded border border-slate-200">
                        <span className="font-semibold text-slate-800">{s.title} ({s.year})</span>: {s.diffFromTarget || s.relatedFlow}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {paper.comparisonModule.representativePriorStudies?.length > 0 && (
                <div>
                  <div className="font-bold text-slate-800 text-[11px] mb-1">대표 선행 연구:</div>
                  <ul className="space-y-1 text-xs text-slate-700">
                    {paper.comparisonModule.representativePriorStudies.map((s, idx) => (
                      <li key={`prior-comp-${paper.id}-${s.title}-${idx}`} className="bg-white p-2 rounded border border-slate-200">
                        <span className="font-semibold text-slate-800">{s.title} ({s.year})</span>: {s.significance || s.relationToTarget}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          {paper.uncertainty && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-xs text-amber-900 space-y-3">
              <div className="font-bold flex items-center space-x-1.5 text-amber-900 border-b border-amber-200 pb-2">
                <ShieldAlert className="w-4 h-4 text-amber-600" />
                <span>불확실성 및 추가 검증 사항</span>
              </div>

              {paper.uncertainty.factVerificationItems.length > 0 && (
                <div>
                  <strong className="font-bold text-amber-900 text-[11px]">사실 확인 필요:</strong>
                  <ul className="list-disc pl-5 space-y-0.5 mt-0.5 text-amber-800">
                    {paper.uncertainty.factVerificationItems.map((v, i) => <li key={`fact-verif-${paper.id}-${i}`}>{v}</li>)}
                  </ul>
                </div>
              )}

              {paper.uncertainty.insufficientEvidenceItems.length > 0 && (
                <div>
                  <strong className="font-bold text-amber-900 text-[11px]">평가 근거 부족:</strong>
                  <ul className="list-disc pl-5 space-y-0.5 mt-0.5 text-amber-800">
                    {paper.uncertainty.insufficientEvidenceItems.map((i, idx) => <li key={`insuff-evid-${paper.id}-${idx}`}>{i}</li>)}
                  </ul>
                </div>
              )}

              {paper.uncertainty.researchOpenQuestions.length > 0 && (
                <div>
                  <strong className="font-bold text-amber-900 text-[11px]">추가 연구 질문:</strong>
                  <ul className="list-disc pl-5 space-y-0.5 mt-0.5 text-amber-800">
                    {paper.uncertainty.researchOpenQuestions.map((q, idx) => <li key={`open-q-${paper.id}-${idx}`}>{q}</li>)}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="p-4 bg-slate-50 border-t border-slate-200 text-right">
          <button onClick={onClose} className="px-5 py-2 bg-slate-800 hover:bg-slate-700 text-white font-semibold text-xs rounded-xl transition-colors">
            닫기
          </button>
        </div>
      </div>
    </div>
  );
};
