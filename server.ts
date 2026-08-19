import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import dotenv from "dotenv";
import { runAnalysisPipeline } from "./server/pipeline/orchestrator";
import { generateMarkdownReport } from "./server/pipeline/markdownReportGenerator";
import { generateFallbackAnalysis } from "./server/fallbackAnalyzer";
import { globalUsageStore } from "./server/observability/usageStore";
import { getAIProvider } from "./server/pipeline/getProvider";
import { AIProvider } from "./server/pipeline/providerInterface";
import { analyzeBriefing } from "./server/api/analyzeBriefing";

dotenv.config();

const app = express();
const PORT = 3000;

app.use(express.json({ limit: "10mb" }));

// POST /api/analyze-briefing
app.post("/api/analyze-briefing", async (req, res) => {
    const result = await analyzeBriefing(req.body);

    return res
        .status(result.status)
        .json(result.body);
});
// GET /api/usage-summary
app.get("/api/usage-summary", async (req, res) => {
  try {
    const summaries = await globalUsageStore.getAllRunSummaries(20);
    return res.json({ success: true, summaries });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err?.message });
  }
});

// GET /api/usage-summary/:runId
app.get("/api/usage-summary/:runId", async (req, res) => {
  try {
    const runId = req.params.runId;
    const summary = await globalUsageStore.getRunSummary(runId);
    if (!summary) {
      return res.status(404).json({ success: false, error: "Run summary not found" });
    }
    const callLogs = await globalUsageStore.getCallLogs(runId);
    return res.json({ success: true, summary, callLogs });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err?.message });
  }
});

// POST /api/generate-report
app.post("/api/generate-report", (req, res) => {
  try {
    const { data } = req.body;
    if (!data) {
      return res.status(400).json({ success: false, error: "Missing data payload" });
    }
    const markdown = generateMarkdownReport(data);
    return res.json({ success: true, markdown });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err?.message || "Report generation failed" });
  }
});

async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();


