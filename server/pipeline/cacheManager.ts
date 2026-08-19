import fs from "fs";
import path from "path";
import crypto from "crypto";
import { PROMPT_VERSIONS, SCHEMA_VERSION, ROUTE_VERSION } from "../config/versions.js";
import { PipelineContext } from "./context.js";

export type CacheNamespace =
  | "briefing-parse"
  | "paper-metadata"
  | "paper-resources"
  | "paper-document"
  | "paper-comparison"
  | "paper-evaluation"
  | "recommendation"
  | "markdown-report";

export interface CacheEnvelope<T> {
  namespace: CacheNamespace;
  cacheKey: string;
  provider: "OPENAI" | "GEMINI";
  stage: string;
  briefingHash?: string;
  paperId?: string;
  analysisMode: string;
  promptVersion: string;
  schemaVersion: string;
  routeVersion: string;
  modelVersion: string;
  createdAt: string;
  expiresAt?: number | null;
  resultOrigin: "LIVE_PIPELINE" | "PARTIAL_PIPELINE" | "FALLBACK";
  verificationLevel: "HIGH" | "MEDIUM" | "LOW";
  fallbackUsed: boolean;
  fallbackReason?: string;
  integrityStatus: "PASSED" | "FAILED" | "NOT_RUN";
  cacheEligibility: "REUSABLE" | "SHORT_LIVED" | "DO_NOT_CACHE";
  payload: T;
}

export interface CacheOptions {
  provider?: "OPENAI" | "GEMINI";
  stage?: string;
  ttlMs?: number;
  briefingHash?: string;
  paperId?: string;
  promptVersion?: string;
  schemaVersion?: string;
  routeVersion?: string;
  modelVersion?: string;
  resultOrigin?: "LIVE_PIPELINE" | "PARTIAL_PIPELINE" | "FALLBACK";
  verificationLevel?: "HIGH" | "MEDIUM" | "LOW";
  fallbackUsed?: boolean;
  fallbackReason?: string;
  integrityStatus?: "PASSED" | "FAILED" | "NOT_RUN";
  cacheEligibility?: "REUSABLE" | "SHORT_LIVED" | "DO_NOT_CACHE";
}

export interface ProvenanceExpectation {
  provider?: "OPENAI" | "GEMINI";
  stage?: string;
  briefingHash?: string;
  analysisMode?: string;
  promptVersion?: string;
  schemaVersion?: string;
  routeVersion?: string;
  modelVersion?: string;
}

const CACHE_DIR =
    process.env.VERCEL
        ? path.join("/tmp", "paper-quest-cache")
        : path.join(process.cwd(), ".cache_store");

class FileAndMemoryPipelineCache {
  private memoryMap = new Map<string, CacheEnvelope<any>>();

  constructor() {
    this.ensureCacheDir();
  }

  private ensureCacheDir() {
    try {
      if (!fs.existsSync(CACHE_DIR)) {
        fs.mkdirSync(CACHE_DIR, { recursive: true });
      }
    } catch (e) {
      console.warn("[Cache Warning] Could not create disk cache directory:", e);
    }
  }

  private getFilePath(namespace: CacheNamespace, key: string): string {
    const safeNamespace = namespace.replace(/[^a-z0-9_-]/gi, "_");
    const safeKey = key.replace(/[^a-z0-9_-]/gi, "_");
    return path.join(CACHE_DIR, `${safeNamespace}__${safeKey}.json`);
  }

