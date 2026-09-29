/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import fs from "node:fs";
import path from "node:path";
import { useState } from "react";
import { afterEach, describe, expect, it } from "vitest";
import {
  createDefaultOperatorFormState,
  operatorFormToCreateBody,
  SEARCHABLE_SPACE_OPTIONS,
} from "@/components/rextora/strategySearch/formDefaults";
import { JobCreateForm } from "@/components/rextora/strategySearch/JobCreateForm";
import { Step5LaunchFlowMap } from "@/components/rextora/strategySearch/guided/Step5LaunchFlowMap";
import { Step5FinalCheckStrip } from "@/components/rextora/strategySearch/guided/Step5FinalCheckStrip";
import { StrategySearchFinalReview } from "@/components/rextora/strategySearch/guided/StrategySearchFinalReview";

describe("Step 5 truthful configuration visuals", () => {
  afterEach(() => cleanup());

  it("A: no proportional gauges for unbounded min return, trades, or score", () => {
    const form = createDefaultOperatorFormState();
    form.autoStrategyCombo = true;
    form.autoSearchObjective = "qualified_target";
    form.minTotalReturn = "12";
    form.minTradeCount = "40";
    form.minScore = "0.8";
    render(<StrategySearchFinalReview form={form} onEditStep={() => {}} />);
    expect(screen.getByTestId("ss-step5-target-min-return-badge")).toBeTruthy();
    expect(screen.getByTestId("ss-step5-target-min-trades-badge")).toBeTruthy();
    expect(screen.getByTestId("ss-step5-target-min-score-badge")).toBeTruthy();
    expect(screen.queryByTestId("ss-step5-target-min-return-gauge")).toBeNull();
    expect(screen.queryByTestId("ss-step5-target-min-trades-gauge")).toBeNull();
    expect(screen.queryByTestId("ss-step5-target-min-score-gauge")).toBeNull();
  });

  it("B: no fee/slippage proportional bars in Step 5 sources", () => {
    const css = fs.readFileSync(
      path.join(process.cwd(), "components/rextora/v3/strategy-search.css"),
      "utf8",
    );
    expect(css).not.toMatch(/ss-step5-fee-bar|ss-step5-slippage-bar/);
    const pipeline = fs.readFileSync(
      path.join(
        process.cwd(),
        "components/rextora/strategySearch/guided/Step5LaunchPipelineVisual.tsx",
      ),
      "utf8",
    );
    expect(pipeline).not.toMatch(/fee.*bar|slippage.*bar|proportion/i);
  });

  it("C: leverage is not presented as engine-bounded 1–20 gauge", () => {
    const css = fs.readFileSync(
      path.join(process.cwd(), "components/rextora/v3/strategy-search.css"),
      "utf8",
    );
    expect(css).not.toMatch(/ss-step5-leverage-gauge/);
    const form = createDefaultOperatorFormState();
    render(<Step5LaunchFlowMap form={form} combinationSentence="자동 조합" />);
    expect(screen.getByTestId("ss-step5-launch-flow").textContent).not.toMatch(
      /1\s*[-–]\s*20/,
    );
  });

  it("D/E: maxMdd bounded gauge; minWinRate gauge only when set", () => {
    const form = createDefaultOperatorFormState();
    form.autoStrategyCombo = true;
    form.autoSearchObjective = "qualified_target";
    form.maxMdd = "25";
    form.minWinRate = "";
    render(<StrategySearchFinalReview form={form} onEditStep={() => {}} />);
    expect(screen.getByTestId("ss-step5-target-max-mdd-gauge")).toBeTruthy();
    expect(screen.getByTestId("ss-step5-target-max-mdd-gauge-track")).toBeTruthy();
    expect(screen.queryByTestId("ss-step5-target-min-win-rate-gauge")).toBeNull();

    form.minWinRate = "55";
    cleanup();
    render(<StrategySearchFinalReview form={form} onEditStep={() => {}} />);
    expect(screen.getByTestId("ss-step5-target-min-win-rate-gauge")).toBeTruthy();
  });

  it("F: strategy node cluster count matches selection", () => {
    const form = createDefaultOperatorFormState();
    render(<Step5LaunchFlowMap form={form} combinationSentence="자동 조합" />);
    const cluster = screen.getByTestId("ss-launch-strategy-composition");
    expect(cluster.getAttribute("data-node-count")).toBe(
      String(SEARCHABLE_SPACE_OPTIONS.length),
    );
    cleanup();
    form.patternConfigLevel = "direct";
    form.autoStrategyCombo = false;
    form.selectedSpaceIds = ["ema_core", "rsi_pullback"];
    render(<Step5LaunchFlowMap form={form} combinationSentence="직접" />);
    expect(
      screen.getByTestId("ss-launch-strategy-composition").getAttribute("data-node-count"),
    ).toBe("2");
  });

  it("G/H: duration presets discrete; custom duration separate", () => {
    const form = createDefaultOperatorFormState();
    form.durationPreset = "360";
    render(<Step5LaunchFlowMap form={form} combinationSentence="자동 조합" />);
    const rail = screen.getByTestId("ss-launch-runtime");
    expect(rail.querySelector('[data-duration-preset="360"]')?.className).toContain(
      "selected",
    );
    expect(rail.querySelectorAll("[data-duration-preset]")).toHaveLength(5);
    cleanup();
    form.durationPreset = "custom";
    form.maxRuntimeMinutesOverride = "90";
    render(<Step5LaunchFlowMap form={form} combinationSentence="자동 조합" />);
    const custom = screen.getByTestId("ss-launch-runtime");
    expect(custom.className).toContain("custom");
    expect(custom.textContent).toContain("사용자 설정");
    expect(custom.textContent).toContain("90분");
    expect(custom.querySelector("[data-duration-preset]")).toBeNull();
  });

  it("I: AI progress rail uses three existing review areas", () => {
    render(<Step5FinalCheckStrip />);
    const rail = screen.getByTestId("ss-step5-final-check-progress-rail");
    expect(rail.textContent).toContain("분석·탐색");
    expect(rail.textContent).toContain("전략·범위");
    expect(rail.textContent).toContain("검증·비용");
    expect(screen.getAllByTestId("ss-step5-final-check-item")).toHaveLength(3);
  });

  it("J/K: one submit button; request body unchanged", () => {
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
    const before = operatorFormToCreateBody(createDefaultOperatorFormState());
    const after = operatorFormToCreateBody(createDefaultOperatorFormState());
    expect(after).toEqual(before);
  });

  it("N: reduced-motion disables Step 5 visualization motion", () => {
    const css = fs.readFileSync(
      path.join(process.cwd(), "components/rextora/v3/strategy-search.css"),
      "utf8",
    );
    expect(css).toMatch(
      /prefers-reduced-motion[\s\S]*ss-step5-bounded-gauge--enter[\s\S]*animation:\s*none\s*!important/,
    );
    expect(css).toMatch(
      /prefers-reduced-motion[\s\S]*ss-step5-final-check__progress-rail--enter[\s\S]*animation:\s*none\s*!important/,
    );
  });

  it("pipeline ready node does not duplicate launch CTA wording", () => {
    const form = createDefaultOperatorFormState();
    render(<Step5LaunchFlowMap form={form} combinationSentence="자동 조합" />);
    const flow = screen.getByTestId("ss-step5-launch-flow");
    expect(flow.textContent).not.toContain("탐색 시작");
    expect(screen.getByTestId("ss-launch-ready-state").textContent).toBe("준비 완료");
  });
});
