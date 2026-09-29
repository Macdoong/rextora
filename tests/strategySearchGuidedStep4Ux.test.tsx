/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it } from "vitest";
import {
  createDefaultOperatorFormState,
  operatorFormToCreateBody,
  resolveScoreWeights,
  type StrategySearchOperatorFormState,
} from "@/components/rextora/strategySearch/formDefaults";
import { JobCreateForm } from "@/components/rextora/strategySearch/JobCreateForm";
import { StrategySearchFinalReview } from "@/components/rextora/strategySearch/guided/StrategySearchFinalReview";
import { STRATEGY_SEARCH_FIELD_HELP } from "@/components/rextora/strategySearch/guided/strategySearchFieldHelpContent";
import { QUALIFIED_TARGET_CUSTOM_COMPARISON_LABEL_KO } from "@/components/rextora/strategySearch/guided/qualifiedTargetComparisonProfileDisplay";
import { buildStepCompactSummaries } from "@/components/rextora/strategySearch/guided/strategySearchStepModel";

function targetForm(): StrategySearchOperatorFormState {
  const form = createDefaultOperatorFormState();
  form.autoStrategyCombo = true;
  form.autoSearchObjective = "qualified_target";
  form.minTotalReturn = "12.5";
  form.maxMdd = "18";
  form.mddPreset = "custom";
  form.minTradeCount = "7";
  form.minWinRate = "41";
  form.minScore = "0.2";
  form.qualificationProfile = "custom";
  return form;
}

function Step4Harness(props: { form: StrategySearchOperatorFormState }) {
  const [form, setForm] = useState(props.form);
  return (
    <div>
      <JobCreateForm
        form={form}
        errors={[]}
        submitting={false}
        onChange={setForm}
        onSubmit={() => {}}
      />
      <output data-testid="ss-threshold-snapshot">
        {[
          form.minTotalReturn,
          form.maxMdd,
          form.minTradeCount,
          form.minWinRate,
          form.minScore,
        ].join("|")}
      </output>
    </div>
  );
}