  async get<T>(
    namespace: CacheNamespace,
    key: string,
    context?: PipelineContext,
    expectedProvenance?: ProvenanceExpectation
  ): Promise<T | null> {
    if (context?.forceRefresh) {
      return null;
    }

    const memoryKey = `${namespace}:${key}`;
    const now = Date.now();

    let envelope: CacheEnvelope<T> | null = null;

    if (this.memoryMap.has(memoryKey)) {
      const memEnv = this.memoryMap.get(memoryKey)!;
      if (memEnv.expiresAt && memEnv.expiresAt < now) {
        this.memoryMap.delete(memoryKey);
      } else {
        envelope = memEnv as CacheEnvelope<T>;
      }
    }

    if (!envelope) {
      const filePath = this.getFilePath(namespace, key);
      try {
        if (fs.existsSync(filePath)) {
          const raw = fs.readFileSync(filePath, "utf-8");
          const diskEnv: CacheEnvelope<T> = JSON.parse(raw);
          if (diskEnv.expiresAt && diskEnv.expiresAt < now) {
            fs.unlinkSync(filePath);
            return null;
          }
          envelope = diskEnv;
          this.memoryMap.set(memoryKey, envelope);
        }
      } catch (err) {
        console.warn(`[Cache Warning] Failed to read cached file ${filePath}:`, err);
        return null;
      }
    }

    if (!envelope) {
      return null;
    }

    if (
      envelope.cacheEligibility === "DO_NOT_CACHE" ||
      envelope.fallbackUsed ||
      envelope.integrityStatus === "FAILED"
    ) {
      return null;
    }

    // Provenance Verification
    const targetProvider = expectedProvenance?.provider;
    if (targetProvider && envelope.provider && envelope.provider !== targetProvider) {
      return null;
    }

    const targetBriefingHash = expectedProvenance?.briefingHash ?? context?.briefingHash;
    if (targetBriefingHash && envelope.briefingHash && envelope.briefingHash !== targetBriefingHash) {
      return null;
    }

    const targetMode = expectedProvenance?.analysisMode ?? context?.analysisMode;
    if (targetMode && envelope.analysisMode && envelope.analysisMode !== targetMode) {
      return null;
    }

    const targetPromptVer = expectedProvenance?.promptVersion;
    if (targetPromptVer && envelope.promptVersion && envelope.promptVersion !== targetPromptVer) {
      return null;
    }

    const targetSchemaVer = expectedProvenance?.schemaVersion ?? SCHEMA_VERSION;
    if (targetSchemaVer && envelope.schemaVersion && envelope.schemaVersion !== targetSchemaVer) {
      return null;
    }

    const targetRouteVer = expectedProvenance?.routeVersion ?? ROUTE_VERSION;
    if (targetRouteVer && envelope.routeVersion && envelope.routeVersion !== targetRouteVer) {
      return null;
    }

    const targetModelVer = expectedProvenance?.modelVersion;
    if (targetModelVer && envelope.modelVersion && envelope.modelVersion !== targetModelVer) {
      return null;
    }

    if (context) {
      context.cacheHits.set(namespace, true);
    }

    return envelope.payload;
  }

  async set<T>(
    namespace: CacheNamespace,
    key: string,
    payload: T,
    options: CacheOptions,
    context?: PipelineContext
  ): Promise<void> {
    const memoryKey = `${namespace}:${key}`;
    const now = Date.now();
    const ttlMs = options.ttlMs;
    const expiresAt = ttlMs ? now + ttlMs : null;

    const fallbackUsed = options.fallbackUsed ?? Boolean(context?.fallbackUsed);
    const integrityStatus = options.integrityStatus ?? context?.integrityStatus ?? "PASSED";
    const cacheEligibility =
      options.cacheEligibility ??
      (fallbackUsed || integrityStatus === "FAILED" ? "DO_NOT_CACHE" : context?.cacheEligibility ?? "REUSABLE");

    if (cacheEligibility === "DO_NOT_CACHE" || fallbackUsed || integrityStatus === "FAILED") {
      return;
    }

    const envelope: CacheEnvelope<T> = {
      namespace,
      cacheKey: key,
      provider: options.provider || "OPENAI",
      stage: options.stage || namespace,
      briefingHash: options.briefingHash ?? context?.briefingHash,
      paperId: options.paperId,
      analysisMode: context?.analysisMode || "STANDARD",
      promptVersion: options.promptVersion || "v3.0",
      schemaVersion: options.schemaVersion || SCHEMA_VERSION,
      routeVersion: options.routeVersion || ROUTE_VERSION,
      modelVersion: options.modelVersion || "gpt-4.1-mini",
      createdAt: new Date().toISOString(),
      expiresAt,
      resultOrigin: options.resultOrigin ?? context?.resultOrigin ?? "LIVE_PIPELINE",
      verificationLevel: options.verificationLevel ?? context?.verificationLevel ?? "HIGH",
      fallbackUsed,
      fallbackReason: options.fallbackReason ?? context?.fallbackReason,
      integrityStatus,
      cacheEligibility,
      payload,
    };

    this.memoryMap.set(memoryKey, envelope);

    const filePath = this.getFilePath(namespace, key);
    try {
      this.ensureCacheDir();
      fs.writeFileSync(filePath, JSON.stringify(envelope, null, 2), "utf-8");
    } catch (err) {
      console.warn(`[Cache Warning] Failed to write cache file ${filePath}:`, err);
    }
  }

