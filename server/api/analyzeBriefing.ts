import { runAnalysisPipeline } from "../pipeline/orchestrator";
import { generateFallbackAnalysis } from "../fallbackAnalyzer";
import { getAIProvider } from "../pipeline/getProvider";
import { AIProvider } from "../pipeline/providerInterface";

export async function analyzeBriefing(body: any) {
    try {
        const { briefingMarkdown, forceRefresh } = body ?? {};

        if (!briefingMarkdown || typeof briefingMarkdown !== "string") {
            return {
                status: 400,
                body: {
                    success: false,
                    error: "연구 브리핑 Markdown 텍스트가 필요합니다.",
                },
            };
        }

        let provider: AIProvider | null = null;

        try {
            provider = getAIProvider();
        } catch (err: any) {
            console.warn(
                "[Server Warning] AI Provider init failed:",
                err?.message
            );
        }

        if (!provider) {
            console.warn(
                "[Server Fallback] Running fallback analyzer due to missing AI Provider."
            );

            const fallbackData = generateFallbackAnalysis(briefingMarkdown);

            return {
                status: 200,
                body: {
                    success: true,
                    data: fallbackData,
                },
            };
        }

        const data = await runAnalysisPipeline(
            provider,
            briefingMarkdown,
            Boolean(forceRefresh)
        );

        return {
            status: 200,
            body: {
                success: true,
                data,
            },
        };
    } catch (err: any) {
        console.error("Error analyzing briefing:", err);

        return {
            status: 500,
            body: {
                success: false,
                error: "연구 브리핑 분석 중 오류가 발생했습니다.",
                details: err?.message || String(err),
            },
        };
    }
}