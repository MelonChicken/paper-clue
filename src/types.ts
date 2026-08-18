export interface DatasetItem {
  name: string;
  description: string;
  link?: string;
}

export interface GithubToolItem {
  name: string;
  description: string;
  link?: string;
}

export type EntityType =
  | 'PAPER'
  | 'METHOD'
  | 'MODEL'
  | 'PROJECT'
  | 'REPOSITORY'
  | 'DATASET'
  | 'BENCHMARK'
  | 'TOOL'
  | 'UNKNOWN';

export type IdentityStatus =
  | 'IDENTITY_VERIFIED'
  | 'POSSIBLE_MATCH'
  | 'RESOLVED_FROM_METHOD_OR_PROJECT'
  | 'IDENTITY_NOT_FOUND'
  | 'METADATA_CONFLICT';

export type RecommendationStatus =
  | 'ELIGIBLE'
  | 'NOT_ELIGIBLE'
  | 'PENDING_EVALUATION';

export type SourceType = 'PAPER' | 'EXTERNAL_SOURCE' | 'AI_INTERPRETATION';

export type VerificationLevel =
  | 'PAPER_REPORTED_VERIFIED'
  | 'EXTERNALLY_CORROBORATED'
  | 'INDEPENDENTLY_REPRODUCED'
  | 'NEEDS_VERIFICATION'
  | 'INSUFFICIENT_EVIDENCE';

export type EvidenceType = 'PAPER' | 'EXTERNAL' | 'AI_INTERPRETATION';
export type VerificationStatus = 'DIRECTLY_VERIFIED' | 'PARTIALLY_VERIFIED' | 'NOT_VERIFIED';
export type CrossVerificationStatus = 'VERIFIED' | 'SINGLE_SOURCE' | 'CONFLICTING' | 'NOT_FOUND';
export type ScopeVerificationStatus = 'VERIFIED' | 'SINGLE_SOURCE' | 'CONFLICTING' | 'NOT_FOUND' | 'NOT_CHECKED';
export type OverallBadgeStatus = 'BASIC_INFO_VERIFIED' | 'PARTIAL_INFO_UNVERIFIED' | 'SOURCE_CONFLICT' | 'IDENTITY_NOT_FOUND' | '¿œ∫Œ ¡§∫∏ πÃ»Æ¿Œ';

export interface GroundedEvidenceItem {
  evidenceType: EvidenceType;
  sourceTitle: string;
  sourceUrl?: string | null;
  sourceLocation?: string | null; // e.g. "Abstract", "Table 2", "Figure 1", "README"
  claim: string;
  verificationStatus: VerificationStatus;
  
  // Precise Verification Semantics fields
  claimText?: string;
  sourceType?: SourceType;
  sourceReference?: string;
  evidenceLocation?: string | null;
  verificationLevel?: VerificationLevel;

  accessedAt?: string | null;
  limitations?: string | null;
  text?: string; // fallback field
  sourceName?: string; // fallback field
  url?: string; // fallback field
  section?: string; // fallback field
}

export interface GroundedEvidence {
  paperText: GroundedEvidenceItem[];
  externalSource: GroundedEvidenceItem[];
  aiInterpretation: GroundedEvidenceItem[];
}

export type ScoreStatus = 'SCORED' | 'NEEDS_VERIFICATION' | 'NOT_APPLICABLE' | 'INSUFFICIENT_EVIDENCE';
export type ScoreScope = 'EXTERNAL_BENCHMARK' | 'INTERNAL_EXPERIMENT' | 'QUALITATIVE_ONLY';

export interface DimensionScore {
  score: number | null; // 1-5, or null if N/A, unverified, or insufficient
  status: ScoreStatus;
  reason: string;
  notes?: string; // fallback field
  evidenceIds?: string[];
  scope?: ScoreScope;
  evidence: GroundedEvidence;
  chartValue?: number | null;
}

export interface VersionInfo {
  publicationStatus: string;
  version?: string | null; // e.g. "v2"
  firstPublishedAt?: string | null;
  lastUpdatedAt?: string | null;
  isLatestVersion?: boolean | null;
}

export interface PublishingReliabilityDetails {
  conferenceName?: string | null;
  journalName?: string | null;
  impactFactor?: string | null;
  impactFactorYear?: string | null;
  jcrQuartile?: string | null;
  jcrCategory?: string | null;
  officialSourceUrl?: string | null;
  peerReviewed: boolean | null;
  isPreprint: boolean;
  scoreReason: string;
}

export type CodeStatus = 
  | 'AVAILABLE_VERIFIED' 
  | 'FOUND_UNVERIFIED' 
  | 'SEARCH_FAILED' 
  | 'NOT_FOUND_AFTER_RETRIES' 
  | 'AVAILABLE_UNVERIFIED' 
  | 'PARTIALLY_AVAILABLE' 
  | 'CLAIMED_AVAILABLE' 
  | 'NOT_FOUND' 
  | 'NOT_APPLICABLE';

