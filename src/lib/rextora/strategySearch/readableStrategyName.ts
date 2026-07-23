/**
 * Deterministic human-friendly strategy names from SafeV44 params.
 * No LLM. Never exposes hash / internal ids in the primary display name.
 */

import { CONTEXT_FALLBACK_PARAMS } from "../strategy/safeV44Params";
import type { SafeV44Params } from "../strategy/strategyTypes";

export type StrategyFamilyId =
  | "ema_trend"
  | "rsi_mean_reversion"
  | "volatility_breakout"
  | "mixed_safe";

export type StyleProfileId = "conservative" | "balanced" | "aggressive";

export interface ReadableStrategyIdentity {
  /** Operator display name, e.g. "EMA 추세 · 균형형". Never includes hash. */
  readableName: string;
  strategyFamily: StrategyFamilyId;
  strategyTypeLabelKo: string;
  styleProfile: StyleProfileId;
  styleLabelKo: string;
  /** Internal fingerprint only — never show in default UI. */
  suffix: string;
}

function num(v: unknown, fallback: number): number {
  return typeof v === "number" && Number.isFinite(v) ? v : fallback;
}

function bool(v: unknown, fallback: boolean): boolean {
  return typeof v === "boolean" ? v : fallback;
}

/**
 * Classify family from actual SafeV44 booleans / relative emphasis.
 */
export function classifySafeV44Family(
  params: Record<string, unknown>,
): StrategyFamilyId {
  const confirmBull = bool(
    params.confirm_bull,
    CONTEXT_FALLBACK_PARAMS.confirm_bull,
  );
  const breakMargin = num(
    params.break_margin,
    CONTEXT_FALLBACK_PARAMS.break_margin,
  );
  const pullback = num(
    params.pullback_max_dist,
    CONTEXT_FALLBACK_PARAMS.pullback_max_dist,
  );
  const baseBreak = CONTEXT_FALLBACK_PARAMS.break_margin;
  const basePull = CONTEXT_FALLBACK_PARAMS.pullback_max_dist;

  if (confirmBull || breakMargin > baseBreak * 1.05) {
    return "volatility_breakout";
  }
  if (pullback < basePull * 0.9) {
    return "rsi_mean_reversion";
  }
  const emaFast = num(params.ema_fast, CONTEXT_FALLBACK_PARAMS.ema_fast);
  const emaMid = num(params.ema_mid, CONTEXT_FALLBACK_PARAMS.ema_mid);
  if (emaFast < emaMid) {
    return "ema_trend";
  }
  return "mixed_safe";
}

function familyLabel(family: StrategyFamilyId): {
  name: string;
  typeKo: string;
} {
  switch (family) {
    case "volatility_breakout":
      return { name: "변동성 돌파", typeKo: "돌파" };
    case "rsi_mean_reversion":
      return { name: "RSI 되돌림", typeKo: "되돌림" };
    case "ema_trend":
      return { name: "EMA 추세", typeKo: "추세" };
    default:
      return { name: "SAFE 종합", typeKo: "종합" };
  }
}

/**
 * Map risk/exit emphasis to a simple style the operator can understand.
 */
export function classifyStyleProfile(
  params: Record<string, unknown>,
): StyleProfileId {
  const sl = num(params.sl_atr_mult, CONTEXT_FALLBACK_PARAMS.sl_atr_mult);
  const tp = num(params.tp_atr_mult, CONTEXT_FALLBACK_PARAMS.tp_atr_mult);
  const trail = bool(
    params.use_trailing,
    CONTEXT_FALLBACK_PARAMS.use_trailing,
  );
  const hold = num(
    params.max_hold_bars,
    CONTEXT_FALLBACK_PARAMS.max_hold_bars,
  );
  const ratio = sl > 0 ? tp / sl : 1;
  if (trail || ratio >= 1.6 || sl >= 2.2 || hold >= 72) {
    return "aggressive";
  }
  if (!trail && ratio <= 1.15 && sl <= 1.6 && hold <= 36) {
    return "conservative";
  }
  return "balanced";
}

