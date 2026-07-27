import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  buildDisplayDiscriminator,
  buildStrategyDisplayAlias,
  resolveCostStatus,
  resolveReviewStage,
  resolveSampleConfidence,
  SAMPLE_MEDIUM_MIN_TRADES,
  strategyIdentityKey,
} from "../src/lib/rextora/results/researchDisplay";
import { SAMPLE_MIN_TRADES } from "../src/lib/rextora/backtest/statusThresholds";
import {
  EXPLORER_PAGE_SIZES,
  filterSortPaginate,
  matchesExplorerSearch,
  paginateRows,
  strategyRowKey,
  type ExplorerFilterId,
} from "../components/rextora/results/researchExplorerUtils";
import type { ResearchResultCardView } from "../components/rextora/strategySearch/types";
import {
  hashFile,
  installIsolatedStrategyStore,
  canonicalSafeSourcePath,
} from "./helpers/isolatedStrategyStore";
import { createSearchJob, saveSearchTrial } from "../src/lib/rextora/strategySearch/jobStore";
import {
  createEmptySearchPlan,
  saveSearchPlan,
} from "../src/lib/rextora/strategySearch/searchPlan";
import { buildResearchResultsSummary } from "../src/lib/rextora/strategySearch/researchResultsSummary";
import { EXPECTED_SAFE_PARAMS_HASH } from "../src/lib/rextora/strategy/strategyTypes";
import type { StrategySearchTrial } from "../src/lib/rextora/strategySearch/types";

const tempRoots: string[] = [];
const cleanups: Array<() => void> = [];

