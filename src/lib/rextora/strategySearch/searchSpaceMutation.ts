/**
 * Deterministic search-space range mutation from weakness analysis.
 * Only mutates numeric keys that already exist in the active ranges.
 */

import type { StrategySearchAdjustmentPlan } from "./weaknessAnalysis";
import type { StrategySearchParameterRange } from "./types";

export interface SearchSpaceMutationRecord {
  version: 1;
  appliedAt: string;
  weaknessCategories: string[];
  previousRanges: StrategySearchParameterRange[];
  mutatedRanges: StrategySearchParameterRange[];
  mutations: Array<{
    key: string;
    field: "min" | "max" | "step" | "defaultValue";
    from: number;
    to: number;
    reason: string;
  }>;
}

type MutationField = "min" | "max" | "step" | "defaultValue";

function cloneRanges(
  ranges: StrategySearchParameterRange[],
): StrategySearchParameterRange[] {
  return ranges.map((r) => ({
    ...r,
    enumValues: r.enumValues ? [...r.enumValues] : undefined,
  }));
}

function isNumericRange(r: StrategySearchParameterRange): boolean {
  if (r.valueType === "boolean" || r.valueType === "enum") return false;
  return typeof r.min === "number" && typeof r.max === "number";
}

function findIndex(
  ranges: StrategySearchParameterRange[],
  key: string,
): number {
  return ranges.findIndex((r) => r.key === key);
}

function setNumericField(
  ranges: StrategySearchParameterRange[],
  key: string,
  field: MutationField,
  nextValue: number,
  reason: string,
  mutations: SearchSpaceMutationRecord["mutations"],
): void {
  const idx = findIndex(ranges, key);
  if (idx < 0) return;
  const range = ranges[idx]!;
  if (!isNumericRange(range)) return;
  const current =
    field === "step"
      ? typeof range.step === "number"
        ? range.step
        : null
      : (range[field] as number);
  if (current == null || !Number.isFinite(current)) return;
  if (!Number.isFinite(nextValue)) return;
  if (current === nextValue) return;
  mutations.push({ key, field, from: current, to: nextValue, reason });
  if (field === "step") {
    ranges[idx] = { ...range, step: nextValue };
  } else {
    ranges[idx] = { ...range, [field]: nextValue };
  }
}

function clampMinMax(
  ranges: StrategySearchParameterRange[],
  mutations?: SearchSpaceMutationRecord["mutations"],
): void {
  for (let i = 0; i < ranges.length; i += 1) {
    const r = ranges[i]!;
    if (!isNumericRange(r)) continue;
    let min = r.min as number;
    let max = r.max as number;
    let next = r;
    if (min > max) {
      // Prefer keeping max; pull min down to max.
      min = max;
      next = { ...r, min: max };
      ranges[i] = next;
    }
    if (
      typeof next.defaultValue === "number" &&
      Number.isFinite(next.defaultValue)
    ) {
      const d = next.defaultValue;
      const clamped = Math.min(max, Math.max(min, d));
      if (clamped !== d) {
        ranges[i] = { ...next, defaultValue: clamped };
        mutations?.push({
          key: next.key,
          field: "defaultValue",
          from: d,
          to: clamped,
          reason:
            "normalize_defaults: keep defaultValue within mutated min/max",
        });
      }
    }
  }
}

function shrinkTowardMidpoint(
  ranges: StrategySearchParameterRange[],
  reason: string,
  mutations: SearchSpaceMutationRecord["mutations"],
): void {
  for (const r of ranges) {
    if (!isNumericRange(r)) continue;
    const min = r.min as number;
    const max = r.max as number;
    const mid = (min + max) / 2;
    const width = max - min;
    if (!(width > 0)) continue;
    const newMin = mid - width * 0.45;
    const newMax = mid + width * 0.45;
    setNumericField(ranges, r.key, "min", newMin, reason, mutations);
    setNumericField(ranges, r.key, "max", newMax, reason, mutations);
  }
}

function collectTriggers(
  adjustmentPlan: StrategySearchAdjustmentPlan | null | undefined,
  weaknessCategories: string[],
): Set<string> {
  const triggers = new Set<string>();
  for (const c of weaknessCategories) {
    if (c) triggers.add(c);
  }
  for (const action of adjustmentPlan?.actions ?? []) {
    if (action?.type) triggers.add(action.type);
  }
  return triggers;
}

/**
 * Apply deterministic numeric range mutations based on weakness categories
 * and adjustment-plan actions. Keys absent from `ranges` are left untouched.
 */
