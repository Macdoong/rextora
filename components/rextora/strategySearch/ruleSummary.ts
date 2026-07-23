/**
 * Client-safe Korean rule summaries for SafeV44 params.
 * Mirrors server readableStrategyName.summarizeSafeV44Rules — no server imports.
 */

const FALLBACK = {
  ema_fast: 20,
  ema_mid: 60,
  ema_slow: 200,
  rsi_period: 14,
  atr_period: 14,
  slope_min: 0.0002,
  pullback_max_dist: 0.05,
  rsi_max_long: 75,
  rsi_min_short: 20,
  confirm_bull: false,
  confirm_bear: true,
  sl_atr_mult: 1.88,
  tp_atr_mult: 2.5,
  use_trailing: false,
  trail_atr_mult: 1.5,
  max_hold_bars: 48,
  cooldown_bars: 2,
  use_dynamic_leverage: false,
  lev_min: 1,
  lev_max: 5,
  lev_base: 2,
};

function n(params: Record<string, unknown>, key: string, fb: number): number {
  const v = params[key];
  return typeof v === "number" && Number.isFinite(v) ? v : fb;
}

function b(params: Record<string, unknown>, key: string, fb: boolean): boolean {
  const v = params[key];
  return typeof v === "boolean" ? v : fb;
}

export function summarizeRulesKo(params: Record<string, unknown> | null): {
  entryKo: string;
  exitKo: string;
  stopLossKo: string;
  takeProfitKo: string;
  riskKo: string;
  indicatorsKo: string;
  directionKo: string;
} | null {
  if (!params || Object.keys(params).length === 0) return null;
  const emaFast = n(params, "ema_fast", FALLBACK.ema_fast);
  const emaMid = n(params, "ema_mid", FALLBACK.ema_mid);
  const emaSlow = n(params, "ema_slow", FALLBACK.ema_slow);
  const slope = n(params, "slope_min", FALLBACK.slope_min);
  const pull = n(params, "pullback_max_dist", FALLBACK.pullback_max_dist);
  const rsiMax = n(params, "rsi_max_long", FALLBACK.rsi_max_long);
  const rsiMin = n(params, "rsi_min_short", FALLBACK.rsi_min_short);
  const rsiPeriod = n(params, "rsi_period", FALLBACK.rsi_period);
  const atrPeriod = n(params, "atr_period", FALLBACK.atr_period);
  const confirmBull = b(params, "confirm_bull", FALLBACK.confirm_bull);
  const confirmBear = b(params, "confirm_bear", FALLBACK.confirm_bear);
  const sl = n(params, "sl_atr_mult", FALLBACK.sl_atr_mult);
  const tp = n(params, "tp_atr_mult", FALLBACK.tp_atr_mult);
  const trail = b(params, "use_trailing", FALLBACK.use_trailing);
  const trailMult = n(params, "trail_atr_mult", FALLBACK.trail_atr_mult);
  const maxHold = n(params, "max_hold_bars", FALLBACK.max_hold_bars);
  const cooldown = n(params, "cooldown_bars", FALLBACK.cooldown_bars);
  const dynLev = b(params, "use_dynamic_leverage", FALLBACK.use_dynamic_leverage);

  const longParts = [
    `EMA(${emaFast}/${emaMid}/${emaSlow}) 정배열`,
    `기울기 ≥ ${slope.toFixed(5)}`,
    `되돌림 ≤ ${pull.toFixed(4)}`,
    `RSI ≤ ${rsiMax.toFixed(0)}`,
  ];
  if (confirmBull) longParts.push("돌파 확인 롱");
  const shortParts = confirmBear
    ? [`EMA 역배열`, `RSI ≥ ${rsiMin.toFixed(0)}`, "확인 숏"]
    : ["숏 비활성"];

  return {
    entryKo: `롱: ${longParts.join(" · ")} / 숏: ${shortParts.join(" · ")}`,
    exitKo: trail
      ? `트레일 ATR×${trailMult.toFixed(2)} · 최대 ${maxHold}봉`
      : `목표가·손절 또는 최대 ${maxHold}봉`,
    stopLossKo: `ATR × ${sl.toFixed(2)}`,
    takeProfitKo: `ATR × ${tp.toFixed(2)}`,
    riskKo: dynLev
      ? `동적 레버리지 · 쿨다운 ${cooldown}봉`
      : `고정 위험 · 쿨다운 ${cooldown}봉`,
    indicatorsKo: `EMA · RSI(${rsiPeriod}) · ATR(${atrPeriod})`,
    directionKo: confirmBear ? "롱·숏" : "롱 중심",
  };
}
