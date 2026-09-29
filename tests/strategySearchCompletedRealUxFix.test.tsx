/** @vitest-environment jsdom */
import fs from "node:fs";
import path from "node:path";
import { cleanup, render, screen, fireEvent } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CompletedDashboard } from "../components/rextora/strategySearch/completed/CompletedDashboard";
import { CompletedReturnRiskChart } from "../components/rextora/strategySearch/completed/CompletedReturnRiskChart";
import {
  buildCompletedDashboardViewModel,
  buildCompareCandidatesForGroup,
} from "../components/rextora/strategySearch/completed/completedViewModel";
import {
  shouldHideLegacyWorkbenchForCompleted,
  shouldShowCompletedResultLoading,
} from "../components/rextora/strategySearch/completed/completedLoadingGate";
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
    completionReason: "QUALIFIED_TARGET_REACHED",
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
      evaluationWindowLabel: "전체 구간",
      evaluationStartUtc: "2026-05-27T00:00:00.000Z",
      evaluationEndUtc: "2026-09-24T23:59:59.999Z",
      searchApproachKo: "자동",
      completionReason: "QUALIFIED_TARGET_REACHED",
      completionReasonLabelKo: "합격 목표 달성",
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
          readableName: "Same Strategy Name",
          displayAlias: "Same · A1",
          netReturn: 0.32,
          maxDrawdown: -0.05,
          tradeCount: 22,
          winRate: 0.45,
          score: 0.68,
        },
        {
          strategyHash: "h2",
          readableName: "Same Strategy Name",
          displayAlias: "Same · A2",
          netReturn: 0.28,
          maxDrawdown: -0.06,
          tradeCount: 18,
          winRate: 0.42,
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

describe("Completed dashboard real UX fix", () => {
  afterEach(() => cleanup());

  it("A: legacy workbench hidden when completed loading exclusive", () => {
    expect(
      shouldHideLegacyWorkbenchForCompleted({
        showCompletedDashboardPrimary: false,
        showCompletedResultLoading: true,
      }),
    ).toBe(true);
    const wb = read("components/rextora/strategySearch/StrategySearchWorkbench.tsx");
    expect(wb).toContain("hideLegacyWorkbenchSurfaces");
    expect(wb).toContain(
      "hideLegacyWorkbenchSurfaces ? null : showGuidedCompactSecondary",
    );
  });

  it("B: resume job route uses completed result loading not setup copy", () => {
    const wb = read("components/rextora/strategySearch/StrategySearchWorkbench.tsx");
    expect(wb).toContain("showCompletedRouteBootstrapLoading");
    expect(wb).toContain("resumeJobId");
  });

  it("C: KPI shows final counts without count-up hook", () => {
    const kpi = read("components/rextora/strategySearch/completed/CompletedKpiStrip.tsx");
    expect(kpi).not.toContain("useCountUpDisplay");
    render(
      <CompletedDashboard
        job={jobFixture()}
        payloadReady
        trials={{ jobId: "x", total: 0, limit: 200, offset: 0, trials: [] }}
        onNewSearch={() => {}}
      />,
    );
    expect(screen.getByTestId("ss-completed-kpi-evaluated").textContent).toContain(
      "480",
    );
  });

  it("D: single verification flow card replaces duplicate qual+funnel", () => {
    render(
      <CompletedDashboard
        job={jobFixture()}
        payloadReady
        trials={{ jobId: "x", total: 0, limit: 200, offset: 0, trials: [] }}
        onNewSearch={() => {}}
      />,
    );
    expect(screen.getByTestId("ss-completed-verification-flow")).toBeTruthy();
    expect(screen.queryByTestId("ss-completed-qual-summary")).toBeNull();
    expect(screen.queryByTestId("ss-completed-funnel")).toBeNull();
    expect(screen.getByTestId("ss-verification-flow-evaluated").textContent).toContain(
      "480",
    );
  });

  it("E: pass rate remains secondary in verification flow", () => {
    render(
      <CompletedDashboard
        job={jobFixture()}
        payloadReady
        trials={{ jobId: "x", total: 0, limit: 200, offset: 0, trials: [] }}
        onNewSearch={() => {}}
      />,
    );
    const flow = screen.getByTestId("ss-completed-verification-flow");
    expect(flow.textContent).toContain("통과율");
    expect(flow.textContent).toContain("0.83");
  });

  it("F: briefing row uses align-items start", () => {
    const css = read("components/rextora/v3/strategy-search.css");
    expect(css).toMatch(/ss-completed-rec-briefing-row[\s\S]*align-items:\s*start/);
  });

  it("G: identical strategy names get 후보 N identities", () => {
    const rows = buildCompareCandidatesForGroup({
      job: jobFixture(),
      groupId: "safe_execution_price_v1",
      recommendedParamsHash: "h1",
    });
    expect(rows[0]?.displayPrimary).toContain("후보 1");
    expect(rows[1]?.displayPrimary).toContain("후보 2");
  });

  it("H-I: scatter height and axis labels constrained in CSS", () => {
    const css = read("components/rextora/v3/strategy-search.css");
    expect(css).toMatch(/height:\s*320px/);
    expect(css).toContain("ss-completed-risk-chart__plot");
    expect(css).toContain("ss-completed-risk-chart__float-tooltip");
  });

  it("J: scatter tooltip still works", () => {
    const model = buildCompletedDashboardViewModel({
      job: jobFixture(),
      payloadReady: true,
      trials: { jobId: "x", total: 0, limit: 200, offset: 0, trials: [] },
    });
    Object.defineProperty(window, "matchMedia", {
      writable: true,
      value: vi.fn().mockImplementation((q: string) => ({
        matches: q.includes("767") ? false : false,
        media: q,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      })),
    });
    render(<CompletedReturnRiskChart model={model} />);
    const pt = screen.getByTestId("ss-completed-risk-point-recommended");
    fireEvent.mouseEnter(pt);
    expect(screen.getByTestId("ss-completed-risk-tooltip")).toBeTruthy();
    expect(screen.getByTestId("ss-completed-risk-compact-table")).toBeTruthy();
  });

  it("K-L: narrow layout skips scatter mount", () => {
    const src = read(
      "components/rextora/strategySearch/completed/CompletedReturnRiskChart.tsx",
    );
    expect(src).toContain("useNarrowLayout");
    expect(src).toContain("!narrow && layout");
  });

  it("M-N: group ranking CTA closed hides panel; open label 접기", () => {
    render(
      <CompletedDashboard
        job={jobFixture()}
        payloadReady
        trials={{ jobId: "x", total: 0, limit: 200, offset: 0, trials: [] }}
        onNewSearch={() => {}}
      />,
    );
    expect(screen.queryByTestId("ss-completed-ranking-disclosure")).toBeNull();
    fireEvent.click(screen.getByTestId("ss-completed-group-ranking-open"));
    expect(screen.getByTestId("ss-completed-ranking-disclosure")).toBeTruthy();
    expect(screen.getByTestId("ss-completed-group-ranking-open").textContent).toContain(
      "접기",
    );
  });

  it("O: action hierarchy CSS distinguishes primary vs tertiary", () => {
    const css = read("components/rextora/v3/strategy-search.css");
    expect(css).toContain("ss-completed-actions__primary");
    expect(css).toContain("ss-completed-actions__tertiary");
    expect(css).toMatch(/ss-completed-actions__tertiary[\s\S]*box-shadow:\s*none/);
  });

  it("loading gate still active for completed detail fetch", () => {
    expect(
      shouldShowCompletedResultLoading({
        clientReady: true,
        selectedId: "x",
        jobMissing: false,
        detail: null,
        detailFetchState: "loading",
        trials: null,
      }),
    ).toBe(true);
  });
});
