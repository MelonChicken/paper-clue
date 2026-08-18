import { z } from "zod";
import { BriefingParserResult } from "./types";
import { getRouteConfig } from "../config/routingConfig";
import { logPipelineCall } from "../observability/pipelineLogger";
import { PipelineContext } from "./context";
import {
  persistentCache,
  generateBriefingParseCacheKey,
  CACHE_TTL,
} from "./cacheManager";
import { PROMPT_VERSIONS, SCHEMA_VERSION, ROUTE_VERSION } from "../config/versions";
import { AIProvider } from "./providerInterface";

export const ClaimedMetricSchema = z.object({
  name: z.string(),
  value: z.string(),
  unit: z.string().nullable(),
  dataset: z.string().nullable(),
  sourceLocation: z.string().nullable(),
});

export const briefingParserSchema = z.object({
  briefingTitle: z.string(),
  referenceDate: z.string(),
  coreTopic: z.string(),
  topicKeywords: z.array(z.string()),
  papers: z.array(
    z.object({
      id: z.string(),
      rawTitle: z.string(),
      authors: z.array(z.string()),
      year: z.string(),
      venue: z.string(),
      snippet: z.string(),
      claimedMetrics: z.array(ClaimedMetricSchema),
      mentionedCodeUrl: z.string().nullable(),
      mentionedDataUrl: z.string().nullable(),
    })
  ),
  datasets: z.array(
    z.object({
      name: z.string(),
      description: z.string(),
      link: z.string().nullable(),
    })
  ),
  tools: z.array(
    z.object({
      name: z.string(),
      description: z.string(),
      link: z.string().nullable(),
    })
  ),
  unverifiedItems: z.array(z.string()),
});

