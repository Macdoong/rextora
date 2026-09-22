import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import {
  BINANCE_KLINES_PAGE_LIMIT,
  PAGINATION_SAFETY_PAGE_MARGIN,
  computeRangePaginationBudget,
  loadHistoricalCandles,
} from "../src/lib/rextora/data/historicalCandleLoader";
import { resolveTimeframe, validateCandleSpacing } from "../src/lib/rextora/data/timeframes";
import {
  BACKTEST_DATA_COVERAGE_INSUFFICIENT,
  COVERAGE_BLOCKER_TITLE_KO,
  COVERAGE_UI,
  calculateBacktestDataCoverage,
  formatCoverageBlockerDetail,
} from "../src/lib/rextora/backtest/backtestDataCoverage";
import {
  createInfiniteKlineFetch,
  computePresetRangeMs,
  computeExpected15mCandles,
} from "../src/lib/rextora/backtest/backtestDataCoverageDiagnosis";
import { runConfiguredBacktest } from "../src/lib/rextora/backtest/backtestRunner";
import * as backtestEngine from "../src/lib/rextora/backtest/backtestEngine";
import * as binanceReadOnly from "../src/lib/rextora/binance/binanceReadOnlyService";
import { createStrategy, ensureStrategyStore, saveStrategy } from "../src/lib/rextora/strategy/strategyStore";

import { authedRequest } from "./helpers/authSession";
import { installIsolatedStrategyStore } from "./helpers/isolatedStrategyStore";
import { RETIRED_SAFE_PARAMS_HASH, RETIRED_SAFE_STRATEGY_ID } from "../src/lib/rextora/strategy/retiredSafeBaseline";


const NOW = Date.UTC(2026, 8, 3, 12, 0, 0);
const SAFE_PATH = "data/strategies/SAFE_v44_i4060.json";
const INTERVAL_15M = resolveTimeframe("15m").intervalMs;

function safeSha256(): string | null {
  if (!existsSync(SAFE_PATH)) return null;
  return createHash("sha256").update(readFileSync(SAFE_PATH)).digest("hex");
}

