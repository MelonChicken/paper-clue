import {
  BriefingAnalysisResponse,
  BriefingExtraction,
  PaperCandidate,
  AiRecommendation,
  GroundedEvidenceItem,
  DimensionScore,
  ComparisonResearchModule,
  ReproducibilityAssessment,
  VerificationScope,
  PublishingReliabilityDetails,
  VersionInfo,
  CodeStatus,
  DataStatus,
  ReproducibilityStatus,
  EntityType,
  IdentityStatus,
  SourceType,
  VerificationLevel,
  MetadataConflictInfo,
  PaperRole,
  SupportingResource,
} from "../../src/types";

export interface PipelineProgressUpdate {
  stage:
    | "briefingParser"
    | "metadataVerifier"
    | "resourceVerifier"
    | "documentAnalyzer"
    | "comparisonFinder"
    | "paperEvaluator"
    | "recommendationEngine"
    | "completed"
    | "error";
  label: string;
  paperIndex?: number;
  totalPapers?: number;
  paperTitle?: string;
  details?: string;
}

export type ProgressCallback = (update: PipelineProgressUpdate) => void;

export interface ExtractedPaperDraft {
  id: string;
  rawTitle: string;
  authors: string[];
  year: string;
  venue: string;
  snippet: string;
  claimedMetrics?: string[];
  mentionedCodeUrl?: string | null;
  mentionedDataUrl?: string | null;
}

export interface BriefingParserResult {
  briefingTitle: string;
  referenceDate: string;
  coreTopic: string;
  topicKeywords: string[];
  papers: ExtractedPaperDraft[];
  datasets: { name: string; description: string; link?: string }[];
  tools: { name: string; description: string; link?: string }[];
  unverifiedItems: string[];
}

export interface VerifiedMetadataResult {
  paperId: string;
  rawMention: string;
  entityType: EntityType;
  canonicalTitle: string;
  normalizedTitle: string;
  authors: string[];
  year: string;
  venueOrPreprint: string;
  doi: string | null;
  arxivId: string | null;
  biorxivId: string | null;
  url: string | null;
  canonicalUrl: string | null;
  identityStatus: IdentityStatus;
  metadataConflict?: MetadataConflictInfo;
  paperRole?: PaperRole;
  isRankingEligible?: boolean;
  matchConfidence: number;
  matchReason: string;
  publicationStatus: string;
  peerReviewed: boolean;
  isPreprint: boolean;
  versionInfo: VersionInfo;
  crossVerificationStatus: "VERIFIED" | "SINGLE_SOURCE" | "CONFLICTING" | "NOT_FOUND";
  publishingReliabilityDetails: PublishingReliabilityDetails;
  evidence: GroundedEvidenceItem[];
  supportingResources?: SupportingResource[];
}

export interface VerifiedResourcesResult {
  paperId: string;
  codeStatus: CodeStatus;
  codeUrl: string | null;
  dataStatus: DataStatus;
  dataUrl: string | null;
  checkpointStatus: "AVAILABLE_VERIFIED" | "FOUND_UNVERIFIED" | "NOT_FOUND" | "NOT_APPLICABLE";
  documentationStatus: "HIGH" | "MEDIUM" | "LOW" | "NOT_VERIFIED";
  executionVerification: "PASSED" | "FAILED" | "NOT_PERFORMED";
  reproducibilityLevel: ReproducibilityStatus;
  reproducibilityAssessment: ReproducibilityAssessment;
  evidence: GroundedEvidenceItem[];
  supportingResources?: SupportingResource[];
}

export interface DocumentAnalysisResult {
  paperId: string;
  performed: boolean;
  reason: string;
  researchQuestion?: string;
  method?: string;
  datasets?: string[];
  metrics?: string[];
  baselines?: string[];
  quantitativeResults?: string[];
  sotaClaim?: string;
  ablations?: string[];
  limitations?: string[];
  codeDataAvailabilityNotes?: string;
  evidence?: GroundedEvidenceItem[];
}

export interface ComparisonFinderResult {
  paperId: string;
  comparisonModule: ComparisonResearchModule;
}

export interface PaperEvaluationResult {
  paperId: string;
  scores: {
    performance: DimensionScore;
    novelty: DimensionScore;
    trendImportance: DimensionScore;
    academicSignificance: DimensionScore;
    practicalValue: DimensionScore;
    reproducibility: DimensionScore;
  };
  uncertainty: {
    factVerificationItems: string[];
    insufficientEvidenceItems: string[];
    researchOpenQuestions: string[];
  };
  verificationBadges: {
    metadataVerified: boolean;
    publicationVerified: boolean;
    codeVerified: boolean;
    dataVerified: boolean;
    performanceEvidenceVerified: boolean;
    reproducibilityVerified: boolean;
  };
  verificationScope: VerificationScope;
  overallBadgeStatus: "BASIC_INFO_VERIFIED" | "PARTIAL_INFO_UNVERIFIED" | "SOURCE_CONFLICT" | "IDENTITY_NOT_FOUND";
}

export interface PaperCacheItem {
  key: string;
  doi?: string | null;
  arxivId?: string | null;
  biorxivId?: string | null;
  normalizedTitle: string;
  metadata: VerifiedMetadataResult;
  resources: VerifiedResourcesResult;
  docAnalysis: DocumentAnalysisResult;
  comparison: ComparisonFinderResult;
  evaluation: PaperEvaluationResult;
  cachedAt: number;
}


