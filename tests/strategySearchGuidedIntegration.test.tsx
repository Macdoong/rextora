/** @vitest-environment jsdom */
import { fireEvent, render, screen, cleanup } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useState } from "react";
import { buildCreateBodyIfValid } from "@/components/rextora/strategySearch/formValidation";
import { createDefaultOperatorFormState } from "@/components/rextora/strategySearch/formDefaults";
import { SetupResultsCollapsible } from "@/components/rextora/strategySearch/guided/SetupResultsCollapsible";
import { StrategySearchFinalReview } from "@/components/rextora/strategySearch/guided/StrategySearchFinalReview";
import { StrategySearchGuidedSetup } from "@/components/rextora/strategySearch/guided/StrategySearchGuidedSetup";
import { StrategySearchStepGuide } from "@/components/rextora/strategySearch/guided/StrategySearchStepGuide";
import { StrategySearchStepNavigation } from "@/components/rextora/strategySearch/guided/StrategySearchStepNavigation";
import { useStrategySearchGuidedSetup } from "@/components/rextora/strategySearch/guided/useStrategySearchGuidedSetup";
import {
  isGuidedSetupActive,
  resolveStrategySearchPresentationMode,
} from "@/components/rextora/strategySearch/guided/strategySearchPresentation";
import {
  STRATEGY_SEARCH_SETUP_STEPS,
  resolveStepUiState,
} from "@/components/rextora/strategySearch/guided/strategySearchStepModel";
import {
  StrategySearchVisualBuilder,
  resolveVisualBuilderPanels,
} from "@/components/rextora/strategySearch/visual/StrategySearchVisualBuilder";

