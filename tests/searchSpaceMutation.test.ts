import { describe, expect, it } from "vitest";
import { applySearchSpaceMutation } from "../src/lib/rextora/strategySearch/searchSpaceMutation";
import { createEmptySearchPlan } from "../src/lib/rextora/strategySearch/searchPlan";
import type { StrategySearchParameterRange } from "../src/lib/rextora/strategySearch/types";
import type { StrategySearchAdjustmentPlan } from "../src/lib/rextora/strategySearch/weaknessAnalysis";

function range(
  key: string,
  min: number,
  max: number,
  step = 0.1,
): StrategySearchParameterRange {
  return { key, min, max, step, valueType: "float" };
}

describe("applySearchSpaceMutation", () => {
  it("mutates ranges for excessive_drawdown / tighten_risk", () => {
    const ranges = [
      range("sl_atr_mult", 1, 3),
      range("tp_atr_mult", 1, 4),
      range("ema_fast", 8, 40, 1),
      range("unrelated_key", 0, 10),
    ];
    const plan: StrategySearchAdjustmentPlan = {
      version: 1,
      actions: [
        { type: "tighten_risk", reasonKo: "낙폭" },
        { type: "prefer_lower_mdd", reasonKo: "MDD" },
      ],
      nextFamilyHint: null,
    };
    const { ranges: next, record } = applySearchSpaceMutation(
      ranges,
      plan,
      ["excessive_drawdown"],
    );
    const sl = next.find((r) => r.key === "sl_atr_mult")!;
    const tp = next.find((r) => r.key === "tp_atr_mult")!;
    const ema = next.find((r) => r.key === "ema_fast")!;
    expect(sl.max as number).toBeCloseTo(3 * 0.9, 8);
    expect(tp.min as number).toBeCloseTo(1 * 1.05, 8);
    expect(ema.max as number).toBeLessThan(40);
    expect(record.mutations.length).toBeGreaterThan(0);
    expect(record.previousRanges.find((r) => r.key === "sl_atr_mult")!.max).toBe(
      3,
    );
  });

  it("widens entry filters for insufficient_trades", () => {
    const ranges = [
      range("rsi_max_long", 50, 70),
      range("vol_ratio_min", 1, 2),
      range("pullback_max_dist", 0.01, 0.05),
    ];
    const { ranges: next } = applySearchSpaceMutation(
      ranges,
      {
        version: 1,
        actions: [{ type: "widen_entry_filters", reasonKo: "거래 부족" }],
        nextFamilyHint: null,
      },
      ["insufficient_trades"],
    );
    expect(
      next.find((r) => r.key === "rsi_max_long")!.max as number,
    ).toBeCloseTo(70 * 1.1, 8);
    expect(
      next.find((r) => r.key === "vol_ratio_min")!.min as number,
    ).toBeCloseTo(1 * 0.9, 8);
    expect(
      next.find((r) => r.key === "pullback_max_dist")!.max as number,
    ).toBeCloseTo(0.05 * 1.1, 8);
  });

  it("leaves keys not in the active space unchanged / untouched", () => {
    const ranges = [range("ema_fast", 8, 40, 1)];
    const { ranges: next, record } = applySearchSpaceMutation(
      ranges,
      {
        version: 1,
        actions: [{ type: "tighten_risk", reasonKo: "낙폭" }],
        nextFamilyHint: null,
      },
      ["excessive_drawdown"],
    );
    // sl_atr_mult / tp_atr_mult absent — no mutations for them
    expect(record.mutations.every((m) => m.key !== "sl_atr_mult")).toBe(true);
    expect(record.mutations.every((m) => m.key !== "tp_atr_mult")).toBe(true);
    // ema_fast max may shrink slightly
    expect(next).toHaveLength(1);
    expect(next[0]!.key).toBe("ema_fast");
  });

  it("does not mutate for advance_family / continue_runtime alone", () => {
    const ranges = [range("sl_atr_mult", 1, 3), range("vol_ratio_min", 1, 2)];
    const { record } = applySearchSpaceMutation(
      ranges,
      {
        version: 1,
        actions: [
          { type: "continue_runtime", reasonKo: "계속" },
          { type: "advance_family", reasonKo: "다음" },
        ],
        nextFamilyHint: "next",
      },
      [],
    );
    expect(record.mutations).toHaveLength(0);
  });
});

describe("createEmptySearchPlan mutation fields", () => {
  it("includes mutatedParameterRanges and lastMutation as null", () => {
    const plan = createEmptySearchPlan({
      searchName: "mutation-plan",
      depthProfile: "fast",
      qualificationProfile: "balanced",
      qualifiedTarget: 1,
      candidateBudget: 50,
      stageBatchSize: 10,
      maxRuntimeMs: 60_000,
      spaces: [{ id: "ema_core", labelKo: "EMA" }],
    });
    expect(plan.mutatedParameterRanges).toBeNull();
    expect(plan.lastMutation).toBeNull();
  });
});