describe("Guided Step 4 semantic UX", () => {
  afterEach(() => cleanup());

  it("qualified-target Step 4 does not expose a control that rewrites Step 2 thresholds", () => {
    const form = targetForm();
    const before = [
      form.minTotalReturn,
      form.maxMdd,
      form.minTradeCount,
      form.minWinRate,
      form.minScore,
    ].join("|");
    render(<Step4Harness form={form} />);
    for (let i = 0; i < 3; i += 1) {
      fireEvent.click(screen.getByTestId("ss-guided-next"));
    }
    expect(screen.getByTestId("ss-guided-step-surface").getAttribute("data-guided-step-id")).toBe(
      "validation",
    );
    expect(screen.getByTestId("ss-qualification-target-managed")).toBeTruthy();
    expect(screen.queryByLabelText("합격 기준")).toBeNull();
    expect(document.getElementById("ss-qualification")).toBeNull();

    fireEvent.click(screen.getByTestId("ss-jitter-enabled"));
    fireEvent.click(screen.getByTestId("ss-stress-enabled"));
    fireEvent.change(screen.getByTestId("ss-fee"), { target: { value: "0.0005" } });
    fireEvent.change(screen.getByTestId("ss-slippage"), { target: { value: "0.0003" } });
    fireEvent.change(screen.getByTestId("ss-leverage-mode"), {
      target: { value: "disabled" },
    });

    expect(screen.getByTestId("ss-threshold-snapshot").textContent).toBe(before);
    expect(screen.getByTestId("ss-comparison-profile")).toBeTruthy();
    expect(screen.getByTestId("ss-guided-target-summary")).toBeTruthy();

    fireEvent.change(screen.getByTestId("ss-comparison-profile"), {
      target: { value: "conservative" },
    });
    expect(
      (screen.getByTestId("ss-comparison-profile") as HTMLSelectElement).value,
    ).toBe("conservative");
    expect(screen.getByTestId("ss-threshold-snapshot").textContent).toBe(before);
  });

  it("time-budget and direct modes keep the qualification selector", () => {
    const time = createDefaultOperatorFormState();
    time.autoSearchObjective = "time_budget";
    const { unmount } = render(<Step4Harness form={time} />);
    for (let i = 0; i < 3; i += 1) {
      fireEvent.click(screen.getByTestId("ss-guided-next"));
    }
    expect(document.getElementById("ss-qualification")).toBeTruthy();
    expect(screen.queryByTestId("ss-comparison-profile")).toBeNull();
    unmount();

    const direct = createDefaultOperatorFormState();
    direct.autoStrategyCombo = false;
    direct.patternConfigLevel = "basic";
    direct.autoSearchObjective = "time_budget";
    render(<Step4Harness form={direct} />);
    for (let i = 0; i < 3; i += 1) {
      fireEvent.click(screen.getByTestId("ss-guided-next"));
    }
    expect(document.getElementById("ss-qualification")).toBeTruthy();
    expect(screen.queryByTestId("ss-comparison-profile")).toBeNull();
    const directQual = document.getElementById("ss-qualification") as HTMLSelectElement;
    const directCustom = Array.from(directQual.options).find((o) => o.value === "custom");
    expect(directCustom?.textContent).toBe("직접 설정");
  });

  it("comparison profile changes score weights without changing target thresholds", () => {
    const before = targetForm();
    const after = { ...before, qualificationProfile: "conservative" as const };
    expect(after.minTotalReturn).toBe(before.minTotalReturn);
    expect(after.maxMdd).toBe(before.maxMdd);
    expect(after.minTradeCount).toBe(before.minTradeCount);
    expect(after.minWinRate).toBe(before.minWinRate);
    expect(after.minScore).toBe(before.minScore);
    const beforeBody = operatorFormToCreateBody(before);
    const afterBody = operatorFormToCreateBody(after);
    expect(beforeBody.passPolicy).toEqual(afterBody.passPolicy);
    expect(beforeBody.operatorPlan?.minScore).toBe(afterBody.operatorPlan?.minScore);
    expect(afterBody.operatorPlan?.qualificationProfile).toBe("conservative");
    expect(resolveScoreWeights(after)).toEqual({ returnWeight: 0.8, mddWeight: 1.2 });
    expect(afterBody.scoreWeights.returnWeight).toBeCloseTo(0.8);
    expect(afterBody.scoreWeights.mddWeight).toBeCloseTo(1.2);
    expect(beforeBody.scoreWeights.returnWeight).toBeCloseTo(1);
  });

  it("stress and stability copy match evidence-only semantics", () => {
    const stress = STRATEGY_SEARCH_FIELD_HELP.stressEnabled;
    const jitter = STRATEGY_SEARCH_FIELD_HELP.jitterEnabled;
    const profile = STRATEGY_SEARCH_FIELD_HELP.qualificationProfile;
    expect(stress?.title).toBe("비용 1.5배 추가 검증");
    expect(`${stress?.what} ${stress?.impact}`).toContain("합격 여부를 직접 바꾸지는 않습니다");
    expect(`${stress?.what} ${stress?.impact}`).not.toContain("통과 후보가 줄");
    expect(jitter?.title).toContain("파라미터");
    expect(`${jitter?.title} ${jitter?.what} ${jitter?.impact}`).not.toMatch(/jitter/i);
    expect(`${jitter?.what} ${jitter?.impact}`).not.toContain("통과 후보가 줄");
    expect(`${profile?.what} ${profile?.how}`).toContain("최대 낙폭 한도는 아래에서 별도로");
    expect(`${profile?.what} ${profile?.impact} ${profile?.how}`).not.toContain("낙폭을 낮게");
    const comparison = STRATEGY_SEARCH_FIELD_HELP.candidateComparisonProfile;
    expect(comparison?.title).toBe("후보 비교 기준");
    expect(comparison?.what).toContain("점수와 순위");
    expect(`${comparison?.what} ${comparison?.impact} ${comparison?.how}`).toContain(
      "목표 조건",
    );
    expect(comparison?.how).toContain(
      "직접 설정은 현재 후보 점수 계산에서는 균형형과 같은 기준을 사용합니다",
    );
    expect(`${comparison?.what} ${comparison?.impact}`).not.toMatch(
      /returnWeight|mddWeight|resolveScoreWeights/,
    );
    expect(STRATEGY_SEARCH_FIELD_HELP.feeRate?.how).toContain("0.0004 = 0.04%");
    expect(STRATEGY_SEARCH_FIELD_HELP.slippageRate?.how).toContain("0.0002 = 0.02%");
  });

  it("customer surfaces say 최대 낙폭 and Step 5 shows parameter re-check", () => {
    const form = createDefaultOperatorFormState();
    form.jitterEnabled = true;
    const summaries = buildStepCompactSummaries(form);
    const validation = summaries.find((row) => row.stepId === "validation");
    expect(validation?.lineKo).toContain("최대 낙폭");
    expect(validation?.lineKo).not.toContain("최대 MDD");

    render(<StrategySearchFinalReview form={form} onEditStep={() => {}} />);
    const card = screen.getByTestId("ss-guided-review-검증 · 위험");
    expect(card.textContent).toContain("파라미터 재확인");
    expect(card.textContent).toContain("사용");
    expect(card.textContent).not.toContain("최대 MDD");
    expect(card.textContent).not.toMatch(/jitter/i);

    cleanup();
    const target = targetForm();
    target.qualificationProfile = "aggressive";
    render(<StrategySearchFinalReview form={target} onEditStep={() => {}} />);
    const targetReview = screen.getByTestId("ss-guided-target-review");
    expect(targetReview.textContent).toContain("목표 조건");
    expect(targetReview.textContent).toContain("12.5%");
    expect(targetReview.textContent).toContain("후보 비교 기준");
    expect(screen.getByTestId("ss-guided-target-comparison-profile").textContent).toBe(
      "수익형",
    );
    expect(targetReview.textContent).not.toContain("합격 기준");

    cleanup();
    const targetCustom = targetForm();
    targetCustom.qualificationProfile = "custom";
    render(<StrategySearchFinalReview form={targetCustom} onEditStep={() => {}} />);
    expect(screen.getByTestId("ss-guided-target-comparison-profile").textContent).toBe(
      QUALIFIED_TARGET_CUSTOM_COMPARISON_LABEL_KO,
    );
  });

  it("qualified-target Step 4 custom comparison option keeps value custom with extended label", () => {
    const form = targetForm();
    form.qualificationProfile = "balanced";
    render(<Step4Harness form={form} />);
    for (let i = 0; i < 3; i += 1) {
      fireEvent.click(screen.getByTestId("ss-guided-next"));
    }
    const select = screen.getByTestId("ss-comparison-profile") as HTMLSelectElement;
    const customOption = Array.from(select.options).find((o) => o.value === "custom");
    expect(customOption).toBeTruthy();
    expect(customOption?.textContent).toBe(QUALIFIED_TARGET_CUSTOM_COMPARISON_LABEL_KO);

    const before = screen.getByTestId("ss-threshold-snapshot").textContent;
    fireEvent.change(select, { target: { value: "custom" } });
    expect(select.value).toBe("custom");
    expect(screen.getByTestId("ss-threshold-snapshot").textContent).toBe(before);

    const updated = { ...form, qualificationProfile: "custom" as const };
    const body = operatorFormToCreateBody(updated);
    expect(body.operatorPlan?.qualificationProfile).toBe("custom");
    expect(resolveScoreWeights(updated)).toEqual({ returnWeight: 1, mddWeight: 0.5 });
    expect(body.scoreWeights.returnWeight).toBeCloseTo(1);
    expect(body.scoreWeights.mddWeight).toBeCloseTo(0.5);
  });

  it("time-budget qualification custom option label stays 직접 설정", () => {
    const time = createDefaultOperatorFormState();
    time.autoSearchObjective = "time_budget";
    render(<Step4Harness form={time} />);
    for (let i = 0; i < 3; i += 1) {
      fireEvent.click(screen.getByTestId("ss-guided-next"));
    }
    const qual = document.getElementById("ss-qualification") as HTMLSelectElement;
    const customOption = Array.from(qual.options).find((o) => o.value === "custom");
    expect(customOption?.textContent).toBe("직접 설정");
  });

  it("request semantics for fee, stress, and jitter stay unchanged", () => {
    const form = createDefaultOperatorFormState();
    form.feeRate = "0.0004";
    form.slippageRate = "0.0002";
    form.stressEnabled = true;
    form.jitterEnabled = true;
    const body = operatorFormToCreateBody(form);
    expect(body.baseCostConfig.feeRate).toBeCloseTo(0.0004);
    expect(body.baseCostConfig.slippageRate).toBeCloseTo(0.0002);
    expect(body.costStressScenarios[0]?.requiredForPass).toBe(false);
    expect(body.costStressScenarios[0]?.feeMultiplier).toBeCloseTo(1.5);
    expect(body.jitterConfig.enabled).toBe(true);
    expect(body.jitterConfig.minimumPassRate).toBe(0);
    expect(body.jitterConfig.maximumScoreDropRatio).toBe(1);
    expect(body.passPolicy.thresholds.maxMdd).toBeCloseTo(-0.25);
  });
});
