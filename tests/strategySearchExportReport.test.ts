import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  GROUP_PATTERN_CANONICAL,
  GROUP_SAFE,
} from "../src/lib/rextora/researchRankingReadModel";
import {
  EXPORT_DISCLAIMER,
  EXPORT_DOCUMENT_TITLE,
  EXPORT_INELIGIBLE_COPY,
  SEARCH_JOB_REPORT_PATH,
  buildExportFilename,
  buildSearchJobExport,
  buildSearchReportHref,
  csvEscape,
  customerExportContainsInternalFields,
  isExportEligibleStatus,
  serializeCustomerExportCsv,
  serializeCustomerExportJson,
  toCustomerExportJson,
} from "../components/rextora/strategySearch/searchJobExport";
import type {
  ResearchResultCardView,
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

function card(
  extra: Partial<ResearchResultCardView> = {},
): ResearchResultCardView {
  return {
    iteration: 2,
    candidateId: "hidden_candidate",
    paramsHash: "hidden_params_hash",
    readableName: "균형 되돌림",
    displayAlias: "균형 되돌림",
    strategyFamily: "rsi_pullback",
    symbol: "BTCUSDT",
    timeframe: "15m",
    sourceResearchJobId: "job_hidden",
    netReturn: 0.12,
    maxDrawdown: -0.08,
    tradeCount: 24,
    profitFactor: 1.4,
    totalCost: 0.01,
    costStatus: "비용 스트레스 통과",
    sampleConfidence: "충분",
    sampleConfidenceDetail: "",
    score: 1.4,
    stressPassed: true,
    jitterPassed: true,
    robustnessStatus: "",
    overfittingRisk: "",
    eligibilityStatus: "",
    recommendable: true,
    finalRecommendable: true,
    roles: [],
    registrationState: "미등록",
    registeredStrategyId: null,
    clusterId: "cluster_hidden",
    isRepresentative: true,
    memberCount: 1,
    strongestPoint: "",
    primaryWeakness: "",
    recommendationReason: "자격과 비용 가정을 함께 통과했습니다",
    ...extra,
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
    topRecommend: card(),
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
    top10: [card()],
    top10RankChanges: [],
    clusters: [],
    representatives: [],
    selectionSummary: {
      whyTopSelected: ["통과 후보 중 비용 가정을 지킨 대표입니다."],
      whyExcluded: [],
      overfittingNote: "",
      costSensitivityNote: "",
      drawdownRiskNote: "",
      tradeConfidenceNote: "",
      nextActions: ["결과에서 등록 또는 백테스트를 선택합니다."],
    },
    provenanceNote: "",
    ...overrides,
  };
}

function job(
  id: string,
  extra: Partial<StrategySearchJobDetail> = {},
): StrategySearchJobDetail {
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
    seed: 42,
    searchName: "BTC 표준 탐색",
    config: {
      searchVersion: "1",
      strategyTemplateId: "template_search_base",
      symbols: ["BTCUSDT"],
      timeframe: "15m",
      dataVersion: "v1",
      seed: 42,
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
      developerPayload: { randomState: 1, runnerPayload: true },
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
          id: "period",
          titleKo: "탐색 기간",
          rows: [
            { labelKo: "분석 구간 시작", valueKo: "2025-01-01" },
            { labelKo: "분석 구간 종료", valueKo: "2025-06-01" },
          ],
        },
        {
          id: "engine",
          titleKo: "탐색 엔진",
          rows: [
            { labelKo: "깊이 프로필", valueKo: "balanced" },
            { labelKo: "탐색 이름", valueKo: "BTC 표준 탐색" },
            { labelKo: "시드", valueKo: "42" },
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
            { labelKo: "최소 수익", valueKo: "0.00%" },
            { labelKo: "합격 프로필", valueKo: "balanced" },
          ],
        },
        {
          id: "risk",
          titleKo: "위험 설정",
          rows: [
            { labelKo: "최대 낙폭 기준", valueKo: "25.00%" },
            { labelKo: "레버리지 모드", valueKo: "automatic" },
          ],
        },
      ],
    },
    ...extra,
  } as StrategySearchJobDetail;
}

