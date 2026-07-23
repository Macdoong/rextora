import { CONTEXT_FALLBACK_PARAMS } from "../strategy/safeV44Params";
import { getSafeParamCatalog } from "../strategy/definition/safeParamCatalog";
import type { SafeV44Params } from "../strategy/strategyTypes";
import type {
  StrategySearchParameterRange,
  StrategySearchParameterValue,
  StrategySearchParameterValueType,
  StrategySearchValidationIssue,
  StrategySearchValidationResult,
} from "./types";

const SAFE_PARAM_KEYS = Object.keys(CONTEXT_FALLBACK_PARAMS) as Array<
  keyof SafeV44Params
>;

const BOOLEAN_KEYS = new Set<keyof SafeV44Params>([
  "confirm_bull",
  "confirm_bear",
  "allow_in_range",
  "use_trailing",
  "use_vol_target",
  "use_dynamic_leverage",
  "mark_to_market",
  "cost_guard",
]);

const INTEGER_KEYS = new Set<keyof SafeV44Params>([
  "ema_fast",
  "ema_mid",
  "ema_slow",
  "rsi_period",
  "atr_period",
  "vol_lookback",
  "res_lookback",
  "slope_lookback",
  "break_lookback",
  "cooldown_bars",
  "max_hold_bars",
]);

const FLOAT_PRECISION = 10;

function valueTypeFor(key: keyof SafeV44Params): StrategySearchParameterValueType {
  if (BOOLEAN_KEYS.has(key)) return "boolean";
  if (INTEGER_KEYS.has(key)) return "integer";
  return "float";
}

function defaultStep(
  key: keyof SafeV44Params,
  valueType: StrategySearchParameterValueType,
): number | null {
  if (valueType === "boolean" || valueType === "enum") return null;
  if (valueType === "integer") return 1;
  // Fine float step for ratio/multiplier search fields.
  if (
    key.includes("pct") ||
    key.includes("ratio") ||
    key.includes("margin") ||
    key.includes("slope") ||
    key.includes("dist") ||
    key.includes("room") ||
    key.includes("dd")
  ) {
    return 0.0001;
  }
  return 0.01;
}

function issue(
  code: string,
  parameter: string | null,
  message: string,
  actualValue: StrategySearchParameterValue | null = null,
  expected: StrategySearchParameterValue | string | null = null,
): StrategySearchValidationIssue {
  return { code, parameter, message, actualValue, expected };
}

function isFiniteNumber(n: unknown): n is number {
  return typeof n === "number" && Number.isFinite(n);
}

function roundFloat(n: number): number {
  const f = 10 ** FLOAT_PRECISION;
  return Math.round(n * f) / f;
}

function alignNumeric(
  value: number,
  min: number,
  max: number,
  step: number,
  valueType: "integer" | "float",
): number {
  if (step <= 0 || !Number.isFinite(step)) {
    throw new Error("alignNumeric requires positive finite step");
  }
  const steps = Math.round((value - min) / step);
  let aligned = min + steps * step;
  if (valueType === "integer") {
    aligned = Math.round(aligned);
  } else {
    aligned = roundFloat(aligned);
  }
  if (aligned < min) aligned = valueType === "integer" ? Math.ceil(min) : min;
  if (aligned > max) aligned = valueType === "integer" ? Math.floor(max) : max;
  if (valueType === "integer") return Math.round(aligned);
  return roundFloat(Math.min(max, Math.max(min, aligned)));
}

/**
 * Default searchable space for every SafeV44Params field.
 * Bounds come from safeParamCatalog.ts; defaults from safeV44Params.ts.
 */
export function getDefaultSafeV44SearchSpace(): StrategySearchParameterRange[] {
  const catalog = getSafeParamCatalog();
  const byKey = new Map(catalog.map((e) => [e.key, e]));
  const ranges: StrategySearchParameterRange[] = [];

  for (const key of SAFE_PARAM_KEYS) {
    const entry = byKey.get(key);
    const valueType = valueTypeFor(key);
    const fallback = CONTEXT_FALLBACK_PARAMS[key];
    if (valueType === "boolean") {
      ranges.push({
        key,
        min: false,
        max: true,
        step: null,
        valueType: "boolean",
        defaultValue: Boolean(fallback),
      });
      continue;
    }
    const min = typeof entry?.min === "number" ? entry.min : Number(fallback);
    const max = typeof entry?.max === "number" ? entry.max : Number(fallback);
    ranges.push({
      key,
      min,
      max,
      step: defaultStep(key, valueType),
      valueType,
      defaultValue: Number(fallback),
    });
  }
  return ranges;
}

