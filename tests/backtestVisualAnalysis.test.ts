import { describe, expect, it } from "vitest";
import {
  generateSyntheticCandles,
} from "../src/lib/rextora/data/ohlcvTypes";
import { runSafeV44Backtest } from "../src/lib/rextora/backtest/backtestEngine";
import {
  buildCalendarMonthlyReturns,
} from "../src/lib/rextora/backtest/backtestReport";
import {
  buildCostLedger,
  buildVisualAnalysisModel,
  filterTrades,
  formatKoreanDateTime,
  formatUsdt,
  aggregateCalendarMonthly,
} from "../src/lib/rextora/backtest/visualAnalysis";
import {
  evaluateStrategyVerdict,
  VERDICT_THRESHOLDS,
} from "../src/lib/rextora/backtest/strategyVerdict";
import { EXPECTED_SAFE_PARAMS_HASH } from "../src/lib/rextora/strategy/strategyTypes";
import { loadSafeV44Strategy } from "../src/lib/rextora/strategy/safeV44Strategy";

function runFixture(opts?: {
  from?: number;
  count?: number;
  applySpread?: boolean;
}) {
  const from = opts?.from ?? Date.UTC(2026, 3, 22);
  const count = opts?.count ?? 400;
  const candles = generateSyntheticCandles(count, 100, 0.00025, {
    startOpenTime: from,
    intervalMs: 900_000,
  });
  return runSafeV44Backtest({
    symbol: "BTCUSDT",
    candles,
    timeframe: "15m",
    balance: 10_000,
    feeRate: 0.0004,
    slippageRate: 0.0002,
    fundingRate: 0.0001,
    applyFunding: false,
    applySpread: opts?.applySpread ?? true,
    spreadRate: 0.0001,
    dataSource: "synthetic-test",
    requestedFrom: new Date(from).toISOString(),
    requestedTo: new Date(from + count * 900_000).toISOString(),
  });
}