function styleLabelKo(style: StyleProfileId): string {
  switch (style) {
    case "aggressive":
      return "공격형";
    case "conservative":
      return "보수형";
    default:
      return "균형형";
  }
}

/** Stable short suffix from paramsHash (internal only). */
export function shortHashSuffix(paramsHash: string): string {
  const clean = paramsHash.replace(/[^a-fA-F0-9]/g, "");
  if (clean.length >= 4) return clean.slice(-4).toLowerCase();
  return paramsHash.slice(0, 4) || "0000";
}

/**
 * Strip legacy hash suffixes like "(a95d)" from older readable names.
 */
export function stripTechnicalNameSuffix(name: string): string {
  return name
    .replace(/\s*\([a-fA-F0-9]{3,8}\)\s*$/g, "")
    .replace(/\s*·\s*ATR\s*(손절|트레일)\s*$/g, "")
    .trim();
}

export function buildReadableStrategyIdentity(
  params: Record<string, unknown>,
  paramsHash: string,
  opts?: { includeSuffix?: boolean },
): ReadableStrategyIdentity {
  const family = classifySafeV44Family(params);
  const { name, typeKo } = familyLabel(family);
  const style = classifyStyleProfile(params);
  const styleKo = styleLabelKo(style);
  const suffix = shortHashSuffix(paramsHash);
  // Default: human name only. Hash never shown in operator UI.
  const base = `${name} · ${styleKo}`;
  const readableName =
    opts?.includeSuffix === true ? `${base} (${suffix})` : base;
  return {
    readableName,
    strategyFamily: family,
    strategyTypeLabelKo: typeKo,
    styleProfile: style,
    styleLabelKo: styleKo,
    suffix,
  };
}

/** Plain-Korean rule summaries from SafeV44 params (deterministic). */
export function summarizeSafeV44Rules(
  params: Partial<SafeV44Params> | Record<string, unknown>,
): {
  entryKo: string;
  exitKo: string;
  stopLossKo: string;
  takeProfitKo: string;
  riskKo: string;
  indicatorsKo: string;
  directionKo: string;
} {
  const p = { ...CONTEXT_FALLBACK_PARAMS, ...params } as SafeV44Params;
  const longParts = [
    `EMA(${p.ema_fast}/${p.ema_mid}/${p.ema_slow}) 정배열`,
    `기울기≥${p.slope_min.toFixed(6)}`,
    `되돌림≤${p.pullback_max_dist.toFixed(4)}`,
    `RSI≤${p.rsi_max_long.toFixed(1)}`,
  ];
  if (p.confirm_bull) longParts.push("돌파 확인 롱");
  const shortParts = p.confirm_bear
    ? [`EMA 역배열`, `RSI≥${p.rsi_min_short.toFixed(1)}`, "확인 숏"]
    : ["숏 비활성"];

  return {
    entryKo: `롱: ${longParts.join(" · ")} / 숏: ${shortParts.join(" · ")}`,
    exitKo: p.use_trailing
      ? `트레일링 ATR×${p.trail_atr_mult.toFixed(3)} · 최대 보유 ${p.max_hold_bars}봉`
      : `목표·손절 도달 또는 최대 보유 ${p.max_hold_bars}봉`,
    stopLossKo: `ATR × ${p.sl_atr_mult.toFixed(3)}`,
    takeProfitKo: `ATR × ${p.tp_atr_mult.toFixed(3)}`,
    riskKo: p.use_dynamic_leverage
      ? `동적 레버리지 ${p.lev_min}–${p.lev_max} (기준 ${p.lev_base})`
      : `고정 위험 · 쿨다운 ${p.cooldown_bars}봉`,
    indicatorsKo: `EMA · RSI(${p.rsi_period}) · ATR(${p.atr_period}) · 거래량·저항 룩백`,
    directionKo: p.confirm_bear ? "롱·숏" : "롱 중심",
  };
}