function resolveValueType(
  range: StrategySearchParameterRange,
): StrategySearchParameterValueType {
  if (range.valueType) return range.valueType;
  if (typeof range.min === "boolean" || typeof range.max === "boolean") {
    return "boolean";
  }
  if (range.enumValues && range.enumValues.length > 0) return "enum";
  if (
    typeof range.step === "number" &&
    Number.isInteger(range.step) &&
    typeof range.min === "number" &&
    Number.isInteger(range.min) &&
    typeof range.max === "number" &&
    Number.isInteger(range.max)
  ) {
    return "integer";
  }
  return "float";
}

export function validateSearchParameterRanges(
  ranges: StrategySearchParameterRange[],
): StrategySearchValidationResult {
  const issues: StrategySearchValidationIssue[] = [];
  if (!Array.isArray(ranges) || ranges.length === 0) {
    return {
      ok: false,
      issues: [
        issue(
          "EMPTY_RANGES",
          null,
          "parameterRanges must be a non-empty array",
        ),
      ],
    };
  }

  const seen = new Set<string>();
  for (const range of ranges) {
    if (!range || typeof range.key !== "string" || !range.key) {
      issues.push(
        issue("INVALID_KEY", null, "parameter range key is required"),
      );
      continue;
    }
    if (seen.has(range.key)) {
      issues.push(
        issue("DUPLICATE_KEY", range.key, "duplicate parameter range key"),
      );
    }
    seen.add(range.key);

    if (!(range.key in CONTEXT_FALLBACK_PARAMS)) {
      issues.push(
        issue(
          "UNKNOWN_PARAMETER",
          range.key,
          "parameter is not a SafeV44Params field",
          range.key,
        ),
      );
      continue;
    }

    const valueType = resolveValueType(range);

    if (valueType === "boolean") {
      if (typeof range.min !== "boolean" || typeof range.max !== "boolean") {
        issues.push(
          issue(
            "BOOLEAN_BOUNDS",
            range.key,
            "boolean parameters require boolean min/max",
          ),
        );
      }
      if (
        range.defaultValue !== undefined &&
        typeof range.defaultValue !== "boolean"
      ) {
        issues.push(
          issue(
            "DEFAULT_TYPE",
            range.key,
            "boolean defaultValue must be boolean",
            range.defaultValue,
            "boolean",
          ),
        );
      }
      continue;
    }

    if (valueType === "enum") {
      if (!range.enumValues || range.enumValues.length === 0) {
        issues.push(
          issue(
            "ENUM_VALUES",
            range.key,
            "enum parameters require non-empty enumValues",
          ),
        );
      }
      if (
        range.defaultValue !== undefined &&
        range.enumValues &&
        !range.enumValues.includes(range.defaultValue)
      ) {
        issues.push(
          issue(
            "DEFAULT_OUT_OF_RANGE",
            range.key,
            "defaultValue is not in enumValues",
            range.defaultValue,
          ),
        );
      }
      continue;
    }

    if (!isFiniteNumber(range.min) || !isFiniteNumber(range.max)) {
      issues.push(
        issue(
          "NON_FINITE_BOUNDS",
          range.key,
          "numeric parameters require finite min/max",
        ),
      );
      continue;
    }
    if (Number.isNaN(range.min) || Number.isNaN(range.max)) {
      issues.push(
        issue("NAN_BOUNDS", range.key, "min/max must not be NaN"),
      );
      continue;
    }
    if (range.min > range.max) {
      issues.push(
        issue(
          "MIN_GT_MAX",
          range.key,
          "min must be <= max",
          range.min,
          range.max,
        ),
      );
    }
    const step = range.step ?? defaultStep(range.key as keyof SafeV44Params, valueType);
    if (step == null || !isFiniteNumber(step) || step <= 0) {
      issues.push(
        issue(
          "INVALID_STEP",
          range.key,
          "step must be a finite number > 0",
          step,
        ),
      );
    }
    if (range.defaultValue !== undefined) {
      if (!isFiniteNumber(range.defaultValue)) {
        issues.push(
          issue(
            "DEFAULT_TYPE",
            range.key,
            "numeric defaultValue must be a finite number",
            range.defaultValue as StrategySearchParameterValue,
          ),
        );
      } else if (
        range.defaultValue < range.min ||
        range.defaultValue > range.max
      ) {
        issues.push(
          issue(
            "DEFAULT_OUT_OF_RANGE",
            range.key,
            "defaultValue is outside configured min/max",
            range.defaultValue,
            `${range.min}..${range.max}`,
          ),
        );
      }
    }
  }

  return { ok: issues.length === 0, issues };
}

