import { apiErrorResponse, apiJsonResponse } from "@/src/lib/rextora/apiResponse";
import { getCachedDiagnosticsReport } from "@/src/lib/rextora/systemStatusSyncService";
import { buildTradingDashboardStatus } from "@/src/lib/rextora/tradingDashboardStatus";
import { getBotRuntimeStatus } from "@/src/lib/rextora/botRuntime";
import { getAuditLogs } from "@/src/lib/rextora/storage/auditStore";

export async function GET() {
  const start = Date.now();
  try {
    const diagnostics = getCachedDiagnosticsReport();
    const status = buildTradingDashboardStatus(diagnostics);
    const { runtime } = getBotRuntimeStatus();
    const recentEvents = getAuditLogs(10).map((entry) => ({
      timestamp: entry.timestamp,
      type: entry.type,
      message: entry.message,
      mode: entry.mode,
      result: entry.type.includes("failure") || entry.message.includes("실패") ? "실패" : "성공"
    }));
    return apiJsonResponse(
      { status, runtime, recentEvents },
      { source: "trading-dashboard", cached: true, durationMs: Date.now() - start }
    );
  } catch (error) {
    return apiErrorResponse(error instanceof Error ? error.message : "dashboard status failed", Date.now() - start);
  }
}
