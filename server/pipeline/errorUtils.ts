export type ProviderErrorCode =
  | "AUTHENTICATION_FAILED"
  | "INSUFFICIENT_CREDIT"
  | "RATE_LIMITED"
  | "MODEL_NOT_FOUND"
  | "SCHEMA_VALIDATION_FAILED"
  | "NETWORK_ERROR"
  | "UNKNOWN";

export class ProviderError extends Error {
  code: ProviderErrorCode;
  rawError?: any;

  constructor(code: ProviderErrorCode, message: string, rawError?: any) {
    super(message);
    this.name = "ProviderError";
    this.code = code;
    this.rawError = rawError;
  }
}

export function classifyProviderError(err: any): {
  code: ProviderErrorCode;
  message: string;
} {
  if (err instanceof ProviderError) {
    return { code: err.code, message: err.message };
  }

  const msg = String(err?.message || err || "");
  const status = err?.status || err?.statusCode;
  const errCode = err?.code;

  if (
    status === 401 ||
    msg.includes("401") ||
    errCode === "invalid_api_key" ||
    msg.toLowerCase().includes("api key") ||
    msg.includes("AUTHENTICATION_FAILED")
  ) {
    return { code: "AUTHENTICATION_FAILED", message: msg };
  }

  if (
    errCode === "insufficient_quota" ||
    msg.includes("insufficient_quota") ||
    msg.toLowerCase().includes("credit") ||
    msg.includes("INSUFFICIENT_CREDIT")
  ) {
    return { code: "INSUFFICIENT_CREDIT", message: msg };
  }

  if (
    status === 429 ||
    msg.includes("429") ||
    errCode === "rate_limit_exceeded" ||
    msg.includes("RESOURCE_EXHAUSTED") ||
    msg.toLowerCase().includes("rate limit") ||
    msg.includes("RATE_LIMITED")
  ) {
    return { code: "RATE_LIMITED", message: msg };
  }

  if (
    status === 404 ||
    errCode === "model_not_found" ||
    msg.includes("404") ||
    msg.includes("model_not_found") ||
    msg.toLowerCase().includes("model not found")
  ) {
    return { code: "MODEL_NOT_FOUND", message: msg };
  }

  if (
    msg.includes("Schema") ||
    msg.includes("Zod") ||
    msg.includes("JSON") ||
    msg.includes("Quality Gate") ||
    msg.includes("SCHEMA_VALIDATION_FAILED")
  ) {
    return { code: "SCHEMA_VALIDATION_FAILED", message: msg };
  }

  if (
    msg.includes("Fetch failed") ||
    msg.includes("timeout") ||
    msg.includes("ETIMEDOUT") ||
    msg.includes("NETWORK_ERROR") ||
    msg.includes("socket")
  ) {
    return { code: "NETWORK_ERROR", message: msg };
  }

  return { code: "UNKNOWN", message: msg };
}

export function classifyGeminiError(err: any): {
  code: string;
  message: string;
} {
  const classified = classifyProviderError(err);
  if (classified.code === "RATE_LIMITED" || classified.code === "INSUFFICIENT_CREDIT") {
    return { code: "QUOTA_EXHAUSTED", message: classified.message };
  }
  if (classified.code === "NETWORK_ERROR") {
    return { code: "NETWORK_OR_TIMEOUT", message: classified.message };
  }
  return { code: classified.code, message: classified.message };
}
