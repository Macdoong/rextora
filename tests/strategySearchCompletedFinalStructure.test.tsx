/** @vitest-environment jsdom */
import fs from "node:fs";
import path from "node:path";
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CompletedDashboard } from "../components/rextora/strategySearch/completed/CompletedDashboard";
import { CompletedFilterDonutFlow } from "../components/rextora/strategySearch/completed/CompletedFilterDonutFlow";
import { compareBarDomainMax } from "../components/rextora/strategySearch/completed/completedCompareChartScale";
import { buildCompletedDashboardViewModel } from "../components/rextora/strategySearch/completed/completedViewModel";
import type { StrategySearchJobDetail } from "../components/rextora/strategySearch/types";

const ROOT = process.cwd();
function read(rel: string): string {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

function jobFixture(): StrategySearchJobDetail {
  return {
    id: "search_structure",
    status: "completed",
    symbols: ["BTCUSDT"],
    timeframe: "15m",
    qualifiedCount: 4,
    gatePassedCount: 4,
    rejectedCount: 476,
    evaluatedCount: 480,
    statistics: {
      generated: 480,
      evaluated: 480,
      passed: 4,
      failed: 476,
      elapsedMs: 1000,
    },
    completedAnalysisContext: {
      symbol: "BTCUSDT",
      timeframe: "15m",
      evaluationWindowLabel: "전체",
      evaluationStartUtc: "2026-05-27T00:00:00.000Z",
      evaluationEndUtc: "2026-09-24T23:59:59.999Z",
      searchApproachKo: "자동",
      completionReason: "QUALIFIED_TARGET_REACHED",
      completionReasonLabelKo: "합격",
      passThresholds: {
        minTotalReturn: 0.1968,
        maxMdd: -0.25,
        minTradeCount: 10,
        minWinRate: null,
        minScore: null,
      },
      jitterEnabled: true,
    },
    rankingGroups: [
      {
        rankingCompatibilityGroup: "safe_execution_price_v1",
        rankingEligible: true,
        bestPassedCandidate: {
          candidateId: "c1",
          iteration: 1,
          paramsHash: "h1",
          passed: true,
          score: 0.68,
        },
        bestCandidate: null,
        topCandidates: [
          { iteration: 1, paramsHash: "h1", score: 0.68, passed: true },
          { iteration: 2, paramsHash: "h2", score: 0.65, passed: true },
        ],
      },
    ],
    liveTop10: {
      entries: [
        {
          strategyHash: "h1",
          readableName: "A",
          displayAlias: "A1",
          netReturn: 0.3215,
          maxDrawdown: -0.0486,
          tradeCount: 22,
          score: 0.683,
        },
        {
          strategyHash: "h2",
          readableName: "B",
          displayAlias: "B2",
          netReturn: 0.205,
          maxDrawdown: -0.1799,
          tradeCount: 12,
          score: 0.475,
        },
      ],
      finalEntries: [],
    },
    config: {
      searchVersion: "1",
      strategyTemplateId: "t",
      symbols: ["BTCUSDT"],
      timeframe: "15m",
      dataVersion: "v1",
      seed: 1,
      generatorType: "random",
      maxIterations: 100,
      parameterRangeKeys: [],
      evaluationWindowIds: ["full"],
    },
    checkpoint: {
      completedIterations: 100,
      nextIteration: 100,
      bestCandidate: null,
      bestPassedCandidate: null,
      updatedAt: "",
      hasRunnerPayload: false,
    },
  } as StrategySearchJobDetail;
}

vi.mock("../components/rextora/strategySearch/apiClient", () => ({
  fetchResearchResultsSummary: vi.fn().mockResolvedValue(null),
}));

vi.mock("../components/rextora/strategySearch/completed/useCompletedMotion", () => ({
  useCompletedMotion: () => false,
}));

vi.mock("../components/rextora/strategySearch/completed/usePresentationEnter", () => ({
  usePresentationEnter: () => true,
}));

describe("Completed dashboard final structure", () => {
  afterEach(() => cleanup());

  it("A-B: waterfall mounted; no donut or branch-box flow", () => {
    render(
      <CompletedDashboard
        job={jobFixture()}
        payloadReady
        trials={{ jobId: "x", total: 0, limit: 200, offset: 0, trials: [] }}
        onNewSearch={() => {}}
      />,
    );
    expect(screen.getByTestId("ss-completed-waterfall-chart")).toBeTruthy();
    expect(screen.queryByTestId("ss-completed-passfail-donut")).toBeNull();
    const css = read("components/rextora/v3/strategy-search.css");
    expect(css).not.toContain(".ss-completed-filter-flow__chip");
    expect(css).not.toContain(".ss-completed-decision-flow__fork");
  });

  it("C-E: waterfall authoritative values; pass rate secondary", () => {
    const model = buildCompletedDashboardViewModel({
      job: jobFixture(),
      payloadReady: true,
      trials: { jobId: "x", total: 0, limit: 200, offset: 0, trials: [] },
    });
    render(<CompletedFilterDonutFlow model={model} />);
    expect(screen.getByTestId("ss-waterfall-value-evaluated").textContent).toBe("480");
    expect(screen.getByTestId("ss-waterfall-value-failed").textContent).toContain("476");
    expect(screen.getByTestId("ss-waterfall-value-passed").textContent).toBe("4");
    expect(screen.getByTestId("ss-waterfall-value-qualified").textContent).toContain("4");
    expect(screen.getByTestId("ss-completed-verification-headline").textContent).toContain(
      "4개 통과 / 480개 평가",
    );
    expect(screen.getByText(/통과율 0\.83/)).toBeTruthy();
  });

  it("F: numeric labels stable in source (no count-up animation on values)", () => {
    const src = read(
      "components/rextora/strategySearch/completed/CompletedFilterDonutFlow.tsx",
    );
    expect(src).toContain("formatCount(passed)");
    expect(src).not.toMatch(/useState\(0\).*passed/s);
  });

  it("G: ReturnRiskChart not mounted from CompletedDashboard", () => {
    const dash = read("components/rextora/strategySearch/completed/CompletedDashboard.tsx");
    expect(dash).not.toContain("CompletedReturnRiskChart");
    render(
      <CompletedDashboard
        job={jobFixture()}
        payloadReady
        trials={{ jobId: "x", total: 0, limit: 200, offset: 0, trials: [] }}
        onNewSearch={() => {}}
      />,
    );
    expect(screen.queryByTestId("ss-completed-return-risk-section")).toBeNull();
  });

  it("H-I: comparison charts show thresholds when configured", () => {
    render(
      <CompletedDashboard
        job={jobFixture()}
        payloadReady
        trials={{ jobId: "x", total: 0, limit: 200, offset: 0, trials: [] }}
        onNewSearch={() => {}}
      />,
    );
    expect(screen.getByTestId("ss-completed-return-threshold-label").textContent).toContain(
      "19.68",
    );
    expect(screen.getByTestId("ss-completed-mdd-threshold-label").textContent).toContain(
      "25",
    );
    expect(screen.getAllByTestId("ss-completed-return-threshold-marker").length).toBeGreaterThan(
      0,
    );
    expect(screen.getAllByTestId("ss-completed-mdd-threshold-marker").length).toBeGreaterThan(
      0,
    );
  });

  it("J: bar domain includes configured thresholds", () => {
    expect(compareBarDomainMax([0.17], 0.1968)).toBeGreaterThanOrEqual(0.1968);
    expect(compareBarDomainMax([0.18], 0.25)).toBeGreaterThanOrEqual(0.25);
  });

  it("K-L: mobile matrix compact; no risk fallback", () => {
    render(
      <CompletedDashboard
        job={jobFixture()}
        payloadReady
        trials={{ jobId: "x", total: 0, limit: 200, offset: 0, trials: [] }}
        onNewSearch={() => {}}
      />,
    );
    expect(screen.queryByTestId("ss-completed-return-mdd-cards")).toBeNull();
    const row = screen.getByTestId("ss-completed-matrix-row-1");
    expect(row.querySelector(".ss-completed-candidate-viz__card-compact")).toBeTruthy();
    expect(within(row).getByTestId("ss-matrix-return-thresh-1")).toBeTruthy();
  });

  it("M: single candidate comparison section", () => {
    render(
      <CompletedDashboard
        job={jobFixture()}
        payloadReady
        trials={{ jobId: "x", total: 0, limit: 200, offset: 0, trials: [] }}
        onNewSearch={() => {}}
      />,
    );
    expect(screen.getAllByTestId("ss-completed-candidate-matrix")).toHaveLength(1);
  });

  it("N-P: protected sections unchanged in dashboard mount order", () => {
    render(
      <CompletedDashboard
        job={jobFixture()}
        payloadReady
        trials={{ jobId: "x", total: 0, limit: 200, offset: 0, trials: [] }}
        onNewSearch={() => {}}
      />,
    );
    const layout = screen.getByTestId("ss-completed-dashboard-layout");
    const ids = Array.from(layout.children).map((el) => el.getAttribute("data-testid"));
    expect(ids.indexOf("ss-completed-rec-briefing-row")).toBeLessThan(
      ids.indexOf("ss-completed-qualification-gauges"),
    );
    expect(screen.getByTestId("ss-completed-ai-briefing")).toBeTruthy();
    expect(screen.getByTestId("ss-completed-actions")).toBeTruthy();
    const css = read("components/rextora/v3/strategy-search.css");
    expect(css).toMatch(/ss-completed-actions__primary[\s\S]*rgb\(37 99 235/);
  });
});