function validateCrossParameterConstraints(
  params: Record<string, StrategySearchParameterValue>,
): StrategySearchValidationIssue[] {
  const issues: StrategySearchValidationIssue[] = [];
  const num = (k: string): number | null =>
    typeof params[k] === "number" && Number.isFinite(params[k] as number)
      ? (params[k] as number)
      : null;

  const emaFast = num("ema_fast");
  const emaMid = num("ema_mid");
  const emaSlow = num("ema_slow");
  // Source: src/lib/rextora/strategy/safeV44Params.ts CONTEXT_FALLBACK_PARAMS
  // (20 < 60 < 200) and safeParamCatalog.ts labels 빠른/중간/느린 이동평균.
  // indicatorEngine.ts computes distinct ema_fast/ema_mid/ema_slow series.
  if (
    emaFast != null &&
    emaMid != null &&
    emaSlow != null &&
    !(emaFast < emaMid && emaMid < emaSlow)
  ) {
    issues.push(
      issue(
        "EMA_PERIOD_ORDER",
        "ema_fast",
        "ema_fast < ema_mid < ema_slow is required",
        emaFast,
        `${emaFast},${emaMid},${emaSlow}`,
      ),
    );
  }

  const levMin = num("lev_min");
  const levBase = num("lev_base");
  const levMax = num("lev_max");
  // Source: src/lib/rextora/risk/safeV44RiskEngine.ts clamp(leverage, lev_min, lev_max)
  if (levMin != null && levMax != null && levMin > levMax) {
    issues.push(
      issue(
        "LEVERAGE_BOUNDS",
        "lev_min",
        "lev_min must be <= lev_max",
        levMin,
        levMax,
      ),
    );
  }
  if (
    levMin != null &&
    levBase != null &&
    levMax != null &&
    (levBase < levMin || levBase > levMax)
  ) {
    issues.push(
      issue(
        "LEVERAGE_BASE_RANGE",
        "lev_base",
        "lev_base must be within lev_min..lev_max",
        levBase,
        `${levMin}..${levMax}`,
      ),
    );
  }

  const sizeMin = num("size_min");
  const sizeMax = num("size_max");
  // Source: src/lib/rextora/risk/safeV44RiskEngine.ts clamp(sizeMultiplier, size_min, size_max)
  if (sizeMin != null && sizeMax != null && sizeMin > sizeMax) {
    issues.push(
      issue(
        "SIZE_BOUNDS",
        "size_min",
        "size_min must be <= size_max",
        sizeMin,
        sizeMax,
      ),
    );
  }

  const atrOk = num("lev_atr_ok_max");
  const atrHigh = num("lev_atr_too_high");
  // Source: src/lib/rextora/risk/safeV44RiskEngine.ts denominator
  // (lev_atr_too_high - lev_atr_ok_max) for leverage interpolation.
  if (atrOk != null && atrHigh != null && !(atrOk < atrHigh)) {
    issues.push(
      issue(
        "LEV_ATR_ORDER",
        "lev_atr_ok_max",
        "lev_atr_ok_max must be < lev_atr_too_high",
        atrOk,
        atrHigh,
      ),
    );
  }

  for (const key of [
    "ema_fast",
    "ema_mid",
    "ema_slow",
    "rsi_period",
    "atr_period",
    "vol_lookback",
    "res_lookback",
    "slope_lookback",
    "break_lookback",
    "max_hold_bars",
  ] as const) {
    const v = num(key);
    // Source: safeParamCatalog.ts period/lookback mins are positive (≥1 or ≥2).
    if (v != null && v <= 0) {
      issues.push(
        issue(
          "POSITIVE_PERIOD",
          key,
          "period/lookback values must be positive",
          v,
          "> 0",
        ),
      );
    }
  }

  const cooldown = num("cooldown_bars");
  // Source: safeParamCatalog.ts cooldown_bars min: 0
  if (cooldown != null && cooldown < 0) {
    issues.push(
      issue(
        "NON_NEGATIVE_COOLDOWN",
        "cooldown_bars",
        "cooldown_bars must be >= 0",
        cooldown,
        ">= 0",
      ),
    );
  }

  for (const key of ["sl_atr_mult", "tp_atr_mult", "trail_atr_mult"] as const) {
    const v = num(key);
    // Source: safeParamCatalog.ts / safeV44RiskEngine.ts ATR multipliers (>0).
    if (v != null && v <= 0) {
      issues.push(
        issue(
          "POSITIVE_ATR_MULT",
          key,
          "ATR multipliers must be positive",
          v,
          "> 0",
        ),
      );
    }
  }

  return issues;
}

