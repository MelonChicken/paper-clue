import { z } from "zod";
import { VerifiedMetadataResult, VerifiedResourcesResult } from "./types";
import { getRouteConfig } from "../config/routingConfig";
import { logPipelineCall } from "../observability/pipelineLogger";
import { PaperSearchContext } from "./metadataVerifier";
import { PipelineContext } from "./context";
import { PROMPT_VERSIONS, SCHEMA_VERSION, ROUTE_VERSION } from "../config/versions";
import { persistentCache, generatePaperCacheKey, CACHE_TTL } from "./cacheManager";
import { AIProvider } from "./providerInterface";

export const resourceVerifierSchema = z.object({
  codeStatus: z.enum([
    "AVAILABLE_VERIFIED",
    "FOUND_UNVERIFIED",
    "SEARCH_FAILED",
    "NOT_FOUND_AFTER_RETRIES",
    "PARTIALLY_AVAILABLE",
    "NOT_APPLICABLE",
  ]),
  codeUrl: z.string().nullable(),
  dataStatus: z.enum([
    "AVAILABLE_VERIFIED",
    "AVAILABLE_WITH_RESTRICTIONS",
    "FOUND_UNVERIFIED",
    "SEARCH_FAILED",
    "NOT_FOUND_AFTER_RETRIES",
    "PARTIALLY_AVAILABLE",
    "NOT_APPLICABLE",
  ]),
  dataUrl: z.string().nullable(),
  checkpointStatus: z.enum(["AVAILABLE_VERIFIED", "FOUND_UNVERIFIED", "NOT_FOUND", "NOT_APPLICABLE"]),
  documentationStatus: z.enum(["HIGH", "MEDIUM", "LOW", "NOT_VERIFIED"]),
  executionVerification: z.enum(["PASSED", "FAILED", "NOT_PERFORMED"]),
  reproducibilityLevel: z.enum([
    "REPRODUCIBLE",
    "PARTIALLY_REPRODUCIBLE",
    "CODE_ONLY",
    "PAPER_ONLY",
    "NOT_VERIFIED",
  ]),
  evidence: z.array(
    z.object({
      evidenceType: z.string(),
      sourceTitle: z.string(),
      sourceUrl: z.string().nullable(),
      sourceLocation: z.string().nullable(),
      claim: z.string(),
      verificationStatus: z.string(),
    })
  ),
});

