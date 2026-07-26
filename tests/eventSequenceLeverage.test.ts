import { describe, expect, it } from "vitest";
import { resolveEventSequenceLeverage } from "../src/lib/rextora/strategySearch/leverageMode";
import { applyLeverageModeToParams } from "../src/lib/rextora/strategySearch/leverageMode";
import {
  ORDER_BLOCK_BASE_PARAMS,
  orderBlockSearchRanges,
  resolvePatternFamilyFromRanges,
} from "../src/lib/rextora/strategySearch/patternSearchSpaces";
import { filterRangesForLeverageMode } from "../src/lib/rextora/strategySearch/leverageMode";
import {
  normalizeCandidateParams,
  validateCandidateParams,
} from "../src/lib/rextora/strategySearch/paramSpace";

describe("eventSequence leverage", () => {
  it("disabled / fixed / range / auto resolve as expected", () => {
    expect(
      resolveEventSequenceLeverage({
        params: applyLeverageModeToParams(
          { ...ORDER_BLOCK_BASE_PARAMS },
          { leverageMode: "disabled" },
        ),
        atr: 100,
        price: 50_000,
      }),
    ).toBe(1);

    expect(
      resolveEventSequenceLeverage({
        params: applyLeverageModeToParams(
          { ...ORDER_BLOCK_BASE_PARAMS },
          { leverageMode: "fixed", leverageFixed: 3 },
        ),
        atr: 100,
        price: 50_000,
      }),
    ).toBe(3);

    const ranged = applyLeverageModeToParams(
      { ...ORDER_BLOCK_BASE_PARAMS },
      { leverageMode: "range", leverageMin: 2, leverageMax: 5 },
    );
    expect(
      resolveEventSequenceLeverage({
        params: { ...ranged, lev_base: 4 },
        atr: 100,
        price: 50_000,
      }),
    ).toBe(4);

    const auto = applyLeverageModeToParams(
      { ...ORDER_BLOCK_BASE_PARAMS },
      { leverageMode: "automatic", leverageMin: 1, leverageMax: 5 },
    );
    const lowVol = resolveEventSequenceLeverage({
      params: auto,
      atr: 50,
      price: 50_000,
    });
    const highVol = resolveEventSequenceLeverage({
      params: auto,
      atr: 2000,
      price: 50_000,
    });
    expect(lowVol).toBeGreaterThanOrEqual(highVol);
  });

  it("range mode keeps pattern family identity with lev_base range", () => {
    const ranges = filterRangesForLeverageMode(orderBlockSearchRanges(), {
      leverageMode: "range",
      leverageMin: 1,
      leverageMax: 4,
    });
    expect(resolvePatternFamilyFromRanges(ranges)).toBe("order_block");
    expect(ranges.some((r) => r.key === "lev_base")).toBe(true);

    const params = normalizeCandidateParams(
      {
        ...ORDER_BLOCK_BASE_PARAMS,
        lev_min: 1,
        lev_base: 2,
        lev_max: 4,
        use_dynamic_leverage: false,
        direction: "both",
      },
      ranges,
    );
    const check = validateCandidateParams(params, ranges);
    expect(check.ok).toBe(true);
    expect(params.lev_base).toBe(2);
    expect(params.direction).toBe("both");
  });
});
