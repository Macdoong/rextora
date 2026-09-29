/** @vitest-environment jsdom */
import fs from "node:fs";
import path from "node:path";
import { cleanup, render, screen, fireEvent, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CompletedDashboard } from "../components/rextora/strategySearch/completed/CompletedDashboard";
import { CompletedReturnRiskChart } from "../components/rextora/strategySearch/completed/CompletedReturnRiskChart";
import {
  buildCompletedDashboardViewModel,
  resolveCompletedRecommendation,
} from "../components/rextora/strategySearch/completed/completedViewModel";
import {
  isCompletedResultPayloadReady,
  resolveCompletedQualifiedCount,
  shouldShowCompletedResultLoading,
} from "../components/rextora/strategySearch/completed/completedLoadingGate";
import { buildCompletedAnalysisContextApi } from "../src/lib/rextora/strategySearch/completedAnalysisContext";
import type { StrategySearchJobDetail } from "../components/rextora/strategySearch/types";

const ROOT = process.cwd();
function read(rel: string): string {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

function jobWithContext(
  overrides: Partial<StrategySearchJobDetail> = {},
): StrategySearchJobDetail {
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
          paramsHash: "hash_pass",
          passed: true,
          score: 0.683465,
        },
        bestCandidate: null,
        topCandidates: [
          { iteration: 1, paramsHash: "hash_pass", score: 0.683465, passed: true },
        ],
      },
    ],
    liveTop10: {
      entries: [
        {
          strategyHash: "hash_pass",
          readableName: "Readable Strategy",
          displayAlias: "Readable · A1",
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
    },
    checkpoint: {
      completedIterations: 100,
      nextIteration: 100,
      bestCandidate: null,
      bestPassedCandidate: null,
      updatedAt: "",
      hasRunnerPayload: false,
    },
    ...overrides,
  } as StrategySearchJobDetail;
}

vi.mock("../components/rextora/strategySearch/apiClient", () => ({
  fetchResearchResultsSummary: vi.fn().mockResolvedValue(null),
}));

vi.mock("../components/rextora/strategySearch/completed/useCompletedMotion", () => ({
  useCompletedMotion: () => false,
}));

