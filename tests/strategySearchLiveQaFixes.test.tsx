/** @vitest-environment jsdom */
import fs from "node:fs";
import path from "node:path";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createDefaultOperatorFormState,
  operatorFormToCreateBody,
} from "../components/rextora/strategySearch/formDefaults";
import { StrategySearchFinalReview } from "../components/rextora/strategySearch/guided/StrategySearchFinalReview";
import { CandidateMetricSparkline } from "../components/rextora/strategySearch/visual/CandidateMetricSparkline";
import { buildCandidateMetricChart } from "../components/rextora/strategySearch/visual/runningVisualModel";

describe("Strategy Search live QA fixes", () => {
  afterEach(() => cleanup());

  it("styles the Step 3 system-managed notice as a readable info card", () => {
    const form = fs.readFileSync(
      path.join(
        process.cwd(),
        "components/rextora/strategySearch/JobCreateForm.tsx",
      ),
      "utf8",
    );
    const css = fs.readFileSync(
      path.join(process.cwd(), "components/rextora/v3/strategy-search.css"),
      "utf8",
    );
    const start = form.indexOf('data-testid="ss-pattern-matrix-system-managed"');
    const notice = form.slice(start - 240, start + 180);
    expect(notice).toContain("ss-guided-notice ss-guided-notice--info");
    expect(notice).toContain(
      "패턴 포함 선택은 시스템 관리입니다. 자동 탐색일 때 수동 포함 토글은",
    );
    expect(notice).not.toContain("bg-slate-900");
    expect(notice).not.toContain("text-slate-300");
    expect(css).toContain(".ss-guided-notice--info");
    expect(css).toContain("color: var(--v3-text-primary)");
    expect(css).toContain(".ss-guided-notice--info::before");
  });

  it("keeps automatic mode from sending manual pattern selections", () => {
    const body = operatorFormToCreateBody(createDefaultOperatorFormState());
    expect(body.operatorPlan.patternSelectionMode).toBe("automatic");
    expect(body.operatorPlan.selectedSpaceIds).toBeNull();
    expect(body.operatorPlan.stopWhenQualifiedTarget).toBe(false);
  });

  it("does not emit a duplicate React key for the default launch summary", () => {
    const errors: string[] = [];
    const spy = vi.spyOn(console, "error").mockImplementation((...args) => {
      errors.push(args.map((arg) => String(arg)).join(" "));
    });
    render(
      <StrategySearchFinalReview
        form={createDefaultOperatorFormState()}
        onEditStep={() => {}}
      />,
    );
    expect(
      screen.getByTestId("ss-guided-launch-compact").textContent,
    ).toContain("시간 기준 자동 탐색");
    const details = screen.getByText("상세 보기").closest("details")!;
    fireEvent.click(details.querySelector("summary")!);
    const texts = [
      ...details.querySelectorAll(".ss-guided-launch-summary__detail-list li"),
    ].map((item) => item.textContent ?? "");
    expect(texts).toContain("표준 탐색");
    expect(texts).toContain("균형형");
    expect(texts.filter((text) => text === "—")).toEqual([]);
    expect(new Set(texts).size).toBe(texts.length);
    expect(errors.join("\n")).not.toMatch(/same key/i);
    spy.mockRestore();
  });

  it("renders the return sparkline without an unlabeled zero reference line", () => {
    const values = [0.012, 0.048, -0.004, 0.021];
    const chart = buildCandidateMetricChart(values, "return");
    expect(chart?.min).toBe(Math.min(...values));
    expect(chart?.max).toBe(Math.max(...values));
    render(
      <CandidateMetricSparkline
        titleKo="최근 후보 수익률"
        points={values.map((value, index) => ({
          sequenceLabel: `#${index + 1}`,
          value,
        }))}
        formatValue={(value) => `${value}`}
        kind="return"
        testId="ss-running-spark-return"
      />,
    );
    expect(screen.queryByTestId("ss-running-spark-return-zero-line")).toBeNull();
    expect(document.querySelectorAll(".ss-spark__line")).toHaveLength(1);
    expect(screen.getByTestId("ss-running-spark-return-latest").textContent).toBe(
      "0.021",
    );
    expect(screen.getByTestId("ss-running-spark-return-min").textContent).toContain(
      "-0.004",
    );
    expect(screen.getByTestId("ss-running-spark-return-max").textContent).toContain(
      "0.048",
    );
    cleanup();
    render(
      <CandidateMetricSparkline
        titleKo="최근 후보 최대낙폭"
        points={[
          { sequenceLabel: "#1", value: -0.04 },
          { sequenceLabel: "#2", value: -0.07 },
        ]}
        formatValue={(value) => `${(Math.abs(value) * 100).toFixed(2)}%`}
        kind="mdd"
        testId="ss-running-spark-mdd"
      />,
    );
    expect(screen.getByTestId("ss-running-spark-mdd-min").textContent).toContain(
      "4.00%",
    );
    expect(screen.getByTestId("ss-running-spark-mdd-max").textContent).toContain(
      "7.00%",
    );
    expect(buildCandidateMetricChart([-0.04, -0.07], "mdd")?.min).toBe(-0.07);
    expect(buildCandidateMetricChart([-0.04, -0.07], "mdd")?.max).toBe(-0.04);
  });

  it("leaves pause, resume, and stop controls and omits a fake completion percent", () => {
    const controls = fs.readFileSync(
      path.join(
        process.cwd(),
        "components/rextora/strategySearch/ExecutionControls.tsx",
      ),
      "utf8",
    );
    const running = fs.readFileSync(
      path.join(
        process.cwd(),
        "components/rextora/strategySearch/visual/StrategySearchRunningVisual.tsx",
      ),
      "utf8",
    );
    expect(controls).toContain('data-testid="ss-action-pause"');
    expect(controls).toContain("일시정지");
    expect(controls).toContain('data-testid="ss-action-resume"');
    expect(controls).toContain("재개");
    expect(controls).toContain('data-testid="ss-action-cancel"');
    expect(controls).toContain("중지");
    expect(running).not.toContain("완료율");
    expect(running).not.toContain("진행률");
  });
});
