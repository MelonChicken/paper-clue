import express from "express";

import { generateMarkdownReport } from "./pipeline/markdownReportGenerator.js";
import { globalUsageStore } from "./observability/usageStore.js";
import { analyzeBriefing } from "./api/analyzeBriefing.js";


const app = express();

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


export default app;