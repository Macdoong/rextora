import { apiErrorResponse, apiJsonResponse } from "@/src/lib/rextora/apiResponse";
import { buildSyncedSystemPayload, cacheDiagnosticsReport } from "@/src/lib/rextora/systemStatusSyncService";

export async function GET() {
  const start = Date.now();
  try {
    const synced = await buildSyncedSystemPayload({ forceDiagnostics: true, forceMarketRefresh: true });
    if (synced.diagnostics) cacheDiagnosticsReport(synced.diagnostics);
    return apiJsonResponse(
      { report: synced.diagnostics, systemSync: synced },
      { source: "binance-diagnostics", cached: false, durationMs: Date.now() - start }
    );
  } catch (error) {
    return apiErrorResponse(error instanceof Error ? error.message : "binance diagnostics failed", Date.now() - start);
  }
}

export async function POST() {
  return GET();
}
