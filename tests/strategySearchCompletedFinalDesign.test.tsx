/** @vitest-environment jsdom */
import fs from "node:fs";
import path from "node:path";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CompletedDashboard } from "../components/rextora/strategySearch/completed/CompletedDashboard";
import { CompletedReturnRiskChart } from "../components/rextora/strategySearch/completed/CompletedReturnRiskChart";
import { buildQualificationGaugeModels } from "../components/rextora/strategySearch/completed/completedQualificationGauges";
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
    id: "search_final",
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
        rankingCompatibilityGroup: "g1",
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

describe("Completed dashboard final design", () => {
  it("A: typography scope on completed layout", () => {
    render(
      <CompletedDashboard
        job={jobFixture()}
        payloadReady
        trials={{ jobId: "x", total: 0, limit: 200, offset: 0, trials: [] }}
        onNewSearch={() => {}}
      />,
    );
    expect(
      screen.getByTestId("ss-completed-dashboard-layout").className,
    ).toContain("ss-completed-dashboard-layout--typography");
    const css = read("components/rextora/v3/strategy-search.css");
    expect(css).toContain("ss-completed-type-major");
    expect(css).toMatch(/ss-completed-dashboard-layout--typography[\s\S]*Apple SD Gothic Neo/);
  });

  it("B-C: bright recommendation and insight tiles (no dark gray contract)", () => {
    const css = read("components/rextora/v3/strategy-search.css");
    expect(css).toMatch(/ss-completed-rec-visual__tile--return[\s\S]*236 253 245/);
    expect(css).toMatch(/ss-completed-insight-tiles--bright[\s\S]*239 246 255/);
    expect(css).toContain("ss-completed-insight-tiles--bright");
    render(
      <CompletedDashboard
        job={jobFixture()}
        payloadReady
        trials={{ jobId: "x", total: 0, limit: 200, offset: 0, trials: [] }}
        onNewSearch={() => {}}
      />,
    );
    expect(screen.getByTestId("ss-completed-recommendation-visuals").className).toContain(
      "ss-completed-rec-visual--bright",
    );
  });

  it("D-G: decision chart uses canonical funnel data", () => {
    render(
      <CompletedDashboard
        job={jobFixture()}
        payloadReady
        trials={{ jobId: "x", total: 0, limit: 200, offset: 0, trials: [] }}
        onNewSearch={() => {}}
      />,
    );
    expect(screen.getByTestId("ss-completed-waterfall-chart")).toBeTruthy();
    expect(screen.getByTestId("ss-completed-verification-headline").textContent).toContain(
      "4개 통과 / 480개 평가",
    );
    expect(screen.getByText(/통과율 0\.83/)).toBeTruthy();
    expect(screen.getByTestId("ss-verification-flow-generated").textContent).toContain(
      "480",
    );
    expect(screen.getByTestId("ss-verification-flow-qualified").textContent).toContain(
      "4",
    );
  });

  it("H-I: bullet chart mapping and lower-is-better MDD", () => {
    const model = buildCompletedDashboardViewModel({
      job: jobFixture(),
      payloadReady: true,
      trials: null,
      summary: null,
    });
    const gauges = buildQualificationGaugeModels(model);
    const ret = gauges.find((g) => g.id === "minTotalReturn");
    expect(ret?.kind).toBe("higher-is-better");
    if (ret?.kind === "higher-is-better") {
      expect(ret.resultMarkerRatio).toBeGreaterThan(ret.thresholdMarkerRatio);
    }
    const mdd = gauges.find((g) => g.id === "maxMdd");
    expect(mdd?.kind).toBe("lower-is-better");
    if (mdd?.kind === "lower-is-better") {
      expect(mdd.resultMarkerRatio).toBeLessThan(mdd.limitMarkerRatio);
    }
    const css = read("components/rextora/v3/strategy-search.css");
    expect(css).toContain("ss-completed-qual-bullet__marker--threshold");
  });

  it("J: score is not percentage gauge", () => {
    render(
      <CompletedDashboard
        job={jobFixture()}
        payloadReady
        trials={{ jobId: "x", total: 0, limit: 200, offset: 0, trials: [] }}
        onNewSearch={() => {}}
      />,
    );
    expect(screen.getByTestId("ss-completed-rec-score").textContent).toContain("0.683");
    expect(screen.getByTestId("ss-completed-rec-score").textContent).not.toContain("%");
  });

  it("K: candidate comparison charts", () => {
    render(
      <CompletedDashboard
        job={jobFixture()}
        payloadReady
        trials={{ jobId: "x", total: 0, limit: 200, offset: 0, trials: [] }}
        onNewSearch={() => {}}
      />,
    );
    expect(screen.getByTestId("ss-completed-chart-return")).toBeTruthy();
    expect(screen.getByTestId("ss-completed-chart-mdd")).toBeTruthy();
    expect(screen.getByTestId("ss-completed-chart-trades")).toBeTruthy();
  });

  it("L-N: risk map thresholds and permanent labels", () => {
    const model = buildCompletedDashboardViewModel({
      job: jobFixture(),
      payloadReady: true,
      trials: null,
      summary: null,
    });
    render(<CompletedReturnRiskChart model={model} />);
    expect(screen.getAllByTestId("ss-completed-risk-min-return-line").length).toBeGreaterThan(0);
    expect(screen.getAllByTestId("ss-completed-risk-qual-region").length).toBeGreaterThan(0);
    expect(screen.getAllByTestId("ss-completed-risk-point-label-recommended").length).toBeGreaterThan(0);
  });

  it("O: mobile scatter hidden via narrow hook contract in source", () => {
    const src = read(
      "components/rextora/strategySearch/completed/CompletedReturnRiskChart.tsx",
    );
    expect(src).toContain("!narrow && layout");
  });

  it("P-R: action cascade exclusion and distinct contracts", () => {
    const dash = read(
      "components/rextora/strategySearch/completed/CompletedDashboard.tsx",
    );
    expect(dash).toContain('data-completed-action="secondary"');
    expect(dash).toContain('data-completed-action="tertiary"');
    const readability = read("components/rextora/v3/readability.css");
    expect(readability).toContain(':not([data-completed-action="secondary"])');
    expect(readability).toContain(':not([data-completed-action="tertiary"])');
    const css = read("components/rextora/v3/strategy-search.css");
    expect(css).toMatch(/data-completed-action="secondary"[\s\S]*219 234 254/);
    expect(css).toMatch(/data-completed-action="tertiary"[\s\S]*255 255 255/);
    expect(css).toMatch(/ss-completed-actions__primary[\s\S]*37 99 235/);
  });

  it("S: customer timeframe uses 15분봉 not raw 15m on hero", () => {
    render(
      <CompletedDashboard
        job={jobFixture()}
        payloadReady
        trials={{ jobId: "x", total: 0, limit: 200, offset: 0, trials: [] }}
        onNewSearch={() => {}}
      />,
    );
    const hero = screen.getByTestId("ss-completed-hero-market");
    expect(hero.textContent).toContain("15분봉");
    expect(hero.textContent).not.toContain("15m");
    expect(screen.getByTestId("ss-analysis-timeframe").textContent).toContain("15분봉");
  });

  it("T: no fake equity series", () => {
    render(
      <CompletedDashboard
        job={jobFixture()}
        payloadReady
        trials={{ jobId: "x", total: 0, limit: 200, offset: 0, trials: [] }}
        onNewSearch={() => {}}
      />,
    );
    expect(screen.queryByTestId("ss-completed-return-risk-section")).toBeNull();
    expect(read("components/rextora/strategySearch/completed/CompletedDashboard.tsx")).not.toContain(
      "CompletedReturnRiskChart",
    );
    expect(read("components/rextora/strategySearch/completed/CompletedDashboard.tsx")).not.toContain(
      "equityCurve",
    );
  });
});