  async invalidate(namespace: CacheNamespace, key: string): Promise<void> {
    const memoryKey = `${namespace}:${key}`;
    this.memoryMap.delete(memoryKey);

    const filePath = this.getFilePath(namespace, key);
    try {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    } catch (err) {
      console.warn(`[Cache Warning] Failed to delete cache file ${filePath}:`, err);
    }
  }

  async clearAll(): Promise<void> {
    this.memoryMap.clear();
    try {
      if (fs.existsSync(CACHE_DIR)) {
        const files = fs.readdirSync(CACHE_DIR);
        for (const file of files) {
          fs.unlinkSync(path.join(CACHE_DIR, file));
        }
      }
    } catch (err) {
      console.warn("[Cache Warning] Failed to clear disk cache:", err);
    }
  }
}

export const persistentCache = new FileAndMemoryPipelineCache();

export function generateBriefingParseCacheKey(
  provider: string,
  briefingHash: string,
  analysisMode: string,
  promptVersion: string,
  schemaVersion: string,
  routeVersion: string,
  modelVersion: string
): string {
  const rawKey = `${provider}:${briefingHash}:${analysisMode}:${promptVersion}:${schemaVersion}:${routeVersion}:${modelVersion}`;
  return crypto.createHash("sha256").update(rawKey).digest("hex");
}

export function generatePaperCacheKey(
  paper: {
    doi?: string | null;
    arxivId?: string | null;
    biorxivId?: string | null;
    title?: string;
    rawTitle?: string;
  },
  provider = "OPENAI",
  modelVersion = "gpt-4.1-mini",
  schemaVersion = SCHEMA_VERSION
): string {
  let identifier = "";
  if (paper.doi && paper.doi.trim()) {
    identifier = `doi_${paper.doi.trim().toLowerCase().replace(/[^a-z0-9]/g, "_")}`;
  } else if (paper.arxivId && paper.arxivId.trim()) {
    identifier = `arxiv_${paper.arxivId.trim().toLowerCase().replace(/[^a-z0-9]/g, "_")}`;
  } else if (paper.biorxivId && paper.biorxivId.trim()) {
    identifier = `biorxiv_${paper.biorxivId.trim().toLowerCase().replace(/[^a-z0-9]/g, "_")}`;
  } else {
    const title = (paper.title || paper.rawTitle || "").toLowerCase().replace(/[^a-z0-9]/g, "");
    const hash = crypto.createHash("md5").update(title).digest("hex").substring(0, 16);
    identifier = `title_${hash}`;
  }
  const rawKey = `${provider}:${modelVersion}:${schemaVersion}:${identifier}`;
  return crypto.createHash("sha256").update(rawKey).digest("hex").substring(0, 32);
}

export function generateRecommendationCacheKey(
  provider: string,
  briefingHash: string,
  evaluatedPaperIds: string[],
  evalResultHash: string,
  promptVersion: string,
  schemaVersion: string,
  analysisMode: string,
  modelVersion: string
): string {
  const sortedIds = [...evaluatedPaperIds].sort().join(",");
  const rawKey = `${provider}:${briefingHash}:${sortedIds}:${evalResultHash}:${promptVersion}:${schemaVersion}:${analysisMode}:${modelVersion}`;
  return crypto.createHash("sha256").update(rawKey).digest("hex");
}

export const CACHE_TTL = {
  BRIEFING_PARSE: 7 * 24 * 60 * 60 * 1000,
  METADATA: 14 * 24 * 60 * 60 * 1000,
  RESOURCES: 3 * 24 * 60 * 60 * 1000,
  DOCUMENT_ANALYSIS: 30 * 24 * 60 * 60 * 1000,
  COMPARISON: 7 * 24 * 60 * 60 * 1000,
  EVALUATION: 7 * 24 * 60 * 60 * 1000,
  RECOMMENDATION: 7 * 24 * 60 * 60 * 1000,
};

export async function clearCache(): Promise<void> {
  await persistentCache.clearAll();
}
