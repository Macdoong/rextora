/** @vitest-environment jsdom */
import fs from "node:fs";
import path from "node:path";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CompletedDashboard } from "../components/rextora/strategySearch/completed/CompletedDashboard";
import { CompletedFilterDonutFlow } from "../components/rextora/strategySearch/completed/CompletedFilterDonutFlow";
import { CompletedScoreHelp } from "../components/rextora/strategySearch/completed/CompletedScoreHelp";
import { ResearchRankingGroups } from "../components/rextora/strategySearch/ResearchRankingGroups";
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

function baseJob(minScore: number | null): StrategySearchJobDetail {
  return {
    id: "search_score_polish",
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
        minScore,
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
        ],
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

describe("Completed score help final polish", () => {
  afterEach(() => cleanup());

  it("visible ? trigger beside score label on recommendation tile", () => {
    render(
      <CompletedDashboard
        job={baseJob(null)}
        payloadReady
        trials={{ jobId: "x", total: 0, limit: 200, offset: 0, trials: [] }}
        onNewSearch={() => {}}
      />,
    );
    const row = screen.getByTestId("ss-completed-rec-score-label-row");
    expect(row.textContent).toContain("후보 비교 점수");
    const trigger = within(row).getByTestId("ss-completed-score-help-trigger");
    expect(trigger.tagName).toBe("BUTTON");
    expect(trigger.className).toContain("ss-completed-score-help__btn");
    expect(trigger.textContent).toContain("?");
    const css = read("components/rextora/v3/strategy-search.css");
    expect(css).toMatch(
      /ss-completed-rec-visual__tile--score[\s\S]*ss-completed-score-help__btn[\s\S]*border-radius:\s*50%/,
    );
    expect(css).not.toMatch(/ss-completed-rec-score-label-row[\s\S]*display:\s*none/);
    fireEvent.click(trigger);
    expect(screen.getByTestId("ss-completed-score-help-popover")).toBeTruthy();
  });

  it("A-B: primary UI uses 후보 비교 점수; no old disclosure summary", () => {
    render(
      <CompletedDashboard
        job={baseJob(null)}
        payloadReady
        trials={{ jobId: "x", total: 0, limit: 200, offset: 0, trials: [] }}
        onNewSearch={() => {}}
      />,
    );
    expect(
      screen.getByTestId("ss-completed-recommendation-visuals").textContent,
    ).toContain("후보 비교 점수");
    expect(screen.queryByText("종합 평가 점수 안내")).toBeNull();
    expect(screen.queryByText("종합 평가")).toBeNull();
    expect(read("components/rextora/strategySearch/completed/CompletedScoreHelp.tsx")).not.toContain(
      "<summary>",
    );
  });

  it("C-D: no fake normalization; score separate from pass", () => {
    render(
      <CompletedDashboard
        job={baseJob(null)}
        payloadReady
        trials={{ jobId: "x", total: 0, limit: 200, offset: 0, trials: [] }}
        onNewSearch={() => {}}
      />,
    );
    const score = screen.getByTestId("ss-completed-rec-score").textContent ?? "";
    expect(score).toContain("0.683");
    expect(score).not.toMatch(/68\.3%/);
    expect(score).not.toMatch(/\/\s*1\.0/);
    expect(screen.queryByText(/0\.683 통과/)).toBeNull();
  });

  it("E: minScore null help copy", () => {
    render(<CompletedScoreHelp minScoreEnabled={false} />);
    fireEvent.click(screen.getByTestId("ss-completed-score-help-trigger"));
    expect(screen.getByTestId("ss-completed-score-help-min-null").textContent).toContain(
      "자격 통과 기준으로 사용되지 않았습니다",
    );
  });

  it("F: configured minScore alternate copy", () => {
    render(<CompletedScoreHelp minScoreEnabled={true} />);
    fireEvent.click(screen.getByTestId("ss-completed-score-help-trigger"));
    expect(
      screen.getByTestId("ss-completed-score-help-min-configured").textContent,
    ).toContain("자격 통과 기준에 포함");
    expect(screen.queryByTestId("ss-completed-score-help-min-null")).toBeNull();
  });

  it("G: expanded group ranking uses 후보 비교 점수", () => {
    render(
      <ResearchRankingGroups
        source={baseJob(null)}
        operatorFacing
        completedDashboardVariant
      />,
    );
    expect(screen.getByText(/후보 비교 점수 0\.683/)).toBeTruthy();
    expect(screen.getByText("자격 통과")).toBeTruthy();
  });

  it("H-I: pass-rate dynamic copy and quality disclaimer", () => {
    const model = buildCompletedDashboardViewModel({
      job: baseJob(null),
      payloadReady: true,
      trials: { jobId: "x", total: 0, limit: 200, offset: 0, trials: [] },
    });
    render(<CompletedFilterDonutFlow model={model} />);
    fireEvent.click(screen.getByTestId("ss-completed-pass-rate-help-trigger"));
    const pop = screen.getByTestId("ss-completed-pass-rate-help-popover");
    expect(within(pop).getByTestId("ss-completed-pass-rate-help-dynamic").textContent).toContain(
      "480개 후보 중 4개",
    );
    expect(pop.textContent).toContain("통과율이 낮다고 추천 전략의 품질이 낮다는 뜻은 아닙니다");
  });

  it("J-K: compact circular help button and bounded popover width in CSS", () => {
    const css = read("components/rextora/v3/strategy-search.css");
    expect(css).toMatch(/ss-completed-pass-rate-help__btn[\s\S]*border-radius:\s*50%/);
    expect(css).toMatch(/width:\s*30px[\s\S]*height:\s*30px/);
    expect(css).toContain("min(320px, calc(100vw - 24px))");
    expect(css).toContain("max-width: min(340px");
  });

  it("L: no invalid p/details nesting in waterfall", () => {
    const model = buildCompletedDashboardViewModel({
      job: baseJob(null),
      payloadReady: true,
      trials: { jobId: "x", total: 0, limit: 200, offset: 0, trials: [] },
    });
    const { container } = render(<CompletedFilterDonutFlow model={model} />);
    expect(container.querySelectorAll("p details, p summary, details summary p details").length).toBe(
      0,
    );
  });
});
