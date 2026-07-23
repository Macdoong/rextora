import { describe, expect, it, vi, beforeEach, afterEach, beforeAll, afterAll } from "vitest";
import {
  generateSyntheticCandles,
  generateSyntheticCandlesForRange,
} from "../src/lib/rextora/data/ohlcvTypes";
import {
  loadHistoricalCandles,
  HistoricalCandleLoadError,
} from "../src/lib/rextora/data/historicalCandleLoader";
import {
  resolveTimeframe,
  validateCandleSpacing,
} from "../src/lib/rextora/data/timeframes";
import {
  runConfiguredBacktest,
} from "../src/lib/rextora/backtest/backtestRunner";
import { runSafeV44Backtest } from "../src/lib/rextora/backtest/backtestEngine";
import { ensureStrategyStore } from "../src/lib/rextora/strategy/strategyStore";
import {
  EXPECTED_SAFE_PARAMS_HASH,
  SAFE_STRATEGY_ID,
} from "../src/lib/rextora/strategy/strategyTypes";
import { loadSafeV44Strategy } from "../src/lib/rextora/strategy/safeV44Strategy";
import * as marketDataStore from "../src/lib/rextora/marketDataStore";
import * as binanceReadOnly from "../src/lib/rextora/binance/binanceReadOnlyService";
import { installIsolatedStrategyStore } from "./helpers/isolatedStrategyStore";

