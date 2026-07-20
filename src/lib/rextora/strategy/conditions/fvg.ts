import type { OhlcvCandle } from "../../data/ohlcvTypes";

export interface FvgParams {
  minGapAbs: number;
  minGapPct: number;
  atrRelativeMult: number;
  partialFillPct: number;
  fullFillInvalidates: boolean;
  maxAgeBars: number;
  firstTouchOnly: boolean;
  entryInsideGap: boolean;
  invalidateOnCloseThrough: boolean;
}

export interface FvgZone {
  createdAt: number;
  high: number;
  low: number;
  side: "bullish" | "bearish";
}

/**
 * Exact FVG rules (3-candle imbalance):
 * Bullish FVG at i: candle[i-2].high < candle[i].low  → gap [candle[i-2].high, candle[i].low]
 * Bearish FVG at i: candle[i-2].low > candle[i].high → gap [candle[i].high, candle[i-2].low]
 * Size filters: abs gap, % of mid, or ATR-relative.
 * Age: bar - createdAt <= maxAgeBars.
 * Partial fill: price enters gap by partialFillPct of gap width.
 * Full fill: mid candle or later closes through entire gap → invalidate if fullFillInvalidates.
 * firstTouchOnly / entryInsideGap analogous to OB.
 */
export function detectFvg(
  candles: OhlcvCandle[],
  bar: number,
  atr: number,
  side: "bullish" | "bearish",
  params: FvgParams
): { hit: boolean; zone: FvgZone | null } {
  if (bar < 2) return { hit: false, zone: null };
  let zone: FvgZone | null = null;
  const start = Math.max(2, bar - params.maxAgeBars);

  for (let i = bar; i >= start; i -= 1) {
    const a = candles[i - 2];
    const c = candles[i];
    if (side === "bullish" && a.high < c.low) {
      const low = a.high;
      const high = c.low;
      const mid = (low + high) / 2;
      const gap = high - low;
      const ok =
        gap >= params.minGapAbs ||
        gap / Math.max(mid, 1e-9) >= params.minGapPct / 100 ||
        gap >= params.atrRelativeMult * Math.max(atr, 1e-9);
      if (ok) {
        zone = { createdAt: i, high, low, side: "bullish" };
        break;
      }
    }
    if (side === "bearish" && a.low > c.high) {
      const high = a.low;
      const low = c.high;
      const mid = (low + high) / 2;
      const gap = high - low;
      const ok =
        gap >= params.minGapAbs ||
        gap / Math.max(mid, 1e-9) >= params.minGapPct / 100 ||
        gap >= params.atrRelativeMult * Math.max(atr, 1e-9);
      if (ok) {
        zone = { createdAt: i, high, low, side: "bearish" };
        break;
      }
    }
  }

  if (!zone) return { hit: false, zone: null };
  if (bar - zone.createdAt > params.maxAgeBars) return { hit: false, zone: null };

  const cur = candles[bar];
  const width = Math.max(zone.high - zone.low, 1e-9);

  if (params.fullFillInvalidates || params.invalidateOnCloseThrough) {
    if (zone.side === "bullish" && cur.close <= zone.low) return { hit: false, zone: null };
    if (zone.side === "bearish" && cur.close >= zone.high) return { hit: false, zone: null };
  }

  const overlaps = cur.low <= zone.high && cur.high >= zone.low;
  if (!overlaps) return { hit: false, zone };

  const fillDepth =
    zone.side === "bullish"
      ? Math.max(0, zone.high - Math.min(cur.low, zone.high))
      : Math.max(0, Math.max(cur.high, zone.low) - zone.low);
  const filledEnough = fillDepth / width >= params.partialFillPct / 100;

  let hit = filledEnough;
  if (params.entryInsideGap) {
    hit = cur.close >= zone.low && cur.close <= zone.high;
  }
  if (params.firstTouchOnly) {
    let earlier = false;
    for (let j = zone.createdAt + 1; j < bar; j += 1) {
      const cj = candles[j];
      if (cj.low <= zone.high && cj.high >= zone.low) {
        earlier = true;
        break;
      }
    }
    if (earlier) hit = false;
  }
  return { hit, zone };
}
