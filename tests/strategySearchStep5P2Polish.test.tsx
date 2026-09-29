/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it } from "vitest";
import {
  createDefaultOperatorFormState,
  operatorFormToCreateBody,
} from "@/components/rextora/strategySearch/formDefaults";
import { JobCreateForm } from "@/components/rextora/strategySearch/JobCreateForm";
import { StrategySearchFinalReview } from "@/components/rextora/strategySearch/guided/StrategySearchFinalReview";
import { Step5FinalCheckStrip } from "@/components/rextora/strategySearch/guided/Step5FinalCheckStrip";
import { GUIDE_COPY } from "@/components/rextora/strategySearch/guided/strategySearchStepModel";
import { step5StoredRatePreviewLine } from "@/components/rextora/strategySearch/guided/step5RateReviewDisplay";
import { QUALIFIED_TARGET_CUSTOM_COMPARISON_LABEL_KO } from "@/components/rextora/strategySearch/guided/qualifiedTargetComparisonProfileDisplay";

function ReviewHarness(props: { form?: ReturnType<typeof createDefaultOperatorFormState> }) {
  const form = props.form ?? createDefaultOperatorFormState();
  return <StrategySearchFinalReview form={form} onEditStep={() => {}} />;
}

describe("Strategy Search Step 5 P2 visual polish", () => {
  afterEach(() => cleanup());

  it("A/B: review cards keep values and expose presentation-only icons", () => {
    const form = createDefaultOperatorFormState();
    form.timeframe = "15m";
    render(<ReviewHarness form={form} />);
    expect(screen.getByTestId("ss-guided-review-분석 대상").textContent).toContain(
      "BTCUSDT",
    );
    expect(screen.getByTestId("ss-step5-timeframe-display").textContent).toContain(
      "15분봉",
    );
    expect(screen.getByTestId("ss-guided-review-primary-market").textContent).toContain(
      "15분봉",
    );
    const icons = screen
      .getByTestId("ss-guided-final-review")
      .querySelectorAll("[data-step5-card-icon]");
    expect(icons.length).toBe(4);
    expect(Array.from(icons).map((el) => el.getAttribute("data-step5-card-icon"))).toEqual(
      ["market", "approach", "strategy", "validation"],
    );
  });

  it("C/D: KPI panel uses form thresholds; request unchanged", () => {
    const form = createDefaultOperatorFormState();
    form.autoStrategyCombo = true;
    form.autoSearchObjective = "qualified_target";
    form.minTotalReturn = "5";
    form.maxMdd = "25";
    form.minTradeCount = "10";
    render(<ReviewHarness form={form} />);
    const metrics = screen.getByTestId("ss-guided-target-metrics");
    expect(metrics.textContent).toContain("≥ 5%");
    expect(metrics.textContent).toContain("≤ 25%");
    expect(metrics.textContent).toContain("≥ 10회");
    expect(operatorFormToCreateBody(form).timeframe).toBe("15m");
  });

  it("E: fee and slippage visible with split display matching preview semantics", () => {
    const form = createDefaultOperatorFormState();
    form.feeRate = "0.0004";
    form.slippageRate = "0.0002";
    render(<ReviewHarness form={form} />);
    const feeCard = screen.getByTestId("ss-guided-review-fee").closest(
      ".ss-guided-launch-summary__cost-card",
    );
    expect(feeCard?.textContent).toContain("0.0004");
    expect(feeCard?.textContent).toContain("0.04%");
    expect(step5StoredRatePreviewLine(form.feeRate)).toContain("0.04%");
    const slip = screen.getByTestId("ss-guided-review-slippage").closest(
      ".ss-guided-launch-summary__cost-card",
    );
    expect(slip?.textContent).toContain("0.0002");
  });

  it("F: final check strip reuses guide copy without extra validation claims", () => {
    render(<Step5FinalCheckStrip />);
    expect(screen.getByTestId("ss-step5-final-check-strip").textContent).toContain(
      "AI 최종 점검",
    );
    expect(screen.getByText(GUIDE_COPY.review.taskKo)).toBeTruthy();
    expect(screen.getAllByTestId("ss-step5-final-check-item")).toHaveLength(3);
    expect(screen.getByTestId("ss-step5-final-check-progress").textContent).toBe(
      "3/3 확인",
    );
    expect(screen.getByTestId("ss-step5-final-check-strip").textContent).not.toContain(
      "자동 검증 완료",
    );
  });

  it("G/H/I/J: one submit, optional save collapsed, no raw 15m in UI", () => {
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
    for (let i = 0; i < 4; i += 1) {
      fireEvent.click(screen.getByTestId("ss-guided-next"));
    }
    expect(screen.getAllByTestId("ss-create-submit")).toHaveLength(1);
    const entry = screen.getByTestId("ss-config-entry");
    expect(entry.hasAttribute("open")).toBe(false);
    expect(screen.getByTestId("ss-guided-final-review").textContent).not.toMatch(
      /\b15m\b/,
    );
    expect(operatorFormToCreateBody(createDefaultOperatorFormState()).timeframe).toBe(
      "15m",
    );
  });

  it("qualified-target custom comparison label preserved", () => {
    const form = createDefaultOperatorFormState();
    form.autoStrategyCombo = true;
    form.autoSearchObjective = "qualified_target";
    form.qualificationProfile = "custom";
    render(<ReviewHarness form={form} />);
    expect(screen.getByTestId("ss-guided-target-comparison-profile").textContent).toBe(
      QUALIFIED_TARGET_CUSTOM_COMPARISON_LABEL_KO,
    );
  });
});
