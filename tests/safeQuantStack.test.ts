import { describe, expect, it } from "vitest";
import {
  computeAtrSeries,
  computeEmaSeries,
  computeIndicators,
  computeResistanceHighSeries,
  computeSlopeSeries,
  computeVolumeRatioSeries,
  computeRsiSeries
} from "../src/lib/rextora/indicator/indicatorEngine";
import { generateSyntheticCandles } from "../src/lib/rextora/data/ohlcvTypes";
import { CONTEXT_FALLBACK_PARAMS } from "../src/lib/rextora/strategy/safeV44Params";
import { loadSafeV44Strategy, validateSafeV44ParamsHash } from "../src/lib/rextora/strategy/safeV44Strategy";
import { EXPECTED_SAFE_PARAMS_HASH } from "../src/lib/rextora/strategy/strategyTypes";
import { evaluateSafeV44Signal } from "../src/lib/rextora/signal/safeV44SignalEngine";
import { evaluateCostGuard } from "../src/lib/rextora/cost/costGuard";
import { calculateSafeV44Risk } from "../src/lib/rextora/risk/safeV44RiskEngine";
import { runSafeV44Backtest } from "../src/lib/rextora/backtest/backtestEngine";
import { generateAiTradeReport } from "../src/lib/rextora/report/aiTradeReport";

describe("SAFE strategy loader", () => {
  it("verifies params_hash 7893ca3f0e30", () => {
    const validation = validateSafeV44ParamsHash();
    expect(validation.expected).toBe(EXPECTED_SAFE_PARAMS_HASH);
    expect(validation.ok).toBe(true);
    expect(validation.metadata.hashVerified).toBe(true);
  });

  it("marks missing research files and exposes full params", () => {
    const meta = loadSafeV44Strategy({ throwOnHashMismatch: false });
    expect(meta.lockedResearchFilesFound).toBe(false);
    expect(meta.params.ema_fast).toBe(20);
    expect(meta.params.cost_guard_k).toBe(3);
    expect(meta.params.base_bal_pct).toBe(0.02);
    expect(["context_fallback", "data_file", "locked_file"]).toContain(meta.sourceStatus);
  });
});

describe("indicatorEngine", () => {
  const values = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

  it("computes EMA", () => {
    const ema = computeEmaSeries(values, 3);
    expect(ema).toHaveLength(10);
    expect(ema[0]).toBe(1);
    expect(ema[9]).toBeGreaterThan(ema[0]);
  });

  it("computes RSI", () => {
    const rsi = computeRsiSeries(values, 5);
    expect(rsi[rsi.length - 1]).toBeGreaterThan(50);
  });

  it("computes ATR", () => {
    const highs = values.map((v) => v + 0.5);
    const lows = values.map((v) => v - 0.5);
    const atr = computeAtrSeries(highs, lows, values, 3);
    expect(atr[atr.length - 1]).toBeGreaterThan(0);
  });

  it("computes volume ratio, resistance, slope", () => {
    const vols = [10, 10, 10, 40, 10];
    expect(computeVolumeRatioSeries(vols, 3)[3]).toBeGreaterThan(1);
    expect(computeResistanceHighSeries([1, 3, 2, 5, 4], 3)[3]).toBe(5);
    expect(computeSlopeSeries([100, 101, 102, 103, 110], 4)[4]).toBeCloseTo(0.1, 5);
  });

  it("builds indicator series from candles", () => {
    const candles = generateSyntheticCandles(250);
    const series = computeIndicators(candles, CONTEXT_FALLBACK_PARAMS);
    expect(series.latest).not.toBeNull();
    expect(series.snapshots).toHaveLength(250);
  });
});

describe("safeV44SignalEngine", () => {
  it("is deterministic for identical inputs", () => {
    const candles = generateSyntheticCandles(260, 100, 0.0002);
    const series = computeIndicators(candles, CONTEXT_FALLBACK_PARAMS);
    const a = evaluateSafeV44Signal({
      symbol: "BTCUSDT",
      series,
      params: CONTEXT_FALLBACK_PARAMS,
      paramsHash: EXPECTED_SAFE_PARAMS_HASH
    });
    const b = evaluateSafeV44Signal({
      symbol: "BTCUSDT",
      series,
      params: CONTEXT_FALLBACK_PARAMS,
      paramsHash: EXPECTED_SAFE_PARAMS_HASH
    });
    expect(a).toEqual(b);
    expect(a.paramsHash).toBe(EXPECTED_SAFE_PARAMS_HASH);
  });
});

describe("costGuard + riskEngine", () => {
  it("blocks when reward is below cost_guard_k", () => {
    const blocked = evaluateCostGuard({
      entryPrice: 100,
      takeProfitPrice: 100.05,
      side: "LONG",
      atr: 1,
      params: { cost_guard: true, cost_guard_k: 3 }
    });
    expect(blocked.passed).toBe(false);
  });

  it("passes with wide TP and calculates SL/TP/leverage", () => {
    const risk = calculateSafeV44Risk({
      entryPrice: 100,
      atr: 1,
      atrPct: 0.01,
      side: "LONG",
      signalType: "trend_long",
      balance: 10_000,
      params: CONTEXT_FALLBACK_PARAMS
    });
    expect(risk.stopLossPrice).toBeLessThan(100);
    expect(risk.takeProfitPrice).toBeGreaterThan(100);
    expect(risk.leverage).toBeGreaterThanOrEqual(CONTEXT_FALLBACK_PARAMS.lev_min);
    expect(risk.leverage).toBeLessThanOrEqual(CONTEXT_FALLBACK_PARAMS.lev_max);

    const cost = evaluateCostGuard({
      entryPrice: risk.entryPrice,
      takeProfitPrice: risk.takeProfitPrice,
      side: "LONG",
      atr: 1,
      params: CONTEXT_FALLBACK_PARAMS
    });
    expect(cost.passed).toBe(true);
  });
});

describe("backtestEngine", () => {
  it("runs SAFE backtest without live orders", () => {
    const result = runSafeV44Backtest({
      symbol: "BTCUSDT",
      candles: generateSyntheticCandles(320, 100, 0.00025)
    });
    expect(result.report.strategyHash).toBe(EXPECTED_SAFE_PARAMS_HASH);
    expect(result.report.tradeCount).toBeGreaterThanOrEqual(0);
    expect(Array.isArray(result.trades)).toBe(true);
  });
});

describe("aiTradeReport", () => {
  it("analyzes completed trades only", () => {
    const report = generateAiTradeReport({
      symbol: "ETHUSDT",
      side: "LONG",
      entryReason: "trend_long",
      exitReason: "익절",
      entryPrice: 100,
      exitPrice: 102,
      realizedPnlPct: 2,
      mode: "PAPER",
      paramsHash: EXPECTED_SAFE_PARAMS_HASH
    });
    expect(report.whyEntered).toContain("trend_long");
    expect(report.summary).toContain("ETHUSDT");
  });
});
