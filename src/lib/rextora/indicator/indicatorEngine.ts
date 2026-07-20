import type { OhlcvCandle } from "../data/ohlcvTypes";
import type { SafeV44Params } from "../strategy/strategyTypes";

export interface IndicatorSnapshot {
  emaFast: number;
  emaMid: number;
  emaSlow: number;
  rsi: number;
  atr: number;
  atrPct: number;
  volumeRatio: number;
  resistanceHigh: number;
  slope: number;
  breakoutHigh: number;
  breakoutLow: number;
  roomToResist: number;
  pullbackDist: number;
  close: number;
  volume: number;
  barIndex: number;
}

export interface IndicatorSeries {
  emaFast: number[];
  emaMid: number[];
  emaSlow: number[];
  rsi: number[];
  atr: number[];
  atrPct: number[];
  volumeRatio: number[];
  resistanceHigh: number[];
  slope: number[];
  breakoutHigh: number[];
  breakoutLow: number[];
  snapshots: IndicatorSnapshot[];
  latest: IndicatorSnapshot | null;
}

export function computeEmaSeries(values: number[], period: number): number[] {
  if (values.length === 0) return [];
  const k = 2 / (period + 1);
  const out: number[] = new Array(values.length);
  out[0] = values[0];
  for (let i = 1; i < values.length; i += 1) {
    out[i] = values[i] * k + out[i - 1] * (1 - k);
  }
  return out;
}

export function computeRsiSeries(closes: number[], period = 14): number[] {
  const out = new Array(closes.length).fill(50);
  if (closes.length <= period) return out;

  let avgGain = 0;
  let avgLoss = 0;
  for (let i = 1; i <= period; i += 1) {
    const diff = closes[i] - closes[i - 1];
    if (diff >= 0) avgGain += diff;
    else avgLoss -= diff;
  }
  avgGain /= period;
  avgLoss /= period;
  out[period] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);

  for (let i = period + 1; i < closes.length; i += 1) {
    const diff = closes[i] - closes[i - 1];
    const gain = diff > 0 ? diff : 0;
    const loss = diff < 0 ? -diff : 0;
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
    out[i] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  }
  return out;
}

export function computeAtrSeries(highs: number[], lows: number[], closes: number[], period = 14): number[] {
  const out = new Array(closes.length).fill(0);
  if (closes.length < 2) return out;

  const trs: number[] = [0];
  for (let i = 1; i < closes.length; i += 1) {
    trs.push(
      Math.max(highs[i] - lows[i], Math.abs(highs[i] - closes[i - 1]), Math.abs(lows[i] - closes[i - 1]))
    );
  }

  let sum = 0;
  for (let i = 1; i < trs.length; i += 1) {
    sum += trs[i];
    if (i < period) {
      out[i] = sum / i;
    } else if (i === period) {
      out[i] = sum / period;
    } else {
      out[i] = (out[i - 1] * (period - 1) + trs[i]) / period;
    }
  }
  return out;
}

export function computeVolumeRatioSeries(volumes: number[], lookback: number): number[] {
  const out = new Array(volumes.length).fill(0);
  for (let i = 0; i < volumes.length; i += 1) {
    const start = Math.max(0, i - lookback + 1);
    const slice = volumes.slice(start, i + 1);
    const avg = slice.reduce((a, b) => a + b, 0) / slice.length;
    out[i] = avg === 0 ? 0 : volumes[i] / avg;
  }
  return out;
}

export function computeResistanceHighSeries(highs: number[], lookback: number): number[] {
  const out = new Array(highs.length).fill(0);
  for (let i = 0; i < highs.length; i += 1) {
    const start = Math.max(0, i - lookback + 1);
    out[i] = Math.max(...highs.slice(start, i + 1));
  }
  return out;
}

export function computeSlopeSeries(values: number[], lookback: number): number[] {
  const out = new Array(values.length).fill(0);
  for (let i = 0; i < values.length; i += 1) {
    if (i < lookback) {
      out[i] = 0;
      continue;
    }
    const prev = values[i - lookback];
    out[i] = prev === 0 ? 0 : (values[i] - prev) / prev;
  }
  return out;
}

export function computeBreakoutLevelSeries(values: number[], lookback: number, mode: "high" | "low"): number[] {
  const out = new Array(values.length).fill(0);
  for (let i = 0; i < values.length; i += 1) {
    if (i === 0) {
      out[i] = values[i];
      continue;
    }
    const start = Math.max(0, i - lookback);
    const slice = values.slice(start, i); // exclude current bar
    out[i] = slice.length === 0 ? values[i] : mode === "high" ? Math.max(...slice) : Math.min(...slice);
  }
  return out;
}

export function computeIndicators(candles: OhlcvCandle[], params: SafeV44Params): IndicatorSeries {
  const closes = candles.map((c) => c.close);
  const highs = candles.map((c) => c.high);
  const lows = candles.map((c) => c.low);
  const volumes = candles.map((c) => c.volume);

  const emaFast = computeEmaSeries(closes, params.ema_fast);
  const emaMid = computeEmaSeries(closes, params.ema_mid);
  const emaSlow = computeEmaSeries(closes, params.ema_slow);
  const rsi = computeRsiSeries(closes, params.rsi_period);
  const atr = computeAtrSeries(highs, lows, closes, params.atr_period);
  const atrPct = atr.map((v, i) => (closes[i] === 0 ? 0 : v / closes[i]));
  const volumeRatio = computeVolumeRatioSeries(volumes, params.vol_lookback);
  const resistanceHigh = computeResistanceHighSeries(highs, params.res_lookback);
  const slope = computeSlopeSeries(emaMid, params.slope_lookback);
  const breakoutHigh = computeBreakoutLevelSeries(highs, params.break_lookback, "high");
  const breakoutLow = computeBreakoutLevelSeries(lows, params.break_lookback, "low");

  const snapshots: IndicatorSnapshot[] = candles.map((c, i) => {
    const roomToResist = closes[i] === 0 ? 0 : (resistanceHigh[i] - closes[i]) / closes[i];
    const pullbackDist = emaFast[i] === 0 ? 0 : Math.abs(closes[i] - emaFast[i]) / emaFast[i];
    return {
      emaFast: emaFast[i],
      emaMid: emaMid[i],
      emaSlow: emaSlow[i],
      rsi: rsi[i],
      atr: atr[i],
      atrPct: atrPct[i],
      volumeRatio: volumeRatio[i],
      resistanceHigh: resistanceHigh[i],
      slope: slope[i],
      breakoutHigh: breakoutHigh[i],
      breakoutLow: breakoutLow[i],
      roomToResist,
      pullbackDist,
      close: c.close,
      volume: c.volume,
      barIndex: i
    };
  });

  return {
    emaFast,
    emaMid,
    emaSlow,
    rsi,
    atr,
    atrPct,
    volumeRatio,
    resistanceHigh,
    slope,
    breakoutHigh,
    breakoutLow,
    snapshots,
    latest: snapshots.length ? snapshots[snapshots.length - 1] : null
  };
}