export type DataStatus = 
  | 'AVAILABLE_VERIFIED' 
  | 'AVAILABLE_WITH_RESTRICTIONS' 
  | 'FOUND_UNVERIFIED'
  | 'SEARCH_FAILED'
  | 'NOT_FOUND_AFTER_RETRIES'
  | 'PARTIALLY_AVAILABLE' 
  | 'CLAIMED_AVAILABLE' 
  | 'NOT_FOUND' 
  | 'NOT_APPLICABLE';

export type ReproducibilityStatus = 
  | 'REPRODUCIBLE' 
  | 'PARTIALLY_REPRODUCIBLE' 
  | 'CODE_ONLY' 
  | 'PAPER_ONLY' 
  | 'NOT_VERIFIED';

export type ExecutionVerificationStatus = 'PASSED' | 'FAILED' | 'NOT_PERFORMED';
export type ResourceStatus = 'AVAILABLE_VERIFIED' | 'FOUND_UNVERIFIED' | 'AVAILABLE_WITH_RESTRICTIONS' | 'NOT_FOUND' | 'NOT_APPLICABLE';

export interface ReproducibilityAssessment {
  codeStatus: CodeStatus;
  dataStatus: DataStatus;
  checkpointStatus: 'AVAILABLE_VERIFIED' | 'FOUND_UNVERIFIED' | 'NOT_FOUND' | 'NOT_APPLICABLE';
  documentationStatus: 'HIGH' | 'MEDIUM' | 'LOW' | 'NOT_VERIFIED';
  executionVerification: ExecutionVerificationStatus;
  level: ReproducibilityStatus;
  score: number | null;
  reason: string;
}

export interface VerificationScope {
  metadata: ScopeVerificationStatus;
  publication: ScopeVerificationStatus;
  code: ScopeVerificationStatus;
  data: ScopeVerificationStatus;
  performance: ScopeVerificationStatus;
  reproducibility: ScopeVerificationStatus;
}

export interface VerificationBadges {
  metadataVerified: boolean;
  publicationVerified: boolean;
  codeVerified: boolean;
  dataVerified: boolean;
  performanceEvidenceVerified: boolean;
  reproducibilityVerified?: boolean;
}

export interface DirectComparisonStudy {
  title: string;
  year: string;
  task: string;
  dataset: string;
  metric: string;
  authors?: string;
  performanceDiffNote: string;
  isDirectlyComparable: boolean;
  identifier: string; // DOI, arXiv ID, bioRxiv ID, or official URL
  link?: string;
}

export interface NearTaskComparisonStudy {
  title: string;
  year: string;
  task: string;
  dataset: string;
  metric: string;
  authors?: string;
  performanceDiffNote?: string;
  reasonNotDirectlyComparable: string;
  identifier: string;
  link?: string;
}

export interface ContextualRelatedStudy {
  title: string;
  year: string;
  relatedFlow: string;
  diffFromTarget: string;
  reasonDirectComparisonNotPossible: string;
  identifier: string;
  link?: string;
}

export interface RepresentativePriorStudy {
  title: string;
  year: string;
  significance: string;
  relationToTarget: string;
  identifier: string;
  link?: string;
}

export interface ComparisonResearchModule {
  directComparisonStudies: DirectComparisonStudy[];
  nearTaskComparisonStudies?: NearTaskComparisonStudy[];
  contextualRelatedStudies: ContextualRelatedStudy[];
  representativePriorStudies: RepresentativePriorStudy[];
  sotaStatus: string; // e.g., "SOTA ?êÎã® Î∂àÍ? (ÎπÑÍµê Ï°∞Í±¥ ?ÅÏù¥)" or "SOTA ?ïÏù∏??
  summary: string;
}

export interface UncertaintyBreakdown {
  factVerificationItems: string[];      // ?¨Ïã§ Í≤ÄÏ¶??ÑÏöî
  insufficientEvidenceItems: string[];
  researchOpenQuestions: string[];
}

export interface MetadataConflictInfo {
  conflictFields: string[];
  conflictingIdentifier: string | null;
  candidateTitle: string;
  resolvedSourceTitle: string | null;
  resolvedSourceAuthors: string[];
  resolutionReason: string;
}

export type PaperRole = 'RESEARCH_PAPER' | 'BENCHMARK_PAPER';

export interface SupportingResource {
  name: string;
  entityType: EntityType;
  canonicalUrl?: string | null;
  verificationStatus: string;
  relatedPaper?: string | null;
  whyRelevant: string;
}
export interface PaperCandidate {
  id: string;
  title: string;
  authors: string[];
  year: number | string;
  venueOrPreprint: string;
  doi?: string | null;
  arxivId?: string | null;
  biorxivId?: string | null;
  url?: string | null;
  publicationStatus: string;
  versionInfo?: VersionInfo;
  crossVerificationStatus: CrossVerificationStatus;

  // Identity Resolution Pipeline fields
  rawMention: string;
  entityType: EntityType;
  canonicalTitle: string;
  canonicalUrl?: string | null;
  identityStatus: IdentityStatus;
  metadataConflict?: MetadataConflictInfo;
  paperRole?: PaperRole;
  isRankingEligible?: boolean;
  recommendationStatus?: RecommendationStatus;
  matchConfidence: number; // 0.0 - 1.0
  matchReason: string;

