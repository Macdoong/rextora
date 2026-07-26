/**
 * Apply operator pattern configuration onto pattern search ranges / base params.
 * Deterministic adjustments only — never invents unknown parameter keys.
 */

import type { StrategySearchParameterRange } from "./types";

export type PatternConfigLevel = "automatic" | "basic" | "expert";

export interface PatternOperatorConfig {
  patternConfigLevel: PatternConfigLevel;
  patternDirection: "both" | "long" | "short";
  patternRetestMode: "required" | "optional" | "disabled";
  patternConfirmStrength: "standard" | "strict";
  /** Maps to requireCloseInDirection — engine has no multi-candle confirm count. */
  patternConfirmClose: "required" | "disabled";
  patternExpiryBars: number;
  patternRiskStyle: "conservative" | "balanced" | "aggressive";
  /** Adjusts zoneLookback / touch / gap keys when present in ranges. */
  patternStrength: "loose" | "standard" | "strict";
  /** Adjusts tolerancePct / zoneWidthPct when present (SR / trendline). */
  patternSrSensitivity: "tight" | "standard" | "loose";
}

export interface PatternOperatorPlanFields {
  patternConfigLevel?: PatternConfigLevel | null;
  patternDirection?: PatternOperatorConfig["patternDirection"] | null;
  patternRetestMode?: PatternOperatorConfig["patternRetestMode"] | null;
  patternConfirmStrength?: PatternOperatorConfig["patternConfirmStrength"] | null;
  patternConfirmClose?: PatternOperatorConfig["patternConfirmClose"] | null;
  patternExpiryBars?: number | null;
  patternRiskStyle?: PatternOperatorConfig["patternRiskStyle"] | null;
  patternStrength?: PatternOperatorConfig["patternStrength"] | null;
  patternSrSensitivity?: PatternOperatorConfig["patternSrSensitivity"] | null;
}

function isActiveConfig(
  config: PatternOperatorConfig | null | undefined,
): config is PatternOperatorConfig {
  return (
    config != null &&
    config.patternConfigLevel !== "automatic"
  );
}

