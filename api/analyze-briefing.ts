import { analyzeBriefing } from "../server/api/analyzeBriefing";

export async function POST(request: Request) {
    try {
        const body = await request.json();

        const result = await analyzeBriefing(body);

        return Response.json(result.body, {
            status: result.status,
        });
    } catch (err: any) {
        console.error("[Vercel Function Error]", err);

        return Response.json(
            {
                success: false,
                error: "요청 처리 중 오류가 발생했습니다.",
                details: err?.message || String(err),
            },
            {
                status: 500,
            }
        );
    }
}