describe("Strategy Search export / report", () => {
  it("A/B: export uses results-summary + job detail, not trial files", () => {
    const src = read("components/rextora/strategySearch/searchJobExport.ts");
    expect(src).toContain("ResearchResultsSummaryView");
    expect(src).toContain("appliedSearchSummary");
    expect(src).not.toContain("listSearchTrials");
    expect(src).not.toContain("/trials");
    expect(src).not.toContain("raw-trials");
    const built = buildSearchJobExport({
      job: job("job_a"),
      summary: summary(),
      generatedAt: "2026-01-01T02:00:00.000Z",
    });
    expect(built.ok).toBe(true);
  });

  it("C/D: JSON has customer fields and excludes internals", () => {
    const built = buildSearchJobExport({
      job: job("job_a"),
      summary: summary(),
      generatedAt: "2026-01-01T02:00:00.000Z",
    });
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    const json = toCustomerExportJson(built.model);
    const text = serializeCustomerExportJson(built.model);
    expect(json.문서).toBe(EXPORT_DOCUMENT_TITLE);
    expect((json["기본 정보"] as { 시장: string }).시장).toBe("BTCUSDT");
    expect(text).toContain("평가 후보");
    expect(text).toContain("비용 · 위험 가정");
    expect(customerExportContainsInternalFields(json)).toBe(false);
    expect(text).not.toMatch(/paramsHash|strategyHash|checkpoint|developerPayload|randomState|jobId|seed|clusterId|candidateId/);
    expect(text).not.toContain("42");
  });

  it("E/F/G: CSV uses Korean labels, escapes values, and starts with UTF-8 BOM", () => {
    expect(csvEscape("a,b")).toBe('"a,b"');
    expect(csvEscape('say "hi"')).toBe('"say ""hi"""');
    expect(csvEscape("line\nbreak")).toBe('"line\nbreak"');
    const built = buildSearchJobExport({
      job: job("job_a"),
      summary: summary({
        topRecommend: card({
          recommendationReason: '사유, "중요"\n다음 줄',
        }),
      }),
    });
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    const csv = serializeCustomerExportCsv(built.model);
    expect(csv.startsWith("\uFEFF")).toBe(true);
    expect(csv).toContain("[기본 정보]");
    expect(csv).toContain("평가 후보");
    expect(csv).toContain("전략군");
    expect(csv).toContain('"사유, ""중요""\n다음 줄"');
  });

  it("H/I: ranking keeps recommended vs raw best and does not cross-compare groups", () => {
    const built = buildSearchJobExport({
      job: job("job_a"),
      summary: summary({
        rankingGroups: [
          {
            rankingCompatibilityGroup: GROUP_SAFE,
            engineCostModel: GROUP_SAFE,
            rankingEligible: true,
            bestCandidate: {
              candidateId: "c1",
              iteration: 1,
              paramsHash: "raw_a",
              score: 9.9,
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
          {
            rankingCompatibilityGroup: GROUP_PATTERN_CANONICAL,
            engineCostModel: GROUP_PATTERN_CANONICAL,
            rankingEligible: true,
            bestCandidate: {
              candidateId: "p1",
              iteration: 3,
              paramsHash: "raw_b",
              score: 4.4,
              passed: true,
            },
            bestPassedCandidate: {
              candidateId: "p2",
              iteration: 4,
              paramsHash: "pass_b",
              score: 3.1,
              passed: true,
            },
            topCandidates: [],
          },
        ],
      }),
    });
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    expect(built.model.groups).toHaveLength(2);
    expect(built.model.groups[0]?.recommended?.recommended).toBe(true);
    expect(built.model.groups[0]?.rawBest?.passed).toBe(false);
    expect(built.model.groups[0]?.rawBest?.status).toBe("자격 미통과");
    const src = read("components/rextora/strategySearch/searchJobExport.ts");
    expect(src).not.toContain("sort((a, b) =>");
    expect(src).toContain("rankingCompatibilityGroup");
  });

  it("J: cost/risk assumptions are included", () => {
    const built = buildSearchJobExport({
      job: job("job_a"),
      summary: summary(),
    });
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    expect(built.model.costRisk.map((row) => row.label)).toEqual(
      expect.arrayContaining(["수수료", "슬리피지", "비용 스트레스", "최대 낙폭 기준"]),
    );
  });

  it("K: old retained job is exportable via jobId APIs", () => {
    const src = read("components/rextora/strategySearch/searchJobExport.ts");
    expect(src).toContain("getStrategySearchJob(jobId)");
    expect(src).toContain("fetchResearchResultsSummary(jobId");
    expect(src).not.toContain("listStrategySearchJobs");
  });

  it("L/M: deleted/unavailable and non-completed jobs do not export", () => {
    expect(isExportEligibleStatus("completed")).toBe(true);
    expect(isExportEligibleStatus("failed")).toBe(false);
    expect(isExportEligibleStatus("cancelled")).toBe(false);
    const failed = buildSearchJobExport({
      job: job("job_fail", { status: "failed" }),
      summary: summary(),
    });
    expect(failed.ok).toBe(false);
    if (failed.ok) return;
    expect(failed.error).toBe(EXPORT_INELIGIBLE_COPY);
    const exportSrc = read("components/rextora/strategySearch/searchJobExport.ts");
    const menu = read("components/rextora/strategySearch/SearchJobExportMenu.tsx");
    expect(exportSrc).toContain("선택한 탐색을 찾을 수 없습니다");
    expect(menu).toContain("if (!loaded.ok)");
    expect(menu).toContain("serializeCustomerExportJson(loaded.model)");
  });

  it("N/O: export menu is secondary and reused on Results", () => {
    const completion = read(
      "components/rextora/strategySearch/ResearchCompletionPanel.tsx",
    );
    const results = read("components/rextora/results/ResultsWorkbench.tsx");
    expect(completion).toContain("ss-completion-actions--secondary");
    expect(completion).toContain("<SearchJobExportMenu");
    expect(
      completion.indexOf("ss-completion-actions--secondary"),
    ).toBeLessThan(completion.indexOf("<SearchJobExportMenu"));
    expect(results).toContain("SearchJobExportMenu");
    expect(results).toContain('from "@/components/rextora/strategySearch/SearchJobExportMenu"');
  });

  it("P/Q/R: print report has required sections and hides chrome/internal fields", () => {
    const print = read(
      "components/rextora/strategySearch/SearchJobPrintReport.tsx",
    );
    const css = read("components/rextora/v3/strategy-search.css");
    expect(print).toContain("EXPORT_DOCUMENT_TITLE");
    expect(read("components/rextora/strategySearch/searchJobExport.ts")).toContain(
      EXPORT_DOCUMENT_TITLE,
    );
    expect(print).toContain("1. 탐색 개요");
    expect(print).toContain("2. 탐색 조건");
    expect(print).toContain("3. 평가 결과");
    expect(print).toContain("4. 비용 · 위험 가정");
    expect(print).toContain("5. 전략군별 추천");
    expect(print).toContain("6. 추천 근거");
    expect(print).toContain("7. 다음 단계");
    expect(print).toContain("model.disclaimer");
    expect(read("components/rextora/strategySearch/searchJobExport.ts")).toContain(
      EXPORT_DISCLAIMER,
    );
    expect(print).toContain("ss-print-hide");
    expect(print).not.toMatch(/jobId\}|paramsHash|strategyHash/);
    expect(css).toContain("@media print");
    expect(css).toContain("rextora-desktop-sidebar");
    expect(css).toContain("ss-print-hide");
    expect(css).toContain("nextjs-portal");
    expect(buildSearchReportHref("abc")).toBe(
      `${SEARCH_JOB_REPORT_PATH}?jobId=abc`,
    );
  });

  it("S: mobile export menu does not overflow", () => {
    const css = read("components/rextora/v3/strategy-search.css");
    expect(css).toContain(".ss-export");
    expect(css).toContain("@media (max-width: 767px)");
    expect(css).toContain("overflow-x: hidden");
    expect(css).toContain("max-width: min(100vw - 24px, 240px)");
  });

  it("T: no search/ranking/recommendation semantics imported", () => {
    const src = read("components/rextora/strategySearch/searchJobExport.ts");
    expect(src).not.toContain("candidateEvaluator");
    expect(src).not.toContain("candidateGenerator");
    expect(src).not.toMatch(/from ".*recommendation"/);
    expect(src).not.toContain("searchJobComparison");
    expect(
      buildExportFilename("BTC 표준 탐색", "2026-01-01", "json"),
    ).toBe("rextora-strategy-search_BTC-표준-탐색_2026-01-01.json");
  });
});