function clampNum(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

function adjustRange(
  range: StrategySearchParameterRange,
  patch: Partial<StrategySearchParameterRange>,
): StrategySearchParameterRange {
  return { ...range, ...patch };
}

function adjustFloatRange(
  ranges: StrategySearchParameterRange[],
  key: string,
  patch: Partial<StrategySearchParameterRange>,
): StrategySearchParameterRange[] {
  const idx = ranges.findIndex((r) => r.key === key);
  if (idx < 0) return ranges;
  const next = [...ranges];
  next[idx] = adjustRange(next[idx]!, patch);
  return next;
}

function adjustNumericDefault(
  base: Record<string, number | boolean | string>,
  key: string,
  delta: number,
  bounds?: { min?: number; max?: number },
): Record<string, number | boolean | string> {
  const raw = base[key];
  if (typeof raw !== "number" || !Number.isFinite(raw)) return base;
  let next = raw + delta;
  if (bounds?.min != null) next = Math.max(bounds.min, next);
  if (bounds?.max != null) next = Math.min(bounds.max, next);
  return { ...base, [key]: next };
}

function adjustIntegerDefault(
  base: Record<string, number | boolean | string>,
  key: string,
  delta: number,
  bounds?: { min?: number; max?: number },
): Record<string, number | boolean | string> {
  const raw = base[key];
  if (typeof raw !== "number" || !Number.isFinite(raw)) return base;
  let next = Math.trunc(raw + delta);
  if (bounds?.min != null) next = Math.max(bounds.min, next);
  if (bounds?.max != null) next = Math.min(bounds.max, next);
  return { ...base, [key]: next };
}

/**
 * Resolve immutable plan fields into an active operator config (null when automatic).
 */
export function patternConfigFromPlanFields(
  plan: PatternOperatorPlanFields | null | undefined,
): PatternOperatorConfig | null {
  const level = plan?.patternConfigLevel ?? "automatic";
  if (level === "automatic") return null;
  const expiryRaw = plan?.patternExpiryBars;
  const expiry =
    typeof expiryRaw === "number" && Number.isFinite(expiryRaw)
      ? Math.trunc(expiryRaw)
      : 48;
  const retest = plan?.patternRetestMode;
  return {
    patternConfigLevel: level,
    patternDirection: plan?.patternDirection ?? "both",
    patternRetestMode:
      retest === "optional" || retest === "disabled" || retest === "required"
        ? retest
        : "required",
    patternConfirmStrength: plan?.patternConfirmStrength ?? "standard",
    patternConfirmClose: plan?.patternConfirmClose ?? "required",
    patternExpiryBars: clampNum(expiry, 12, 96),
    patternRiskStyle: plan?.patternRiskStyle ?? "balanced",
    patternStrength: plan?.patternStrength ?? "standard",
    patternSrSensitivity: plan?.patternSrSensitivity ?? "standard",
  };
}

export function applyPatternOperatorConfigToRanges(
  ranges: StrategySearchParameterRange[],
  config: PatternOperatorConfig | null | undefined,
): StrategySearchParameterRange[] {
  if (!isActiveConfig(config)) return ranges;

  let next = ranges.map((r) => ({ ...r }));

  const penetration = next.find((r) => r.key === "penetrationPct");
  if (penetration && typeof penetration.max === "number") {
    const delta =
      config.patternRetestMode === "required"
        ? -0.05
        : config.patternRetestMode === "optional"
          ? 0.05
          : config.patternRetestMode === "disabled"
            ? 0.15
            : 0;
    let max = clampNum(penetration.max + delta, 0.2, 0.95);
    let defaultValue =
      typeof penetration.defaultValue === "number"
        ? penetration.defaultValue
        : null;
    if (config.patternConfirmStrength === "strict") {
      max = clampNum(max - 0.05, 0.2, 0.95);
      if (defaultValue != null) {
        defaultValue = clampNum(defaultValue - 0.05, 0.2, max);
      }
    }
    if (config.patternStrength === "strict") {
      max = clampNum(max - 0.05, 0.2, 0.95);
    } else if (config.patternStrength === "loose") {
      max = clampNum(max + 0.05, 0.2, 0.95);
    }
    next = adjustFloatRange(next, "penetrationPct", {
      max,
      ...(defaultValue != null ? { defaultValue } : {}),
    });
  }

  if (config.patternConfirmStrength === "strict") {
    const stop = next.find((r) => r.key === "stopAtrMult");
    if (stop && typeof stop.defaultValue === "number") {
      next = adjustFloatRange(next, "stopAtrMult", {
        defaultValue: clampNum(stop.defaultValue + 0.1, 0.5, 2.5),
      });
    }
  }

  const hold = next.find((r) => r.key === "maxHoldBars");
  if (hold) {
    const expiry = config.patternExpiryBars;
    const span = 12;
    const min =
      typeof hold.min === "number"
        ? Math.max(hold.min, expiry - span)
        : Math.max(12, expiry - span);
    const max =
      typeof hold.max === "number"
        ? Math.min(hold.max, expiry + span)
        : Math.min(96, expiry + span);
    next = adjustFloatRange(next, "maxHoldBars", {
      min,
      max: Math.max(min, max),
      defaultValue: expiry,
    });
  }

  if (config.patternRiskStyle === "conservative") {
    const stop = next.find((r) => r.key === "stopAtrMult");
    if (stop && typeof stop.defaultValue === "number") {
      next = adjustFloatRange(next, "stopAtrMult", {
        defaultValue: clampNum(stop.defaultValue + 0.2, 0.5, 2.5),
      });
    }
    const tp = next.find((r) => r.key === "tpAtrMult");
    if (tp && typeof tp.defaultValue === "number") {
      next = adjustFloatRange(next, "tpAtrMult", {
        defaultValue: clampNum(tp.defaultValue - 0.25, 1.0, 4.0),
      });
    }
  } else if (config.patternRiskStyle === "aggressive") {
    const stop = next.find((r) => r.key === "stopAtrMult");
    if (stop && typeof stop.defaultValue === "number") {
      next = adjustFloatRange(next, "stopAtrMult", {
        defaultValue: clampNum(stop.defaultValue - 0.15, 0.5, 2.5),
      });
    }
    const tp = next.find((r) => r.key === "tpAtrMult");
    if (tp && typeof tp.defaultValue === "number") {
      next = adjustFloatRange(next, "tpAtrMult", {
        defaultValue: clampNum(tp.defaultValue + 0.5, 1.0, 4.0),
      });
    }
  }

  const strengthDelta =
    config.patternStrength === "strict"
      ? 1
      : config.patternStrength === "loose"
        ? -1
        : 0;
  if (strengthDelta !== 0) {
    for (const key of ["zoneLookback", "minTouchCount", "minTouches"] as const) {
      const row = next.find((r) => r.key === key);
      if (!row || typeof row.defaultValue !== "number") continue;
      const step = key === "zoneLookback" ? 5 * strengthDelta : strengthDelta;
      const min = typeof row.min === "number" ? row.min : 1;
      const max = typeof row.max === "number" ? row.max : 100;
      next = adjustFloatRange(next, key, {
        defaultValue: clampNum(row.defaultValue + step, min, max),
      });
    }
    const gap = next.find((r) => r.key === "minGapPct");
    if (gap && typeof gap.defaultValue === "number") {
      next = adjustFloatRange(next, "minGapPct", {
        defaultValue: clampNum(
          gap.defaultValue + 0.02 * strengthDelta,
          typeof gap.min === "number" ? gap.min : 0.01,
          typeof gap.max === "number" ? gap.max : 0.5,
        ),
      });
    }
  }

  const sensDelta =
    config.patternSrSensitivity === "tight"
      ? -1
      : config.patternSrSensitivity === "loose"
        ? 1
        : 0;
  if (sensDelta !== 0) {
    for (const key of ["tolerancePct", "zoneWidthPct"] as const) {
      const row = next.find((r) => r.key === key);
      if (!row || typeof row.defaultValue !== "number") continue;
      const min = typeof row.min === "number" ? row.min : 0.05;
      const max = typeof row.max === "number" ? row.max : 1;
      next = adjustFloatRange(next, key, {
        defaultValue: clampNum(
          row.defaultValue + 0.05 * sensDelta,
          min,
          max,
        ),
      });
    }
  }

  return next;
}

export function applyPatternOperatorConfigToBaseParams(
  base: Record<string, number | boolean | string>,
  config: PatternOperatorConfig | null | undefined,
): Record<string, number | boolean | string> {
  if (!isActiveConfig(config)) return base;

  let next: Record<string, number | boolean | string> = { ...base };

  next = {
    ...next,
    direction: config.patternDirection,
    requireTouch: config.patternRetestMode === "required",
    requireCloseInDirection: config.patternConfirmClose !== "disabled",
  };

  if ("maxHoldBars" in next) {
    next = { ...next, maxHoldBars: config.patternExpiryBars };
  }

  if (config.patternConfirmStrength === "strict" && "penetrationPct" in next) {
    next = adjustNumericDefault(next, "penetrationPct", -0.05, {
      min: 0.2,
      max: 0.95,
    });
    next = adjustNumericDefault(next, "stopAtrMult", 0.1, {
      min: 0.5,
      max: 2.5,
    });
  }

  if (config.patternRetestMode === "disabled" && "penetrationPct" in next) {
    next = adjustNumericDefault(next, "penetrationPct", 0.1, {
      min: 0.2,
      max: 0.95,
    });
  }

  if (config.patternRiskStyle === "conservative") {
    next = adjustNumericDefault(next, "stopAtrMult", 0.2, {
      min: 0.5,
      max: 2.5,
    });
    next = adjustNumericDefault(next, "tpAtrMult", -0.25, {
      min: 1.0,
      max: 4.0,
    });
  } else if (config.patternRiskStyle === "aggressive") {
    next = adjustNumericDefault(next, "stopAtrMult", -0.15, {
      min: 0.5,
      max: 2.5,
    });
    next = adjustNumericDefault(next, "tpAtrMult", 0.5, {
      min: 1.0,
      max: 4.0,
    });
  }

  const strengthDelta =
    config.patternStrength === "strict"
      ? 1
      : config.patternStrength === "loose"
        ? -1
        : 0;
  if (strengthDelta !== 0) {
    next = adjustIntegerDefault(next, "zoneLookback", 5 * strengthDelta, {
      min: 20,
      max: 80,
    });
    next = adjustIntegerDefault(next, "minTouchCount", strengthDelta, {
      min: 2,
      max: 6,
    });
    next = adjustIntegerDefault(next, "minTouches", strengthDelta, {
      min: 2,
      max: 6,
    });
    next = adjustNumericDefault(next, "minGapPct", 0.02 * strengthDelta, {
      min: 0.01,
      max: 0.5,
    });
    next = adjustNumericDefault(next, "penetrationPct", -0.05 * strengthDelta, {
      min: 0.2,
      max: 0.95,
    });
  }

  const sensDelta =
    config.patternSrSensitivity === "tight"
      ? -1
      : config.patternSrSensitivity === "loose"
        ? 1
        : 0;
  if (sensDelta !== 0) {
    next = adjustNumericDefault(next, "tolerancePct", 0.05 * sensDelta, {
      min: 0.05,
      max: 1,
    });
    next = adjustNumericDefault(next, "zoneWidthPct", 0.05 * sensDelta, {
      min: 0.05,
      max: 1,
    });
  }

  return next;
}