export function validateCandidateParams(
  params: Record<string, StrategySearchParameterValue>,
  ranges: StrategySearchParameterRange[],
): StrategySearchValidationResult {
  const rangeCheck = validateSearchParameterRanges(ranges);
  if (!rangeCheck.ok) return rangeCheck;

  const issues: StrategySearchValidationIssue[] = [];
  const rangeByKey = new Map(ranges.map((r) => [r.key, r]));

  for (const key of SAFE_PARAM_KEYS) {
    if (!(key in params) || params[key] === undefined) {
      issues.push(
        issue(
          "MISSING_PARAMETER",
          key,
          "complete SafeV44Params record requires this field",
        ),
      );
    }
  }

  for (const [key, value] of Object.entries(params)) {
    if (!(key in CONTEXT_FALLBACK_PARAMS)) {
      issues.push(
        issue(
          "UNKNOWN_PARAMETER",
          key,
          "parameter is not a SafeV44Params field",
          value,
        ),
      );
      continue;
    }
    if (value === undefined) {
      issues.push(
        issue("UNDEFINED_VALUE", key, "undefined values are not allowed"),
      );
      continue;
    }

    const range = rangeByKey.get(key);
    if (!range) {
      // Non-searchable field: type-check against base SafeV44 type only.
      const expectedType = valueTypeFor(key as keyof SafeV44Params);
      if (expectedType === "boolean" && typeof value !== "boolean") {
        issues.push(
          issue("TYPE_MISMATCH", key, "expected boolean", value, "boolean"),
        );
      } else if (
        (expectedType === "integer" || expectedType === "float") &&
        !isFiniteNumber(value)
      ) {
        issues.push(
          issue(
            "TYPE_MISMATCH",
            key,
            "expected finite number",
            value,
            "number",
          ),
        );
      }
      continue;
    }

    const valueType = resolveValueType(range);
    if (valueType === "boolean") {
      if (typeof value !== "boolean") {
        issues.push(
          issue("TYPE_MISMATCH", key, "expected boolean", value, "boolean"),
        );
      }
      continue;
    }
    if (valueType === "enum") {
      if (!range.enumValues?.includes(value)) {
        issues.push(
          issue(
            "ENUM_OUT_OF_RANGE",
            key,
            "value is not in enumValues",
            value,
          ),
        );
      }
      continue;
    }
    if (typeof value !== "number" || !Number.isFinite(value)) {
      issues.push(
        issue(
          value !== value ? "NAN_VALUE" : "NON_FINITE_VALUE",
          key,
          "numeric parameter must be a finite number",
          typeof value === "number" || typeof value === "boolean" || typeof value === "string"
            ? value
            : null,
        ),
      );
      continue;
    }
    if (!isFiniteNumber(range.min) || !isFiniteNumber(range.max)) continue;
    if (value < range.min || value > range.max) {
      issues.push(
        issue(
          "OUT_OF_RANGE",
          key,
          "value outside configured min/max",
          value,
          `${range.min}..${range.max}`,
        ),
      );
    }
    if (valueType === "integer" && !Number.isInteger(value)) {
      issues.push(
        issue(
          "NOT_INTEGER",
          key,
          "integer parameter must be an integer",
          value,
        ),
      );
    }
  }

  issues.push(...validateCrossParameterConstraints(params));
  return { ok: issues.length === 0, issues };
}

/**
 * Normalize searchable fields to step/type rules. Does not mutate input.
 * Non-searchable base fields are copied as-is (booleans/numbers only).
 */
export function normalizeCandidateParams(
  params: Record<string, StrategySearchParameterValue>,
  ranges: StrategySearchParameterRange[],
): Record<string, StrategySearchParameterValue> {
  const rangeCheck = validateSearchParameterRanges(ranges);
  if (!rangeCheck.ok) {
    throw new Error(
      `cannot normalize with invalid ranges: ${rangeCheck.issues[0]?.message}`,
    );
  }

  const out: Record<string, StrategySearchParameterValue> = {};
  const rangeByKey = new Map(ranges.map((r) => [r.key, r]));

  for (const key of SAFE_PARAM_KEYS) {
    const raw = params[key];
    if (raw === undefined) {
      out[key] = CONTEXT_FALLBACK_PARAMS[key] as StrategySearchParameterValue;
      continue;
    }
    const range = rangeByKey.get(key);
    if (!range) {
      out[key] = raw as StrategySearchParameterValue;
      continue;
    }
    const valueType = resolveValueType(range);
    if (valueType === "boolean") {
      out[key] = Boolean(raw);
      continue;
    }
    if (valueType === "enum") {
      out[key] = raw as StrategySearchParameterValue;
      continue;
    }
    if (!isFiniteNumber(raw) || !isFiniteNumber(range.min) || !isFiniteNumber(range.max)) {
      out[key] = raw as StrategySearchParameterValue;
      continue;
    }
    const step =
      range.step ??
      defaultStep(key, valueType) ??
      (valueType === "integer" ? 1 : 0.01);
    const clamped = Math.min(range.max, Math.max(range.min, raw));
    out[key] = alignNumeric(
      clamped,
      range.min,
      range.max,
      step,
      valueType === "integer" ? "integer" : "float",
    );
  }

  // Preserve any extra keys as-is (will fail validation if unknown).
  for (const [key, value] of Object.entries(params)) {
    if (!(key in out) && value !== undefined) {
      out[key] = value;
    }
  }
  return out;
}
