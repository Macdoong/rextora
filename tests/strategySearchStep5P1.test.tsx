/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it } from "vitest";
import {
  createDefaultOperatorFormState,
  operatorFormToCreateBody,
  type StrategySearchOperatorFormState,
} from "@/components/rextora/strategySearch/formDefaults";
import { JobCreateForm } from "@/components/rextora/strategySearch/JobCreateForm";
import {
  StrategySearchFinalReview,
  step5SearchObjectiveLabel,
} from "@/components/rextora/strategySearch/guided/StrategySearchFinalReview";
import { earliestGuidedStepForErrors } from "@/components/rextora/strategySearch/guided/strategySearchStepModel";
import {
  releaseSubmitLock,
  strategySearchStartedDetail,
  tryAcquireSubmitLock,
} from "@/components/rextora/strategySearch/guided/strategySearchStartFeedback";
import { QUALIFIED_TARGET_CUSTOM_COMPARISON_LABEL_KO } from "@/components/rextora/strategySearch/guided/qualifiedTargetComparisonProfileDisplay";

function ReviewHarness(props: { form: StrategySearchOperatorFormState }) {
  return <StrategySearchFinalReview form={props.form} onEditStep={() => {}} />;
}

describe("Strategy Search Step 5 P1", () => {
  afterEach(() => cleanup());

  it("shows fee and slippage review text without changing request units", () => {
    const form = createDefaultOperatorFormState();
    form.feeRate = "0.0004";
    form.slippageRate = "0.0002";
    render(<ReviewHarness form={form} />);
    const feeCard = screen.getByTestId("ss-guided-review-fee").closest(
      ".ss-guided-launch-summary__cost-card",
    );
    expect(feeCard?.textContent).toContain("0.0004");
    expect(feeCard?.textContent).toContain("0.04%");
    const slipCard = screen.getByTestId("ss-guided-review-slippage").closest(
      ".ss-guided-launch-summary__cost-card",
    );
    expect(slipCard?.textContent).toContain("0.0002");
    expect(slipCard?.textContent).toContain("0.02%");
    const body = operatorFormToCreateBody(form);
    expect(body.baseCostConfig.feeRate).toBeCloseTo(0.0004);
    expect(body.baseCostConfig.slippageRate).toBeCloseTo(0.0002);
  });

  it("qualified-target custom profile uses the comparison label in review", () => {
    const form = createDefaultOperatorFormState();
    form.autoStrategyCombo = true;
    form.autoSearchObjective = "qualified_target";
    form.qualificationProfile = "custom";
    render(<ReviewHarness form={form} />);
    expect(screen.getByTestId("ss-guided-target-comparison-profile").textContent).toBe(
      QUALIFIED_TARGET_CUSTOM_COMPARISON_LABEL_KO,
    );
    fireEvent.click(screen.getByText("상세 보기"));
    expect(screen.getByTestId("ss-guided-final-review").textContent).toContain(
      QUALIFIED_TARGET_CUSTOM_COMPARISON_LABEL_KO,
    );
    expect(screen.getByTestId("ss-guided-final-review").textContent).not.toContain(
      "직접 입력",
    );
    expect(step5SearchObjectiveLabel(form)).toBe("목표 기준 자동 탐색");
    expect(screen.getByTestId("ss-guided-launch-summary").textContent).toContain(
      "목표 기준 자동 탐색",
    );
  });

  it("time-budget automatic review uses the time objective label and 합격 기준", () => {
    const form = createDefaultOperatorFormState();
    form.autoSearchObjective = "time_budget";
    form.qualificationProfile = "balanced";
    render(<ReviewHarness form={form} />);
    expect(step5SearchObjectiveLabel(form)).toBe("시간 기준 자동 탐색");
    expect(screen.getByTestId("ss-guided-launch-summary").textContent).toContain(
      "시간 기준 자동 탐색",
    );
    expect(screen.getByTestId("ss-guided-review-탐색 방식").textContent).toContain(
      "시간 기준 자동 탐색",
    );
    expect(screen.getByTestId("ss-guided-review-검증 · 위험").textContent).not.toContain(
      "후보 비교 기준",
    );
  });

  it("success copy follows stop semantics", () => {
    const time = createDefaultOperatorFormState();
    time.autoSearchObjective = "time_budget";
    expect(strategySearchStartedDetail(time, "탐색A")).not.toContain("합격 목표");
    expect(strategySearchStartedDetail(time, "탐색A")).toContain("탐색 시간");

    const target = createDefaultOperatorFormState();
    target.autoStrategyCombo = true;
    target.autoSearchObjective = "qualified_target";
    expect(strategySearchStartedDetail(target, "탐색B")).toContain("목표 조건");
    expect(strategySearchStartedDetail(target, "탐색B")).not.toContain("합격 목표까지");

    const direct = createDefaultOperatorFormState();
    direct.autoStrategyCombo = false;
    direct.patternConfigLevel = "basic";
    expect(strategySearchStartedDetail(direct, "탐색C")).toContain("확인한 설정");
    expect(strategySearchStartedDetail(direct, "탐색C")).not.toContain("합격 목표");
  });

  it("routes the earliest invalid field to its guided step", () => {
    expect(
      earliestGuidedStepForErrors([
        { field: "feeRate", message: "수수료가 올바르지 않습니다." },
        { field: "symbol", message: "마켓을 선택하세요." },
      ]),
    ).toBe("market");
    expect(
      earliestGuidedStepForErrors([
        { field: "selectedSpaceIds", message: "전략군을 선택하세요." },
      ]),
    ).toBe("strategy");

    const form = createDefaultOperatorFormState();
    function Harness() {
      const [step, setStep] = useState(form);
      const [redirect, setRedirect] = useState<
        { field: string; message: string }[] | null
      >(null);
      return (
        <>
          <button type="button" onClick={() => setRedirect([{ field: "feeRate", message: "수수료가 올바르지 않습니다." }])}>
            redirect
          </button>
          <JobCreateForm
            form={step}
            errors={redirect ?? []}
            submitting={false}
            onChange={setStep}
            onSubmit={() => {}}
            validationRedirectErrors={redirect}
          />
        </>
      );
    }
    render(<Harness />);
    for (let i = 0; i < 4; i += 1) {
      fireEvent.click(screen.getByTestId("ss-guided-next"));
    }
    expect(screen.getByTestId("ss-guided-step-surface").getAttribute("data-guided-step-id")).toBe(
      "review",
    );
    fireEvent.click(screen.getByText("redirect"));
    expect(screen.getByTestId("ss-guided-step-surface").getAttribute("data-guided-step-id")).toBe(
      "validation",
    );
  });

  it("ignores a second synchronous submit while the lock is held", async () => {
    const lock = { current: false };
    let creates = 0;
    let starts = 0;
    async function submit() {
      if (!tryAcquireSubmitLock(lock)) return;
      try {
        creates += 1;
        starts += 1;
        await Promise.resolve();
      } finally {
        releaseSubmitLock(lock);
      }
    }
    const first = submit();
    const second = submit();
    await Promise.all([first, second]);
    expect(creates).toBe(1);
    expect(starts).toBe(1);
    expect(tryAcquireSubmitLock(lock)).toBe(true);
  });
});