describe("Strategy Search guided integration (DOM)", () => {
  afterEach(() => cleanup());

  const noop = () => {};

  it("resolveVisualBuilderPanels: market step does not mount workspace", () => {
    const p = resolveVisualBuilderPanels({
      mode: false,
      market: true,
      workspace: false,
    });
    expect(p.workspaceControls).toBe(false);
    expect(p.scopeMap).toBe(false);
  });

  it("Step 1 market visual builder DOM has market fields only", () => {
    const form = createDefaultOperatorFormState();
    render(
      <StrategySearchVisualBuilder
        form={form}
        automatic={false}
        panels={{ mode: false, market: true, workspace: false }}
        onSelectAutomatic={noop}
        onSelectDirect={noop}
        onSymbol={noop}
        onTimeframe={noop}
        onPeriod={noop}
        onTradingStyle={noop}
        onDirection={noop}
        onToggleLayer={noop}
      />,
    );
    expect(screen.getByTestId("ss-symbols")).toBeTruthy();
    expect(screen.queryByTestId("ss-pattern-layer-panel")).toBeNull();
    expect(screen.queryByTestId("ss-search-scope-map")).toBeNull();
    expect(screen.queryByTestId("ss-direction-both")).toBeNull();
  });

  it("Step 3 visual builder DOM includes layer panel and scope map", () => {
    const form = createDefaultOperatorFormState();
    render(
      <StrategySearchVisualBuilder
        form={form}
        automatic={false}
        panels={{
          mode: false,
          market: false,
          workspaceControls: true,
          scopeMap: true,
        }}
        onSelectAutomatic={noop}
        onSelectDirect={noop}
        onSymbol={noop}
        onTimeframe={noop}
        onPeriod={noop}
        onTradingStyle={noop}
        onDirection={noop}
        onToggleLayer={noop}
      />,
    );
    expect(screen.getByTestId("ss-pattern-layer-panel")).toBeTruthy();
    expect(screen.getByTestId("ss-search-scope-map")).toBeTruthy();
  });

  it("Step 2 approach panels exclude scope map in DOM", () => {
    const form = createDefaultOperatorFormState();
    render(
      <StrategySearchVisualBuilder
        form={form}
        automatic={false}
        panels={{
          mode: true,
          market: false,
          workspace: false,
          workspaceControls: false,
          scopeMap: false,
        }}
        onSelectAutomatic={noop}
        onSelectDirect={noop}
        onSymbol={noop}
        onTimeframe={noop}
        onPeriod={noop}
        onTradingStyle={noop}
        onDirection={noop}
        onToggleLayer={noop}
      />,
    );
    expect(screen.queryByTestId("ss-search-scope-map")).toBeNull();
    expect(screen.queryByTestId("ss-pattern-layer-panel")).toBeNull();
  });

  it("presentation: editable setup with completed job context stays guided_setup", () => {
    const mode = resolveStrategySearchPresentationMode({
      clientReady: true,
      showRunningVisual: false,
      outcomeViewPrimary: false,
    });
    expect(mode).toBe("guided_setup");
    expect(isGuidedSetupActive(mode)).toBe(true);
  });

  it("presentation: explicit outcome view expands results path", () => {
    const mode = resolveStrategySearchPresentationMode({
      clientReady: true,
      showRunningVisual: false,
      outcomeViewPrimary: true,
    });
    expect(mode).toBe("outcome_primary");
    expect(isGuidedSetupActive(mode)).toBe(false);
  });

  it("step navigation: current step has aria-current; later steps stay disabled", () => {
    const visited = new Set(["market" as const]);
    const stepStates = Object.fromEntries(
      STRATEGY_SEARCH_SETUP_STEPS.map((s) => [
        s.id,
        resolveStepUiState(s.id, {
          currentStepId: "market",
          visited,
          completed: new Set(),
          needsReview: new Set(),
        }),
      ]),
    ) as Record<(typeof STRATEGY_SEARCH_SETUP_STEPS)[number]["id"], string>;

    render(
      <StrategySearchStepNavigation
        currentStepId="market"
        stepStates={stepStates as never}
        onGoToStep={() => {}}
      />,
    );

    const current = screen.getByTestId("ss-guided-nav-step-market");
    expect(current.getAttribute("aria-current")).toBe("step");
    const locked = screen.getByTestId("ss-guided-nav-step-approach");
    expect(locked.hasAttribute("disabled")).toBe(true);
  });

  it("selecting 직접 지정 shows start and end date inputs", () => {
    const form = createDefaultOperatorFormState();
    const onPeriod = vi.fn();
    const { rerender } = render(
      <StrategySearchVisualBuilder
        form={form}
        automatic={false}
        panels={{ mode: false, market: true, workspace: false }}
        onSelectAutomatic={noop}
        onSelectDirect={noop}
        onSymbol={noop}
        onTimeframe={noop}
        onPeriod={onPeriod}
        onTradingStyle={noop}
        onDirection={noop}
        onToggleLayer={noop}
        onCustomPeriodFrom={noop}
        onCustomPeriodTo={noop}
      />,
    );
    fireEvent.change(screen.getByTestId("ss-period"), {
      target: { value: "custom" },
    });
    expect(onPeriod).toHaveBeenCalledWith("custom");
    rerender(
      <StrategySearchVisualBuilder
        form={{ ...form, periodPreset: "custom" }}
        automatic={false}
        panels={{ mode: false, market: true, workspace: false }}
        onSelectAutomatic={noop}
        onSelectDirect={noop}
        onSymbol={noop}
        onTimeframe={noop}
        onPeriod={noop}
        onTradingStyle={noop}
        onDirection={noop}
        onToggleLayer={noop}
        onCustomPeriodFrom={noop}
        onCustomPeriodTo={noop}
      />,
    );
    expect(screen.getByTestId("ss-available-from")).toBeTruthy();
    expect(screen.getByTestId("ss-available-to")).toBeTruthy();
  });

  it("AI guide shows role and step-specific briefing status", () => {
    const { rerender } = render(<StrategySearchStepGuide stepId="market" />);
    expect(screen.getByTestId("ss-guided-guide-role").textContent).toBe(
      "AI 연구원",
    );
    expect(screen.getByTestId("ss-guided-guide-status").textContent).toContain(
      "분석 준비",
    );
    rerender(<StrategySearchStepGuide stepId="approach" />);
    expect(screen.getByTestId("ss-guided-guide-status").textContent).toContain(
      "탐색 방식 선택",
    );
  });

  it("setup results collapsible is closed and toggle is keyboard focusable", () => {
    render(
      <SetupResultsCollapsible active summaryMeta="2건 · BTCUSDT">
        <div data-testid="ss-results-inner">inner</div>
      </SetupResultsCollapsible>,
    );
    const details = screen.getByTestId("ss-setup-results-collapsible");
    expect(details.hasAttribute("open")).toBe(false);
    const toggle = screen.getByTestId("ss-setup-results-toggle");
    expect(toggle.tagName.toLowerCase()).toBe("summary");
  });

  it("Step 1 surface shows 분석 기준 and not legacy 시장 설정 heading", () => {
    function Harness() {
      const form = createDefaultOperatorFormState();
      const guided = useStrategySearchGuidedSetup(form);
      return (
        <StrategySearchGuidedSetup guided={guided} allErrors={[]}>
          <div data-testid="ss-step-fields">fields</div>
        </StrategySearchGuidedSetup>
      );
    }
    render(<Harness />);
    expect(screen.getByTestId("ss-guided-step-heading").textContent).toBe(
      "분석 기준",
    );
    expect(screen.getByTestId("ss-guided-step-context").textContent).toContain(
      "분석 대상",
    );
    expect(screen.queryByText("시장 설정")).toBeNull();
    expect(screen.getByTestId("ss-guided-step-surface").getAttribute("data-guided-step-id")).toBe(
      "market",
    );
  });

  it("step surface key follows stepId only (form edits do not remount step surface)", () => {
    function Harness() {
      const [form, setForm] = useState(createDefaultOperatorFormState());
      const guided = useStrategySearchGuidedSetup(form);
      return (
        <>
          <StrategySearchGuidedSetup guided={guided} allErrors={[]}>
            <div data-testid="ss-step-fields">fields</div>
          </StrategySearchGuidedSetup>
          <button
            type="button"
            data-testid="ss-bump-symbol"
            onClick={() => setForm((f) => ({ ...f, symbol: "ETHUSDT" }))}
          >
            bump
          </button>
        </>
      );
    }
    render(<Harness />);
    const surface = screen.getByTestId("ss-guided-step-surface");
    const before = surface.getAttribute("data-guided-step-id");
    screen.getByTestId("ss-bump-symbol").click();
    const after = screen.getByTestId("ss-guided-step-surface");
    expect(before).toBe("market");
    expect(after.getAttribute("data-guided-step-id")).toBe("market");
    expect(after).toBe(surface);
  });

  it("create payload field keys unchanged after Step 1 terminology update", () => {
    const form = createDefaultOperatorFormState();
    const result = buildCreateBodyIfValid(form);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.body.symbols.length).toBeGreaterThan(0);
    expect(result.body.timeframe.length).toBeGreaterThan(0);
    expect(result.body.operatorPlan?.searchName?.length).toBeGreaterThan(0);
  });

  it("Step 5 review shows step badges instead of header 수정", () => {
    render(
      <StrategySearchFinalReview
        form={createDefaultOperatorFormState()}
        onEditStep={() => {}}
      />,
    );
    expect(screen.getByTestId("ss-guided-review-step-badge-market").textContent).toBe(
      "1단계",
    );
    expect(screen.queryByText("수정")).toBeNull();
    expect(screen.getByTestId("ss-guided-review-edit-market")).toBeTruthy();
  });

  it("Step 2 mode outcome panel reflects automatic vs manual", () => {
    const form = createDefaultOperatorFormState();
    const { rerender } = render(
      <StrategySearchVisualBuilder
        form={{ ...form, autoStrategyCombo: true }}
        automatic
        panels={{ mode: true, market: false, workspace: false }}
        onSelectAutomatic={noop}
        onSelectDirect={noop}
        onSymbol={noop}
        onTimeframe={noop}
        onPeriod={noop}
        onTradingStyle={noop}
        onDirection={noop}
        onToggleLayer={noop}
      />,
    );
    expect(screen.getByTestId("ss-guided-mode-outcome-current").textContent).toContain(
      "자동",
    );
    rerender(
      <StrategySearchVisualBuilder
        form={{ ...form, autoStrategyCombo: false }}
        automatic={false}
        panels={{ mode: true, market: false, workspace: false }}
        onSelectAutomatic={noop}
        onSelectDirect={noop}
        onSymbol={noop}
        onTimeframe={noop}
        onPeriod={noop}
        onTradingStyle={noop}
        onDirection={noop}
        onToggleLayer={noop}
      />,
    );
    expect(screen.getByTestId("ss-guided-mode-outcome-current").textContent).toContain(
      "직접",
    );
  });

  it("direct navigation to earlier step updates current marker only once", () => {
    const visited = new Set([
      "market" as const,
      "approach" as const,
      "strategy" as const,
      "validation" as const,
    ]);
    const completed = new Set([
      "market" as const,
      "approach" as const,
      "strategy" as const,
    ]);
    const stepStates = Object.fromEntries(
      STRATEGY_SEARCH_SETUP_STEPS.map((s) => [
        s.id,
        resolveStepUiState(s.id, {
          currentStepId: "validation",
          visited,
          completed,
          needsReview: new Set(),
        }),
      ]),
    ) as Record<(typeof STRATEGY_SEARCH_SETUP_STEPS)[number]["id"], string>;

    const onGo = vi.fn();
    const { rerender } = render(
      <StrategySearchStepNavigation
        currentStepId="validation"
        stepStates={stepStates as never}
        onGoToStep={onGo}
      />,
    );
    screen.getByTestId("ss-guided-nav-step-approach").click();
    expect(onGo).toHaveBeenCalledTimes(1);
    expect(onGo).toHaveBeenCalledWith("approach");

    rerender(
      <StrategySearchStepNavigation
        currentStepId="approach"
        stepStates={
          Object.fromEntries(
            STRATEGY_SEARCH_SETUP_STEPS.map((s) => [
              s.id,
              resolveStepUiState(s.id, {
                currentStepId: "approach",
                visited,
                completed,
                needsReview: new Set(),
              }),
            ]),
          ) as never
        }
        onGoToStep={onGo}
      />,
    );
    expect(
      screen.getByTestId("ss-guided-nav-step-approach").getAttribute("aria-current"),
    ).toBe("step");
    expect(
      screen.getByTestId("ss-guided-nav-step-validation").getAttribute("aria-current"),
    ).toBeNull();
  });
});