export async function verifyPaperResources(
  provider: AIProvider,
  metadata: VerifiedMetadataResult,
  context: PipelineContext,
  searchContextMap?: Map<string, PaperSearchContext>,
  mentionedCodeUrl?: string | null,
  mentionedDataUrl?: string | null
): Promise<VerifiedResourcesResult> {
  const route = getRouteConfig("RESOURCE_VERIFIER");
  const currentModel = route.defaultModel;
  const promptVersion = PROMPT_VERSIONS.RESOURCE_VERIFIER;

  const cacheKey = generatePaperCacheKey(
    {
      doi: metadata.doi,
      arxivId: metadata.arxivId,
      biorxivId: metadata.biorxivId,
      title: metadata.normalizedTitle,
    },
    provider.name,
    currentModel,
    SCHEMA_VERSION
  );

  // Check cache in paper-resources namespace with provenance
  const cached = await persistentCache.get<VerifiedResourcesResult>(
    "paper-resources",
    cacheKey,
    context,
    {
      provider: provider.name,
      stage: "RESOURCE_VERIFIER",
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

    await logPipelineCall({
      analysisRunId: context.analysisRunId,
      paperId: metadata.paperId,
      stage: "RESOURCE_VERIFIER",
      provider: provider.name,
      model: currentModel,
      attempt: 1,
      cacheHit: true,
      startedAtIso: new Date().toISOString(),
      completedAtIso: new Date().toISOString(),
      success: true,
      groundingEnabled: true,
    });

    return cached;
  }

  if (metadata.crossVerificationStatus === "NOT_FOUND") {
    return {
      paperId: metadata.paperId,
      codeStatus: "NOT_FOUND_AFTER_RETRIES",
      codeUrl: null,
      dataStatus: "NOT_FOUND_AFTER_RETRIES",
      dataUrl: null,
      checkpointStatus: "NOT_FOUND",
      documentationStatus: "NOT_VERIFIED",
      executionVerification: "NOT_PERFORMED",
      reproducibilityLevel: "PAPER_ONLY",
      reproducibilityAssessment: {
        codeStatus: "NOT_FOUND_AFTER_RETRIES",
        dataStatus: "NOT_FOUND_AFTER_RETRIES",
        checkpointStatus: "NOT_FOUND",
        documentationStatus: "NOT_VERIFIED",
        executionVerification: "NOT_PERFORMED",
        level: "PAPER_ONLY",
        score: 1,
        reason: "논문 신원이 확인되지 않아 자원 검증 대상에서 제외했습니다.",
      },
      evidence: [],
    };
  }

  const existingCtx = searchContextMap?.get(metadata.paperId);
  const knownUrls = [
    ...(existingCtx?.officialPaperUrls || []),
    ...(existingCtx?.discoveredRepositoryUrls || []),
    mentionedCodeUrl,
  ].filter(Boolean);

  const primaryAuthor = metadata.authors[0] || "";
  const identifierTerm = metadata.arxivId ? `arXiv:${metadata.arxivId}` : metadata.doi ? `DOI:${metadata.doi}` : metadata.normalizedTitle;

  const systemInstruction = `
You are a specialized code, dataset, checkpoint, and reproducibility verifier.
Your goal is to verify the availability and authenticity of code repositories (GitHub/GitLab), datasets (HuggingFace/DANDI/Kaggle), model checkpoints, and documentation for the paper.

SEARCH STRATEGY FOR RESOURCE DISCOVERY:
Execute targeted Google Web Searches using these query variations if links are not already provided:
1. "${metadata.normalizedTitle}" GitHub
2. "${primaryAuthor}" "${metadata.normalizedTitle}" code repository
3. "${identifierTerm}" GitHub

REUSE KNOWN URLS IF VALID:
Known discovered links: ${knownUrls.join(", ") || "None"}

CRITICAL SEMANTIC RULES FOR STATUS VALUES:
- 'NOT_APPLICABLE': Use ONLY for purely theoretical/math proof/survey papers where software code or experimental datasets are inherently NOT part of the research concept.
- For empirical AI/ML, computer vision, robotics, or algorithm papers, if no code or dataset is found, mark 'NOT_FOUND_AFTER_RETRIES' or 'SEARCH_FAILED', NEVER 'NOT_APPLICABLE'.

CRITICAL REPRODUCIBILITY LEVEL RULE:
- Set 'REPRODUCIBLE' ONLY IF executionVerification is 'PASSED' (actual code environment run verified).
- If code and data are available but execution has NOT been actually performed ('NOT_PERFORMED'), mark 'PARTIALLY_REPRODUCIBLE' or 'CODE_ONLY'.
- If data is missing or unverified, mark 'CODE_ONLY' or 'PAPER_ONLY'.

MANDATORY SCHEMA RULES:
- Output ALL schema fields. Never omit any field or return undefined.
- Single string/number fields that are unknown or missing MUST be null (e.g. codeUrl: null, dataUrl: null).
- Array fields with no items MUST be empty arrays [].
- Do NOT invent or hallucinate values.
`.trim();

  const userPrompt = `
Verify resources for:
Title: "${metadata.normalizedTitle}"
Authors: ${metadata.authors.join(", ")}
URL: ${metadata.url || "N/A"}
Mentioned Code URL: ${mentionedCodeUrl || "N/A"}
Mentioned Data URL: ${mentionedDataUrl || "N/A"}
`.trim();

  const startIso = new Date().toISOString();

  try {
    const result = await provider.generateStructured<z.infer<typeof resourceVerifierSchema>>({
      stage: "RESOURCE_VERIFIER",
      model: currentModel,
      systemInstruction,
      userPrompt,
      schema: resourceVerifierSchema,
      schemaName: "resourceVerifier",
      webSearch: true,
      temperature: route.temperature,
      maxTokens: route.maxOutputTokens,
      context,
    });

    const endIso = new Date().toISOString();
    const parsed = result.data;

    let codeStatus = parsed.codeStatus || (mentionedCodeUrl ? "FOUND_UNVERIFIED" : "NOT_FOUND_AFTER_RETRIES");
    let dataStatus = parsed.dataStatus || (mentionedDataUrl ? "FOUND_UNVERIFIED" : "NOT_FOUND_AFTER_RETRIES");
    let codeUrl = parsed.codeUrl || mentionedCodeUrl || null;
    let dataUrl = parsed.dataUrl || mentionedDataUrl || null;

    // Convert incorrect NOT_APPLICABLE to NOT_FOUND_AFTER_RETRIES for empirical papers
    const isEmpiricalPaper = /pose|forecasting|motion|model|dataset|network|learning|agent|transformer|classification|detection|segmentation|benchmark|framework|tracking/i.test(metadata.normalizedTitle);
    if (isEmpiricalPaper) {
      if (codeStatus === "NOT_APPLICABLE") codeStatus = "NOT_FOUND_AFTER_RETRIES";
      if (dataStatus === "NOT_APPLICABLE") dataStatus = "NOT_FOUND_AFTER_RETRIES";
    }

    if (mentionedCodeUrl && ["NOT_FOUND", "NOT_FOUND_AFTER_RETRIES", "SEARCH_FAILED"].includes(codeStatus)) {
      codeStatus = "FOUND_UNVERIFIED";
      codeUrl = mentionedCodeUrl;
    }
    if (mentionedDataUrl && ["NOT_FOUND", "NOT_FOUND_AFTER_RETRIES", "SEARCH_FAILED"].includes(dataStatus)) {
      dataStatus = "AVAILABLE_VERIFIED";
      dataUrl = mentionedDataUrl;
    }

    const benchmarkHint = /benchmark|dataset|imagenet|coco|kinetics|ucf|hmdb|robosuite|robotwin|mnist|cifar/i.test(
      `${metadata.normalizedTitle} ${(parsed.evidence || []).map((e: any) => e.claim).join(" ")}`
    );
    if (benchmarkHint && dataStatus === "NOT_APPLICABLE") {
      dataStatus = "FOUND_UNVERIFIED";
    }

    if (codeStatus === "AVAILABLE_VERIFIED") codeStatus = "CODE_AVAILABLE_VERIFIED" as any;
    else if (codeStatus === "FOUND_UNVERIFIED") codeStatus = "REPOSITORY_FOUND" as any;

    if (dataStatus === "AVAILABLE_VERIFIED") dataStatus = "PUBLIC_DATASET_VERIFIED" as any;
    else if (dataStatus === "FOUND_UNVERIFIED" && benchmarkHint) dataStatus = "PUBLIC_BENCHMARK_USED" as any;
    else if (dataStatus === "FOUND_UNVERIFIED") dataStatus = "DATASET_LINK_NOT_VERIFIED" as any;

    let reproducibilityLevel = parsed.reproducibilityLevel || "NOT_VERIFIED";
    const isDataMissing = ["NOT_FOUND", "NOT_FOUND_AFTER_RETRIES", "SEARCH_FAILED", "PRIVATE_OR_UNAVAILABLE"].includes(dataStatus);
    const isCodeAvailable = ["CODE_AVAILABLE_VERIFIED", "REPOSITORY_FOUND", "AVAILABLE_VERIFIED", "FOUND_UNVERIFIED", "PARTIALLY_AVAILABLE"].includes(codeStatus);
    const executionVerification = parsed.executionVerification || "NOT_PERFORMED";

    if (executionVerification !== "PASSED" && reproducibilityLevel === "REPRODUCIBLE") {
      reproducibilityLevel = isCodeAvailable && !isDataMissing ? "PARTIALLY_REPRODUCIBLE" : (isCodeAvailable ? "CODE_ONLY" : "PAPER_ONLY");
    } else if (isDataMissing && reproducibilityLevel === "REPRODUCIBLE") {
      reproducibilityLevel = isCodeAvailable ? "CODE_ONLY" : "PAPER_ONLY";
    }

    const checkpointStatus = parsed.checkpointStatus || (isCodeAvailable && !isDataMissing ? "AVAILABLE_VERIFIED" : "NOT_FOUND");
    const documentationStatus = parsed.documentationStatus || (isCodeAvailable ? "MEDIUM" : "LOW");

    const score = isCodeAvailable && !isDataMissing ? 4 : isCodeAvailable ? 3 : 1;
    const reason = isCodeAvailable
      ? '코드 저장소는 확인되었으나 실행 검증, 학습 설정, 데이터 준비 절차는 별도 확인이 필요합니다.'
      : '공식 코드 저장소, checkpoint, 실행 환경을 확인하지 못했습니다.';

    await logPipelineCall({
      analysisRunId: context.analysisRunId,
      paperId: metadata.paperId,
      stage: "RESOURCE_VERIFIER",
      provider: provider.name,
      model: currentModel,
      responseId: result.responseId,
      attempt: 1,
      startedAtIso: startIso,
      completedAtIso: endIso,
      success: true,
      providerUsage: result.usage,
      groundingEnabled: true,
    });

    const verifiedResources: VerifiedResourcesResult = {
      paperId: metadata.paperId,
      codeStatus,
      codeUrl,
      dataStatus,
      dataUrl,
      checkpointStatus,
      documentationStatus,
      executionVerification,
      reproducibilityLevel,
      reproducibilityAssessment: {
        codeStatus,
        dataStatus,
        checkpointStatus,
        documentationStatus,
        executionVerification,
        level: reproducibilityLevel,
        score,
        reason,
      },
      evidence: (parsed.evidence || []).map((e) => ({
        evidenceType: (["PAPER", "EXTERNAL", "AI_INTERPRETATION"].includes(e.evidenceType) ? e.evidenceType : "EXTERNAL") as any,
        sourceTitle: e.sourceTitle || "외부 출처",
        sourceUrl: e.sourceUrl || null,
        sourceLocation: e.sourceLocation || "GitHub / Dataset Archive",
        claim: e.claim || "코드 또는 데이터 출처 확인",
        verificationStatus: (["DIRECTLY_VERIFIED", "PARTIALLY_VERIFIED", "NOT_VERIFIED"].includes(e.verificationStatus) ? e.verificationStatus : "DIRECTLY_VERIFIED") as any,
      })),
    };

    context.usedCacheKeys.add(cacheKey);

    await persistentCache.set<VerifiedResourcesResult>(
      "paper-resources",
      cacheKey,
      verifiedResources,
      {
        provider: provider.name,
        stage: "RESOURCE_VERIFIER",
        ttlMs: CACHE_TTL.RESOURCES,
        briefingHash: context.briefingHash,
        paperId: metadata.paperId,
        promptVersion,
        schemaVersion: SCHEMA_VERSION,
        routeVersion: ROUTE_VERSION,
        modelVersion: currentModel,
      },
      context
    );

    return verifiedResources;
  } catch (err: any) {
    context.resultOrigin = "PARTIAL_PIPELINE";
    const endIso = new Date().toISOString();

    await logPipelineCall({
      analysisRunId: context.analysisRunId,
      paperId: metadata.paperId,
      stage: "RESOURCE_VERIFIER",
      provider: provider.name,
      model: currentModel,
      attempt: 1,
      startedAtIso: startIso,
      completedAtIso: endIso,
      success: false,
      errorCode: err?.code || "STAGE_FAILED",
      errorMessage: err?.message,
      groundingEnabled: true,
    });

    const codeStatus = mentionedCodeUrl ? "FOUND_UNVERIFIED" : "NOT_FOUND_AFTER_RETRIES";
    const dataStatus = mentionedDataUrl ? "FOUND_UNVERIFIED" : "NOT_FOUND_AFTER_RETRIES";
    const level = mentionedCodeUrl ? "CODE_ONLY" : "PAPER_ONLY";

    return {
      paperId: metadata.paperId,
      codeStatus,
      codeUrl: mentionedCodeUrl || null,
      dataStatus,
      dataUrl: mentionedDataUrl || null,
      checkpointStatus: "NOT_FOUND",
      documentationStatus: "LOW",
      executionVerification: "NOT_PERFORMED",
      reproducibilityLevel: level,
      reproducibilityAssessment: {
        codeStatus,
        dataStatus,
        checkpointStatus: "NOT_FOUND",
        documentationStatus: "LOW",
        executionVerification: "NOT_PERFORMED",
        level,
        score: 2,
        reason: `자원 검증 실패로 기본 상태를 설정했습니다: ${err?.message || '검색 제한'}`,
      },
      evidence: [],
    };
  }
}





