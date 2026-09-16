/**
 * Shared candle finalization and bar-progression identity.
 * SAFE Paper and Event-Sequence Paper reuse this; economics stay separate.
 */

export interface CandleTimeIdentity {
  openTime: number;
  closeTime?: number;
}

export function candleCloseTime(
  candle: CandleTimeIdentity,
  intervalMs: number,
): number {
  if (typeof candle.closeTime === "number" && Number.isFinite(candle.closeTime)) {
    return candle.closeTime;
  }
  return candle.openTime + intervalMs - 1;
}

/** Exchange closeTime vs nowMs, exclusive at equality. */
export function isCandleFinalized(
  candle: CandleTimeIdentity,
  nowMs: number,
  intervalMs: number,
): boolean {
  return nowMs > candleCloseTime(candle, intervalMs);
}

export function latestFinalizedCandle<T extends CandleTimeIdentity>(
  candles: T[],
  nowMs: number,
  intervalMs: number,
): { candle: T; index: number } | null {
  for (let i = candles.length - 1; i >= 0; i -= 1) {
    const candle = candles[i];
    if (candle && isCandleFinalized(candle, nowMs, intervalMs)) {
      return { candle, index: i };
    }
  }
  return null;
}

/**
 * Completed strategy bars between two finalized openTimes.
 * Same candle → 0. Next openTime (N+1) → 1.
 */
export function elapsedFinalizedBars(
  fromOpenTime: number,
  toOpenTime: number,
  intervalMs: number,
): number {
  if (
    !Number.isFinite(fromOpenTime) ||
    !Number.isFinite(toOpenTime) ||
    !Number.isFinite(intervalMs) ||
    intervalMs <= 0
  ) {
    return 0;
  }
  return Math.max(0, Math.round((toOpenTime - fromOpenTime) / intervalMs));
}

/** Map openTime cooldown onto the signal engine's sequential lastEntryBarIndex. */
export function lastEntryBarIndexFromCandleTimes(input: {
  finalizedIndex: number;
  finalizedOpenTime: number;
  lastEntryOpenTime: number | null | undefined;
  intervalMs: number;
}): number | null {
  if (
    input.lastEntryOpenTime == null ||
    !Number.isFinite(input.lastEntryOpenTime)
  ) {
    return null;
  }
  const elapsed = elapsedFinalizedBars(
    input.lastEntryOpenTime,
    input.finalizedOpenTime,
    input.intervalMs,
  );
  return input.finalizedIndex - elapsed;
}

export function safePaperCandleIdentity(input: {
  symbol: string;
  interval: string;
  openTime: number;
}): string {
  return `${input.symbol.toUpperCase()}:${input.interval}:${input.openTime}`;
}
