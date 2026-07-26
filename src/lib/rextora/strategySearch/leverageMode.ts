/**
 * Apply operator leverage mode onto SafeV44 lev_* params.
 * Modes are stored on the search plan; this is the only place that
 * rewrites use_dynamic_leverage / lev_min / lev_base / lev_max for Search.
 */

import type { SafeV44Params } from "../strategy/strategyTypes";
import type { StrategySearchParameterRange } from "./types";

export type LeverageModeId =
  | "automatic"
  | "fixed"
  | "range"
  | "disabled";

export interface LeverageModePolicy {
  leverageMode?: LeverageModeId | null;
  leverageMin?: number | null;
  leverageMax?: number | null;
  leverageFixed?: number | null;
  adaptiveLeverageEnabled?: boolean | null;
}

const LEV_KEYS = ["lev_min", "lev_base", "lev_max", "use_dynamic_leverage"] as const;

function clampLev(n: number): number {
  if (!Number.isFinite(n)) return 1;
  return Math.max(1, n);
}

export function resolveLeverageMode(
  policy: LeverageModePolicy | null | undefined,
): LeverageModeId {
  const raw = policy?.leverageMode;
  if (
    raw === "automatic" ||
    raw === "fixed" ||
    raw === "range" ||
    raw === "disabled"
  ) {
    return raw;
  }
  if (policy?.adaptiveLeverageEnabled === true) return "automatic";
  return "automatic";
}

/**
 * Rewrite SafeV44 leverage fields according to operator mode.
 * Returns a shallow copy; does not mutate input.
 */
export function applyLeverageModeToParams(
  base: SafeV44Params | Record<string, unknown>,
  policy: LeverageModePolicy | null | undefined,
): SafeV44Params {
  const mode = resolveLeverageMode(policy);
  const next = { ...(base as SafeV44Params) };
  const fixed = clampLev(Number(policy?.leverageFixed ?? 1));
  const min = clampLev(Number(policy?.leverageMin ?? 1));
  const max = clampLev(Number(policy?.leverageMax ?? Math.max(min, 5)));
  const hi = Math.max(min, max);
  const lo = Math.min(min, max);

  switch (mode) {
    case "disabled":
      next.use_dynamic_leverage = false;
      next.lev_min = 1;
      next.lev_base = 1;
      next.lev_max = 1;
      break;
    case "fixed":
      next.use_dynamic_leverage = false;
      next.lev_min = fixed;
      next.lev_base = fixed;
      next.lev_max = fixed;
      break;
    case "automatic":
      next.use_dynamic_leverage = true;
      next.lev_min = lo;
      next.lev_max = hi;
      next.lev_base = Math.min(hi, Math.max(lo, (lo + hi) / 2));
      break;
    case "range":
      next.use_dynamic_leverage = false;
      next.lev_min = lo;
      next.lev_max = hi;
      next.lev_base = Math.min(hi, Math.max(lo, (lo + hi) / 2));
      break;
  }
  return next;
}

/** True when Search must mutate lev_* within min..max. */
export function leverageModeMutatesLev(
  policy: LeverageModePolicy | null | undefined,
): boolean {
  return resolveLeverageMode(policy) === "range";
}

/**
 * Ranges to include for leverage SEARCH (range mode only).
 * Pins lev_min/max via baseParams; only lev_base is mutated inside the band.
 */
export function leverageSearchRanges(
  policy: LeverageModePolicy | null | undefined,
): StrategySearchParameterRange[] {
  if (!leverageModeMutatesLev(policy)) return [];
  const min = clampLev(Number(policy?.leverageMin ?? 1));
  const max = clampLev(Number(policy?.leverageMax ?? Math.max(min, 5)));
  const lo = Math.min(min, max);
  const hi = Math.max(min, max);
  const mid = (lo + hi) / 2;
  const step = hi - lo >= 2 ? 0.5 : Math.max(0.1, (hi - lo) / 10);
  return [
    {
      key: "lev_base",
      min: lo,
      max: hi,
      step,
      valueType: "float",
      defaultValue: mid,
    },
  ];
}

