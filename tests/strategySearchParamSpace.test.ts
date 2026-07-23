import { describe, expect, it } from "vitest";
import { CONTEXT_FALLBACK_PARAMS } from "../src/lib/rextora/strategy/safeV44Params";
import type { SafeV44Params } from "../src/lib/rextora/strategy/strategyTypes";
import {
  getDefaultSafeV44SearchSpace,
  normalizeCandidateParams,
  validateCandidateParams,
  validateSearchParameterRanges,
} from "../src/lib/rextora/strategySearch";

const SAFE_KEYS = Object.keys(CONTEXT_FALLBACK_PARAMS) as Array<
  keyof SafeV44Params
>;

describe("strategySearch paramSpace", () => {
  it("default search space uses only real SafeV44Params fields", () => {
    const space = getDefaultSafeV44SearchSpace();
    expect(space.length).toBe(SAFE_KEYS.length);
    for (const range of space) {
      expect(SAFE_KEYS).toContain(range.key);
      expect(range.valueType).toBeTruthy();
    }
  });

  it("every default numeric range has valid min/max/step", () => {
    const space = getDefaultSafeV44SearchSpace();
    const result = validateSearchParameterRanges(space);
    expect(result.ok).toBe(true);
    for (const range of space) {
      if (range.valueType === "boolean") continue;
      expect(typeof range.min).toBe("number");
      expect(typeof range.max).toBe("number");
      expect(range.min! <= range.max!).toBe(true);
      expect(typeof range.step).toBe("number");
      expect((range.step as number) > 0).toBe(true);
    }
  });

  it("normalizes integers and float steps deterministically without mutating input", () => {
    const ranges = getDefaultSafeV44SearchSpace().filter((r) =>
      ["ema_fast", "sl_atr_mult"].includes(r.key),
    );
    const input = {
      ...CONTEXT_FALLBACK_PARAMS,
      ema_fast: 20.6,
      sl_atr_mult: 1.88444,
    } as Record<string, number | boolean>;
    const snapshot = JSON.stringify(input);
    const normalized = normalizeCandidateParams(input, ranges);
    expect(JSON.stringify(input)).toBe(snapshot);
    expect(Number.isInteger(normalized.ema_fast)).toBe(true);
    expect(normalized.sl_atr_mult).toBe(
      normalizeCandidateParams(input, ranges).sl_atr_mult,
    );
  });

  it("validates booleans and rejects NaN/Infinity/invalid ranges", () => {
    const space = getDefaultSafeV44SearchSpace();
    expect(
      validateSearchParameterRanges([
        { key: "ema_fast", min: Number.NaN, max: 10, step: 1, valueType: "integer" },
      ]).ok,
    ).toBe(false);
    expect(
      validateSearchParameterRanges([
        {
          key: "ema_fast",
          min: 0,
          max: Number.POSITIVE_INFINITY,
          step: 1,
          valueType: "integer",
        },
      ]).ok,
    ).toBe(false);
    expect(
      validateSearchParameterRanges([
        { key: "ema_fast", min: 50, max: 10, step: 1, valueType: "integer" },
      ]).issues.some((i) => i.code === "MIN_GT_MAX"),
    ).toBe(true);
    expect(
      validateSearchParameterRanges([
        { key: "ema_fast", min: 2, max: 100, step: 0, valueType: "integer" },
      ]).issues.some((i) => i.code === "INVALID_STEP"),
    ).toBe(true);

    const badBool = validateCandidateParams(
      { ...CONTEXT_FALLBACK_PARAMS, confirm_bear: 1 as unknown as boolean },
      space,
    );
    expect(badBool.ok).toBe(false);
  });

  it("rejects out-of-range and broken cross-parameter constraints", () => {
    const space = getDefaultSafeV44SearchSpace();
    const outOfRange = validateCandidateParams(
      { ...CONTEXT_FALLBACK_PARAMS, ema_fast: 1000 },
      space,
    );
    expect(outOfRange.issues.some((i) => i.code === "OUT_OF_RANGE")).toBe(true);

    const emaOrder = validateCandidateParams(
      { ...CONTEXT_FALLBACK_PARAMS, ema_fast: 80, ema_mid: 40, ema_slow: 20 },
      space,
    );
    expect(emaOrder.issues.some((i) => i.code === "EMA_PERIOD_ORDER")).toBe(
      true,
    );

    const lev = validateCandidateParams(
      { ...CONTEXT_FALLBACK_PARAMS, lev_min: 5, lev_max: 2, lev_base: 3 },
      space,
    );
    expect(lev.issues.some((i) => i.code === "LEVERAGE_BOUNDS")).toBe(true);

    const sl = validateCandidateParams(
      { ...CONTEXT_FALLBACK_PARAMS, sl_atr_mult: 0 },
      space,
    );
    expect(sl.issues.some((i) => i.code === "POSITIVE_ATR_MULT")).toBe(true);
  });

  it("accepts a valid complete candidate", () => {
    const space = getDefaultSafeV44SearchSpace();
    const result = validateCandidateParams(
      { ...CONTEXT_FALLBACK_PARAMS },
      space,
    );
    expect(result.ok).toBe(true);
    expect(result.issues).toHaveLength(0);
  });

  it("rejects unknown parameter keys in ranges", () => {
    const result = validateSearchParameterRanges([
      {
        key: "not_a_real_param",
        min: 0,
        max: 1,
        step: 0.1,
        valueType: "float",
      },
    ]);
    expect(result.issues.some((i) => i.code === "UNKNOWN_PARAMETER")).toBe(
      true,
    );
  });

  it("supports enum validation when enum fields are configured", () => {
    const ranges = [
      {
        key: "ema_fast",
        min: null,
        max: null,
        valueType: "enum" as const,
        enumValues: [10, 20, 30],
        defaultValue: 20,
      },
    ];
    expect(validateSearchParameterRanges(ranges).ok).toBe(true);
    const bad = validateCandidateParams(
      { ...CONTEXT_FALLBACK_PARAMS, ema_fast: 15 },
      ranges,
    );
    expect(bad.issues.some((i) => i.code === "ENUM_OUT_OF_RANGE")).toBe(true);
  });
});
