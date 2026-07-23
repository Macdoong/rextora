/**
 * Orchestrator family handoff simulation (same control flow as searchOrchestrator).
 */
import { describe, expect, it } from "vitest";
import {
  allocateCurrentFamilyBudget,
  advanceToNextSpace,
  createEmptySearchPlan,
  familyBudgetRemaining,
  markSpaceCompleted,
  updateCurrentFamilySpent,
  type StrategySearchPlan,
} from "../src/lib/rextora/strategySearch/searchPlan";

function remainingGlobal(plan: StrategySearchPlan): number {
  return Math.max(0, plan.candidateBudget - plan.candidateBudgetUsed);
}

/** Mirrors searchOrchestrator.handoffToNextFamily (completed mode). */
function handoffCompleted(plan: StrategySearchPlan): StrategySearchPlan | null {
  let next = markSpaceCompleted(plan);
  const before = next.currentSpaceIndex;
  next = advanceToNextSpace(next);
  if (
    next.completionReason === "SEARCH_SPACE_EXHAUSTED" ||
    next.currentSpaceIndex === before
  ) {
    return null;
  }
  return allocateCurrentFamilyBudget(next);
}

/**
 * Simulate orchestrator loop: each family spends its allocation via max_iterations,
 * then hands remaining global budget to the next family.
 */
function simulateFamilyChain(budget: number): {
  transitions: string[];
  plan: StrategySearchPlan;
} {
  let plan = createEmptySearchPlan({
    searchName: "sim",
    depthProfile: "fast",
    qualificationProfile: "aggressive",
    qualifiedTarget: 99,
    candidateBudget: budget,
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
  const transitions: string[] = [];

  while (
    remainingGlobal(plan) > 0 &&
    plan.currentSpaceIndex < plan.spaces.length
  ) {
    const space = plan.spaces[plan.currentSpaceIndex]!;
    const spend = familyBudgetRemaining(plan);
    if (spend <= 0) {
      const handed = handoffCompleted(plan);
      if (!handed) break;
      const nextLabel = handed.spaces[handed.currentSpaceIndex]!.labelKo;
      transitions.push(`${space.labelKo}→${nextLabel}`);
      plan = handed;
      continue;
    }
    plan = {
      ...plan,
      globalSeenHashes: [
        ...plan.globalSeenHashes,
        ...Array.from(
          { length: spend },
          (_, i) => `${space.id}_${plan.globalSeenHashes.length + i}`,
        ),
      ],
      uniqueEvaluatedCount: plan.uniqueEvaluatedCount + spend,
      candidateBudgetUsed: plan.candidateBudgetUsed + spend,
    };
    plan = updateCurrentFamilySpent(plan, (space.budgetSpent ?? 0) + spend);

    if (familyBudgetRemaining(plan) <= 0) {
      const handed = handoffCompleted(plan);
      if (!handed) break;
      const nextLabel = handed.spaces[handed.currentSpaceIndex]!.labelKo;
      transitions.push(`${space.labelKo}→${nextLabel}`);
      plan = handed;
    }
  }

  return { transitions, plan };
}

describe("orchestrator family handoff simulation", () => {
  it("transitions EMA→RSI→Breakout→ATR→SAFE without one family taking all budget", () => {
    const { transitions, plan } = simulateFamilyChain(100);
    expect(transitions).toEqual([
      "EMA 추세→RSI 되돌림",
      "RSI 되돌림→변동성 돌파",
      "변동성 돌파→ATR 손익",
      "ATR 손익→SAFE 종합",
    ]);
    for (const s of plan.spaces) {
      expect(s.budgetAllocated ?? 0).toBeLessThan(100);
      expect(s.budgetSpent ?? 0).toBeGreaterThan(0);
    }
    expect(plan.candidateBudgetUsed).toBe(100);
    expect(plan.spaces[0]!.status).toBe("completed");
    expect(plan.spaces[4]!.labelKo).toBe("SAFE 종합");
  });

  it("stops early when PASS target is reached (budget conserved)", () => {
    let plan = createEmptySearchPlan({
      searchName: "pass-stop",
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
    plan = {
      ...plan,
      globalSeenHashes: ["a", "b", "c", "d", "e"],
      uniqueEvaluatedCount: 5,
      candidateBudgetUsed: 5,
      qualifiedHashes: ["pass1"],
    };
    plan = updateCurrentFamilySpent(plan, 5);
    expect(plan.qualifiedHashes.length >= plan.qualifiedTarget).toBe(true);
    expect(remainingGlobal(plan)).toBe(95);
    expect(plan.spaces[1]!.status).toBe("pending");
    expect(plan.spaces[0]!.status).toBe("active");
  });
});
