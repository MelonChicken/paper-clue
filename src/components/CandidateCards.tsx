import React, { useState } from "react";
import { PaperCandidate, CandidateUserStatus } from "../types";
import {
  ExternalLink,
  Code,
  Database,
  BookmarkCheck,
  Check,
  ShieldCheck,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  Plus,
  Minus,
  Globe,
  FileText,
  BookOpen,
} from "lucide-react";
import {
  getPaperEvaluationStatus,
  getRadarEligibility,
  formatEnumKorean,
  sortCandidatesByEvaluation,
} from "../utils/evaluationHelpers";

interface CandidateCardsProps {
  candidates: PaperCandidate[];
  aiRecommendedId: string;
  userSelections: Record<string, CandidateUserStatus>;
  finalChoicePaperId: string | null;
  comparedPaperIds: string[];
  onToggleCompare: (paperId: string) => void;
  onSelectUserStatus: (paperId: string, status: CandidateUserStatus) => void;
  onSelectFinalChoice: (paperId: string) => void;
  onOpenEvidenceModal: (paper: PaperCandidate, dimensionKey?: string) => void;
}

export const CandidateCards: React.FC<CandidateCardsProps> = ({
  candidates,
  aiRecommendedId,
  userSelections,
  finalChoicePaperId,
  comparedPaperIds,
  onToggleCompare,
  onSelectUserStatus,
  onSelectFinalChoice,
  onOpenEvidenceModal,
}) => {
  const [expandedPaperIds, setExpandedPaperIds] = useState<string[]>([]);

  const toggleExpand = (paperId: string) => {
    setExpandedPaperIds((prev) =>
      prev.includes(paperId) ? prev.filter((id) => id !== paperId) : [...prev, paperId]
    );
  };

  // Sort candidates by evaluation ranking (Complete evaluations first, higher score first, AI rec prioritized)
  const sortedCandidates = sortCandidatesByEvaluation(candidates, aiRecommendedId);

  return (
    <section id="candidate-cards" className="mb-8 space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-slate-200 pb-3 gap-2">
        <div>
          <div className="flex items-center space-x-2">
            <span className="text-[11px] font-bold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded border border-indigo-100">
              3단계 · 논문 후보 및 근거
            </span>
            <span className="text-[11px] font-semibold text-slate-600 bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
              종합 평가 순위 정렬
            </span>
          </div>
          <h2 className="text-lg font-bold text-slate-900 mt-1">
            개별 논문 후보 상세 및 근거 검증 ({sortedCandidates.length}편)
          </h2>
        </div>
        <div className="text-xs text-slate-500">
          종합 평가 상태 및 점수 순으로 정렬했습니다. <strong>근거 보기</strong>를 통해 원문과 외부 출처를 확인할 수 있습니다.
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4">
        {sortedCandidates.map((paper, idx) => {
          const isAiRec = paper.id === aiRecommendedId;
          const isFinalChoice = paper.id === finalChoicePaperId;
          const isCompared = comparedPaperIds.includes(paper.id);
          const isExpanded = expandedPaperIds.includes(paper.id);
          const userStatus = userSelections[paper.id] || "none";

          const evalStatus = getPaperEvaluationStatus(paper);
          const radarEligibility = getRadarEligibility(paper);
          const rank = idx + 1;

          const topicScore = paper.scores.trendImportance?.score ?? paper.scores.performance?.score ?? null;
          const noveltyScore = paper.scores.novelty?.score ?? null;
          const reliabilityScore = paper.publishingReliabilityScore ?? paper.scores.academicSignificance?.score ?? null;
          const reproducibilityScore = paper.scores.reproducibility?.score ?? null;

          const isPeerReviewed =
            paper.publishingReliabilityDetails?.peerReviewed === true ||
            paper.publicationStatus?.toLowerCase().includes("peer") ||
            paper.publicationStatus?.toLowerCase().includes("published");

          const isPreprint =
            paper.publishingReliabilityDetails?.isPreprint === true ||
            paper.publicationStatus?.toLowerCase().includes("preprint") ||
            Boolean(paper.arxivId) ||
            Boolean(paper.biorxivId);

          const isCodeAvailable =
            paper.codeStatus === "AVAILABLE_VERIFIED" ||
            paper.codeStatus === "AVAILABLE_UNVERIFIED" ||
            paper.codeStatus === "PARTIALLY_AVAILABLE" ||
            paper.codeAvailable === true ||
            Boolean(paper.codeUrl);

          const isDataAvailable =
            paper.dataStatus === "AVAILABLE_VERIFIED" ||
            paper.dataStatus === "AVAILABLE_WITH_RESTRICTIONS" ||
            paper.dataStatus === "PARTIALLY_AVAILABLE" ||
            paper.dataAvailable === true ||
            Boolean(paper.dataUrl);

          const isNotFound = paper.crossVerificationStatus === "NOT_FOUND";
          const needsVerification =
            isNotFound ||
            paper.crossVerificationStatus === "CONFLICTING" ||
            Object.values(paper.scores).some((s) => s.score === null || s.status === "NEEDS_VERIFICATION") ||
            (paper.uncertainty?.factVerificationItems?.length || 0) > 0;

          return (
            <article
              key={paper.id}
              id={`paper-card-${paper.id}`}
              className={`bg-white rounded-xl border transition-all duration-200 overflow-hidden relative ${
                isFinalChoice
                  ? "border-emerald-500 ring-2 ring-emerald-500/20 shadow-md"
                  : isAiRec
                  ? "border-indigo-400 ring-1 ring-indigo-400/30 shadow-xs"
                  : userStatus === "excluded"
                  ? "border-slate-200 opacity-60 bg-slate-50/70"
                  : "border-slate-200 shadow-2xs hover:border-slate-300"
              }`}
            >
              {isFinalChoice && <div className="absolute top-0 right-5 w-5 h-8 bg-emerald-500 rounded-b-sm shadow-sm z-10" aria-hidden="true" />}
              {/* Top Banner Row */}
              <div className="px-4 py-2.5 bg-slate-50/90 border-b border-slate-100 flex flex-wrap items-center justify-between gap-2 text-xs">
                <div className="flex items-center space-x-2">
                  <span
                    className={`font-mono font-bold text-xs px-2 py-0.5 rounded-md border ${
                      rank === 1
                        ? "bg-amber-100 text-amber-900 border-amber-300 font-black"
                        : rank === 2
                        ? "bg-slate-200 text-slate-800 border-slate-300 font-bold"
                        : rank === 3
                        ? "bg-orange-50 text-orange-800 border-orange-200 font-bold"
                        : "bg-white text-slate-600 border-slate-200"
                    }`}
                  >
                    종합 {rank}위</span>
                  <span className="font-semibold text-slate-700">{paper.venueOrPreprint}</span>
                  <span className="text-slate-400">쨌</span>
                  <span className="text-slate-500">{paper.year}</span>
                </div>

                <div className="flex items-center space-x-2">
                  {/* Evaluation Status Badge */}
                  <span
                    className={`inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold border ${evalStatus.badgeClass}`}
                  >
                    <span>{evalStatus.label}</span>
                  </span>

                  {isAiRec && (
                    <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded bg-indigo-600 text-white font-bold text-[11px]">
                      <BookmarkCheck className="w-3 h-3" />
                      <span>AI 추천</span>
                    </span>
                  )}
                  {isFinalChoice && (
                    <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded bg-emerald-600 text-white font-bold text-[11px]">
                      <Check className="w-3 h-3" />
                      <span>이번 주 선택 논문</span>
                    </span>
                  )}
                </div>
              </div>

              {/* Card Core Content */}
              <div className="p-4 sm:p-5">
                <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4">
                  {/* Left Main Details */}
                  <div className="flex-1 space-y-2.5">
                    <h3 className="font-bold text-slate-900 text-base sm:text-lg leading-snug">
                      {paper.title}
                    </h3>
                    <p className="text-xs text-slate-600">
                      {paper.authors.join(", ")}
                    </p>

                    {/* Status Badges */}
                    <div className="flex flex-wrap gap-1.5 pt-1">
                      {isPeerReviewed && (
                        <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-blue-50 text-blue-700 border border-blue-200 inline-flex items-center space-x-1">
                          <ShieldCheck className="w-3 h-3" />
                          <span>동료심사 완료</span>
                        </span>
                      )}

                      {isPreprint && (
                        <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-amber-50 text-amber-700 border border-amber-200">
                          프리프린트 ({paper.versionInfo?.version || "v1"})
                        </span>
                      )}

                      {isCodeAvailable && (
                        <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 inline-flex items-center space-x-1">
                          <Code className="w-3 h-3" />
                          <span>코드: {formatEnumKorean(paper.codeStatus)}</span>
                        </span>
                      )}

                      {isDataAvailable && (
                        <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-purple-50 text-purple-700 border border-purple-200 inline-flex items-center space-x-1">
                          <Database className="w-3 h-3" />
                          <span>데이터셋: {formatEnumKorean(paper.dataStatus)}</span>
                        </span>
                      )}

                      {needsVerification && (
                        <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-rose-50 text-rose-700 border border-rose-200 inline-flex items-center space-x-1">
                          <AlertTriangle className="w-3 h-3" />
                          <span>{isNotFound ? "확인되지 않음" : "추가 확인 필요"}</span>
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Right Score Block */}
                  <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200/80 min-w-[260px] shrink-0 text-xs space-y-2.5">
                    <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                      <span className="font-semibold text-slate-600">종합 평가</span>
                      {evalStatus.status === "HOLD" ? (
                        <span className="font-bold font-mono text-sm px-2.5 py-0.5 rounded-md bg-rose-100 text-rose-700 border border-rose-200">
                          평가 보류
                        </span>
                      ) : (
                        <span className="font-bold font-mono text-base text-indigo-700">
                          {evalStatus.scoreDisplay}
                        </span>
                      )}
                    </div>

                    <p className="text-[11px] text-slate-500 leading-tight">
                      {evalStatus.scoreDescription}
                    </p>

                    <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 pt-1 text-[11px]">
                      <div className="flex items-center justify-between text-slate-600">
                        <span>주제 적합도</span>
                        <span className="font-bold text-slate-900">
                          {topicScore !== null ? `${topicScore}점` : "근거 부족"}
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-slate-600">
                        <span>신규성</span>
                        <span className="font-bold text-slate-900">
                          {noveltyScore !== null ? `${noveltyScore}점` : "근거 부족"}
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-slate-600">
                        <span>학술 신뢰도</span>
                        <span className="font-bold text-slate-900">
                          {reliabilityScore !== null ? `${reliabilityScore}점` : "근거 부족"}
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-slate-600">
                        <span>재현성</span>
                        <span className="font-bold text-slate-900">
                          {reproducibilityScore !== null ? `${reproducibilityScore}점` : "근거 부족"}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Card Action Row */}
                <div className="flex flex-wrap items-center justify-between gap-2 pt-4 mt-4 border-t border-slate-100 text-xs">
                  <div className="flex items-center space-x-2">
                    <button
                      type="button"
                      onClick={() => toggleExpand(paper.id)}
                      className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-semibold border border-indigo-200 transition-colors"
                    >
                      <span>{isExpanded ? "근거 접기" : "근거 보기"}</span>
                      {isExpanded ? (
                        <ChevronUp className="w-3.5 h-3.5" />
                      ) : (
                        <ChevronDown className="w-3.5 h-3.5" />
                      )}
                    </button>

                    <button
                      type="button"
                      disabled={!radarEligibility.isEligible && !isCompared}
                      onClick={() => onToggleCompare(paper.id)}
                      title={!radarEligibility.isEligible ? radarEligibility.reason : ""}
                      className={`inline-flex items-center space-x-1 px-2.5 py-1.5 rounded-lg border font-medium transition-colors ${
                        isCompared
                          ? "bg-slate-900 text-white border-slate-800"
                          : !radarEligibility.isEligible
                          ? "bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed"
                          : "bg-white text-slate-700 border-slate-300 hover:bg-slate-50"
                      }`}
                    >
                      {isCompared ? (
                        <>
                          <Minus className="w-3 h-3 text-indigo-300" />
                          <span>비교 중</span>
                        </>
                      ) : !radarEligibility.isEligible ? (
                        <>
                          <AlertTriangle className="w-3 h-3 text-slate-400" />
                          <span>비교 불가 (근거 부족)</span>
                        </>
                      ) : (
                        <>
                          <Plus className="w-3 h-3 text-slate-500" />
                          <span>비교에 추가</span>
                        </>
                      )}
                    </button>

                    {paper.url && (
                      <a
                        href={paper.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="p-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-md transition-colors"
                        title="논문 링크"
                      >
                        <ExternalLink className="w-4 h-4" />
                      </a>
                    )}
                  </div>

                  <div className="flex items-center space-x-2">
                    <button
                      type="button"
                      onClick={() => onSelectUserStatus(paper.id, userStatus === "held" ? "none" : "held")}
                      className={`px-2.5 py-1.5 rounded-lg border text-xs font-medium transition-colors ${
                        userStatus === "held"
                          ? "bg-amber-100 text-amber-800 border-amber-300 font-bold"
                          : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
                      }`}
                    >
                      보류
                    </button>

                    <button
                      type="button"
                      onClick={() => onSelectUserStatus(paper.id, userStatus === "excluded" ? "none" : "excluded")}
                      className={`px-2.5 py-1.5 rounded-lg border text-xs font-medium transition-colors ${
                        userStatus === "excluded"
                          ? "bg-rose-100 text-rose-800 border-rose-300 font-bold"
                          : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
                      }`}
                    >
                      제외
                    </button>

                    <button
                      type="button"
                      onClick={() => onSelectFinalChoice(paper.id)}
                      className={`px-3.5 py-1.5 rounded-lg font-bold text-xs transition-all ${
                        isFinalChoice
                          ? "bg-emerald-600 text-white shadow-xs"
                          : "bg-indigo-600 hover:bg-indigo-500 text-white active:scale-98 shadow-xs"
                      }`}
                    >
                      {isFinalChoice ? "선택됨" : "이 논문 선택"}
                    </button>
                  </div>
                </div>
              </div>

              {/* Progressive Disclosure: Expanded Evidence Detail */}
              {isExpanded && (
                <div className="bg-slate-50 border-t border-slate-200 p-5 space-y-4 text-xs animate-in fade-in duration-150">
                  <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                    <span className="font-bold text-slate-800 flex items-center space-x-1.5">
                      <BookOpen className="w-4 h-4 text-indigo-600" />
                      <span>검증 근거 상세 분석</span>
                    </span>
                    <button
                      onClick={() => onOpenEvidenceModal(paper)}
                      className="text-xs text-indigo-600 hover:text-indigo-800 hover:underline font-semibold"
                    >
                      전체 근거 모달로 열기
                    </button>

                  </div>
                  {/* Metadata & Resources Grid */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
                    <div className="bg-white p-2.5 rounded-lg border border-slate-200">
                      <div className="text-[10px] text-slate-400 font-medium">식별자 / DOI</div>
                      <div className="font-mono text-slate-800 truncate">
                        {paper.doi || paper.arxivId || paper.biorxivId || "확인 필요"}
                      </div>
                    </div>
                    <div className="bg-white p-2.5 rounded-lg border border-slate-200">
                      <div className="text-[10px] text-slate-400 font-medium">GitHub 저장소</div>
                      <div className="font-mono text-slate-800 truncate">
                        {paper.codeUrl || formatEnumKorean(paper.codeStatus)}
                      </div>
                    </div>
                    <div className="bg-white p-2.5 rounded-lg border border-slate-200">
                      <div className="text-[10px] text-slate-400 font-medium">데이터셋</div>
                      <div className="font-mono text-slate-800 truncate">
                        {paper.dataUrl || formatEnumKorean(paper.dataStatus)}
                      </div>
                    </div>
                    <div className="bg-white p-2.5 rounded-lg border border-slate-200">
                      <div className="text-[10px] text-slate-400 font-medium">재현 가능성 상태</div>
                      <div className="font-bold text-indigo-700">
                        {formatEnumKorean(paper.reproducibilityStatus)}
                      </div>
                    </div>
                  </div>

                  {/* 3 Evidence Categories */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-1">
                    {/* 1. Paper Evidence */}
                    <div className="bg-blue-50/60 p-3 rounded-xl border border-blue-200/80 space-y-2">
                      <div className="font-bold text-blue-900 flex items-center space-x-1.5 text-xs">
                        <BookOpen className="w-3.5 h-3.5 text-blue-600" />
                        <span>1. 논문 원문 근거</span>
                      </div>
                      <p className="text-[11px] text-blue-800/80">
                        논문 본문, 표, 공식 부록에서 직접 추출한 사실
                      </p>
                      <ul className="space-y-1 text-slate-800 text-[11px] pl-3 list-disc">
                        {paper.scores.performance.evidence.paperText.length > 0 ? (
                          paper.scores.performance.evidence.paperText.slice(0, 2).map((item, i) => (
                            <li key={i}>
                              <span className="font-semibold text-blue-950">[{item.sourceLocation || "본문"}]:</span>{" "}
                              {item.claim}
                            </li>
                          ))
                        ) : isNotFound ? (
                          <li className="text-rose-600 font-medium list-none -ml-3">
                            논문 원문을 확인하지 못했습니다.
                          </li>
                        ) : (
                          <li className="text-slate-500 italic list-none -ml-3">
                            해당 항목에 대한 명시적인 원문 근거가 기재되지 않았습니다.
                          </li>
                        )}
                      </ul>
                    </div>

                    {/* 2. External Evidence */}
                    <div className="bg-emerald-50/60 p-3 rounded-xl border border-emerald-200/80 space-y-2">
                      <div className="font-bold text-emerald-900 flex items-center space-x-1.5 text-xs">
                        <Globe className="w-3.5 h-3.5 text-emerald-600" />
                        <span>2. 외부 출처 근거</span>
                      </div>
                      <p className="text-[11px] text-emerald-800/80">
                        공식 학회 DB, arXiv, GitHub 등 교차검증 정보
                      </p>
                      <ul className="space-y-1 text-slate-800 text-[11px] pl-3 list-disc">
                        {paper.scores.performance.evidence.externalSource.length > 0 ? (
                          paper.scores.performance.evidence.externalSource.slice(0, 2).map((item, i) => (
                            <li key={i}>
                              <span className="font-semibold text-emerald-950">[{item.sourceTitle}]:</span>{" "}
                              {item.claim}
                            </li>
                          ))
                        ) : isNotFound ? (
                          <li className="text-rose-600 font-medium list-none -ml-3">
                            검증 가능한 동일 논문 출처를 확인하지 못했습니다.
                          </li>
                        ) : (
                          <li className="text-slate-500 italic list-none -ml-3">
                            외부 출처 교차검증 정보가 아직 확보되지 않았습니다.
                          </li>
                        )}
                      </ul>
                    </div>

                    {/* 3. AI Interpretation */}
                    <div className="bg-purple-50/60 p-3 rounded-xl border border-purple-200/80 space-y-2">
                      <div className="font-bold text-purple-900 flex items-center space-x-1.5 text-xs">
                        <FileText className="w-3.5 h-3.5 text-purple-600" />
                        <span>3. AI 종합 해석</span>
                      </div>
                      <p className="text-[11px] text-purple-800/80">
                        원문과 외부 출처를 종합한 AI 분석 의견
                      </p>
                      <ul className="space-y-1 text-slate-800 text-[11px] pl-3 list-disc">
                        {paper.scores.performance.evidence.aiInterpretation.length > 0 ? (
                          paper.scores.performance.evidence.aiInterpretation.slice(0, 2).map((item, i) => (
                            <li key={i}>{item.claim}</li>
                          ))
                        ) : evalStatus.status === "HOLD" ? (
                          <li className="text-rose-600 font-medium list-none -ml-3">
                            근거 부족으로 정량 평가를 수행하지 않았습니다.
                          </li>
                        ) : (
                          <li className="text-slate-500 italic list-none -ml-3">
                            종합 분석 의견 생성 대기 중
                          </li>
                        )}
                      </ul>
                    </div>
                  </div>

                  {/* Additional Verification Required / Uncertainty */}
                  {paper.uncertainty && (
                    <div className="bg-amber-50/80 border border-amber-200 rounded-xl p-3 text-[11px] text-amber-950 space-y-1">
                      <div className="font-bold flex items-center space-x-1 text-amber-900">
                        <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
                        <span>추가 확인 필요 사항:</span>
                      </div>
                      <ul className="list-disc pl-4 space-y-0.5 text-amber-900">
                        {paper.uncertainty.factVerificationItems.slice(0, 2).map((v, i) => (
                          <li key={i}>{v}</li>
                        ))}
                        {paper.uncertainty.insufficientEvidenceItems.slice(0, 2).map((v, i) => (
                          <li key={`ins-${i}`}>{v}</li>
                        ))}
                        {paper.uncertainty.factVerificationItems.length === 0 &&
                          paper.uncertainty.insufficientEvidenceItems.length === 0 && (
                            <li className="text-slate-500 italic">특이 미확정 항목 없음</li>
                          )}
                      </ul>
                    </div>
                  )}
                </div>
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
};


