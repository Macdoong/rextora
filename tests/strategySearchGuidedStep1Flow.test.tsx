/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { GuidedSetupCompactContinuations } from "@/components/rextora/strategySearch/guided/GuidedSetupCompactContinuations";
import { StrategySearchVisualBuilder } from "@/components/rextora/strategySearch/visual/StrategySearchVisualBuilder";
import {
  createDefaultOperatorFormState,
  generateDefaultSearchName,
  GUIDED_STEP1_FIELD_DEFAULTS,
} from "@/components/rextora/strategySearch/formDefaults";
import {
  displayJobSearchTitle,
  displayJobRecentWorkPresentation,
  composedJobMarketTitle,
} from "@/components/rextora/strategySearch/jobDisplayName";
import { isSystemGeneratedSearchName } from "@/components/rextora/strategySearch/formDefaults";
import type { StrategySearchJobSummary } from "@/components/rextora/strategySearch/types";
import { useStrategySearchGuidedSetup } from "@/components/rextora/strategySearch/guided/useStrategySearchGuidedSetup";
import { shouldShowGuidedCompactSecondary } from "@/components/rextora/strategySearch/guided/strategySearchPresentation";

function job(overrides: Partial<StrategySearchJobSummary>): StrategySearchJobSummary {
  return {
    id: "job_1",
    status: "completed",
    createdAt: "",
    updatedAt: "",
    startedAt: null,
    finishedAt: null,
    maxIterations: 100,
    completedIterations: 100,
    nextIteration: 100,
    progressRatio: 1,
    statistics: null,
    bestScore: null,
    bestCandidateHash: null,
    bestPassedCandidateHash: null,
    failureMessage: null,
    executionActive: false,
    searchVersion: "1",
    symbols: ["BTCUSDT"],
    timeframe: "15m",
    seed: 1,
    searchName: "VERIFY_PATTERN_CANONICAL1_BTCUSDT_15m",
    ...overrides,
  } as StrategySearchJobSummary;
}

