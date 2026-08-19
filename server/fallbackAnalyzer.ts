import { BriefingAnalysisResponse, PaperCandidate, AiRecommendation } from "../src/types.js";

const BANNED_TITLE_PATTERNS = [
  "?듭떖 臾몄젣",
  "limitation",
  "?쎄린 ?곗꽑?쒖쐞",
  "二쇱슂 ?깃낵",
  "?꾨줈?앺듃 ?쒕ぉ",
  "?곗씠?곗뀑",
  "?꾧뎄",
  "?곌뎄 諛곌꼍",
  "?붿빟",
  "寃곕줎",
  "key problem",
  "limitation",
  "priority",
  "background",
];

export function generateFallbackAnalysis(
  briefingMarkdown: string,
  fallbackReason = "Gemini API ?뚯씠?꾨씪??遺꾩꽍 ?ㅽ뙣濡?Deterministic Fallback Mode媛 ?ㅽ뻾?섏뿀?듬땲??"
): BriefingAnalysisResponse {
  const lines = briefingMarkdown.split("\n").map((l) => l.trim());

  // 1. Extract Briefing Title
  let briefingTitle = "二쇨컙 ?곌뎄 釉뚮━??遺꾩꽍 由ы룷??(Fallback)";
  const titleLine = lines.find((l) => l.startsWith("# "));
  if (titleLine) {
    briefingTitle = titleLine.replace(/^#\s*/, "").replace(/^\[/, "").replace(/\]$/, "").trim();
  }

  // 2. Extract Core Topic
  let coreTopic = "?곌뎄 ?숉뼢 遺꾩꽍";
  if (briefingTitle.includes("-")) {
    coreTopic = briefingTitle.split("-").slice(1).join("-").trim();
  }

  // 3. Deterministic Extraction based on Academic URLs and Structural Markers
  const parsedPapers: {
    title: string;
    academicUrl?: string;
    arxivId?: string;
    biorxivId?: string;
    doi?: string;
    codeUrl?: string;
    dataUrl?: string;
    authors?: string[];
    venue?: string;
    snippet?: string;
  }[] = [];

  // Break input markdown into blocks by headings or empty lines
  const blocks: string[][] = [];
  let currentBlock: string[] = [];

  for (const line of lines) {
    if (line.startsWith("#") || line.startsWith("---")) {
      if (currentBlock.length > 0) {
        blocks.push(currentBlock);
        currentBlock = [];
      }
    }
    if (line) currentBlock.push(line);
  }
  if (currentBlock.length > 0) blocks.push(currentBlock);

  const seenTitles = new Set<string>();

  for (const block of blocks) {
    const blockText = block.join("\n");

    // Scan for academic URLs
    const arxivMatch = blockText.match(/https?:\/\/(www\.)?arxiv\.org\/(abs|pdf)\/(\d{4}\.\d{4,5})/i);
    const biorxivMatch = blockText.match(/https?:\/\/(www\.)?biorxiv\.org\/content\/(10\.\d{4,9}\/[-._;()/:A-Z0-9]+)/i);
    const doiMatch = blockText.match(/https?:\/\/(www\.)?doi\.org\/(10\.\d{4,9}\/[-._;()/:A-Z0-9]+)/i);
    const openreviewMatch = blockText.match(/https?:\/\/(www\.)?openreview\.net\/(forum|pdf)\?id=([a-zA-Z0-9_-]+)/i);
    const cvfMatch = blockText.match(/https?:\/\/openaccess\.thecvf\.com\/content[^\s)]+/i);

    const hasAcademicUrl = arxivMatch || biorxivMatch || doiMatch || openreviewMatch || cvfMatch;

    // Search block for heading title
    const headingLine = block.find((l) => l.startsWith("#") || l.startsWith("- **") || l.startsWith("1.") || l.startsWith("2.") || l.startsWith("3.") || l.startsWith("4.") || l.startsWith("5."));
    let extractedTitle = "";

    if (headingLine) {
      extractedTitle = headingLine
        .replace(/^#+\s*/, "")
        .replace(/^\[?쇰Ц\s*\d+\]\s*/i, "")
        .replace(/^\d+\.\s*/, "")
        .replace(/^[-*]\s*/, "")
        .replace(/\*\*/g, "")
        .split(":")[0]
        .trim();
    }

    // Filter out banned section headings
    const lowerTitle = extractedTitle.toLowerCase();
    const isBannedHeading = BANNED_TITLE_PATTERNS.some((b) => lowerTitle.includes(b));

    if (hasAcademicUrl || (!isBannedHeading && extractedTitle.length > 10 && (blockText.includes("http") || blockText.includes("author") || blockText.includes("arXiv")))) {
      if (isBannedHeading) continue;
      if (!extractedTitle) continue;

      const normTitle = extractedTitle.toLowerCase();
      if (seenTitles.has(normTitle)) continue;
      seenTitles.add(normTitle);

      let arxivId: string | undefined = arxivMatch ? arxivMatch[3] : undefined;
      if (!arxivId) {
        const axDirect = blockText.match(/arXiv:\s*(\d{4}\.\d{4,5})/i);
        if (axDirect) arxivId = axDirect[1];
      }

      let biorxivId: string | undefined = biorxivMatch ? biorxivMatch[2] : undefined;
      let doi: string | undefined = doiMatch ? doiMatch[2] : undefined;

      const codeMatch = blockText.match(/https?:\/\/github\.com\/[^\s)\]]+/i);
      const codeUrl = codeMatch ? codeMatch[0] : undefined;

      let academicUrl = arxivMatch
        ? arxivMatch[0]
        : biorxivMatch
        ? biorxivMatch[0]
        : doiMatch
        ? doiMatch[0]
        : openreviewMatch
        ? openreviewMatch[0]
        : cvfMatch
        ? cvfMatch[0]
        : codeUrl;

      // Extract authors if available
      let authors = ["Unknown authors"];
      const authorLine = block.find((l) => l.includes("author") || l.includes("Authors"));
      if (authorLine) {
        const rawA = authorLine.replace(/^[-*]\s*/, "").replace(/\*\*/g, "").replace(/^(author|authors)\s*:\s*/i, "").trim();
        if (rawA) authors = rawA.split(",").map((a) => a.trim());
      }

      parsedPapers.push({
        title: extractedTitle,
        academicUrl,
        arxivId,
        biorxivId,
        doi,
        codeUrl,
        authors,
        venue: arxivId ? "arXiv Preprint" : biorxivId ? "bioRxiv Preprint" : "Preprint / Academic Source",
        snippet: blockText.substring(0, 200),
      });

      if (parsedPapers.length >= 5) break;
    }
  }

  // Fallback if no URL blocks matched
  if (parsedPapers.length === 0) {
    const candidateLines = lines.filter((l) => l.startsWith("#") || l.startsWith("###"));
    for (const line of candidateLines) {
      const clean = line.replace(/^#+\s*/, "").replace(/\[.*?\]/g, "").trim();
      const lower = clean.toLowerCase();
      if (clean.length > 8 && !BANNED_TITLE_PATTERNS.some((b) => lower.includes(b))) {
        parsedPapers.push({
          title: clean,
          venue: "Briefing",
          authors: ["Unknown authors"],
          snippet: clean,
        });
        if (parsedPapers.length >= 5) break;
      }
    }
  }

  // Minimal fallback if input was empty
  if (parsedPapers.length === 0) {
    parsedPapers.push({
      title: "?쒖떆???곌뎄 釉뚮━??????쇰Ц",
      venue: "Briefing",
      authors: ["Unknown authors"],
      snippet: briefingMarkdown.substring(0, 150) || "?먮Ц 遺꾩꽍 ????곌뎄",
    });
  }

  // Enforce max 5 candidates
  const finalExtracted = parsedPapers.slice(0, 5);

  // 4. Datasets & Tools Extraction
  const datasets: { name: string; description: string; link?: string }[] = [];
  const tools: { name: string; description: string; link?: string }[] = [];

  for (const line of lines) {
    if (line.includes("github.com/") && !line.includes("arxiv") && !line.includes("biorxiv")) {
      const match = line.match(/https?:\/\/github\.com\/([^\s)\]]+)/i);
      if (match) {
        const repoName = match[1].split("/").slice(0, 2).join("/");
        if (!tools.some((t) => t.name === repoName)) {
          tools.push({
            name: repoName,
            description: line.replace(/^[-*]\s*/, "").trim(),
            link: match[0],
          });
        }
      }
    }
  }

  // 5. Build Candidates with NULL scores (Requirement 6)
  const candidates: PaperCandidate[] = finalExtracted.map((p, idx) => {
    return {
      id: `paper-${idx + 1}`,
      title: p.title,
      authors: p.authors || ["Unknown authors"],
      year: "2025",
      venueOrPreprint: p.venue || "?숈닠吏/Preprint",
      doi: p.doi || null,
      arxivId: p.arxivId || null,
      biorxivId: p.biorxivId || null,
      url: p.academicUrl || (p.arxivId ? `https://arxiv.org/abs/${p.arxivId}` : null),
      publicationStatus: "Preprint / Unknown",
      versionInfo: {
        publicationStatus: "Preprint / Unknown",
        isLatestVersion: true,
      },
      // Identity resolution pipeline fields
      rawMention: p.title,
      entityType: "PAPER",
      canonicalTitle: p.title,
      canonicalUrl: p.academicUrl || (p.arxivId ? `https://arxiv.org/abs/${p.arxivId}` : null),
      identityStatus: p.arxivId || p.doi ? "IDENTITY_VERIFIED" : "POSSIBLE_MATCH",
      matchConfidence: p.arxivId || p.doi ? 0.95 : 0.7,
      matchReason: "Fallback 遺꾩꽍 ?대━?ㅽ떛 異붿텧",

      // Evaluation coverage metrics (all scores null in fallback)
      scoredDimensions: 0,
      totalDimensions: 6,
      evaluationCoverage: 0,
      recommendationStatus: "NOT_ELIGIBLE",

      crossVerificationStatus: "NOT_FOUND",
      codeStatus: p.codeUrl ? "FOUND_UNVERIFIED" : "NOT_FOUND",
      codeUrl: p.codeUrl || null,
      codeAvailable: !!p.codeUrl,
      dataStatus: "NOT_FOUND",
      dataUrl: null,
      dataAvailable: false,
      reproducibilityStatus: "NOT_VERIFIED",
      reproducibilityAssessment: {
        codeStatus: p.codeUrl ? "FOUND_UNVERIFIED" : "NOT_FOUND",
        dataStatus: "NOT_FOUND",
        checkpointStatus: "NOT_FOUND",
        documentationStatus: "NOT_VERIFIED",
        executionVerification: "NOT_PERFORMED",
        level: "NOT_VERIFIED",
        score: null, // STRICT NULL
        reason: "Fallback mode: execution was not verified.",
      },
      verificationScope: {
        metadata: "NOT_CHECKED",
        publication: "NOT_CHECKED",
        code: p.codeUrl ? "SINGLE_SOURCE" : "NOT_FOUND",
        data: "NOT_FOUND",
        performance: "NOT_CHECKED",
        reproducibility: "NOT_CHECKED",
      },
      overallBadgeStatus: "PARTIAL_INFO_UNVERIFIED",
      // REQUIREMENT 6: ALL SCORES MUST BE NULL
      scores: {
        performance: {
          score: null,
          status: "INSUFFICIENT_EVIDENCE",
          reason: "Gemini 遺꾩꽍 ?ㅽ뙣濡??몃? 洹쇨굅瑜?寃利앺븯吏 紐삵뻽?듬땲??",
          evidence: { paperText: [], externalSource: [], aiInterpretation: [] },
        },
        novelty: {
          score: null,
          status: "INSUFFICIENT_EVIDENCE",
          reason: "Gemini 遺꾩꽍 ?ㅽ뙣濡??몃? 洹쇨굅瑜?寃利앺븯吏 紐삵뻽?듬땲??",
          evidence: { paperText: [], externalSource: [], aiInterpretation: [] },
        },
        trendImportance: {
          score: null,
          status: "INSUFFICIENT_EVIDENCE",
          reason: "Gemini 遺꾩꽍 ?ㅽ뙣濡??몃? 洹쇨굅瑜?寃利앺븯吏 紐삵뻽?듬땲??",
          evidence: { paperText: [], externalSource: [], aiInterpretation: [] },
        },
        academicSignificance: {
          score: null,
          status: "INSUFFICIENT_EVIDENCE",
          reason: "Gemini 遺꾩꽍 ?ㅽ뙣濡??몃? 洹쇨굅瑜?寃利앺븯吏 紐삵뻽?듬땲??",
          evidence: { paperText: [], externalSource: [], aiInterpretation: [] },
        },
        practicalValue: {
          score: null,
          status: "INSUFFICIENT_EVIDENCE",
          reason: "Gemini 遺꾩꽍 ?ㅽ뙣濡??몃? 洹쇨굅瑜?寃利앺븯吏 紐삵뻽?듬땲??",
          evidence: { paperText: [], externalSource: [], aiInterpretation: [] },
        },
        reproducibility: {
          score: null,
          status: "INSUFFICIENT_EVIDENCE",
          reason: "Gemini 遺꾩꽍 ?ㅽ뙣濡??몃? 洹쇨굅瑜?寃利앺븯吏 紐삵뻽?듬땲??",
          evidence: { paperText: [], externalSource: [], aiInterpretation: [] },
        },
      },
      publishingReliabilityScore: null,
      publishingReliabilityDetails: {
        peerReviewed: false,
        isPreprint: true,
        scoreReason: "Fallback mode: cross verification was not performed.",
      },
      recencyScore: null,
      recencyNotes: "Fallback 紐⑤뱶: ?먮Ц ?뚯떛 ?뺣낫",
      comparisonModule: {
        directComparisonStudies: [],
        nearTaskComparisonStudies: [],
        contextualRelatedStudies: [],
        representativePriorStudies: [],
        sotaStatus: "SOTA 寃利?誘몄닔??(Fallback Mode)",
        summary: "Fallback mode: comparison module was not generated.",
      },
      uncertainty: {
        factVerificationItems: ["Fallback ?뚯떛 ?ㅽ뻾: Gemini API 吏곸젒 援먯감寃利??ъ떎???꾩슂"],
        insufficientEvidenceItems: ["Full-text or database cross verification was not performed."],
        researchOpenQuestions: ["怨듭떇 SOTA 踰ㅼ튂留덊겕 諛??ы쁽??寃利??꾩슂"],
      },
      verificationBadges: {
        metadataVerified: false,
        publicationVerified: false,
        codeVerified: !!p.codeUrl,
        dataVerified: false,
        performanceEvidenceVerified: false,
        reproducibilityVerified: false,
      },
      verificationNeededItems: ["Fallback ?뚯떛 ?ㅽ뻾: Gemini API 吏곸젒 援먯감寃利??ъ떎???꾩슂"],
    };
  });

  // REQUIREMENT 3: NO AI RECOMMENDATION IN FALLBACK
  const aiRecommendation: AiRecommendation = {
    topRecommendedPaperId: null, // STRICT NULL
    recommendationReason: "?몃? 寃利앹씠 ?꾨즺?섏? ?딆븘 AI 異붿쿇???앹꽦?섏? ?딆븯?듬땲??",
    keyRecommendationEvidence: [],
    consideredUncertainties: [fallbackReason],
    sotaStatus: "Not evaluated",
    hasDirectComparisonStudies: false,
    keyItemsToVerifyWhileReading: ["Gemini 援먯감寃利??꾨즺 ??由ы룷??李몄“ 沅뚯옣"],
    positionInRecentTrend: "?먮Ц 釉뚮━???뚯떛 ??ぉ",
    keyStrengths: [],
    keyLimitationsOrRisks: ["Gemini API 援먯감寃利?誘몄닔??(Fallback)"],
    readingQuestions: [],
    followUpResearchQuestions: [],
  };

  return {
    briefingTitle,
    extraction: {
      extractedPaperCount: candidates.length,
      datasetCount: datasets.length,
      githubToolCount: tools.length,
      datasets,
      githubTools: tools,
      researchTrends: [coreTopic],
      excludedItems: [],
      uncertaintySummary: {
        factVerificationCount: candidates.length,
        insufficientEvidenceCount: candidates.length,
        researchOpenQuestionCount: candidates.length,
      },
      verificationNeededCount: candidates.length,
    },
    candidates,
    aiRecommendation,
    analysisMode: "STANDARD",
    fallbackUsed: true,
    fallbackReason,
    missingStages: [
      "METADATA_VERIFIER",
      "RESOURCE_VERIFIER",
      "DOCUMENT_ANALYZER",
      "COMPARISON_FINDER",
      "PAPER_EVALUATOR",
      "RECOMMENDATION_ENGINE",
    ],
    cacheEligibility: "DO_NOT_CACHE",
    resultOrigin: "FALLBACK",
  } as any;
}
