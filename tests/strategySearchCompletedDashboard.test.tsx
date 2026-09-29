/** @vitest-environment jsdom */
import fs from "node:fs";
import path from "node:path";
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CompletedDashboard } from "../components/rextora/strategySearch/completed/CompletedDashboard";
import { CompletedHero } from "../components/rextora/strategySearch/completed/CompletedHero";
import { CompletedReturnRiskChart } from "../components/rextora/strategySearch/completed/CompletedReturnRiskChart";
import { CompletedCandidateReturnComparison } from "../components/rextora/strategySearch/completed/CompletedCandidateReturnComparison";
import {
  buildCompletedDashboardViewModel,
  buildCompareCandidatesForGroup,
  resolveCompletedRecommendation,
} from "../components/rextora/strategySearch/completed/completedViewModel";
import type { StrategySearchJobDetail } from "../components/rextora/strategySearch/types";

vi.mock("../components/rextora/strategySearch/completed/useCompletedMotion", () => ({
  useCompletedMotion: () => false,
}));

const ROOT = process.cwd();

function read(rel: string): string {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

function emptyTrials(jobId: string) {
  return { jobId, total: 0, limit: 200, offset: 0, trials: [] };
}

function vm(job: StrategySearchJobDetail) {
  return buildCompletedDashboardViewModel({
    job,
    payloadReady: true,
    trials: emptyTrials(job.id),
  });
}

function renderDashboard(
  job: StrategySearchJobDetail = baseJob(),
  extra?: { onNewSearch?: () => void; onRetryWithSettings?: () => void },
) {
  return render(
    <CompletedDashboard
      job={job}
      payloadReady
      trials={emptyTrials(job.id)}
      onNewSearch={extra?.onNewSearch ?? (() => {})}
      onRetryWithSettings={extra?.onRetryWithSettings}
    />,
  );
}

function baseJob(
  overrides: Partial<StrategySearchJobDetail> = {},
): StrategySearchJobDetail {
  return {
    id: "search_test_completed",
    status: "completed",
    symbols: ["BTCUSDT"],
    timeframe: "15m",
    completionReason: "QUALIFIED_TARGET_REACHED",
    elapsedMs: 120_000,
    qualifiedCount: 1,
    gatePassedCount: 5,
    evaluatedCount: 30,
    rejectedCount: 25,
    statistics: {
      generated: 40,
      evaluated: 30,
      passed: 5,
      failed: 25,
      elapsedMs: 120_000,
    },
    gatePassedCount: 5,
    rejectedCount: 25,
    evaluatedCount: 30,
    rankingGroups: [
      {
        rankingCompatibilityGroup: "safe_execution_price_v1",
        bestPassedCandidate: {
          candidateId: "c_pass",
          iteration: 3,
          paramsHash: "hash_pass",
          passed: true,
          score: 0.82,
        },
        bestCandidate: {
          candidateId: "c_fail_top",
          iteration: 1,
          paramsHash: "hash_fail",
          passed: false,
          score: 0.99,
        },
        topCandidates: [
          {
            iteration: 3,
            paramsHash: "hash_pass",
            score: 0.82,
            passed: true,
          },
          {
            iteration: 1,
            paramsHash: "hash_fail",
            score: 0.99,
            passed: false,
          },
        ],
      },
    ],
    liveTop10: {
      entries: [
        {
          strategyHash: "hash_pass",
          displayAlias: "hash_pass",
          readableName: "EMA Cross Pass",
          strategyFamily: "ema_cross",
          netReturn: 0.12,
          maxDrawdown: -0.08,
          tradeCount: 42,
          winRate: 0.55,
          score: 0.82,
        },
        {
          strategyHash: "hash_fail",
          displayAlias: "hash_fail",
          readableName: "Failed High Score",
          strategyFamily: "ema_cross",
          netReturn: 0.2,
          maxDrawdown: -0.15,
          tradeCount: 10,
          winRate: 0.4,
          score: 0.99,
        },
      ],
      finalEntries: [],
    },
    ...overrides,
  } as StrategySearchJobDetail;
}

vi.mock("../components/rextora/strategySearch/apiClient", () => ({
  fetchResearchResultsSummary: vi.fn().mockResolvedValue(null),
}));

describe("Strategy Search completed dashboard", () => {
  afterEach(() => cleanup());

  it("A–B: workbench hides legacy stack when primary completed dashboard is shown", () => {
    const workbench = read("components/rextora/strategySearch/StrategySearchWorkbench.tsx");
    expect(workbench).toContain(
      "hideLegacyWorkbenchSurfaces ? null : showGuidedCompactSecondary",
    );
    expect(workbench).not.toContain("완료된 탐색이 있습니다. 아래 결과에서");
  });

  it("C: QUALIFIED_TARGET_REACHED with qualified uses success hero", () => {
    const model = vm(baseJob());
    expect(model.heroTone).toBe("success");
    expect(model.heroMessage).toContain("목표 조건");
  });

  it("hero title has no duplicate literal checkmark; integrated visual check remains", () => {
    const model = vm(baseJob());
    expect(model.heroTitle).toBe("전략 탐색 완료");
    expect(model.heroTitle).not.toContain("✓");
    render(<CompletedHero model={model} />);
    expect(screen.getByTestId("ss-completed-hero-check").textContent).toBe("✓");
    expect(screen.getByRole("heading", { level: 2 }).textContent).toBe(
      "전략 탐색 완료",
    );
    expect(document.querySelector(".ss-completed-hero__mark")).toBeNull();
  });

  it("D: DEADLINE_REACHED uses neutral completion copy", () => {
    const model = vm(
      baseJob({ completionReason: "DEADLINE_REACHED", qualifiedCount: 2 }),
    );
    expect(model.heroTone).toBe("neutral");
    expect(model.heroMessage).toContain("탐색 한도");
  });

  it("E: zero qualified does not use success tone", () => {
    const model = vm(
      baseJob({ completionReason: "DEADLINE_REACHED", qualifiedCount: 0 }),
    );
    expect(model.heroTone).toBe("no-qualified");
    expect(model.heroMessage).toContain("충족한 후보는 없습니다");
  });

  it("F–G: recommendation joins top10; failed bestCandidate is not recommendation", () => {
    const job = baseJob();
    const resolved = resolveCompletedRecommendation(job);
    expect(resolved?.ref.paramsHash).toBe("hash_pass");
    const rec = vm(job).recommendation;
    expect(rec?.readableName).toBe("EMA Cross Pass");
    expect(rec?.netReturn).toBe(0.12);
    expect(rec?.score).toBe(0.82);
    expect(rec?.paramsHash).not.toBe("hash_fail");
  });

  it("H: no recommendation when no passed candidate", () => {
    const job = baseJob({
      rankingGroups: [
        {
          rankingCompatibilityGroup: "safe_execution_price_v1",
          bestPassedCandidate: null,
          bestCandidate: {
            candidateId: "c_fail",
            iteration: 1,
            paramsHash: "hash_fail",
            passed: false,
            score: 1,
          },
          topCandidates: [],
        },
      ],
    });
    const model = vm({ ...job, qualifiedCount: 0 });
    expect(model.recommendation).toBeNull();
    render(<CompletedReturnRiskChart model={model} />);
    expect(screen.queryByTestId("ss-completed-risk-point-recommended")).toBeNull();
    expect(screen.getByTestId("ss-completed-no-equity-chart")).toBeTruthy();
  });

  it("I: funnel uses canonical statistics", () => {
    const model = vm(baseJob());
    expect(model.funnel).toEqual({
      generated: 40,
      evaluated: 30,
      passed: 5,
      qualified: 1,
    });
  });

  it("J: return/MDD comparison uses top10 within one group", () => {
    const job = baseJob();
    const model = vm(job);
    expect(model.compareCandidates.every(
      (c) => c.rankingCompatibilityGroup === "safe_execution_price_v1",
    )).toBe(true);
    expect(model.compareCandidates.some((c) => c.netReturn === 0.12)).toBe(true);
    renderDashboard(job);
    expect(screen.queryByTestId("ss-completed-return-risk-section")).toBeNull();
    expect(screen.getByTestId("ss-completed-candidate-matrix")).toBeTruthy();
    expect(screen.getByTestId("ss-completed-chart-return")).toBeTruthy();
  });

  it("K: no equity or timestamp chart components in completed surface", () => {
    const dashboardSrc = read("components/rextora/strategySearch/completed/CompletedDashboard.tsx");
    expect(dashboardSrc).not.toContain("CandidateMetricSparkline");
    expect(dashboardSrc).not.toContain("ss-equity");
    const riskSrc = read(
      "components/rextora/strategySearch/completed/CompletedReturnRiskChart.tsx",
    );
    expect(riskSrc).not.toContain("CandidateMetricSparkline");
    expect(riskSrc).toContain("ss-completed-no-equity-chart");
  });

  it("L: compare builders stay scoped per ranking group", () => {
    const job = baseJob({
      rankingGroups: [
        ...(baseJob().rankingGroups ?? []),
        {
          rankingCompatibilityGroup: "pattern_combo_v2",
          bestPassedCandidate: null,
          bestCandidate: null,
          topCandidates: [
            { iteration: 9, paramsHash: "other_hash", score: 0.5, passed: false },
          ],
        },
      ],
    });
    const g1 = buildCompareCandidatesForGroup({
      job,
      groupId: "safe_execution_price_v1",
    });
    const g2 = buildCompareCandidatesForGroup({
      job,
      groupId: "pattern_combo_v2",
    });
    expect(g1.every((r) => r.rankingCompatibilityGroup === "safe_execution_price_v1")).toBe(
      true,
    );
    expect(g2.every((r) => r.rankingCompatibilityGroup === "pattern_combo_v2")).toBe(true);
    const vmSrc = read(
      "components/rextora/strategySearch/completed/completedViewModel.ts",
    );
    expect(vmSrc).not.toContain("globalScore");
  });

  it("M–N: dashboard exposes retry and new search actions", () => {
    const dash = read("components/rextora/strategySearch/completed/CompletedDashboard.tsx");
    expect(dash).toContain("ss-completed-retry-settings");
    expect(dash).toContain("ss-completion-new-research");
    const workbench = read("components/rextora/strategySearch/StrategySearchWorkbench.tsx");
    expect(workbench).toContain("beginFreshSearch");
    expect(workbench).toContain("createDefaultOperatorFormState");
    expect(workbench).toContain("retrySearchWithCurrentSettings");
  });

  it("O: reduced motion disables completion dashboard animation paths", () => {
    const css = read("components/rextora/v3/strategy-search.css");
    expect(css).toContain("prefers-reduced-motion: reduce");
    expect(css).toContain("ss-completed-return-rank__fill--animate");
    expect(css).toContain("ss-completed-risk-chart__point--animate");
    const motion = read("components/rextora/strategySearch/completed/useCompletedMotion.ts");
    expect(motion).toContain("prefers-reduced-motion: reduce");
    const kpi = read("components/rextora/strategySearch/completed/CompletedKpiStrip.tsx");
    expect(kpi).not.toContain("useCountUpDisplay");
  });

  it("P: mobile overflow guard and scatter fallback in completed layout CSS", () => {
    const css = read("components/rextora/v3/strategy-search.css");
    expect(css).toContain("ss-completed-dashboard-layout");
    expect(css).toMatch(/max-width:\s*100%/);
    expect(css).toContain("@media (max-width: 767px)");
    expect(css).toContain("ss-completed-risk-chart__desktop");
    expect(css).toContain("ss-completed-risk-chart__mobile");
  });

  it("renders primary dashboard with hierarchy: upper summary before recommendation", () => {
    const { container } = renderDashboard(baseJob(), {
      onRetryWithSettings: () => {},
    });
    expect(screen.getByTestId("ss-completed-dashboard-layout")).toBeTruthy();
    expect(screen.getByTestId("ss-completed-upper-summary")).toBeTruthy();
    expect(screen.getByTestId("ss-completed-verification-flow")).toBeTruthy();
    expect(screen.getByTestId("ss-completed-rec-briefing-row")).toBeTruthy();
    expect(screen.getByTestId("ss-completed-recommendation")).toBeTruthy();
    expect(screen.getByTestId("ss-completed-ai-briefing")).toBeTruthy();
    expect(screen.getByTestId("ss-completed-verification-flow")).toBeTruthy();

    const layout = container.querySelector(".ss-completed-dashboard-layout");
    const children = layout
      ? Array.from(layout.children).map((el) => el.getAttribute("data-testid"))
      : [];
    const upperIdx = children.indexOf("ss-completed-upper-summary");
    const recIdx = children.indexOf("ss-completed-rec-briefing-row");
    expect(upperIdx).toBeGreaterThanOrEqual(0);
    expect(recIdx).toBeGreaterThan(upperIdx);
  });

  it("verification flow receives exact evaluated and qualified counts", () => {
    renderDashboard();
    expect(screen.getByTestId("ss-verification-flow-evaluated").textContent).toContain(
      "30",
    );
    expect(screen.getByTestId("ss-verification-flow-qualified").textContent).toContain(
      "1",
    );
  });

  it("recommendation badge appears only on canonical bestPassed candidate", () => {
    const model = vm(baseJob());
    render(<CompletedCandidateReturnComparison model={model} />);
    const badges = screen.getAllByTestId("ss-completed-return-recommend-badge");
    expect(badges).toHaveLength(1);
    const list = screen.getByTestId("ss-completed-return-bars");
    const rows = within(list).getAllByRole("listitem");
    expect(rows).toHaveLength(2);
    const recRow = rows.find((row) =>
      within(row).queryByTestId("ss-completed-return-recommend-badge"),
    );
    expect(recRow?.getAttribute("data-net-return")).toBe("0.12");
    const otherRow = rows.find(
      (row) => !within(row).queryByTestId("ss-completed-return-recommend-badge"),
    );
    expect(otherRow?.getAttribute("data-net-return")).toBe("0.2");
  });

  it("return bars expose actual candidate net returns", () => {
    const model = vm(baseJob());
    render(<CompletedCandidateReturnComparison model={model} />);
    expect(screen.getByTestId("ss-completed-return-row-1").getAttribute("data-net-return")).toBe(
      "0.12",
    );
    expect(screen.getByTestId("ss-completed-return-row-2").getAttribute("data-net-return")).toBe(
      "0.2",
    );
  });

  it("AI researcher briefing renders deterministic metric chips", () => {
    renderDashboard();
    expect(screen.getByText("AI 연구원 인사이트")).toBeTruthy();
    expect(screen.getByTestId("ss-briefing-chip-return").textContent).toContain("12.00");
    expect(screen.getByTestId("ss-insight-caution").textContent).toContain("미래 성과 보장 아님");
  });

  it("completed dashboard does not mount risk-map mobile fallback", () => {
    renderDashboard();
    expect(screen.queryByTestId("ss-completed-return-mdd-cards")).toBeNull();
    expect(screen.getByTestId("ss-completed-matrix-mobile")).toBeTruthy();
  });

  it("STOP reason uses error hero tone", () => {
    const model = vm(
      baseJob({ completionReason: "FATAL_ERROR", status: "completed", qualifiedCount: 0 }),
    );
    expect(model.heroTone).toBe("error");
  });
});