  // Evaluation Coverage fields
  scoredDimensions: number; // e.g. 5
  totalDimensions: number;  // e.g. 6
  evaluationCoverage: number | null; // percentage, e.g. 83; null until evaluator runs

  codeStatus: CodeStatus;
  codeUrl?: string | null;
  codeAvailable?: boolean | null; // fallback field
  dataStatus: DataStatus;
  dataUrl?: string | null;
  dataAvailable?: boolean | null; // fallback field
  reproducibilityStatus: ReproducibilityStatus;

  // Granular assessments
  reproducibilityAssessment?: ReproducibilityAssessment;
  verificationScope?: VerificationScope;
  overallBadgeStatus?: OverallBadgeStatus;

  // 6 Radar Dimensions
  scores: {
    performance: DimensionScore;
    novelty: DimensionScore;
    trendImportance: DimensionScore;
    academicSignificance: DimensionScore;
    practicalValue: DimensionScore;
    reproducibility: DimensionScore;
  };

  // Separate Metrics
  publishingReliabilityScore: number | null; // 1-5 or null
  publishingReliabilityDetails: PublishingReliabilityDetails;

  recencyScore: number | null; // 1-5 or null
  recencyNotes: string;

  // Comparison & Uncertainty Modules
  comparisonModule: ComparisonResearchModule;
  uncertainty: UncertaintyBreakdown;

  // Granular verification badges
  verificationBadges?: VerificationBadges;

  // Fallback field
  verificationNeededItems: string[];
}

export interface RecommendationAssessment {
  overallAcademicLeaderPaperId: string | null;
  weeklyTopicLeaderPaperId: string | null;
  recommendedPaperId: string | null;
  recommendationConfidence: 'HIGH' | 'MEDIUM' | 'LOW';
  weeklyTopicRelevance: {
    score: number | null;
    reason: string;
  };
  reason: string;
  tradeoffExplanation: string;
  scoresUsed: string[];
  scoresExcluded: string[];
  performanceEvidenceUsed: boolean;
}

export interface AiRecommendation {
  topRecommendedPaperId: string | null;
  recommendationStatus?: 'RECOMMENDED' | 'HELD_DUE_TO_INSUFFICIENT_EVIDENCE' | 'PRIORITIZED_AMONG_VERIFIED';
  recommendationEligibilityNote?: string;
  isHeldDueToInsufficientEvidence?: boolean;
  isPrioritizedAmongVerified?: boolean;
  overallAcademicLeaderPaperId?: string | null;
  weeklyTopicLeaderPaperId?: string | null;
  recommendationConfidence?: 'HIGH' | 'MEDIUM' | 'LOW';
  recommendationDecision?: RecommendationAssessment;
  weeklyTopicRelevance?: {
    score: number | null;
    reason: string;
  };
  tradeoffExplanation?: string;
  scoresUsed?: string[];
  scoresExcluded?: string[];
  performanceEvidenceUsed?: boolean;
  recommendationReason: string;
  keyRecommendationEvidence: string[];
  consideredUncertainties: string[];
  sotaStatus: string;
  hasDirectComparisonStudies: boolean;
  keyItemsToVerifyWhileReading: string[];
  positionInRecentTrend: string;
  keyStrengths: string[];
  keyLimitationsOrRisks: string[];
  readingQuestions: string[];
  followUpResearchQuestions: string[];
  verificationNeededNotes?: string[];
}

export interface BriefingExtraction {
  extractedPaperCount: number;
  datasetCount: number;
  githubToolCount: number;
  datasets: DatasetItem[];
  githubTools: GithubToolItem[];
  researchTrends: string[];
  excludedItems: string[];
  uncertaintySummary: {
    factVerificationCount: number;
    insufficientEvidenceCount: number;
    researchOpenQuestionCount: number;
  };
  verificationNeededCount?: number;
  supportingResourceCount?: number;
  supportingResourceBreakdown?: Record<string, number>;
}

export interface BriefingAnalysisResponse {
  briefingTitle: string;
  extraction: BriefingExtraction;
  candidates: PaperCandidate[];
  aiRecommendation: AiRecommendation;
  supportingResources?: SupportingResource[];
  analysisRunId?: string;
  analysisMode?: 'QUICK' | 'STANDARD' | 'DEEP';
  usageSummary?: any;
  fallbackUsed?: boolean;
  fallbackReason?: string;
  missingStages?: string[];
  verificationLevel?: 'HIGH' | 'MEDIUM' | 'LOW';
  resultOrigin?: 'LIVE_PIPELINE' | 'PARTIAL_PIPELINE' | 'FALLBACK';
  cacheEligibility?: 'REUSABLE' | 'SHORT_LIVED' | 'DO_NOT_CACHE';
}

export type CandidateUserStatus = 'selected' | 'held' | 'excluded' | 'none';






