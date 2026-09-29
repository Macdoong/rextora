/** @vitest-environment jsdom */
import fs from "node:fs";
import path from "node:path";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CompletedDashboard } from "../components/rextora/strategySearch/completed/CompletedDashboard";
import { CompletedFilterDonutFlow } from "../components/rextora/strategySearch/completed/CompletedFilterDonutFlow";
import { CompletedReturnRiskChart } from "../components/rextora/strategySearch/completed/CompletedReturnRiskChart";
import { CompletedCandidateVisualComparison } from "../components/rextora/strategySearch/completed/CompletedCandidateVisualComparison";
import {
  buildQualificationThresholdLines,
  buildReturnMddScatterLayout,
} from "../components/rextora/strategySearch/completed/completedChartScale";
import {
  formatRecommendationCustomerName,
} from "../components/rextora/strategySearch/completed/completedDisplayFormat";
import {
  buildCompletedDashboardViewModel,
  buildCompareCandidatesForGroup,
} from "../components/rextora/strategySearch/completed/completedViewModel";
import type { CompletedCandidateCompareRow } from "../components/rextora/strategySearch/completed/completedViewModel";
import type { StrategySearchJobDetail } from "../components/rextora/strategySearch/types";
import { CompletedRecommendationCard } from "../components/rextora/strategySearch/completed/CompletedRecommendationCard";

