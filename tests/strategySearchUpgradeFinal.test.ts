import { describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { applySearchSpaceMutation } from "../src/lib/rextora/strategySearch/searchSpaceMutation";
import { validateSearchParameterRanges } from "../src/lib/rextora/strategySearch/paramSpace";
import {
  classifyRunFailureReason,
  inferTerminationFromFailureMessage,
  resolveTerminationReason,
  terminationReasonLabelKo,
} from "../src/lib/rextora/strategySearch/terminationReason";
import {
  evaluateOverfittingEvidence,
  hasRequiredRobustnessEvidence,
} from "../src/lib/rextora/strategySearch/overfittingEvidence";
import { evaluateHighlightEligibility } from "../src/lib/rextora/results/eligibility";
import {
  BEGINNER_PRESET_MAP,
  createDefaultOperatorFormState,
  operatorFormToCreateBody,
} from "../components/rextora/strategySearch/formDefaults";
import {
  summarizeStrategySearchConfig,
  validateStrategySearchForm,
} from "../components/rextora/strategySearch/formValidation";
import { createEmptySearchPlan, replenishDeadlineBudget } from "../src/lib/rextora/strategySearch/searchPlan";
import { SAFE_STRATEGY_ID } from "../src/lib/rextora/strategy/strategyTypes";

describe("strategy search upgrade — config + mutation defaults", () => {
  it("blocks defaultValue outside min/max at range validation", () => {
    const result = validateSearchParameterRanges([
      {
        key: "cost_guard_k",
        min: 3.2,
        max: 10,
        step: 0.01,
        valueType: "float",
        defaultValue: 3,
      },
    ]);
    expect(result.ok).toBe(false);
    expect(result.issues.some((i) => i.code === "DEFAULT_OUT_OF_RANGE")).toBe(
      true,
    );
  });

  it("clamps defaultValue after raise_cost_guard mutation", () => {
    const ranges = [
      {
        key: "cost_guard_k",
        min: 3,
        max: 10,
        step: 0.01,
        valueType: "float" as const,
        defaultValue: 3,
      },
    ];
    const { ranges: next, record } = applySearchSpaceMutation(
      ranges,
      {
        version: 1,
        actions: [{ type: "raise_cost_guard", reasonKo: "비용" }],
        nextFamilyHint: null,
      },
      ["fee_sensitive"],
    );
    const cg = next.find((r) => r.key === "cost_guard_k")!;
    expect(cg.min as number).toBeGreaterThan(3);
    expect(cg.defaultValue as number).toBeGreaterThanOrEqual(cg.min as number);
    expect(cg.defaultValue as number).toBeLessThanOrEqual(cg.max as number);
    expect(
      record.mutations.some((m) => m.field === "defaultValue"),
    ).toBe(true);
    expect(validateSearchParameterRanges(next).ok).toBe(true);
  });
});

describe("strategy search upgrade — termination reasons", () => {
  it("failed jobs always resolve a termination reason", () => {
    expect(
      resolveTerminationReason({
        status: "failed",
        completionReason: null,
        failureMessage:
          "invalid parameterRanges: defaultValue is outside configured min/max",
      }),
    ).toBe("CONFIGURATION_INVALID");
    expect(
      terminationReasonLabelKo("CONFIGURATION_INVALID"),
    ).toBe("탐색 설정 오류");
    expect(
      classifyRunFailureReason(
        "invalid parameterRanges: defaultValue is outside configured min/max",
      ),
    ).toBe("CONFIGURATION_INVALID");
    expect(inferTerminationFromFailureMessage("")).toBe("ENGINE_ERROR");
  });
});

describe("strategy search upgrade — deadline vs budget", () => {
  it("candidate budget replenishes under deadline and is not a completion target", () => {
    let plan = createEmptySearchPlan({
      searchName: "deadline-budget",
      depthProfile: "standard",
      qualificationProfile: "balanced",
      qualifiedTarget: 1,
      candidateBudget: 200,
      stageBatchSize: 40,
      maxRuntimeMs: 180 * 60 * 1000,
      spaces: [{ id: "ema_core", labelKo: "EMA" }],
    });
    plan = {
      ...plan,
      candidateBudgetUsed: 200,
      uniqueEvaluatedCount: 200,
      spaces: plan.spaces.map((s) => ({
        ...s,
        budgetAllocated: 200,
        budgetSpent: 200,
        status: "active" as const,
      })),
    };
    const next = replenishDeadlineBudget(plan);
    expect(next).not.toBeNull();
    expect(next!.candidateBudget).toBeGreaterThan(200);
    expect(next!.maxRuntimeMs).toBe(180 * 60 * 1000);
    expect(next!.completionReason).toBeNull();
  });
});

describe("strategy search upgrade — presets and form", () => {
  it("beginner presets map to verified trading styles", () => {
    expect(BEGINNER_PRESET_MAP.safe.tradingStyle).toBe("stable");
    expect(BEGINNER_PRESET_MAP.balanced.tradingStyle).toBe("balanced");
    expect(BEGINNER_PRESET_MAP.aggressive.tradingStyle).toBe("scalping");
    expect(BEGINNER_PRESET_MAP.balanced.criteriaKo.length).toBeGreaterThan(2);
  });

  it("standard create body enables robustness checks and keeps duration", () => {
    const form = createDefaultOperatorFormState();
    form.durationPreset = "180";
    form.maxRuntimeMinutesOverride = "180";
    form.stressEnabled = true;
    form.jitterEnabled = true;
    const errors = validateStrategySearchForm(form);
    expect(errors).toEqual([]);
    const body = operatorFormToCreateBody(form);
    expect(body.operatorPlan?.maxRuntimeMs).toBe(180 * 60 * 1000);
    expect(body.jitterConfig.enabled || body.costStressScenarios.length > 0).toBe(
      true,
    );
    expect(body.symbols[0]).toBeTruthy();
  });

  it("rejects configs without robustness checks", () => {
    const form = createDefaultOperatorFormState();
    form.stressEnabled = false;
    form.jitterEnabled = false;
    const summary = summarizeStrategySearchConfig(form);
    expect(summary.status).toBe("needs_fix");
    expect(summary.labelKo).toBe("수정 필요");
  });
});

describe("strategy search upgrade — overfitting + results", () => {
  it("does not fabricate overfitting probability; uses levels", () => {
    const missing = evaluateOverfittingEvidence({});
    expect(missing.overfittingRisk).toBe("unavailable");
    expect(missing.riskLevelKo).toBe("계산 불가");
    expect(JSON.stringify(missing)).not.toMatch(/%/);

    const high = evaluateOverfittingEvidence({
      jitterEnabled: true,
      jitterPassed: false,
      stressEnabled: true,
      stressPassed: false,
      monthlyConcentration: true,
      tradeCount: 2,
      minTradeCount: 10,
    });
    expect(high.overfittingRisk).toBe("high");
    expect(hasRequiredRobustnessEvidence({ overfitting: high })).toBe(false);
  });

  it("highest return alone does not guarantee final recommendation", () => {
    const highReturnNoRobust = evaluateHighlightEligibility({
      hasBacktest: true,
      totalReturn: 5,
      mdd: -0.05,
      tradeCount: 100,
      passed: true,
      strategyId: "custom_x",
      strategyHash: "abc",
      hasCostEvidence: true,
      overfittingInput: {},
    });
    expect(highReturnNoRobust.eligible).toBe(false);
    expect(highReturnNoRobust.blockers).toContain("missing_robustness");

    const withEvidence = evaluateHighlightEligibility({
      hasBacktest: true,
      totalReturn: 0.12,
      mdd: -0.08,
      tradeCount: 20,
      passed: true,
      strategyId: "custom_y",
      strategyHash: "def",
      hasCostEvidence: true,
      overfittingInput: {
        jitterEnabled: true,
        jitterPassed: true,
        stressEnabled: true,
        stressPassed: true,
        tradeCount: 20,
        minTradeCount: 5,
      },
    });
    expect(withEvidence.eligible).toBe(true);
  });
});

describe("strategy search upgrade — UI contracts + SAFE", () => {
  it("status/completion UI avoids budget-as-progress and blank termination", () => {
    const status = fs.readFileSync(
      path.join(
        process.cwd(),
        "components/rextora/strategySearch/SearchStatusCard.tsx",
      ),
      "utf8",
    );
    const completion = fs.readFileSync(
      path.join(
        process.cwd(),
        "components/rextora/strategySearch/ResearchCompletionPanel.tsx",
      ),
      "utf8",
    );
    const results = fs.readFileSync(
      path.join(process.cwd(), "components/rextora/results/ResultsWorkbench.tsx"),
      "utf8",
    );
    expect(status).toContain("resolveDisplayTerminationReason");
    expect(status).toContain("자원 안전 제한");
    expect(status).toContain("검증된 후보");
    expect(completion).toContain("정상 종료 조건 아님");
    expect(completion).not.toMatch(/\$\{formatCount\(budgetUsed\)\} \/ \$\{formatCount\(budget\)\}/);
    expect(results).toContain("새 기간으로 백테스트");
    expect(results).toContain("strategyHash=");
    expect(results).toContain("추천 가능한 안정 전략 없음");
  });

  it("SAFE remains immutable and tests use isolated temp roots", () => {
    const safePath = path.join(
      process.cwd(),
      "data/rextora/strategies/SAFE_v44_i4060.json",
    );
    const raw = fs.readFileSync(safePath, "utf8");
    expect(raw).toContain('"paramsHash": "7893ca3f0e30"');
    expect(raw).toContain(SAFE_STRATEGY_ID);
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "rextora-ss-upgrade-"));
    expect(tmp.includes("data/rextora")).toBe(false);
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it("workbench does not call exchange order adapters", () => {
    const wb = fs.readFileSync(
      path.join(
        process.cwd(),
        "components/rextora/strategySearch/StrategySearchWorkbench.tsx",
      ),
      "utf8",
    );
    expect(wb).not.toMatch(/createOrder|placeOrder|submitOrder/);
  });
});
