/** @vitest-environment jsdom */
import fs from "node:fs";
import path from "node:path";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CompletedFilterDonutFlow } from "../components/rextora/strategySearch/completed/CompletedFilterDonutFlow";
import { CompletedGroupRankingCta } from "../components/rextora/strategySearch/completed/CompletedGroupRankingCta";
import { CompletedPassRateHelp } from "../components/rextora/strategySearch/completed/CompletedPassRateHelp";
import { CompletedQualificationGauge } from "../components/rextora/strategySearch/completed/CompletedQualificationGauge";
import { buildCompletedDashboardViewModel } from "../components/rextora/strategySearch/completed/completedViewModel";
import { ResearchRankingGroups } from "../components/rextora/strategySearch/ResearchRankingGroups";
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

function threeGroupJob(): StrategySearchJobDetail {
  return {
    id: "search_detail_polish",
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
      {
        rankingCompatibilityGroup: "event_sequence_execution_price_v1",
        rankingEligible: true,
        bestPassedCandidate: null,
        bestCandidate: {
          candidateId: "c2",
          iteration: 2,
          paramsHash: "h2",
          passed: false,
          score: 0.55,
        },
        topCandidates: [
          { iteration: 2, paramsHash: "h2", score: 0.55, passed: false },
        ],
      },
      {
        rankingCompatibilityGroup: "event_sequence_ledger_v0",
        rankingEligible: true,
        bestPassedCandidate: null,
        bestCandidate: null,
        topCandidates: [],
      },
    ],
    liveTop10: { entries: [], finalEntries: [] },
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

describe("Completed dashboard detail polish", () => {
  afterEach(() => cleanup());

  it("A-D: detail summary counts, disclosure labels, aria-expanded", () => {
    const job = threeGroupJob();
    const model = buildCompletedDashboardViewModel({
      job,
      payloadReady: true,
      trials: { jobId: job.id, total: 0, limit: 200, offset: 0, trials: [] },
    });
    render(<CompletedGroupRankingCta model={model} job={job} />);
    const stats = screen.getByTestId("ss-completed-detail-summary-stats");
    expect(within(stats).getByText("3")).toBeTruthy();
    expect(within(stats).getByText("1")).toBeTruthy();
    expect(within(stats).getByText("2")).toBeTruthy();
    const btn = screen.getByTestId("ss-completed-group-ranking-open");
    expect(btn.getAttribute("aria-expanded")).toBe("false");
    expect(btn.textContent).toContain("그룹별 순위 보기");
    fireEvent.click(btn);
    expect(btn.getAttribute("aria-expanded")).toBe("true");
    expect(btn.textContent).toContain("그룹별 순위 접기");
  });

  it("E-H: group recommendation badges, empty state, score vs qualification", () => {
    const job = threeGroupJob();
    render(
      <ResearchRankingGroups
        source={job}
        operatorFacing
        completedDashboardVariant
      />,
    );
    expect(
      screen.getByTestId("research-group-recommend-safe_execution_price_v1")
        .textContent,
    ).toContain("추천 후보 있음");
    expect(
      screen.getByTestId("research-group-recommend-event_sequence_execution_price_v1")
        .textContent,
    ).toContain("추천 후보 없음");
    expect(
      screen.getByTestId("research-group-empty-event_sequence_execution_price_v1")
        .textContent,
    ).toContain("검증 기준을 충족한 추천 후보가 없습니다");
    expect(screen.getByText(/후보 비교 점수 0\.683/)).toBeTruthy();
    expect(screen.getByText("자격 통과")).toBeTruthy();
    expect(screen.queryByText(/0\.683 통과/)).toBeNull();
    expect(screen.queryByTestId("research-no-global-champion")).toBeNull();
  });

  it("I: evaluation principle copy in completed callout", () => {
    const job = threeGroupJob();
    render(
      <ResearchRankingGroups
        source={job}
        operatorFacing
        completedDashboardVariant
      />,
    );
    expect(screen.getByTestId("ss-ranking-champ-rule").textContent).toContain(
      "전략군끼리 점수를 직접 비교하지 않습니다",
    );
  });

  it("J-K: direction helper class above track; CSS animation hooks", () => {
    render(
      <CompletedQualificationGauge
        delayMs={0}
        dataStable
        gauge={{
          kind: "higher-is-better",
          id: "minTotalReturn",
          label: "최소 수익률",
          threshold: 0.1,
          actual: 0.2,
          thresholdPct: "10.00%",
          actualPct: "20.00%",
          deltaLabel: "기준보다 +10.00%p",
          met: true,
          thresholdMarkerRatio: 0.4,
          resultMarkerRatio: 0.7,
        }}
      />,
    );
    expect(screen.getByTestId("ss-completed-qual-direction-higher").textContent).toContain(
      "높을수록 유리 ↑",
    );
    const css = read("components/rextora/v3/strategy-search.css");
    expect(css).toContain(".ss-completed-qual-bullet__direction");
    expect(css).toContain("prefers-reduced-motion");
    expect(
      read("components/rextora/strategySearch/completed/CompletedQualificationGauge.tsx"),
    ).toContain("ss-completed-qual-bullet__marker--animate-threshold");
  });

  it("L-N: pass-rate help button, dynamic counts, quality disclaimer", () => {
    render(
      <CompletedPassRateHelp evaluated={480} passed={4} passRatePct={0.83} />,
    );
    const trigger = screen.getByTestId("ss-completed-pass-rate-help-trigger");
    expect(trigger.tagName).toBe("BUTTON");
    fireEvent.click(trigger);
    const pop = screen.getByTestId("ss-completed-pass-rate-help-popover");
    expect(pop.textContent).toContain("480개 후보 중 4개");
    expect(pop.textContent).toContain("통과율이 낮다고 추천 전략의 품질이 낮다는 뜻은 아닙니다");
  });

  it("M-O: waterfall pass-rate help markup; no p/details nesting", () => {
    const job = threeGroupJob();
    const model = buildCompletedDashboardViewModel({
      job,
      payloadReady: true,
      trials: { jobId: job.id, total: 0, limit: 200, offset: 0, trials: [] },
    });
    const { container } = render(<CompletedFilterDonutFlow model={model} />);
    expect(screen.getByTestId("ss-completed-pass-rate-help-trigger")).toBeTruthy();
    expect(container.querySelectorAll("p details, details p details").length).toBe(0);
    const src = read(
      "components/rextora/strategySearch/completed/CompletedFilterDonutFlow.tsx",
    );
    expect(src).not.toMatch(/<details/);
  });

  it("P-Q: completed group cards stacked; ranking card variant only when operator", () => {
    const css = read("components/rextora/v3/strategy-search.css");
    expect(css).toContain(".ss-completed-ranking-group-grid");
    expect(css).not.toMatch(/ss-completed-ranking-group-grid[\s\S]*grid-template-columns:\s*repeat\(\d+,\s*1fr\)/);
    const cardSrc = read(
      "components/rextora/strategySearch/ResearchRankingGroupCard.tsx",
    );
    expect(cardSrc).toContain("const hasRec = champ != null");
    expect(cardSrc).toContain("completedDashboardVariant === true && operatorFacing");
  });
});