describe("Completed dashboard deep fix", () => {
  afterEach(() => cleanup());

  it("loading gate: trials null does not imply qualifiedCount 0", () => {
    const job = jobWithContext();
    expect(
      resolveCompletedQualifiedCount({
        job,
        trials: null,
        payloadReady: false,
      }),
    ).toBeNull();
    expect(
      resolveCompletedQualifiedCount({
        job,
        trials: null,
        payloadReady: true,
      }),
    ).toBe(4);
  });

  it("loading gate: shows result loading while completed detail/trials pending", () => {
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
    expect(
      isCompletedResultPayloadReady({
        jobMissing: false,
        detail: jobWithContext(),
        detailFetchState: "ready",
        trials: { jobId: "x", total: 0, limit: 200, offset: 0, trials: [] },
      }),
    ).toBe(true);
  });

  it("workbench uses completed result loading surface", () => {
    const wb = read("components/rextora/strategySearch/StrategySearchWorkbench.tsx");
    expect(wb).toContain("CompletedResultLoading");
    expect(wb).toContain("showCompletedResultLoading");
    expect(wb).toContain("completedPayloadReady");
  });

  it("analysis context shows canonical date range", () => {
    render(
      <CompletedDashboard
        job={jobWithContext()}
        payloadReady
        trials={{ jobId: "x", total: 0, limit: 200, offset: 0, trials: [] }}
        onNewSearch={() => {}}
      />,
    );
    expect(screen.getByTestId("ss-analysis-date-range").textContent).toContain(
      "2026.05.27",
    );
    expect(screen.getByTestId("ss-analysis-date-range").textContent).toContain(
      "2026.09.24",
    );
  });

  it("pass summary prioritizes count flow", () => {
    render(
      <CompletedDashboard
        job={jobWithContext()}
        payloadReady
        trials={{ jobId: "x", total: 0, limit: 200, offset: 0, trials: [] }}
        onNewSearch={() => {}}
      />,
    );
    expect(screen.getByTestId("ss-verification-flow-evaluated").textContent).toContain(
      "480",
    );
    expect(screen.getByTestId("ss-verification-flow-qualified").textContent).toContain(
      "4",
    );
  });

  it("score labeled 후보 비교 점수 and not pass reason when minScore null", () => {
    render(
      <CompletedDashboard
        job={jobWithContext()}
        payloadReady
        trials={{ jobId: "x", total: 0, limit: 200, offset: 0, trials: [] }}
        onNewSearch={() => {}}
      />,
    );
    expect(
      screen.getByTestId("ss-completed-recommendation-visuals").textContent,
    ).toContain("후보 비교 점수");
    expect(screen.getByTestId("ss-completed-rec-score").textContent).toContain(
      "0.683",
    );
    expect(screen.queryByText(/0\.683 통과/)).toBeNull();
    fireEvent.click(
      within(screen.getByTestId("ss-completed-rec-score-label-row")).getByTestId(
        "ss-completed-score-help-trigger",
      ),
    );
    expect(screen.getByTestId("ss-completed-score-help-min-null").textContent).toContain(
      "자격 통과 기준으로 사용되지 않았습니다",
    );
  });

  it("qualification breakdown uses threshold pairs", () => {
    render(
      <CompletedDashboard
        job={jobWithContext()}
        payloadReady
        trials={{ jobId: "x", total: 0, limit: 200, offset: 0, trials: [] }}
        onNewSearch={() => {}}
      />,
    );
    expect(screen.getByTestId("ss-completed-qual-gauge-minTotalReturn")).toBeTruthy();
    expect(screen.getByTestId("ss-completed-qual-gauge-jitter")).toBeTruthy();
    expect(screen.queryByTestId("ss-completed-qual-gauge-minWinRate")).toBeNull();
  });

  it("MDD display uses magnitude on recommendation", () => {
    render(
      <CompletedDashboard
        job={jobWithContext()}
        payloadReady
        trials={{ jobId: "x", total: 0, limit: 200, offset: 0, trials: [] }}
        onNewSearch={() => {}}
      />,
    );
    const mdd = screen.getByTestId("ss-completed-rec-mdd").textContent ?? "";
    expect(mdd).toContain("4.86%");
    expect(mdd).not.toContain("-");
  });

  it("no raw strategyFamily on recommendation card", () => {
    const model = buildCompletedDashboardViewModel({
      job: jobWithContext(),
      payloadReady: true,
      trials: { jobId: "x", total: 0, limit: 200, offset: 0, trials: [] },
    });
    expect(model.recommendation?.strategyFamily).toBeNull();
  });

  it("return comparison title is 종합 비교 not return ranking", () => {
    render(
      <CompletedDashboard
        job={jobWithContext()}
        payloadReady
        trials={{ jobId: "x", total: 0, limit: 200, offset: 0, trials: [] }}
        onNewSearch={() => {}}
      />,
    );
    expect(screen.getByText("후보 지표 비교")).toBeTruthy();
  });

  it("scatter hover shows tooltip with metrics", () => {
    const model = buildCompletedDashboardViewModel({
      job: jobWithContext(),
      payloadReady: true,
      trials: { jobId: "x", total: 0, limit: 200, offset: 0, trials: [] },
    });
    render(<CompletedReturnRiskChart model={model} />);
    const pt = screen.getByTestId("ss-completed-risk-point-recommended");
    fireEvent.mouseEnter(pt);
    expect(screen.getByTestId("ss-completed-risk-tooltip")).toBeTruthy();
  });

  it("register section copy states library storage not live", () => {
    render(
      <CompletedDashboard
        job={jobWithContext()}
        payloadReady
        trials={{ jobId: "x", total: 0, limit: 200, offset: 0, trials: [] }}
        onNewSearch={() => {}}
        onPromoteTop={() => {}}
      />,
    );
    expect(screen.getByTestId("ss-completed-register-section").textContent).toContain(
      "모의매매나 실전매매가 시작되지",
    );
    expect(screen.getByTestId("ss-completed-register-top")).toBeTruthy();
  });

  it("group ranking CTA is discoverable", () => {
    render(
      <CompletedDashboard
        job={jobWithContext()}
        payloadReady
        trials={{ jobId: "x", total: 0, limit: 200, offset: 0, trials: [] }}
        onNewSearch={() => {}}
      />,
    );
    expect(screen.getByTestId("ss-completed-group-ranking-cta")).toBeTruthy();
    expect(screen.getByTestId("ss-completed-group-ranking-open")).toBeTruthy();
  });

  it("real job analysis context from persisted job file", () => {
    const job = JSON.parse(
      fs.readFileSync(
        path.join(
          ROOT,
          "data/rextora/strategy-search/jobs/search_c4b1f702-5814-4147-94a9-80d88f1d8429.json",
        ),
        "utf8",
      ),
    );
    const plan = JSON.parse(
      fs.readFileSync(
        path.join(
          ROOT,
          "data/rextora/strategy-search/jobs/search_c4b1f702-5814-4147-94a9-80d88f1d8429.plan.json",
        ),
        "utf8",
      ),
    );
    const ctx = buildCompletedAnalysisContextApi(job, plan, {
      rootDir: path.join(ROOT, "data/rextora/strategy-search"),
    });
    expect(ctx?.evaluationStartUtc).toBe("2026-05-27T00:00:00.000Z");
    expect(ctx?.passThresholds.minTotalReturn).toBe(0.1968);
  });

  it("mobile CSS hides scatter at 767px", () => {
    const css = read("components/rextora/v3/strategy-search.css");
    expect(css).toMatch(/@media \(max-width: 767px\)[\s\S]*ss-completed-risk-chart__desktop/);
  });

  it("action hierarchy classes present", () => {
    const css = read("components/rextora/v3/strategy-search.css");
    const dash = read("components/rextora/strategySearch/completed/CompletedDashboard.tsx");
    expect(css).toContain("ss-completed-actions--hierarchy");
    expect(dash).toContain("ss-completed-actions__primary");
    expect(dash).toContain("ss-completed-actions__secondary");
  });
});
