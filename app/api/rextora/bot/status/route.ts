import { apiErrorResponse, apiJsonResponse } from "@/src/lib/rextora/apiResponse";
import { getBotRuntimeStatus } from "@/src/lib/rextora/botRuntime";
import { getTopCandidates } from "@/src/lib/rextora/aiRanker";
import { getApiStatus } from "@/src/lib/rextora/apiStatusService";
import { getMarketWatcherSummary } from "@/src/lib/rextora/marketWatcherService";
import { getRiskEngineStatus } from "@/src/lib/rextora/riskEngine";
import { getOpenPositions } from "@/src/lib/rextora/positionManager";
import { getTodayPnlSummary, getUnifiedMetrics } from "@/src/lib/rextora/metrics/metricsEngine";
import { getUnifiedRiskView, sanitizePersistedRiskState } from "@/src/lib/rextora/metrics/riskService";

export async function GET() {
  const start = Date.now();

  try {
    sanitizePersistedRiskState();
    const { bot, runtime } = getBotRuntimeStatus();
    const metrics = getUnifiedMetrics();
    return apiJsonResponse(
      {
        bot: { ...bot, lastHeartbeat: runtime.lastHeartbeat, running: runtime.running, state: runtime.state },
        runtime,
        todayPnl: {
          ...getTodayPnlSummary(),
          todayRealizedPnlUsdt: metrics.todayRealizedPnlUsdt,
          todayUnrealizedPnlUsdt: metrics.todayUnrealizedPnlUsdt,
          todayFeeUsdt: metrics.todayFeeUsdt,
          todayFundingUsdt: metrics.todayFundingUsdt,
          todaySlippageUsdt: metrics.todaySlippageUsdt,
          accountEquity: metrics.accountEquity,
          accountReturnPct: metrics.accountReturnPct
        },
        metrics,
        riskView: getUnifiedRiskView(),
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
