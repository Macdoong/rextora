/**
 * P3-A1 read-only forensic helpers for backtest candle coverage diagnosis.
 * Does not mutate production data or execute backtests.
 */

import {
  BINANCE_KLINES_PAGE_LIMIT,
  loadHistoricalCandles,
} from "../data/historicalCandleLoader";
import { resolveTimeframe, expectedBarCount } from "../data/timeframes";
import type { OhlcvCandle } from "../data/ohlcvTypes";
import type { BacktestReport } from "./backtestTypes";
import {
  parseDateStart,
  resolveEffectiveEndOpenTime,
  validateBacktestCalendarRange,
} from "./backtestDateRange";

/** Default soft cap in loadHistoricalCandles — documented root-cause boundary. */
export const DEFAULT_MAX_CANDLES = 20_000;

export const BACKTEST_DATA_PIPELINE = [
  "components/rextora/backtest/BacktestReviewWorkbench.tsx::runUserBacktest",
  "components/rextora/backtest/BacktestReviewWorkbench.tsx::validateBacktestCalendarRange",
  "app/api/rextora/backtest/run/route.ts::POST",
  "src/lib/rextora/backtest/backtestRunner.ts::runConfiguredBacktest",
  "src/lib/rextora/backtest/backtestRunner.ts::loadCandlesForSymbol",
  "src/lib/rextora/data/historicalCandleLoader.ts::loadHistoricalCandles",
  "src/lib/rextora/binance/binanceReadOnlyService.ts::getKlinesRange",
  "src/lib/rextora/backtest/backtestRunner.ts::runSafeV44Backtest|runConditionBuilderBacktest|runEventSequenceBacktest",
  "src/lib/rextora/backtest/backtestEngine.ts::buildBacktestReport",
  "components/rextora/charts/BacktestAnalysisView.tsx::ValidationDetailsPanel",
].join(" → ");

export type CoverageMeasurement = {
  days: number;
  timeframe: "15m";
  intervalMs: number;
  requestedStartMs: number;
  requestedEndMs: number;
  requestedStartIso: string;
  requestedEndIso: string;
  expectedBarCount: number;
  returnedCount: number;
  uniqueTimestampCount: number;
  duplicateCount: number;
  gapCount: number;
  firstReturnedMs: number | null;
  lastReturnedMs: number | null;
  coverageRatio: number;
  endBoundaryDeltaMs: number | null;
  truncationDetected: boolean;
};

export type PaginationTrace = {
  pageSize: number;
  maxPages: number;
  maxCandles: number;
  pagesFetched: number;
  terminationReason: string;
  finalCollectedCount: number;
  pageSizes: number[];
};

export type ValidationGapAnalysis = {
  requestedEndDay: string | null;
  actualLastDay: string | null;
  futureDataCheckPassesWhenTruncated: boolean;
  hasCoverageMismatchCheck: boolean;
  mismatchWouldBlockApproval: boolean;
};

export type CostAssumptionStatus = {
  feesAppliedInValidation: boolean;
  slippageAppliedInValidation: boolean;
  fundingAppliedInValidation: boolean;
  spreadAppliedInValidation: boolean;
  explicitRatesInReport: boolean;
  provenInResult: "YES" | "PARTIAL" | "NO";
};

export type RerunUxStatus = {
  priorResultPreservedDuringRerun: "YES" | "NO" | "PARTIAL";
  mechanism: string;
};

function makeBinanceRow(openTime: number, close = 100): Array<string | number> {
  return [
    openTime,
    close,
    close * 1.001,
    close * 0.999,
    close,
    1000,
    openTime + 899_999,
  ];
}

/** Infinite mock Binance page generator for isolated coverage measurement. */
export function createInfiniteKlineFetch(intervalMs: number) {
  return async (
    _symbol: string,
    _interval: string,
    limit: number,
    startTime?: number,
    endTime?: number,
  ) => {
    const cap = Math.min(limit, BINANCE_KLINES_PAGE_LIMIT);
    const rows: Array<Array<string | number>> = [];
    const hardEnd = endTime ?? Number.MAX_SAFE_INTEGER;
    let t =
      startTime != null
        ? Math.ceil(startTime / intervalMs) * intervalMs
        : 0;
    while (rows.length < cap && t <= hardEnd) {
      rows.push(makeBinanceRow(t));
      t += intervalMs;
    }
    return {
      ok: true as const,
      configured: false,
      serviceState: "read-only" as const,
      source: "Binance public market data" as const,
      message: "mock infinite klines",
      data: rows,
    };
  };
}

