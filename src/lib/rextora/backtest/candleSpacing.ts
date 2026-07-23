/**
 * Candle series continuity diagnostics for chart display.
 * Does not alter OHLC — reports spacing issues only.
 *
 * Body/slot geometry lives in `candleGeometry.ts`.
 */

export {
  MIN_CANDLE_BODY_PX,
  PREFERRED_BODY_MIN_PX,
  PREFERRED_BODY_MAX_PX,
  MIN_WICK_PX,
  MAX_WICK_PX,
  BODY_STROKE_PX,
  MIN_CANDLE_BODY_HEIGHT_PX,
  BODY_FILL_RATIO,
  MIN_BODY_GAP_PX,
  PRICE_DOMAIN_PAD,
  VOLUME_FRACTION,
  MARKER_BASE_RADIUS,
  MARKER_SELECTED_RADIUS,
  MARKER_OPACITY,
  MARKER_OFFSET_PX,
  PREVIOUS_DEFAULT_BODY_PX,
  defaultVisibleCandleTarget,
  computeCandleGeometry,
  candleDensityTier,
  snapPx,
  type CandleGeometry,
} from "./candleGeometry";

export interface CandleTimePoint {
  openTime: number;
}

export interface CandleSpacingReport {
  inputCount: number;
  renderedCount: number;
  firstTimestamp: number | null;
  lastTimestamp: number | null;
  duplicateCount: number;
  minGapMs: number | null;
  maxGapMs: number | null;
  missingIntervalCount: number;
  sorted: boolean;
}

export function analyzeCandleSpacing(
  candles: CandleTimePoint[],
  intervalMs: number,
  rendered?: CandleTimePoint[],
): CandleSpacingReport {
  const inputCount = candles.length;
  const view = rendered ?? candles;
  const renderedCount = view.length;
  if (!view.length) {
    return {
      inputCount,
      renderedCount: 0,
      firstTimestamp: null,
      lastTimestamp: null,
      duplicateCount: 0,
      minGapMs: null,
      maxGapMs: null,
      missingIntervalCount: 0,
      sorted: true,
    };
  }

  let duplicateCount = 0;
  let sorted = true;
  let minGapMs: number | null = null;
  let maxGapMs: number | null = null;
  let missingIntervalCount = 0;
  const tol = Math.max(1, intervalMs * 0.05);

  for (let i = 1; i < view.length; i += 1) {
    const gap = view[i].openTime - view[i - 1].openTime;
    if (gap < 0) sorted = false;
    if (gap === 0) duplicateCount += 1;
    if (gap > 0) {
      minGapMs = minGapMs == null ? gap : Math.min(minGapMs, gap);
      maxGapMs = maxGapMs == null ? gap : Math.max(maxGapMs, gap);
      if (intervalMs > 0 && gap > intervalMs + tol) {
        const missed = Math.round(gap / intervalMs) - 1;
        if (missed > 0) missingIntervalCount += missed;
      }
    }
  }

  return {
    inputCount,
    renderedCount,
    firstTimestamp: view[0].openTime,
    lastTimestamp: view[view.length - 1].openTime,
    duplicateCount,
    minGapMs,
    maxGapMs,
    missingIntervalCount,
    sorted,
  };
}
