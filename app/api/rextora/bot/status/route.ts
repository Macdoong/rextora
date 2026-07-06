import { apiErrorResponse, apiJsonResponse } from "@/src/lib/rextora/apiResponse";
import { getBotRuntimeStatus } from "@/src/lib/rextora/botRuntime";
import { getTopCandidates } from "@/src/lib/rextora/aiRanker";
import { getApiStatus } from "@/src/lib/rextora/apiStatusService";
import { getMarketWatcherSummary } from "@/src/lib/rextora/marketWatcherService";
import { getRiskEngineStatus } from "@/src/lib/rextora/riskEngine";
import { getOpenPositions } from "@/src/lib/rextora/positionManager";
import { todayPnlSeed } from "@/src/lib/rextora/seedData";

export async function GET() {
  const start = Date.now();

  try {
    const { bot, runtime } = getBotRuntimeStatus();
    return apiJsonResponse(
      {
        bot: { ...bot, lastHeartbeat: runtime.lastHeartbeat, running: runtime.running, state: runtime.state },
        runtime,
        todayPnl: todayPnlSeed,
        topCandidates: getTopCandidates(5),
        positions: getOpenPositions(),
        marketSummary: getMarketWatcherSummary(),
        risk: getRiskEngineStatus(),
        api: getApiStatus()
      },
      {
        source: "bot-runtime",
        cached: true,
        durationMs: Date.now() - start,
        updatedAt: runtime.lastHeartbeat
      }
    );
  } catch (error) {
    return apiErrorResponse(error instanceof Error ? error.message : "bot status failed", Date.now() - start);
  }
}