export function computePresetRangeMs(
  days: number,
  nowMs = Date.UTC(2026, 8, 3, 12, 0, 0),
): { fromOpenTime: number; toOpenTime: number } {
  const latest = nowMs;
  const fromMs = latest - days * 86_400_000;
  const fromDate = new Date(fromMs).toISOString().slice(0, 10);
  const toDate = new Date(latest).toISOString().slice(0, 10);
  const fromOpenTime = parseDateStart(fromDate)!;
  const end = resolveEffectiveEndOpenTime(toDate, nowMs);
  if (!end.ok) throw new Error(end.error);
  return { fromOpenTime, toOpenTime: end.endOpenTime };
}

export function computeExpected15mCandles(days: number, nowMs?: number): number {
  const { fromOpenTime, toOpenTime } = computePresetRangeMs(days, nowMs);
  const intervalMs = resolveTimeframe("15m").intervalMs;
  return expectedBarCount(fromOpenTime, toOpenTime, intervalMs);
}

export function countGaps(openTimes: number[], intervalMs: number): number {
  if (openTimes.length < 2) return 0;
  let gaps = 0;
  for (let i = 1; i < openTimes.length; i += 1) {
    const delta = openTimes[i]! - openTimes[i - 1]!;
    if (delta > intervalMs * 1.05) gaps += 1;
  }
  return gaps;
}

export function countDuplicates(openTimes: number[]): number {
  const seen = new Set<number>();
  let dupes = 0;
  for (const t of openTimes) {
    if (seen.has(t)) dupes += 1;
    else seen.add(t);
  }
  return dupes;
}

export async function measureCoverageForDays(
  days: number,
  nowMs = Date.UTC(2026, 8, 3, 12, 0, 0),
): Promise<CoverageMeasurement> {
  const intervalMs = resolveTimeframe("15m").intervalMs;
  const { fromOpenTime, toOpenTime } = computePresetRangeMs(days, nowMs);
  const expected = expectedBarCount(fromOpenTime, toOpenTime, intervalMs);
  const fetchPage = createInfiniteKlineFetch(intervalMs);

  const loaded = await loadHistoricalCandles({
    symbol: "BTCUSDT",
    timeframe: "15m",
    fromOpenTime,
    toOpenTime,
    fetchPage: fetchPage as never,
  });

  const openTimes = loaded.candles.map((c) => c.openTime);
  const unique = new Set(openTimes).size;
  const first = openTimes[0] ?? null;
  const last = openTimes[openTimes.length - 1] ?? null;

  return {
    days,
    timeframe: "15m",
    intervalMs,
    requestedStartMs: fromOpenTime,
    requestedEndMs: toOpenTime,
    requestedStartIso: new Date(fromOpenTime).toISOString(),
    requestedEndIso: new Date(toOpenTime).toISOString(),
    expectedBarCount: expected,
    returnedCount: loaded.candles.length,
    uniqueTimestampCount: unique,
    duplicateCount: countDuplicates(openTimes),
    gapCount: countGaps(openTimes, intervalMs),
    firstReturnedMs: first,
    lastReturnedMs: last,
    coverageRatio: expected > 0 ? loaded.candles.length / expected : 0,
    endBoundaryDeltaMs:
      last != null ? toOpenTime - last : null,
    truncationDetected:
      loaded.candles.length < expected ||
      (last != null && last < toOpenTime - intervalMs),
  };
}

/** Trace pagination page-by-page using the same loop contract as the loader. */
export async function tracePaginationForDays(
  days: number,
  nowMs = Date.UTC(2026, 8, 3, 12, 0, 0),
): Promise<PaginationTrace> {
  const intervalMs = resolveTimeframe("15m").intervalMs;
  const { fromOpenTime, toOpenTime } = computePresetRangeMs(days, nowMs);
  const maxCandles = DEFAULT_MAX_CANDLES;
  const maxPages = Math.ceil(maxCandles / BINANCE_KLINES_PAGE_LIMIT) + 2;
  const fetchPage = createInfiniteKlineFetch(intervalMs);
  const pageSizes: number[] = [];
  const collected: OhlcvCandle[] = [];
  let cursor = fromOpenTime;
  let pages = 0;
  let terminationReason = "unknown";

  while (cursor <= toOpenTime && pages < maxPages && collected.length < maxCandles) {
    pages += 1;
    const result = await fetchPage(
      "BTCUSDT",
      "15m",
      BINANCE_KLINES_PAGE_LIMIT,
      cursor,
      toOpenTime,
    );
    if (!result.ok || !Array.isArray(result.data) || result.data.length === 0) {
      terminationReason = "empty_or_failed_page";
      break;
    }
    const pageLen = result.data.length;
    pageSizes.push(pageLen);
    for (const row of result.data) {
      collected.push({
        openTime: Number(row[0]),
        open: Number(row[1]),
        high: Number(row[2]),
        low: Number(row[3]),
        close: Number(row[4]),
        volume: Number(row[5]),
      });
    }
    const lastOpen = Number(result.data[result.data.length - 1]![0]);
    if (!Number.isFinite(lastOpen) || lastOpen <= cursor) {
      terminationReason = "cursor_stuck";
      break;
    }
    cursor = lastOpen + 1;
    if (pageLen < BINANCE_KLINES_PAGE_LIMIT) {
      terminationReason = "short_page";
      break;
    }
    if (pages >= maxPages) {
      terminationReason = "max_pages";
      break;
    }
    if (collected.length >= maxCandles) {
      terminationReason = "max_candles_after_page";
      break;
    }
    if (cursor > toOpenTime) {
      terminationReason = "cursor_past_end";
      break;
    }
  }

  if (terminationReason === "unknown") {
    if (collected.length >= maxCandles) terminationReason = "max_candles_loop_guard";
    else if (cursor > toOpenTime) terminationReason = "cursor_past_end";
    else if (pages >= maxPages) terminationReason = "max_pages";
    else terminationReason = "loop_exit";
  }

  return {
    pageSize: BINANCE_KLINES_PAGE_LIMIT,
    maxPages,
    maxCandles,
    pagesFetched: pages,
    terminationReason,
    finalCollectedCount: collected.length,
    pageSizes,
  };
}

