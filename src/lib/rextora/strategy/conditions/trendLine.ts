import type { OhlcvCandle } from "../../data/ohlcvTypes";
import { findPivots } from "./structure";

export interface TrendLineParams {
  minPivotCount: number;
  minTouchCount: number;
  slopeMin: number;
  slopeMax: number;
  tolerancePct: number;
  breakoutByClose: boolean;
  breakoutByWick: boolean;
  confirmationCandles: number;
  retestRequired: boolean;
  maxAgeBars: number;
}

export interface TrendLine {
  kind: "ascending" | "descending" | "support" | "resistance";
  startIndex: number;
  endIndex: number;
  startPrice: number;
  endPrice: number;
  slope: number;
}

function linePrice(line: TrendLine, index: number): number {
  const dx = line.endIndex - line.startIndex || 1;
  return line.startPrice + ((index - line.startIndex) / dx) * (line.endPrice - line.startPrice);
}

/**
 * Exact trend-line rules:
 * 1. Build pivots with lookback 3.
 * 2. Ascending = last two swing lows where price2 > price1; slope in [slopeMin, slopeMax].
 * 3. Descending = last two swing highs where price2 < price1.
 * 4. Support TL = ascending lows; Resistance TL = descending highs.
 * 5. Touch count: bars where |price - line| / price <= tolerancePct/100 (low for support, high for resistance).
 * 6. Require minPivotCount (>=2) and minTouchCount.
 * 7. Age: bar - startIndex <= maxAgeBars.
 * 8. Breakout: close or wick beyond line opposite to support/resistance direction.
 * 9. Retest: after breakout, price returns within tolerance then continues (optional).
 */
export function detectTrendLine(
  candles: OhlcvCandle[],
  bar: number,
  kind: "ascending_trend_line" | "descending_trend_line" | "support_trend_line" | "resistance_trend_line",
  params: TrendLineParams
): { hit: boolean; line: TrendLine | null; broken: boolean } {
  if (bar < 10) return { hit: false, line: null, broken: false };
  const slice = candles.slice(0, bar + 1);
  const pivots = findPivots(slice, 3);
  const lows = pivots.filter((p) => p.kind === "low");
  const highs = pivots.filter((p) => p.kind === "high");

  let line: TrendLine | null = null;
  if (kind === "ascending_trend_line" || kind === "support_trend_line") {
    if (lows.length < Math.max(2, params.minPivotCount)) return { hit: false, line: null, broken: false };
    const a = lows[lows.length - 2];
    const b = lows[lows.length - 1];
    if (b.price <= a.price) return { hit: false, line: null, broken: false };
    const slope = (b.price - a.price) / Math.max(1, b.index - a.index);
    if (slope < params.slopeMin || slope > params.slopeMax) return { hit: false, line: null, broken: false };
    line = {
      kind: kind === "support_trend_line" ? "support" : "ascending",
      startIndex: a.index,
      endIndex: b.index,
      startPrice: a.price,
      endPrice: b.price,
      slope
    };
  } else {
    if (highs.length < Math.max(2, params.minPivotCount)) return { hit: false, line: null, broken: false };
    const a = highs[highs.length - 2];
    const b = highs[highs.length - 1];
    if (b.price >= a.price) return { hit: false, line: null, broken: false };
    const slope = (b.price - a.price) / Math.max(1, b.index - a.index);
    const absSlope = Math.abs(slope);
    if (absSlope < params.slopeMin || absSlope > params.slopeMax) return { hit: false, line: null, broken: false };
    line = {
      kind: kind === "resistance_trend_line" ? "resistance" : "descending",
      startIndex: a.index,
      endIndex: b.index,
      startPrice: a.price,
      endPrice: b.price,
      slope
    };
  }

  if (bar - line.startIndex > params.maxAgeBars) return { hit: false, line: null, broken: false };

  let touches = 0;
  for (let i = line.startIndex; i <= bar; i += 1) {
    const lp = linePrice(line, i);
    const ref = line.kind === "resistance" || line.kind === "descending" ? candles[i].high : candles[i].low;
    if (Math.abs(ref - lp) / Math.max(lp, 1e-9) <= params.tolerancePct / 100) touches += 1;
  }
  if (touches < params.minTouchCount) return { hit: false, line, broken: false };

  const lp = linePrice(line, bar);
  const c = candles[bar];
  const isSupport = line.kind === "support" || line.kind === "ascending";
  let broken = false;
  if (params.breakoutByClose) {
    broken = isSupport ? c.close < lp : c.close > lp;
  }
  if (params.breakoutByWick) {
    broken = broken || (isSupport ? c.low < lp : c.high > lp);
  }

  const near = Math.abs((isSupport ? c.low : c.high) - lp) / Math.max(lp, 1e-9) <= params.tolerancePct / 100;
  let hit = near && !broken;
  if (params.retestRequired && broken) {
    // simple retest: previous bar broke, current near line from other side
    const prev = candles[bar - 1];
    const prevLp = linePrice(line, bar - 1);
    const prevBroke = isSupport ? prev.close < prevLp : prev.close > prevLp;
    hit = prevBroke && near;
  }

  if (params.confirmationCandles > 0 && hit) {
    hit = bar >= line.endIndex + params.confirmationCandles;
  }

  return { hit, line, broken };
}
