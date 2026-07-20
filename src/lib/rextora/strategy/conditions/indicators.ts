import { computeAtrSeries, computeEmaSeries, computeRsiSeries } from "../../indicator/indicatorEngine";
import type { OhlcvCandle } from "../../data/ohlcvTypes";
import type { ComparisonOp } from "../definition/types";

/** SMA — additive helper; does not alter SAFE indicator path. */
export function computeSmaSeries(values: number[], period: number): number[] {
  const out = new Array(values.length).fill(0);
  const p = Math.max(1, Math.floor(period));
  let sum = 0;
  for (let i = 0; i < values.length; i += 1) {
    sum += values[i];
    if (i >= p) sum -= values[i - p];
    out[i] = i >= p - 1 ? sum / p : sum / (i + 1);
  }
  return out;
}

/** Session VWAP approximation from OHLCV typical price * volume cumulative. */
export function computeVwapSeries(candles: OhlcvCandle[]): number[] {
  const out = new Array(candles.length).fill(0);
  let cumPv = 0;
  let cumV = 0;
  for (let i = 0; i < candles.length; i += 1) {
    const tp = (candles[i].high + candles[i].low + candles[i].close) / 3;
    cumPv += tp * candles[i].volume;
    cumV += candles[i].volume;
    out[i] = cumV > 0 ? cumPv / cumV : tp;
  }
  return out;
}

/** Rate of change % over lookback. */
export function computeRocSeries(closes: number[], lookback: number): number[] {
  const lb = Math.max(1, Math.floor(lookback));
  return closes.map((c, i) => {
    if (i < lb) return 0;
    const prev = closes[i - lb];
    return prev === 0 ? 0 : ((c - prev) / prev) * 100;
  });
}

export function compareValues(
  series: number[],
  bar: number,
  comparison: ComparisonOp,
  value: number | [number, number] | boolean | null,
  price?: number
): boolean {
  if (bar < 1 || bar >= series.length) return false;
  const cur = series[bar];
  const prev = series[bar - 1];
  const lhs = price ?? cur;

  switch (comparison) {
    case "above":
    case "gt":
      return lhs > (typeof value === "number" ? value : cur);
    case "below":
    case "lt":
      return lhs < (typeof value === "number" ? value : cur);
    case "cross_above":
      return prev <= (typeof value === "number" ? value : series[bar]) && cur > (typeof value === "number" ? value : prev);
    case "cross_below":
      return prev >= (typeof value === "number" ? value : series[bar]) && cur < (typeof value === "number" ? value : prev);
    case "between":
      return Array.isArray(value) && lhs >= value[0] && lhs <= value[1];
    case "increasing":
      return cur > prev;
    case "decreasing":
      return cur < prev;
    case "equals":
      return Math.abs(lhs - (typeof value === "number" ? value : 0)) < 1e-9;
    case "true":
      return Boolean(value ?? true) && cur === cur;
    default:
      return false;
  }
}

export function buildIndicatorSeries(
  candles: OhlcvCandle[],
  type: "sma" | "ema" | "rsi" | "atr" | "vwap" | "roc" | "volume",
  period: number
): number[] {
  const closes = candles.map((c) => c.close);
  const highs = candles.map((c) => c.high);
  const lows = candles.map((c) => c.low);
  const vols = candles.map((c) => c.volume);
  switch (type) {
    case "sma":
      return computeSmaSeries(closes, period);
    case "ema":
      return computeEmaSeries(closes, period);
    case "rsi":
      return computeRsiSeries(closes, period);
    case "atr":
      return computeAtrSeries(highs, lows, closes, period);
    case "vwap":
      return computeVwapSeries(candles);
    case "roc":
      return computeRocSeries(closes, period);
    case "volume":
      return vols;
    default:
      return closes;
  }
}