export function applySearchSpaceMutation(
  ranges: StrategySearchParameterRange[],
  adjustmentPlan: StrategySearchAdjustmentPlan | null | undefined,
  weaknessCategories: string[],
): { ranges: StrategySearchParameterRange[]; record: SearchSpaceMutationRecord } {
  const previousRanges = cloneRanges(ranges);
  const next = cloneRanges(ranges);
  const mutations: SearchSpaceMutationRecord["mutations"] = [];
  const triggers = collectTriggers(adjustmentPlan, weaknessCategories);

  const skipOnly =
    (triggers.has("advance_family") || triggers.has("continue_runtime")) &&
    ![
      "excessive_drawdown",
      "prefer_lower_mdd",
      "tighten_risk",
      "insufficient_trades",
      "prefer_more_trades",
      "widen_entry_filters",
      "excessive_trades",
      "prefer_fewer_trades",
      "fee_sensitive",
      "raise_cost_guard",
      "unstable_parameters",
      "jitter_failed",
    ].some((t) => triggers.has(t));

  if (!skipOnly) {
    if (
      triggers.has("excessive_drawdown") ||
      triggers.has("prefer_lower_mdd") ||
      triggers.has("tighten_risk")
    ) {
      const slIdx = findIndex(next, "sl_atr_mult");
      if (slIdx >= 0 && isNumericRange(next[slIdx]!)) {
        const max = next[slIdx]!.max as number;
        setNumericField(
          next,
          "sl_atr_mult",
          "max",
          max * 0.9,
          "tighten_risk: narrow stop-loss max",
          mutations,
        );
      }
      const tpIdx = findIndex(next, "tp_atr_mult");
      if (tpIdx >= 0 && isNumericRange(next[tpIdx]!)) {
        const min = next[tpIdx]!.min as number;
        setNumericField(
          next,
          "tp_atr_mult",
          "min",
          min * 1.05,
          "tighten_risk: raise take-profit min",
          mutations,
        );
      }
      const emaIdx = findIndex(next, "ema_fast");
      if (emaIdx >= 0 && isNumericRange(next[emaIdx]!)) {
        const max = next[emaIdx]!.max as number;
        const min = next[emaIdx]!.min as number;
        const shrunk = max - Math.max(1, (max - min) * 0.05);
        setNumericField(
          next,
          "ema_fast",
          "max",
          shrunk,
          "tighten_risk: shrink ema_fast max slightly",
          mutations,
        );
      }
    }

    if (
      triggers.has("insufficient_trades") ||
      triggers.has("prefer_more_trades") ||
      triggers.has("widen_entry_filters")
    ) {
      const rsiIdx = findIndex(next, "rsi_max_long");
      if (rsiIdx >= 0 && isNumericRange(next[rsiIdx]!)) {
        const max = next[rsiIdx]!.max as number;
        setNumericField(
          next,
          "rsi_max_long",
          "max",
          max * 1.1,
          "widen_entry_filters: raise rsi_max_long max",
          mutations,
        );
      }
      const volIdx = findIndex(next, "vol_ratio_min");
      if (volIdx >= 0 && isNumericRange(next[volIdx]!)) {
        const min = next[volIdx]!.min as number;
        setNumericField(
          next,
          "vol_ratio_min",
          "min",
          min * 0.9,
          "widen_entry_filters: lower vol_ratio_min min",
          mutations,
        );
      }
      const pbIdx = findIndex(next, "pullback_max_dist");
      if (pbIdx >= 0 && isNumericRange(next[pbIdx]!)) {
        const max = next[pbIdx]!.max as number;
        setNumericField(
          next,
          "pullback_max_dist",
          "max",
          max * 1.1,
          "widen_entry_filters: widen pullback_max_dist max",
          mutations,
        );
      }
    }

    if (
      triggers.has("excessive_trades") ||
      triggers.has("prefer_fewer_trades")
    ) {
      const volIdx = findIndex(next, "vol_ratio_min");
      if (volIdx >= 0 && isNumericRange(next[volIdx]!)) {
        const min = next[volIdx]!.min as number;
        setNumericField(
          next,
          "vol_ratio_min",
          "min",
          min * 1.1,
          "prefer_fewer_trades: raise vol_ratio_min min",
          mutations,
        );
      }
      const cdIdx = findIndex(next, "cooldown_bars");
      if (cdIdx >= 0 && isNumericRange(next[cdIdx]!)) {
        const min = next[cdIdx]!.min as number;
        setNumericField(
          next,
          "cooldown_bars",
          "min",
          Math.max(min + 1, min * 1.1),
          "prefer_fewer_trades: raise cooldown_bars min",
          mutations,
        );
      }
    }

    if (triggers.has("fee_sensitive") || triggers.has("raise_cost_guard")) {
      const cgIdx = findIndex(next, "cost_guard_k");
      if (cgIdx >= 0 && isNumericRange(next[cgIdx]!)) {
        const min = next[cgIdx]!.min as number;
        setNumericField(
          next,
          "cost_guard_k",
          "min",
          min * 1.1,
          "raise_cost_guard: raise cost_guard_k min",
          mutations,
        );
      }
      const volIdx = findIndex(next, "vol_ratio_min");
      if (volIdx >= 0 && isNumericRange(next[volIdx]!)) {
        const min = next[volIdx]!.min as number;
        setNumericField(
          next,
          "vol_ratio_min",
          "min",
          min * 1.05,
          "raise_cost_guard: raise vol_ratio_min",
          mutations,
        );
      }
    }

    if (
      triggers.has("unstable_parameters") ||
      triggers.has("jitter_failed")
    ) {
      shrinkTowardMidpoint(
        next,
        "unstable_parameters: shrink ranges 10% toward midpoint",
        mutations,
      );
    }
  }

  clampMinMax(next, mutations);

  const record: SearchSpaceMutationRecord = {
    version: 1,
    appliedAt: new Date().toISOString(),
    weaknessCategories: [...weaknessCategories],
    previousRanges,
    mutatedRanges: cloneRanges(next),
    mutations,
  };

  return { ranges: next, record };
}
