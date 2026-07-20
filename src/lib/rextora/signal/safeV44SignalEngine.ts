import type { IndicatorSnapshot, IndicatorSeries } from "../indicator/indicatorEngine";
import type { SafeV44Params } from "../strategy/strategyTypes";

export type SignalSide = "LONG" | "SHORT" | "NONE";
export type SignalType =
  | "trend_long"
  | "breakout_long"
  | "range_long"
  | "trend_short"
  | "breakout_short"
  | "none";

export interface SafeV44SignalResult {
  symbol: string;
  side: SignalSide;
  signalType: SignalType;
  passed: boolean;
  score: number;
  entryReason: string;
  rejectReason: string | null;
  indicators: IndicatorSnapshot | null;
  paramsHash: string;
  cooldownActive: boolean;
  inRange: boolean;
}

export interface SignalEngineInput {
  symbol: string;
  series: IndicatorSeries;
  params: SafeV44Params;
  paramsHash: string;
  barIndex?: number;
  lastEntryBarIndex?: number | null;
}

function isBullStack(ind: IndicatorSnapshot): boolean {
  return ind.emaFast > ind.emaMid && ind.emaMid > ind.emaSlow && ind.close > ind.emaSlow;
}

function isBearStack(ind: IndicatorSnapshot): boolean {
  return ind.emaFast < ind.emaMid && ind.emaMid < ind.emaSlow && ind.close < ind.emaSlow;
}

function isRange(ind: IndicatorSnapshot): boolean {
  const midBand = Math.abs(ind.emaFast - ind.emaMid) / Math.max(ind.close, 1e-9);
  return midBand < 0.01 && !isBullStack(ind) && !isBearStack(ind);
}

function scoreFrom(ind: IndicatorSnapshot, side: SignalSide): number {
  const slopeBoost = Math.min(20, Math.abs(ind.slope) * 10000);
  const volBoost = Math.min(20, Math.max(0, (ind.volumeRatio - 1) * 20));
  const atrPenalty = Math.min(15, ind.atrPct * 400);
  const base = side === "NONE" ? 0 : 55 + slopeBoost + volBoost - atrPenalty;
  return Number(Math.max(0, Math.min(100, base)).toFixed(2));
}

