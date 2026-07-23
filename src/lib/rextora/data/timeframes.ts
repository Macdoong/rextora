/**
 * Canonical timeframe mapping for backtest / chart / Binance interval alignment.
 * UI-supported set: 1m, 3m, 5m, 15m, 1h
 */

export const SUPPORTED_TIMEFRAMES = ["1m", "3m", "5m", "15m", "1h"] as const;

export type SupportedTimeframe = (typeof SUPPORTED_TIMEFRAMES)[number];

export interface TimeframeSpec {
  /** Display / config key */
  id: SupportedTimeframe;
  /** Binance USD-M futures kline interval */
  binanceInterval: SupportedTimeframe;
  /** Candle open-time spacing in milliseconds */
  intervalMs: number;
  /** Soft label for UI */
  labelKo: string;
}

const SPECS: Record<SupportedTimeframe, TimeframeSpec> = {
  "1m": {
    id: "1m",
    binanceInterval: "1m",
    intervalMs: 60_000,
    labelKo: "1분",
  },
  "3m": {
    id: "3m",
    binanceInterval: "3m",
    intervalMs: 180_000,
    labelKo: "3분",
  },
  "5m": {
    id: "5m",
    binanceInterval: "5m",
    intervalMs: 300_000,
    labelKo: "5분",
  },
  "15m": {
    id: "15m",
    binanceInterval: "15m",
    intervalMs: 900_000,
    labelKo: "15분",
  },
  "1h": {
    id: "1h",
    binanceInterval: "1h",
    intervalMs: 3_600_000,
    labelKo: "1시간",
  },
};

export function isSupportedTimeframe(value: string): value is SupportedTimeframe {
  return (SUPPORTED_TIMEFRAMES as readonly string[]).includes(value);
}

export function resolveTimeframe(value: string): TimeframeSpec {
  if (!isSupportedTimeframe(value)) {
    throw new Error(`지원하지 않는 시간봉입니다: ${value}`);
  }
  return SPECS[value];
}

export function expectedBarCount(fromMs: number, toMs: number, intervalMs: number): number {
  if (toMs < fromMs || intervalMs <= 0) return 0;
  return Math.floor((toMs - fromMs) / intervalMs) + 1;
}

/**
 * Validate consecutive candle spacing (allows one missing bar).
 * Returns null when OK, otherwise a Korean-safe technical reason.
 */
export function validateCandleSpacing(
  openTimes: number[],
  intervalMs: number,
  toleranceMs = Math.floor(intervalMs * 0.05),
): string | null {
  if (openTimes.length < 2) return null;
  for (let i = 1; i < openTimes.length; i += 1) {
    const delta = openTimes[i] - openTimes[i - 1];
    if (delta <= 0) {
      return `non-ascending openTime at index ${i}`;
    }
    // Allow gaps of N intervals (missing bars), but reject wrong step size
    if (delta % intervalMs > toleranceMs && intervalMs - (delta % intervalMs) > toleranceMs) {
      return `unexpected spacing ${delta}ms at index ${i} (expected multiple of ${intervalMs}ms)`;
    }
  }
  return null;
}
