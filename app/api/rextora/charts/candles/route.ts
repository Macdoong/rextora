import { NextResponse } from "next/server";
import { loadOhlcvCandles } from "@/src/lib/rextora/data/candleLoader";

/** Chart-only candle feed. Does not place orders or alter trading logic. */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const symbol = (url.searchParams.get("symbol") ?? "BTCUSDT").toUpperCase();
  const interval = url.searchParams.get("interval") ?? "15m";
  const limit = Math.min(500, Math.max(50, Number(url.searchParams.get("limit") ?? 200)));

  const { candles, source, error } = await loadOhlcvCandles(symbol, {
    interval,
    limit,
    allowSynthetic: true
  });

  return NextResponse.json({
    ok: true,
    data: {
      symbol,
      interval,
      source,
      candles,
      error: error ?? null
    }
  });
}
