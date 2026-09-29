/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it } from "vitest";
import {
  createDefaultOperatorFormState,
  operatorFormToCreateBody,
  type StrategySearchOperatorFormState,
} from "@/components/rextora/strategySearch/formDefaults";
import { JobCreateForm } from "@/components/rextora/strategySearch/JobCreateForm";
import { StrategySearchFinalReview } from "@/components/rextora/strategySearch/guided/StrategySearchFinalReview";
import { QUALIFIED_TARGET_CUSTOM_COMPARISON_LABEL_KO } from "@/components/rextora/strategySearch/guided/qualifiedTargetComparisonProfileDisplay";
import {
  strategySearchStartedDetail,
  tryAcquireSubmitLock,
} from "@/components/rextora/strategySearch/guided/strategySearchStartFeedback";

function ReviewHarness(props: { form: StrategySearchOperatorFormState }) {
  return <StrategySearchFinalReview form={props.form} onEditStep={() => {}} />;
}

function goToReviewStep() {
  for (let i = 0; i < 4; i += 1) {
    fireEvent.click(screen.getByTestId("ss-guided-next"));
  }
}

describe("Strategy Search Step 5 visual upgrade", () => {
  afterEach(() => cleanup());

  it("A/B: customer timeframe in Step 5 only; request stays 15m", () => {
    const form = createDefaultOperatorFormState();
    form.timeframe = "15m";
    render(<ReviewHarness form={form} />);
    const tfRow = screen.getByTestId("ss-step5-timeframe-display");
    expect(within(tfRow).getByText("15분봉")).toBeTruthy();
    expect(screen.getByTestId("ss-guided-launch-compact").textContent).toContain(
      "15분봉",
    );
    expect(screen.getByTestId("ss-guided-final-review").textContent).not.toMatch(
      /\b15m\b/,
    );
    expect(operatorFormToCreateBody(form).timeframe).toBe("15m");
  });

  it("C/D: primary cards use labeled rows and strategy count label", () => {
    const form = createDefaultOperatorFormState();
    render(<ReviewHarness form={form} />);
    const market = screen.getByTestId("ss-guided-review-분석 대상");
    expect(within(market).getByText("대상")).toBeTruthy();
    expect(within(market).getByText("시간봉")).toBeTruthy();
    expect(within(market).getByText("분석 기간")).toBeTruthy();

    const strategy = screen.getByTestId("ss-guided-review-전략 · 범위");
    expect(within(strategy).getByText("조합")).toBeTruthy();
    expect(within(strategy).getByText("방향")).toBeTruthy();
    expect(within(strategy).getByText("전략군 수")).toBeTruthy();
    expect(screen.getByTestId("ss-step5-strategy-count").textContent).toContain(
      "5개",
    );
    expect(strategy.textContent).not.toMatch(/^자동 조합 · 양방향 · \d/);
  });

  it("E/F/G: fee/slippage visible, custom comparison label, single details affordance", () => {
    const form = createDefaultOperatorFormState();
    form.autoStrategyCombo = true;
    form.autoSearchObjective = "qualified_target";
    form.qualificationProfile = "custom";
    render(<ReviewHarness form={form} />);
    expect(screen.getByTestId("ss-guided-review-fee").textContent).toContain(
      "0.0004",
    );
    expect(screen.getByTestId("ss-guided-review-slippage").textContent).toContain(
      "0.0002",
    );
    expect(screen.getByTestId("ss-guided-target-comparison-profile").textContent).toBe(
      QUALIFIED_TARGET_CUSTOM_COMPARISON_LABEL_KO,
    );
    const details = screen.getByTestId("ss-guided-review-details");
    expect(details.querySelectorAll("summary")).toHaveLength(1);
    expect(details.querySelector(".ss-guided-review__details-chevron")).toBeNull();
    fireEvent.click(screen.getByText("상세 보기"));
    expect(details.hasAttribute("open")).toBe(true);
  });

  it("H: optional save collapsed by default", () => {
    function Harness() {
      const [form, setForm] = useState(createDefaultOperatorFormState());
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
    render(<Harness />);
    goToReviewStep();
    const entry = screen.getByTestId("ss-config-entry");
    expect(entry.tagName.toLowerCase()).toBe("details");
    expect(entry.hasAttribute("open")).toBe(false);
    expect(screen.getByText("설정 저장 (선택)")).toBeTruthy();
  });

  it("I/J/K: one submit on review; duplicate-submit lock unchanged; objective feedback", () => {
    function Harness() {
      const [form, setForm] = useState(createDefaultOperatorFormState());
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
    render(<Harness />);
    goToReviewStep();
    expect(screen.getAllByTestId("ss-create-submit")).toHaveLength(1);
    expect(screen.getByTestId("ss-launch-method").textContent).toContain("시간 기준");

    const lock = { current: false };
    expect(tryAcquireSubmitLock(lock)).toBe(true);
    expect(tryAcquireSubmitLock(lock)).toBe(false);

    const target = createDefaultOperatorFormState();
    target.autoSearchObjective = "qualified_target";
    target.autoStrategyCombo = true;
    expect(strategySearchStartedDetail(target, "X")).toContain("목표 조건");
  });

  it("surfaces non-empty searchName without empty row when blank", () => {
    const named = createDefaultOperatorFormState();
    named.searchName = "나의 BTC 탐색";
    render(<ReviewHarness form={named} />);
    expect(screen.getByTestId("ss-guided-review-search-name").textContent).toContain(
      "나의 BTC 탐색",
    );

    cleanup();
    const blank = createDefaultOperatorFormState();
    blank.searchName = "   ";
    render(<ReviewHarness form={blank} />);
    expect(screen.queryByTestId("ss-guided-review-search-name")).toBeNull();
  });

  it("AI guide renders after review content on step 5", () => {
    function Harness() {
      const [form, setForm] = useState(createDefaultOperatorFormState());
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
    render(<Harness />);
    goToReviewStep();
    expect(screen.getByTestId("ss-guided-review-ai-guide")).toBeTruthy();
    expect(screen.getByTestId("ss-step5-final-check-strip")).toBeTruthy();
    expect(screen.getByTestId("ss-step5-final-check-strip").textContent).toContain(
      "AI 최종 점검",
    );
  });
});
