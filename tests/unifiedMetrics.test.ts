import { describe, expect, it, beforeEach } from "vitest";
import {
  buildUnifiedTradeResult,
  computeGrossPnlUsdt,
  computePriceReturnFraction
} from "../src/lib/rextora/metrics/tradeResult";
import {
  BINANCE_FUTURES_TAKER_FEE,
  computeRoundTripFee,
  computeTotalCostFraction,
  evaluateUnifiedCost,
  getDefaultCostRates
} from "../src/lib/rextora/metrics/unifiedCost";
import { calculateCostBreakdown, passesCostRule } from "../src/lib/rextora/costEngine";
import { evaluateCostGuard } from "../src/lib/rextora/cost/costGuard";
import { CONTEXT_FALLBACK_PARAMS } from "../src/lib/rextora/strategy/safeV44Params";
import { resetUnifiedTradeResultsForTests, appendUnifiedTradeResult, getTodayTradeResults } from "../src/lib/rextora/metrics/tradeResultStore";
import { getUnifiedMetrics, computeRiskUsagePct } from "../src/lib/rextora/metrics/metricsEngine";
import { getUnifiedRiskView } from "../src/lib/rextora/metrics/riskService";

describe("unified cost engine", () => {
  it("uses Binance taker fee * 2 for round trip", () => {
    expect(computeRoundTripFee()).toBeCloseTo(BINANCE_FUTURES_TAKER_FEE * 2, 8);
  });

  it("computes identical totals for costGuard adapter", () => {
    const rates = getDefaultCostRates({ fundingRate: 0.0001 });
    const parts = computeTotalCostFraction(rates);
    const guard = evaluateCostGuard({
      entryPrice: 100,
      takeProfitPrice: 101,
      side: "LONG",
      atr: 1,
      params: { cost_guard: true, cost_guard_k: 3 },
      fundingRate: 0.0001
    });
    expect(guard.feeRoundTrip).toBeCloseTo(parts.feeRoundTrip, 8);
    expect(guard.slippageCost).toBeCloseTo(parts.slippageCost, 8);
    expect(guard.totalCostPct).toBeCloseTo(parts.totalCost, 8);
  });

  it("costEngine percent breakdown matches fraction * 100", () => {
    const b = calculateCostBreakdown({ symbol: "SOLUSDT", expectedProfitPct: 1.85 });
    expect(b.roundTripFeePct).toBeCloseTo(0.08, 3);
    expect(passesCostRule(b)).toBe(typeof b.passed === "boolean");
  });

  it("evaluateUnifiedCost gates on k multiplier", () => {
    const blocked = evaluateUnifiedCost({
      entryPrice: 100,
      takeProfitPrice: 100.1,
      side: "LONG",
      costGuardK: 3,
      includeSafetyMargin: false
    });
    expect(blocked.passed).toBe(false);
  });
});

describe("unified trade result", () => {
  it("computes gross/net with fees", () => {
    const trade = buildUnifiedTradeResult({
      symbol: "SOLUSDT",
      side: "LONG",
      strategyId: "SAFE_v44_i4060",
      entryPrice: 100,
      exitPrice: 101,
      quantity: 10,
      leverage: 2,
      exitReason: "익절",
      mode: "PAPER"
    });
    expect(trade.grossPnl).toBeCloseTo(10, 4);
    expect(trade.fee).toBeGreaterThan(0);
    expect(trade.netPnl).toBeLessThan(trade.grossPnl);
    expect(trade.realizedUsdt).toBe(trade.netPnl);
    expect(trade.grossPct).toBeCloseTo(1, 2);
    expect(trade.netPct).toBeLessThan(trade.grossPct);
  });

  it("matches short price return", () => {
    expect(computePriceReturnFraction("SHORT", 100, 99)).toBeCloseTo(0.01, 6);
    expect(computeGrossPnlUsdt("SHORT", 100, 99, 2)).toBeCloseTo(2, 6);
  });
});

describe("unified metrics + risk", () => {
  beforeEach(() => {
    resetUnifiedTradeResultsForTests([]);
  });

  it("aggregates today trades into metrics", () => {
    const trade = buildUnifiedTradeResult({
      symbol: "BTCUSDT",
      side: "LONG",
      strategyId: "SAFE_v44_i4060",
      entryPrice: 50000,
      exitPrice: 50500,
      quantity: 0.1,
      leverage: 2,
      exitReason: "익절",
      mode: "PAPER",
      timestamp: new Date().toISOString()
    });
    appendUnifiedTradeResult(trade);
    expect(getTodayTradeResults().length).toBeGreaterThanOrEqual(1);
    const m = getUnifiedMetrics();
    expect(m.todayTradeCount).toBeGreaterThanOrEqual(1);
    expect(m.todayFeeUsdt).toBeGreaterThanOrEqual(0);
    expect(m.todayRealizedPnlUsdt).toBeCloseTo(trade.realizedUsdt, 4);
  });

  it("risk usage formula is abs(current/limit)*100", () => {
    expect(computeRiskUsagePct(-1.28, -5)).toBeCloseTo(25.6, 1);
    const view = getUnifiedRiskView();
    expect(view.usagePct).toBeGreaterThanOrEqual(0);
    expect(view).toHaveProperty("remainingDailyLossPct");
    expect(view).toHaveProperty("remainingTrades");
  });

  it("SAFE params still load via cost_guard defaults", () => {
    expect(CONTEXT_FALLBACK_PARAMS.cost_guard_k).toBe(3);
  });
});
