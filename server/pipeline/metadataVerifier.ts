import { z } from "zod";
import { ExtractedPaperDraft, VerifiedMetadataResult } from "./types.js";
import { getRouteConfig } from "../config/routingConfig.js";
import { logPipelineCall } from "../observability/pipelineLogger.js";
import { PipelineContext } from "./context.js";
import { PROMPT_VERSIONS, SCHEMA_VERSION, ROUTE_VERSION } from "../config/versions.js";
import { persistentCache, generatePaperCacheKey, CACHE_TTL } from "./cacheManager.js";
import { AIProvider } from "./providerInterface.js";
import { resolveCandidateIdentity, validateCanonicalIdentity, calculateFuzzyScore, normalizeTitle } from "./candidateResolver.js";
import { EntityType, IdentityStatus, SourceType, VerificationLevel } from "../../src/types.js";
import { normalizePublicationStatus } from "../../src/utils/paperSemantics.js";

export interface PaperSearchContext {
  paperId: string;
  officialPaperUrls: string[];
  verifiedIdentifiers: string[];
  discoveredProjectUrls: string[];
  discoveredRepositoryUrls: string[];
  discoveredDatasetUrls: string[];
  searchQueriesExecuted: string[];
}

export const metadataVerifierSchema = z.object({
  entityType: z.enum([
    "PAPER",
    "METHOD",
    "MODEL",
    "PROJECT",
    "REPOSITORY",
    "DATASET",
    "BENCHMARK",
    "TOOL",
    "UNKNOWN",
  ]),
  identityStatus: z.enum([
    "IDENTITY_VERIFIED",
    "POSSIBLE_MATCH",
    "RESOLVED_FROM_METHOD_OR_PROJECT",
    "IDENTITY_NOT_FOUND",
  "METADATA_CONFLICT",
    ]),
  canonicalTitle: z.string(),
  normalizedTitle: z.string(),
  matchConfidence: z.number(),
  matchReason: z.string(),
  authors: z.array(z.string()),
  year: z.string(),
  venueOrPreprint: z.string(),
  doi: z.string().nullable(),
  arxivId: z.string().nullable(),
  biorxivId: z.string().nullable(),
  url: z.string().nullable(),
  canonicalUrl: z.string().nullable(),
  publicationStatus: z.string(),
  peerReviewed: z.boolean(),
  isPreprint: z.boolean(),
  crossVerificationStatus: z.enum(["VERIFIED", "SINGLE_SOURCE", "CONFLICTING", "NOT_FOUND"]),
  versionInfo: z.object({
    publicationStatus: z.string(),
    version: z.string().nullable(),
    firstPublishedAt: z.string().nullable(),
    lastUpdatedAt: z.string().nullable(),
    isLatestVersion: z.boolean().nullable(),
  }),
  publishingReliabilityDetails: z.object({
    conferenceName: z.string().nullable(),
    journalName: z.string().nullable(),
    peerReviewed: z.boolean(),
    isPreprint: z.boolean(),
    scoreReason: z.string(),
    officialSourceUrl: z.string().nullable(),
  }),
  evidence: z.array(
    z.object({
      claimText: z.string(),
      sourceType: z.enum(["PAPER", "EXTERNAL_SOURCE", "AI_INTERPRETATION"]),
      sourceReference: z.string().nullable(),
      evidenceLocation: z.string().nullable(),
      verificationLevel: z.enum([
        "PAPER_REPORTED_VERIFIED",
        "EXTERNALLY_CORROBORATED",
        "INDEPENDENTLY_REPRODUCED",
        "NEEDS_VERIFICATION",
        "INSUFFICIENT_EVIDENCE",
      ]),
    })
  ),
});