describe("Guided Step 1 flow refinement", () => {
  afterEach(() => cleanup());

  it("classifies legacy default search names as system-generated", () => {
    expect(
      isSystemGeneratedSearchName("BTCUSDT 15m 탐색", "BTCUSDT", "15m"),
    ).toBe(true);
    expect(
      isSystemGeneratedSearchName("BTCUSDT 15m 테스트", "BTCUSDT", "15m"),
    ).toBe(false);
  });

  it("system-generated stored title normalizes 15m to 15분봉", () => {
    expect(
      displayJobSearchTitle({
        id: "j1",
        searchName: "BTCUSDT 15m 탐색",
        symbols: ["BTCUSDT"],
        timeframe: "15m",
      }),
    ).toBe("BTCUSDT 15분봉 탐색");
  });

  it("user-authored title preserves text and adds structured metadata", () => {
    const pres = displayJobRecentWorkPresentation({
      id: "j2",
      searchName: "BTCUSDT 15m 테스트",
      symbols: ["BTCUSDT"],
      timeframe: "15m",
    });
    expect(pres.primary).toBe("BTCUSDT 15m 테스트");
    expect(pres.metadata).toBe("BTCUSDT · 15분봉");
    render(
      <GuidedSetupCompactContinuations
        recentCompletedJob={
          job({
            searchName: "BTCUSDT 15m 테스트",
          }) as StrategySearchJobSummary
        }
        resumableCount={0}
        onViewRecentResult={() => {}}
        onViewResumableList={() => {}}
      />,
    );
    expect(screen.getByTestId("ss-guided-compact-recent-title").textContent).toContain(
      "BTCUSDT 15m 테스트",
    );
    expect(
      screen.getByTestId("ss-guided-compact-recent-metadata").textContent,
    ).toBe("BTCUSDT · 15분봉");
  });

  it("guided workbench omits stale completed-search helper copy", () => {
    const src = require("node:fs").readFileSync(
      require("node:path").join(
        process.cwd(),
        "components/rextora/strategySearch/StrategySearchWorkbench.tsx",
      ),
      "utf8",
    );
    expect(src).not.toContain("완료된 탐색이 있습니다. 아래 결과에서");
  });

  it("compact continuations omit raw internal names", () => {
    render(
      <GuidedSetupCompactContinuations
        recentCompletedJob={job({})}
        resumableCount={37}
        onViewRecentResult={() => {}}
        onViewResumableList={() => {}}
      />,
    );
    expect(screen.getByTestId("ss-guided-compact-continuations")).toBeTruthy();
    expect(screen.queryByText(/VERIFY_PATTERN/)).toBeNull();
    expect(screen.getByText(/15분봉/)).toBeTruthy();
    expect(screen.getByText(/재개 가능한 탐색 37건/)).toBeTruthy();
  });

  it("default search name uses Korean timeframe label", () => {
    expect(generateDefaultSearchName("BTCUSDT", "15m")).toBe(
      "BTCUSDT 15분봉 탐색",
    );
  });

  it("customer timeframe label in select; internal value remains 15m", () => {
    const form = createDefaultOperatorFormState();
    render(
      <StrategySearchVisualBuilder
        form={form}
        automatic={false}
        showDefaultBadges
        panels={{ mode: false, market: true, workspace: false }}
        onSelectAutomatic={() => {}}
        onSelectDirect={() => {}}
        onSymbol={() => {}}
        onTimeframe={() => {}}
        onPeriod={() => {}}
        onTradingStyle={() => {}}
        onDirection={() => {}}
        onToggleLayer={() => {}}
      />,
    );
    const select = screen.getByTestId("ss-timeframe") as HTMLSelectElement;
    expect(select.value).toBe("15m");
    expect(within(select).getByText("15분봉")).toBeTruthy();
    expect(screen.getByTestId("ss-default-badge-symbol")).toBeTruthy();
    expect(screen.getByTestId("ss-default-badge-timeframe")).toBeTruthy();
    expect(screen.getByTestId("ss-default-badge-period")).toBeTruthy();
  });

  it("default badges hidden when values differ from proven defaults", () => {
    const form = {
      ...createDefaultOperatorFormState(),
      symbol: "ETHUSDT",
    };
    render(
      <StrategySearchVisualBuilder
        form={form}
        automatic={false}
        showDefaultBadges
        panels={{ mode: false, market: true, workspace: false }}
        onSelectAutomatic={() => {}}
        onSelectDirect={() => {}}
        onSymbol={() => {}}
        onTimeframe={() => {}}
        onPeriod={() => {}}
        onTradingStyle={() => {}}
        onDirection={() => {}}
        onToggleLayer={() => {}}
      />,
    );
    expect(screen.queryByTestId("ss-default-badge-symbol")).toBeNull();
  });

  it("displayJobSearchTitle uses Korean timeframe for internal names", () => {
    expect(
      displayJobSearchTitle({
        id: "x",
        searchName: "agent_draft_BTCUSDT_15m",
        symbols: ["BTCUSDT"],
        timeframe: "15m",
      }),
    ).toBe("BTCUSDT · 15분봉");
    expect(GUIDED_STEP1_FIELD_DEFAULTS.timeframe).toBe("15m");
  });

  it("guided goNext advances Step 1 to Step 2 preserving symbol", () => {
    function Harness() {
      const form = createDefaultOperatorFormState();
      const guided = useStrategySearchGuidedSetup(form);
      return (
        <>
          <span data-testid="symbol">{form.symbol}</span>
          <span data-testid="step">{guided.currentStepId}</span>
          <button type="button" data-testid="go-next" onClick={() => guided.goNext()}>
            next
          </button>
        </>
      );
    }
    render(<Harness />);
    expect(screen.getByTestId("step").textContent).toBe("market");
    expect(screen.getByTestId("symbol").textContent).toBe("BTCUSDT");
    fireEvent.click(screen.getByTestId("go-next"));
    expect(screen.getByTestId("step").textContent).toBe("approach");
    expect(screen.getByTestId("symbol").textContent).toBe("BTCUSDT");
  });

  it("compact secondary hidden when a failed job is selected", () => {
    expect(
      shouldShowGuidedCompactSecondary({
        guidedSetupActive: true,
        guidedOperationalExpanded: false,
        hasSelectedJob: true,
        jobMissing: false,
        selectedJobStatus: "failed",
      }),
    ).toBe(false);
    expect(
      shouldShowGuidedCompactSecondary({
        guidedSetupActive: true,
        guidedOperationalExpanded: false,
        hasSelectedJob: true,
        jobMissing: false,
        selectedJobStatus: undefined,
      }),
    ).toBe(false);
    expect(
      shouldShowGuidedCompactSecondary({
        guidedSetupActive: true,
        guidedOperationalExpanded: false,
        hasSelectedJob: false,
        jobMissing: false,
      }),
    ).toBe(true);
  });

  it("mobile Step 1 clears visual-builder bottom padding that caused period→name gap", () => {
    const css = require("node:fs").readFileSync(
      require("node:path").join(process.cwd(), "components/rextora/v3/strategy-search.css"),
      "utf8",
    );
    expect(css).toContain('data-guided-step="market"');
    expect(css).toContain("padding-bottom: 96px");
    expect(css).toMatch(
      /ss-guided-step-mount\[data-guided-step="market"\][\s\S]*padding-bottom:\s*0/,
    );
  });

  it("custom period fields omit from DOM when preset is not custom", () => {
    const form = createDefaultOperatorFormState();
    render(
      <StrategySearchVisualBuilder
        form={form}
        automatic={false}
        panels={{ mode: false, market: true, workspace: false }}
        onSelectAutomatic={() => {}}
        onSelectDirect={() => {}}
        onSymbol={() => {}}
        onTimeframe={() => {}}
        onPeriod={() => {}}
        onTradingStyle={() => {}}
        onDirection={() => {}}
        onToggleLayer={() => {}}
        onCustomPeriodFrom={() => {}}
        onCustomPeriodTo={() => {}}
      />,
    );
    expect(screen.queryByTestId("ss-guided-custom-period")).toBeNull();
  });

  it("search-name input uses full-width mobile and expanded desktop contract", () => {
    const formSrc = require("node:fs").readFileSync(
      require("node:path").join(
        process.cwd(),
        "components/rextora/strategySearch/JobCreateForm.tsx",
      ),
      "utf8",
    );
    expect(formSrc).toContain("ss-guided-search-name-input");
    const css = require("node:fs").readFileSync(
      require("node:path").join(process.cwd(), "components/rextora/v3/strategy-search.css"),
      "utf8",
    );
    expect(css).toMatch(/\.ss-guided-search-name-input[\s\S]*width:\s*100%/);
    expect(css).toMatch(/@media \(min-width: 768px\)[\s\S]*ss-guided-search-name-input[\s\S]*560px/);
  });

  it("workbench guided mode uses compact panel contract in source", () => {
    const src = require("node:fs").readFileSync(
      require("node:path").join(
        process.cwd(),
        "components/rextora/strategySearch/StrategySearchWorkbench.tsx",
      ),
      "utf8",
    );
    expect(src).toContain("GuidedSetupCompactContinuations");
    expect(src).toContain("showGuidedCompactSecondary");
    expect(src).not.toContain("SetupResultsCollapsible");
  });
});
