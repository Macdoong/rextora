import type { OhlcvCandle } from "../../data/ohlcvTypes";

export interface SupplyDemandParams {
  lookback: number;
  baseCandleCount: number;
  maxBaseRangeAtrMult: number;
  minDepartureAtrMult: number;
  minDeparturePct: number;
  zoneBodyOnly: boolean;
  maxAgeBars: number;
  firstTouchOnly: boolean;
  requireRejectionClose: boolean;
  invalidateOnCloseBeyond: boolean;
}

export interface SupplyDemandZone {
  kind: "demand" | "supply";
  createdAt: number;
  departureBar: number;
  high: number;
  low: number;
  touched: boolean;
}

/**
 * Detect a compact base followed by an impulsive departure. `bar` is the
 * latest completed candle; formation/departure scans end at bar - 1 so the
 * current completed candle is used only for validation/retest.
 */
export function detectSupplyDemand(
  candles: OhlcvCandle[],
  bar: number,
  atr: number,
  kind: "demand" | "supply",
  params: SupplyDemandParams,
): { hit: boolean; zone: SupplyDemandZone | null } {
  const baseCount = Math.max(1, Math.trunc(params.baseCandleCount));
  if (bar < baseCount + 1 || bar >= candles.length) {
    return { hit: false, zone: null };
  }

  const firstDeparture = baseCount;
  const from = Math.max(firstDeparture, bar - Math.max(2, params.lookback));
  let zone: SupplyDemandZone | null = null;

  for (let departureBar = bar - 1; departureBar >= from; departureBar -= 1) {
    const baseStart = departureBar - baseCount;
    const base = candles.slice(baseStart, departureBar);
    if (base.length !== baseCount) continue;

    const baseHigh = Math.max(
      ...base.map((c) =>
        params.zoneBodyOnly ? Math.max(c.open, c.close) : c.high,
      ),
    );
    const baseLow = Math.min(
      ...base.map((c) =>
        params.zoneBodyOnly ? Math.min(c.open, c.close) : c.low,
      ),
    );
    const baseRange = baseHigh - baseLow;
    if (baseRange > params.maxBaseRangeAtrMult * Math.max(atr, 1e-9)) continue;

    const departure = candles[departureBar]!;
    const body = Math.abs(departure.close - departure.open);
    const bodyPct = (body / Math.max(departure.open, 1e-9)) * 100;
    const impulse =
      body >= params.minDepartureAtrMult * Math.max(atr, 1e-9) ||
      bodyPct >= params.minDeparturePct;
    const directional =
      kind === "demand"
        ? departure.close > departure.open && departure.close > baseHigh
        : departure.close < departure.open && departure.close < baseLow;
    if (!impulse || !directional) continue;

    zone = {
      kind,
      createdAt: baseStart,
      departureBar,
      high: baseHigh,
      low: baseLow,
      touched: false,
    };
    break;
  }

  if (!zone || bar - zone.departureBar > params.maxAgeBars) {
    return { hit: false, zone: null };
  }

  const current = candles[bar]!;
  if (
    params.invalidateOnCloseBeyond &&
    ((kind === "demand" && current.close < zone.low) ||
      (kind === "supply" && current.close > zone.high))
  ) {
    return { hit: false, zone };
  }

  const overlaps = current.low <= zone.high && current.high >= zone.low;
  if (!overlaps) return { hit: false, zone };

  if (params.firstTouchOnly) {
    for (let i = zone.departureBar + 1; i < bar; i += 1) {
      const candle = candles[i]!;
      if (candle.low <= zone.high && candle.high >= zone.low) {
        return { hit: false, zone: { ...zone, touched: true } };
      }
    }
  }

  const rejectionOk =
    !params.requireRejectionClose ||
    (kind === "demand"
      ? current.close > zone.high
      : current.close < zone.low);
  return {
    hit: rejectionOk,
    zone: { ...zone, touched: true },
  };
}
