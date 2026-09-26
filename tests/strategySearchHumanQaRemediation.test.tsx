/** @vitest-environment jsdom */
import fs from "node:fs";
import path from "node:path";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { completionReasonHeroMessageKo } from "../components/rextora/strategySearch/completionCustomerView";
import { GuidedQualificationTargets } from "../components/rextora/strategySearch/guided/GuidedQualificationTargets";
import { StrategySearchFieldHelp } from "../components/rextora/strategySearch/guided/StrategySearchFieldHelp";
import { STRATEGY_SEARCH_FIELD_HELP } from "../components/rextora/strategySearch/guided/strategySearchFieldHelpContent";
import {
  showGuidedPatternDetailDisclosure,
  showGuidedValidationAdvancedBand,
} from "../components/rextora/strategySearch/guided/strategySearchGuidedVisibility";
import { guidedNumberClass } from "../components/rextora/strategySearch/guided/guidedFieldClass";
import { createDefaultOperatorFormState } from "../components/rextora/strategySearch/formDefaults";
import { StrategySearchModeSelector } from "../components/rextora/strategySearch/visual/StrategySearchModeSelector";

const ROOT = process.cwd();

function read(rel: string): string {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

describe("Strategy Search human QA remediation", () => {
  afterEach(() => cleanup());

  it("A: guided controls use shared ss-strategy-search-control spacing contract", () => {
    expect(guidedNumberClass).toContain("ss-strategy-search-control");
    const css = read("components/rextora/v3/strategy-search.css");
    expect(css).toContain(".ss-strategy-search-control");
    expect(css).toMatch(/padding-left:\s*12px/);
    expect(read("components/rextora/strategySearch/SearchConfigManager.tsx")).toContain(
      "ss-strategy-search-control",
    );
  });

  it("B: selection cards expose motion hooks and reduced-motion guard", () => {
    const css = read("components/rextora/v3/strategy-search.css");
    expect(css).toContain(".ss-selection-card");
    expect(css).toContain("prefers-reduced-motion: reduce");
    expect(read("components/rextora/strategySearch/visual/StrategySearchModeSelector.tsx")).toContain(
      "ss-selection-card",
    );
    render(
      <StrategySearchModeSelector
        automatic
        onSelectAutomatic={() => {}}
        onSelectDirect={() => {}}
      />,
    );
    expect(document.querySelector(".ss-mode-card--active.ss-selection-card")).toBeTruthy();
  });

  it("C: additional-condition disclosure is discoverable and accessible", () => {
    const css = read("components/rextora/v3/strategy-search.css");
    expect(css).toContain("ss-guided-target-optional--discoverable");
    const form = createDefaultOperatorFormState();
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
    const details = screen.getByTestId("ss-guided-target-optional");
    expect(details.tagName).toBe("DETAILS");
    expect(screen.getByText("추가 조건")).toBeTruthy();
    expect(screen.getByText("승률 · 점수 설정")).toBeTruthy();
    const summary = details.querySelector("summary")!;
    expect(summary.getAttribute("class")).toContain("ss-guided-target-optional__summary");
  });

  it("D: field help popover is keyboard accessible and uses registry copy", () => {
    render(<StrategySearchFieldHelp fieldId="minTotalReturn" />);
    const trigger = screen.getByTestId("ss-field-help-minTotalReturn");
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(trigger);
    expect(trigger.getAttribute("aria-expanded")).toBe("true");
    const popover = screen.getByTestId("ss-field-help-popover-minTotalReturn");
    expect(popover.textContent).toContain(STRATEGY_SEARCH_FIELD_HELP.minTotalReturn.title);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByTestId("ss-field-help-popover-minTotalReturn")).toBeNull();
  });

  it("E–F: automatic mode hides empty pattern-detail shell; expert keeps disclosure path", () => {
    expect(
      showGuidedPatternDetailDisclosure({
        selectionMode: "automatic",
        patternConfigLevel: "automatic",
      }),
    ).toBe(false);
    expect(
      showGuidedPatternDetailDisclosure({
        selectionMode: "direct",
        patternConfigLevel: "expert",
      }),
    ).toBe(true);
    const formSrc = read("components/rextora/strategySearch/JobCreateForm.tsx");
    expect(formSrc).toContain("showPatternDetailDisclosure");
    expect(formSrc).toContain("patternDefaultsNotice");
  });

  it("G–H: automatic+basic hides empty advanced-validation band", () => {
    expect(
      showGuidedValidationAdvancedBand({
        selectionMode: "automatic",
        patternConfigLevel: "automatic",
      }),
    ).toBe(false);
    expect(
      showGuidedValidationAdvancedBand({
        selectionMode: "direct",
        patternConfigLevel: "basic",
      }),
    ).toBe(true);
    const formSrc = read("components/rextora/strategySearch/JobCreateForm.tsx");
    expect(formSrc).toContain("showValidationAdvancedBand");
  });

  it("I: starting a job sets one pending scroll token for running anchor", () => {
    const workbench = read("components/rextora/strategySearch/StrategySearchWorkbench.tsx");
    expect(workbench).toContain("pendingScrollToRunningRef");
    expect(workbench).toContain('getElementById("ss-running-view-anchor")');
    expect(workbench).toContain("prefers-reduced-motion: reduce");
    expect(workbench).toContain("shouldRenderRunningVisual(detail.status)");
    expect(
      read("components/rextora/strategySearch/visual/StrategySearchRunningVisual.tsx"),
    ).toContain('id="ss-running-view-anchor"');
  });

  it("J–O: completed job primary dashboard and explicit new-search flow", () => {
    const workbench = read("components/rextora/strategySearch/StrategySearchWorkbench.tsx");
    expect(workbench).toContain("StrategySearchCompletedDashboard");
    expect(workbench).toContain("showCompletedDashboardPrimary");
    expect(workbench).toContain("beginFreshSearch");
    expect(workbench).toContain("retrySearchWithCurrentSettings");
    expect(
      read("components/rextora/strategySearch/StrategySearchCompletedDashboard.tsx"),
    ).toContain('data-testid="ss-completed-dashboard"');
    expect(read("components/rextora/strategySearch/StrategySearchCompletedDashboard.tsx")).toContain(
      "CompletedDashboard",
    );
  });

  it("K–M: completion reason copy is customer-facing", () => {
    expect(completionReasonHeroMessageKo("QUALIFIED_TARGET_REACHED")).toContain(
      "목표 조건",
    );
    expect(completionReasonHeroMessageKo("DEADLINE_REACHED")).toContain("최대 탐색 시간");
  });

  it("L–N: completed result tests still distinguish failed best from recommendation", () => {
    const completedTests = read("tests/strategySearchCompletedResultView.test.ts");
    expect(completedTests).toContain("bestPassedCandidate");
    expect(completedTests).toContain("failed_high_score");
    const panel = read("components/rextora/strategySearch/ResearchCompletionPanel.tsx");
    expect(panel).toContain("임시 평가 상위 후보 — 합격 아님");
    expect(panel).not.toMatch(/fake.*chart|placeholder.*equity/i);
  });
});
