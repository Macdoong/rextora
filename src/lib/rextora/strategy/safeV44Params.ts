import type { SafeV44Params } from "./strategyTypes";

/**
 * Full SAFE_v44_i4060 trading parameters from operator context.
 * Used when locked research JSON is missing, or when the data strategy
 * file has a verified hash but incomplete params.
 */
export const CONTEXT_FALLBACK_PARAMS: SafeV44Params = {
  ema_fast: 20,
  ema_mid: 60,
  ema_slow: 200,
  rsi_period: 14,
  atr_period: 14,
  vol_lookback: 5,
  res_lookback: 24,
  slope_lookback: 29,
  slope_min: 0.0002183157527055703,
  pullback_max_dist: 0.05045575483968,
  vol_ratio_min: 1.25,
  max_atr_pct: 0.026490862793435842,
  min_room_to_resist: 0.012,
  confirm_bull: false,
  rsi_max_long: 75.19573150544439,
  break_lookback: 9,
  break_margin: 0.0009567973462357032,
  vol_ratio_min_break: 0.8432557589560703,
  max_atr_pct_break: 0.03613740954587826,
  confirm_bear: true,
  rsi_min_short: 19.5417882210621,
  sl_atr_mult: 1.8814680172969074,
  tp_atr_mult: 4.475374424448608,
  cooldown_bars: 2,
  allow_in_range: true,
  range_vol_ratio_min: 1.027255983428468,
  max_hold_bars: 5,
  use_trailing: true,
  trail_atr_mult: 4.185748185920124,
  use_vol_target: true,
  target_atr_pct: 0.017030312850789035,
  size_min: 0.8722924038040076,
  size_max: 1.327452679393273,
  use_dynamic_leverage: true,
  lev_min: 1.2,
  lev_base: 1.667409360218415,
  lev_max: 2.5,
  lev_atr_ok_max: 0.01001954461683031,
  lev_atr_too_high: 0.026965485866541215,
  lev_down_on_dd: -0.09446141586552376,
  lev_up_on_dd: -0.04698651466730082,
  risk_mult_cap: 2.5353685094966254,
  range_risk_mult: 0.6571670263493049,
  mark_to_market: true,
  base_bal_pct: 0.02,
  cost_guard: true,
  cost_guard_k: 3.0
};

export function mergeSafeParams(partial: Partial<SafeV44Params> | Record<string, unknown>): SafeV44Params {
  const merged = { ...CONTEXT_FALLBACK_PARAMS };
  for (const key of Object.keys(CONTEXT_FALLBACK_PARAMS) as Array<keyof SafeV44Params>) {
    if (partial[key] !== undefined && partial[key] !== null) {
      (merged as Record<string, unknown>)[key] = partial[key];
    }
  }
  return merged;
}
