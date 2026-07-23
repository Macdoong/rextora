export interface OhlcvCandle {
  openTime: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  closeTime?: number;
}

export function candlesFromBinanceKlines(rows: Array<Array<string | number>>): OhlcvCandle[] {
  return rows.map((row) => ({
    openTime: Number(row[0]),
    open: Number(row[1]),
    high: Number(row[2]),
    low: Number(row[3]),
    close: Number(row[4]),
    volume: Number(row[5]),
    closeTime: Number(row[6] ?? row[0])
  }));
}

export interface SyntheticCandleOptions {
  /** Absolute open time of the first candle (ms). Default Date.UTC(2024, 0, 1). */
  startOpenTime?: number;
  /** Candle spacing in ms. Default 15m. */
  intervalMs?: number;
}

/**
 * Deterministic synthetic OHLCV for unit tests / explicit fixtures only.
 * Must never be used as a silent fallback for user-triggered backtests.
 */
export function generateSyntheticCandles(
  count: number,
  seed = 100,
  drift = 0.0002,
  options?: SyntheticCandleOptions
): OhlcvCandle[] {
  const candles: OhlcvCandle[] = [];
  let price = seed;
  const start = options?.startOpenTime ?? Date.UTC(2024, 0, 1);
  const intervalMs = options?.intervalMs ?? 15 * 60 * 1000;
  for (let i = 0; i < count; i += 1) {
    const wave = Math.sin(i / 11) * 0.004 + Math.cos(i / 29) * 0.002;
    const open = price;
    const close = Math.max(0.01, open * (1 + drift + wave + ((i % 7) - 3) * 0.0003));
    const high = Math.max(open, close) * (1 + 0.0015);
    const low = Math.min(open, close) * (1 - 0.0015);
    const volume = 1000 + (i % 20) * 50 + Math.abs(wave) * 20000;
    candles.push({
      openTime: start + i * intervalMs,
      open,
      high,
      low,
      close,
      volume,
      closeTime: start + (i + 1) * intervalMs - 1
    });
    price = close;
  }
  return candles;
}

/**
 * Build synthetic candles covering an exact [from, to] open-time window.
 * For synthetic-test dataMode only.
 */
export function generateSyntheticCandlesForRange(
  fromOpenTime: number,
  toOpenTime: number,
  intervalMs: number,
  seed = 100,
  drift = 0.0002
): OhlcvCandle[] {
  if (toOpenTime < fromOpenTime || intervalMs <= 0) return [];
  const count = Math.max(1, Math.floor((toOpenTime - fromOpenTime) / intervalMs) + 1);
  const capped = Math.min(count, 20_000);
  return generateSyntheticCandles(capped, seed, drift, {
    startOpenTime: fromOpenTime,
    intervalMs
  }).filter((c) => c.openTime >= fromOpenTime && c.openTime <= toOpenTime);
}