const ROOT = process.cwd();
function read(rel: string): string {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

function row(partial: Partial<CompletedCandidateCompareRow>): CompletedCandidateCompareRow {
  return {
    id: partial.id ?? "1",
    label: partial.label ?? "x",
    displayPrimary: partial.displayPrimary ?? partial.label ?? "x",
    displaySecondary: partial.displaySecondary ?? null,
    differentiatorChips: partial.differentiatorChips ?? [],
    netReturn: partial.netReturn ?? 0.2,
    maxDrawdown: partial.maxDrawdown ?? -0.05,
    tradeCount: partial.tradeCount ?? 10,
    score: partial.score ?? 0.5,
    rankingCompatibilityGroup: "g",
    rank: partial.rank ?? 1,
    isRecommended: partial.isRecommended ?? false,
  };
}

function jobFixture(): StrategySearchJobDetail {
  return {
    id: "search_correction",
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
          { iteration: 3, paramsHash: "h3", score: 0.44, passed: true },
          { iteration: 4, paramsHash: "h4", score: 0.43, passed: true },
        ],
      },
    ],
    liveTop10: {
      entries: [
        {
          strategyHash: "h1",
          readableName: "BTCUSDT 15m · Vol Breakout · Aggressive",
          displayAlias: "Vol · A1",
          netReturn: 0.321471,
          maxDrawdown: -0.048562,
          tradeCount: 22,
          winRate: 0.4545,
          score: 0.683465,
        },
        {
          strategyHash: "h2",
          readableName: "BTCUSDT 15m · Vol Breakout · Balanced",
          displayAlias: "Vol · B2",
          netReturn: 0.205,
          maxDrawdown: -0.0373,
          tradeCount: 12,
          winRate: 0.4,
          score: 0.475,
        },
        {
          strategyHash: "h3",
          readableName: "BTCUSDT 15m · Mean Rev",
          displayAlias: "MR · C3",
          netReturn: 0.21,
          maxDrawdown: -0.1799,
          tradeCount: 18,
          winRate: 0.42,
          score: 0.44,
        },
        {
          strategyHash: "h4",
          readableName: "BTCUSDT 15m · Trend",
          displayAlias: "Tr · D4",
          netReturn: 0.1971,
          maxDrawdown: -0.12,
          tradeCount: 15,
          winRate: 0.38,
          score: 0.43,
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

vi.mock("../components/rextora/strategySearch/completed/useCompletedMotion", () => ({
  useCompletedMotion: () => false,
}));

vi.mock("../components/rextora/strategySearch/completed/usePresentationEnter", () => ({
  usePresentationEnter: () => true,
}));

describe("Completed dashboard final correction", () => {
  afterEach(() => cleanup());

  it("A: no p wraps details/summary in CompletedFilterDonutFlow", () => {
    const model = buildCompletedDashboardViewModel({
      job: jobFixture(),
      payloadReady: true,
      trials: { jobId: "x", total: 0, limit: 200, offset: 0, trials: [] },
    });
    const { container } = render(<CompletedFilterDonutFlow model={model} />);
    expect(container.querySelectorAll("p details, p summary").length).toBe(0);
    const src = read(
      "components/rextora/strategySearch/completed/CompletedFilterDonutFlow.tsx",
    );
    expect(src).not.toMatch(/<p[^>]*>[\s\S]*?<details/);
  });

  it("B-C: headline shows passed/evaluated; pass rate secondary", () => {
    const model = buildCompletedDashboardViewModel({
      job: jobFixture(),
      payloadReady: true,
      trials: { jobId: "x", total: 0, limit: 200, offset: 0, trials: [] },
    });
    render(<CompletedFilterDonutFlow model={model} />);
    expect(screen.getByTestId("ss-completed-verification-headline").textContent).toContain(
      "4개 통과 / 480개 평가",
    );
    expect(screen.getByText(/통과율/)).toBeTruthy();
  });

  it("D-E: branch flow uses real funnel counts", () => {
    const model = buildCompletedDashboardViewModel({
      job: jobFixture(),
      payloadReady: true,
      trials: { jobId: "x", total: 0, limit: 200, offset: 0, trials: [] },
    });
    render(<CompletedFilterDonutFlow model={model} />);
    expect(screen.getByTestId("ss-verification-flow-generated").textContent).toContain("480");
    expect(screen.getByTestId("ss-verification-flow-evaluated").textContent).toContain("480");
    expect(screen.getByTestId("ss-verification-flow-rejected").textContent).toContain("476");
    expect(screen.getByTestId("ss-verification-flow-passed").textContent).toContain("4");
    expect(screen.getByTestId("ss-verification-flow-qualified").textContent).toContain("4");
  });

  it("F-H: X domain includes maxMdd threshold; threshold line in plot", () => {
    const candidates = buildCompareCandidatesForGroup({
      job: jobFixture(),
      groupId: "safe_execution_price_v1",
      recommendedParamsHash: "h1",
    });
    const layout = buildReturnMddScatterLayout(candidates, {
      maxMdd: -0.25,
      minTotalReturn: 0.1968,
    })!;
    expect(layout.axes.xMax).toBeGreaterThanOrEqual(0.25);
    const lines = buildQualificationThresholdLines(
      layout.axes,
      layout.bounds,
      { maxMdd: -0.25, minTotalReturn: 0.1968 },
    );
    expect(lines.maxMddX).not.toBeNull();
    expect(lines.maxMddX!).toBeLessThanOrEqual(
      layout.bounds.plotLeft + layout.bounds.plotW + 0.01,
    );
    expect(lines.maxMddX!).toBeGreaterThanOrEqual(layout.bounds.plotLeft);
  });

  it("G: Y domain includes minTotalReturn threshold", () => {
    const candidates = buildCompareCandidatesForGroup({
      job: jobFixture(),
      groupId: "safe_execution_price_v1",
      recommendedParamsHash: "h1",
    });
    const layout = buildReturnMddScatterLayout(candidates, {
      minTotalReturn: 0.1968,
      maxMdd: -0.25,
    })!;
    expect(layout.axes.yMin).toBeLessThanOrEqual(0.1968);
  });

  it("I: qualification region shown when thresholds in plot", () => {
    const model = buildCompletedDashboardViewModel({
      job: jobFixture(),
      payloadReady: true,
      trials: { jobId: "x", total: 0, limit: 200, offset: 0, trials: [] },
    });
    render(<CompletedReturnRiskChart model={model} />);
    expect(screen.getByTestId("ss-completed-risk-qual-region")).toBeTruthy();
  });

  it("J: recommended marker and label render separately", () => {
    const model = buildCompletedDashboardViewModel({
      job: jobFixture(),
      payloadReady: true,
      trials: { jobId: "x", total: 0, limit: 200, offset: 0, trials: [] },
    });
    render(<CompletedReturnRiskChart model={model} />);
    expect(screen.getByTestId("ss-completed-risk-point-recommended")).toBeTruthy();
    expect(screen.getByTestId("ss-completed-risk-point-label-recommended")).toBeTruthy();
  });

  it("K-L: horizontal Y hint; no vertical axis title in DOM", () => {
    const model = buildCompletedDashboardViewModel({
      job: jobFixture(),
      payloadReady: true,
      trials: { jobId: "x", total: 0, limit: 200, offset: 0, trials: [] },
    });
    const { container } = render(<CompletedReturnRiskChart model={model} />);
    expect(screen.getByTestId("ss-completed-risk-axis-y-hint").textContent).toBe("↑ 수익률");
    expect(screen.getByTestId("ss-completed-risk-axis-x-hint").textContent).toBe("최대 낙폭 →");
    expect(container.querySelector(".ss-completed-risk-chart__axis-title-y")).toBeNull();
  });

  it("M-N: mobile matrix labels; single 추천 in title", () => {
    const job = jobFixture();
    const sharedName = "BTCUSDT 15m · Vol Breakout · Aggressive";
    job.liveTop10!.entries = job.liveTop10!.entries.map((e, i) => ({
      ...e,
      readableName: sharedName,
      displayAlias: `Vol · A${i + 1}`,
    }));
    const model = buildCompletedDashboardViewModel({
      job,
      payloadReady: true,
      trials: { jobId: "x", total: 0, limit: 200, offset: 0, trials: [] },
    });
    render(<CompletedCandidateVisualComparison model={model} />);
    const recRow = screen.getByTestId("ss-completed-matrix-row-1");
    expect(within(recRow).getByText("수익률")).toBeTruthy();
    expect(within(recRow).getByText("최대 낙폭")).toBeTruthy();
    const title = recRow.querySelector("strong")!.textContent ?? "";
    expect(title).toContain("후보 1 · 추천");
    expect(title.match(/추천/g)?.length ?? 0).toBe(1);
  });

  it("O: recommendation descriptor uses 15분봉 not 15m", () => {
    const formatted = formatRecommendationCustomerName({
      readableName: "BTCUSDT 15m · Vol Breakout · Aggressive",
      symbol: "BTCUSDT",
      timeframe: "15m",
    });
    expect(formatted).toContain("15분봉");
    expect(formatted).not.toMatch(/\b15m\b/);

    const model = buildCompletedDashboardViewModel({
      job: jobFixture(),
      payloadReady: true,
      trials: { jobId: "x", total: 0, limit: 200, offset: 0, trials: [] },
    });
    render(<CompletedRecommendationCard model={model} />);
    const name = screen.getByTestId("ss-completed-recommendation-name").textContent ?? "";
    expect(name).toContain("15분봉");
    expect(name).not.toMatch(/\b15m\b/);
  });

  it("P: hover tooltip and table row linking", () => {
    const model = buildCompletedDashboardViewModel({
      job: jobFixture(),
      payloadReady: true,
      trials: { jobId: "x", total: 0, limit: 200, offset: 0, trials: [] },
    });
    render(<CompletedReturnRiskChart model={model} />);
    fireEvent.mouseEnter(screen.getByTestId("ss-completed-risk-point-recommended"));
    expect(screen.getByTestId("ss-completed-risk-tooltip")).toBeTruthy();
    fireEvent.mouseLeave(screen.getByTestId("ss-completed-risk-point-recommended"));
    fireEvent.mouseEnter(screen.getByTestId("ss-completed-risk-table-row-2"));
    expect(
      screen.getByTestId("ss-completed-risk-table-row-2").className,
    ).toContain("table-row--active");
  });

  it("Q: completed dashboard has no risk-map scatter or mobile fallback", () => {
    render(
      <CompletedDashboard
        job={jobFixture()}
        payloadReady
        trials={{ jobId: "x", total: 0, limit: 200, offset: 0, trials: [] }}
        onNewSearch={() => {}}
      />,
    );
    expect(screen.queryByTestId("ss-completed-return-mdd-scatter")).toBeNull();
    expect(screen.queryByTestId("ss-completed-return-mdd-cards")).toBeNull();
    expect(screen.queryByTestId("ss-completed-return-risk-section")).toBeNull();
  });

  it("R: chart layout uses real candidate rows only", () => {
    const candidates = buildCompareCandidatesForGroup({
      job: jobFixture(),
      groupId: "safe_execution_price_v1",
      recommendedParamsHash: "h1",
    });
    const layout = buildReturnMddScatterLayout(candidates, {
      maxMdd: -0.25,
      minTotalReturn: 0.1968,
    });
    expect(layout!.points.length).toBe(candidates.filter((c) => c.netReturn != null && c.maxDrawdown != null).length);
  });
});
