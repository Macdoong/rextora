import { buildSyncedSystemPayload, applyDiagnosticsToApiStatus } from "@/src/lib/rextora/systemStatusSyncService";
import { buildFinalLiveReadinessChecklist, getExpectedRemainingLiveBlocks } from "@/src/lib/rextora/liveReadinessChecklist";
import { evaluateLiveSafetyGate } from "@/src/lib/rextora/liveSafetyGate";
import { getRextoraSettings } from "@/src/lib/rextora/settings/settingsService";
import { apiErrorResponse, apiJsonResponse } from "@/src/lib/rextora/apiResponse";

export async function GET(request: Request) {
  const start = Date.now();
  try {
    const url = new URL(request.url);
    const fresh = url.searchParams.get("fresh") === "1";

    const synced = await buildSyncedSystemPayload({ forceDiagnostics: fresh, forceMarketRefresh: fresh });
    const settings = getRextoraSettings();
    const api = applyDiagnosticsToApiStatus(synced.diagnostics);
    const liveGate = evaluateLiveSafetyGate({
      readinessOnly: true,
      diagnostics: synced.diagnostics ?? undefined,
      api
    });
    const checklist = buildFinalLiveReadinessChecklist({
      diagnostics: synced.diagnostics,
      liveGate
    });

    return apiJsonResponse(
      {
        checklist,
        remainingBlocks: getExpectedRemainingLiveBlocks(liveGate),
        liveReady: liveGate.passed,
        liveStatus: liveGate.status,
        liveAllowed: settings.trading.allowLiveTrading || settings.trading.liveTradingEnabled
      },
      { source: "live-readiness", cached: !fresh, durationMs: Date.now() - start }
    );
  } catch (error) {
    return apiErrorResponse(error instanceof Error ? error.message : "live readiness failed", Date.now() - start);
  }
}
