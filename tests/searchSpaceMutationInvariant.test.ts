/**
 * P1-D2 producer invariant: operator overlay must never return min > max.
 * Isolated — does not read or write production strategy-search data.
 */
import { describe, expect, it } from "vitest";
import {
  applyPatternOperatorConfigToRanges,
  patternConfigFromPlanFields,
  type PatternOperatorConfig,
} from "../src/lib/rextora/strategySearch/patternSearchConfig";
import { fvgSearchRanges } from "../src/lib/rextora/strategySearch/patternSearchSpaces";
import { getDefaultSafeV44SearchSpace } from "../src/lib/rextora/strategySearch/paramSpace";
import { applySearchSpaceMutation } from "../src/lib/rextora/strategySearch/searchSpaceMutation";
import type { StrategySearchParameterRange } from "../src/lib/rextora/strategySearch/types";
import type { StrategySearchAdjustmentPlan } from "../src/lib/rextora/strategySearch/weaknessAnalysis";

/** Nearest reconstructed lastMutation.penetrationPct from the August seven. */
const HISTORICAL_LAST_MUTATION_PENETRATION: StrategySearchParameterRange = {
  key: "penetrationPct",
  min: 0.4999999999927325,
  max: 0.5000000000072675,
  step: 0.05,
  valueType: "float",
  defaultValue: 0.45,
};

const BASIC_REQUIRED_STANDARD = patternConfigFromPlanFields({
  patternConfigLevel: "basic",
  patternRetestMode: "required",
  patternConfirmStrength: "standard",
  patternStrength: "standard",
});

const BASIC_REQUIRED_STRICT = patternConfigFromPlanFields({
  patternConfigLevel: "basic",
  patternRetestMode: "required",
  patternConfirmStrength: "strict",
  patternStrength: "strict",
});

const UNSTABLE: StrategySearchAdjustmentPlan = {
  version: 1,
  actions: [{ type: "unstable_parameters", reasonKo: "불안정" }],
  nextFamilyHint: null,
};

function assertNumericRangesValid(
  ranges: StrategySearchParameterRange[],
  label: string,
): void {
  for (const range of ranges) {
    if (range.valueType === "boolean" || range.valueType === "enum") continue;
    if (typeof range.min !== "number" || typeof range.max !== "number") continue;
    expect(Number.isFinite(range.min), `${label} ${range.key} min finite`).toBe(
      true,
    );
    expect(Number.isFinite(range.max), `${label} ${range.key} max finite`).toBe(
      true,
    );
    expect(
      range.min <= range.max,
      `${label} ${range.key} min=${range.min} max=${range.max}`,
    ).toBe(true);
  }
}

