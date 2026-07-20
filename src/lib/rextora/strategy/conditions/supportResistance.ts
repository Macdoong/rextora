import type { OhlcvCandle } from "../../data/ohlcvTypes";

export interface SrParams {
  lookback: number;
  minTouches: number;
  tolerancePct: number;
  zoneWidthPct: number;
  volumeConfirmation: boolean;
  breakoutConfirmation: boolean;
  maxAgeBars: number;
}

export interface SrZone {
  kind: "support" | "resistance";
  price: number;
  high: number;
  low: number;
  touches: number;
  createdAt: number;
}

/**
 * Exact S/R rules:
 * - previous_high / previous_low: max high / min low over lookback (excluding current bar).
 * - support_zone / resistance_zone / repeated_touch_zone: cluster pivots within zoneWidthPct;
 *   count touches where price trades within tolerancePct of zone mid.
 * - volumeConfirmation: touch bar volume >= SMA(volume,20).
 * - breakoutConfirmation: close beyond zone with optional volume.
 * - sr_flip: former resistance broken then retested as support (or inverse).
 * - maxAgeBars limits how far back the zone origin may be.
 */
export function detectSupportResistance(
  candles: OhlcvCandle[],
  bar: number,
  kind: "support_zone" | "resistance_zone" | "previous_high" | "previous_low" | "repeated_touch_zone" | "sr_flip",
  params: SrParams
): { hit: boolean; zone: SrZone | null } {
  if (bar < params.lookback + 2) return { hit: false, zone: null };
  const from = Math.max(0, bar - params.lookback);
  const window = candles.slice(from, bar);
  const highs = window.map((c) => c.high);
  const lows = window.map((c) => c.low);
  const prevHigh = Math.max(...highs);
  const prevLow = Math.min(...lows);
  const c = candles[bar];
  const tol = params.tolerancePct / 100;
  const width = params.zoneWidthPct / 100;

  const volSma = (() => {
    const vols = candles.slice(Math.max(0, bar - 20), bar).map((x) => x.volume);
    return vols.length ? vols.reduce((a, b) => a + b, 0) / vols.length : 0;
  })();

  if (kind === "previous_high") {
    const near = Math.abs(c.high - prevHigh) / prevHigh <= tol || Math.abs(c.close - prevHigh) / prevHigh <= tol;
    return {
      hit: near,
      zone: { kind: "resistance", price: prevHigh, high: prevHigh * (1 + width), low: prevHigh * (1 - width), touches: 1, createdAt: from }
    };
  }
  if (kind === "previous_low") {
    const near = Math.abs(c.low - prevLow) / prevLow <= tol || Math.abs(c.close - prevLow) / prevLow <= tol;
    return {
      hit: near,
      zone: { kind: "support", price: prevLow, high: prevLow * (1 + width), low: prevLow * (1 - width), touches: 1, createdAt: from }
    };
  }

  // Cluster: use prevHigh as resistance seed, prevLow as support seed
  const useRes =
    kind === "resistance_zone" || (kind === "repeated_touch_zone" && c.close > (prevHigh + prevLow) / 2);
  const mid = useRes ? prevHigh : prevLow;
  const zone: SrZone = {
    kind: useRes ? "resistance" : "support",
    price: mid,
    high: mid * (1 + width),
    low: mid * (1 - width),
    touches: 0,
    createdAt: from
  };

  if (bar - zone.createdAt > params.maxAgeBars) return { hit: false, zone: null };

  for (let i = from; i <= bar; i += 1) {
    const ci = candles[i];
    const touchesZone = ci.low <= zone.high && ci.high >= zone.low;
    if (!touchesZone) continue;
    if (params.volumeConfirmation && volSma > 0 && ci.volume < volSma) continue;
    zone.touches += 1;
  }

  if (zone.touches < params.minTouches) return { hit: false, zone };

  let hit = c.low <= zone.high && c.high >= zone.low;
  if (params.breakoutConfirmation) {
    const broke = zone.kind === "resistance" ? c.close > zone.high : c.close < zone.low;
    hit = broke && (!params.volumeConfirmation || c.volume >= volSma);
  }

  if (kind === "sr_flip") {
    // resistance broken then price retests from above
    const brokeRes = window.some((w, idx) => idx > 0 && w.close > prevHigh) || c.close > prevHigh;
    const retest = Math.abs(c.low - prevHigh) / prevHigh <= tol && c.close > prevHigh * (1 - tol);
    const brokeSup = window.some((w) => w.close < prevLow) || c.close < prevLow;
    const retestSup = Math.abs(c.high - prevLow) / prevLow <= tol && c.close < prevLow * (1 + tol);
    hit = (brokeRes && retest) || (brokeSup && retestSup);
  }

  return { hit, zone };
}