afterEach(() => {
  for (const c of cleanups.splice(0)) c();
  for (const root of tempRoots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

function makeCard(
  overrides: Partial<ResearchResultCardView> & {
    iteration: number;
    paramsHash: string;
  },
): ResearchResultCardView {
  return {
    candidateId: `cand_${overrides.iteration}`,
    readableName: "변동성 돌파 · 공격형",
    displayAlias: `변동성 돌파 · 공격형 · ${buildDisplayDiscriminator(overrides.paramsHash)}`,
    strategyFamily: "volatility_breakout",
    symbol: "BTCUSDT",
    timeframe: "15m",
    sourceResearchJobId: "search_test",
    netReturn: 0.1,
    maxDrawdown: -0.05,
    tradeCount: 40,
    profitFactor: 1.4,
    totalCost: null,
    costStatus: "비용 데이터 없음",
    sampleConfidence: "표본 충분",
    sampleConfidenceDetail: "거래 40회",
    score: 0.2,
    stressPassed: true,
    jitterPassed: true,
    robustnessStatus: "거래 안정성 통과",
    overfittingRisk: "낮음",
    eligibilityStatus: "최종 추천 가능",
    recommendable: true,
    finalRecommendable: true,
    roles: [],
    registrationState: "미등록",
    registeredStrategyId: null,
    clusterId: "cluster_1",
    isRepresentative: true,
    memberCount: 1,
    strongestPoint: "수익",
    primaryWeakness: "추가 검증",
    recommendationReason: "ok",
    leverageLabel: "—",
    whyNotRank1: "",
    vsPreviousRankNote: "",
    ...overrides,
  };
}

describe("research display helpers", () => {
  it("builds deterministic aliases from params hash (not rank)", () => {
    const a = buildStrategyDisplayAlias({
      readableName: "변동성 돌파 · 공격형",
      paramsHash: "7fc3cd7c95c0",
    });
    const b = buildStrategyDisplayAlias({
      readableName: "변동성 돌파 · 공격형",
      paramsHash: "7fc3cd7c95c0",
    });
    const c = buildStrategyDisplayAlias({
      readableName: "변동성 돌파 · 공격형",
      paramsHash: "a3cec329a473",
    });
    expect(a).toBe(b);
    expect(a).toMatch(/변동성 돌파 · 공격형 · [A-Z]\d{2}/);
    expect(a).not.toBe(c);
  });

  it("keeps identity key independent of display alias", () => {
    expect(
      strategyIdentityKey({
        paramsHash: "abc",
        sourceResearchJobId: "job1",
        iteration: 3,
      }),
    ).toBe("trial:job1:abc:3");
    expect(
      strategyIdentityKey({
        registeredStrategyId: "custom_x",
        paramsHash: "abc",
        sourceResearchJobId: "job1",
        iteration: 3,
      }),
    ).toBe("id:custom_x");
  });

  it("classifies cost statuses without bare dash semantics", () => {
    expect(
      resolveCostStatus({ totalCost: 12.5, stressPassed: true }),
    ).toBe("비용 스트레스 통과");
    expect(
      resolveCostStatus({ totalCost: null, stressPassed: true }),
    ).toBe("비용 스트레스 통과");
    expect(
      resolveCostStatus({ totalCost: null, stressPassed: false }),
    ).toBe("비용 스트레스 미통과");
    expect(
      resolveCostStatus({ totalCost: 12.5, stressPassed: null }),
    ).toBe("비용 계산 완료");
    expect(
      resolveCostStatus({ totalCost: null, stressPassed: null }),
    ).toBe("비용 데이터 없음");
    expect(
      resolveCostStatus({ totalCost: Number.NaN, stressPassed: null }),
    ).toBe("비용 계산 불가");
  });

  it("uses verified sample thresholds", () => {
    expect(SAMPLE_MIN_TRADES).toBe(30);
    expect(SAMPLE_MEDIUM_MIN_TRADES).toBe(10);
    expect(resolveSampleConfidence(40).level).toBe("표본 충분");
    expect(resolveSampleConfidence(15).level).toBe("표본 보통");
    expect(resolveSampleConfidence(5).level).toBe("표본 부족");
    expect(resolveSampleConfidence(null).level).toBe("표본 부족");
  });

  it("clarifies review stage when stability fails but recommendable", () => {
    expect(
      resolveReviewStage({
        recommendable: true,
        stressPassed: false,
        jitterPassed: true,
      }),
    ).toBe("기본 검토 가능");
    expect(
      resolveReviewStage({
        recommendable: true,
        stressPassed: true,
        jitterPassed: true,
      }),
    ).toBe("최종 추천 가능");
    expect(
      resolveReviewStage({
        recommendable: false,
        stressPassed: false,
        jitterPassed: false,
      }),
    ).toBe("추가 검증 필요");
  });
});

describe("explorer pagination / filter / sort", () => {
  const rows = Array.from({ length: 35 }, (_, i) =>
    makeCard({
      iteration: i + 1,
      paramsHash: `hash${String(i).padStart(4, "0")}abcd`,
      netReturn: 0.5 - i * 0.01,
      tradeCount: i < 5 ? 5 : 40,
      sampleConfidence: i < 5 ? "표본 부족" : "표본 충분",
      recommendable: i % 2 === 0,
      finalRecommendable: i % 4 === 0,
      roles: i === 0 ? ["TOP 수익", "백테스트 추천"] : i < 3 ? ["백테스트 추천"] : [],
      registrationState: i === 2 ? "등록됨" : "미등록",
      registeredStrategyId: i === 2 ? "custom_x" : null,
      robustnessStatus:
        i === 1 ? "거래 안정성 미통과" : "거래 안정성 통과",
      costStatus: i === 4 ? "비용 계산 완료" : "비용 데이터 없음",
      totalCost: i === 4 ? 1.2 : null,
      displayAlias: `변동성 돌파 · 공격형 · ${buildDisplayDiscriminator(`hash${String(i).padStart(4, "0")}abcd`)}`,
      strategyFamily: i % 3 === 0 ? "ema_trend" : "volatility_breakout",
    }),
  );

  it("defaults to 10 rows per page and supports 10/20/50", () => {
    expect(EXPLORER_PAGE_SIZES).toEqual([10, 20, 50]);
    const p10 = paginateRows(rows, 1, 10);
    expect(p10.pageRows).toHaveLength(10);
    expect(p10.totalPages).toBe(4);
    expect(paginateRows(rows, 1, 20).pageRows).toHaveLength(20);
    expect(paginateRows(rows, 1, 50).pageRows).toHaveLength(35);
  });

  it("reports correct page summary bounds", () => {
    const p = paginateRows(rows, 2, 10);
    expect(p.startIndex).toBe(10);
    expect(p.endIndex).toBe(20);
    expect(p.pageRows).toHaveLength(10);
  });

  it("clamps out-of-range page and UI resets to page 1 on filter change", () => {
    const clamped = filterSortPaginate(rows, {
      search: "",
      filters: ["recommendable"],
      sortKey: "score",
      page: 99,
      pageSize: 10,
    });
    expect(clamped.page).toBe(clamped.totalPages);
    const reset = filterSortPaginate(rows, {
      search: "",
      filters: ["recommendable"],
      sortKey: "score",
      page: 1,
      pageSize: 10,
    });
    expect(reset.page).toBe(1);
    const panel = fs.readFileSync(
      path.join(
        process.cwd(),
        "components/rextora/results/CurrentResearchResultsPanel.tsx",
      ),
      "utf8",
    );
    expect(panel).toContain("setPage(1)");
  });

  it("sorts with pagination", () => {
    const byReturn = filterSortPaginate(rows, {
      search: "",
      filters: ["all"],
      sortKey: "return",
      page: 1,
      pageSize: 10,
    });
    expect(byReturn.pageRows[0]!.netReturn).toBeGreaterThanOrEqual(
      byReturn.pageRows[1]!.netReturn ?? -1,
    );
  });

  it("searches by alias / family / hash / strategy id", () => {
    expect(matchesExplorerSearch(rows[2]!, "custom_x")).toBe(true);
    expect(matchesExplorerSearch(rows[0]!, "ema_trend")).toBe(true);
    expect(matchesExplorerSearch(rows[1]!, rows[1]!.paramsHash.slice(0, 6))).toBe(
      true,
    );
    expect(matchesExplorerSearch(rows[0]!, "없는이름")).toBe(false);
  });

  it("only returns current-page rows", () => {
    const page1 = filterSortPaginate(rows, {
      search: "",
      filters: ["all"],
      sortKey: "iteration",
      page: 1,
      pageSize: 10,
    });
    const page2 = filterSortPaginate(rows, {
      search: "",
      filters: ["all"],
      sortKey: "iteration",
      page: 2,
      pageSize: 10,
    });
    expect(page1.pageRows).toHaveLength(10);
    expect(page2.pageRows).toHaveLength(10);
    const keys1 = new Set(page1.pageRows.map((r) => strategyRowKey(r)));
    expect(page2.pageRows.every((r) => !keys1.has(strategyRowKey(r)))).toBe(
      true,
    );
  });

  it("keeps role badges on compact list identities", () => {
    const page = filterSortPaginate(rows, {
      search: "",
      filters: ["top"] as ExplorerFilterId[],
      sortKey: "score",
      page: 1,
      pageSize: 10,
    });
    expect(page.pageRows.some((r) => r.roles.includes("TOP 수익"))).toBe(true);
  });

  it("uses stable row keys from strategy identity", () => {
    expect(strategyRowKey(rows[2]!)).toBe("id:custom_x");
    expect(strategyRowKey(rows[0]!)).toContain("trial:search_test:");
  });
});

describe("summary enrichment + SAFE isolation", () => {
  function makeRoot() {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "rextora-rux-"));
    tempRoots.push(root);
    return { rootDir: root };
  }

  function makeTrial(
    jobId: string,
    iteration: number,
    opts: {
      paramsHash: string;
      params: Record<string, number>;
      totalReturn: number;
      mdd: number;
      trades?: number;
      totalCost?: number | null;
      stressPassed?: boolean;
      withRobustness?: boolean;
    },
  ): StrategySearchTrial {
    const robust = opts.withRobustness !== false;
    return {
      jobId,
      iteration,
      candidateId: `cand_${iteration}`,
      params: opts.params,
      paramsHash: opts.paramsHash,
      generatorType: "random",
      parentCandidateIds: [],
      score: opts.totalReturn,
      passed: true,
      failureReasons: [],
      windowResults: [
        {
          totalReturn: opts.totalReturn,
          mdd: opts.mdd,
          trades: opts.trades ?? 40,
          profitFactor: 1.4,
          ...(opts.totalCost != null ? { totalCost: opts.totalCost } : {}),
          winRate: 0.55,
        },
      ],
      costStressResults: robust
        ? [{ passed: opts.stressPassed !== false, multiplier: 1.5 }]
        : [],
      jitterResults: robust ? [{ passed: true, sample: 1 }] : [],
      durationMs: 10,
      createdAt: new Date().toISOString(),
    };
  }

  it("enriches cards with alias/cost/sample/roles and excludes SAFE", () => {
    const store = makeRoot();
    const isolated = installIsolatedStrategyStore();
    cleanups.push(isolated.cleanup);
    const beforeSafe = hashFile(canonicalSafeSourcePath());

    const job = createSearchJob(
      {
        searchVersion: "1",
        strategyTemplateId: "rux",
        symbols: ["BTCUSDT"],
        timeframe: "15m",
        dataVersion: "v1",
        seed: 3,
        generatorType: "random",
        maxIterations: 20,
        parameterRanges: [
          { key: "ema_fast", min: 8, max: 40, step: 1, valueType: "integer" },
        ],
        evaluationWindows: [
          {
            id: "w1",
            label: "w1",
            fromOpenTime: 0,
            toOpenTime: 1,
            requiredForPass: true,
          },
        ],
        balance: 10_000,
        baseCostConfig: {
          feeRate: 0.0004,
          slippageRate: 0.0002,
          fundingRate: 0,
          applyFunding: false,
          applySpread: false,
          spreadRate: 0,
        },
        passPolicy: { thresholds: {} },
        scoreWeights: {
          returnWeight: 1,
          mddWeight: 1,
          profitFactorWeight: 0.25,
          winRateWeight: 0.25,
          tradeAdequacyWeight: 0.25,
          negativeMonthWeight: 0.1,
          consistencyWeight: 0.1,
        },
        costStressScenarios: [],
        jitterConfig: {
          enabled: true,
          sampleCount: 1,
          mutationScale: 0.1,
          seed: 1,
          minimumPassRate: 0,
          maximumScoreDropRatio: 1,
          parameterRanges: [],
        },
        dataRef: {
          source: "binance_historical",
          availableFrom: 0,
          availableTo: 1,
        },
      },
      store,
    );
    const plan = createEmptySearchPlan({
      searchName: "rux",
      depthProfile: "standard",
      qualificationProfile: "balanced",
      qualifiedTarget: 5,
      stopWhenQualifiedTarget: false,
      candidateBudget: 100,
      stageBatchSize: 10,
      maxRuntimeMs: null,
      spaces: [{ id: "space_a", labelKo: "기본" }],
    });
    plan.qualifiedHashes = ["aa11bb22cc33", "dd44ee55ff66"];
    plan.uniqueEvaluatedCount = 2;
    saveSearchPlan(job.id, plan, store);

    const t1 = makeTrial(job.id, 1, {
      paramsHash: "aa11bb22cc33",
      params: {
        ema_fast: 12,
        ema_mid: 48,
        ema_slow: 96,
        rsi_period: 14,
        sl_atr_mult: 2.5,
        tp_atr_mult: 4,
        vol_ratio_min: 1.2,
        pullback_max_dist: 0.03,
      },
      totalReturn: 0.2,
      mdd: -0.08,
      trades: 12,
      totalCost: null,
      stressPassed: false,
    });
    (t1.params as Record<string, unknown>).confirm_bull = true;
    saveSearchTrial(t1, store);
    saveSearchTrial(
      makeTrial(job.id, 2, {
        paramsHash: "dd44ee55ff66",
        params: {
          ema_fast: 20,
          ema_mid: 48,
          ema_slow: 96,
          rsi_period: 14,
          sl_atr_mult: 1.5,
          tp_atr_mult: 2.2,
          vol_ratio_min: 1.0,
          pullback_max_dist: 0.015,
        },
        totalReturn: 0.15,
        mdd: -0.04,
        trades: 40,
        totalCost: 9.5,
        stressPassed: true,
      }),
      store,
    );
    // Must never appear
    saveSearchTrial(
      makeTrial(job.id, 3, {
        paramsHash: EXPECTED_SAFE_PARAMS_HASH,
        params: {
          ema_fast: 21,
          ema_mid: 48,
          ema_slow: 96,
          rsi_period: 14,
          sl_atr_mult: 1.5,
          tp_atr_mult: 2.5,
          vol_ratio_min: 1.1,
          pullback_max_dist: 0.02,
        },
        totalReturn: 0.99,
        mdd: -0.01,
        trades: 100,
        totalCost: 1,
      }),
      store,
    );

    const summary = buildResearchResultsSummary(job.id, store);
    expect(summary.representatives.length).toBeGreaterThanOrEqual(2);
    expect(
      summary.representatives.every(
        (r) =>
          r.paramsHash !== EXPECTED_SAFE_PARAMS_HASH &&
          r.paramsHash !== "7893ca3f0e30",
      ),
    ).toBe(true);

    for (const card of summary.representatives) {
      expect(card.displayAlias).toMatch(/ · [A-Z]\d{2}$/);
      expect(card.readableName).not.toContain(card.displayAlias.slice(-3));
      expect(card.costStatus).toMatch(/비용/);
      expect(card.sampleConfidence).toMatch(/표본/);
      expect(["기본 검토 가능", "최종 추천 가능", "추가 검증 필요"]).toContain(
        card.eligibilityStatus,
      );
    }

    const withCost = summary.representatives.find(
      (r) => r.paramsHash === "dd44ee55ff66",
    );
    expect(withCost?.costStatus).toBe("비용 스트레스 통과");
    expect(withCost?.totalCost).toBe(9.5);
    expect(withCost?.finalRecommendable).toBe(true);

    const lowSample = summary.representatives.find(
      (r) => r.paramsHash === "aa11bb22cc33",
    );
    expect(lowSample?.sampleConfidence).toBe("표본 보통");
    expect(lowSample?.eligibilityStatus).toBe("기본 검토 가능");

    if (summary.topProfit) {
      expect(summary.topProfit.roles).toContain("TOP 수익");
    }
    expect(summary.backtestRecommendations.length).toBeLessThanOrEqual(10);
    expect(hashFile(canonicalSafeSourcePath())).toBe(beforeSafe);
  });
});

describe("UI source contracts", () => {
  it("Current Research panel focuses on TOP 10 and collapses raw explorer", () => {
    const src = fs.readFileSync(
      path.join(
        process.cwd(),
        "components/rextora/results/CurrentResearchResultsPanel.tsx",
      ),
      "utf8",
    );
    expect(src).toContain("results-top10");
    expect(src).toContain("summary.top10");
    expect(src).toContain("top10-rank-changes");
    expect(src).toContain("top10RankChanges");
    expect(src).toContain('data-testid="results-raw-candidates"');
    expect(src).toContain("전체 원본 후보 보기");
    expect(src).toContain("current-research-stage-counts");
    expect(src).toContain("stageBasicQualified");
    expect(src).toContain("pageSize");
    expect(src).toContain("explorer-pagination");
    expect(src).toContain("전략 등록 후 백테스트");
    expect(src).not.toContain("ResearchCardView");
  });

  it("Results workbench nav and storage/history management", () => {
    const src = fs.readFileSync(
      path.join(process.cwd(), "components/rextora/results/ResultsWorkbench.tsx"),
      "utf8",
    );
    expect(src).toContain("useState(false)");
    expect(src).toContain("results-section-nav");
    expect(src).toContain("results-section-outcome");
    expect(src).toContain("results-section-top10");
    expect(src).toContain("results-section-rank-history");
    expect(src).toContain("results-raw-candidates");
    expect(src).toContain("results-storage-summary");
    expect(src).toContain("deletion-impact");
    expect(src).toContain("archive-job-");
    expect(src).toContain("libraryOpen");
    expect(src).toContain("historyOpen");
    expect(src).toContain("safeOpen");
  });

  it("does not call exchange order APIs from results modules", () => {
    const files = [
      "components/rextora/results/CurrentResearchResultsPanel.tsx",
      "components/rextora/results/ResultsWorkbench.tsx",
      "src/lib/rextora/strategySearch/researchResultsSummary.ts",
    ];
    for (const f of files) {
      const src = fs.readFileSync(path.join(process.cwd(), f), "utf8");
      expect(src).not.toMatch(/createOrder|placeOrder|exchange\.order/i);
    }
  });
});
