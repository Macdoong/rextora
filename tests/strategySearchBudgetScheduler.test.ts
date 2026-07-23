import { describe, expect, it } from "vitest";
import {
  allocateCurrentFamilyBudget,
  advanceToNextSpace,
  createEmptySearchPlan,
  familyBudgetRemaining,
  markSpaceCompleted,
  updateCurrentFamilySpent,
} from "../src/lib/rextora/strategySearch/searchPlan";
import { SEARCH_DEPTH_PROFILES } from "../src/lib/rextora/strategySearch/operatorProfiles";

describe("strategy search global budget scheduler", () => {
  it("allocates fair share so one family cannot take the whole budget", () => {
    const plan = createEmptySearchPlan({
      searchName: "t",
      depthProfile: "standard",
      qualificationProfile: "aggressive",
      qualifiedTarget: 1,
      candidateBudget: 100,
      stageBatchSize: 20,
      maxRuntimeMs: null,
      spaces: [
        { id: "ema_core", labelKo: "EMA 추세" },
        { id: "rsi_pullback", labelKo: "RSI 되돌림" },
        { id: "breakout", labelKo: "변동성 돌파" },
        { id: "risk_exits", labelKo: "ATR 손익" },
        { id: "full_safe", labelKo: "SAFE 종합" },
      ],
    });
    const allocated = allocateCurrentFamilyBudget(plan);
    const space = allocated.spaces[0]!;
    expect(space.budgetAllocated).toBe(20); // ceil(100/5)
    expect(familyBudgetRemaining(allocated)).toBe(20);
  });

  it("hands remaining global budget to the next family after completion", () => {
    let plan = createEmptySearchPlan({
      searchName: "t",
      depthProfile: "fast",
      qualificationProfile: "aggressive",
      qualifiedTarget: 1,
      candidateBudget: 100,
      stageBatchSize: 20,
      maxRuntimeMs: null,
      spaces: [
        { id: "ema_core", labelKo: "EMA 추세" },
        { id: "rsi_pullback", labelKo: "RSI 되돌림" },
        { id: "breakout", labelKo: "변동성 돌파" },
        { id: "risk_exits", labelKo: "ATR 손익" },
        { id: "full_safe", labelKo: "SAFE 종합" },
      ],
    });
    plan = allocateCurrentFamilyBudget(plan);
    expect(plan.spaces[0]!.budgetAllocated).toBe(20);

    // EMA spent its allocation (20 unique)
    plan = {
      ...plan,
      globalSeenHashes: Array.from({ length: 20 }, (_, i) => `h${i}`),
      uniqueEvaluatedCount: 20,
      candidateBudgetUsed: 20,
    };
    plan = updateCurrentFamilySpent(plan, 20);
    expect(familyBudgetRemaining(plan)).toBe(0);

    plan = markSpaceCompleted(plan);
    plan = advanceToNextSpace(plan);
    expect(plan.currentSpaceIndex).toBe(1);
    expect(plan.spaces[0]!.status).toBe("completed");
    expect(plan.spaces[1]!.status).toBe("active");

    plan = allocateCurrentFamilyBudget(plan);
    // remaining global 80 / 4 families = 20
    expect(plan.spaces[1]!.budgetAllocated).toBe(20);
    expect(plan.spaces[1]!.labelKo).toBe("RSI 되돌림");
  });

  it("hands remaining budget across the full EMA→RSI→Breakout→ATR→SAFE chain", () => {
    let plan = createEmptySearchPlan({
      searchName: "t",
      depthProfile: "fast",
      qualificationProfile: "aggressive",
      qualifiedTarget: 1,
      candidateBudget: 100,
      stageBatchSize: 20,
      maxRuntimeMs: null,
      spaces: [
        { id: "ema_core", labelKo: "EMA 추세" },
        { id: "rsi_pullback", labelKo: "RSI 되돌림" },
        { id: "breakout", labelKo: "변동성 돌파" },
        { id: "risk_exits", labelKo: "ATR 손익" },
        { id: "full_safe", labelKo: "SAFE 종합" },
      ],
    });
    const labels: string[] = [];
    for (let i = 0; i < 5; i++) {
      plan = allocateCurrentFamilyBudget(plan);
      const space = plan.spaces[plan.currentSpaceIndex]!;
      labels.push(space.labelKo);
      const alloc = space.budgetAllocated!;
      expect(alloc).toBeLessThan(100);
      expect(alloc).toBeGreaterThan(0);
      plan = {
        ...plan,
        globalSeenHashes: [
          ...plan.globalSeenHashes,
          ...Array.from({ length: alloc }, (_, j) => `${space.id}_${j}`),
        ],
        uniqueEvaluatedCount: plan.uniqueEvaluatedCount + alloc,
        candidateBudgetUsed: plan.candidateBudgetUsed + alloc,
      };
      plan = updateCurrentFamilySpent(plan, alloc);
      if (i < 4) {
        plan = markSpaceCompleted(plan);
        plan = advanceToNextSpace(plan);
      }
    }
    expect(labels).toEqual([
      "EMA 추세",
      "RSI 되돌림",
      "변동성 돌파",
      "ATR 손익",
      "SAFE 종합",
    ]);
    expect(plan.candidateBudgetUsed).toBe(100);
    expect(plan.spaces.every((s) => (s.budgetAllocated ?? 0) < 100)).toBe(
      true,
    );
  });
});
