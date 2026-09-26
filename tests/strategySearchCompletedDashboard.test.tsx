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

const ROOT = process.cwd();

function read(rel: string): string {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
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
    expect(workbench).toContain("showCompletedDashboardPrimary ? null : (");
    expect(workbench).toContain("showOutcomeFirst && !showCompletedDashboardPrimary");
  });

  it("C: QUALIFIED_TARGET_REACHED with qualified uses success hero", () => {
    const model = buildCompletedDashboardViewModel({
      job: baseJob(),
      qualifiedCount: 1,
    });
    expect(model.heroTone).toBe("success");
    expect(model.heroMessage).toContain("목표 조건");
  });

  it("hero title has no duplicate literal checkmark; integrated visual check remains", () => {
    const model = buildCompletedDashboardViewModel({
      job: baseJob(),
      qualifiedCount: 1,
    });
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
    const model = buildCompletedDashboardViewModel({
      job: baseJob({ completionReason: "DEADLINE_REACHED" }),
      qualifiedCount: 2,
    });
    expect(model.heroTone).toBe("neutral");
    expect(model.heroMessage).toContain("탐색 한도");
  });

  it("E: zero qualified does not use success tone", () => {
    const model = buildCompletedDashboardViewModel({
      job: baseJob({ completionReason: "DEADLINE_REACHED" }),
      qualifiedCount: 0,
    });
    expect(model.heroTone).toBe("no-qualified");
    expect(model.heroMessage).toContain("충족한 후보는 없습니다");
  });

  it("F–G: recommendation joins top10; failed bestCandidate is not recommendation", () => {
    const job = baseJob();
    const resolved = resolveCompletedRecommendation(job);
    expect(resolved?.ref.paramsHash).toBe("hash_pass");
    const rec = buildCompletedDashboardViewModel({ job, qualifiedCount: 1 })
      .recommendation;
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
    const model = buildCompletedDashboardViewModel({ job, qualifiedCount: 0 });
    expect(model.recommendation).toBeNull();
    render(<CompletedReturnRiskChart model={model} />);
    expect(screen.queryByTestId("ss-completed-risk-point-recommended")).toBeNull();
    expect(screen.getByTestId("ss-completed-no-equity-chart")).toBeTruthy();
  });

  it("I: funnel uses canonical statistics", () => {
    const model = buildCompletedDashboardViewModel({
      job: baseJob(),
      qualifiedCount: 1,
    });
    expect(model.funnel).toEqual({
      generated: 40,
      evaluated: 30,
      passed: 5,
      qualified: 1,
    });
  });

  it("J: return/MDD comparison uses top10 within one group", () => {
    const job = baseJob();
    const model = buildCompletedDashboardViewModel({ job, qualifiedCount: 1 });
    expect(model.compareCandidates.every(
      (c) => c.rankingCompatibilityGroup === "safe_execution_price_v1",
    )).toBe(true);
    expect(model.compareCandidates.some((c) => c.netReturn === 0.12)).toBe(true);
    render(<CompletedReturnRiskChart model={model} />);
    expect(screen.getByTestId("ss-completed-return-mdd-scatter")).toBeTruthy();
    const point = screen.getByTestId("ss-completed-risk-point-recommended");
    expect(point.getAttribute("data-net-return")).toBe("0.12");
    expect(point.getAttribute("data-mdd-abs")).toBeTruthy();
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
    expect(kpi).toContain("prefers-reduced-motion: reduce");
  });

  it("P: mobile overflow guard and scatter fallback in completed layout CSS", () => {
    const css = read("components/rextora/v3/strategy-search.css");
    expect(css).toContain("ss-completed-dashboard-layout");
    expect(css).toMatch(/max-width:\s*100%/);
    expect(css).toContain("@media (max-width: 390px)");
    expect(css).toContain("ss-completed-risk-chart__desktop");
    expect(css).toContain("ss-completed-risk-chart__mobile");
  });

  it("renders primary dashboard with hierarchy: upper summary before recommendation", () => {
    const { container } = render(
      <CompletedDashboard
        job={baseJob()}
        passCount={1}
        onNewSearch={() => {}}
        onRetryWithSettings={() => {}}
      />,
    );
    expect(screen.getByTestId("ss-completed-dashboard-layout")).toBeTruthy();
    expect(screen.getByTestId("ss-completed-upper-summary")).toBeTruthy();
    expect(screen.getByTestId("ss-completed-passfail-donut")).toBeTruthy();
    expect(screen.getByTestId("ss-completed-rec-briefing-row")).toBeTruthy();
    expect(screen.getByTestId("ss-completed-recommendation")).toBeTruthy();
    expect(screen.getByTestId("ss-completed-ai-briefing")).toBeTruthy();
    expect(screen.getByTestId("ss-completed-funnel")).toBeTruthy();

    const layout = container.querySelector(".ss-completed-dashboard-layout");
    const children = layout
      ? Array.from(layout.children).map((el) => el.getAttribute("data-testid"))
      : [];
    const upperIdx = children.indexOf("ss-completed-upper-summary");
    const recIdx = children.indexOf("ss-completed-rec-briefing-row");
    expect(upperIdx).toBeGreaterThanOrEqual(0);
    expect(recIdx).toBeGreaterThan(upperIdx);
  });

  it("pass/fail donut receives exact passed and failed statistics", () => {
    render(
      <CompletedDashboard job={baseJob()} passCount={1} onNewSearch={() => {}} />,
    );
    const ring = screen.getByTestId("ss-completed-passfail-ring-pass");
    expect(ring.getAttribute("data-passed")).toBe("5");
    expect(ring.getAttribute("data-failed")).toBe("25");
  });

  it("recommendation badge appears only on canonical bestPassed candidate", () => {
    const model = buildCompletedDashboardViewModel({
      job: baseJob(),
      qualifiedCount: 1,
    });
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
    const model = buildCompletedDashboardViewModel({
      job: baseJob(),
      qualifiedCount: 1,
    });
    render(<CompletedCandidateReturnComparison model={model} />);
    expect(screen.getByTestId("ss-completed-return-row-1").getAttribute("data-net-return")).toBe(
      "0.12",
    );
    expect(screen.getByTestId("ss-completed-return-row-2").getAttribute("data-net-return")).toBe(
      "0.2",
    );
  });

  it("AI researcher briefing renders deterministic metric chips", () => {
    render(
      <CompletedDashboard job={baseJob()} passCount={1} onNewSearch={() => {}} />,
    );
    expect(screen.getByText("AI 연구원 브리핑")).toBeTruthy();
    expect(screen.getByTestId("ss-briefing-chip-return").textContent).toContain("수익률");
    expect(screen.getByText(/과거 검증 결과이며 미래 성과를 보장하지 않습니다/)).toBeTruthy();
  });

  it("mobile scatter fallback list is present in DOM", () => {
    render(
      <CompletedDashboard job={baseJob()} passCount={1} onNewSearch={() => {}} />,
    );
    expect(screen.getByTestId("ss-completed-return-mdd-cards")).toBeTruthy();
  });

  it("STOP reason uses error hero tone", () => {
    const model = buildCompletedDashboardViewModel({
      job: baseJob({ completionReason: "FATAL_ERROR", status: "completed" }),
      qualifiedCount: 0,
    });
    expect(model.heroTone).toBe("error");
  });
});
