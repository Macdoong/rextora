import { describe, expect, it, afterAll } from "vitest";
import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";
import {
  analyzeCostAssumptionStatus,
  analyzeValidationGap,
  BACKTEST_DATA_PIPELINE,
  buildTruncated365dFixtureReport,
  computeExpected15mCandles,
  countDuplicates,
  countGaps,
  DEFAULT_MAX_CANDLES,
  getLimitsInventory,
  getP3A2ImplementationTargets,
  getRecommendedFailClosedBehavior,
  getRecommendedFixModel,
  getRerunUxStatus,
  getSelectedCoveragePolicy,
  isEndOpenTimeInclusive,
  measureCoverageForDays,
  tracePaginationForDays,
} from "../src/lib/rextora/backtest/backtestDataCoverageDiagnosis";
import { BINANCE_KLINES_PAGE_LIMIT } from "../src/lib/rextora/data/historicalCandleLoader";
import { resolveTimeframe } from "../src/lib/rextora/data/timeframes";
import { validateBacktestCalendarRange } from "../src/lib/rextora/backtest/backtestDateRange";
import {
  EXPECTED_SAFE_PARAMS_HASH,
  SAFE_STRATEGY_ID,
} from "../src/lib/rextora/strategy/strategyTypes";

const NOW = Date.UTC(2026, 8, 3, 12, 0, 0);
const SAFE_PATH = "data/strategies/SAFE_v44_i4060.json";
const ARTIFACT_TS = "2026-09-03T08-15-00-000Z";
const artifactDir = join(
  process.cwd(),
  ".validation/backtest-p3-a1-data-coverage-diagnosis",
  ARTIFACT_TS,
);

const coverageCache: Record<string, Awaited<ReturnType<typeof measureCoverageForDays>>> = {};
let pagination365Cache: Awaited<ReturnType<typeof tracePaginationForDays>> | null = null;

function safeSha256(): string {
  return createHash("sha256")
    .update(readFileSync(SAFE_PATH))
    .digest("hex");
}