export function analyzeValidationGap(report: BacktestReport): ValidationGapAnalysis {
  const reqDay = report.requestedTo?.slice(0, 10) ?? null;
  const actDay = report.actualLastCandleTime?.slice(0, 10) ?? null;
  const futureDataCheckPassesWhenTruncated =
    Boolean(reqDay && actDay && reqDay <= actDay);
  return {
    requestedEndDay: reqDay,
    actualLastDay: actDay,
    futureDataCheckPassesWhenTruncated,
    hasCoverageMismatchCheck: false,
    mismatchWouldBlockApproval: false,
  };
}

export function buildTruncated365dFixtureReport(
  nowMs = Date.UTC(2026, 8, 3, 12, 0, 0),
): BacktestReport {
  const { fromOpenTime, toOpenTime } = computePresetRangeMs(365, nowMs);
  const intervalMs = resolveTimeframe("15m").intervalMs;
  const truncatedBars = 21_000;
  const actualLastMs = fromOpenTime + (truncatedBars - 1) * intervalMs;
  return {
    strategyName: "fixture",
    strategyHash: "fixture",
    strategyId: "fixture",
    sourceStatus: "fixture",
    symbol: "BTCUSDT",
    symbols: ["BTCUSDT"],
    timeframe: "15m",
    fromDate: new Date(fromOpenTime).toISOString().slice(0, 10),
    toDate: new Date(toOpenTime).toISOString().slice(0, 10),
    requestedFrom: new Date(fromOpenTime).toISOString(),
    requestedTo: new Date(toOpenTime).toISOString(),
    actualFirstCandleTime: new Date(fromOpenTime).toISOString(),
    actualLastCandleTime: new Date(actualLastMs).toISOString(),
    candleCount: truncatedBars,
    processedCandleCount: truncatedBars,
    dataSource: "binance",
    totalReturn: 0,
    mdd: 0,
    tradeCount: 0,
    winRate: 0,
    averageTrade: 0,
    profitFactor: 0,
    maxConsecutiveLosses: 0,
    feeImpact: 0,
    feeTotal: 0,
    slippageTotal: 0,
    fundingTotal: 0,
    spreadTotal: 0,
    costs: {
      fees: 0,
      slippage: 0,
      funding: 0,
      spread: 0,
      totalTradingCost: 0,
    },
    monthlyReturns: [],
    negativeMonths: 0,
    startingBalance: 10000,
    endingBalance: 10000,
    validation: {
      paramsHashVerified: true,
      feesApplied: true,
      slippageApplied: true,
      fundingApplied: false,
      spreadApplied: false,
      noRealOrders: true,
    },
  };
}

export function analyzeCostAssumptionStatus(
  report: BacktestReport,
  config?: { feeRate?: number; slippageRate?: number; fundingRate?: number; spreadRate?: number },
): CostAssumptionStatus {
  const v = report.validation;
  const explicitRatesInReport =
    config?.feeRate != null ||
    config?.slippageRate != null ||
    config?.fundingRate != null ||
    config?.spreadRate != null;
  const flagsPresent =
    v.feesApplied && v.slippageApplied && typeof v.fundingApplied === "boolean";
  return {
    feesAppliedInValidation: v.feesApplied,
    slippageAppliedInValidation: v.slippageApplied,
    fundingAppliedInValidation: v.fundingApplied,
    spreadAppliedInValidation: v.spreadApplied,
    explicitRatesInReport,
    provenInResult: flagsPresent && report.costs ? "PARTIAL" : "NO",
  };
}

