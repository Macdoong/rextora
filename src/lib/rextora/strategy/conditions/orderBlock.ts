import type { OhlcvCandle } from "../../data/ohlcvTypes";

export interface OrderBlockParams {
  bodyOnly: boolean;
  minImpulseAtrMult: number;
  minImpulsePct: number;
  minVolumeMult: number;
  maxAgeBars: number;
  mitigationPct: number;
  firstTouchOnly: boolean;
  retestAllowed: boolean;
  entryInsideBlock: boolean;
  invalidateOnCloseBeyond: boolean;
}

export interface OrderBlockZone {
  start: number;
  end: number;
  high: number;
  low: number;
  side: "bullish" | "bearish";
  createdAt: number;
  touched: boolean;
  mitigated: boolean;
}

/**
 * Exact OB rules (deterministic):
 * 1. Scan back from `bar` within maxAgeBars.
 * 2. Impulse = candle body size >= max(minImpulsePct * close, minImpulseAtrMult * ATR)
 *    and volume >= minVolumeMult * avg(volume lookback 20).
 * 3. Bullish OB = last bearish candle immediately before a bullish impulse.
 * 4. Bearish OB = last bullish candle immediately before a bearish impulse.
 * 5. Zone range = bodyOnly ? [open,close] : [low,high] of that opposing candle.
 * 6. Invalid if price closes beyond opposite side of block (when invalidateOnCloseBeyond).
 * 7. Mitigation when |fill into zone| / zoneWidth >= mitigationPct/100.
 * 8. firstTouchOnly: true only on first bar that trades into zone after creation.
 * 9. retestAllowed: allows subsequent touches if not mitigated.
 * 10. entryInsideBlock: current close must be within [low, high].
 */
export function detectOrderBlocks(
  candles: OhlcvCandle[],
  bar: number,
  atr: number,
  side: "bullish" | "bearish",
  params: OrderBlockParams
): { hit: boolean; zone: OrderBlockZone | null } {
  if (bar < 5) return { hit: false, zone: null };
  const volLook = 20;
  const vols = candles.slice(Math.max(0, bar - volLook), bar).map((c) => c.volume);
  const avgVol = vols.length ? vols.reduce((a, b) => a + b, 0) / vols.length : 0;

  let zone: OrderBlockZone | null = null;
  const startScan = Math.max(2, bar - params.maxAgeBars);

  for (let i = bar - 1; i >= startScan; i -= 1) {
    const impulse = candles[i];
    const prev = candles[i - 1];
    const body = Math.abs(impulse.close - impulse.open);
    const impulsePct = body / Math.max(impulse.close, 1e-9);
    const impulseOk =
      body >= params.minImpulseAtrMult * Math.max(atr, 1e-9) || impulsePct >= params.minImpulsePct / 100;
    const volOk = avgVol <= 0 || impulse.volume >= avgVol * params.minVolumeMult;
    if (!impulseOk || !volOk) continue;

    const bullishImpulse = impulse.close > impulse.open;
    const bearishImpulse = impulse.close < impulse.open;
    if (side === "bullish" && bullishImpulse && prev.close < prev.open) {
      const high = params.bodyOnly ? Math.max(prev.open, prev.close) : prev.high;
      const low = params.bodyOnly ? Math.min(prev.open, prev.close) : prev.low;
      zone = { start: i - 1, end: i - 1, high, low, side: "bullish", createdAt: i - 1, touched: false, mitigated: false };
      break;
    }
    if (side === "bearish" && bearishImpulse && prev.close > prev.open) {
      const high = params.bodyOnly ? Math.max(prev.open, prev.close) : prev.high;
      const low = params.bodyOnly ? Math.min(prev.open, prev.close) : prev.low;
      zone = { start: i - 1, end: i - 1, high, low, side: "bearish", createdAt: i - 1, touched: false, mitigated: false };
      break;
    }
  }

  if (!zone) return { hit: false, zone: null };
  if (bar - zone.createdAt > params.maxAgeBars) return { hit: false, zone: null };

  const c = candles[bar];
  const width = Math.max(zone.high - zone.low, 1e-9);

  if (params.invalidateOnCloseBeyond) {
    if (zone.side === "bullish" && c.close < zone.low) return { hit: false, zone: { ...zone, mitigated: true } };
    if (zone.side === "bearish" && c.close > zone.high) return { hit: false, zone: { ...zone, mitigated: true } };
  }

  const overlaps = c.low <= zone.high && c.high >= zone.low;
  if (!overlaps) return { hit: false, zone };

  // mitigation depth into zone
  const fill =
    zone.side === "bullish"
      ? Math.max(0, zone.high - Math.min(c.low, zone.high))
      : Math.max(0, Math.max(c.high, zone.low) - zone.low);
  const mitigated = fill / width >= params.mitigationPct / 100;
  zone = { ...zone, touched: true, mitigated };

  let hit: boolean = overlaps;
  if (params.entryInsideBlock) {
    hit = c.close >= zone.low && c.close <= zone.high;
  }
  if (params.firstTouchOnly && !params.retestAllowed) {
    // first touch in window after creation
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
