/**
 * P3-A4 generic historical coverage + exact-grid spacing.
 * Isolated fixtures only — no production Research/Paper/Live.
 */

import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as backtestEngine from "../src/lib/rextora/backtest/backtestEngine";
import * as binanceReadOnly from "../src/lib/rextora/binance/binanceReadOnlyService";
import {
  BACKTEST_DATA_COVERAGE_INSUFFICIENT,
  calculateBacktestDataCoverage,
} from "../src/lib/rextora/backtest/backtestDataCoverage";
import {
  computeExpected15mCandles,
  computePresetRangeMs,
  createInfiniteKlineFetch,
} from "../src/lib/rextora/backtest/backtestDataCoverageDiagnosis";
import { runConfiguredBacktest } from "../src/lib/rextora/backtest/backtestRunner";
import {
  BINANCE_KLINES_PAGE_LIMIT,
  loadHistoricalCandles,
} from "../src/lib/rextora/data/historicalCandleLoader";
import {
  calculateHistoricalDataCoverage,
} from "../src/lib/rextora/data/historicalDataCoverage";
import { generateSyntheticCandles } from "../src/lib/rextora/data/ohlcvTypes";
import {
  SUPPORTED_TIMEFRAMES,
  inspectCandleSpacing,
  resolveTimeframe,
  validateCandleSpacing,
} from "../src/lib/rextora/data/timeframes";

import { createStrategy, ensureStrategyStore, saveStrategy } from "../src/lib/rextora/strategy/strategyStore";
import { installIsolatedStrategyStore } from "./helpers/isolatedStrategyStore";
import { RETIRED_SAFE_PARAMS_HASH, RETIRED_SAFE_STRATEGY_ID } from "../src/lib/rextora/strategy/retiredSafeBaseline";


const SAFE_PATH = "data/strategies/SAFE_v44_i4060.json";
const NOW = Date.UTC(2026, 8, 3, 12, 0, 0);
const INTERVAL_15M = 900_000;
const T0 = Date.UTC(2024, 0, 1);

function safeSha256(): string | null {
  if (!existsSync(SAFE_PATH)) return null;
  return createHash("sha256").update(readFileSync(SAFE_PATH)).digest("hex");
}