/** Strip lev keys from ranges unless range mode is active. */
export function filterRangesForLeverageMode(
  ranges: StrategySearchParameterRange[],
  policy: LeverageModePolicy | null | undefined,
): StrategySearchParameterRange[] {
  const mode = resolveLeverageMode(policy);
  if (mode === "range") {
    const withoutLev = ranges.filter(
      (r) => !LEV_KEYS.includes(r.key as (typeof LEV_KEYS)[number]),
    );
    return [...withoutLev, ...leverageSearchRanges(policy)];
  }
  return ranges.filter(
    (r) => !LEV_KEYS.includes(r.key as (typeof LEV_KEYS)[number]),
  );
}

export function describeLeverageFromParams(
  params: Record<string, unknown> | SafeV44Params | null | undefined,
): string {
  if (!params || typeof params !== "object") return "—";
  const dynamic = Boolean(
    (params as { use_dynamic_leverage?: boolean }).use_dynamic_leverage,
  );
  const min = Number((params as { lev_min?: number }).lev_min);
  const base = Number((params as { lev_base?: number }).lev_base);
  const max = Number((params as { lev_max?: number }).lev_max);
  if (dynamic) {
    const lo = Number.isFinite(min) ? min : 1;
    const hi = Number.isFinite(max) ? max : lo;
    return `자동 ${lo.toFixed(1)}–${hi.toFixed(1)}x`;
  }
  if (
    Number.isFinite(base) &&
    Number.isFinite(min) &&
    Number.isFinite(max) &&
    min === max &&
    min === base
  ) {
    if (base <= 1) return "레버리지 없음 (1x)";
    return `고정 ${base.toFixed(1)}x`;
  }
  if (Number.isFinite(min) && Number.isFinite(max) && min !== max) {
    return `범위 ${min.toFixed(1)}–${max.toFixed(1)}x`;
  }
  if (Number.isFinite(base)) return `${base.toFixed(1)}x`;
  return "—";
}

/**
 * Resolve trade leverage for event-sequence / pattern Search.
 * Uses the same lev_* / use_dynamic_leverage fields as SafeV44 modes.
 */
export function resolveEventSequenceLeverage(input: {
  params?: Record<string, unknown> | null;
  atr: number;
  price: number;
  peakEquity?: number;
  equity?: number;
}): number {
  const p = input.params ?? {};
  const hasLev =
    p.lev_base != null ||
    p.lev_min != null ||
    p.lev_max != null ||
    p.use_dynamic_leverage != null;
  if (!hasLev) return 1;

  const levMin = clampLev(Number(p.lev_min ?? 1));
  const levMax = clampLev(Number(p.lev_max ?? levMin));
  const lo = Math.min(levMin, levMax);
  const hi = Math.max(levMin, levMax);
  let levBase = Number(p.lev_base);
  if (!Number.isFinite(levBase)) levBase = (lo + hi) / 2;
  levBase = Math.min(hi, Math.max(lo, levBase));
  const useDyn = Boolean(p.use_dynamic_leverage);

  if (!useDyn) return Number(levBase.toFixed(4));

  const price = input.price > 0 ? input.price : 1;
  const atrPct = Math.max(0, input.atr) / price;
  const atrOk = Number(p.lev_atr_ok_max ?? 0.008);
  const atrHigh = Number(p.lev_atr_too_high ?? 0.025);
  let leverage = levBase;
  if (atrPct <= atrOk) {
    leverage = hi;
  } else if (atrPct >= atrHigh) {
    leverage = lo;
  } else {
    const t =
      (atrPct - atrOk) / Math.max(1e-9, atrHigh - atrOk);
    leverage = hi + (lo - hi) * t;
  }

  const peak = input.peakEquity;
  const equity = input.equity;
  if (
    peak != null &&
    equity != null &&
    peak > 0 &&
    Number.isFinite(peak) &&
    Number.isFinite(equity)
  ) {
    const dd = (equity - peak) / peak;
    const downOnDd = Number(p.lev_down_on_dd ?? -0.08);
    const upOnDd = Number(p.lev_up_on_dd ?? 0.02);
    if (dd <= downOnDd) {
      leverage = Math.min(leverage, lo);
    } else if (dd >= upOnDd) {
      leverage = Math.min(hi, leverage * 1.05);
    }
  }

  return Number(Math.min(hi, Math.max(lo, leverage)).toFixed(4));
}
