import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  GROUP_PATTERN_CANONICAL,
  GROUP_SAFE,
} from "../src/lib/rextora/researchRankingReadModel";
import {
  INCOMPARABLE_JOB_COPY,
  NEED_TWO_JOBS_COPY,
  NO_SHARED_GROUP_COPY,
  SAME_JOB_COMPARE_COPY,
  SEARCH_JOB_COMPARE_PATH,
  buildSearchCompareHref,
  buildSearchJobComparison,
  comparableSearchJobs,
  formatRate,
  isComparableSearchJobStatus,
  safeRate,
  searchJobCompareEligibilityError,
} from "../components/rextora/strategySearch/searchJobComparison";
import type {
  ResearchResultsSummaryView,
  StrategySearchJobDetail,
} from "../components/rextora/strategySearch/types";

const ROOT = process.cwd();

function read(rel: string): string {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

function counts(input: Partial<ResearchResultsSummaryView["counts"]> = {}) {
  return {
    evaluatedStrategies: 100,
    qualifiedStrategies: 40,
    uniqueQualifiedStrategies: 30,
    clusteredRepresentatives: 10,
    duplicateOrNearDuplicateMembers: 5,
    promotedStrategies: 2,
    registeredStrategies: 1,
    recommendationEligibleStrategies: 8,
    backtestRecommendedStrategies: 3,
    top10Saved: 10,
    stageBasicQualified: 40,
    stageStabilityPassed: 20,
    stageCostPassed: 15,
    stageSampleOk: 12,
    stageOverfitOk: 10,
    stageFinalRecommendable: 8,
    ...input,
  };
}

function summary(
  overrides: Partial<ResearchResultsSummaryView> = {},
): ResearchResultsSummaryView {
  return {
    jobId: "job_a",
    searchName: "BTC 표준 탐색",
    status: "completed",
    symbol: "BTCUSDT",
    timeframe: "15m",
    outcome: {
      status: "completed",
      labelKo: "완료",
      reasonKo: null,
    } as ResearchResultsSummaryView["outcome"],
    counts: counts(),
    equation: "evaluated → qualified",
    liveSearchBest: {} as ResearchResultsSummaryView["liveSearchBest"],
    finalizedBest: {} as ResearchResultsSummaryView["finalizedBest"],
    topProfit: null,
    topStable: null,
    topRecommend: null,
    rankingGroups: [
      {
        rankingCompatibilityGroup: GROUP_SAFE,
        engineCostModel: GROUP_SAFE,
        rankingEligible: true,
        bestCandidate: {
          candidateId: "c1",
          iteration: 1,
          paramsHash: "raw_a",
          score: 2.2,
          passed: false,
        },
        bestPassedCandidate: {
          candidateId: "c2",
          iteration: 2,
          paramsHash: "pass_a",
          score: 1.4,
          passed: true,
        },
        topCandidates: [],
      },
    ],
    backtestRecommendations: [],
    top10: [],
    top10RankChanges: [],
    clusters: [],
    representatives: [],
    selectionSummary: {
      whyTopSelected: [],
      whyExcluded: [],
      overfittingNote: "",
      costSensitivityNote: "",
      drawdownRiskNote: "",
      tradeConfidenceNote: "",
      nextActions: [],
    },
    provenanceNote: "",
    ...overrides,
  };
}

function job(id: string, extra: Partial<StrategySearchJobDetail> = {}): StrategySearchJobDetail {
  return {
    id,
    status: "completed",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T01:00:00.000Z",
    startedAt: "2026-01-01T00:00:00.000Z",
    finishedAt: "2026-01-01T01:00:00.000Z",
    elapsedMs: 3_600_000,
    maxIterations: 10,
    completedIterations: 10,
    nextIteration: 10,
    progressRatio: 1,
    statistics: null,
    bestScore: 1.4,
    bestCandidateHash: "raw_a",
    bestPassedCandidateHash: "pass_a",
    failureMessage: null,
    executionActive: false,
    searchVersion: "1",
    symbols: ["BTCUSDT"],
    timeframe: "15m",
    seed: 1,
    searchName: "BTC 표준 탐색",
    config: {
      searchVersion: "1",
      strategyTemplateId: "template_search_base",
      symbols: ["BTCUSDT"],
      timeframe: "15m",
      dataVersion: "v1",
      seed: 1,
      generatorType: "random",
      maxIterations: 10,
      parameterRangeKeys: [],
      evaluationWindowIds: [],
    },
    checkpoint: {
      completedIterations: 10,
      nextIteration: 10,
      bestCandidate: null,
      bestPassedCandidate: null,
      updatedAt: "2026-01-01T01:00:00.000Z",
      hasRunnerPayload: false,
    },
    appliedSearchSummary: {
      titleKo: "설정 당시 적용값",
      subtitleKo: "",
      sections: [
        {
          id: "target",
          titleKo: "탐색 대상",
          rows: [
            { labelKo: "심볼", valueKo: "BTCUSDT" },
            { labelKo: "타임프레임", valueKo: "15m" },
            { labelKo: "시장 모드", valueKo: "추천 심볼" },
          ],
        },
        {
          id: "engine",
          titleKo: "탐색 엔진",
          rows: [
            { labelKo: "깊이 프로필", valueKo: "balanced" },
            { labelKo: "탐색 이름", valueKo: "BTC 표준 탐색" },
          ],
        },
        {
          id: "validation",
          titleKo: "검증 설정",
          rows: [
            { labelKo: "수수료", valueKo: "0.04%" },
            { labelKo: "슬리피지", valueKo: "0.02%" },
            { labelKo: "비용 스트레스", valueKo: "사용" },
            { labelKo: "최소 거래", valueKo: "10" },
            { labelKo: "합격 프로필", valueKo: "balanced" },
          ],
        },
        {
          id: "risk",
          titleKo: "위험 설정",
          rows: [{ labelKo: "최대 낙폭 기준", valueKo: "25.00%" }],
        },
      ],
    },
    ...extra,
  } as StrategySearchJobDetail;
}

describe("Strategy Search job comparison", () => {
  it("A: two completed jobs can be selected", () => {
    const left = job("job_a");
    const right = job("job_b", {
      id: "job_b",
      searchName: "ETH 탐색",
      symbols: ["ETHUSDT"],
      timeframe: "1h",
    });
    const built = buildSearchJobComparison({
      leftJob: left,
      rightJob: right,
      leftSummary: summary({ jobId: "job_a" }),
      rightSummary: summary({
        jobId: "job_b",
        searchName: "ETH 탐색",
        symbol: "ETHUSDT",
        timeframe: "1h",
      }),
    });
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    expect(built.model.left.jobId).toBe("job_a");
    expect(built.model.right.jobId).toBe("job_b");
  });

  it("B: same job cannot be compared against itself", () => {
    const one = job("job_same");
    expect(searchJobCompareEligibilityError("job_same", "job_same")).toBe(
      SAME_JOB_COMPARE_COPY,
    );
    const built = buildSearchJobComparison({
      leftJob: one,
      rightJob: one,
      leftSummary: summary({ jobId: "job_same" }),
      rightSummary: summary({ jobId: "job_same" }),
    });
    expect(built.ok).toBe(false);
    if (built.ok) return;
    expect(built.error).toBe(SAME_JOB_COMPARE_COPY);
  });

  it("C: incomplete jobs are excluded", () => {
    expect(isComparableSearchJobStatus("completed")).toBe(true);
    expect(isComparableSearchJobStatus("failed")).toBe(false);
    expect(isComparableSearchJobStatus("cancelled")).toBe(false);
    expect(isComparableSearchJobStatus("running")).toBe(false);
    expect(
      comparableSearchJobs([
        { status: "completed" },
        { status: "failed" },
        { status: "cancelled" },
      ]),
    ).toHaveLength(1);
    const built = buildSearchJobComparison({
      leftJob: job("a", { status: "failed" }),
      rightJob: job("b"),
      leftSummary: summary(),
      rightSummary: summary({ jobId: "b" }),
    });
    expect(built.ok).toBe(false);
    if (built.ok) return;
    expect(built.error).toBe(INCOMPARABLE_JOB_COPY);
  });

  it("D: results-summary data is used, not raw trial files", () => {
    const compareSrc = read(
      "components/rextora/strategySearch/searchJobComparison.ts",
    );
    const viewSrc = read(
      "components/rextora/strategySearch/SearchJobCompareView.tsx",
    );
    expect(compareSrc).toContain("ResearchResultsSummaryView");
    expect(compareSrc).not.toContain("listSearchTrials");
    expect(compareSrc).not.toContain("trials/");
    expect(viewSrc).toContain("fetchResearchResultsSummary");
    expect(viewSrc).not.toContain("/trials");
  });

  it("E: job detail supplements appliedSearchSummary and elapsedMs", () => {
    const built = buildSearchJobComparison({
      leftJob: job("job_a"),
      rightJob: job("job_b", { elapsedMs: 1_800_000 }),
      leftSummary: summary(),
      rightSummary: summary({ jobId: "job_b" }),
    });
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    expect(built.model.overview.some((row) => row.label === "소요 시간")).toBe(
      true,
    );
    expect(
      built.model.settings.some((row) => row.label === "깊이 프로필"),
    ).toBe(true);
    expect(built.model.left.elapsedLabel).toContain("분");
  });

  it("F/G: funnel counts and zero-safe derived rates", () => {
    expect(safeRate(8, 0)).toBeNull();
    expect(formatRate(null)).toBe("—");
    expect(safeRate(40, 100)).toBe(0.4);
    expect(formatRate(0.4)).toBe("40.0%");
    const built = buildSearchJobComparison({
      leftJob: job("job_a"),
      rightJob: job("job_b"),
      leftSummary: summary({
        counts: counts({
          evaluatedStrategies: 0,
          qualifiedStrategies: 0,
          stageFinalRecommendable: 0,
        }),
      }),
      rightSummary: summary({
        jobId: "job_b",
        counts: counts({
          evaluatedStrategies: 200,
          qualifiedStrategies: 50,
          stageFinalRecommendable: 10,
        }),
      }),
    });
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    const passRate = built.model.funnel.find((row) => row.id === "funnel-pass-rate");
    expect(passRate?.left).toBe("—");
    expect(passRate?.right).toBe("25.0%");
    expect(
      built.model.funnel.find((row) => row.id === "funnel-evaluated")?.right,
    ).toBe("200");
  });

  it("H/I: same settings are neutral and different settings are factual differences", () => {
    const right = job("job_b");
    right.appliedSearchSummary = {
      titleKo: "설정 당시 적용값",
      subtitleKo: "",
      sections: [
        {
          id: "target",
          titleKo: "탐색 대상",
          rows: [
            { labelKo: "심볼", valueKo: "ETHUSDT" },
            { labelKo: "타임프레임", valueKo: "1h" },
            { labelKo: "시장 모드", valueKo: "추천 심볼" },
          ],
        },
        {
          id: "engine",
          titleKo: "탐색 엔진",
          rows: [
            { labelKo: "깊이 프로필", valueKo: "deep" },
            { labelKo: "탐색 이름", valueKo: "ETH 탐색" },
          ],
        },
        {
          id: "validation",
          titleKo: "검증 설정",
          rows: [
            { labelKo: "수수료", valueKo: "0.04%" },
            { labelKo: "슬리피지", valueKo: "0.02%" },
            { labelKo: "비용 스트레스", valueKo: "사용" },
            { labelKo: "최소 거래", valueKo: "10" },
            { labelKo: "합격 프로필", valueKo: "balanced" },
          ],
        },
        {
          id: "risk",
          titleKo: "위험 설정",
          rows: [{ labelKo: "최대 낙폭 기준", valueKo: "25.00%" }],
        },
      ],
    };
    const built = buildSearchJobComparison({
      leftJob: job("job_a"),
      rightJob: right,
      leftSummary: summary(),
      rightSummary: summary({ jobId: "job_b", symbol: "ETHUSDT", timeframe: "1h" }),
    });
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    const symbol = built.model.settings.find((row) => row.label === "심볼");
    const fee = built.model.costRisk.find((row) => row.label === "수수료");
    expect(symbol?.tone).toBe("different");
    expect(fee?.tone).toBe("same");
    const src = read("components/rextora/strategySearch/searchJobComparison.ts");
    const view = read("components/rextora/strategySearch/SearchJobCompareView.tsx");
    expect(src).not.toMatch(/승자|패자|우수|열등|더 좋음/);
    expect(view).not.toMatch(/승자|패자|우수|열등|더 좋음/);
  });

  it("J/K: only same rankingCompatibilityGroup candidates are paired", () => {
    const built = buildSearchJobComparison({
      leftJob: job("job_a"),
      rightJob: job("job_b"),
      leftSummary: summary(),
      rightSummary: summary({
        jobId: "job_b",
        rankingGroups: [
          {
            rankingCompatibilityGroup: GROUP_PATTERN_CANONICAL,
            engineCostModel: GROUP_PATTERN_CANONICAL,
            rankingEligible: true,
            bestCandidate: {
              candidateId: "p1",
              iteration: 3,
              paramsHash: "raw_b",
              score: 9.9,
              passed: true,
            },
            bestPassedCandidate: {
              candidateId: "p2",
              iteration: 4,
              paramsHash: "pass_b",
              score: 9.1,
              passed: true,
            },
            topCandidates: [],
          },
        ],
      }),
    });
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    expect(built.model.hasSharedComparableGroup).toBe(false);
    expect(built.model.groups.every((group) => !group.comparable)).toBe(true);
    const src = read("components/rextora/strategySearch/searchJobComparison.ts");
    expect(src).toContain("rankingCompatibilityGroup");
    expect(src).toContain(NO_SHARED_GROUP_COPY);
    expect(src).not.toContain("sort((a, b) =>");
  });

  it("L/M: raw best and recommended stay separate; failed raw best is not a recommendation", () => {
    const built = buildSearchJobComparison({
      leftJob: job("job_a"),
      rightJob: job("job_b"),
      leftSummary: summary(),
      rightSummary: summary({ jobId: "job_b" }),
    });
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    const group = built.model.groups[0]!;
    expect(group.leftRecommended.passed).toBe(true);
    expect(group.leftRawBest.passed).toBe(false);
    expect(group.leftRecommended.scoreLabel).not.toBe(group.leftRawBest.scoreLabel);
    const view = read("components/rextora/strategySearch/SearchJobCompareView.tsx");
    expect(view).toContain("최종 추천 후보");
    expect(view).toContain("최고 점수 후보");
    expect(view).toContain("미통과");
    expect(view).toContain("추천 아님");
  });

  it("N: cost/risk assumptions render alongside results", () => {
    const built = buildSearchJobComparison({
      leftJob: job("job_a"),
      rightJob: job("job_b"),
      leftSummary: summary(),
      rightSummary: summary({ jobId: "job_b" }),
    });
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    expect(built.model.costRisk.map((row) => row.label)).toEqual(
      expect.arrayContaining(["수수료", "슬리피지", "비용 스트레스", "최대 낙폭 기준"]),
    );
  });

  it("O: deep-link selection helper restores left/right query params", () => {
    expect(buildSearchCompareHref({ left: "a", right: "b" })).toBe(
      `${SEARCH_JOB_COMPARE_PATH}?left=a&right=b`,
    );
    const view = read("components/rextora/strategySearch/SearchJobCompareView.tsx");
    expect(view).toContain('searchParams.get("left")');
    expect(view).toContain('searchParams.get("right")');
    expect(view).toContain("router.replace");
  });

  it("P: old retained job is compared via direct job APIs", () => {
    const view = read("components/rextora/strategySearch/SearchJobCompareView.tsx");
    expect(view).toContain("getStrategySearchJob(leftId)");
    expect(view).toContain("fetchResearchResultsSummary(leftId");
    expect(view).toContain("limit: 100");
  });

  it("Q: deleted/inaccessible job uses customer-safe error", () => {
    const view = read("components/rextora/strategySearch/SearchJobCompareView.tsx");
    expect(view).toContain("선택한 탐색을 찾을 수 없습니다");
    expect(view).not.toContain("stack");
    expect(view).not.toContain("ENOENT");
  });

  it("R/S: mobile overflow and reduced motion are honored", () => {
    const css = read("components/rextora/v3/strategy-search.css");
    expect(css).toContain(".ss-compare");
    expect(css).toContain("overflow-x: hidden");
    expect(css).toContain("@media (max-width: 767px)");
    expect(css).toContain("prefers-reduced-motion");
    expect(css).toContain(".ss-compare-body");
    expect(css).toContain(".ss-compare-row");
  });

  it("T: no search/ranking/recommendation semantics are imported into comparison", () => {
    const compareSrc = read(
      "components/rextora/strategySearch/searchJobComparison.ts",
    );
    expect(compareSrc).not.toContain("candidateEvaluator");
    expect(compareSrc).not.toContain("candidateGenerator");
    expect(compareSrc).not.toMatch(/from ".*recommendation"/);
    expect(NEED_TWO_JOBS_COPY).toContain("2건");
  });
});