export async function verifyPaperMetadata(
  provider: AIProvider,
  paper: ExtractedPaperDraft,
  context: PipelineContext,
  searchContextMap?: Map<string, PaperSearchContext>
): Promise<VerifiedMetadataResult> {
  const route = getRouteConfig("METADATA_VERIFIER");
  const currentModel = route.defaultModel;
  const promptVersion = PROMPT_VERSIONS.METADATA_VERIFIER;

  // Run deterministic candidate resolution first
  const deterministicResolution = resolveCandidateIdentity({
    rawMention: paper.rawTitle,
    authors: paper.authors,
    year: paper.year,
    venue: paper.venue,
    snippet: paper.snippet,
    arxivId: paper.snippet?.match(/arXiv:\s*(\d{4}\.\d{4,5})/i)?.[1] || null,
    doi: paper.snippet?.match(/10\.\d{4,9}\/[-._;()/:A-Z0-9]+/i)?.[0] || null,
    url: paper.mentionedCodeUrl || null,
  });

  const cacheKey = generatePaperCacheKey(
    {
      rawTitle: paper.rawTitle,
      title: deterministicResolution.canonicalTitle || paper.rawTitle,
      arxivId: deterministicResolution.arxivId || undefined,
      doi: deterministicResolution.doi || undefined,
    },
    provider.name,
    currentModel,
    SCHEMA_VERSION
  );

  // Check cache in paper-metadata namespace with provenance
  const cached = await persistentCache.get<VerifiedMetadataResult>(
    "paper-metadata",
    cacheKey,
    context,
    {
      provider: provider.name,
      stage: "METADATA_VERIFIER",
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
    const cachedIntegrity = validateCanonicalIdentity({
      rawMention: paper.rawTitle,
      canonicalTitle: cached.canonicalTitle || cached.normalizedTitle,
      authors: cached.authors,
      arxivId: cached.arxivId,
      doi: cached.doi,
    });

    if (!cachedIntegrity.isValid && cachedIntegrity.conflict) {
      const titleOnlyResolution = resolveCandidateIdentity({
        rawMention: paper.rawTitle,
        authors: cached.authors && cached.authors.length > 0 ? cached.authors : paper.authors,
        year: cached.year || paper.year,
        venue: cached.venueOrPreprint || paper.venue,
        snippet: paper.snippet
          ?.replace(/arXiv:\s*\d{4}\.\d{4,5}/gi, "")
          .replace(/10\.\d{4,9}\/[\-._;()/:A-Z0-9]+/gi, ""),
        arxivId: null,
        doi: null,
        url: paper.mentionedCodeUrl || null,
      });

      return {
        ...cached,
        entityType: titleOnlyResolution.entityType,
        canonicalTitle: titleOnlyResolution.canonicalTitle,
        normalizedTitle: titleOnlyResolution.canonicalTitle,
        authors: titleOnlyResolution.authors,
        year: titleOnlyResolution.year || cached.year,
        venueOrPreprint: titleOnlyResolution.venueOrPreprint || cached.venueOrPreprint,
        doi: titleOnlyResolution.doi,
        arxivId: titleOnlyResolution.arxivId,
        canonicalUrl: titleOnlyResolution.canonicalUrl,
        url: titleOnlyResolution.canonicalUrl,
        identityStatus: "METADATA_CONFLICT",
        metadataConflict: cachedIntegrity.conflict,
        isRankingEligible: false,
        matchConfidence: Math.min(titleOnlyResolution.matchConfidence, 0.86),
        matchReason: `${cachedIntegrity.conflict.resolutionReason}. Cached verified identity rejected before replay; re-resolution result: ${titleOnlyResolution.matchReason}`,
        crossVerificationStatus: "CONFLICTING",
      };
    }

    if (searchContextMap) {
      searchContextMap.set(paper.id, {
        paperId: paper.id,
        officialPaperUrls: cached.canonicalUrl ? [cached.canonicalUrl] : cached.url ? [cached.url] : [],
        verifiedIdentifiers: [
          cached.doi ? `doi:${cached.doi}` : null,
          cached.arxivId ? `arxiv:${cached.arxivId}` : null,
          cached.biorxivId ? `biorxiv:${cached.biorxivId}` : null,
        ].filter(Boolean) as string[],
        discoveredProjectUrls: [],
        discoveredRepositoryUrls: paper.mentionedCodeUrl ? [paper.mentionedCodeUrl] : [],
        discoveredDatasetUrls: paper.mentionedDataUrl ? [paper.mentionedDataUrl] : [],
        searchQueriesExecuted: [`"${paper.rawTitle}"`],
      });
    }

    await logPipelineCall({
      analysisRunId: context.analysisRunId,
      paperId: paper.id,
      stage: "METADATA_VERIFIER",
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

  const systemInstruction = `
You are an expert academic metadata and entity resolution engine.
Search academic resources (Google Search, arXiv, bioRxiv, OpenReview, official proceedings, GitHub, semantic scholar) to verify metadata, resolve entities, and extract grounded evidence.

RESOLUTION PIPELINE ORDER (DO NOT mark NOT_FOUND just because exact title search failed!):
A. arXiv ID / DOI / URL exact match
B. exact title
C. normalized title
D. fuzzy title (if there's a minor typo or abbreviated title, match against the true canonical paper and set identityStatus='POSSIBLE_MATCH')
E. model/method/project name search:
   - If the candidate is a METHOD name (e.g., LoRA, FlashAttention, QLoRA, DPO), MODEL name (e.g., SAM, CLIP, BERT), or PROJECT/FRAMEWORK name (e.g., DSPy, vLLM), resolve it to its seminal introducing canonical paper!
   - In this case: entityType = 'METHOD' or 'MODEL' or 'PROJECT', identityStatus = 'RESOLVED_FROM_METHOD_OR_PROJECT'.
F. entity classification (PAPER, METHOD, MODEL, PROJECT, REPOSITORY, DATASET, BENCHMARK, UNKNOWN).
G. canonical paper resolution.

CLAIM VERIFICATION & EVIDENCE SEMANTICS:
1. Paper existence verification is SEPARATE from paper claim verification.
2. If numbers or performance claims are directly written in the paper text / abstract / tables, assign verificationLevel='PAPER_REPORTED_VERIFIED' and sourceType='PAPER'.
   Do NOT mark paper-reported numbers as UNKNOWN or INSUFFICIENT just because external independent replication is not yet available.
3. If confirmed by independent external benchmark or survey, assign 'EXTERNALLY_CORROBORATED'.
4. If independently reproduced by third parties, assign 'INDEPENDENTLY_REPRODUCED'.
5. If unclear or unbacked, assign 'NEEDS_VERIFICATION' or 'INSUFFICIENT_EVIDENCE'.

MANDATORY RULES:
- Never substitute candidate with an unrelated paper.
- Output ALL schema fields cleanly.
`.trim();

  const userPrompt = `
Resolve and verify this candidate mention:
Raw Mention: "${paper.rawTitle}"
Initial Authors: ${paper.authors.join(", ")}
Initial Year: ${paper.year}
Initial Venue: ${paper.venue}
Snippet: ${paper.snippet}
Deterministic Knowledge Baseline:
- Entity Type: ${deterministicResolution.entityType}
- Identity Status: ${deterministicResolution.identityStatus}
- Canonical Title: "${deterministicResolution.canonicalTitle}"
- Match Reason: "${deterministicResolution.matchReason}"
`.trim();

  const startIso = new Date().toISOString();

  try {
    const result = await provider.generateStructured<z.infer<typeof metadataVerifierSchema>>({
      stage: "METADATA_VERIFIER",
      model: currentModel,
      systemInstruction,
      userPrompt,
      schema: metadataVerifierSchema,
      schemaName: "metadataVerifier",
      webSearch: true,
      temperature: route.temperature,
      maxTokens: route.maxOutputTokens,
      context,
    });

    const endIso = new Date().toISOString();
    const parsed = result.data;

    let finalEntityType: EntityType = parsed.entityType || deterministicResolution.entityType;
    let finalIdentityStatus: IdentityStatus = parsed.identityStatus || deterministicResolution.identityStatus;
    let finalCanonicalTitle: string = parsed.canonicalTitle || parsed.normalizedTitle || deterministicResolution.canonicalTitle || paper.rawTitle;
    let finalMatchConfidence: number = typeof parsed.matchConfidence === "number" ? parsed.matchConfidence : deterministicResolution.matchConfidence;
    let finalMatchReason: string = parsed.matchReason || deterministicResolution.matchReason;

    let finalArxivId = parsed.arxivId || deterministicResolution.arxivId || null;
    let finalDoi = parsed.doi || deterministicResolution.doi || null;
    let finalBiorxivId = parsed.biorxivId || null;
    let finalUrl = parsed.url || parsed.canonicalUrl || deterministicResolution.canonicalUrl || null;
    let finalAuthors = (parsed.authors && parsed.authors.length > 0) ? parsed.authors : deterministicResolution.authors;
    let finalYear = parsed.year || deterministicResolution.year || paper.year;
    let finalVenue = parsed.venueOrPreprint || deterministicResolution.venueOrPreprint || paper.venue;

    let finalCrossStatus: "VERIFIED" | "SINGLE_SOURCE" | "CONFLICTING" | "NOT_FOUND" =
      parsed.crossVerificationStatus || deterministicResolution.crossVerificationStatus || "SINGLE_SOURCE";

    const supportingEntityTypes: EntityType[] = ["REPOSITORY", "DATASET", "TOOL", "BENCHMARK", "UNKNOWN"];
    const isRankingEligibleEntity = (entityType: EntityType, identityStatus: IdentityStatus) =>
      entityType === "PAPER" && identityStatus === "IDENTITY_VERIFIED";

    // If deterministic knowledge confirmed canonical method or verified identity with high confidence, guarantee it
    if (
      deterministicResolution.identityStatus === "RESOLVED_FROM_METHOD_OR_PROJECT" ||
      deterministicResolution.identityStatus === "IDENTITY_VERIFIED"
    ) {
      finalEntityType = deterministicResolution.entityType;
      finalIdentityStatus = deterministicResolution.identityStatus;
      finalCanonicalTitle = deterministicResolution.canonicalTitle;
      finalAuthors = deterministicResolution.authors;
      finalYear = deterministicResolution.year || finalYear;
      finalVenue = deterministicResolution.venueOrPreprint || finalVenue;
      finalArxivId = deterministicResolution.arxivId || finalArxivId;
      finalDoi = deterministicResolution.doi || finalDoi;
      finalUrl = deterministicResolution.canonicalUrl || finalUrl;
      finalMatchConfidence = deterministicResolution.matchConfidence;
      finalMatchReason = deterministicResolution.matchReason;
      if (finalCrossStatus === "NOT_FOUND") {
        finalCrossStatus = "VERIFIED";
      }
    }

    if (deterministicResolution.identityStatus === "METADATA_CONFLICT") {
      finalIdentityStatus = "METADATA_CONFLICT";
      finalCrossStatus = "CONFLICTING";
      finalMatchConfidence = deterministicResolution.matchConfidence;
      finalMatchReason = deterministicResolution.matchReason;
      finalCanonicalTitle = deterministicResolution.canonicalTitle;
      finalAuthors = deterministicResolution.authors;
      finalYear = deterministicResolution.year || finalYear;
      finalVenue = deterministicResolution.venueOrPreprint || finalVenue;
      finalArxivId = deterministicResolution.arxivId;
      finalDoi = deterministicResolution.doi;
      finalUrl = deterministicResolution.canonicalUrl || finalUrl;
    }

    if (supportingEntityTypes.includes(finalEntityType)) {
      finalIdentityStatus = finalIdentityStatus === "IDENTITY_VERIFIED" ? "POSSIBLE_MATCH" : finalIdentityStatus;
      finalCrossStatus = finalCrossStatus === "VERIFIED" ? "SINGLE_SOURCE" : finalCrossStatus;
    }

    // Process evidence items to align with claim verification semantics
    const processedEvidence = (parsed.evidence || []).map((e: any) => {
      const srcType: SourceType = (e.sourceType || "PAPER") as SourceType;
      const verLevel: VerificationLevel = (e.verificationLevel || (srcType === "PAPER" ? "PAPER_REPORTED_VERIFIED" : "EXTERNALLY_CORROBORATED")) as VerificationLevel;
      const claimStr = e.claimText || "논문 서지 정보 확인";
      const srcTitle = e.sourceReference || (srcType === "PAPER" ? "논문 원문" : "공식 학술 출처");
      const srcLoc = e.evidenceLocation || (srcType === "PAPER" ? "Abstract / Section 1" : "공식 출처");

      return {
        evidenceType: (srcType === "PAPER" ? "PAPER" : srcType === "AI_INTERPRETATION" ? "AI_INTERPRETATION" : "EXTERNAL") as any,
        sourceType: srcType,
        sourceTitle: srcTitle,
        sourceReference: srcTitle,
        sourceUrl: finalUrl,
        sourceLocation: srcLoc,
        evidenceLocation: srcLoc,
        claim: claimStr,
        claimText: claimStr,
        verificationLevel: verLevel,
        verificationStatus: (verLevel === "NEEDS_VERIFICATION" || verLevel === "INSUFFICIENT_EVIDENCE" ? "NOT_VERIFIED" : "DIRECTLY_VERIFIED") as any,
      };
    });

    if (processedEvidence.length === 0 && finalIdentityStatus !== "IDENTITY_NOT_FOUND") {
      processedEvidence.push({
        evidenceType: "PAPER",
        sourceType: "PAPER",
        sourceTitle: finalCanonicalTitle,
        sourceReference: finalCanonicalTitle,
        sourceUrl: finalUrl,
        sourceLocation: "논문 서지 정보",
        evidenceLocation: "논문 서지 정보",
        claim: `공식 논문 서지 정보 확인: ${finalCanonicalTitle} (${finalAuthors.slice(0, 2).join(", ")} et al., ${finalYear})`,
        claimText: `공식 논문 서지 정보 확인: ${finalCanonicalTitle} (${finalAuthors.slice(0, 2).join(", ")} et al., ${finalYear})`,
        verificationLevel: "PAPER_REPORTED_VERIFIED",
        verificationStatus: "DIRECTLY_VERIFIED",
      });
    }

    const verifiedResult: VerifiedMetadataResult = {
      paperId: paper.id,
      rawMention: paper.rawTitle,
      entityType: finalEntityType,
      canonicalTitle: finalCanonicalTitle,
      normalizedTitle: finalCanonicalTitle,
      authors: finalAuthors,
      year: finalYear,
      venueOrPreprint: finalVenue,
      doi: finalDoi,
      arxivId: finalArxivId,
      biorxivId: finalBiorxivId,
      url: finalUrl,
      canonicalUrl: finalUrl,
      identityStatus: finalIdentityStatus,
      metadataConflict: deterministicResolution.metadataConflict,
      paperRole: finalEntityType === "PAPER" && /benchmark/i.test(finalCanonicalTitle) ? "BENCHMARK_PAPER" : "RESEARCH_PAPER",
      isRankingEligible: isRankingEligibleEntity(finalEntityType, finalIdentityStatus) && finalIdentityStatus !== "METADATA_CONFLICT",
      matchConfidence: finalMatchConfidence,
      matchReason: finalMatchReason,
      publicationStatus: parsed.publicationStatus || finalVenue,
      peerReviewed: parsed.peerReviewed ?? (Boolean(finalVenue && !finalVenue.toLowerCase().includes("arxiv") && !finalVenue.toLowerCase().includes("preprint"))),
      isPreprint: parsed.isPreprint ?? (Boolean(finalVenue && (finalVenue.toLowerCase().includes("arxiv") || finalVenue.toLowerCase().includes("preprint")))),
      versionInfo: {
        publicationStatus: normalizePublicationStatus({ publicationStatus: parsed.versionInfo?.publicationStatus || parsed.publicationStatus, venueOrPreprint: finalVenue, arxivId: finalArxivId, biorxivId: finalBiorxivId, peerReviewed: parsed.peerReviewed, isPreprint: parsed.isPreprint }),
        version: parsed.versionInfo?.version || "v1",
        firstPublishedAt: parsed.versionInfo?.firstPublishedAt || `${finalYear}-01-01`,
        lastUpdatedAt: parsed.versionInfo?.lastUpdatedAt || null,
        isLatestVersion: parsed.versionInfo?.isLatestVersion ?? true,
      },
      crossVerificationStatus: finalCrossStatus,
      publishingReliabilityDetails: {
        conferenceName: parsed.publishingReliabilityDetails?.conferenceName || (finalVenue.includes("CVPR") || finalVenue.includes("NeurIPS") || finalVenue.includes("ICLR") || finalVenue.includes("ICML") ? finalVenue : null),
        journalName: parsed.publishingReliabilityDetails?.journalName || null,
        peerReviewed: parsed.publishingReliabilityDetails?.peerReviewed ?? false,
        isPreprint: parsed.publishingReliabilityDetails?.isPreprint ?? true,
        scoreReason:
          parsed.publishingReliabilityDetails?.scoreReason ||
          `서지 정보 확인: ${finalVenue || "출처 미확정"} · ${finalIdentityStatus}`,
        officialSourceUrl: parsed.publishingReliabilityDetails?.officialSourceUrl || finalUrl,
      },
      evidence: processedEvidence,
      supportingResources: supportingEntityTypes.includes(finalEntityType) ? [{
        name: finalCanonicalTitle,
        entityType: finalEntityType,
        canonicalUrl: finalUrl,
        verificationStatus: finalCrossStatus,
        relatedPaper: null,
        whyRelevant: `${finalEntityType} entity extracted from briefing; kept as supporting resource, not a paper ranking candidate`, 
      }] : [],
    };

    if (searchContextMap) {
      searchContextMap.set(paper.id, {
        paperId: paper.id,
        officialPaperUrls: verifiedResult.canonicalUrl ? [verifiedResult.canonicalUrl] : verifiedResult.url ? [verifiedResult.url] : [],
        verifiedIdentifiers: [
          verifiedResult.doi ? `doi:${verifiedResult.doi}` : null,
          verifiedResult.arxivId ? `arxiv:${verifiedResult.arxivId}` : null,
          verifiedResult.biorxivId ? `biorxiv:${verifiedResult.biorxivId}` : null,
        ].filter(Boolean) as string[],
        discoveredProjectUrls: [],
        discoveredRepositoryUrls: paper.mentionedCodeUrl ? [paper.mentionedCodeUrl] : [],
        discoveredDatasetUrls: paper.mentionedDataUrl ? [paper.mentionedDataUrl] : [],
        searchQueriesExecuted: [`"${paper.rawTitle}"`, `"${verifiedResult.canonicalTitle}"`],
      });
    }

    await logPipelineCall({
      analysisRunId: context.analysisRunId,
      paperId: paper.id,
      stage: "METADATA_VERIFIER",
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

    context.usedCacheKeys.add(cacheKey);

    await persistentCache.set<VerifiedMetadataResult>(
      "paper-metadata",
      cacheKey,
      verifiedResult,
      {
        provider: provider.name,
        stage: "METADATA_VERIFIER",
        ttlMs: CACHE_TTL.METADATA,
        briefingHash: context.briefingHash,
        paperId: paper.id,
        promptVersion,
        schemaVersion: SCHEMA_VERSION,
        routeVersion: ROUTE_VERSION,
        modelVersion: currentModel,
      },
      context
    );

    return verifiedResult;
  } catch (err: any) {
    context.resultOrigin = "PARTIAL_PIPELINE";
    const endIso = new Date().toISOString();

    await logPipelineCall({
      analysisRunId: context.analysisRunId,
      paperId: paper.id,
      stage: "METADATA_VERIFIER",
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

    return {
      paperId: paper.id,
      rawMention: paper.rawTitle,
      entityType: deterministicResolution.entityType,
      canonicalTitle: deterministicResolution.canonicalTitle,
      normalizedTitle: deterministicResolution.canonicalTitle,
      authors: deterministicResolution.authors,
      year: deterministicResolution.year || paper.year,
      venueOrPreprint: deterministicResolution.venueOrPreprint || paper.venue,
      doi: deterministicResolution.doi,
      arxivId: deterministicResolution.arxivId,
      biorxivId: null,
      url: deterministicResolution.canonicalUrl || paper.mentionedCodeUrl || null,
      canonicalUrl: deterministicResolution.canonicalUrl || null,
      identityStatus: deterministicResolution.identityStatus,
      metadataConflict: deterministicResolution.metadataConflict,
      paperRole: deterministicResolution.entityType === "PAPER" && /benchmark/i.test(deterministicResolution.canonicalTitle) ? "BENCHMARK_PAPER" : "RESEARCH_PAPER",
      isRankingEligible: deterministicResolution.entityType === "PAPER" && deterministicResolution.identityStatus === "IDENTITY_VERIFIED",
      matchConfidence: deterministicResolution.matchConfidence,
      matchReason: deterministicResolution.matchReason,
      publicationStatus: normalizePublicationStatus({ venueOrPreprint: deterministicResolution.venueOrPreprint || paper.venue, arxivId: deterministicResolution.arxivId, biorxivId: null, peerReviewed: false, isPreprint: true }),
      peerReviewed: false,
      isPreprint: true,
      versionInfo: {
        publicationStatus: normalizePublicationStatus({ venueOrPreprint: paper.venue, arxivId: deterministicResolution.arxivId, peerReviewed: false, isPreprint: true }),
        version: "v1",
        firstPublishedAt: `${paper.year}-01-01`,
        lastUpdatedAt: null,
        isLatestVersion: true,
      },
      crossVerificationStatus: deterministicResolution.crossVerificationStatus,
      publishingReliabilityDetails: {
        conferenceName: null,
        journalName: null,
        peerReviewed: false,
        isPreprint: true,
        scoreReason: deterministicResolution.matchReason,
        officialSourceUrl: deterministicResolution.canonicalUrl || null,
      },
      evidence: [
        {
          evidenceType: "PAPER",
          sourceType: "PAPER",
          sourceTitle: deterministicResolution.canonicalTitle,
          sourceReference: deterministicResolution.canonicalTitle,
          sourceUrl: deterministicResolution.canonicalUrl,
          sourceLocation: "후보 서지 정보",
          evidenceLocation: "후보 서지 정보",
          claim: deterministicResolution.matchReason,
          claimText: deterministicResolution.matchReason,
          verificationLevel: "PAPER_REPORTED_VERIFIED",
          verificationStatus: "DIRECTLY_VERIFIED",
        },
      ],
    };
  }
}








