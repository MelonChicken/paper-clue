import { PipelineContext, computeBriefingHash } from "./context";
import { PaperCandidate, AiRecommendation } from "../../src/types";

export class PipelineIntegrityError extends Error {
  public code = "PIPELINE_INTEGRITY_ERROR";
  public analysisRunId: string;
  public briefingHash: string;
  public failedChecks: string[];
  public foreignPaperIds: string[];
  public usedCacheKeys: string[];

  constructor(details: {
    analysisRunId: string;
    briefingHash: string;
    failedChecks: string[];
    foreignPaperIds: string[];
    usedCacheKeys: string[];
  }) {
    super(`Pipeline Integrity Check Failed: ${details.failedChecks.join("; ")}`);
    this.name = "PipelineIntegrityError";
    this.analysisRunId = details.analysisRunId;
    this.briefingHash = details.briefingHash;
    this.failedChecks = details.failedChecks;
    this.foreignPaperIds = details.foreignPaperIds;
    this.usedCacheKeys = details.usedCacheKeys;
  }
}

export function verifyPipelineIntegrity(
  context: PipelineContext,
  briefingMarkdown: string,
  parsedPaperIds: string[],
  evaluatedCandidates: PaperCandidate[],
  aiRecommendation: AiRecommendation,
  usedCacheKeys: string[] = []
): void {
  const failedChecks: string[] = [];
  const foreignPaperIds: string[] = [];

  // Check 1: Briefing Hash Consistency
  const currentHash = computeBriefingHash(briefingMarkdown);
  if (currentHash !== context.briefingHash) {
    failedChecks.push(
      `Briefing Hash Mismatch: Expected ${context.briefingHash}, calculated ${currentHash}`
    );
  }

  // Check 2: Parsed Paper Count vs Evaluated Candidate Count
  if (parsedPaperIds.length !== evaluatedCandidates.length) {
    failedChecks.push(
      `Paper Count Mismatch: Parsed ${parsedPaperIds.length} papers, but evaluated ${evaluatedCandidates.length} candidates`
    );
  }

  // Check 3: Validate candidate IDs against parsed IDs
  const parsedSet = new Set(parsedPaperIds);
  const candidateIds = evaluatedCandidates.map((c) => c.id);

  for (const cand of evaluatedCandidates) {
    if (!parsedSet.has(cand.id)) {
      foreignPaperIds.push(cand.id);
      failedChecks.push(
        `Foreign Paper Injection Detected: Evaluated candidate "${cand.title}" (ID: ${cand.id}) was not in parsed paper IDs`
      );
    }
  }

  // Check 4: Validate Recommendation Targets
  const candidateIdSet = new Set(candidateIds);
  if (
    aiRecommendation.topRecommendedPaperId &&
    !candidateIdSet.has(aiRecommendation.topRecommendedPaperId)
  ) {
    failedChecks.push(
      `Recommendation Target Mismatch: Top recommended paper ID "${aiRecommendation.topRecommendedPaperId}" does not exist among evaluated candidates`
    );
  }

  if (
    aiRecommendation.overallAcademicLeaderPaperId &&
    !candidateIdSet.has(aiRecommendation.overallAcademicLeaderPaperId)
  ) {
    failedChecks.push(
      `Academic Leader Target Mismatch: Paper ID "${aiRecommendation.overallAcademicLeaderPaperId}" does not exist among evaluated candidates`
    );
  }

  if (
    aiRecommendation.weeklyTopicLeaderPaperId &&
    !candidateIdSet.has(aiRecommendation.weeklyTopicLeaderPaperId)
  ) {
    failedChecks.push(
      `Topic Leader Target Mismatch: Paper ID "${aiRecommendation.weeklyTopicLeaderPaperId}" does not exist among evaluated candidates`
    );
  }

  // Check 5: Anti-Fixture Pollution Safeguard
  // Check if Video-LLaVA-2 or other fixtures are injected when NOT present in input text
  const lowerInput = briefingMarkdown.toLowerCase();
  for (const cand of evaluatedCandidates) {
    if (
      cand.title.toLowerCase().includes("video-llava-2") &&
      !lowerInput.includes("video-llava-2")
    ) {
      failedChecks.push(
        `Fixture Leakage Detected: "Video-LLaVA-2" candidate present in output but not in input briefing`
      );
    }
  }

  // Check 6: Status-Score Invariant Enforcement
  for (const cand of evaluatedCandidates) {
    for (const [dimKey, dim] of Object.entries(cand.scores || {})) {
      if (dim.status !== "SCORED" && dim.score !== null) {
        failedChecks.push(
          `Status-Score Invariant Violation in "${cand.title}" (${dimKey}): status is ${dim.status} but score is ${dim.score}`
        );
      }
    }
  }

  // Check 7: Unverified Metadata Evidence & Score Integrity
  for (const cand of evaluatedCandidates) {
    if (cand.crossVerificationStatus === "NOT_FOUND") {
      for (const [dimKey, dim] of Object.entries(cand.scores || {})) {
        if (dim.score !== null) {
          failedChecks.push(
            `Unverified Paper Score Violation in "${cand.title}" (${dimKey}): crossVerificationStatus is NOT_FOUND but score is ${dim.score}`
          );
        }
        if (dim.evidence?.paperText && dim.evidence.paperText.length > 0) {
          failedChecks.push(
            `Unverified Paper Evidence Violation in "${cand.title}" (${dimKey}): crossVerificationStatus is NOT_FOUND but paperText evidence exists`
          );
        }
      }
    }
  }

  if (failedChecks.length > 0) {
    context.integrityStatus = "FAILED";
    throw new PipelineIntegrityError({
      analysisRunId: context.analysisRunId,
      briefingHash: context.briefingHash,
      failedChecks,
      foreignPaperIds,
      usedCacheKeys,
    });
  }

  context.integrityStatus = "PASSED";
}
