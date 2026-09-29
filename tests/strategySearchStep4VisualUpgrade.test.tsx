/** @vitest-environment jsdom */
import fs from "node:fs";
import path from "node:path";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it } from "vitest";
import {
  createDefaultOperatorFormState,
  operatorFormToCreateBody,
  type StrategySearchOperatorFormState,
} from "@/components/rextora/strategySearch/formDefaults";
import { JobCreateForm } from "@/components/rextora/strategySearch/JobCreateForm";
import { STEP4_BAND_LABELS, validationStepGuideCopy } from "@/components/rextora/strategySearch/guided/step4ValidationPresentation";
import { Step4LeverageRangeVisual } from "@/components/rextora/strategySearch/visual/Step4LeverageRangeVisual";
import { COST_STRESS_HELP } from "@/components/rextora/strategySearch/visual/searchVisualCopy";

function Step4Harness(props: { form: StrategySearchOperatorFormState }) {
  const [form, setForm] = useState(props.form);
  return (
    <JobCreateForm
      form={form}
      errors={[]}
      submitting={false}
      onChange={setForm}
      onSubmit={() => {}}
    />
  );
}

function goToStep4() {
  for (let i = 0; i < 3; i += 1) {
    fireEvent.click(screen.getByTestId("ss-guided-next"));
  }
}

describe("Strategy Search Step 4 visual upgrade", () => {
  afterEach(() => cleanup());

  it("uses mode-correct qualified-target band copy and KPI values from form", () => {
    const form = createDefaultOperatorFormState();
    form.autoStrategyCombo = true;
    form.autoSearchObjective = "qualified_target";
    form.minTotalReturn = "12.5";
    form.maxMdd = "18";
    form.minTradeCount = "7";
    render(<Step4Harness form={form} />);
    goToStep4();
    expect(screen.getByText(STEP4_BAND_LABELS.evaluation)).toBeTruthy();
    expect(
      screen.getByText(
        "2단계 목표 조건은 그대로 사용하고, 통과 후보의 비교 기준과 파라미터 재확인을 설정합니다.",
      ),
    ).toBeTruthy();
    expect(screen.getByTestId("ss-guided-target-summary").textContent).toContain(
      "≥ 12.5%",
    );
    expect(screen.getByTestId("ss-guided-target-summary").textContent).toContain(
      "≤ 18%",
    );
    expect(screen.getByTestId("ss-guided-target-summary").textContent).toContain(
      "≥ 7회",
    );
    const guide = validationStepGuideCopy(true);
    expect(guide.taskKo).toContain("2단계 목표 조건을 확인하고");
  });

  it("keeps time-budget band labels without qualified-target-only description", () => {
    const form = createDefaultOperatorFormState();
    form.autoSearchObjective = "time_budget";
    render(<Step4Harness form={form} />);
    goToStep4();
    expect(screen.getByText(STEP4_BAND_LABELS.cost)).toBeTruthy();
    expect(screen.getByText("합격 기준과 거래 수·수익률, 파라미터 재확인을 설정합니다.")).toBeTruthy();
    expect(
      screen.queryByText(
        "2단계 목표 조건은 그대로 사용하고, 통과 후보의 비교 기준과 파라미터 재확인을 설정합니다.",
      ),
    ).toBeNull();
  });

  it("preserves step 2 edit navigation and request semantics", () => {
    const form = createDefaultOperatorFormState();
    form.autoSearchObjective = "qualified_target";
    form.feeRate = "0.0004";
    form.slippageRate = "0.0002";
    form.stressEnabled = true;
    render(<Step4Harness form={form} />);
    goToStep4();
    expect(screen.getByTestId("ss-guided-target-edit-step2")).toBeTruthy();
    expect(screen.queryByText("검증 강도")).toBeNull();
    const body = operatorFormToCreateBody(form);
    expect(body.baseCostConfig.feeRate).toBeCloseTo(0.0004);
    expect(body.baseCostConfig.slippageRate).toBeCloseTo(0.0002);
    expect(body.costStressScenarios[0]?.requiredForPass).toBe(false);
    expect(screen.getByText(COST_STRESS_HELP)).toBeTruthy();
  });

  it("leverage visual is read-only and does not expose inputs", () => {
    render(
      <Step4LeverageRangeVisual
        leverageMode="range"
        leverageFixed="3"
        leverageMin="2"
        leverageMax="5"
      />,
    );
    expect(screen.getByTestId("ss-step4-leverage-visual").textContent).toContain(
      "2x — 5x",
    );
    expect(document.querySelector("input")).toBeNull();
  });

  it("includes reduced-motion rules for Step 4 entrance", () => {
    const css = fs.readFileSync(
      path.join(process.cwd(), "components/rextora/v3/strategy-search.css"),
      "utf8",
    );
    expect(css).toMatch(/\.ss-step4-enter[\s\S]*@keyframes ss-step4-band-enter/);
    expect(css).toMatch(
      /prefers-reduced-motion[\s\S]*\.ss-step4-enter[\s\S]*animation:\s*none/,
    );
  });
});
