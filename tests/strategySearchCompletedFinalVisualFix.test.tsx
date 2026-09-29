/** @vitest-environment jsdom */
import fs from "node:fs";
import path from "node:path";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CompletedDashboard } from "../components/rextora/strategySearch/completed/CompletedDashboard";
import { CompletedReturnRiskChart } from "../components/rextora/strategySearch/completed/CompletedReturnRiskChart";
import {
  buildCompletedDashboardViewModel,
  buildCompareCandidatesForGroup,
} from "../components/rextora/strategySearch/completed/completedViewModel";
import type { StrategySearchJobDetail } from "../components/rextora/strategySearch/types";

const ROOT = process.cwd();
function read(rel: string): string {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

function jobFixture(): StrategySearchJobDetail {
  return {
    id: "search_test",
    status: "completed",
    symbols: ["BTCUSDT"],
    timeframe: "15m",
    qualifiedCount: 4,
    gatePassedCount: 4,
    statistics: {
      generated: 480,
      evaluated: 480,
      passed: 4,
      failed: 476,
      elapsedMs: 1000,
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
          readableName: "Vol Breakout Aggressive",
          displayAlias: "Vol · A1",
          netReturn: 0.321471,
          maxDrawdown: -0.048562,
          tradeCount: 22,
          score: 0.683465,
        },
        {
          strategyHash: "h2",
          readableName: "Vol Breakout Aggressive",
          displayAlias: "Vol · A2",
          netReturn: 0.28,
          maxDrawdown: -0.06,
          tradeCount: 18,
          score: 0.65,
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

describe("Completed dashboard final visual fix", () => {
  afterEach(() => cleanup());

  it("A: Hero before compact AI ask action in dashboard layout", () => {
    render(
      <CompletedDashboard
        job={jobFixture()}
        payloadReady
        trials={{ jobId: "x", total: 0, limit: 200, offset: 0, trials: [] }}
        onNewSearch={() => {}}
      />,
    );
    const layout = screen.getByTestId("ss-completed-dashboard-layout");
    const ids = Array.from(layout.children).map((el) =>
      el.getAttribute("data-testid"),
    );
    expect(ids.indexOf("ss-completed-hero")).toBeLessThan(
      ids.indexOf("ss-completed-ask-ai"),
    );
    expect(screen.getByTestId("ss-completed-ask-ai-button").textContent).toContain(
      "AI에게",
    );
  });

  it("A2: page hides generic agent strip when completed primary", () => {
    const css = read("components/rextora/v3/strategy-search.css");
    expect(css).toContain('[data-testid="agent-context-strip"]');
    expect(css).toContain("display: none");
  });

  it("B: Hero market line uses 15분봉", () => {
    render(
      <CompletedDashboard
        job={jobFixture()}
        payloadReady
        trials={{ jobId: "x", total: 0, limit: 200, offset: 0, trials: [] }}
        onNewSearch={() => {}}
      />,
    );
    expect(screen.getByTestId("ss-completed-hero-market").textContent).toContain(
      "15분봉",
    );
    expect(screen.getByTestId("ss-completed-hero-market").textContent).not.toContain(
      "15m",
    );
  });

  it("C-D: common strategy context once; no MDD in comparison rows", () => {
    render(
      <CompletedDashboard
        job={jobFixture()}
        payloadReady
        trials={{ jobId: "x", total: 0, limit: 200, offset: 0, trials: [] }}
        onNewSearch={() => {}}
      />,
    );
    expect(screen.getByTestId("ss-completed-compare-common-context")).toBeTruthy();
    const comparison = screen.getByTestId("ss-completed-candidate-matrix");
    expect(comparison.textContent).not.toMatch(/\bMDD\b/);
    expect(comparison.textContent).toContain("최대 낙폭");
  });

  it("E-F: scatter point labels and recommendation label", () => {
    const model = buildCompletedDashboardViewModel({
      job: jobFixture(),
      payloadReady: true,
      trials: { jobId: "x", total: 0, limit: 200, offset: 0, trials: [] },
    });
    render(<CompletedReturnRiskChart model={model} />);
    expect(screen.getAllByTestId("ss-completed-risk-point-label").length).toBeGreaterThan(
      0,
    );
    expect(
      screen.getByTestId("ss-completed-risk-point-label-recommended").textContent,
    ).toContain("★");
    expect(
      screen.getByTestId("ss-completed-risk-point-label-recommended").textContent,
    ).toContain("추천");
  });

  it("G-H: floating tooltip and linked table row", () => {
    const model = buildCompletedDashboardViewModel({
      job: jobFixture(),
      payloadReady: true,
      trials: { jobId: "x", total: 0, limit: 200, offset: 0, trials: [] },
    });
    render(<CompletedReturnRiskChart model={model} />);
    fireEvent.mouseEnter(screen.getByTestId("ss-completed-risk-point-recommended"));
    const tip = screen.getByTestId("ss-completed-risk-tooltip");
    expect(tip.className).toContain("float-tooltip");
    expect(tip.textContent).toContain("수익률");
    expect(tip.textContent).toContain("종합 평가");
    fireEvent.mouseEnter(screen.getByTestId("ss-completed-risk-table-row-2"));
    expect(
      screen.getByTestId("ss-completed-risk-table-row-2").className,
    ).toContain("table-row--active");
  });

  it("I: mobile skips scatter plot mount", () => {
    const src = read(
      "components/rextora/strategySearch/completed/CompletedReturnRiskChart.tsx",
    );
    expect(src).toContain("!narrow && layout");
  });

  it("J: plot height contract in CSS", () => {
    const css = read("components/rextora/v3/strategy-search.css");
    expect(css).toMatch(/ss-completed-risk-chart__plot[\s\S]*height:\s*320px/);
  });

  it("K-L: action hierarchy and tertiary not primary filled", () => {
    const css = read("components/rextora/v3/strategy-search.css");
    expect(css).toMatch(/ss-completed-actions__tertiary[\s\S]*box-shadow:\s*none/);
    expect(css).toMatch(/ss-completed-actions__primary[\s\S]*rgb\(37 99 235/);
    const dash = read("components/rextora/strategySearch/completed/CompletedDashboard.tsx");
    expect(dash).toContain("ss-completed-actions__tertiary");
  });

  it("M-N: ranking unchanged; chart uses real candidate ids", () => {
    const rows = buildCompareCandidatesForGroup({
      job: jobFixture(),
      groupId: "safe_execution_price_v1",
      recommendedParamsHash: "h1",
    });
    expect(rows[0]?.rank).toBe(1);
    expect(rows[0]?.netReturn).toBe(0.321471);
  });

  it("O-P: compact decision chart; no legacy donut or flow chips", () => {
    render(
      <CompletedDashboard
        job={jobFixture()}
        payloadReady
        trials={{ jobId: "x", total: 0, limit: 200, offset: 0, trials: [] }}
        onNewSearch={() => {}}
      />,
    );
    expect(screen.getByTestId("ss-completed-waterfall-chart")).toBeTruthy();
    expect(screen.getByTestId("ss-completed-verification-headline").textContent).toMatch(
      /통과.*평가/,
    );
    expect(screen.queryByTestId("ss-completed-passfail-donut")).toBeNull();
    const css = read("components/rextora/v3/strategy-search.css");
    expect(css).not.toContain(".ss-completed-filter-flow__chip");
  });

  it("Q: desktop recommendation briefing uses full width grid", () => {
    const css = read("components/rextora/v3/strategy-search.css");
    expect(css).toMatch(/ss-completed-rec-briefing-row[\s\S]*display:\s*block/);
    expect(css).toMatch(/ss-completed-rec-visual[\s\S]*width:\s*100%/);
    expect(css).toMatch(/min-width:\s*1100px[\s\S]*repeat\(5/);
  });

  it("R: mobile candidate compact 2-column metrics", () => {
    render(
      <CompletedDashboard
        job={jobFixture()}
        payloadReady
        trials={{ jobId: "x", total: 0, limit: 200, offset: 0, trials: [] }}
        onNewSearch={() => {}}
      />,
    );
    const row = screen.getByTestId("ss-completed-matrix-row-1");
    expect(row.querySelector(".ss-completed-candidate-viz__card-compact")).toBeTruthy();
    expect(within(row).getByText("수익률")).toBeTruthy();
    expect(within(row).getByText("최대 낙폭")).toBeTruthy();
    expect(within(row).getByText("거래수")).toBeTruthy();
    expect(within(row).getByText("후보 비교 점수")).toBeTruthy();
  });

  it("S: recommended marker and label are separate elements", () => {
    const model = buildCompletedDashboardViewModel({
      job: jobFixture(),
      payloadReady: true,
      trials: { jobId: "x", total: 0, limit: 200, offset: 0, trials: [] },
    });
    render(<CompletedReturnRiskChart model={model} />);
    expect(screen.getByTestId("ss-completed-risk-point-recommended")).toBeTruthy();
    expect(screen.getByTestId("ss-completed-risk-point-label-recommended")).toBeTruthy();
  });

  it("T: qualification region uses subtle fill contract", () => {
    const css = read("components/rextora/v3/strategy-search.css");
    expect(css).toMatch(/ss-completed-risk-chart__qual-region[\s\S]*rgb\(34 197 94 \/ 0\.06\)/);
  });
});