describe("search-space range mutation invariants (P1-D2)", () => {
  it("applySearchSpaceMutation never returns min > max for SAFE or FVG ranges", () => {
    const spaces = [getDefaultSafeV44SearchSpace(), fvgSearchRanges()];
    const triggers: Array<{
      categories: string[];
      plan: StrategySearchAdjustmentPlan;
    }> = [
      { categories: ["unstable_parameters"], plan: UNSTABLE },
      {
        categories: ["excessive_drawdown"],
        plan: {
          version: 1,
          actions: [{ type: "tighten_risk", reasonKo: "낙폭" }],
          nextFamilyHint: null,
        },
      },
    ];
    for (const ranges of spaces) {
      for (const trigger of triggers) {
        let current = ranges;
        for (let i = 0; i < 40; i += 1) {
          const { ranges: next, record } = applySearchSpaceMutation(
            current,
            trigger.plan,
            trigger.categories,
          );
          assertNumericRangesValid(next, `mutation#${i}`);
          assertNumericRangesValid(record.mutatedRanges, `lastMutation#${i}`);
          current = next;
        }
      }
    }
  });

  it("exact historical penetrationPct overlay skips impossible max reduction", () => {
    expect(BASIC_REQUIRED_STANDARD).not.toBeNull();
    const snapshot = [{ ...HISTORICAL_LAST_MUTATION_PENETRATION }];
    const overlayed = applyPatternOperatorConfigToRanges(
      snapshot,
      BASIC_REQUIRED_STANDARD,
    );
    const pen = overlayed.find((r) => r.key === "penetrationPct")!;
    expect(pen.min).toBe(0.4999999999927325);
    expect(pen.max).toBe(0.5000000000072675);
    expect((pen.min as number) <= (pen.max as number)).toBe(true);
    assertNumericRangesValid(overlayed, "historical-overlay");
  });

  it("required retest cannot invert when width is below 0.05", () => {
    expect(BASIC_REQUIRED_STANDARD).not.toBeNull();
    const ranges: StrategySearchParameterRange[] = [
      {
        key: "penetrationPct",
        min: 0.5,
        max: 0.52,
        step: 0.05,
        valueType: "float",
      },
    ];
    const overlayed = applyPatternOperatorConfigToRanges(
      ranges,
      BASIC_REQUIRED_STANDARD,
    );
    const pen = overlayed.find((r) => r.key === "penetrationPct")!;
    expect(pen.min).toBe(0.5);
    expect(pen.max).toBe(0.52);
    assertNumericRangesValid(overlayed, "narrow-width");
  });

  it("strict confirmation/strength cannot invert a wider remaining span", () => {
    expect(BASIC_REQUIRED_STRICT).not.toBeNull();
    const ranges: StrategySearchParameterRange[] = [
      {
        key: "penetrationPct",
        min: 0.48,
        max: 0.58,
        step: 0.05,
        valueType: "float",
        defaultValue: 0.5,
      },
    ];
    const overlayed = applyPatternOperatorConfigToRanges(
      ranges,
      BASIC_REQUIRED_STRICT,
    );
    assertNumericRangesValid(overlayed, "strict-overlay");
    const pen = overlayed.find((r) => r.key === "penetrationPct")!;
    expect((pen.min as number) <= (pen.max as number)).toBe(true);
  });

  it("catalog FVG overlay still tightens penetration max when the span allows it", () => {
    expect(BASIC_REQUIRED_STANDARD).not.toBeNull();
    const catalog = fvgSearchRanges();
    const src = catalog.find((r) => r.key === "penetrationPct")!;
    const overlayed = applyPatternOperatorConfigToRanges(
      catalog,
      BASIC_REQUIRED_STANDARD,
    );
    assertNumericRangesValid(overlayed, "catalog+overlay");
    const pen = overlayed.find((r) => r.key === "penetrationPct")!;
    expect(pen.min).toBe(src.min);
    expect(pen.max as number).toBeCloseTo((src.max as number) - 0.05, 12);
    expect((pen.min as number) <= (pen.max as number)).toBe(true);
  });

  it("every numeric overlay output is finite with min <= max, including shrink-then-overlay", () => {
    expect(BASIC_REQUIRED_STANDARD).not.toBeNull();
    let current = fvgSearchRanges();
    for (let i = 0; i < 40; i += 1) {
      const { ranges: mutated } = applySearchSpaceMutation(
        current,
        UNSTABLE,
        ["unstable_parameters"],
      );
      const overlayed = applyPatternOperatorConfigToRanges(
        mutated,
        BASIC_REQUIRED_STANDARD,
      );
      assertNumericRangesValid(overlayed, `shrink+overlay#${i}`);
      current = mutated;
    }
  });

  it("expert confirmationWindow is not emitted when min would exceed max", () => {
    const base = patternConfigFromPlanFields({
      patternConfigLevel: "expert",
      patternConfirmationMode: "consecutive_closes",
      patternConfirmationCandleCount: 3,
      patternConfirmationWindow: 8,
    });
    expect(base).not.toBeNull();
    const inverted: PatternOperatorConfig = {
      ...base!,
      patternConfirmationCandleCount: 30,
      patternConfirmationWindow: 10,
    };
    const overlayed = applyPatternOperatorConfigToRanges(
      fvgSearchRanges(),
      inverted,
    );
    assertNumericRangesValid(overlayed, "confirmationWindow");
    const window = overlayed.find((r) => r.key === "confirmationWindow");
    if (window) {
      expect(typeof window.min).toBe("number");
      expect(typeof window.max).toBe("number");
      expect((window.min as number) <= (window.max as number)).toBe(true);
    }
  });
});