function aligned(count: number, intervalMs: number, start = T0) {
  return Array.from({ length: count }, (_, i) => ({
    openTime: start + i * intervalMs,
  }));
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

describe("P3-A4 historical data coverage + grid", () => {
  it("1-5. supported timeframe exact grids accepted", () => {
    for (const id of SUPPORTED_TIMEFRAMES) {
      const spec = resolveTimeframe(id);
      const times = aligned(8, spec.intervalMs).map((c) => c.openTime);
      expect(inspectCandleSpacing(times, spec.intervalMs).ok).toBe(true);
      expect(validateCandleSpacing(times, spec.intervalMs)).toBeNull();
      const coverage = calculateHistoricalDataCoverage({
        timeframe: id,
        requestedStartMs: T0,
        requestedEndMs: T0 + 7 * spec.intervalMs,
        candles: aligned(8, spec.intervalMs),
      });
      expect(coverage.sufficient).toBe(true);
      expect(coverage.gridAligned).toBe(true);
      expect(coverage.spacingValid).toBe(true);
    }
  });

  it("6. absolute off-grid rejected even when delta is exact", () => {
    const times = [1, 1 + INTERVAL_15M];
    const result = inspectCandleSpacing(times, INTERVAL_15M);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("OFF_GRID");
    expect(validateCandleSpacing(times, INTERVAL_15M)).not.toBeNull();
  });

  it("7. 1ms rejected OFF_GRID", () => {
    const result = inspectCandleSpacing([T0, T0 + 1], INTERVAL_15M);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("OFF_GRID");
  });

  it("8. 899999ms rejected OFF_GRID", () => {
    const result = inspectCandleSpacing([T0, T0 + 899_999], INTERVAL_15M);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("OFF_GRID");
  });

  it("9. 900000ms accepted", () => {
    expect(inspectCandleSpacing([T0, T0 + 900_000], INTERVAL_15M).ok).toBe(true);
  });

  it("10. 900001ms rejected OFF_GRID", () => {
    const result = inspectCandleSpacing([T0, T0 + 900_001], INTERVAL_15M);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("OFF_GRID");
  });

  it("11. 1800000ms missing-bar rejected", () => {
    const result = inspectCandleSpacing([T0, T0 + 1_800_000], INTERVAL_15M);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("INTERNAL_MISSING_BARS");
  });

  it("12. 2700000ms missing-bar rejected", () => {
    const result = inspectCandleSpacing([T0, T0 + 2_700_000], INTERVAL_15M);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("INTERNAL_MISSING_BARS");
  });

  it("13. duplicate rejected", () => {
    const result = inspectCandleSpacing([T0, T0], INTERVAL_15M);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("DUPLICATE_OR_ORDER");
    const coverage = calculateHistoricalDataCoverage({
      timeframe: "15m",
      requestedStartMs: T0,
      requestedEndMs: T0 + INTERVAL_15M,
      candles: [{ openTime: T0 }, { openTime: T0 }],
    });
    expect(coverage.sufficient).toBe(false);
    expect(coverage.failureReasons).toContain("DUPLICATE_TIMESTAMPS");
  });

  it("14. descending rejected", () => {
    const result = inspectCandleSpacing(
      [T0 + INTERVAL_15M, T0],
      INTERVAL_15M,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("DUPLICATE_OR_ORDER");
    const coverage = calculateHistoricalDataCoverage({
      timeframe: "15m",
      requestedStartMs: T0,
      requestedEndMs: T0 + INTERVAL_15M,
      candles: [{ openTime: T0 + INTERVAL_15M }, { openTime: T0 }],
    });
    expect(coverage.sufficient).toBe(false);
    expect(coverage.failureReasons).toContain("SPACING_INVALID");
  });

  it("15. generic coverage complete sufficient", () => {
    const coverage = calculateHistoricalDataCoverage({
      timeframe: "15m",
      requestedStartMs: T0,
      requestedEndMs: T0 + 9 * INTERVAL_15M,
      candles: aligned(10, INTERVAL_15M),
    });
    expect(coverage.sufficient).toBe(true);
    expect(coverage.expectedCandleCount).toBe(10);
    expect(coverage.actualCandleCount).toBe(10);
    expect(coverage.failureReasons).toEqual([]);
  });

  it("16. start boundary missing insufficient", () => {
    const coverage = calculateHistoricalDataCoverage({
      timeframe: "15m",
      requestedStartMs: T0,
      requestedEndMs: T0 + 9 * INTERVAL_15M,
      candles: aligned(9, INTERVAL_15M, T0 + INTERVAL_15M),
    });
    expect(coverage.sufficient).toBe(false);
    expect(coverage.failureReasons).toContain("START_BOUNDARY_MISSING");
  });

  it("17. end boundary missing insufficient", () => {
    const coverage = calculateHistoricalDataCoverage({
      timeframe: "15m",
      requestedStartMs: T0,
      requestedEndMs: T0 + 9 * INTERVAL_15M,
      candles: aligned(6, INTERVAL_15M),
    });
    expect(coverage.sufficient).toBe(false);
    expect(coverage.failureReasons).toContain("END_BOUNDARY_MISSING");
  });

  it("18. internal missing insufficient", () => {
    const candles = [
      { openTime: T0 },
      { openTime: T0 + INTERVAL_15M },
      { openTime: T0 + 3 * INTERVAL_15M },
    ];
    const coverage = calculateHistoricalDataCoverage({
      timeframe: "15m",
      requestedStartMs: T0,
      requestedEndMs: T0 + 3 * INTERVAL_15M,
      candles,
    });
    expect(coverage.sufficient).toBe(false);
    expect(coverage.failureReasons).toContain("INTERNAL_MISSING_BARS");
  });

  it("19. off-grid interior insufficient", () => {
    const candles = [
      { openTime: T0 },
      { openTime: T0 + 1 },
      { openTime: T0 + INTERVAL_15M },
    ];
    const coverage = calculateHistoricalDataCoverage({
      timeframe: "15m",
      requestedStartMs: T0,
      requestedEndMs: T0 + INTERVAL_15M,
      candles,
    });
    expect(coverage.sufficient).toBe(false);
    expect(coverage.failureReasons).toContain("OFF_GRID_TIMESTAMPS");
  });

  it("20. Backtest 365d remains 35,089 sufficient", async () => {
    const { fromOpenTime, toOpenTime } = computePresetRangeMs(365, NOW);
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
    expect(computeExpected15mCandles(365, NOW)).toBe(35_089);
    expect(loaded.candles.length).toBe(35_089);
    expect(coverage.expectedCandleCount).toBe(35_089);
    expect(coverage.actualCandleCount).toBe(35_089);
    expect(coverage.sufficient).toBe(true);
  });

  it("overlapping provider pages after loader dedupe remain valid", async () => {
    const from = T0;
    const to = T0 + 1_599 * INTERVAL_15M;
    let pages = 0;
    const fetchPage = async (
      _s: string,
      _i: string,
      limit: number,
      startTime?: number,
    ) => {
      pages += 1;
      let t =
        startTime != null
          ? Math.ceil(startTime / INTERVAL_15M) * INTERVAL_15M
          : from;
      if (t > from) t -= INTERVAL_15M;
      const rows: Array<Array<string | number>> = [];
      while (rows.length < limit && t <= to) {
        rows.push(makeRow(t));
        t += INTERVAL_15M;
      }
      return {
        ok: true as const,
        configured: false,
        serviceState: "read-only" as const,
        source: "Binance public market data" as const,
        message: "overlap",
        data: rows,
      };
    };
    const loaded = await loadHistoricalCandles({
      symbol: "BTCUSDT",
      timeframe: "15m",
      fromOpenTime: from,
      toOpenTime: to,
      fetchPage: fetchPage as never,
    });
    expect(pages).toBeGreaterThan(1);
    expect(validateCandleSpacing(
      loaded.candles.map((c) => c.openTime),
      INTERVAL_15M,
    )).toBeNull();
    expect(
      calculateHistoricalDataCoverage({
        timeframe: "15m",
        requestedStartMs: from,
        requestedEndMs: to,
        candles: loaded.candles,
      }).sufficient,
    ).toBe(true);
  });

  it("34. production records unchanged / 37. SAFE unchanged", () => {
    expect(RETIRED_SAFE_STRATEGY_ID).toBe("SAFE_v44_i4060");
    expect(RETIRED_SAFE_PARAMS_HASH).toBe("7893ca3f0e30");
    expect(safeSha256()).toBeNull();
  });
});

describe("P3-A4 Backtest wrapper regression", () => {
  let isolated: ReturnType<typeof installIsolatedStrategyStore>;

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("21. Backtest 21k partial engine calls 0", async () => {
    isolated = installIsolatedStrategyStore();
    ensureStrategyStore();
    const fixtureId = saveStrategy(
      createStrategy({
        name: "fixture-historical-coverage",
        timeframe: "15m",
      }).id,
      { symbols: ["BTCUSDT"] },
    ).id;
    const { fromOpenTime, toOpenTime } = computePresetRangeMs(365, NOW);
    const engineSpy = vi.spyOn(backtestEngine, "runSafeV44Backtest");
    vi.spyOn(binanceReadOnly, "getKlinesRange").mockImplementation(
      createCappedKlineFetch(INTERVAL_15M, 21_000) as never,
    );
    await expect(
      runConfiguredBacktest({
        strategyId: fixtureId,
        symbols: ["BTCUSDT"],
        timeframe: "15m",
        fromOpenTime,
        toOpenTime,
        balance: 10_000,
        feeRate: 0.0004,
        slippageRate: 0.0002,
        fundingRate: 0,
        applyFunding: false,
        applySpread: false,
        spreadRate: 0,
        costStressMultipliers: [1],
        costGuardK: 3,
        dataMode: "binance",
      }),
    ).rejects.toMatchObject({
      code: BACKTEST_DATA_COVERAGE_INSUFFICIENT,
    });
    expect(engineSpy).toHaveBeenCalledTimes(0);
    isolated.cleanup();
  });

  it("27. Backtest pathological interior 1ms fails closed", () => {
    const from = T0;
    const to = T0 + INTERVAL_15M;
    const coverage = calculateBacktestDataCoverage({
      timeframe: "15m",
      requestedStartMs: from,
      requestedEndMs: to,
      candles: [{ openTime: from }, { openTime: from + 1 }, { openTime: to }],
    });
    expect(coverage.startBoundaryCovered).toBe(true);
    expect(coverage.endBoundaryCovered).toBe(true);
    expect(coverage.spacingValid).toBe(false);
    expect(coverage.sufficient).toBe(false);
    expect(coverage.failureReasons).toContain("OFF_GRID_TIMESTAMPS");
  });

  it("synthetic 20k helper is untouched", () => {
    const src = readFileSync("src/lib/rextora/data/ohlcvTypes.ts", "utf8");
    expect(src).toContain("const capped = Math.min(count, 20_000);");
    const candles = generateSyntheticCandles(4, 100, 0, {
      startOpenTime: T0,
      intervalMs: INTERVAL_15M,
    });
    expect(candles).toHaveLength(4);
  });
});
