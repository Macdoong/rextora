import { getAuditSummary } from "@/src/lib/rextora/storage/auditStore";
import { getRextoraSettings } from "@/src/lib/rextora/settings/settingsService";
import { getPositionSyncStatus } from "@/src/lib/rextora/positionSyncService";
import { getOrderSyncStatus } from "@/src/lib/rextora/orderSyncService";
import { apiErrorResponse, apiJsonResponse } from "@/src/lib/rextora/apiResponse";
import { engineStatusSeed } from "@/src/lib/rextora/seedData";
import { getApiStatus } from "@/src/lib/rextora/apiStatusService";
import { getRuntimeState } from "@/src/lib/rextora/runtimeState";
import { getTelegramStatus } from "@/src/lib/rextora/telegramService";
import { buildSyncedSystemPayload } from "@/src/lib/rextora/systemStatusSyncService";

export async function GET(request: Request) {
  const start = Date.now();
  try {
    const url = new URL(request.url);
    const forceDiagnostics = url.searchParams.get("fresh") === "1" || url.searchParams.get("sync") === "1";
    const forceMarket = url.searchParams.get("market") === "1" || forceDiagnostics;

    const api = getApiStatus();
    const runtime = getRuntimeState();
    const settings = getRextoraSettings();
    const synced = await buildSyncedSystemPayload({
      forceDiagnostics,
      forceMarketRefresh: forceMarket
    });

    return apiJsonResponse(
      {
        engines: engineStatusSeed,
        binance: synced.binance,
        runtime,
        serviceState: api.serviceState,
        liveReadiness: {
          status: synced.liveReadiness.status,
          passed: synced.liveReadiness.passed,
          blockedReasons: synced.liveReadiness.blockedReasons,
          checklist: synced.liveReadiness.checklist
        },
        userStream: synced.userStream,
        positionSync: getPositionSyncStatus(),
        orderSync: getOrderSyncStatus(),
        tpSl: synced.tpSl,
        tpSlDisplay: synced.tpSlDisplay,
        telegram: getTelegramStatus(),
        settingsStore: { ok: true, updatedAt: settings.updatedAt },
        audit: getAuditSummary(),
        diagnostics: synced.diagnostics
      },
      {
        source: "system-status",
        cached: !forceDiagnostics,
        durationMs: Date.now() - start,
        updatedAt: runtime.lastHeartbeat
      }
    );
  } catch (error) {
    return apiErrorResponse(error instanceof Error ? error.message : "system status failed", Date.now() - start);
  }
}
