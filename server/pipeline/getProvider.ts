import { AIProvider } from "./providerInterface";
import { OpenAIProvider } from "./providers/openaiProvider";
import { GeminiProvider } from "./providers/geminiProvider";

export function getAIProvider(overrideProvider?: "OPENAI" | "GEMINI"): AIProvider {
  const providerName = (
    overrideProvider ||
    process.env.AI_PROVIDER ||
    "openai"
  ).toUpperCase();

  if (providerName === "GEMINI") {
    if (process.env.ENABLE_GEMINI_PROVIDER !== "true") {
      console.warn(
        "[Provider Warning] ENABLE_GEMINI_PROVIDER is set to false. Falling back to OpenAIProvider."
      );
      return new OpenAIProvider();
    }
    return new GeminiProvider();
  }

  return new OpenAIProvider();
}
