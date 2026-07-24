import { getKlinesRange } from "@/src/lib/rextora/binance/binanceReadOnlyService";
import {
  toDateInput,
  type AvailableCandleDateRange,
} from "@/src/lib/rextora/backtest/backtestDateRange";

/**
 * Probe Binance for earliest + latest available kline open times.
 * Does not hardcode calendar dates — reads the live dataset limits.
 */
export async function probeAvailableCandleDateRange(
  symbol = "BTCUSDT",
  timeframe = "15m",
  nowMs = Date.now(),
): Promise<AvailableCandleDateRange | null> {
  const sym = symbol.toUpperCase();
  const tf = timeframe || "15m";

  const [earliestRes, latestRes] = await Promise.all([
    // startTime=0 asks the exchange for the first available candle forward.
    getKlinesRange(sym, tf, 1, 0),
    getKlinesRange(sym, tf, 1),
  ]);

  if (!earliestRes.ok || !earliestRes.data?.length) return null;
  if (!latestRes.ok || !latestRes.data?.length) return null;

  const first = earliestRes.data[0];
  const last = latestRes.data[latestRes.data.length - 1];
  const fromOpenTime = Number(first[0]);
  let toOpenTime = Number(last[0]);
  if (!Number.isFinite(fromOpenTime) || !Number.isFinite(toOpenTime)) {
    return null;
  }
  toOpenTime = Math.min(toOpenTime, nowMs);
  if (fromOpenTime >= toOpenTime) return null;

  return {
    symbol: sym,
    timeframe: tf,
    fromOpenTime,
    toOpenTime,
    fromDate: toDateInput(new Date(fromOpenTime)),
    toDate: toDateInput(new Date(toOpenTime)),
  };
}
