import { describe, expect, it } from "vitest";
import { CONTEXT_FALLBACK_PARAMS } from "../src/lib/rextora/strategy/safeV44Params";
import { computeParamsHash } from "../src/lib/rextora/strategy/strategyHash";
import {
  applyLeverageModeToParams,
  describeLeverageFromParams,
  filterRangesForLeverageMode,
  leverageModeMutatesLev,
  resolveLeverageMode,
} from "../src/lib/rextora/strategySearch/leverageMode";
import type { StrategySearchParameterRange } from "../src/lib/rextora/strategySearch/types";

describe("leverageMode application", () => {
  it("maps four modes onto lev_* / use_dynamic_leverage", () => {
    const auto = applyLeverageModeToParams(CONTEXT_FALLBACK_PARAMS, {
      leverageMode: "automatic",
      leverageMin: 1,
      leverageMax: 4,
    });
    expect(auto.use_dynamic_leverage).toBe(true);
    expect(auto.lev_min).toBe(1);
    expect(auto.lev_max).toBe(4);
    expect(auto.lev_base).toBeGreaterThanOrEqual(1);
    expect(auto.lev_base).toBeLessThanOrEqual(4);

    const fixed = applyLeverageModeToParams(CONTEXT_FALLBACK_PARAMS, {
      leverageMode: "fixed",
      leverageFixed: 3,
    });
    expect(fixed.use_dynamic_leverage).toBe(false);
    expect(fixed.lev_min).toBe(3);
    expect(fixed.lev_base).toBe(3);
    expect(fixed.lev_max).toBe(3);

    const range = applyLeverageModeToParams(CONTEXT_FALLBACK_PARAMS, {
      leverageMode: "range",
      leverageMin: 2,
      leverageMax: 5,
    });
    expect(range.use_dynamic_leverage).toBe(false);
    expect(range.lev_min).toBe(2);
    expect(range.lev_max).toBe(5);

    const off = applyLeverageModeToParams(CONTEXT_FALLBACK_PARAMS, {
      leverageMode: "disabled",
    });
    expect(off.use_dynamic_leverage).toBe(false);
    expect(off.lev_min).toBe(1);
    expect(off.lev_base).toBe(1);
    expect(off.lev_max).toBe(1);
  });

  it("changes paramsHash when leverage mode changes", () => {
    const a = applyLeverageModeToParams(CONTEXT_FALLBACK_PARAMS, {
      leverageMode: "disabled",
    });
    const b = applyLeverageModeToParams(CONTEXT_FALLBACK_PARAMS, {
      leverageMode: "fixed",
      leverageFixed: 5,
    });
    expect(computeParamsHash(a)).not.toBe(computeParamsHash(b));
    expect(computeParamsHash(a)).toBe(
      computeParamsHash(applyLeverageModeToParams(CONTEXT_FALLBACK_PARAMS, {
        leverageMode: "disabled",
      })),
    );
  });

  it("only range mode mutates lev_base in parameter ranges", () => {
    expect(leverageModeMutatesLev({ leverageMode: "range" })).toBe(true);
    expect(leverageModeMutatesLev({ leverageMode: "fixed" })).toBe(false);
    const sample: StrategySearchParameterRange[] = [
      { key: "ema_fast", min: 8, max: 21, step: 1, valueType: "integer" },
      { key: "lev_base", min: 1, max: 10, step: 0.5, valueType: "float" },
    ];
    const fixedFiltered = filterRangesForLeverageMode(sample, {
      leverageMode: "fixed",
      leverageFixed: 2,
    });
    expect(fixedFiltered.some((r) => r.key === "lev_base")).toBe(false);
    expect(fixedFiltered.some((r) => r.key === "ema_fast")).toBe(true);

    const rangeFiltered = filterRangesForLeverageMode(sample, {
      leverageMode: "range",
      leverageMin: 1,
      leverageMax: 3,
    });
    const lev = rangeFiltered.find((r) => r.key === "lev_base");
    expect(lev?.min).toBe(1);
    expect(lev?.max).toBe(3);
  });

  it("describeLeverageFromParams is human-readable", () => {
    expect(
      describeLeverageFromParams({
        use_dynamic_leverage: true,
        lev_min: 1,
        lev_max: 3,
        lev_base: 2,
      }),
    ).toMatch(/자동/);
    expect(
      describeLeverageFromParams({
        use_dynamic_leverage: false,
        lev_min: 2,
        lev_max: 2,
        lev_base: 2,
      }),
    ).toMatch(/고정/);
    expect(resolveLeverageMode({ leverageMode: "range" })).toBe("range");
  });
});
