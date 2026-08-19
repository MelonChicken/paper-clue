import OpenAI from "openai";
import { zodResponseFormat } from "openai/helpers/zod";
import {
  AIProvider,
  StructuredGenerationRequest,
  StructuredGenerationResult,
  ProviderUsage,
  WebSearchResultItem,
} from "../providerInterface.js";
import { ProviderError, classifyProviderError } from "../errorUtils.js";
import { assertOpenAIStrictSchemaCompatible } from "../schemaValidator.js";

const ALLOWED_SEARCH_STAGES = new Set([
  "METADATA_VERIFIER",
  "RESOURCE_VERIFIER",
  "COMPARISON_FINDER",
]);

export class OpenAIProvider implements AIProvider {
  name = "OPENAI" as const;
  private client: OpenAI;

  constructor(apiKey?: string) {
    const key = apiKey || process.env.OPENAI_API_KEY;
    if (!key) {
      throw new ProviderError(
        "AUTHENTICATION_FAILED",
        "OPENAI_API_KEY environment variable is missing."
      );
    }
    this.client = new OpenAI({ apiKey: key });
  }

  async generateStructured<T>(
    request: StructuredGenerationRequest<T>
  ): Promise<StructuredGenerationResult<T>> {
    const modelToUse = request.model || "gpt-4.1-mini";
    const isSearchAllowed = ALLOWED_SEARCH_STAGES.has(request.stage) && Boolean(request.webSearch);

    const tools: any[] = isSearchAllowed ? [{ type: "web_search" }] : [];
    const toolChoice = isSearchAllowed && request.webSearchRequired ? "required" : undefined;

    let attempts = 0;
    const maxAttempts = 2; // Retry once on schema validation failure

    let lastError: any = null;

    const schemaName = request.schemaName || request.stage.toLowerCase();
    if (request.schema) {
      assertOpenAIStrictSchemaCompatible(request.schema, schemaName);
    }

    while (attempts < maxAttempts) {
      attempts++;
      try {
        const schemaName = request.schemaName || request.stage.toLowerCase();
        const formatObj = zodResponseFormat(request.schema, schemaName);
        const textFormat = {
          type: "json_schema" as const,
          ...formatObj.json_schema,
        };

        const response: any = await this.client.responses.parse({
          model: modelToUse,
          input: request.userPrompt,
          instructions: request.systemInstruction || undefined,
          text: {
            format: textFormat,
          },
          ...(tools.length > 0 ? { tools } : {}),
          ...(toolChoice ? { tool_choice: toolChoice } : {}),
        } as any);

        if (!response) {
          throw new ProviderError("UNKNOWN", "OpenAI returned empty response.");
        }

        let rawText = "";
        if (response.output) {
          for (const item of response.output) {
            if (item.type === "message" && item.content) {
              for (const c of item.content) {
                if (c.type === "output_text" && c.text) {
                  rawText += c.text;
                }
              }
            }
          }
        }

        let parsedData: T | null = response.output_parsed as T | null;

        if (!parsedData && rawText) {
          try {
            parsedData = JSON.parse(rawText) as T;
          } catch (e) {
            // Ignore parse failure
          }
        }

        if (!parsedData) {
          throw new ProviderError(
            "SCHEMA_VALIDATION_FAILED",
            `Structured Output failed to produce valid JSON adhering to schema ${schemaName}.`
          );
        }

        if (request.schema && typeof request.schema.safeParse === "function") {
          const valResult = request.schema.safeParse(parsedData);
          if (!valResult.success) {
            throw new ProviderError(
              "SCHEMA_VALIDATION_FAILED",
              `Schema validation failed: ${valResult.error.message}`
            );
          }
          parsedData = valResult.data;
        }

        const usage: ProviderUsage = {
          inputTokens: response.usage?.input_tokens ?? null,
          cachedInputTokens: response.usage?.input_tokens_details?.cached_tokens ?? null,
          outputTokens: response.usage?.output_tokens ?? null,
          totalTokens: response.usage?.total_tokens ?? null,
          webSearchCalls: isSearchAllowed ? 0 : null,
        };

        const webSearchResults: WebSearchResultItem[] = [];
        let webSearchCallCount = 0;

        if (response.output && Array.isArray(response.output)) {
          for (const item of response.output) {
            if (item.type === "web_search_call") {
              webSearchCallCount++;
              if (item.action && item.action.sources) {
                for (const src of item.action.sources) {
                  webSearchResults.push({
                    url: src.url,
                    sourceType: "WEB_SEARCH",
                  });
                }
              }
            }
          }
        }

        if (isSearchAllowed) {
          usage.webSearchCalls = webSearchCallCount;
        }

        return {
          data: parsedData as T,
          rawText,
          provider: "OPENAI",
          model: modelToUse,
          responseId: response.id,
          usage,
          webSearchResults,
        };
      } catch (err: any) {
        lastError = err;
        const classified = classifyProviderError(err);

        if (
          classified.code === "AUTHENTICATION_FAILED" ||
          classified.code === "INSUFFICIENT_CREDIT" ||
          classified.code === "RATE_LIMITED" ||
          classified.code === "MODEL_NOT_FOUND"
        ) {
          throw new ProviderError(classified.code, classified.message, err);
        }

        if (attempts >= maxAttempts) {
          throw new ProviderError(classified.code, classified.message, err);
        }
      }
    }

    const classified = classifyProviderError(lastError);
    throw new ProviderError(classified.code, classified.message, lastError);
  }
}
