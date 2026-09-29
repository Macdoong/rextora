/** @vitest-environment jsdom */
import fs from "node:fs";
import path from "node:path";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CompletedDashboard } from "../components/rextora/strategySearch/completed/CompletedDashboard";
import { CompletedReturnRiskChart } from "../components/rextora/strategySearch/completed/CompletedReturnRiskChart";
import {
  buildReturnMddScatterLayout,
  mddToPlotX,
  returnToPlotY,
} from "../components/rextora/strategySearch/completed/completedChartScale";
import {
  buildCompletedDashboardViewModel,
  buildCompareCandidatesForGroup,
} from "../components/rextora/strategySearch/completed/completedViewModel";
import { strategyDescriptorWithoutMarket } from "../components/rextora/strategySearch/completed/completedDisplayFormat";
import type { CompletedCandidateCompareRow } from "../components/rextora/strategySearch/completed/completedViewModel";
import type { StrategySearchJobDetail } from "../components/rextora/strategySearch/types";

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
    id: "search_test",
    status: "completed",
    symbols: ["BTCUSDT"],
    timeframe: "15m",
    qualifiedCount: 4,
    statistics: { generated: 4, evaluated: 4, passed: 4, failed: 0, elapsedMs: 1 },
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
          { iteration: 3, paramsHash: "h3", score: 0.64, passed: true },
          { iteration: 4, paramsHash: "h4", score: 0.63, passed: true },
        ],
      },
    ],
    liveTop10: {
      entries: [
        {
          strategyHash: "h1",
          readableName: "BTCUSDT 15m · Vol Breakout · Aggressive",
          displayAlias: "Vol · A1",
          netReturn: 0.3215,
          maxDrawdown: -0.0486,
          tradeCount: 22,
          score: 0.683,
        },
        {
          strategyHash: "h2",
          readableName: "BTCUSDT 15m · Vol Breakout · Aggressive",
          displayAlias: "Vol · A2",
          netReturn: 0.205,
          maxDrawdown: -0.06,
          tradeCount: 18,
          score: 0.65,
        },
        {
          strategyHash: "h3",
          readableName: "BTCUSDT 15m · Vol Breakout · Aggressive",
          displayAlias: "Vol · A3",
          netReturn: 0.2324,
          maxDrawdown: -0.0373,
          tradeCount: 20,
          score: 0.66,
        },
        {
          strategyHash: "h4",
          readableName: "BTCUSDT 15m · Vol Breakout · Aggressive",
          displayAlias: "Vol · A4",
          netReturn: 0.215,
          maxDrawdown: -0.1799,
          tradeCount: 15,
          score: 0.62,
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
      maxIterations: 10,
      parameterRangeKeys: [],
      evaluationWindowIds: ["full"],
    },
    checkpoint: {
      completedIterations: 10,
      nextIteration: 10,
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

describe("Completed dashboard last visual correction", () => {
  afterEach(() => cleanup());

  it("A-C: Y scale maps higher return to smaller plotY", () => {
    const bounds = { plotLeft: 10, plotTop: 8, plotW: 86, plotH: 72 };
    const yHi = returnToPlotY(0.3215, 0.205, 0.3215, bounds);
    const yLo = returnToPlotY(0.205, 0.205, 0.3215, bounds);
    expect(yHi).toBeLessThan(yLo);
    const layout = buildReturnMddScatterLayout([
      row({ id: "a", rank: 1, netReturn: 0.3215, maxDrawdown: -0.0486, isRecommended: true }),
      row({ id: "b", rank: 2, netReturn: 0.205, maxDrawdown: -0.06 }),
    ]);
    const pHi = layout!.points.find((p) => p.id === "a")!;
    const pLo = layout!.points.find((p) => p.id === "b")!;
    expect(pHi.plotY).toBeLessThan(pLo.plotY);
  });

  it("D: lower drawdown magnitude maps left on X", () => {
    const bounds = { plotLeft: 10, plotTop: 8, plotW: 86, plotH: 72 };
    const xLow = mddToPlotX(0.0373, 0.0373, 0.1799, bounds);
    const xHigh = mddToPlotX(0.1799, 0.0373, 0.1799, bounds);
    expect(xLow).toBeLessThan(xHigh);
  });

  it("E-G: tooltip readable and point-local with metrics", () => {
    const model = buildCompletedDashboardViewModel({
      job: jobFixture(),
      payloadReady: true,
      trials: { jobId: "x", total: 0, limit: 200, offset: 0, trials: [] },
    });
    render(<CompletedReturnRiskChart model={model} />);
    fireEvent.mouseEnter(screen.getByTestId("ss-completed-risk-point-recommended"));
    const tip = screen.getByTestId("ss-completed-risk-tooltip");
    expect(tip.className).toContain("float-tooltip--readable");
    expect(tip.textContent).toContain("수익률");
    expect(tip.textContent).toContain("종합 평가");
  });

  it("H: table row hover links active point", () => {
    const model = buildCompletedDashboardViewModel({
      job: jobFixture(),
      payloadReady: true,
      trials: { jobId: "x", total: 0, limit: 200, offset: 0, trials: [] },
    });
    render(<CompletedReturnRiskChart model={model} />);
    fireEvent.mouseEnter(screen.getByTestId("ss-completed-risk-table-row-2"));
    expect(
      screen.getByTestId("ss-completed-risk-table-row-2").className,
    ).toContain("table-row--active");
  });

  it("J: common strategy strips duplicate BTCUSDT 15m", () => {
    const tail = strategyDescriptorWithoutMarket({
      readableName: "BTCUSDT 15m · Vol Breakout · Aggressive",
      symbol: "BTCUSDT",
      timeframe: "15m",
    });
    expect(tail).not.toContain("15m");
    const model = buildCompletedDashboardViewModel({
      job: jobFixture(),
      payloadReady: true,
      trials: { jobId: "x", total: 0, limit: 200, offset: 0, trials: [] },
    });
    expect(model.compareCommonStrategyContext).toContain("BTCUSDT · 15분봉");
    expect(model.compareCommonStrategyContext).not.toMatch(/15m/);
  });

  it("K-L: no trade chip or bar caption in comparison", () => {
    render(
      <CompletedDashboard
        job={jobFixture()}
        payloadReady
        trials={{ jobId: "x", total: 0, limit: 200, offset: 0, trials: [] }}
        onNewSearch={() => {}}
      />,
    );
    const cmp = screen.getByTestId("ss-completed-candidate-matrix");
    expect(cmp.textContent).not.toContain("수익률 비교 막대");
    expect(cmp.querySelector(".ss-completed-return-rank__chip")).toBeNull();
  });

  it("M-N: action hierarchy CSS overrides primary fill on tertiary", () => {
    const css = read("components/rextora/v3/strategy-search.css");
    expect(css).toContain(
      ".ss-completed-actions--hierarchy button.ss-completed-actions__tertiary",
    );
    expect(css).toMatch(
      /ss-completed-actions__tertiary[\s\S]*background:\s*rgb\(255 255 255/,
    );
    expect(css).toMatch(
      /ss-completed-actions__secondary[\s\S]*background:\s*rgb\(219 234 254/,
    );
  });

  it("O: AI ask button uses violet contract", () => {
    const css = read("components/rextora/v3/strategy-search.css");
    expect(css).toMatch(/ss-completed-ask-ai__button[\s\S]*rgb\(67 56 202\)/);
    render(
      <CompletedDashboard
        job={jobFixture()}
        payloadReady
        trials={{ jobId: "x", total: 0, limit: 200, offset: 0, trials: [] }}
        onNewSearch={() => {}}
      />,
    );
    expect(screen.getByTestId("ss-completed-ask-ai-button").textContent).toContain(
      "AI에게",
    );
  });

  it("P: ranking order unchanged", () => {
    const rows = buildCompareCandidatesForGroup({
      job: jobFixture(),
      groupId: "safe_execution_price_v1",
      recommendedParamsHash: "h1",
    });
    expect(rows[0]?.netReturn).toBe(0.3215);
  });
});