describe("backtest visual analysis", () => {
  it("builds canonical model with calendar monthly buckets", () => {
    const result = runFixture({
      from: Date.UTC(2026, 3, 22),
      count: 900,
    });
    const model = buildVisualAnalysisModel({
      report: result.report,
      trades: result.trades,
      equityCurve: result.equityCurve,
      candles: result.processedCandles,
    });

    expect(model.equitySeries.id).toBe("equity");
    expect(model.drawdownSeries.id).toBe("drawdown");
    expect(model.priceCandles.length).toBe(result.processedCandles.length);
    expect(model.report.strategyHash).toBe(EXPECTED_SAFE_PARAMS_HASH);

    // Monthly returns are calendar YYYY-MM, not T## trade buckets
    for (const m of model.monthlyReturns) {
      expect(m.monthKey).toMatch(/^\d{4}-\d{2}$/);
      expect(m.labelKo).toContain("월");
      expect(m.monthKey.startsWith("T")).toBe(false);
    }
    // ~3 months from Apr 22 across 900*15m ≈ 9.4 days — at most 2 months
    expect(model.monthlyReturns.length).toBeLessThanOrEqual(3);
    expect(model.monthlyReturns.length).toBeGreaterThanOrEqual(1);
  });

  it("does not label trade-index returns as monthly", () => {
    const rows = buildCalendarMonthlyReturns(
      [
        {
          symbol: "BTCUSDT",
          side: "LONG",
          signalType: "trend_long",
          entryBar: 0,
          exitBar: 5,
          entryPrice: 100,
          exitPrice: 101,
          stopLoss: 99,
          takeProfit: 102,
          leverage: 2,
          pnlPct: 0.01,
          feePct: 0.0008,
          exitReason: "take_profit",
          entryTime: Date.UTC(2026, 3, 10),
          exitTime: Date.UTC(2026, 3, 11),
          netPnlUsdt: 10,
          feeCostUsdt: 1,
        },
        {
          symbol: "BTCUSDT",
          side: "SHORT",
          signalType: "trend_short",
          entryBar: 20,
          exitBar: 25,
          entryPrice: 100,
          exitPrice: 99,
          stopLoss: 101,
          takeProfit: 98,
          leverage: 2,
          pnlPct: 0.01,
          feePct: 0.0008,
          exitReason: "take_profit",
          entryTime: Date.UTC(2026, 4, 10),
          exitTime: Date.UTC(2026, 4, 11),
          netPnlUsdt: 12,
          feeCostUsdt: 1,
        },
      ],
      10_000,
    );
    expect(rows).toHaveLength(2);
    expect(rows[0].month).toBe("2026-04");
    expect(rows[1].month).toBe("2026-05");
    expect(rows[0].labelKo).toBe("2026년 4월");
  });

  it("reconciles cost ledger: gross - costs ≈ net", () => {
    const result = runFixture({ applySpread: true });
    const model = buildVisualAnalysisModel({
      report: result.report,
      trades: result.trades,
      equityCurve: result.equityCurve,
      candles: result.processedCandles,
    });
    const { costs } = model;
    const expected =
      costs.grossPnlBeforeCostsUsdt - costs.totalCostUsdt;
    expect(Math.abs(costs.netPnlAfterCostsUsdt - expected)).toBeLessThan(0.05);
    expect(costs.feeCostPctOfInitialCapital).toBeGreaterThanOrEqual(0);
    expect(costs.denominatorNoteKo.length).toBeGreaterThan(10);
    // Legacy rate-sum field still present on report
    expect(result.report.costs.fees).toBeGreaterThanOrEqual(0);
    expect(result.report.costs.feeCostUsdt).toBeGreaterThanOrEqual(0);
  });

  it("formats Korean datetime and USDT without raw unix", () => {
    const s = formatKoreanDateTime(Date.UTC(2026, 5, 21, 3, 15));
    expect(s).not.toMatch(/^[0-9]{13}$/);
    expect(s).toMatch(/2026/);
    expect(formatUsdt(1234.5)).toContain("USDT");
    expect(formatUsdt(1234.5)).toMatch(/1/);
  });

  it("filters long/short/win/loss and maps markers to trade ids", () => {
    const result = runFixture({ count: 500 });
    const model = buildVisualAnalysisModel({
      report: result.report,
      trades: result.trades,
      equityCurve: result.equityCurve,
      candles: result.processedCandles,
    });
    if (model.trades.length === 0) return;
    const longs = filterTrades(model.trades, "long");
    expect(longs.every((t) => t.side === "LONG")).toBe(true);
    expect(model.trades[0].entryTime).toBeTypeOf("number");
    expect(model.trades[0].exitTime).toBeTypeOf("number");
    expect(model.tradeMarkers.some((m) => m.tradeId)).toBe(true);
  });

  it("equity/drawdown points share timestamps for crosshair sync", () => {
    const result = runFixture({ count: 400 });
    const model = buildVisualAnalysisModel({
      report: result.report,
      trades: result.trades,
      equityCurve: result.equityCurve,
      candles: result.processedCandles,
    });
    expect(model.equityPoints.length).toBe(model.drawdownPoints.length);
    if (model.equityPoints.length > 1) {
      expect(model.equityPoints[1].x).toBe(model.drawdownPoints[1].x);
    }
  });

  it("verdict thresholds are deterministic", () => {
    const v = evaluateStrategyVerdict({
      totalReturn: -0.07,
      mdd: -0.08,
      winRate: 0.27,
      tradeCount: 200,
      totalCostPctOfInitialCapital: 0.5,
      profitFactor: 0.8,
    });
    expect(v.labels).toContain("비용 부담 매우 높음");
    expect(v.usable).toBe("cost_dominated");
    expect(VERDICT_THRESHOLDS.veryHighCostPctOfCapital).toBe(0.4);
  });

  it("large fixture builds without throwing", () => {
    // Lightweight stand-in for 8671/775 — still stress aggregation paths
    const from = Date.UTC(2026, 3, 22);
    const candles = generateSyntheticCandles(2000, 100, 0.0002, {
      startOpenTime: from,
      intervalMs: 900_000,
    });
    const result = runSafeV44Backtest({
      symbol: "BTCUSDT",
      candles,
      timeframe: "15m",
      applySpread: true,
      spreadRate: 0.0001,
      dataSource: "synthetic-test",
    });
    const model = buildVisualAnalysisModel({
      report: result.report,
      trades: result.trades,
      equityCurve: result.equityCurve,
      candles: result.processedCandles,
    });
    // Full OHLC must reach the chart — no display downsampling
    expect(model.sampledPriceCandles.length).toBe(model.priceCandles.length);
    expect(model.holdingTimeBuckets.length).toBe(6);
    expect(model.winLossSummary.wins + model.winLossSummary.losses + model.winLossSummary.flats).toBe(
      model.trades.length,
    );
  });

  it("protected SAFE hash unchanged", () => {
    const meta = loadSafeV44Strategy({ throwOnHashMismatch: false });
    expect(meta.paramsHash).toBe("7893ca3f0e30");
    expect(meta.paramsHash).toBe(EXPECTED_SAFE_PARAMS_HASH);
  });

  it("aggregateCalendarMonthly matches report monthly for same trades", () => {
    const result = runFixture({ count: 600 });
    const enriched = buildVisualAnalysisModel({
      report: result.report,
      trades: result.trades,
      equityCurve: result.equityCurve,
      candles: result.processedCandles,
    });
    const fromReport = buildCalendarMonthlyReturns(
      result.trades,
      result.report.startingBalance,
    );
    const fromVisual = aggregateCalendarMonthly(
      enriched.trades,
      result.report.startingBalance,
    );
    expect(fromVisual.map((m) => m.monthKey)).toEqual(
      fromReport.map((m) => m.month),
    );
  });
});

describe("chart shell interaction contract", () => {
  it("documents ctrl+wheel zoom vs page scroll (unit-level flags)", () => {
    const fs = require("node:fs") as typeof import("node:fs");
    const path = require("node:path") as typeof import("node:path");
    const src = fs.readFileSync(
      path.join(process.cwd(), "components/rextora/charts/ChartShell.tsx"),
      "utf8",
    );
    // Regular wheel must not zoom; only Ctrl/Cmd+wheel zooms.
    expect(src).toContain("if (!(e.ctrlKey || e.metaKey)) return;");
    expect(src).toContain("차트 탐색");
    expect(src).toContain("data-testid=\"chart-explore\"");
    expect(src).toContain("data-testid=\"chart-fullscreen-toggle\"");
    expect(src).not.toContain("e.ctrlKey || e.metaKey || explore");
  });
});