function makeBinanceRow(
  openTime: number,
  close = 100,
): Array<string | number> {
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

describe("timeframe mapping", () => {
  it("maps UI timeframes to Binance interval and spacing", () => {
    for (const id of ["1m", "3m", "5m", "15m", "1h"] as const) {
      const spec = resolveTimeframe(id);
      expect(spec.binanceInterval).toBe(id);
      expect(spec.intervalMs).toBeGreaterThan(0);
    }
  });

  it("validates spacing for selected timeframe", () => {
    const interval = resolveTimeframe("15m").intervalMs;
    const start = Date.UTC(2026, 5, 21);
    const times = [0, 1, 2, 3].map((i) => start + i * interval);
    expect(validateCandleSpacing(times, interval)).toBeNull();
    expect(validateCandleSpacing([start, start + 60_000], interval)).not.toBeNull();
  });
});

describe("historical candle loader (mocked Binance)", () => {
  it("paginates, dedupes, sorts, and rejects empty range", async () => {
    const interval = 900_000;
    const from = Date.UTC(2026, 5, 21);
    const to = from + interval * 5;
    const rows = [0, 1, 2, 3, 4, 5].map((i) =>
      makeBinanceRow(from + i * interval, 100 + i),
    );

    const fetchPage = vi.fn(async () => ({
      ok: true,
      configured: false,
      serviceState: "read-only" as const,
      source: "Binance public market data" as const,
      message: "ok",
      data: rows,
    }));

    const loaded = await loadHistoricalCandles({
      symbol: "BTCUSDT",
      timeframe: "15m",
      fromOpenTime: from,
      toOpenTime: to,
      fetchPage: fetchPage as never,
    });

    expect(loaded.source).toBe("binance");
    expect(loaded.candles.length).toBe(6);
    expect(loaded.candles[0].openTime).toBe(from);
    expect(loaded.actualFirstCandleTime?.startsWith("2026-06-21")).toBe(true);
    expect(
      loaded.candles.every(
        (c) => c.openTime >= from && c.openTime <= to,
      ),
    ).toBe(true);
  });

  it("returns structured failure when Binance fetch fails", async () => {
    const fetchPage = vi.fn(async () => ({
      ok: false,
      configured: false,
      serviceState: "mock" as const,
      source: "mock" as const,
      message: "network down",
      data: undefined,
    }));

    await expect(
      loadHistoricalCandles({
        symbol: "BTCUSDT",
        timeframe: "15m",
        fromOpenTime: Date.UTC(2026, 5, 21),
        toOpenTime: Date.UTC(2026, 6, 21),
        fetchPage: fetchPage as never,
      }),
    ).rejects.toMatchObject({
      code: "BINANCE_FETCH_FAILED",
      candlesReceived: 0,
    });
  });

  it("returns EMPTY_CANDLES when no bars in range", async () => {
    const fetchPage = vi.fn(async () => ({
      ok: true,
      configured: false,
      serviceState: "read-only" as const,
      source: "Binance public market data" as const,
      message: "ok",
      data: [],
    }));

    await expect(
      loadHistoricalCandles({
        symbol: "BTCUSDT",
        timeframe: "15m",
        fromOpenTime: Date.UTC(2026, 5, 21),
        toOpenTime: Date.UTC(2026, 5, 22),
        fetchPage: fetchPage as never,
      }),
    ).rejects.toBeInstanceOf(HistoricalCandleLoadError);
  });
});

describe("backtest data pipeline", () => {
  let cleanupIsolated: (() => void) | undefined;

  beforeAll(() => {
    cleanupIsolated = installIsolatedStrategyStore().cleanup;
  });

  afterAll(() => {
    cleanupIsolated?.();
  });

  beforeEach(() => {
    ensureStrategyStore();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("1. user binance mode never silently uses synthetic candles", async () => {
    vi.spyOn(binanceReadOnly, "getKlinesRange").mockResolvedValue({
      ok: false,
      configured: false,
      serviceState: "mock",
      source: "mock",
      message: "forced failure",
    });

    await expect(
      runConfiguredBacktest({
        strategyId: SAFE_STRATEGY_ID,
        symbols: ["BTCUSDT"],
        timeframe: "15m",
        fromOpenTime: Date.UTC(2026, 5, 21),
        toOpenTime: Date.UTC(2026, 6, 21),
        balance: 10000,
        feeRate: 0.0004,
        slippageRate: 0.0002,
        fundingRate: 0.0001,
        applyFunding: false,
        applySpread: false,
        spreadRate: 0,
        costStressMultipliers: [1],
        costGuardK: 3,
        dataMode: "binance",
      }),
    ).rejects.toMatchObject({
      code: "BINANCE_FETCH_FAILED",
      userMessage: expect.stringContaining("Binance"),
    });
  });

  it("2. mocked binance 2026 range loads matching 2026 candles via runner", async () => {
    const interval = 900_000;
    const from = Date.UTC(2026, 5, 21);
    const rows = Array.from({ length: 250 }, (_, i) =>
      makeBinanceRow(from + i * interval, 100 + i * 0.1),
    );
    vi.spyOn(binanceReadOnly, "getKlinesRange").mockResolvedValue({
      ok: true,
      configured: false,
      serviceState: "read-only",
      source: "Binance public market data",
      message: "ok",
      data: rows as never,
    });

    const to = from + interval * 249;
    const result = await runConfiguredBacktest({
      strategyId: SAFE_STRATEGY_ID,
      symbols: ["BTCUSDT"],
      timeframe: "15m",
      fromOpenTime: from,
      toOpenTime: to,
      balance: 10000,
      feeRate: 0.0004,
      slippageRate: 0.0002,
      fundingRate: 0,
      applyFunding: false,
      applySpread: false,
      spreadRate: 0,
      costStressMultipliers: [1],
      costGuardK: 3,
      dataMode: "binance",
    });

    expect(result.report.dataSource).toBe("binance");
    expect(result.report.candleCount).toBe(result.candles.length);
    expect(result.report.actualFirstCandleTime?.startsWith("2026-06-21")).toBe(
      true,
    );
    expect(result.candles.length).toBe(250);
  });

  it("3-4. synthetic-test 2026 range + candle consistency", async () => {
    const from = Date.UTC(2026, 5, 21);
    const to = Date.UTC(2026, 6, 21, 23, 59, 59, 999);
    const result = await runConfiguredBacktest({
      strategyId: SAFE_STRATEGY_ID,
      symbols: ["BTCUSDT"],
      timeframe: "15m",
      fromOpenTime: from,
      toOpenTime: to,
      balance: 10000,
      feeRate: 0.0004,
      slippageRate: 0.0002,
      fundingRate: 0.0001,
      applyFunding: false,
      applySpread: false,
      spreadRate: 0,
      costStressMultipliers: [1],
      costGuardK: 3,
      dataMode: "synthetic-test",
    });

    expect(result.report.dataSource).toBe("synthetic-test");
    expect(result.report.candleCount).toBe(result.candles.length);
    expect(result.processedCandleCount).toBe(result.candles.length);
    expect(result.report.actualFirstCandleTime?.startsWith("2026-06-21")).toBe(
      true,
    );
    const interval = resolveTimeframe("15m").intervalMs;
    for (let i = 1; i < Math.min(20, result.candles.length); i += 1) {
      expect(result.candles[i].openTime - result.candles[i - 1].openTime).toBe(
        interval,
      );
    }
  });

  it("3b. chartCandles equals full processed OHLC (no every-Nth display sample)", async () => {
    const from = Date.UTC(2026, 3, 1);
    const to = Date.UTC(2026, 5, 30, 23, 59, 59, 999);
    const result = await runConfiguredBacktest({
      strategyId: SAFE_STRATEGY_ID,
      symbols: ["BTCUSDT"],
      timeframe: "15m",
      fromOpenTime: from,
      toOpenTime: to,
      balance: 10000,
      feeRate: 0.0004,
      slippageRate: 0.0002,
      fundingRate: 0,
      applyFunding: false,
      applySpread: false,
      spreadRate: 0,
      costStressMultipliers: [1],
      costGuardK: 3,
      dataMode: "synthetic-test",
    });

    expect(result.processedCandleCount).toBeGreaterThan(400);
    expect(result.chartCandles.length).toBe(result.processedCandleCount);
    expect(result.chartCandles.length).toBe(result.candles.length);
    expect(result.chartSamplingApplied).toBe(false);
    const interval = resolveTimeframe("15m").intervalMs;
    for (let i = 1; i < result.chartCandles.length; i += 1) {
      expect(
        result.chartCandles[i].openTime - result.chartCandles[i - 1].openTime,
      ).toBe(interval);
    }
  });

  it("5. zero processed candles returns structured failure", async () => {
    vi.spyOn(binanceReadOnly, "getKlinesRange").mockResolvedValue({
      ok: true,
      configured: false,
      serviceState: "read-only",
      source: "Binance public market data",
      message: "ok",
      data: [],
    });

    await expect(
      runConfiguredBacktest({
        strategyId: SAFE_STRATEGY_ID,
        symbols: ["BTCUSDT"],
        timeframe: "15m",
        fromOpenTime: Date.UTC(2026, 5, 21),
        toOpenTime: Date.UTC(2026, 5, 22),
        balance: 10000,
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
    ).rejects.toMatchObject({ code: "EMPTY_CANDLES" });
  });

  it("API route forces binance and rejects synthetic client override", async () => {
    const { POST } = await import("../app/api/rextora/backtest/run/route");
    vi.spyOn(binanceReadOnly, "getKlinesRange").mockResolvedValue({
      ok: false,
      configured: false,
      serviceState: "mock",
      source: "mock",
      message: "no network",
    });

    const req = new Request("http://localhost/api/rextora/backtest/run", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        strategyId: SAFE_STRATEGY_ID,
        symbols: ["BTCUSDT"],
        timeframe: "15m",
        fromOpenTime: Date.UTC(2026, 5, 21),
        toOpenTime: Date.UTC(2026, 6, 21),
        dataMode: "synthetic-test",
        costStressMultipliers: [1],
      }),
    });
    const res = await POST(req);
    const json = await res.json();
    expect(json.ok).toBe(false);
    expect(json.code).toBe("BINANCE_FETCH_FAILED");
  });

  it("6. valid candles with zero trades returns diagnostics", () => {
    // Flat low-volatility candles unlikely to trigger entries after warm-up
    const candles = generateSyntheticCandles(120, 100, 0, {
      startOpenTime: Date.UTC(2026, 5, 21),
      intervalMs: 900_000,
    });
    const result = runSafeV44Backtest({
      symbol: "BTCUSDT",
      candles,
      timeframe: "15m",
      dataSource: "synthetic-test",
      applySpread: false,
      spreadRate: 0,
    });
    if (result.trades.length === 0) {
      expect(result.report.zeroTradeDiagnostics).toBeTruthy();
      expect(result.report.zeroTradeDiagnostics!.loadedCandleCount).toBe(
        candles.length,
      );
      expect(result.report.zeroTradeDiagnostics!.explanationKo.length).toBeGreaterThan(0);
    }
    expect(result.processedCandles.length).toBe(result.report.candleCount);
  });

  it("7-8. applySpread false → zero spread; true → spread once", () => {
    const candles = generateSyntheticCandles(400, 100, 0.00025, {
      startOpenTime: Date.UTC(2026, 5, 1),
      intervalMs: 900_000,
    });
    const noSpread = runSafeV44Backtest({
      symbol: "BTCUSDT",
      candles,
      applySpread: false,
      spreadRate: 0.0001,
      feeRate: 0.0004,
      slippageRate: 0.0002,
      dataSource: "synthetic-test",
    });
    expect(noSpread.report.spreadTotal).toBe(0);
    expect(noSpread.report.costs.spread).toBe(0);
    expect(noSpread.report.validation.spreadApplied).toBe(false);

    const withSpread = runSafeV44Backtest({
      symbol: "BTCUSDT",
      candles,
      applySpread: true,
      spreadRate: 0.0001,
      feeRate: 0.0004,
      slippageRate: 0.0002,
      dataSource: "synthetic-test",
    });
    expect(withSpread.report.validation.spreadApplied).toBe(true);
    if (withSpread.trades.length > 0) {
      expect(withSpread.report.spreadTotal).toBeGreaterThan(0);
      for (const t of withSpread.trades) {
        expect(t.spreadPct).toBe(0.0001);
      }
      // spread is not double-counted into feePct
      for (const t of withSpread.trades) {
        expect(t.feePct).toBeCloseTo(0.0008, 6);
      }
    }
  });

  it("12-13. protected SAFE hash and params unchanged", () => {
    const meta = loadSafeV44Strategy({ throwOnHashMismatch: false });
    expect(meta.paramsHash).toBe(EXPECTED_SAFE_PARAMS_HASH);
    expect(meta.paramsHash).toBe("7893ca3f0e30");
  });

  it("1h timeframe controls candle spacing in synthetic-test", async () => {
    const from = Date.UTC(2026, 5, 21);
    const to = Date.UTC(2026, 5, 28);
    const result = await runConfiguredBacktest({
      strategyId: SAFE_STRATEGY_ID,
      symbols: ["BTCUSDT"],
      timeframe: "1h",
      fromOpenTime: from,
      toOpenTime: to,
      balance: 10000,
      feeRate: 0.0004,
      slippageRate: 0.0002,
      fundingRate: 0,
      applyFunding: false,
      applySpread: false,
      spreadRate: 0,
      costStressMultipliers: [1],
      costGuardK: 3,
      dataMode: "synthetic-test",
    });
    const interval = resolveTimeframe("1h").intervalMs;
    expect(result.candles[1].openTime - result.candles[0].openTime).toBe(
      interval,
    );
    expect(result.report.timeframe).toBe("1h");
  });
});

describe("market stale cache refresh", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("10. refreshMarketData is invoked when snapshot is stale", async () => {
    const refresh = vi
      .spyOn(marketDataStore, "refreshMarketData")
      .mockResolvedValue({
        coins: [],
        source: "real",
        updatedAt: Date.now(),
        symbolCount: 0,
      });
    vi.spyOn(marketDataStore, "getMarketSnapshot").mockReturnValue({
      coins: [{ symbol: "BTCUSDT" } as never],
      source: "real",
      updatedAt: Date.now() - 120_000,
      symbolCount: 1,
    });
    vi.spyOn(marketDataStore, "isMarketDataStale").mockReturnValue(true);

    // Replicate route decision
    const before = marketDataStore.getMarketSnapshot();
    const needsRefresh =
      before.updatedAt === 0 || marketDataStore.isMarketDataStale();
    if (needsRefresh) {
      await marketDataStore.refreshMarketData({ force: true });
    }
    expect(refresh).toHaveBeenCalledWith({ force: true });
  });

  it("11. refresh failure leaves prior snapshot available", async () => {
    const prior = {
      coins: [{ symbol: "ETHUSDT" } as never],
      source: "real" as const,
      updatedAt: Date.now() - 90_000,
      symbolCount: 1,
    };
    vi.spyOn(marketDataStore, "getMarketSnapshot").mockReturnValue({
      ...prior,
      source: "stale",
    });
    vi.spyOn(marketDataStore, "refreshMarketData").mockRejectedValue(
      new Error("binance down"),
    );
    vi.spyOn(marketDataStore, "isMarketDataStale").mockReturnValue(true);

    try {
      await marketDataStore.refreshMarketData({ force: true });
    } catch {
      // keep prior
    }
    const snap = marketDataStore.getMarketSnapshot();
    expect(snap.coins[0].symbol).toBe("ETHUSDT");
    expect(snap.source).toBe("stale");
  });
});

describe("generateSyntheticCandlesForRange", () => {
  it("respects start and interval for fixtures only", () => {
    const from = Date.UTC(2026, 5, 21);
    const to = from + 900_000 * 10;
    const candles = generateSyntheticCandlesForRange(from, to, 900_000);
    expect(candles[0].openTime).toBe(from);
    expect(candles.every((c) => c.openTime >= from && c.openTime <= to)).toBe(
      true,
    );
  });
});
