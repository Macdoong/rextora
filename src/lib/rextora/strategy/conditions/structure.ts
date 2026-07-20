import type { OhlcvCandle } from "../../data/ohlcvTypes";

export interface Pivot {
  index: number;
  price: number;
  kind: "high" | "low";
}

export function findPivots(candles: OhlcvCandle[], lookback: number): Pivot[] {
  const lb = Math.max(1, Math.floor(lookback));
  const pivots: Pivot[] = [];
  for (let i = lb; i < candles.length - lb; i += 1) {
    const h = candles[i].high;
    const l = candles[i].low;
    let isHigh = true;
    let isLow = true;
    for (let j = i - lb; j <= i + lb; j += 1) {
      if (j === i) continue;
      if (candles[j].high >= h) isHigh = false;
      if (candles[j].low <= l) isLow = false;
    }
    if (isHigh) pivots.push({ index: i, price: h, kind: "high" });
    if (isLow) pivots.push({ index: i, price: l, kind: "low" });
  }
  return pivots;
}

function minDistOk(a: number, b: number, minPct: number, atr?: number, atrMult?: number): boolean {
  const pct = Math.abs(a - b) / Math.max(Math.abs(b), 1e-9);
  if (pct >= minPct) return true;
  if (atr != null && atrMult != null && Math.abs(a - b) >= atr * atrMult) return true;
  return minPct <= 0;
}

export interface StructureParams {
  pivotLookback: number;
  minSwingDistancePct: number;
  confirmationCandles: number;
  closeConfirmation: boolean;
  wickInclusion: boolean;
  atrThresholdMult: number;
}

export function detectStructureAt(
  candles: OhlcvCandle[],
  bar: number,
  atrSeries: number[],
  kind: "higher_high" | "higher_low" | "lower_high" | "lower_low" | "bullish_structure" | "bearish_structure" | "break_of_structure" | "change_of_character",
  params: StructureParams
): boolean {
  if (bar < params.pivotLookback * 2 + 2) return false;
  const slice = candles.slice(0, bar + 1);
  const pivots = findPivots(slice, params.pivotLookback);
  const highs = pivots.filter((p) => p.kind === "high");
  const lows = pivots.filter((p) => p.kind === "low");
  const atr = atrSeries[bar] ?? 0;
  const minPct = params.minSwingDistancePct / 100;

  const lastTwoHighs = highs.slice(-2);
  const lastTwoLows = lows.slice(-2);

  const hh =
    lastTwoHighs.length === 2 &&
    lastTwoHighs[1].price > lastTwoHighs[0].price &&
    minDistOk(lastTwoHighs[1].price, lastTwoHighs[0].price, minPct, atr, params.atrThresholdMult);
  const hl =
    lastTwoLows.length === 2 &&
    lastTwoLows[1].price > lastTwoLows[0].price &&
    minDistOk(lastTwoLows[1].price, lastTwoLows[0].price, minPct, atr, params.atrThresholdMult);
  const lh =
    lastTwoHighs.length === 2 &&
    lastTwoHighs[1].price < lastTwoHighs[0].price &&
    minDistOk(lastTwoHighs[1].price, lastTwoHighs[0].price, minPct, atr, params.atrThresholdMult);
  const ll =
    lastTwoLows.length === 2 &&
    lastTwoLows[1].price < lastTwoLows[0].price &&
    minDistOk(lastTwoLows[1].price, lastTwoLows[0].price, minPct, atr, params.atrThresholdMult);

  const bullish = hh && hl;
  const bearish = lh && ll;

  let raw = false;
  switch (kind) {
    case "higher_high":
      raw = hh;
      break;
    case "higher_low":
      raw = hl;
      break;
    case "lower_high":
      raw = lh;
      break;
    case "lower_low":
      raw = ll;
      break;
    case "bullish_structure":
      raw = bullish;
      break;
    case "bearish_structure":
      raw = bearish;
      break;
    case "break_of_structure": {
      if (highs.length < 2 || lows.length < 2) return false;
      const prevHigh = highs[highs.length - 2].price;
      const prevLow = lows[lows.length - 2].price;
      const c = candles[bar];
      const price = params.closeConfirmation ? c.close : params.wickInclusion ? c.high : c.close;
      const priceLow = params.closeConfirmation ? c.close : params.wickInclusion ? c.low : c.close;
      raw = price > prevHigh || priceLow < prevLow;
      break;
    }
    case "change_of_character": {
      // ChoCH: prior bullish structure broken by LL, or prior bearish by HH
      if (bullish && ll) raw = true;
      else if (bearish && hh) raw = true;
      else raw = false;
      break;
    }
  }

  if (!raw) return false;
  const conf = Math.max(0, Math.floor(params.confirmationCandles));
  if (conf === 0) return true;
  // require structure still valid after confirmation candles (bar is already confirmation point)
  return bar >= conf;
}
