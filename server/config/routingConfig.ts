import { StageName } from "../observability/types.js";

export interface ModelRoute {
  stage: StageName;
  defaultModel: string;
  escalationModel?: string;
  escalationConditions: string[];
  maxOutputTokens: number;
  temperature: number;
  thinkingLevel?: string;
  searchGrounding: boolean;
}

export interface AnalysisBudgetConfig {
  maxApiCalls: number;
  maxInputTokens: number;
  maxOutputTokens: number;
  maxSearchQueries: number;
  maxEstimatedCostUsd: number;
  maxDocumentAnalyses: number;
}

export const ROUTING_CONFIG: Record<StageName, ModelRoute> = {
  BRIEFING_PARSER: {
    stage: "BRIEFING_PARSER",
    defaultModel: "gpt-4.1-mini",
    escalationModel: "gpt-4.1-o",
    escalationConditions: ["JSON_SCHEMA_VALIDATION_FAILED"],
    maxOutputTokens: 2048,
    temperature: 0.1,
    searchGrounding: false,
  },
  METADATA_VERIFIER: {
    stage: "METADATA_VERIFIER",
    defaultModel: "gpt-4.1-mini",
    escalationModel: "gpt-4.1-o",
    escalationConditions: ["IDENTIFIER_MISSING", "CROSS_VERIFICATION_FAILED"],
    maxOutputTokens: 2048,
    temperature: 0.2,
    searchGrounding: true,
  },
  RESOURCE_VERIFIER: {
    stage: "RESOURCE_VERIFIER",
    defaultModel: "gpt-4.1-mini",
    escalationModel: "gpt-4.1-o",
    escalationConditions: ["CODE_URL_UNVERIFIED"],
    maxOutputTokens: 2048,
    temperature: 0.2,
    searchGrounding: true,
  },
  DOCUMENT_ANALYZER: {
    stage: "DOCUMENT_ANALYZER",
    defaultModel: "gpt-4.1-mini",
    escalationModel: "gpt-4.1-o",
    escalationConditions: ["TABLE_EXTRACTION_FAILED", "SOTA_CLAIM_UNVERIFIED"],
    maxOutputTokens: 3072,
    temperature: 0.2,
    searchGrounding: false,
  },
  COMPARISON_FINDER: {
    stage: "COMPARISON_FINDER",
    defaultModel: "gpt-4.1-mini",
    escalationModel: "gpt-4.1-o",
    escalationConditions: ["DIRECT_COMPARISON_EMPTY"],
    maxOutputTokens: 3072,
    temperature: 0.2,
    searchGrounding: true,
  },
  PAPER_EVALUATOR: {
    stage: "PAPER_EVALUATOR",
    defaultModel: "gpt-4.1-mini",
    escalationModel: "gpt-4.1-o",
    escalationConditions: ["EVIDENCE_ID_MISSING", "RADAR_SCORES_INCOMPLETE"],
    maxOutputTokens: 4096,
    temperature: 0.2,
    searchGrounding: false,
  },
  RECOMMENDATION_ENGINE: {
    stage: "RECOMMENDATION_ENGINE",
    defaultModel: "gpt-4.1-mini",
    escalationModel: "gpt-4.1-o",
    escalationConditions: ["TRADEOFF_EXPLANATION_MISSING"],
    maxOutputTokens: 4096,
    temperature: 0.3,
    searchGrounding: false,
  },
  MARKDOWN_REPORT_GENERATOR: {
    stage: "MARKDOWN_REPORT_GENERATOR",
    defaultModel: "gpt-4.1-mini",
    escalationConditions: [],
    maxOutputTokens: 2048,
    temperature: 0.0,
    searchGrounding: false,
  },
};

export function isProEscalationEnabled(): boolean {
  return (
    process.env.ENABLE_MODEL_ESCALATION === "true" ||
    process.env.ENABLE_PRO_ESCALATION === "true"
  );
}

export function getRouteConfig(stage: StageName): ModelRoute {
  const baseRoute = ROUTING_CONFIG[stage];
  if (!isProEscalationEnabled()) {
    return {
      ...baseRoute,
      escalationModel: undefined,
    };
  }
  return baseRoute;
}

export const STANDARD_ANALYSIS_BUDGET: AnalysisBudgetConfig = {
  maxApiCalls: 35,
  maxInputTokens: 300_000,
  maxOutputTokens: 60_000,
  maxSearchQueries: 25,
  maxEstimatedCostUsd: 0.60,
  maxDocumentAnalyses: 2,
};