export function evaluateSafeV44Signal(input: SignalEngineInput): SafeV44SignalResult {
  const { symbol, series, params, paramsHash } = input;
  const idx = input.barIndex ?? (series.snapshots.length ? series.snapshots.length - 1 : -1);
  const ind = idx >= 0 ? series.snapshots[idx] : null;

  const base = {
    symbol,
    indicators: ind,
    paramsHash,
    cooldownActive: false,
    inRange: false
  };

  if (!ind || idx < params.ema_slow) {
    return {
      ...base,
      side: "NONE",
      signalType: "none",
      passed: false,
      score: 0,
      entryReason: "",
      rejectReason: "지표 워밍업 부족"
    };
  }

  const lastEntry = input.lastEntryBarIndex ?? null;
  const cooldownActive =
    lastEntry !== null && lastEntry >= 0 && idx - lastEntry < params.cooldown_bars;
  const inRange = isRange(ind);

  if (cooldownActive) {
    return {
      ...base,
      side: "NONE",
      signalType: "none",
      passed: false,
      score: scoreFrom(ind, "NONE"),
      entryReason: "",
      rejectReason: `쿨다운 중 (${params.cooldown_bars} bars)`,
      cooldownActive: true,
      inRange
    };
  }

  // --- Breakout long ---
  const breakoutLong =
    ind.close > ind.breakoutHigh * (1 + params.break_margin) &&
    ind.volumeRatio >= params.vol_ratio_min_break &&
    ind.atrPct <= params.max_atr_pct_break &&
    (!params.confirm_bull || ind.close >= ind.emaFast);

  if (breakoutLong) {
    return {
      ...base,
      side: "LONG",
      signalType: "breakout_long",
      passed: true,
      score: scoreFrom(ind, "LONG"),
      entryReason: "돌파 롱: 고점 돌파 + 거래량/ATR 조건 충족",
      rejectReason: null,
      cooldownActive,
      inRange
    };
  }

  // --- Breakout short ---
  const breakoutShort =
    params.confirm_bear &&
    ind.close < ind.breakoutLow * (1 - params.break_margin) &&
    ind.volumeRatio >= params.vol_ratio_min_break &&
    ind.atrPct <= params.max_atr_pct_break &&
    ind.rsi >= params.rsi_min_short;

  if (breakoutShort) {
    return {
      ...base,
      side: "SHORT",
      signalType: "breakout_short",
      passed: true,
      score: scoreFrom(ind, "SHORT"),
      entryReason: "돌파 숏: 저점 돌파 + 확인/RSI 조건 충족",
      rejectReason: null,
      cooldownActive,
      inRange
    };
  }

  // --- Trend pullback long ---
  const trendLong =
    isBullStack(ind) &&
    ind.slope >= params.slope_min &&
    ind.pullbackDist <= params.pullback_max_dist &&
    ind.volumeRatio >= params.vol_ratio_min &&
    ind.atrPct <= params.max_atr_pct &&
    ind.roomToResist >= params.min_room_to_resist &&
    ind.rsi <= params.rsi_max_long &&
    (!params.confirm_bull || ind.close > ind.emaMid);

  if (trendLong) {
    return {
      ...base,
      side: "LONG",
      signalType: "trend_long",
      passed: true,
      score: scoreFrom(ind, "LONG"),
      entryReason: "추세 롱: EMA 정배열 + 기울기/되돌림/거래량/ATR/저항여유/RSI",
      rejectReason: null,
      cooldownActive,
      inRange
    };
  }

  // --- Trend short ---
  const trendShort =
    params.confirm_bear &&
    isBearStack(ind) &&
    ind.slope <= -params.slope_min &&
    ind.pullbackDist <= params.pullback_max_dist &&
    ind.volumeRatio >= params.vol_ratio_min &&
    ind.atrPct <= params.max_atr_pct &&
    ind.rsi >= params.rsi_min_short;

  if (trendShort) {
    return {
      ...base,
      side: "SHORT",
      signalType: "trend_short",
      passed: true,
      score: scoreFrom(ind, "SHORT"),
      entryReason: "추세 숏: EMA 역배열 + 확인/기울기/되돌림/거래량/ATR/RSI",
      rejectReason: null,
      cooldownActive,
      inRange
    };
  }

  // --- Range long (optional) ---
  const rangeLong =
    params.allow_in_range &&
    inRange &&
    ind.volumeRatio >= params.range_vol_ratio_min &&
    ind.atrPct <= params.max_atr_pct &&
    ind.rsi <= params.rsi_max_long &&
    ind.close >= ind.emaFast;

  if (rangeLong) {
    return {
      ...base,
      side: "LONG",
      signalType: "range_long",
      passed: true,
      score: scoreFrom(ind, "LONG") * 0.9,
      entryReason: "레인지 롱: allow_in_range + 거래량 조건",
      rejectReason: null,
      cooldownActive,
      inRange: true
    };
  }

  let rejectReason = "전략 조건 미충족";
  if (ind.atrPct > params.max_atr_pct) rejectReason = "ATR% 과다";
  else if (ind.volumeRatio < params.vol_ratio_min) rejectReason = "거래량 비율 부족";
  else if (isBullStack(ind) && ind.roomToResist < params.min_room_to_resist) rejectReason = "저항까지 여유 부족";
  else if (isBullStack(ind) && ind.rsi > params.rsi_max_long) rejectReason = "RSI 롱 상한 초과";

  return {
    ...base,
    side: "NONE",
    signalType: "none",
    passed: false,
    score: scoreFrom(ind, "NONE"),
    entryReason: "",
    rejectReason,
    cooldownActive,
    inRange
  };
}
