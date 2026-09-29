/** @vitest-environment jsdom */
import fs from "node:fs";
import path from "node:path";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CompletedDashboard } from "../components/rextora/strategySearch/completed/CompletedDashboard";
import { CompletedReturnRiskChart } from "../components/rextora/strategySearch/completed/CompletedReturnRiskChart";
import { buildQualificationGaugeModels } from "../components/rextora/strategySearch/completed/completedQualificationGauges";
import {
  buildCompletedDashboardViewModel,
  buildCompareCandidatesForGroup,
} from "../components/rextora/strategySearch/completed/completedViewModel";
import {
  buildQualificationThresholdLines,
  buildReturnMddScatterLayout,
} from "../components/rextora/strategySearch/completed/completedChartScale";
import type { StrategySearchJobDetail } from "../components/rextora/strategySearch/types";

const ROOT = process.cwd();
function read(rel: string): string {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

function multiCandidateJob(): StrategySearchJobDetail {
  return {
    id: "search_vis",
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
          score: 0.683465,
        },
        bestCandidate: null,
        topCandidates: [
          { iteration: 1, paramsHash: "h1", score: 0.683465, passed: true },
          { iteration: 2, paramsHash: "h2", score: 0.475, passed: true },
          { iteration: 3, paramsHash: "h3", score: 0.461, passed: true },
          { iteration: 4, paramsHash: "h4", score: 0.312, passed: true },
        ],
      },
    ],
    liveTop10: {
      entries: [
        {
          strategyHash: "h1",
          readableName: "Strategy One",
          displayAlias: "후보 1",
          netReturn: 0.321471,
          maxDrawdown: -0.048562,
          tradeCount: 22,
          winRate: 0.4545,
          score: 0.683465,
        },
        {
          strategyHash: "h2",
          readableName: "Strategy Two",
          displayAlias: "후보 2",
          netReturn: 0.205,
          maxDrawdown: -0.0373,
          tradeCount: 12,
          winRate: 0.4,
          score: 0.475,
        },
        {
          strategyHash: "h3",
          readableName: "Strategy Three",
          displayAlias: "후보 3",
          netReturn: 0.2324,
          maxDrawdown: -0.06,
          tradeCount: 18,
          winRate: 0.42,
          score: 0.461,
        },
        {
          strategyHash: "h4",
          readableName: "Strategy Four",
          displayAlias: "후보 4",
          netReturn: 0.215,
          maxDrawdown: -0.1799,
          tradeCount: 25,
          winRate: 0.38,
          score: 0.312,
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

vi.mock("../components/rextora/strategySearch/apiClient", () => ({
  fetchResearchResultsSummary: vi.fn().mockResolvedValue(null),
}));

afterEach(() => cleanup());

describe("Completed dashboard visualization overhaul", () => {
  it("A-B: funnel uses canonical generated/evaluated/passed/failed counts immediately", () => {
    render(
      <CompletedDashboard
        job={multiCandidateJob()}
        payloadReady
        trials={{ jobId: "x", total: 0, limit: 200, offset: 0, trials: [] }}
        onNewSearch={() => {}}
      />,
    );
    expect(screen.getByTestId("ss-verification-flow-generated").textContent).toContain(
      "480",
    );
    expect(screen.getByTestId("ss-verification-flow-evaluated").textContent).toContain(
      "480",
    );
    expect(screen.getByTestId("ss-verification-flow-rejected").textContent).toContain(
      "476",
    );
    expect(screen.getByTestId("ss-verification-flow-passed").textContent).toContain(
      "4",
    );
    expect(screen.getByTestId("ss-verification-flow-qualified").textContent).toContain(
      "4",
    );
  });

  it("C-E: qualification gauges use real thresholds and lower-is-better MDD", () => {
    const model = buildCompletedDashboardViewModel({
      job: multiCandidateJob(),
      payloadReady: true,
      trials: null,
      summary: null,
    });
    const gauges = buildQualificationGaugeModels(model);
    const ret = gauges.find((g) => g.id === "minTotalReturn");
    expect(ret?.kind).toBe("higher-is-better");
    if (ret?.kind === "higher-is-better") {
      expect(ret.thresholdPct).toBe("19.68%");
      expect(ret.actualPct).toBe("32.15%");
      expect(ret.met).toBe(true);
    }
    const mdd = gauges.find((g) => g.id === "maxMdd");
    expect(mdd?.kind).toBe("lower-is-better");
    if (mdd?.kind === "lower-is-better") {
      expect(mdd.limitPct).toBe("25.00%");
      expect(mdd.actualPct).toBe("4.86%");
      expect(mdd.met).toBe(true);
    }
    const trades = gauges.find((g) => g.id === "minTradeCount");
    if (trades?.kind === "count-min") {
      expect(trades.minimum).toBe(10);
      expect(trades.actual).toBe(22);
    }
  });

  it("F: null minWinRate/minScore do not add fake gauges", () => {
    const model = buildCompletedDashboardViewModel({
      job: multiCandidateJob(),
      payloadReady: true,
      trials: null,
      summary: null,
    });
    const gauges = buildQualificationGaugeModels(model);
    expect(gauges.some((g) => g.id === "minWinRate")).toBe(false);
    expect(gauges.some((g) => g.id === "minScore")).toBe(false);
  });

  it("G: score is not rendered as percentage gauge", () => {
    render(
      <CompletedDashboard
        job={multiCandidateJob()}
        payloadReady
        trials={{ jobId: "x", total: 0, limit: 200, offset: 0, trials: [] }}
        onNewSearch={() => {}}
      />,
    );
    const score = screen.getByTestId("ss-completed-rec-score");
    expect(score.textContent).toContain("0.683");
    expect(score.textContent).not.toContain("%");
    const card = read("components/rextora/strategySearch/completed/CompletedRecommendationVisuals.tsx");
    expect(card).not.toMatch(/strokeDasharray.*score/i);
    expect(read("components/rextora/strategySearch/completed/CompletedQualificationGauge.tsx")).not.toContain(
      "minScore",
    );
  });

  it("H-I: win-rate donut and insight tiles use deterministic data", () => {
    render(
      <CompletedDashboard
        job={multiCandidateJob()}
        payloadReady
        trials={{ jobId: "x", total: 0, limit: 200, offset: 0, trials: [] }}
        onNewSearch={() => {}}
      />,
    );
    expect(screen.getByTestId("ss-completed-rec-win-donut")).toBeTruthy();
    expect(screen.getByTestId("ss-insight-reason").textContent).toContain("검증 기준 통과");
    expect(screen.getByTestId("ss-briefing-chip-return").textContent).toContain("32.15");
  });

  it("J-K: candidate matrix metrics without score micro-bar", () => {
    render(
      <CompletedDashboard
        job={multiCandidateJob()}
        payloadReady
        trials={{ jobId: "x", total: 0, limit: 200, offset: 0, trials: [] }}
        onNewSearch={() => {}}
      />,
    );
    const row = screen.getByTestId("ss-completed-matrix-row-1");
    expect(row.textContent).toContain("32.15");
    expect(screen.getByTestId("ss-matrix-score-1").querySelector(".ss-completed-metric-matrix__micro")).toBeNull();
  });

  it("L-O: return-risk chart threshold lines and region orientation", () => {
    const rows = buildCompareCandidatesForGroup({
      job: multiCandidateJob(),
      groupId: "safe_execution_price_v1",
      recommendedParamsHash: "h1",
    });
    const layout = buildReturnMddScatterLayout(rows)!;
    const lines = buildQualificationThresholdLines(layout.axes, layout.bounds, {
      minTotalReturn: 0.1968,
      maxMdd: -0.25,
    });
    expect(lines.showRegion).toBe(true);
    expect(lines.minReturnY).not.toBeNull();
    expect(lines.maxMddX).not.toBeNull();
    const rec = rows.find((r) => r.isRecommended)!;
    expect(rec.netReturn!).toBeGreaterThanOrEqual(0.1968);
    expect(Math.abs(rec.maxDrawdown!)).toBeLessThanOrEqual(0.25);

    render(
      <CompletedReturnRiskChart
        model={buildCompletedDashboardViewModel({
          job: multiCandidateJob(),
          payloadReady: true,
          trials: null,
          summary: null,
        })}
      />,
    );
    expect(screen.getByTestId("ss-completed-risk-min-return-line")).toBeTruthy();
    expect(screen.getByTestId("ss-completed-risk-max-mdd-line")).toBeTruthy();
    expect(screen.getByTestId("ss-completed-risk-qual-region")).toBeTruthy();
  });

  it("P: tooltip linking on hover", () => {
    render(
      <CompletedReturnRiskChart
        model={buildCompletedDashboardViewModel({
          job: multiCandidateJob(),
          payloadReady: true,
          trials: null,
          summary: null,
        })}
      />,
    );
    const pt = screen.getByTestId("ss-completed-risk-point-recommended");
    fireEvent.mouseEnter(pt);
    expect(screen.getByTestId("ss-completed-risk-tooltip")).toBeTruthy();
  });

  it("Q: mobile scatter not mounted when narrow", () => {
    vi.stubGlobal("matchMedia", (query: string) => ({
      matches: query.includes("767"),
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }));
    render(
      <CompletedReturnRiskChart
        model={buildCompletedDashboardViewModel({
          job: multiCandidateJob(),
          payloadReady: true,
          trials: null,
          summary: null,
        })}
      />,
    );
    expect(screen.queryByTestId("ss-completed-return-mdd-scatter")).toBeNull();
    expect(screen.getByTestId("ss-completed-return-mdd-cards")).toBeTruthy();
    vi.unstubAllGlobals();
  });

  it("R: action tier CSS contract without ss-btn on dashboard", () => {
    const dash = read("components/rextora/strategySearch/completed/CompletedDashboard.tsx");
    expect(dash).toContain("ss-completed-actions__primary");
    expect(dash).not.toMatch(/ss-completed-actions__primary[\s\S]*ss-btn-primary/);
    const css = read("components/rextora/v3/strategy-search.css");
    expect(css).toMatch(/ss-completed-actions__primary[\s\S]*rgb\(37 99 235/);
    expect(css).toMatch(/ss-completed-actions__secondary[\s\S]*rgb\(219 234 254/);
    expect(css).toMatch(/ss-completed-actions__tertiary[\s\S]*rgb\(255 255 255/);
  });

  it("S-T: AI ask preserved; no fake equity series", () => {
    render(
      <CompletedDashboard
        job={multiCandidateJob()}
        payloadReady
        trials={{ jobId: "x", total: 0, limit: 200, offset: 0, trials: [] }}
        onNewSearch={() => {}}
      />,
    );
    expect(screen.getByTestId("ss-completed-ask-ai-button")).toBeTruthy();
    expect(screen.queryByTestId("ss-completed-no-equity-chart")).toBeNull();
    expect(read("components/rextora/strategySearch/completed/CompletedDashboard.tsx")).not.toContain(
      "CompletedReturnRiskChart",
    );
    expect(read("components/rextora/strategySearch/completed/CompletedDashboard.tsx")).not.toContain(
      "equityCurve",
    );
  });
});
