import {
  apiErrorResponse,
  apiJsonResponse,
} from "@/src/lib/rextora/apiResponse";
import {
  getMarketSnapshot,
  refreshMarketData,
} from "@/src/lib/rextora/marketDataStore";
import {
  getMarketWatcherSummary,
  getMarketCacheMeta,
} from "@/src/lib/rextora/marketWatcherService";
import { getLastSafeSignals } from "@/src/lib/rextora/execution/safePaperLoop";
import { calculateSafeV44Risk } from "@/src/lib/rextora/risk/safeV44RiskEngine";
import { loadSafeV44Strategy } from "@/src/lib/rextora/strategy/safeV44Strategy";
import { getAccountState } from "@/src/lib/rextora/accountStateStore";

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
    const strategy = loadSafeV44Strategy({ throwOnHashMismatch: false });
    const balance = getAccountState().balanceUsdt;
    const signals = getLastSafeSignals(50).map((row) => {
      const indicator = row.signal.indicators;
      const risk =
        indicator && row.signal.side !== "NONE"
          ? calculateSafeV44Risk({
              entryPrice: indicator.close,
              atr: indicator.atr,
              atrPct: indicator.atrPct,
              side: row.signal.side,
              signalType: row.signal.signalType,
              balance,
              params: strategy.params,
            })
          : null;
      const expectedRr =
        risk && Math.abs(risk.entryPrice - risk.stopLossPrice) > 0
          ? Math.abs(risk.takeProfitPrice - risk.entryPrice) /
            Math.abs(risk.entryPrice - risk.stopLossPrice)
          : null;
      return {
        symbol: row.symbol,
        side: row.signal.side,
        score: row.signal.score,
        status: row.status,
        reason: row.reason,
        rejectReason: row.signal.rejectReason,
        entryReason: row.signal.entryReason,
        estimatedEntryPrice: risk?.entryPrice ?? null,
        estimatedStopPrice: risk?.stopLossPrice ?? null,
        estimatedTakeProfitPrice: risk?.takeProfitPrice ?? null,
        expectedRr: expectedRr == null ? null : Number(expectedRr.toFixed(2)),
      };
    });

    return apiJsonResponse(
      {
        coins: snapshot.coins,
        signals,
        source: cacheMeta.source,
        summary: getMarketWatcherSummary(),
      },
      {
        source: cacheMeta.source,
        cached: !force && cacheMeta.cached,
        durationMs: Date.now() - start,
        updatedAt: cacheMeta.updatedAt,
      },
    );
  } catch (error) {
    return apiErrorResponse(
      error instanceof Error ? error.message : "market fetch failed",
      Date.now() - start,
    );
  }
}
