import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  compareFieldInventory,
  pairRelativeBarWidths,
  formatCompactCompareDate,
  formatCompareFamilyDisplay,
  parseDisplayedRate,
  rateDifferenceInterval,
  rateDifferencePercentagePoints,
  rateScalePosition,
  sharedPeriodTimeline,
  strategyFamilyZones,
} from "../components/rextora/strategySearch/compareVisual";
import { formatCustomerSearchValue } from "../components/rextora/strategySearch/customerDisplay";
import { selectActiveCompareSection } from "../components/rextora/strategySearch/compare/activeSection";
import {
  GROUP_PATTERN,
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
    expect(built.model.funnel.find((row) => row.id === "funnel-final")?.right).toBe("10");
    expect(built.model.funnel.find((row) => row.id === "funnel-final-rate")?.right).toBe("5.0%");
    expect(
      built.model.funnel.find((row) => row.id === "funnel-evaluated")?.right,
    ).toBe("200");
  });

  it("final eligibility count and rate share the results-summary authority", () => {
    const leftJob = job("job_a", { qualifiedCount: 77, gatePassedCount: 91, evaluatedCount: 100 });
    const rightJob = job("job_b", { qualifiedCount: 66, gatePassedCount: 88, evaluatedCount: 200 });
    const built = buildSearchJobComparison({
      leftJob,
      rightJob,
      leftSummary: summary({ counts: counts({ evaluatedStrategies: 100, qualifiedStrategies: 40, stageFinalRecommendable: 7 }) }),
      rightSummary: summary({ jobId: "job_b", counts: counts({ evaluatedStrategies: 200, qualifiedStrategies: 50, stageFinalRecommendable: 9 }) }),
    });
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    expect(built.model.funnel.find((row) => row.id === "funnel-final")?.left).toBe("7");
    expect(built.model.funnel.find((row) => row.id === "funnel-final-rate")?.left).toBe("7.0%");
    expect(built.model.funnel.find((row) => row.id === "funnel-final")?.right).toBe("9");
    expect(built.model.funnel.find((row) => row.id === "funnel-final-rate")?.right).toBe("4.5%");
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
    expect(view).not.toMatch(/error\.stack|\.stack\s*[=:]/);
    expect(view).not.toContain("ENOENT");
  });

  it("visual dashboard keeps Results navigation and real compare fields", () => {
    const view = read("components/rextora/strategySearch/SearchJobCompareView.tsx");
    expect(SEARCH_JOB_COMPARE_PATH).toBe("/strategy-search/compare");
    expect(view).toContain('searchParams.get("left")');
    expect(view).toContain('searchParams.get("right")');
    expect(view).not.toContain("탐색 결과로 돌아가기");
    expect(view).toContain('<Link href={resultsBackHref}>탐색 결과</Link>');
    expect(view).toContain('<Link href={resultsBackHref}>← 탐색 결과</Link>');
    expect(view).not.toContain('data-testid="ss-compare-back-results"');
    expect(view).toContain("/results?jobId=");
    const picker = read("components/rextora/strategySearch/compare/CompareTargetPicker.tsx");
    expect(picker).toContain("기준 결과 보기");
    expect(picker).toContain("비교 결과 보기");
    const hero = read("components/rextora/strategySearch/compare/CompareResultsVisual.tsx");
    const countVisual = read("components/rextora/strategySearch/compare/CompareCountVisual.tsx");
    const rateVisual = read("components/rextora/strategySearch/compare/CompareRateVisual.tsx");
    const timelineView = read("components/rextora/strategySearch/compare/CompareTimelineVisual.tsx");
    const diffs = read("components/rextora/strategySearch/compare/CompareDifferenceVisuals.tsx");
    expect(picker).toContain('data-testid={props.testId}');
    expect(picker).toContain('testId="ss-compare-left"');
    expect(picker).toContain('testId="ss-compare-right"');
    expect(picker).toContain("V3Dialog");
    expect(picker).not.toContain("<select");
    expect(countVisual).toContain("pairRelativeBarWidths");
    expect(rateVisual).toContain("rateScalePosition");
    expect(rateVisual).toContain("rateDifferenceInterval");
    expect(rateVisual).not.toContain("pairRelativeBarWidths");
    expect(timelineView).toContain("sharedPeriodTimeline");
    expect(diffs).toContain("compareFieldInventory");
    expect(diffs).toContain("strategyFamilyZones");
    expect(view).toContain('if (!candidate.present) return "—"');
    expect(view).not.toContain('present ? props.left.scoreLabel : "0"');
    expect(view).toContain('testId="ss-compare-funnel"');
    expect(view).not.toContain("ss-compare-retention-ladder");
    expect(view).not.toContain("RetentionLadder");
    expect(view).not.toContain("ss-compare-core__track");
    expect(view).not.toContain("rateBarWidthPct");
    expect(view).not.toContain("funnelStageBarDisplay");
    expect(view).not.toContain("ss-compare-mirror");
    expect(view).toContain("핵심 결과");
    expect(countVisual).toContain("평가한 전략 수");
    expect(hero).toContain("조건 통과율");
    expect(hero).toContain("최종 적격률");
    expect(hero).toContain("비교 가능한 결과 없음");
    expect(rateVisual).toContain("rateDifferencePercentagePoints");
    expect(rateVisual).toContain("차이 {difference.toFixed(1)}%p");
    expect(hero).not.toMatch(/실패|실행되지|전략이 없습니다/);
    expect(timelineView).toContain("ss-compare-timeline__overlap-band");
    expect(view).toContain('data-testid="ss-compare-nav"');
    expect(view).toContain("ss-compare-nav-slot");
    expect(view).toContain("ss-compare-loaded");
    expect(picker).toContain("ss-compare-target");
    expect(timelineView).toContain("ss-compare-timeline__overlap-swatch");
    expect(view.indexOf('data-testid="ss-compare-nav"')).toBeLessThan(
      view.indexOf('data-testid="ss-compare-body"'),
    );
    expect(diffs).toContain("ss-compare-diff-card__title");
    expect(diffs).toContain("ss-compare-risk-equal");
    expect(diffs).toContain('aria-label={`${props.same}개 동일 · ${props.different}개 다름`}');
    expect(diffs).toContain('testId="ss-compare-risk-counts"');
    expect(diffs).not.toContain('<strong data-testid="ss-compare-risk-counts">');
    expect(view).toContain("openRawCompareDetails");
    expect(timelineView).toContain("일 공통");
    expect(view).toContain('useState<DiffWorkspace | null>(null)');
    expect(diffs).toContain("ss-compare-workspace");
    expect(diffs).toContain("<VisualRows rows={differentSettings} />");
    expect(diffs).toContain("<VisualRows rows={sameSettings} />");
    expect(diffs).toContain("className=\"ss-compare-analysis-row is-shared\"");
    expect(diffs).toContain("formatCompactCompareDate");
    expect(diffs).toContain("isPeriodSetting(row) ? formatCompactCompareDate(row.left) : row.left");
    expect(diffs).toContain("${families.shared.length}개 전략 모두 공통");
    expect(diffs).toContain("${families.leftOnly.length}개 기준 전용 · ${families.shared.length}개 공통 · ${families.rightOnly.length}개 비교 전용");
    expect(diffs).not.toContain("동일 설정도 보기");
    expect(diffs).not.toContain("PAIR SCALE");
    expect(diffs).not.toContain("BASE");
    expect(diffs).not.toContain("COMPARE");
    expect(diffs).not.toContain("SETTINGS");
    expect(diffs).not.toContain("COST / RISK");
    expect(diffs).not.toContain("STRATEGY SET");
    expect(diffs).not.toContain("changed");
    expect(diffs).not.toContain("exclusive");
    expect(diffs).toContain("기준 전용");
    expect(diffs).toContain("비교 전용");
    expect(diffs).toContain("formatCompareFamilyDisplay(name)");
    expect(countVisual).not.toContain("PAIR SCALE");
    expect(countVisual).toContain(">기준</text>");
    expect(countVisual).toContain(">비교</text>");
    expect(timelineView).toContain(">기준</text>");
    expect(timelineView).toContain(">비교</text>");
    expect(picker).toContain("<small>심볼</small>");
    expect(picker).toContain("<small>시간봉</small>");
    expect(picker).toContain("<small>상태</small>");
    expect(picker).not.toContain("SYMBOL");
    expect(picker).not.toContain("TIMEFRAME");
    expect(picker).not.toContain("STATUS");
    expect(hero).toContain(">기준</span>");
    expect(hero).toContain(">비교</span>");
    expect(rateVisual).toContain("[0, 50, 100]");
    expect(rateVisual).toContain("intervalStartX = interval == null ? null : markerX(interval.startPct)");
    expect(rateVisual).toContain("data-rate-position={rate}");
    expect(rateVisual).not.toContain("Math.max(1");
    expect(rateScalePosition("0.0%")).toBe(0);
    expect(rateScalePosition("0.2%")).toBe(0.2);
    expect(rateScalePosition("2.5%")).toBe(2.5);
    expect(rateScalePosition("3.0%")).toBe(3);
    expect(rateScalePosition("—")).toBeNull();
    expect(rateDifferenceInterval("2.5%", "3.0%")).toEqual({ startPct: 2.5, endPct: 3 });
    expect(rateDifferenceInterval("0.2%", "0.5%")).toEqual({ startPct: 0.2, endPct: 0.5 });
    expect(rateDifferenceInterval("—", "0.5%")).toBeNull();
    expect(rateDifferencePercentagePoints("8.1%", "0.8%")).toBeCloseTo(7.3);
    expect(rateDifferencePercentagePoints("6.3%", "0.4%")).toBeCloseTo(5.9);
    expect(rateDifferencePercentagePoints("—", "0.5%")).toBeNull();
    expect(rateDifferencePercentagePoints("0.0%", "0.0%")).toBe(0);
    expect(formatCompactCompareDate("2026. 6. 14. AM 9:00:00")).toBe("2026.06.14 09:00");
    expect(formatCompactCompareDate("2026. 6. 14. PM 12:30:00")).toBe("2026.06.14 12:30");
    expect(formatCompactCompareDate("2026. 6. 14. 오후 9:00:00")).toBe("2026.06.14 21:00");
    expect(formatCompactCompareDate("—")).toBe("—");
    expect(view).not.toContain("ss-compare-disclosure--inline");
    expect(view).not.toContain("RateArc");
    expect(view).not.toContain("ss-compare-donut-");
    expect(view).not.toContain("ScoreVisual");
    expect(view).not.toMatch(/<circle[^>]*ss-compare-donut/);
    expect(view).not.toMatch(/radar/i);
    const css = read("components/rextora/v3/strategy-search.css");
    expect(css).not.toMatch(/radar/i);
    expect(parseDisplayedRate("40.6%")).toBe(40.6);
    expect(parseDisplayedRate("—")).toBeNull();
    const scale = pairRelativeBarWidths("5,080", "80");
    expect(scale.left).toEqual({ missing: false, widthPct: 100 });
    expect(scale.right.widthPct).toBeCloseTo((80 / 5080) * 100);
    expect(scale.right.missing).toBe(false);
    expect(parseDisplayedRate("0.5%")).toBe(0.5);
    expect(parseDisplayedRate("3.8%")).toBe(3.8);
    expect(parseDisplayedRate("0.0%")).toBe(0);
    expect(parseDisplayedRate("—")).toBeNull();
    const zeroRate = pairRelativeBarWidths("0.0%", "1.3%");
    expect(zeroRate.left).toEqual({ missing: false, widthPct: 0 });
    expect(zeroRate.right.widthPct).toBe(100);
    const missing = pairRelativeBarWidths("—", "1.3%");
    expect(missing.left.missing).toBe(true);
    expect(missing.left.widthPct).toBe(0);
    expect(missing.right.missing).toBe(false);
    expect(compareFieldInventory([
      { tone: "same" },
      { tone: "different" },
      { tone: "same" },
    ])).toEqual({ same: 2, different: 1 });
    expect(strategyFamilyZones("오더블록, 갭", "갭, 추세선")).toEqual({
      leftOnly: ["오더블록"],
      shared: ["갭"],
      rightOnly: ["추세선"],
    });
    const timeline = sharedPeriodTimeline({
      leftStart: "2024. 1. 1. 오전 12:00:00",
      leftEnd: "2024. 1. 11. 오전 12:00:00",
      rightStart: "2024. 1. 6. 오전 12:00:00",
      rightEnd: "2024. 1. 16. 오전 12:00:00",
    });
    expect(timeline?.overlap).not.toBeNull();
    expect(timeline?.overlap?.startPct).toBeGreaterThan(0);
    const noOverlap = sharedPeriodTimeline({
      leftStart: "2024. 1. 1. 오전 12:00:00",
      leftEnd: "2024. 1. 5. 오전 12:00:00",
      rightStart: "2024. 2. 1. 오전 12:00:00",
      rightEnd: "2024. 2. 5. 오전 12:00:00",
    });
    expect(noOverlap?.overlap).toBeNull();
    expect(view).toContain("정확한 상세 데이터 보기");
    expect(timelineView).toContain("처리 ");
    expect(view).not.toMatch(/<details[^>]*\sopen/);
    expect(view).not.toContain("InventoryRing");
    expect(view).not.toContain("ss-compare-inventory");
    expect(view).toContain("ss-compare-settings");
    expect(view).toContain('CompareSection title="탐색 설정"');
    expect(view).toContain("ss-compare-cost");
    expect(view).not.toMatch(/승자|패자|우수|열등|더 좋음/);
    expect(view).not.toContain("winner");
    expect(css).toContain("ss-compare-svg-grow");
    expect(css).toContain("ss-compare-rate-grow");
    expect(css).not.toContain(".ss-compare-core__track");
    expect(css).not.toContain(".ss-compare-vbar");
    expect(css).toContain("--ss-compare-sticky-top: 62px");
    expect(css).toContain("position: fixed");
    expect(css).toContain("top: var(--ss-compare-sticky-top)");
    expect(css).toContain("left: 242px");
    expect(css).toContain("scroll-margin-top: var(--ss-compare-scroll-margin");
    expect(css).toContain("strategy-search-compare-page");
    expect(css).toContain("max-width: 1220px");
    expect(css).toContain("overflow: visible");
    expect(css).toContain("ss-compare-reveal-opacity");
    expect(css).toContain(".ss-compare-timeline__bridge");
    expect(css).toMatch(/\.ss-compare-timeline__bar-row[\s\S]*z-index: 1/);
    expect(css).toMatch(/\.ss-compare-timeline__bridge[\s\S]*z-index: 0/);
    expect(css).toContain("scaleX(0)");
    expect(css).not.toContain("ss-compare-vbar__track");
    expect(css).not.toContain("ss-compare-core-card__track");
    expect(css).toContain("prefers-reduced-motion");
    expect(view).toContain("label: \"핵심 비교\"");
    expect(view).toContain("label: \"분석 기간\"");
    expect(view).toContain("label: \"주요 차이\"");
    expect(view).toContain("label: \"상세 데이터\"");
    const navIds = ["ss-compare-core", "ss-compare-period", "ss-compare-diff", "ss-compare-details"];
    const navBlock = view.slice(view.indexOf("const COMPARE_NAV"), view.indexOf("function openRawCompareDetails"));
    expect(navBlock.indexOf('id: "ss-compare-core"')).toBeLessThan(navBlock.indexOf('id: "ss-compare-period"'));
    expect(navBlock.indexOf('id: "ss-compare-period"')).toBeLessThan(navBlock.indexOf('id: "ss-compare-diff"'));
    expect(navBlock.indexOf('id: "ss-compare-diff"')).toBeLessThan(navBlock.indexOf('id: "ss-compare-details"'));
    for (const id of navIds) expect(view).toContain(`id="${id}"`);
    expect(view).toContain('href={`#${item.id}`');
    expect(view).toContain("selectActiveCompareSection");
    expect(view).toContain("nav.getBoundingClientRect().bottom");
    expect(view).toContain("anchorNavigationRef.current = true");
    expect(view).not.toContain("intersectionRatio");
    expect(view).not.toContain('rootMargin: "-15% 0px -15% 0px"');
    expect(selectActiveCompareSection([
      { id: "ss-compare-core", top: 575 },
      { id: "ss-compare-period", top: 1332 },
      { id: "ss-compare-diff", top: 1838 },
      { id: "ss-compare-details", top: 2210 },
    ], 560)).toBe("ss-compare-core");
    expect(selectActiveCompareSection([
      { id: "ss-compare-core", top: -644 },
      { id: "ss-compare-period", top: 260 },
      { id: "ss-compare-diff", top: 765 },
      { id: "ss-compare-details", top: 1137 },
    ], 116)).toBe("ss-compare-period");
    expect(selectActiveCompareSection([
      { id: "ss-compare-core", top: -736 },
      { id: "ss-compare-period", top: 22 },
      { id: "ss-compare-diff", top: 527 },
      { id: "ss-compare-details", top: 899 },
    ], 116)).toBe("ss-compare-diff");
    expect(selectActiveCompareSection([
      { id: "ss-compare-core", top: 575 },
      { id: "ss-compare-period", top: 1332 },
      { id: "ss-compare-diff", top: 1838 },
      { id: "ss-compare-details", top: 2210 },
    ], 116, true)).toBe("ss-compare-details");
    expect(selectActiveCompareSection([], 116)).toBeNull();
    expect(view).toContain("/results?jobId=${encodeURIComponent(model.left.jobId)}");
    expect(view).toContain("/results?jobId=${encodeURIComponent(model.right.jobId)}");
  });

  it("R/S: mobile overflow and reduced motion are honored", () => {
    const css = read("components/rextora/v3/strategy-search.css");
    expect(css).toContain(".ss-compare");
    expect(css).toContain("overflow-x: hidden");
    expect(css).toContain("@media (max-width: 767px)");
    expect(css).toContain("prefers-reduced-motion");
    expect(css).toContain(".ss-compare-body");
    expect(css).toContain(".ss-compare-row");
    expect(css).toContain(".ss-compare-diff-selectors button:focus-visible");
    expect(css).toContain(".ss-compare-diff-selectors button.is-selected:focus-visible");
    expect(css).toMatch(/button\.is-selected:focus-visible \{[^}]*border-width: 3px;[^}]*outline: none;/);
    expect(css).not.toContain("box-shadow: 0 0 0 1px color-mix(in srgb, var(--v3-brand) 18%, transparent);");
    expect(css).toContain("overflow-wrap: anywhere;");
    expect(css).toContain("white-space: normal;");
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

  it("U: picker rows use list-backed metrics and authoritative UTC period fields", () => {
    const picker = read(
      "components/rextora/strategySearch/compare/CompareTargetPicker.tsx",
    );
    const view = read("components/rextora/strategySearch/SearchJobCompareView.tsx");
    const clientTypes = read("components/rextora/strategySearch/types.ts");
    const service = read("src/lib/rextora/strategySearch/jobApiService.ts");
    expect(clientTypes).toContain("analysisStartUtc: string | null");
    expect(clientTypes).toContain("analysisEndUtc: string | null");
    expect(service).toContain("analysisStartUtc: completedAnalysisContext?.evaluationStartUtc ?? null");
    expect(service).toContain("analysisEndUtc: completedAnalysisContext?.evaluationEndUtc ?? null");
    expect(service).toContain("buildCompletedAnalysisContextApi(");
    expect(picker).toContain("job.analysisStartUtc");
    expect(picker).toContain("job.analysisEndUtc");
    expect(picker).toContain('otherBadgeLabel="현재 기준 탐색"');
    expect(picker).toContain('otherBadgeLabel="현재 비교 탐색"');
    expect(picker).toContain("props.otherBadgeLabel");
    expect(picker).toContain("const otherSelected = job.id === props.otherId");
    expect(picker).toContain("const totalSeconds = Math.round(ms / 1000)");
    expect(picker).toContain("const seconds = totalSeconds % 60");
    expect(picker).not.toContain("formatMs(job.elapsedMs)");
    expect(picker).not.toContain("getStrategySearchJob(");
    expect(picker).not.toContain("fetchResearchResultsSummary(");
    expect(view).toContain("listStrategySearchJobs({ limit: 100");
    expect(view).toContain("jobs={comparable}");
  });

  it("V: picker pass rate is gate-passed over evaluated, with safe unavailable handling", () => {
    const picker = read(
      "components/rextora/strategySearch/compare/CompareTargetPicker.tsx",
    );
    expect(picker).toContain("safeRate(job.gatePassedCount, job.evaluatedCount)");
    expect(safeRate(12, 40)).toBe(0.3);
    expect(safeRate(null, 40)).toBeNull();
    expect(safeRate(12, 0)).toBeNull();
    expect(picker).toContain('gatePassRate(job) ?? "확인 불가"');
    expect(picker).toContain("formatCount(job.evaluatedCount)");
    expect(picker).toContain("formatCount(job.gatePassedCount)");
    expect(picker).toContain("formatCount(job.qualifiedCount)");
    expect(picker).toContain("적격 후보");
    expect(picker).not.toContain("최종 추천");
  });

  it("W: best performance is labeled as candidate-level and unavailable values are omitted", () => {
    const picker = read(
      "components/rextora/strategySearch/compare/CompareTargetPicker.tsx",
    );
    expect(picker).toContain("최고 후보");
    expect(picker).toContain("최고 후보 수익률");
    expect(picker).toContain("최고 후보 MDD");
    expect(picker).toContain("formatPercent(job.bestReturn)");
    expect(picker).toContain("formatPercent(job.bestMdd)");
    expect(picker).toContain("formatPercent(job.bestReturn) != null || formatPercent(job.bestMdd) != null");
    expect(picker).not.toMatch(/검색\s*(수익|MDD)|탐색\s*(수익|MDD)|winRate|profitFactor|winner/i);
  });

  it("X: picker cards retain keyboard selection and one-shot reduced-motion-safe entrance", () => {
    const picker = read(
      "components/rextora/strategySearch/compare/CompareTargetPicker.tsx",
    );
    const css = read("components/rextora/v3/strategy-search.css");
    expect(picker).toContain('<button');
    expect(picker).toContain('type="button"');
    expect(picker).toContain('className="ss-compare-picker__search"');
    expect(picker).toContain('is-selected');
    expect(css).toContain("@keyframes ss-compare-picker-row-in");
    expect(css).toMatch(/animation: ss-compare-picker-row-in 220ms ease-out both/);
    expect(css).toContain(".ss-compare-picker__row:hover:not(:disabled)");
    expect(css).toContain(".ss-compare-picker__row.is-selected");
    expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\)[\s\S]*ss-compare-picker__row[\s\S]*animation: none !important/);
    expect(css).not.toMatch(/ss-compare-picker-row-in[^;]*infinite/);
  });

  it("Y: selected base and comparison jobs have role-specific accessible badges", () => {
    const picker = read(
      "components/rextora/strategySearch/compare/CompareTargetPicker.tsx",
    );
    expect(picker).toContain('selectedBadgeLabel="현재 기준 탐색"');
    expect(picker).toContain('selectedBadgeLabel="현재 비교 탐색"');
    expect(picker).toContain('otherBadgeLabel="현재 기준 탐색"');
    expect(picker).toContain('otherBadgeLabel="현재 비교 탐색"');
    expect(picker).toContain("const otherSelected = job.id === props.otherId");
    expect(picker).toContain("selectedId={props.value}");
    expect(picker).toContain("const selected = job.id === props.selectedId");
    expect(picker).toContain('aria-current={selected ? "true" : undefined}');
    expect(picker).toContain("{selected ? (");
    expect(picker).toContain("{props.selectedBadgeLabel}");
    expect(picker).toContain('className={`ss-compare-picker__row${selected ? " is-selected" : ""}`}');
    expect(picker).not.toContain("<span>{job.id}</span>");
  });

  it("Z: picker metric cues stay factual and never imply a winning search", () => {
    const picker = read(
      "components/rextora/strategySearch/compare/CompareTargetPicker.tsx",
    );
    for (const cue of ["📅", "🔎", "✅", "🎯", "🏅", "⏱", "📈", "🛡️"]) {
      expect(picker).toContain(cue);
    }
    for (const label of [
      "분석 기간 · UTC",
      "평가 전략",
      "게이트 통과",
      "통과율",
      "적격 후보",
      "소요 시간",
      "최고 후보 수익률",
      "최고 후보 MDD",
    ]) {
      expect(picker).toContain(label);
    }
    expect(picker).not.toMatch(/승자|패자|더 좋음|더 우수|winner|better/i);
    expect(picker).not.toMatch(/검색\s*(수익|MDD)|탐색\s*(수익|MDD)/);
  });

  it("AA: compare cards and metric cues use authoritative summary data without extra requests", () => {
    const picker = read("components/rextora/strategySearch/compare/CompareTargetPicker.tsx");
    const count = read("components/rextora/strategySearch/compare/CompareCountVisual.tsx");
    const rates = read("components/rextora/strategySearch/compare/CompareResultsVisual.tsx");
    expect(picker).toMatch(/ss-compare-selectors__swap[\s\S]*?<svg[\s\S]*?ss-compare-selectors__arrow is-left[\s\S]*?ss-compare-selectors__arrow is-right/);
    expect(picker).not.toMatch(/ss-compare-selectors__swap[^>]*>[\s\S]*?>\s*(대|VS|비교)\s*</);
    for (const field of [
      "job.analysisStartUtc", "job.analysisEndUtc", "job.evaluatedCount",
      "job.gatePassedCount", "job.qualifiedCount", "job.elapsedMs",
    ]) expect(picker).toContain(field);
    expect(picker).toContain("<SelectedJobSummary job={selected} funnel={props.funnel} />");
    expect(picker).not.toContain("getStrategySearchJob(");
    expect(picker).not.toContain("fetchResearchResultsSummary(");
    expect(count).toContain("이번 탐색에서 평가한 후보 수입니다.");
    expect(rates).toContain("조건 통과 후보 수를 평가 후보 수로 나눈 비율입니다.");
    expect(rates).toContain("최종 적격 기준에 해당하는 후보 비율입니다.");
  });

  it("AD: top cards reuse final funnel rows and never substitute plan qualifiedCount", () => {
    const picker = read("components/rextora/strategySearch/compare/CompareTargetPicker.tsx");
    const view = read("components/rextora/strategySearch/SearchJobCompareView.tsx");
    const compare = read("components/rextora/strategySearch/searchJobComparison.ts");
    const summaryCard = picker.slice(picker.indexOf("function SelectedJobSummary"), picker.indexOf("function JobPickDialog"));
    expect(compare).toContain("leftCounts.stageFinalRecommendable");
    expect(compare).toContain("rightCounts.stageFinalRecommendable");
    expect(compare).toContain("safeRate(\n              leftCounts.stageFinalRecommendable,");
    expect(compare).toContain("safeRate(\n              rightCounts.stageFinalRecommendable,");
    expect(view).toContain('value("funnel-final")');
    expect(view).toContain('value("funnel-final-rate")');
    expect(view.match(/fetchResearchResultsSummary\(/g)).toHaveLength(2);
    expect(view).not.toContain("fetchStrategySearchJobResults");
    expect(summaryCard).toContain("props.funnel?.finalEligibleCount");
    expect(summaryCard).toContain("props.funnel?.finalEligibleRate");
    expect(summaryCard).not.toContain("job.qualifiedCount");
    expect(summaryCard).not.toContain("job.gatePassedCount");
    expect(summaryCard).toContain('?? "—"');
    expect(summaryCard).toContain("최종 적격");
    expect(summaryCard).not.toContain("적격 후보");
    expect(summaryCard).not.toMatch(/qualifiedCount|finalRecommendable\s*\?\?/);
  });

  it("AB: previews only actual differences and states risk/family counts explicitly", () => {
    const diffs = read("components/rextora/strategySearch/compare/CompareDifferenceVisuals.tsx");
    const css = read("components/rextora/v3/strategy-search.css");
    expect(diffs).toContain('props.settings.filter((row) => row.tone === "different")');
    expect(diffs).toContain("differentSettings.slice(0, 3)");
    expect(diffs).toContain('isPeriodSetting(row) ? formatCompactCompareDate(row.left) : row.left');
    expect(diffs).toContain("+ {settingsPreviewMore}개 더 보기");
    expect(diffs).toContain('aria-label={`${props.same}개 동일 · ${props.different}개 다름`}');
    expect(diffs).toContain('families.leftOnly.length + families.shared.length + families.rightOnly.length');
    expect(diffs).not.toContain("거의 차이");
    expect(diffs).not.toContain("전용 전략 {familyDiffCount}개");
    expect(css).not.toContain("@keyframes ss-compare-arrows-enter");
    expect(css).toContain(".ss-compare-selectors__arrow {\n  animation: none;");
    expect(css).toContain("pointer-events: none;");
    expect(css).toContain("@keyframes ss-compare-summary-reveal");
    expect(css).toContain("@keyframes ss-compare-setting-reveal");
    expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\)[\s\S]*ss-compare-setting-preview__row[\s\S]*animation: none !important/);
    expect(css).not.toMatch(/ss-compare-(?:arrows-enter|summary-reveal|setting-reveal)[^;]*infinite/);
  });

  it("AC: timeline keeps its structure and improves endpoint/overlap/processing-time readability", () => {
    const timeline = read("components/rextora/strategySearch/compare/CompareTimelineVisual.tsx");
    const css = read("components/rextora/v3/strategy-search.css");
    expect(timeline).toContain('data-testid="ss-compare-timeline"');
    expect(timeline).toContain('className="ss-compare-timeline__overlap-band"');
    expect(timeline).toContain("overlapCenter - 54");
    expect(timeline).toContain("overlapLabelX + 54");
    expect(timeline).toContain("leftX + 8");
    expect(timeline).toContain("leftX + leftWidth - 8");
    expect(timeline).toContain('data-testid="ss-compare-duration"');
    expect(timeline).toContain("처리 시간");
    expect(css).toContain(".ss-compare-timeline-figure {\n  row-gap: 10px;");
  });

  it("AE: detailed settings show every difference first and disclose actual identical rows", () => {
    const diffs = read("components/rextora/strategySearch/compare/CompareDifferenceVisuals.tsx");
    const view = read("components/rextora/strategySearch/SearchJobCompareView.tsx");
    const css = read("components/rextora/v3/strategy-search.css");
    const right = job("job_b");
    right.appliedSearchSummary = {
      ...right.appliedSearchSummary!,
      sections: right.appliedSearchSummary!.sections.map((section) => ({
        ...section,
        rows: section.rows.map((item) => item.labelKo === "심볼"
          ? { ...item, valueKo: "ETHUSDT" }
          : item),
      })),
    };
    const built = buildSearchJobComparison({
      leftJob: job("job_a"),
      rightJob: right,
      leftSummary: summary(),
      rightSummary: summary({ jobId: "job_b" }),
    });
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    const different = built.model.settings.filter((row) => row.tone === "different");
    const identical = built.model.settings.filter((row) => row.tone === "same");
    expect(different.some((row) => row.id === "setting-심볼")).toBe(true);
    expect(identical.length).toBeGreaterThan(0);
    expect(diffs).toContain('props.settings.filter((row) => row.tone === "different")');
    expect(diffs).toContain('props.settings.filter((row) => row.tone === "same")');
    expect(diffs).toContain("<VisualRows rows={differentSettings} />");
    expect(diffs).toContain("동일한 설정 {sameSettings.length}개 보기");
    expect(diffs).toContain("동일한 설정 접기");
    expect(diffs).toContain("<VisualRows rows={sameSettings} />");
    expect(diffs).not.toMatch(/<details[^>]*\bopen/);
    expect(diffs).toContain('aria-controls="ss-compare-identical-settings-rows"');
    expect(diffs).toContain('role="region"');
    expect(diffs).toContain('aria-labelledby="ss-compare-identical-settings-summary"');
    expect(css).toContain(".ss-compare-identical-settings > summary:focus-visible");
    expect(css).not.toContain("ss-compare-identical-settings__rows { animation");
    expect(view).toContain("rows={model.settings}");
    expect(view).toContain("rows={model.costRisk}");
    expect(view).toContain("정확한 상세 데이터 보기");
  });

  it("AF: target cards use honest empty copy, inset accents, and a quiet noninteractive marker", () => {
    const picker = read("components/rextora/strategySearch/compare/CompareTargetPicker.tsx");
    const view = read("components/rextora/strategySearch/SearchJobCompareView.tsx");
    const css = read("components/rextora/v3/strategy-search.css");
    expect(picker).toContain('emptyCopy="기준으로 사용할 탐색을 선택하세요"');
    expect(picker).toContain('emptyCopy="비교할 탐색을 선택하세요"');
    expect(picker).toContain('{selected ? "변경" : "탐색 선택"}');
    expect(picker).toContain("{selected ? <SelectedJobSummary job={selected} funnel={props.funnel} /> : null}");
    expect(view).toContain('leftFallbackName={leftId ? model?.left.searchName ?? null : null}');
    expect(view).toContain('rightFallbackName={rightId ? model?.right.searchName ?? null : null}');
    expect(view).not.toContain("선택한 기준 탐색");
    const markerAt = picker.indexOf('data-testid="ss-compare-static-marker"');
    const marker = picker.slice(picker.lastIndexOf("<span", markerAt), picker.indexOf("</span>", markerAt) + 7);
    expect(marker).toContain('aria-hidden="true"');
    expect(marker).not.toContain("onClick");
    expect(picker).not.toContain("onSwap");
    const accentRule = css.match(/\.v3-strategy-search \.ss-compare-target \{\n  position: relative;[\s\S]*?\n\}/)?.[0] ?? "";
    expect(accentRule).toContain("border-radius: 18px;");
    expect(accentRule).toContain("--ss-compare-target-accent");
    expect(accentRule).toContain("left / 3px 100% no-repeat");
    expect(css).toContain(".v3-strategy-search .ss-compare-target:nth-of-type(2) {\n  --ss-compare-target-accent: color-mix(in srgb, var(--v3-brand)");
    expect(css).not.toContain(".ss-compare-target::before");
    expect(css).toContain(".ss-compare-selectors__swap {\n  width: 44px;\n  height: 44px;\n  border-color: transparent;");
  });

  it("AG: compare maps internal terminology for display without changing authoritative values or identities", () => {
    const depthProfiles = read("src/lib/rextora/strategySearch/operatorProfiles.ts");
    const compareView = read("components/rextora/strategySearch/SearchJobCompareView.tsx");
    const left = job("job_a");
    const right = job("job_b");
    right.appliedSearchSummary = {
      ...right.appliedSearchSummary!,
      sections: right.appliedSearchSummary!.sections.map((section) => ({
        ...section,
        rows: section.rows.map((item) => item.labelKo === "깊이 프로필"
          ? { ...item, valueKo: "deep" }
          : item),
      })),
    };
    for (const candidate of [left, right]) {
      candidate.appliedSearchSummary!.sections.push({
        id: "strategy_scope",
        titleKo: "전략 범위",
        rows: [{ labelKo: "활성 전략 패밀리", valueKo: "EMA / 추세 추종, 통합 SafeV44 (전체 파라미터)" }],
      });
    }
    const baseSummary = summary();
    const legacyPatternGroup = {
      ...baseSummary.rankingGroups[0]!,
      rankingCompatibilityGroup: GROUP_PATTERN,
      engineCostModel: GROUP_PATTERN,
    };
    const built = buildSearchJobComparison({
      leftJob: left,
      rightJob: right,
      leftSummary: summary({ rankingGroups: [...baseSummary.rankingGroups, legacyPatternGroup] }),
      rightSummary: summary({ jobId: "job_b", rankingGroups: [...baseSummary.rankingGroups, legacyPatternGroup] }),
    });

    expect(depthProfiles).toContain('id: "deep"');
    expect(depthProfiles).toContain('labelKo: "심층 탐색"');
    expect(depthProfiles).toContain('descriptionKo: "더 넓은 범위를 오래 검증합니다."');
    expect(formatCustomerSearchValue("deep")).toBe("심층 탐색");
    expect(right.appliedSearchSummary?.sections
      .flatMap((section) => section.rows)
      .find((item) => item.labelKo === "깊이 프로필")?.valueKo).toBe("deep");
    expect(built.ok).toBe(true);
    if (!built.ok) return;

    expect(built.model.settings.find((item) => item.id === "setting-깊이 프로필")?.right)
      .toBe("심층 탐색");
    const safeGroup = built.model.groups.find((group) => group.groupId === GROUP_SAFE);
    expect(safeGroup?.groupId).toBe("safe_execution_price_v1");
    expect(safeGroup?.groupLabel).toBe("보수적 체결가 평가 그룹");
    expect(safeGroup?.groupLabel).not.toBe("SAFE 전략");
    expect(compareView).toContain("{group.groupLabel}");
    expect(compareView).toContain("data-testid={`ss-compare-group-${group.groupId}`}");
    expect(safeGroup?.groupLabel).not.toContain(safeGroup.groupId);
    expect(safeGroup?.leftRecommended.scoreLabel).not.toContain("raw_a");
    expect(formatCustomerSearchValue("SafeV44")).toBe("SafeV44");
    expect(formatCompareFamilyDisplay("통합 SafeV44 (전체 파라미터)")).toBe("통합 기술 전략");
    expect(formatCompareFamilyDisplay("EMA / 추세 추종, 통합 SafeV44 (전체 파라미터)"))
      .toBe("EMA / 추세 추종, 통합 기술 전략");
    expect(built.model.settings.find((item) => item.id === "setting-활성 전략 패밀리")?.right)
      .toContain("통합 SafeV44 (전체 파라미터)");

    const patternGroup = built.model.groups.find((group) => group.groupId === GROUP_PATTERN);
    expect(patternGroup?.groupLabel).toBe("패턴·기존 비용 산정 평가 그룹");
  });

  it("AH: minimum return is a pass-policy threshold, not realized performance", () => {
    const persisted = read("src/lib/rextora/strategySearch/persistedSearchSummary.ts");
    const policy = read("src/lib/rextora/strategySearch/evaluationPolicy.ts");
    const left = job("job_a");
    const right = job("job_b");
    left.appliedSearchSummary!.sections.find((section) => section.id === "validation")!.rows.push({
      labelKo: "최소 수익",
      valueKo: "0.00%",
    });
    right.appliedSearchSummary!.sections.find((section) => section.id === "validation")!.rows.push({
      labelKo: "최소 수익",
      valueKo: "19.68%",
    });
    const built = buildSearchJobComparison({
      leftJob: left,
      rightJob: right,
      leftSummary: summary(),
      rightSummary: summary({ jobId: "job_b" }),
    });

    expect(persisted).toContain("?.minTotalReturn ?? null");
    expect(policy).toContain('checkMin("totalReturn", thresholds.minTotalReturn, "MIN_TOTAL_RETURN")');
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    const row = built.model.costRisk.find((item) => item.id === "cost-최소 수익");
    expect(row).toEqual({
      id: "cost-최소 수익",
      label: "최소 수익 기준",
      left: "0.00%",
      right: "19.68%",
      tone: "different",
    });
  });
});