export function getRerunUxStatus(): RerunUxStatus {
  return {
    priorResultPreservedDuringRerun: "NO",
    mechanism:
      "BacktestReviewWorkbench.runUserBacktest clears report/trades/candles via setReport(null) before POST; prior completed evidence disappears during loading.",
  };
}

export function getLimitsInventory() {
  return [
    {
      constant: 20_000,
      file: "src/lib/rextora/data/historicalCandleLoader.ts",
      function: "loadHistoricalCandles",
      purpose: "Default maxCandles soft cap for paginated Binance fetch",
      scope: "per loadHistoricalCandles call",
      paginationContinues: false,
      explains21000: "YES — 14 pages × 1500 = 21,000; loop guard stops before page 15",
    },
    {
      constant: 1500,
      file: "src/lib/rextora/data/historicalCandleLoader.ts",
      function: "BINANCE_KLINES_PAGE_LIMIT",
      purpose: "Binance klines page size per request",
      scope: "per page",
      paginationContinues: true,
      explains21000: "PARTIAL — 14 pages × 1500 = 21,000",
    },
    {
      constant: "ceil(maxCandles/1500)+2",
      file: "src/lib/rextora/data/historicalCandleLoader.ts",
      function: "loadHistoricalCandles",
      purpose: "maxPages safety bound (=16 for default cap)",
      scope: "per fetch",
      paginationContinues: false,
      explains21000: "NO — 16 pages would allow 24k; cap hit first at 14 pages",
    },
    {
      constant: 20_000,
      file: "src/lib/rextora/data/ohlcvTypes.ts",
      function: "generateSyntheticCandlesForRange",
      purpose: "Synthetic test candle cap only",
      scope: "synthetic-test dataMode",
      paginationContinues: false,
      explains21000: "NO for production binance path",
    },
    {
      constant: "Infinity",
      file: "src/lib/rextora/backtest/backtestRunner.ts",
      function: "CHART_CANDLE_SAMPLE_LIMIT",
      purpose: "Chart sampling disabled",
      scope: "chart payload",
      paginationContinues: "N/A",
      explains21000: "NO",
    },
  ];
}

export function getSelectedCoveragePolicy(): {
  model: "MODEL_A" | "MODEL_B" | "MODEL_C" | "MODEL_D" | "MODEL_E";
  rationale: string;
} {
  return {
    model: "MODEL_C",
    rationale:
      "Start/end boundary coverage required (MODEL A intent) with existing validateCandleSpacing one-bar gap tolerance for internal gaps. Silent multi-month tail truncation must never pass.",
  };
}

export function getRecommendedFailClosedBehavior(): {
  action: "BLOCK_EXECUTION_BEFORE_ENGINE";
  rationale: string;
} {
  return {
    action: "BLOCK_EXECUTION_BEFORE_ENGINE",
    rationale:
      "Missing months of newest data materially invalidates performance; preflight after loadHistoricalCandles with fail-closed error before engine entry.",
  };
}

export function getRecommendedFixModel(): {
  model: "MODEL_C";
  rationale: string;
} {
  return {
    model: "MODEL_C",
    rationale:
      "Remove/raise fetch cap + canonical expectedBarCount + preflight coverage check + result metadata + minimal UI disclosure. Preserves engine; blocks silent truncation.",
  };
}

export function getP3A2ImplementationTargets() {
  return {
    fetchFix: [
      "src/lib/rextora/data/historicalCandleLoader.ts::loadHistoricalCandles",
    ],
    coverageCalculation: [
      "src/lib/rextora/data/timeframes.ts::expectedBarCount",
      "src/lib/rextora/backtest/backtestDataCoverage.ts (new)",
    ],
    preflightValidation: [
      "src/lib/rextora/backtest/backtestRunner.ts::loadCandlesForSymbol",
      "app/api/rextora/backtest/run/route.ts",
    ],
    resultMetadata: [
      "src/lib/rextora/backtest/backtestTypes.ts::BacktestReport",
      "src/lib/rextora/backtest/backtestReport.ts::buildBacktestReport",
      "src/lib/rextora/backtest/backtestEngine.ts",
    ],
    uiDisclosure: [
      "components/rextora/charts/BacktestAnalysisView.tsx",
      "components/rextora/backtest/BacktestReviewWorkbench.tsx",
    ],
    tests: [
      "tests/backtestDataCoverageDiagnosis.test.ts",
      "tests/backtestDataPipeline.test.ts",
    ],
  };
}

/** Returns whether end open-time is inclusive in range filter (proven from loader). */
export function isEndOpenTimeInclusive(): boolean {
  return true;
}
