/** @vitest-environment jsdom */
import fs from "node:fs";
import path from "node:path";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CompletedDashboard } from "../components/rextora/strategySearch/completed/CompletedDashboard";
import { CompletedQualificationGauge } from "../components/rextora/strategySearch/completed/CompletedQualificationGauge";
import { CompletedInsightTiles } from "../components/rextora/strategySearch/completed/CompletedInsightTiles";
import { buildCompletedDashboardViewModel } from "../components/rextora/strategySearch/completed/completedViewModel";
import type { StrategySearchJobDetail } from "../components/rextora/strategySearch/types";

const ROOT = process.cwd();
function read(rel: string): string {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

vi.mock("../components/rextora/strategySearch/completed/useCompletedMotion", () => ({
  useCompletedMotion: () => false,
}));

vi.mock("../components/rextora/strategySearch/completed/usePresentationEnter", () => ({
  usePresentationEnter: () => true,
}));

function jobFixture(): StrategySearchJobDetail {
  return {
    id: "search_readability",
    status: "completed",
    symbols: ["BTCUSDT"],
    timeframe: "15m",
    completionReason: "QUALIFIED_TARGET_REACHED",
    qualifiedCount: 1,
    gatePassedCount: 1,
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
          score: 0.683465,
        },
        bestCandidate: null,
        topCandidates: [],
      },
    ],
    liveTop10: {
      entries: [
        {
          strategyHash: "h1",
          readableName: "BTCUSDT 15m · Vol",
          displayAlias: "Vol · A1",
          netReturn: 0.321471,
          maxDrawdown: -0.048562,
          tradeCount: 22,
          winRate: 0.4545,
          score: 0.683465,
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
      jitter: { enabled: true },
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

describe("Completed readability final polish", () => {
  afterEach(() => cleanup());

  it("A-B: score help inline beside label; label row not full-width stretch", () => {
    render(
      <CompletedDashboard
        job={jobFixture()}
        payloadReady
        trials={{ jobId: "x", total: 0, limit: 200, offset: 0, trials: [] }}
        onNewSearch={() => {}}
      />,
    );
    const row = screen.getByTestId("ss-completed-rec-score-label-row");
    expect(within(row).getByText("후보 비교 점수")).toBeTruthy();
    expect(within(row).getByTestId("ss-completed-score-help-trigger")).toBeTruthy();
    const css = read("components/rextora/v3/strategy-search.css");
    expect(css).toMatch(/ss-completed-rec-visual__score-label-row[\s\S]*width:\s*fit-content/);
    expect(css).toMatch(
      /ss-completed-rec-visual__score-label-row \.ss-completed-type-caption[\s\S]*flex:\s*0 1 auto/,
    );
  });

  it("C-D: popover left/right placement and bounded width", () => {
    render(
      <CompletedDashboard
        job={jobFixture()}
        payloadReady
        trials={{ jobId: "x", total: 0, limit: 200, offset: 0, trials: [] }}
        onNewSearch={() => {}}
      />,
    );
    fireEvent.click(
      within(screen.getByTestId("ss-completed-rec-score-label-row")).getByTestId(
        "ss-completed-score-help-trigger",
      ),
    );
    const pop = screen.getByTestId("ss-completed-score-help-popover");
    expect(pop.getAttribute("data-popover-placement")).toMatch(/left|right/);
    expect(read("components/rextora/strategySearch/completed/CompletedScoreHelp.tsx")).toContain(
      "ss-completed-score-help__popover--left",
    );
    const css = read("components/rextora/v3/strategy-search.css");
    expect(css).toContain("min(320px, calc(100vw - 24px))");
  });

  it("E: score value unchanged", () => {
    render(
      <CompletedDashboard
        job={jobFixture()}
        payloadReady
        trials={{ jobId: "x", total: 0, limit: 200, offset: 0, trials: [] }}
        onNewSearch={() => {}}
      />,
    );
    expect(screen.getByTestId("ss-completed-rec-score").textContent).toContain("0.683");
    expect(screen.getByTestId("ss-completed-rec-score").textContent).not.toMatch(/%/);
  });

  it("F: typography scale contracts in completed scope", () => {
    const css = read("components/rextora/v3/strategy-search.css");
    expect(css).toMatch(/ss-completed-type-section[\s\S]*font-size:\s*1rem/);
    expect(css).toMatch(/ss-completed-type-metric[\s\S]*font-size:\s*1\.25rem/);
    expect(css).toMatch(/ss-completed-type-caption[\s\S]*0\.8125rem/);
  });

  it("G: five recommendation metric tiles still render", () => {
    render(
      <CompletedDashboard
        job={jobFixture()}
        payloadReady
        trials={{ jobId: "x", total: 0, limit: 200, offset: 0, trials: [] }}
        onNewSearch={() => {}}
      />,
    );
    const visuals = screen.getByTestId("ss-completed-recommendation-visuals");
    expect(visuals.querySelectorAll(".ss-completed-rec-visual__tile").length).toBe(5);
  });

  it("H-I: qualification thresholds unchanged; MDD lower-is-better cue", () => {
    render(
      <CompletedQualificationGauge
        delayMs={0}
        dataStable
        gauge={{
          kind: "lower-is-better",
          id: "maxMdd",
          label: "최대 낙폭",
          limit: -0.25,
          actual: -0.05,
          limitPct: "25.00%",
          actualPct: "5.00%",
          deltaLabel: "한도 대비 여유",
          met: true,
          limitMarkerRatio: 0.7,
          resultMarkerRatio: 0.2,
        }}
      />,
    );
    expect(screen.getByTestId("ss-completed-qual-direction-lower").textContent).toContain(
      "낮을수록 유리",
    );
    expect(screen.getByTestId("ss-qual-gauge-result-maxMdd").textContent).toContain("5.00%");
  });

  it("J: stability card is status-only without numeric gauge", () => {
    render(
      <CompletedQualificationGauge
        delayMs={0}
        dataStable
        gauge={{ kind: "stability", id: "jitter", label: "안정성 검증", met: true }}
      />,
    );
    expect(screen.getByTestId("ss-completed-qual-stability-status").textContent).toContain(
      "안정성 기준 통과",
    );
    expect(screen.queryByTestId("ss-qual-gauge-result-jitter")).toBeNull();
    const css = read("components/rextora/v3/strategy-search.css");
    expect(css).toContain("ss-completed-qual-gauge--stability-status");
  });

  it("K-L: AI insight copy unchanged; dashboard section order intact", () => {
    const model = buildCompletedDashboardViewModel({
      job: jobFixture(),
      payloadReady: true,
      trials: { jobId: "x", total: 0, limit: 200, offset: 0, trials: [] },
    });
    render(<CompletedInsightTiles model={model} />);
    expect(screen.getByText("추천 이유")).toBeTruthy();
    expect(screen.getByText("✓ 검증 기준 통과")).toBeTruthy();
    expect(screen.getByText("과거 검증 결과")).toBeTruthy();
    const dash = read(
      "components/rextora/strategySearch/completed/CompletedDashboard.tsx",
    );
    expect(dash.indexOf("CompletedKpiStrip")).toBeLessThan(
      dash.indexOf("CompletedQualificationGaugeGrid"),
    );
    expect(dash.indexOf("CompletedQualificationGaugeGrid")).toBeLessThan(
      dash.indexOf("CompletedInsightTiles"),
    );
  });
});
