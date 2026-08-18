import { GoogleGenAI } from "@google/genai";
import {
  AIProvider,
  StructuredGenerationRequest,
  StructuredGenerationResult,
  ProviderUsage,
} from "../providerInterface";
import { ProviderError, classifyGeminiError } from "../errorUtils";

export class GeminiProvider implements AIProvider {
  name = "GEMINI" as const;
  private client: GoogleGenAI;

  constructor(clientOrApiKey?: GoogleGenAI | string) {
    if (clientOrApiKey instanceof GoogleGenAI) {
      this.client = clientOrApiKey;
    } else {
      const apiKey = clientOrApiKey || process.env.GEMINI_API_KEY;
      if (!apiKey) {
        throw new ProviderError(
          "AUTHENTICATION_FAILED",
          "GEMINI_API_KEY environment variable is missing."
        );
      }
      this.client = new GoogleGenAI({
        apiKey,
        httpOptions: {
          headers: {
            "User-Agent": "aistudio-build",
          },
        },
      });
    }
  }

  async generateStructured<T>(
    request: StructuredGenerationRequest<T>
  ): Promise<StructuredGenerationResult<T>> {
    const modelToUse = request.model || "gemini-2.5-flash";

    try {
      const config: any = {
        temperature: request.temperature ?? 0.1,
        maxOutputTokens: request.maxTokens ?? 2048,
        responseMimeType: "application/json",
      };

      if (request.systemInstruction) {
        config.systemInstruction = request.systemInstruction;
      }

      if (request.webSearch) {
        config.tools = [{ googleSearch: {} }];
      }

      const response = await this.client.models.generateContent({
        model: modelToUse,
        contents: request.userPrompt,
        config,
      });

      const rawText = response.text || "";
      if (!rawText) {
        throw new ProviderError("SCHEMA_VALIDATION_FAILED", "Gemini returned empty text.");
      }

      let parsedData: T;
      try {
        parsedData = JSON.parse(rawText) as T;
      } catch (err) {
        throw new ProviderError(
          "SCHEMA_VALIDATION_FAILED",
          `Failed to parse JSON response from Gemini: ${rawText}`
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

      const usageMetadata = (response as any).usageMetadata;
      const usage: ProviderUsage = {
        inputTokens: usageMetadata?.promptTokenCount ?? null,
        cachedInputTokens: usageMetadata?.cachedContentTokenCount ?? null,
        outputTokens: usageMetadata?.candidatesTokenCount ?? null,
        totalTokens: usageMetadata?.totalTokenCount ?? null,
        webSearchCalls: request.webSearch ? 1 : null,
      };

      return {
        data: parsedData,
        rawText,
        provider: "GEMINI",
        model: modelToUse,
        usage,
      };
    } catch (err: any) {
      const classified = classifyGeminiError(err);
      throw new ProviderError(classified.code as any, classified.message, err);
    }
  }
}
