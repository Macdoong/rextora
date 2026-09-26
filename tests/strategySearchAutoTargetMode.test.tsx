/** @vitest-environment jsdom */
import fs from "node:fs";
import path from "node:path";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import {
  applySavedOperatorForm,
} from "../components/rextora/strategySearch/searchConfigApply";
import {
  createDefaultOperatorFormState,
  isAutomaticQualifiedTargetMode,
  operatorFormToCreateBody,
  resolveMaxRuntimeMs,
  resolveStopWhenQualifiedTarget,
} from "../components/rextora/strategySearch/formDefaults";
import { validateStrategySearchForm } from "../components/rextora/strategySearch/formValidation";
import { StrategySearchFinalReview } from "../components/rextora/strategySearch/guided/StrategySearchFinalReview";
import { GuidedAutomaticObjectivePanel } from "../components/rextora/strategySearch/guided/GuidedAutomaticObjectivePanel";
import {
  GuidedQualificationTargets,
  qualificationTargetSummaryLines,
} from "../components/rextora/strategySearch/guided/GuidedQualificationTargets";
import { createEmptySearchPlan } from "../src/lib/rextora/strategySearch/searchPlan";

describe("automatic target-outcome mode", () => {
  afterEach(() => cleanup());

  it("defaults new and legacy forms to time budget without stopping", () => {
    const form = createDefaultOperatorFormState();
    expect(form.autoSearchObjective).toBe("time_budget");
    const legacy = applySavedOperatorForm({
      symbol: "BTCUSDT",
      stopWhenQualifiedTarget: true,
    });
    expect(legacy.autoSearchObjective).toBe("time_budget");
    expect(resolveStopWhenQualifiedTarget(legacy)).toBe(false);
    const body = operatorFormToCreateBody(form);
    expect(body.operatorPlan.stopWhenQualifiedTarget).toBe(false);
    expect(body.operatorPlan.qualifiedTarget).toBe(3);
    expect(body.operatorPlan.selectedSpaceIds).toBeNull();
  });

  it("sends stopWhenQualifiedTarget only for automatic target mode", () => {
    const form = createDefaultOperatorFormState();
    form.autoSearchObjective = "qualified_target";
    form.minTotalReturn = "8";
    form.maxMdd = "15";
    form.minTradeCount = "12";
    const body = operatorFormToCreateBody(form);
    expect(body.operatorPlan.stopWhenQualifiedTarget).toBe(true);
    expect(body.operatorPlan.qualifiedTarget).toBe(1);
    expect(form.qualifiedTargetPreset).toBe("3");
    expect(body.operatorPlan.selectedSpaceIds).toBeNull();
    expect(body.passPolicy.thresholds.minTotalReturn).toBe(
      operatorFormToCreateBody({
        ...createDefaultOperatorFormState(),
        minTotalReturn: "8",
        maxMdd: "15",
        minTradeCount: "12",
      }).passPolicy.thresholds.minTotalReturn,
    );

    form.autoSearchObjective = "time_budget";
    expect(operatorFormToCreateBody(form).operatorPlan.stopWhenQualifiedTarget).toBe(
      false,
    );
    expect(form.minTotalReturn).toBe("8");
  });

  it("keeps direct mode from enabling the stop flag", () => {
    const form = createDefaultOperatorFormState();
    form.autoStrategyCombo = false;
    form.patternConfigLevel = "basic";
    form.autoSearchObjective = "qualified_target";
    expect(isAutomaticQualifiedTargetMode(form)).toBe(false);
    const direct = operatorFormToCreateBody(form);
    expect(direct.operatorPlan.stopWhenQualifiedTarget).toBe(false);
    expect(direct.operatorPlan.qualifiedTarget).toBe(3);
    expect(direct.operatorPlan.selectedSpaceIds).not.toBeNull();
  });

  it("keeps time-mode qualifiedTarget and restores it after switching objectives", () => {
    const form = createDefaultOperatorFormState();
    form.qualifiedTargetPreset = "5";
    form.minTotalReturn = "8";
    form.maxMdd = "15";
    form.minTradeCount = "12";
    const timeBody = operatorFormToCreateBody(form);
    expect(timeBody.operatorPlan.stopWhenQualifiedTarget).toBe(false);
    expect(timeBody.operatorPlan.qualifiedTarget).toBe(5);
    form.autoSearchObjective = "qualified_target";
    const targetBody = operatorFormToCreateBody(form);
    expect(targetBody.operatorPlan.qualifiedTarget).toBe(1);
    expect(targetBody.passPolicy.thresholds).toEqual(timeBody.passPolicy.thresholds);
    expect(form.minTotalReturn).toBe("8");
    expect(form.qualifiedTargetPreset).toBe("5");
    form.autoSearchObjective = "time_budget";
    const restored = operatorFormToCreateBody(form);
    expect(restored.operatorPlan.stopWhenQualifiedTarget).toBe(false);
    expect(restored.operatorPlan.qualifiedTarget).toBe(5);
    expect(restored.passPolicy.thresholds).toEqual(timeBody.passPolicy.thresholds);
  });

  it("requires a finite max runtime in target mode", () => {
    const form = createDefaultOperatorFormState();
    form.autoSearchObjective = "qualified_target";
    form.durationPreset = "custom";
    form.maxRuntimeMinutesOverride = "";
    const errors = validateStrategySearchForm(form);
    expect(errors.some((error) => error.field === "maxRuntime")).toBe(true);
    form.maxRuntimeMinutesOverride = "20";
    expect(resolveMaxRuntimeMs(form)).toBe(20 * 60_000);
    expect(
      validateStrategySearchForm(form).some((error) => error.field === "maxRuntime"),
    ).toBe(false);
  });

  it("renders target objective guidance copy and updates when objective changes", () => {
    const { rerender } = render(
      <GuidedAutomaticObjectivePanel
        objective="qualified_target"
        testId="ss-guided-auto-target"
        compactGuidanceTestId="ss-auto-target-notice"
        analysisLine={<span data-testid="analysis-slot">slot</span>}
      >
        <span>controls</span>
      </GuidedAutomaticObjectivePanel>,
    );
    expect(screen.getByText("목표 기준 자동 탐색")).toBeTruthy();
    expect(
      screen.getByText(
        "설정한 모든 필수 조건을 통과한 첫 후보를 찾으면 탐색을 종료합니다.",
      ),
    ).toBeTruthy();
    expect(screen.getByTestId("ss-auto-target-notice").textContent).toContain(
      "조건을 만족하지 못하면 최대 탐색 시간 또는 안전 한도에서 종료됩니다.",
    );
    rerender(
      <GuidedAutomaticObjectivePanel
        objective="time_budget"
        testId="ss-guided-auto-time-budget"
        compactGuidanceTestId="ss-auto-time-guidance"
        analysisLine={<span data-testid="analysis-slot">slot</span>}
      >
        <span>controls</span>
      </GuidedAutomaticObjectivePanel>,
    );
    expect(screen.getByText("시간 기준 자동 탐색")).toBeTruthy();
    expect(screen.queryByText("목표 기준 자동 탐색")).toBeNull();
  });

  it("presents percentage fields with trailing unit labels", () => {
    const form = createDefaultOperatorFormState();
    form.autoSearchObjective = "qualified_target";
    render(
      <GuidedQualificationTargets
        variant="edit"
        form={form}
        onMinReturn={() => {}}
        onMddPreset={() => {}}
        onMaxMdd={() => {}}
        onMinTrades={() => {}}
        onMinWinRate={() => {}}
        onMinScore={() => {}}
      />,
    );
    const returnRow = screen.getByTestId("ss-target-return").closest(
      ".ss-guided-target-field-row",
    );
    expect(returnRow?.textContent).toMatch(/%\s*$/);
    const mddRow = screen.getByTestId("ss-max-mdd").closest(
      ".ss-guided-target-field-row",
    );
    expect(mddRow?.textContent).toMatch(/%\s*$/);
    expect(mddRow?.textContent).not.toMatch(/25%/);
    const tradesRow = screen.getByTestId("ss-min-trades").closest(
      ".ss-guided-target-field-row",
    );
    expect(tradesRow?.textContent).toMatch(/회\s*$/);
    fireEvent.click(screen.getByText("추가 조건"));
    const winRow = screen.getByTestId("ss-min-winrate").closest(
      ".ss-guided-target-field-row",
    );
    expect(winRow?.textContent).toMatch(/%\s*$/);
  });

  it("keeps Step 5 launch summary compact until detail disclosure opens", () => {
    const form = createDefaultOperatorFormState();
    form.symbol = "BTCUSDT";
    form.timeframe = "15m";
    form.periodPreset = "standard";
    render(<StrategySearchFinalReview form={form} onEditStep={() => {}} />);
    expect(screen.getByTestId("ss-guided-launch-compact").textContent).toContain(
      "시간 기준 자동 탐색",
    );
    expect(
      screen.getByTestId("ss-guided-launch-summary").querySelector("ul"),
    ).toBeNull();
    const details = screen.getByText("상세 보기").closest("details")!;
    expect(details.getAttribute("open")).toBeNull();
    fireEvent.click(details.querySelector("summary")!);
    expect(details.querySelector(".ss-guided-launch-summary__detail-list")).toBeTruthy();
    expect(screen.queryByTestId("ss-config-validation-status")).toBeNull();
  });

  it("shows one editable target surface and a Step 4 summary", () => {
    const form = createDefaultOperatorFormState();
    form.autoSearchObjective = "qualified_target";
    const { rerender } = render(
      <GuidedQualificationTargets
        variant="edit"
        form={form}
        onMinReturn={() => {}}
        onMddPreset={() => {}}
        onMaxMdd={() => {}}
        onMinTrades={() => {}}
        onMinWinRate={() => {}}
        onMinScore={() => {}}
      />,
    );
    expect(screen.getByTestId("ss-target-return")).toBeTruthy();
    expect(screen.queryByTestId("ss-guided-target-summary")).toBeNull();
    rerender(
      <GuidedQualificationTargets
        variant="summary"
        form={form}
        onMinReturn={() => {}}
        onMddPreset={() => {}}
        onMaxMdd={() => {}}
        onMinTrades={() => {}}
        onMinWinRate={() => {}}
        onMinScore={() => {}}
      />,
    );
    expect(screen.getByTestId("ss-guided-target-summary")).toBeTruthy();
    expect(screen.queryByTestId("ss-target-return")).toBeNull();
  });

  it("formats target summary lines with compact Korean units", () => {
    const form = createDefaultOperatorFormState();
    form.minTotalReturn = "0";
    form.maxMdd = "25";
    form.minTradeCount = "10";
    form.minWinRate = "60";
    form.minScore = "0.8";
    const lines = qualificationTargetSummaryLines(form);
    expect(lines[0]).toBe("수익률 ≥ 0%");
    expect(lines[1]).toBe("최대 낙폭 ≤ 25%");
    expect(lines[2]).toBe("최소 거래수 ≥ 10회");
    expect(lines[3]).toBe("승률 ≥ 60%");
    expect(lines[4]).toBe("점수 ≥ 0.8");
    expect(lines.join("")).not.toMatch(/%%|회회/);

    form.autoSearchObjective = "qualified_target";
    const targetBody = operatorFormToCreateBody(form);
    form.autoSearchObjective = "time_budget";
    const timeBody = operatorFormToCreateBody(form);
    expect(targetBody.passPolicy.thresholds).toEqual(timeBody.passPolicy.thresholds);
    expect(operatorFormToCreateBody(createDefaultOperatorFormState()).operatorPlan
      .stopWhenQualifiedTarget).toBe(false);
  });

  it("shows the target summary on final review", () => {
    const form = createDefaultOperatorFormState();
    form.autoSearchObjective = "qualified_target";
    form.minTotalReturn = "10";
    form.maxMdd = "20";
    form.minTradeCount = "8";
    render(<StrategySearchFinalReview form={form} onEditStep={() => {}} />);
    const review = screen.getByTestId("ss-guided-target-review");
    expect(review.textContent).toContain("목표 기준 자동 탐색");
    expect(review.textContent).toContain("수익률 ≥ 10%");
    expect(review.textContent).toContain("최대 낙폭 ≤ 20%");
    expect(review.textContent).toContain("최소 거래수 ≥ 8회");
    expect(review.textContent).toContain(
      "검증 조건을 만족하는 후보를 찾으면 종료합니다",
    );
  });

  it("keeps required target fields and collapsed optional conditions on Step 2", () => {
    const form = createDefaultOperatorFormState();
    form.autoSearchObjective = "qualified_target";
    form.minWinRate = "45";
    form.minScore = "0.8";
    render(
      <GuidedQualificationTargets
        variant="edit"
        form={form}
        onMinReturn={() => {}}
        onMddPreset={() => {}}
        onMaxMdd={() => {}}
        onMinTrades={() => {}}
        onMinWinRate={() => {}}
        onMinScore={() => {}}
      />,
    );
    expect(screen.getByTestId("ss-target-return")).toBeTruthy();
    expect(screen.getByTestId("ss-max-mdd")).toBeTruthy();
    expect(screen.getByTestId("ss-min-trades")).toBeTruthy();
    const optional = screen.getByTestId("ss-guided-target-optional");
    expect(optional.getAttribute("open")).toBeNull();
    expect(screen.getByTestId("ss-min-winrate")).toBeTruthy();
    expect((screen.getByTestId("ss-min-winrate") as HTMLInputElement).value).toBe(
      "45",
    );
  });

  it("deduplicates target values on Step 5 while keeping Step 4 cost controls", () => {
    const form = createDefaultOperatorFormState();
    form.autoSearchObjective = "qualified_target";
    form.minTotalReturn = "10";
    form.maxMdd = "20";
    form.minTradeCount = "8";
    form.stressEnabled = true;
    form.jitterEnabled = true;
    const { rerender } = render(
      <StrategySearchFinalReview form={form} onEditStep={() => {}} />,
    );
    const validationCard = screen.getByTestId("ss-guided-review-검증 · 위험");
    expect(validationCard.textContent).toMatch(/사용/);
    expect(validationCard.textContent).not.toMatch(/수익률\s*≥/);
    expect(validationCard.textContent).not.toMatch(/최대\s*낙폭\s*≤/);
    expect(validationCard.textContent).not.toContain("최소 거래수 ≥");
    expect(screen.getByTestId("ss-guided-target-review").textContent).toContain(
      "수익률 ≥ 10%",
    );

    form.minTotalReturn = "12";
    rerender(<StrategySearchFinalReview form={form} onEditStep={() => {}} />);
    expect(screen.getByTestId("ss-guided-target-review").textContent).toContain(
      "수익률 ≥ 12%",
    );
    expect(
      screen.getByTestId("ss-guided-review-검증 · 위험").textContent,
    ).not.toMatch(/수익률\s*≥/);
  });

  it("does not add an unbounded search loop", () => {
    const orchestrator = fs.readFileSync(
      path.join(
        process.cwd(),
        "src/lib/rextora/strategySearch/searchOrchestrator.ts",
      ),
      "utf8",
    );
    expect(orchestrator).toContain("plan.stopWhenQualifiedTarget === true");
    expect(orchestrator).toContain("QUALIFIED_TARGET_REACHED");
    expect(orchestrator).not.toMatch(/while\s*\([^)]*return/i);
    const timePlan = createEmptySearchPlan({
      searchName: "time",
      depthProfile: "fast",
      qualificationProfile: "balanced",
      qualifiedTarget: 1,
      candidateBudget: 10,
      stageBatchSize: 5,
      maxRuntimeMs: 60_000,
      spaces: [{ id: "ema_core", labelKo: "EMA" }],
      stopWhenQualifiedTarget: false,
    });
    const targetPlan = createEmptySearchPlan({
      ...{
        searchName: "target",
        depthProfile: "fast" as const,
        qualificationProfile: "balanced" as const,
        qualifiedTarget: 1,
        candidateBudget: 10,
        stageBatchSize: 5,
        maxRuntimeMs: 60_000,
        spaces: [{ id: "ema_core", labelKo: "EMA" }],
      },
      stopWhenQualifiedTarget: true,
    });
    const reached = (plan: typeof timePlan) =>
      plan.qualifiedHashes.length >= plan.qualifiedTarget &&
      plan.stopWhenQualifiedTarget === true;
    timePlan.qualifiedHashes = ["a"];
    targetPlan.qualifiedHashes = ["a"];
    expect(reached(timePlan)).toBe(false);
    expect(reached(targetPlan)).toBe(true);
    expect(targetPlan.candidateBudget).toBeLessThanOrEqual(50_000);
  });
});
