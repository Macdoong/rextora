import { apiErrorResponse, apiJsonResponse } from "@/src/lib/rextora/apiResponse";
import { getMarketSnapshot, refreshMarketData } from "@/src/lib/rextora/marketDataStore";
import { getMarketWatcherSummary, getMarketCacheMeta } from "@/src/lib/rextora/marketWatcherService";

export async function GET(request: Request) {
  const start = Date.now();
  const force = new URL(request.url).searchParams.get("force") === "true";

  try {
    if (force) {
      await refreshMarketData({ force: true });
    } else {
      const snapshot = getMarketSnapshot();
      if (snapshot.updatedAt === 0) {
        await refreshMarketData({ force: true });
      }
    }

    const snapshot = getMarketSnapshot();
    const cacheMeta = getMarketCacheMeta();

    return apiJsonResponse(
      {
        coins: snapshot.coins,
        source: cacheMeta.source,
        summary: getMarketWatcherSummary()
      },
      {
        source: cacheMeta.source,
        cached: !force && cacheMeta.cached,
        durationMs: Date.now() - start,
        updatedAt: cacheMeta.updatedAt
      }
    );
  } catch (error) {
    return apiErrorResponse(error instanceof Error ? error.message : "market fetch failed", Date.now() - start);
  }
}