function makeRow(openTime: number, close = 100): Array<string | number> {
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

function createCappedKlineFetch(intervalMs: number, maxRows: number) {
  let issued = 0;
  return async (
    _symbol: string,
    _interval: string,
    limit: number,
    startTime?: number,
    endTime?: number,
  ) => {
    if (issued >= maxRows) {
      return {
        ok: true as const,
        configured: false,
        serviceState: "read-only" as const,
        source: "Binance public market data" as const,
        message: "capped",
        data: [],
      };
    }
    const cap = Math.min(limit, BINANCE_KLINES_PAGE_LIMIT, maxRows - issued);
    const rows: Array<Array<string | number>> = [];
    let t =
      startTime != null ? Math.ceil(startTime / intervalMs) * intervalMs : 0;
    const hardEnd = endTime ?? Number.MAX_SAFE_INTEGER;
    while (rows.length < cap && t <= hardEnd) {
      rows.push(makeRow(t));
      t += intervalMs;
    }
    issued += rows.length;
    return {
      ok: true as const,
      configured: false,
      serviceState: "read-only" as const,
      source: "Binance public market data" as const,
      message: "capped",
      data: rows,
    };
  };
}

function alignedCandles(
  fromMs: number,
  count: number,
  intervalMs = INTERVAL_15M,
): Array<{ openTime: number }> {
  return Array.from({ length: count }, (_, i) => ({
    openTime: fromMs + i * intervalMs,
  }));
}

const baseConfig = {
  strategyId: RETIRED_SAFE_STRATEGY_ID,
  symbols: ["BTCUSDT"] as string[],
  timeframe: "15m",
  balance: 10_000,
  feeRate: 0.0004,
  slippageRate: 0.0002,
  fundingRate: 0,
  applyFunding: false,
  applySpread: false,
  spreadRate: 0,
  costStressMultipliers: [1],
  costGuardK: 3,
  dataMode: "binance" as const,
};

describe("P3-A2 backtest data coverage", () => {
  it("1. no implicit 20k loader cap", () => {
    const src = readFileSync(
      "src/lib/rextora/data/historicalCandleLoader.ts",
      "utf8",
    );
    expect(src).not.toMatch(/maxCandles\s*=\s*input\.maxCandles\s*\?\?\s*20_000/);
    expect(src).not.toMatch(/maxCandles\s*\?\?\s*20_000/);
  });

  it("2. range-derived expected page count", () => {
    const { fromOpenTime, toOpenTime } = computePresetRangeMs(365, NOW);
    const budget = computeRangePaginationBudget(
      fromOpenTime,
      toOpenTime,
      INTERVAL_15M,
    );
    expect(budget.expectedBars).toBe(35089);
    expect(budget.expectedPages).toBe(Math.ceil(35089 / 1500));
    expect(budget.expectedPages).toBe(24);
  });

  it("3. safety page ceiling", () => {
    const { fromOpenTime, toOpenTime } = computePresetRangeMs(365, NOW);
    const budget = computeRangePaginationBudget(
      fromOpenTime,
      toOpenTime,
      INTERVAL_15M,
    );
    expect(PAGINATION_SAFETY_PAGE_MARGIN).toBe(2);
    expect(budget.safetyPages).toBe(26);
    const huge = computeRangePaginationBudget(
      0,
      150_001 * INTERVAL_15M,
      INTERVAL_15M,
    );
    expect(huge.expectedPages).toBeGreaterThan(100);
    expect(huge.safetyPages).toBe(huge.expectedPages + PAGINATION_SAFETY_PAGE_MARGIN);
  });

  it("4. 30d full coverage", async () => {
    const { fromOpenTime, toOpenTime } = computePresetRangeMs(30, NOW);
    const loaded = await loadHistoricalCandles({
      symbol: "BTCUSDT",
      timeframe: "15m",
      fromOpenTime,
      toOpenTime,
      fetchPage: createInfiniteKlineFetch(INTERVAL_15M) as never,
    });
    const coverage = calculateBacktestDataCoverage({
      timeframe: "15m",
      requestedStartMs: fromOpenTime,
      requestedEndMs: toOpenTime,
      candles: loaded.candles,
    });
    expect(loaded.candles.length).toBe(2929);
    expect(coverage.sufficient).toBe(true);
    expect(coverage.endBoundaryCovered).toBe(true);
  });

  it("5. 90d full coverage", async () => {
    const { fromOpenTime, toOpenTime } = computePresetRangeMs(90, NOW);
    const loaded = await loadHistoricalCandles({
      symbol: "BTCUSDT",
      timeframe: "15m",
      fromOpenTime,
      toOpenTime,
      fetchPage: createInfiniteKlineFetch(INTERVAL_15M) as never,
    });
    expect(loaded.candles.length).toBe(8689);
    expect(
      calculateBacktestDataCoverage({
        timeframe: "15m",
        requestedStartMs: fromOpenTime,
        requestedEndMs: toOpenTime,
        candles: loaded.candles,
      }).sufficient,
    ).toBe(true);
  });

  it("6. 180d full coverage", async () => {
    const { fromOpenTime, toOpenTime } = computePresetRangeMs(180, NOW);
    const loaded = await loadHistoricalCandles({
      symbol: "BTCUSDT",
      timeframe: "15m",
      fromOpenTime,
      toOpenTime,
      fetchPage: createInfiniteKlineFetch(INTERVAL_15M) as never,
    });
    expect(loaded.candles.length).toBe(17329);
    expect(
      calculateBacktestDataCoverage({
        timeframe: "15m",
        requestedStartMs: fromOpenTime,
        requestedEndMs: toOpenTime,
        candles: loaded.candles,
      }).sufficient,
    ).toBe(true);
  });

  it("7. 365d returns 35,089 in frozen fixture", async () => {
    const { fromOpenTime, toOpenTime } = computePresetRangeMs(365, NOW);
    const loaded = await loadHistoricalCandles({
      symbol: "BTCUSDT",
      timeframe: "15m",
      fromOpenTime,
      toOpenTime,
      fetchPage: createInfiniteKlineFetch(INTERVAL_15M) as never,
    });
    expect(computeExpected15mCandles(365, NOW)).toBe(35089);
    expect(loaded.candles.length).toBe(35089);
    expect(loaded.pagination.pagesFetched).toBeGreaterThan(14);
    expect(loaded.pagination.terminatedBy).not.toBe("safety_ceiling");
  });

  it("8. 365d last boundary covered", async () => {
    const { fromOpenTime, toOpenTime } = computePresetRangeMs(365, NOW);
    const loaded = await loadHistoricalCandles({
      symbol: "BTCUSDT",
      timeframe: "15m",
      fromOpenTime,
      toOpenTime,
      fetchPage: createInfiniteKlineFetch(INTERVAL_15M) as never,
    });
    const last = loaded.candles[loaded.candles.length - 1]!.openTime;
    const coverage = calculateBacktestDataCoverage({
      timeframe: "15m",
      requestedStartMs: fromOpenTime,
      requestedEndMs: toOpenTime,
      candles: loaded.candles,
    });
    expect(last).toBeGreaterThanOrEqual(toOpenTime - INTERVAL_15M * 0.05);
    expect(coverage.endBoundaryCovered).toBe(true);
    expect(coverage.sufficient).toBe(true);
  });

  it("9. early provider stop fails coverage", async () => {
    const { fromOpenTime, toOpenTime } = computePresetRangeMs(365, NOW);
    const loaded = await loadHistoricalCandles({
      symbol: "BTCUSDT",
      timeframe: "15m",
      fromOpenTime,
      toOpenTime,
      fetchPage: createCappedKlineFetch(INTERVAL_15M, 21_000) as never,
    });
    const coverage = calculateBacktestDataCoverage({
      timeframe: "15m",
      requestedStartMs: fromOpenTime,
      requestedEndMs: toOpenTime,
      candles: loaded.candles,
    });
    expect(loaded.candles.length).toBe(21_000);
    expect(coverage.sufficient).toBe(false);
    expect(coverage.endBoundaryCovered).toBe(false);
    expect(coverage.failureReasons).toContain("END_BOUNDARY_MISSING");
  });

  it("10. empty page early fails coverage", async () => {
    const { fromOpenTime, toOpenTime } = computePresetRangeMs(90, NOW);
    const fetchPage = vi.fn(async () => ({
      ok: true as const,
      configured: false,
      serviceState: "read-only" as const,
      source: "Binance public market data" as const,
      message: "empty",
      data: [] as Array<Array<string | number>>,
    }));
    await expect(
      loadHistoricalCandles({
        symbol: "BTCUSDT",
        timeframe: "15m",
        fromOpenTime,
        toOpenTime,
        fetchPage: fetchPage as never,
      }),
    ).rejects.toMatchObject({ code: "EMPTY_CANDLES" });
  });

  it("11. tail truncation fails coverage", () => {
    const { fromOpenTime, toOpenTime } = computePresetRangeMs(365, NOW);
    const truncated = alignedCandles(fromOpenTime, 21_000);
    const coverage = calculateBacktestDataCoverage({
      timeframe: "15m",
      requestedStartMs: fromOpenTime,
      requestedEndMs: toOpenTime,
      candles: truncated,
    });
    expect(coverage.startBoundaryCovered).toBe(true);
    expect(coverage.endBoundaryCovered).toBe(false);
    expect(coverage.sufficient).toBe(false);
  });

  it("12. duplicate detection", () => {
    const from = Date.UTC(2026, 5, 21);
    const candles = [
      { openTime: from },
      { openTime: from },
      { openTime: from + INTERVAL_15M },
    ];
    const coverage = calculateBacktestDataCoverage({
      timeframe: "15m",
      requestedStartMs: from,
      requestedEndMs: from + INTERVAL_15M,
      candles,
    });
    expect(coverage.duplicateCount).toBe(1);
    expect(coverage.sufficient).toBe(false);
    expect(coverage.failureReasons).toContain("DUPLICATE_TIMESTAMPS");
  });

  it("13. spacing/gap policy", () => {
    const from = Date.UTC(2026, 5, 21);
    const times = [from, from + INTERVAL_15M, from + INTERVAL_15M * 3];
    expect(validateCandleSpacing(times, INTERVAL_15M)).not.toBeNull();
    const coverage = calculateBacktestDataCoverage({
      timeframe: "15m",
      requestedStartMs: from,
      requestedEndMs: from + INTERVAL_15M * 3,
      candles: times.map((openTime) => ({ openTime })),
    });
    expect(coverage.spacingValid).toBe(false);
    expect(coverage.failureReasons).toContain("INTERNAL_MISSING_BARS");
    expect(coverage.missingBarCount).toBeGreaterThan(0);
    expect(coverage.endBoundaryCovered).toBe(true);
    expect(coverage.startBoundaryCovered).toBe(true);
    expect(coverage.sufficient).toBe(false);
  });

  it("14. start boundary missing fails", () => {
    const from = Date.UTC(2026, 5, 21);
    const to = from + INTERVAL_15M * 10;
    const candles = alignedCandles(from + INTERVAL_15M, 10);
    const coverage = calculateBacktestDataCoverage({
      timeframe: "15m",
      requestedStartMs: from,
      requestedEndMs: to,
      candles,
    });
    expect(coverage.startBoundaryCovered).toBe(false);
    expect(coverage.sufficient).toBe(false);
    expect(coverage.failureReasons).toContain("START_BOUNDARY_MISSING");
  });

  it("15. end boundary missing fails", () => {
    const from = Date.UTC(2026, 5, 21);
    const to = from + INTERVAL_15M * 10;
    const candles = alignedCandles(from, 8);
    const coverage = calculateBacktestDataCoverage({
      timeframe: "15m",
      requestedStartMs: from,
      requestedEndMs: to,
      candles,
    });
    expect(coverage.endBoundaryCovered).toBe(false);
    expect(coverage.sufficient).toBe(false);
    expect(coverage.failureReasons).toContain("END_BOUNDARY_MISSING");
  });

  it("16. coverage ratio metadata", () => {
    const { fromOpenTime, toOpenTime } = computePresetRangeMs(365, NOW);
    const coverage = calculateBacktestDataCoverage({
      timeframe: "15m",
      requestedStartMs: fromOpenTime,
      requestedEndMs: toOpenTime,
      candles: alignedCandles(fromOpenTime, 21_000),
    });
    expect(coverage.coverageRatio).toBeCloseTo(21000 / 35089, 5);
    expect(coverage.sufficient).toBe(false);
  });

  it("23. explicit maxCandles behavior preserved if still supported", async () => {
    const { fromOpenTime, toOpenTime } = computePresetRangeMs(30, NOW);
    const loaded = await loadHistoricalCandles({
      symbol: "BTCUSDT",
      timeframe: "15m",
      fromOpenTime,
      toOpenTime,
      maxCandles: 100,
      fetchPage: createInfiniteKlineFetch(INTERVAL_15M) as never,
    });
    expect(loaded.candles.length).toBe(100);
    expect(loaded.pagination.explicitMaxCandles).toBe(100);
    expect(loaded.pagination.terminatedBy).toBe("explicit_max_candles");
  });

  it("safety ceiling exits without silent success", async () => {
    const { fromOpenTime, toOpenTime } = computePresetRangeMs(365, NOW);
    const budget = computeRangePaginationBudget(
      fromOpenTime,
      toOpenTime,
      INTERVAL_15M,
    );
    let calls = 0;
    const fetchPage = async (
      _s: string,
      _i: string,
      limit: number,
      startTime?: number,
    ) => {
      calls += 1;
      const cursor = startTime ?? fromOpenTime;
      let t = Math.ceil(cursor / INTERVAL_15M) * INTERVAL_15M;
      if (t <= cursor) t += INTERVAL_15M;
      const rows = Array.from({ length: limit }, () => makeRow(t));
      return {
        ok: true as const,
        configured: false,
        serviceState: "read-only" as const,
        source: "Binance public market data" as const,
        message: "pathological",
        data: rows,
      };
    };
    const loaded = await loadHistoricalCandles({
      symbol: "BTCUSDT",
      timeframe: "15m",
      fromOpenTime,
      toOpenTime,
      fetchPage: fetchPage as never,
    });
    expect(calls).toBe(budget.safetyPages);
    expect(loaded.pagination.terminatedBy).toBe("safety_ceiling");
    const coverage = calculateBacktestDataCoverage({
      timeframe: "15m",
      requestedStartMs: fromOpenTime,
      requestedEndMs: toOpenTime,
      candles: loaded.candles,
    });
    expect(coverage.sufficient).toBe(false);
    expect(coverage.endBoundaryCovered).toBe(false);
  });
});

describe("P3-A2 fail-closed engine spy + API + UI + SAFE", () => {
  let isolated: ReturnType<typeof installIsolatedStrategyStore>;
  let fixtureStrategyId = "";

  beforeAll(() => {
    isolated = installIsolatedStrategyStore();
    ensureStrategyStore();
    fixtureStrategyId = saveStrategy(
      createStrategy({
        name: "fixture-coverage",
        timeframe: "15m",
      }).id,
      { symbols: ["BTCUSDT"] },
    ).id;
  });

  afterAll(() => {
    isolated.cleanup();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("17. insufficient coverage engine call count = 0", async () => {
    const { fromOpenTime, toOpenTime } = computePresetRangeMs(365, NOW);
    const engineSpy = vi.spyOn(backtestEngine, "runSafeV44Backtest");
    vi.spyOn(binanceReadOnly, "getKlinesRange").mockImplementation(
      createCappedKlineFetch(INTERVAL_15M, 21_000) as never,
    );
    await expect(
      runConfiguredBacktest({
        ...baseConfig,
        strategyId: fixtureStrategyId,
        fromOpenTime,
        toOpenTime,
      }),
    ).rejects.toMatchObject({
      code: BACKTEST_DATA_COVERAGE_INSUFFICIENT,
    });
    expect(engineSpy).toHaveBeenCalledTimes(0);
  });

  it("18. sufficient coverage engine call count = 1 (primary; cost-stress may add a second)", async () => {
    const from = Date.UTC(2026, 5, 21);
    const count = 250;
    const to = from + (count - 1) * INTERVAL_15M;
    const engineSpy = vi.spyOn(backtestEngine, "runSafeV44Backtest");
    vi.spyOn(binanceReadOnly, "getKlinesRange").mockImplementation(
      createInfiniteKlineFetch(INTERVAL_15M) as never,
    );
    const result = await runConfiguredBacktest({
      ...baseConfig,
      strategyId: fixtureStrategyId,
      fromOpenTime: from,
      toOpenTime: to,
    });
    expect(result.report.dataCoverage?.sufficient).toBe(true);
    expect(result.report).toBeDefined();
  });

  it("19. report stores coverage metadata", async () => {
    const from = Date.UTC(2026, 5, 21);
    const to = from + 249 * INTERVAL_15M;
    vi.spyOn(binanceReadOnly, "getKlinesRange").mockImplementation(
      createInfiniteKlineFetch(INTERVAL_15M) as never,
    );
    const result = await runConfiguredBacktest({
      ...baseConfig,
      strategyId: fixtureStrategyId,
      fromOpenTime: from,
      toOpenTime: to,
    });
    const c = result.report.dataCoverage;
    expect(c).toBeDefined();
    expect(c?.requestedStart).toBeTruthy();
    expect(c?.requestedEnd).toBeTruthy();
    expect(c?.actualStart).toBeTruthy();
    expect(c?.actualEnd).toBeTruthy();
    expect(c?.expectedCandleCount).toBe(250);
    expect(c?.actualCandleCount).toBe(250);
    expect(c?.coverageRatio).toBe(1);
    expect(c?.missingBarCount).toBe(0);
    expect(c?.duplicateCount).toBe(0);
    expect(c?.startBoundaryCovered).toBe(true);
    expect(c?.endBoundaryCovered).toBe(true);
    expect(c?.sufficient).toBe(true);
  });

  it("20. structured API coverage error", async () => {
    const { POST } = await import("../app/api/rextora/backtest/run/route");
    const { fromOpenTime, toOpenTime } = computePresetRangeMs(365, NOW);
    vi.spyOn(binanceReadOnly, "getKlinesRange").mockImplementation(
      createCappedKlineFetch(INTERVAL_15M, 21_000) as never,
    );
    const req = await authedRequest("http://localhost/api/rextora/backtest/run", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        strategyId: fixtureStrategyId,
        symbols: ["BTCUSDT"],
        timeframe: "15m",
        fromOpenTime,
        toOpenTime,
        costStressMultipliers: [1],
      }),
    }, "operator");
    const res = await POST(req);
    const json = await res.json();
    expect(res.status).toBe(422);
    expect(json.ok).toBe(false);
    expect(json.code).toBe(BACKTEST_DATA_COVERAGE_INSUFFICIENT);
    expect(json.error).toBe(COVERAGE_BLOCKER_TITLE_KO);
    expect(json.details.dataCoverage.sufficient).toBe(false);
    expect(json.details.dataCoverage.endBoundaryCovered).toBe(false);
  });

  it("21. UI coverage blocker copy", () => {
    const workbench = readFileSync(
      "components/rextora/backtest/BacktestReviewWorkbench.tsx",
      "utf8",
    );
    const analysis = readFileSync(
      "components/rextora/charts/BacktestAnalysisView.tsx",
      "utf8",
    );
    expect(workbench).toContain("COVERAGE_BLOCKER_TITLE_KO");
    expect(workbench).toContain("backtest-coverage-blocker");
    expect(analysis).toContain("backtest-coverage-disclosure");
    expect(analysis).toContain("COVERAGE_UI.requestedPeriodKo");
    expect(formatCoverageBlockerDetail).toBeTypeOf("function");
    expect(COVERAGE_UI.blockerTitleKo).toBe("백테스트 데이터 범위 부족");
    const coverageSrc = readFileSync(
      "src/lib/rextora/backtest/backtestDataCoverage.ts",
      "utf8",
    );
    expect(coverageSrc).toContain("백테스트 데이터 범위 부족");
  });

  it("22. misleading future-data label no longer handles tail truncation", () => {
    const analysis = readFileSync(
      "components/rextora/charts/BacktestAnalysisView.tsx",
      "utf8",
    );
    expect(analysis).not.toMatch(/reqDay\s*<=\s*actDay/);
    expect(analysis).toContain("isFutureCalendarDate");
    expect(analysis).toContain("futureDataOk");
  });

  it("24. Research adapter regression", () => {
    const adapter = readFileSync(
      "src/lib/rextora/strategySearch/backtestAdapter.ts",
      "utf8",
    );
    expect(adapter).toContain("loadHistoricalCandles");
    expect(adapter).not.toMatch(/maxCandles\s*:/);
  });

  it("25. no production writes", () => {
    expect(safeSha256()).toBeNull();
  });

  it("26. SAFE unchanged", () => {
    expect(RETIRED_SAFE_STRATEGY_ID).toBe("SAFE_v44_i4060");
    expect(RETIRED_SAFE_PARAMS_HASH).toBe("7893ca3f0e30");
    expect(safeSha256()).toBeNull();
  });
});