export async function parseBriefing(
  provider: AIProvider,
  briefingMarkdown: string,
  context: PipelineContext,
  maxPapers = 5
): Promise<BriefingParserResult> {
  const route = getRouteConfig("BRIEFING_PARSER");
  let currentModel = route.defaultModel;
  let attempt = 1;
  let escalated = false;
  let escalationReason: string | undefined = undefined;

  const promptVersion = PROMPT_VERSIONS.BRIEFING_PARSER;

  const cacheKey = generateBriefingParseCacheKey(
    provider.name,
    context.briefingHash,
    context.analysisMode,
    promptVersion,
    SCHEMA_VERSION,
    ROUTE_VERSION,
    currentModel
  );

  // 1. Check cache with provenance verification
  const cached = await persistentCache.get<BriefingParserResult>(
    "briefing-parse",
    cacheKey,
    context,
    {
      provider: provider.name,
      stage: "BRIEFING_PARSER",
      briefingHash: context.briefingHash,
      analysisMode: context.analysisMode,
      promptVersion,
      schemaVersion: SCHEMA_VERSION,
      routeVersion: ROUTE_VERSION,
      modelVersion: currentModel,
    }
  );

  if (cached) {
    context.usedCacheKeys.add(cacheKey);
    context.parsedPaperIds = (cached.papers || []).map((p) => p.id);

    await logPipelineCall({
      analysisRunId: context.analysisRunId,
      stage: "BRIEFING_PARSER",
      provider: provider.name,
      model: currentModel,
      attempt: 1,
      cacheHit: true,
      startedAtIso: new Date().toISOString(),
      completedAtIso: new Date().toISOString(),
      success: true,
      groundingEnabled: false,
    });

    return cached;
  }

  const systemInstruction = `
You are a precision academic briefing parser.
Analyze the provided weekly research briefing markdown and extract structured information into JSON.

STRICT CONSTRAINTS:
1. Do NOT use external web search.
2. Extract up to ${maxPapers} candidate research papers mentioned in the briefing.
3. Extract datasets, GitHub tools, core topic, and unverified claims mentioned in the text.
4. Filter out section titles, general markdown headings (e.g. "핵심 문제", "한계점", "요약"), or non-paper text.
5. Set temperature low (0.1) and adhere strictly to the requested JSON schema.
6. MANDATORY SCHEMA RULES:
   - Output ALL schema fields. Never omit any field or return undefined.
   - Single string/number fields that are unknown or missing MUST be null (e.g. mentionedCodeUrl: null).
   - Array fields with no items MUST be empty arrays [] (e.g. claimedMetrics: [], datasets: [], tools: []).
   - If a paper has no metric mentioned, set "claimedMetrics": [].
   - Do NOT invent or hallucinate values.
`.trim();

  const userPrompt = `
Extract structured paper, dataset, tool, and topic information from this briefing:

---
${briefingMarkdown}
---
`.trim();

  const executeCall = async (modelToUse: string): Promise<BriefingParserResult> => {
    const startIso = new Date().toISOString();
    try {
      const result = await provider.generateStructured<BriefingParserResult>({
        stage: "BRIEFING_PARSER",
        model: modelToUse,
        systemInstruction,
        userPrompt,
        schema: briefingParserSchema,
        schemaName: "briefingParser",
        webSearch: false,
        temperature: route.temperature,
        maxTokens: route.maxOutputTokens,
        context,
      });

      const endIso = new Date().toISOString();
      const parsed = result.data;

      // Quality Gate
      if (!parsed.papers || !Array.isArray(parsed.papers)) {
        throw new Error("Quality Gate Failed: Invalid or missing papers array.");
      }

      const BANNED_TITLE_PATTERNS = [
        "핵심 문제",
        "한계점",
        "읽기 우선순위",
        "주요 성과",
        "프로젝트 제목",
        "데이터셋",
        "도구",
        "연구 배경",
        "요약",
        "결론",
        "key problem",
        "limitation",
        "priority",
        "background",
      ];

      // Filter out general section headings wrongly extracted as papers
      parsed.papers = parsed.papers.filter((p) => {
        if (!p.rawTitle || typeof p.rawTitle !== "string") return false;
        const lower = p.rawTitle.trim().toLowerCase();
        if (BANNED_TITLE_PATTERNS.some((b) => lower.includes(b))) return false;
        return p.rawTitle.trim().length > 3;
      });

      // Deduplicate paper titles
      const seenTitles = new Set<string>();
      parsed.papers = parsed.papers.filter((p) => {
        const norm = p.rawTitle.trim().toLowerCase();
        if (seenTitles.has(norm)) return false;
        seenTitles.add(norm);
        return true;
      });

      // Enforce maxPapers limit and normalize fields
      if (parsed.papers.length > maxPapers) {
        parsed.papers = parsed.papers.slice(0, maxPapers);
      }

      parsed.papers = parsed.papers.map((p) => ({
        ...p,
        claimedMetrics: p.claimedMetrics || [],
        mentionedCodeUrl: p.mentionedCodeUrl ?? null,
        mentionedDataUrl: p.mentionedDataUrl ?? null,
      }));

      parsed.datasets = (parsed.datasets || []).map((d) => ({
        ...d,
        link: d.link ?? null,
      }));

      parsed.tools = (parsed.tools || []).map((t) => ({
        ...t,
        link: t.link ?? null,
      }));

      if (parsed.papers.length === 0) {
        throw new Error("Quality Gate Failed: Zero valid paper candidates remained after quality filtering.");
      }

      await logPipelineCall({
        analysisRunId: context.analysisRunId,
        stage: "BRIEFING_PARSER",
        provider: provider.name,
        model: modelToUse,
        responseId: result.responseId,
        attempt,
        escalated,
        escalationReason,
        startedAtIso: startIso,
        completedAtIso: endIso,
        success: true,
        providerUsage: result.usage,
        groundingEnabled: false,
      });

      // Populate context
      context.parsedPaperIds = parsed.papers.map((p) => p.id);
      context.usedCacheKeys.add(cacheKey);

      // Save to cache
      await persistentCache.set<BriefingParserResult>(
        "briefing-parse",
        cacheKey,
        parsed,
        {
          provider: provider.name,
          stage: "BRIEFING_PARSER",
          ttlMs: CACHE_TTL.BRIEFING_PARSE,
          briefingHash: context.briefingHash,
          promptVersion,
          schemaVersion: SCHEMA_VERSION,
          routeVersion: ROUTE_VERSION,
          modelVersion: modelToUse,
        },
        context
      );

      return parsed;
    } catch (err: any) {
      const endIso = new Date().toISOString();
      await logPipelineCall({
        analysisRunId: context.analysisRunId,
        stage: "BRIEFING_PARSER",
        provider: provider.name,
        model: modelToUse,
        attempt,
        escalated,
        escalationReason,
        startedAtIso: startIso,
        completedAtIso: endIso,
        success: false,
        errorCode: err?.code || "STAGE_FAILED",
        errorMessage: err?.message,
        groundingEnabled: false,
      });

      throw err;
    }
  };

  try {
    return await executeCall(currentModel);
  } catch (firstErr) {
    if (route.escalationModel) {
      console.warn(`[BriefingParser] Escalating to ${route.escalationModel} due to:`, firstErr);
      currentModel = route.escalationModel;
      attempt = 2;
      escalated = true;
      escalationReason = `Escalated from ${route.defaultModel} after primary failure/schema mismatch`;
      return await executeCall(currentModel);
    }
    throw firstErr;
  }
}
