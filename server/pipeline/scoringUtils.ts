export function calculatePublishingReliability(input: {
  peerReviewed?: boolean;
  venueOrPreprint?: string;
}): number {
  if (input.peerReviewed) return 5;
  const v = (input.venueOrPreprint || "").toLowerCase();
  if (v.includes("cvpr") || v.includes("neurips") || v.includes("iclr") || v.includes("icml") || v.includes("emnlp") || v.includes("acl")) {
    return 5;
  }
  if (v.includes("arxiv") || v.includes("biorxiv") || v.includes("preprint")) {
    return 3;
  }
  return 3;
}

export function calculateRecencyScore(
  pubYear?: string | number,
  currentYear: string | number = 2026
): number {
  const pYear = typeof pubYear === "string" ? parseInt(pubYear, 10) : pubYear || 2026;
  const cYear = typeof currentYear === "string" ? parseInt(currentYear, 10) : currentYear || 2026;

  const diff = cYear - pYear;
  if (diff <= 0) return 5;
  if (diff === 1) return 4;
  if (diff === 2) return 3;
  if (diff === 3) return 2;
  return 1;
}