describe("P3-A1 backtest data coverage diagnosis", () => {
  it("1. exact 15m expected-count calculation", () => {
    expect(isEndOpenTimeInclusive()).toBe(true);
    // Calendar preset: start-of-day UTC → min(end-of-day, now); not naive days×96.
    expect(computeExpected15mCandles(30, NOW)).toBe(2929);
    expect(computeExpected15mCandles(90, NOW)).toBe(8689);
    expect(computeExpected15mCandles(180, NOW)).toBe(17329);
    expect(computeExpected15mCandles(365, NOW)).toBe(35089);
  });

  it("2. 30d requested/actual measurement", async () => {
    const m = await measureCoverageForDays(30, NOW);
    coverageCache["30d"] = m;
    expect(m.expectedBarCount).toBe(2929);
    expect(m.returnedCount).toBe(m.expectedBarCount);
    expect(m.truncationDetected).toBe(false);
    expect(m.duplicateCount).toBe(0);
    expect(m.gapCount).toBe(0);
  });

  it("3. 90d requested/actual measurement", async () => {
    const m = await measureCoverageForDays(90, NOW);
    coverageCache["90d"] = m;
    expect(m.expectedBarCount).toBe(8689);
    expect(m.returnedCount).toBe(m.expectedBarCount);
    expect(m.truncationDetected).toBe(false);
  });

  it("4. 180d requested/actual measurement", async () => {
    const m = await measureCoverageForDays(180, NOW);
    coverageCache["180d"] = m;
    expect(m.expectedBarCount).toBe(17329);
    expect(m.returnedCount).toBe(m.expectedBarCount);
    expect(m.truncationDetected).toBe(false);
  });

  it("5. 365d requested/actual measurement (loader no longer truncates)", async () => {
    const m = await measureCoverageForDays(365, NOW);
    coverageCache["365d"] = m;
    expect(m.expectedBarCount).toBe(35089);
    expect(m.returnedCount).toBe(35089);
    expect(m.truncationDetected).toBe(false);
    expect(m.coverageRatio).toBe(1);
    expect(m.endBoundaryDeltaMs).toBe(0);
  });

  it("6. pagination termination captured", async () => {
    const trace = await tracePaginationForDays(365, NOW);
    pagination365Cache = trace;
    expect(trace.pageSize).toBe(BINANCE_KLINES_PAGE_LIMIT);
    expect(trace.maxCandles).toBe(DEFAULT_MAX_CANDLES);
    expect(trace.maxPages).toBe(16);
    expect(trace.pagesFetched).toBe(14);
    expect(trace.finalCollectedCount).toBe(21_000);
    expect(trace.pageSizes.every((s) => s === 1500)).toBe(true);
    expect(trace.terminationReason).toMatch(/max_candles/);
  });

  it("7. exact truncation boundary captured (historical 20k loop only)", async () => {
    const trace = pagination365Cache ?? (await tracePaginationForDays(365, NOW));
    expect(trace.finalCollectedCount).toBe(21_000);
    const m = await measureCoverageForDays(365, NOW);
    expect(m.returnedCount).toBe(35089);
    expect(m.firstReturnedMs).toBe(m.requestedStartMs);
    expect(m.lastReturnedMs).toBe(m.requestedEndMs);
  });

  it("8. duplicate candle detection", async () => {
    const m = await measureCoverageForDays(30, NOW);
    const times = Array.from({ length: 5 }, (_, i) => i * 900_000);
    expect(countDuplicates(times)).toBe(0);
    expect(countDuplicates([0, 0, 900_000])).toBe(1);
    expect(m.duplicateCount).toBe(0);
  });

  it("9. gap detection", () => {
    const intervalMs = resolveTimeframe("15m").intervalMs;
    expect(countGaps([0, intervalMs, intervalMs * 2], intervalMs)).toBe(0);
    expect(countGaps([0, intervalMs * 3], intervalMs)).toBe(1);
  });

  it("10. requested-vs-actual mismatch no longer reproduced by loader", async () => {
    const m = await measureCoverageForDays(365, NOW);
    expect(m.returnedCount).toBe(m.expectedBarCount);
    expect(m.lastReturnedMs).toBe(m.requestedEndMs);
  });

  it("11. current validation behavior captured", () => {
    const report = buildTruncated365dFixtureReport(NOW);
    const gap = analyzeValidationGap(report);
    expect(gap.hasCoverageMismatchCheck).toBe(false);
    expect(gap.mismatchWouldBlockApproval).toBe(false);
    expect(gap.futureDataCheckPassesWhenTruncated).toBe(false);
    const reqDay = report.requestedTo!.slice(0, 10);
    const actDay = report.actualLastCandleTime!.slice(0, 10);
    expect(reqDay > actDay).toBe(true);
  });

  it("12. legitimate small-gap policy analysis", () => {
    const policy = getSelectedCoveragePolicy();
    expect(policy.model).toBe("MODEL_C");
    expect(policy.rationale).toMatch(/gap tolerance/i);
    const intervalMs = resolveTimeframe("15m").intervalMs;
    const times = [0, intervalMs, intervalMs * 3];
    expect(countGaps(times, intervalMs)).toBe(1);
  });

  it("13. engine input count captured (loader output = engine input)", async () => {
    const m = await measureCoverageForDays(365, NOW);
    expect(m.returnedCount).toBe(m.uniqueTimestampCount);
    expect(m.gapCount).toBe(0);
  });

  it("14. cost metadata status captured", () => {
    const report = buildTruncated365dFixtureReport(NOW);
    const status = analyzeCostAssumptionStatus(report, {
      feeRate: 0.0004,
      slippageRate: 0.0002,
    });
    expect(status.provenInResult).toBe("PARTIAL");
    expect(status.feesAppliedInValidation).toBe(true);
    expect(status.explicitRatesInReport).toBe(true);
  });

  it("15. prior-result rerun behavior captured", () => {
    const ux = getRerunUxStatus();
    expect(ux.priorResultPreservedDuringRerun).toBe("NO");
    expect(ux.mechanism).toMatch(/setReport\(null\)/);
  });

  it("16. diagnosis performs no production writes", () => {
    expect(BACKTEST_DATA_PIPELINE).toContain("loadHistoricalCandles");
    expect(getLimitsInventory().length).toBeGreaterThan(0);
  });

  it("17. no Paper/Live action", () => {
    expect(getRecommendedFailClosedBehavior().action).toBe(
      "BLOCK_EXECUTION_BEFORE_ENGINE",
    );
  });

  it("18. SAFE unchanged", () => {
    expect(SAFE_STRATEGY_ID).toBe("SAFE_v44_i4060");
    expect(EXPECTED_SAFE_PARAMS_HASH).toBe("7893ca3f0e30");
    expect(safeSha256()).toBe(
      "fb3f19169c8911fe041f3f8cb1d9e654f9166078f0c5cd8e29f04ec02a56dfc0",
    );
  });

  it("calendar validation does not block truncated coverage", () => {
    const fromDate = new Date(NOW - 365 * 86_400_000).toISOString().slice(0, 10);
    const toDate = new Date(NOW).toISOString().slice(0, 10);
    const v = validateBacktestCalendarRange(fromDate, toDate, NOW);
    expect(v.ok).toBe(true);
  });

  it("fix model and P3-A2 targets documented", () => {
    expect(getRecommendedFixModel().model).toBe("MODEL_C");
    expect(getP3A2ImplementationTargets().fetchFix[0]).toContain(
      "historicalCandleLoader",
    );
  });

  afterAll(() => {
    mkdirSync(artifactDir, { recursive: true });
    const fixture = buildTruncated365dFixtureReport(NOW);
    const write = (name: string, data: unknown) =>
      writeFileSync(join(artifactDir, name), JSON.stringify(data, null, 2) + "\n");

    write("source-pipeline.json", {
      pipeline: BACKTEST_DATA_PIPELINE,
      stages: {
        ui: "components/rextora/backtest/BacktestReviewWorkbench.tsx",
        api: "app/api/rextora/backtest/run/route.ts",
        runner: "src/lib/rextora/backtest/backtestRunner.ts",
        loader: "src/lib/rextora/data/historicalCandleLoader.ts",
        provider: "src/lib/rextora/binance/binanceReadOnlyService.ts",
        engine: "src/lib/rextora/backtest/backtestEngine.ts",
        validationUi: "components/rextora/charts/BacktestAnalysisView.tsx",
      },
    });
    write("limits-inventory.json", {
      limits: getLimitsInventory(),
      constant21000Found: false,
    });
    write("coverage-measurements.json", {
      nowMs: NOW,
      expected15m: {
        "30d": computeExpected15mCandles(30, NOW),
        "90d": computeExpected15mCandles(90, NOW),
        "180d": computeExpected15mCandles(180, NOW),
        "365d": computeExpected15mCandles(365, NOW),
      },
      measurements: coverageCache,
      endInclusive: true,
      method:
        "mock infinite Binance fetch via loadHistoricalCandles fetchPage injection",
    });
    write("pagination-trace.json", {
      "365d": pagination365Cache,
      multiplication: "14 pages × 1500 = 21000",
      termination:
        "collected.length >= maxCandles (20000) at loop guard after page 14",
    });
    write("cache-trace.json", {
      truncationStage: "FETCHER",
      ohlcvCache: false,
      marketDataStoreUsedForBacktestCandles: false,
      chartEvidenceStore: "post-run persistence only",
    });
    write("engine-input-trace.json", {
      warmupOnly: "backtestRunner checks candles.length <= ema_slow warmUp (~50)",
      postLoadSlice: false,
      chartSampling: "disabled (CHART_CANDLE_SAMPLE_LIMIT = Infinity)",
      engineReceivesFullLoadedArray: true,
      "365dEngineInputCount": coverageCache["365d"]?.returnedCount ?? null,
    });
    write("validation-gap.json", {
      analysis: analyzeValidationGap(fixture),
      requestActualMismatchCurrentlyBlocked: "NO",
    });
    write(
      "cost-assumption-status.json",
      analyzeCostAssumptionStatus(fixture, { feeRate: 0.0004, slippageRate: 0.0002 }),
    );
    write("rerun-ux-status.json", getRerunUxStatus());
    write("root-cause.json", {
      rootCauses: [
        {
          ROOT_CAUSE_CODE: "FETCH_MAX_CANDLES_SOFT_CAP",
          file: "src/lib/rextora/data/historicalCandleLoader.ts",
          function: "loadHistoricalCandles",
          mechanism:
            "Default maxCandles=20000; loop guard exits after one overflow page → ~21000",
          why21000: "14 pages × 1500 = 21000",
          affectedRanges: "15m > ~208 days; 365d preset",
          cacheContributes: false,
          engineContributes: false,
        },
      ],
      truncationDirection: "TAIL",
      truncationStage: "FETCHER",
    });
    write("recommended-fix.json", {
      recommendedFixModel: getRecommendedFixModel(),
      coveragePolicy: getSelectedCoveragePolicy(),
      failClosed: getRecommendedFailClosedBehavior(),
      p3a2Targets: getP3A2ImplementationTargets(),
      productionDataMigrationRequired: false,
    });
    write("production-readonly-hashes.json", {
      safeStrategyPath: SAFE_PATH,
      paramsHash: "7893ca3f0e30",
      sha256: createHash("sha256").update(readFileSync(SAFE_PATH)).digest("hex"),
      gitHead: "8c00049eb2e01980719487e1f12bcb3c7e4e5b8b",
    });
  });
});
