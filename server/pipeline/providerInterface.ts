import { z } from "zod";
import { StageName } from "../observability/types";

export interface StructuredGenerationRequest<T = any> {
  stage: StageName;
  model?: string;
  systemInstruction?: string;
  userPrompt: string;
  schema: z.ZodType<T> | any;
  schemaName?: string;
  webSearch?: boolean;
  webSearchRequired?: boolean;
  temperature?: number;
  maxTokens?: number;
  context?: any;
}

export interface ProviderUsage {
  inputTokens: number | null;
  cachedInputTokens: number | null;
  outputTokens: number | null;
  totalTokens: number | null;
  webSearchCalls: number | null;
}

export interface WebSearchResultItem {
  url?: string;
  title?: string;
  sourceType?: string;
  snippet?: string;
}

export interface StructuredGenerationResult<T> {
  data: T;
  rawText?: string;
  provider: "OPENAI" | "GEMINI";
  model: string;
  responseId?: string;
  usage: ProviderUsage;
  webSearchResults?: WebSearchResultItem[];
}

export interface AIProvider {
  name: "OPENAI" | "GEMINI";
  generateStructured<T>(
    request: StructuredGenerationRequest<T>
  ): Promise<StructuredGenerationResult<T>>;
}
