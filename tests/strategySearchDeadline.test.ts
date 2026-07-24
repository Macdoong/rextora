import { describe, expect, it } from "vitest";
import {
  SAFETY_BUDGET_CEILING,
  activeElapsedMs,
  createEmptySearchPlan,
  markPlanPaused,
  markPlanResumed,
  replenishDeadlineBudget,
  type StrategySearchPlan,
} from "../src/lib/rextora/strategySearch/searchPlan";
import { completionReasonLabelKo } from "../components/rextora/strategySearch/formatters";

describe("deadline-primary stopping helpers", () => {
  it("createEmptySearchPlan with maxRuntimeMs keeps deadline fields", () => {
    const plan = createEmptySearchPlan({
      searchName: "deadline",
      depthProfile: "fast",
      qualificationProfile: "balanced",
      qualifiedTarget: 1,
      candidateBudget: 100,
      stageBatchSize: 10,
      maxRuntimeMs: 120_000,
      spaces: [{ id: "ema_core", labelKo: "EMA" }],
    });
    expect(plan.maxRuntimeMs).toBe(120_000);
    expect(plan.completionReason).toBeNull();
    expect(plan.mutatedParameterRanges).toBeNull();
  });

  it("replenishDeadlineBudget adds another stage chunk and family allocation", () => {
    let plan = createEmptySearchPlan({
      searchName: "replenish",
      depthProfile: "fast",
      qualificationProfile: "balanced",
      qualifiedTarget: 1,
      candidateBudget: 20,
      stageBatchSize: 10,
      maxRuntimeMs: 60_000,
      spaces: [
        { id: "ema_core", labelKo: "EMA" },
        { id: "rsi_pullback", labelKo: "RSI" },
      ],
    });
    plan = {
      ...plan,
      candidateBudgetUsed: 20,
      uniqueEvaluatedCount: 20,
      spaces: plan.spaces.map((s, i) =>
        i === 0
          ? { ...s, budgetAllocated: 20, budgetSpent: 20, status: "active" }
          : s,
      ),
    };
    const next = replenishDeadlineBudget(plan);
    expect(next).not.toBeNull();
    expect(next!.candidateBudget).toBeGreaterThan(plan.candidateBudget);
    expect(next!.spaces[0]!.budgetAllocated).toBeGreaterThan(20);
    expect(next!.candidateBudget - plan.candidateBudget).toBe(
      Math.max(10, 10 * 2),
    );
  });

  it("replenishDeadlineBudget returns null at hard safety ceiling", () => {
    const plan: StrategySearchPlan = {
      ...createEmptySearchPlan({
        searchName: "ceiling",
        depthProfile: "deep",
        qualificationProfile: "balanced",
        qualifiedTarget: 1,
        candidateBudget: SAFETY_BUDGET_CEILING,
        stageBatchSize: 100,
        maxRuntimeMs: 60_000,
        spaces: [{ id: "ema_core", labelKo: "EMA" }],
      }),
      uniqueEvaluatedCount: SAFETY_BUDGET_CEILING,
      candidateBudgetUsed: SAFETY_BUDGET_CEILING,
    };
    expect(replenishDeadlineBudget(plan)).toBeNull();
  });

  it("maps DEADLINE_REACHED label for operator UI", () => {
    expect(completionReasonLabelKo("DEADLINE_REACHED")).toBe("연구 시간 종료");
    // Legacy alias
    expect(completionReasonLabelKo("MAX_RUNTIME")).toBe("연구 시간 종료");
  });

  it("paused timing excludes wall-clock from active elapsed and survives resume", () => {
    const t0 = 1_000_000;
    let plan = createEmptySearchPlan({
      searchName: "pause-timing",
      depthProfile: "fast",
      qualificationProfile: "balanced",
      qualifiedTarget: 1,
      candidateBudget: 100,
      stageBatchSize: 10,
      maxRuntimeMs: 60_000,
      spaces: [{ id: "ema_core", labelKo: "EMA" }],
    });
    plan = { ...plan, campaignStartedAtMs: t0 };
    const after10s = activeElapsedMs(plan, t0 + 10_000);
    expect(after10s).toBe(10_000);
    plan = markPlanPaused(plan, t0 + 10_000);
    expect(plan.pausedAtMs).toBe(t0 + 10_000);
    // 30s wall pause must not increase active elapsed
    expect(activeElapsedMs(plan, t0 + 40_000)).toBe(10_000);
    plan = markPlanResumed(plan, t0 + 40_000);
    expect(plan.accumulatedPauseMs).toBe(30_000);
    expect(plan.resumedAtMs).toBe(t0 + 40_000);
    expect(plan.expectedCompletionAtMs).toBe(t0 + 40_000 + 50_000);
    expect(activeElapsedMs(plan, t0 + 45_000)).toBe(15_000);
  });

  it("legacy resume without pausedAtMs preserves known active elapsed", () => {
    const t0 = 2_000_000;
    let plan = createEmptySearchPlan({
      searchName: "legacy-pause",
      depthProfile: "fast",
      qualificationProfile: "balanced",
      qualifiedTarget: 1,
      candidateBudget: 100,
      stageBatchSize: 10,
      maxRuntimeMs: 60_000,
      spaces: [{ id: "ema_core", labelKo: "EMA" }],
    });
    plan = {
      ...plan,
      campaignStartedAtMs: t0,
      elapsedMs: 12_000,
      pausedAtMs: null,
    };
    // 5 minutes wall after start with only 12s known active
    plan = markPlanResumed(plan, t0 + 300_000);
    expect(activeElapsedMs(plan, t0 + 300_000)).toBe(12_000);
    expect(plan.expectedCompletionAtMs).toBe(t0 + 300_000 + 48_000);
  });
});
