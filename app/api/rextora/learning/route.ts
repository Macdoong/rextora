import { apiErrorResponse, apiJsonResponse } from "@/src/lib/rextora/apiResponse";
import { getOperatorLearningLogs, getCoinWinRates, getSignalWinRates, getLearningLogsSummary } from "@/src/lib/rextora/learningLogger";

export async function GET(request: Request) {
  const start = Date.now();
  const { searchParams } = new URL(request.url);
  const limit = Math.min(200, Math.max(1, Number(searchParams.get("limit") ?? 50)));
  const offset = Math.max(0, Number(searchParams.get("offset") ?? 0));

  try {
    const allLogs = getOperatorLearningLogs();
    const logs = allLogs.slice(offset, offset + limit);
    return apiJsonResponse(
      {
        logs,
        summary: getLearningLogsSummary(),
        coinWinRates: getCoinWinRates(),
        signalWinRates: getSignalWinRates(),
        pagination: { limit, offset, total: allLogs.length, hasMore: offset + limit < allLogs.length }
      },
      {
        source: "learning-log",
        cached: true,
        durationMs: Date.now() - start,
        updatedAt: logs[0]?.time ?? null
      }
    );
  } catch (error) {
    return apiErrorResponse(error instanceof Error ? error.message : "learning fetch failed", Date.now() - start);
  }
}
