import { getKlines } from "../binance/binanceReadOnlyService";
import { candlesFromBinanceKlines, generateSyntheticCandles, type OhlcvCandle } from "./ohlcvTypes";

export async function loadOhlcvCandles(
  symbol: string,
  options?: { interval?: string; limit?: number; allowSynthetic?: boolean }
): Promise<{ candles: OhlcvCandle[]; source: "binance" | "synthetic"; error?: string }> {
  const interval = options?.interval ?? "15m";
  const limit = options?.limit ?? 250;
  const allowSynthetic = options?.allowSynthetic !== false;

  try {
    const result = await getKlines(symbol, interval, limit);
    if (result.ok && Array.isArray(result.data) && result.data.length > 50) {
      return { candles: candlesFromBinanceKlines(result.data as Array<Array<string | number>>), source: "binance" };
    }
    if (!allowSynthetic) {
      return { candles: [], source: "synthetic", error: result.message ?? "klines unavailable" };
    }
  } catch (error) {
    if (!allowSynthetic) {
      return {
        candles: [],
        source: "synthetic",
        error: error instanceof Error ? error.message : "klines error"
      };
    }
  }

  return { candles: generateSyntheticCandles(limit, 100 + symbol.length, 0.00012), source: "synthetic" };
}
