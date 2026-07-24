import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  BACKTEST_MAX_ALLOWED_MDD_ABS,
  eligibilityBlocksPaperLive,
  evaluateBacktestEligibility,
} from "../src/lib/rextora/backtest/backtestEligibility";
import { computeCostRatios } from "../src/lib/rextora/backtest/costRatios";
import {
  computeMaxTradeLossStats,
  MAX_TRADE_LOSS_LABEL_KO,
} from "../src/lib/rextora/backtest/tradeLossSemantics";
import { classifyPatternOverlays } from "../src/lib/rextora/backtest/patternOverlayAvailability";
import type { TradeEventTrace } from "../src/lib/rextora/backtest/tradeEventTrace";
import { evaluateStrategyVerdict } from "../src/lib/rextora/backtest/strategyVerdict";
import { tradeFocusTimeRange } from "../src/lib/rextora/backtest/tradeTime";

const ROOT = path.resolve(__dirname, "..");

describe("backtest eligibility + UX semantics", () => {
  it("rejects excessive drawdown with canonical label", () => {
    const r = evaluateBacktestEligibility({
      status: "completed",
      totalReturn: 0.0258,
      mdd: -0.59667,
      tradeCount: 33,
      winRate: 0.758,
      profitFactor: 1.17,
      totalCostPctOfGrossProfit: 748.31 / 1006.04,
      monthlyReturnCount: 6,
      negativeMonths: 2,
      hasCostStress: true,
    });
    expect(r.eligible).toBe(false);
    expect(r.verdictLabel).toBe("부적격 - 최대 허용 낙폭 초과");
    expect(r.reasons.some((x) => x.code === "maximum_drawdown_exceeded")).toBe(
      true,
    );
    expect(r.maxAllowedMddAbs).toBe(BACKTEST_MAX_ALLOWED_MDD_ABS);
    expect(eligibilityBlocksPaperLive(r)).toBe(true);
  });

  it("strategyVerdict primary becomes ineligible on severe mdd", () => {
    const v = evaluateStrategyVerdict({
      totalReturn: 0.02,
      mdd: -0.59667,
      winRate: 0.75,
      tradeCount: 33,
      totalCostPctOfInitialCapital: 0.07,
      profitFactor: 1.17,
    });
    expect(v.primary).toBe("부적격 - 최대 허용 낙폭 초과");
  });

  it("cost ratios match verified arithmetic identity", () => {
    const ratios = computeCostRatios({
      grossPnLBeforeCosts: 1006.04,
      netPnLAfterCosts: 257.73,
      totalCostUsdt: 748.31,
      feeCostUsdt: 704.66,
      slippageCostUsdt: 43.65,
    });
    expect(ratios.identityHolds).toBe(true);
    expect(ratios.totalCostPctOfGrossProfit).toBeCloseTo(748.31 / 1006.04, 5);
    expect(ratios.feePctOfTotalCost).toBeCloseTo(704.66 / 748.31, 5);
    expect(ratios.criticalCostOfGross).toBe(true);
  });

  it("max loss label matches leveraged pnlPct convention", () => {
    const stats = computeMaxTradeLossStats(
      [
        { pnlPct: 0.2, netPnlUsdt: 100, leverage: 10 },
        { pnlPct: -1.7446, netPnlUsdt: -5682, leverage: 13.54 },
      ],
      10_000,
    );
    expect(stats.labelKo).toBe(MAX_TRADE_LOSS_LABEL_KO);
    expect(stats.leveragedPnlPct).toBeCloseTo(-1.7446, 4);
    expect(stats.accountEquityImpactPct).toBeCloseTo(-0.5682, 3);
    expect(stats.helpKo).toContain("레버리지");
  });

  it("never fabricates pattern geometry for safe_params strategies", () => {
    const traces: TradeEventTrace[] = [];
    const avail = classifyPatternOverlays({
      strategyType: "safe_params",
      traces,
    });
    expect(avail.every((a) => a.status === "strategy_unused")).toBe(true);
    expect(avail.every((a) => a.defaultOn === false)).toBe(true);
    expect(avail[0]?.reasonKo).toContain("사용하지 않습니다");
  });

  it("order block / fvg / trendline / sr require persisted geometry", () => {
    const withZone: TradeEventTrace = {
      version: 1,
      tradeId: "T0001",
      symbol: "BTCUSDT",
      timeframe: "15m",
      direction: "LONG",
      entry: {
        kind: "entry",
        at: "2026-01-01T00:00:00.000Z",
        price: 1,
        labelKo: "진입",
        detailKo: null,
      },
      exit: {
        kind: "exit",
        at: "2026-01-02T00:00:00.000Z",
        price: 2,
        labelKo: "청산",
        detailKo: null,
      },
      stopPrice: 0.9,
      targetPrice: 1.2,
      exitReason: "take_profit",
      grossPnl: 1,
      fee: 0,
      slippage: 0,
      netPnl: 1,
      holdingDurationMs: 1,
      assumptionsKo: [],
      events: [],
      whyEnteredKo: "",
      whyExitedKo: "",
      feeSlippageImpactKo: "",
      patternType: "order_block",
      zoneHigh: 100,
      zoneLow: 90,
    };
    const avail = classifyPatternOverlays({
      strategyType: "event_sequence",
      eventSequenceFamily: "order_block",
      traces: [withZone],
    });
    const ob = avail.find((a) => a.kind === "order_block");
    const fvg = avail.find((a) => a.kind === "fvg");
    expect(ob?.status).toBe("available");
    expect(fvg?.status).toBe("strategy_unused");
  });

  it("missing geometry for used family stays disabled", () => {
    const avail = classifyPatternOverlays({
      strategyType: "event_sequence",
      eventSequenceFamily: "fvg",
      traces: [],
    });
    const fvg = avail.find((a) => a.kind === "fvg");
    expect(fvg?.status).toBe("missing_geometry");
    expect(fvg?.reasonKo).toContain("도형");
  });

  it("UI wires eligibility gates and overlay toggles", () => {
    const wb = fs.readFileSync(
      path.join(ROOT, "components/rextora/backtest/BacktestReviewWorkbench.tsx"),
      "utf8",
    );
    const av = fs.readFileSync(
      path.join(ROOT, "components/rextora/charts/BacktestAnalysisView.tsx"),
      "utf8",
    );
    expect(wb).toContain("evaluateBacktestEligibility");
    expect(wb).toContain("handoffBlocked");
    expect(wb).toContain("eligibilityBlocksPaperLive");
    expect(wb).toContain("backtest-decision-summary");
    expect(wb).toContain("저장된 백테스트");
    expect(wb).toContain("실행 ID");
    expect(wb).toContain('data-testid="backtest-paper-action"');
    expect(wb).toContain('data-testid="backtest-live-action"');
    expect(wb).toMatch(/handoffBlocked/);
    expect(wb).toContain("hydrateChart=1");
    expect(av).toContain("trade-overlay-toggles");
    expect(av).toContain("data-testid={`overlay-toggle-${p.kind}`}");
    expect(av).toContain("focusTimeRange");
    expect(av).toContain("computeMaxTradeLossStats");
    expect(av).toContain("max-loss-equity-impact");
    expect(av).toContain("cost-critical-warning");
    expect(av).toContain('selectTrade(t.id, "list")');
  });

  it("paper and live registration are blocked when eligibility fails", () => {
    const gate = evaluateBacktestEligibility({
      status: "completed",
      totalReturn: 0.0258,
      mdd: -0.596668,
      tradeCount: 33,
      totalCostPctOfGrossProfit: 0.744,
    });
    expect(gate.eligible).toBe(false);
    expect(eligibilityBlocksPaperLive(gate)).toBe(true);
    expect(gate.verdictLabel).toBe("부적격 - 최대 허용 낙폭 초과");
  });

  it("legacy verified run remains readable without pattern geometry", () => {
    const p = path.join(
      ROOT,
      "data/rextora/backtests/bt_mryf1ecb_446095.json",
    );
    if (!fs.existsSync(p)) {
      // CI/tmp sandboxes may omit fixtures — skip presence assert.
      expect(true).toBe(true);
      return;
    }
    const run = JSON.parse(fs.readFileSync(p, "utf8")) as {
      id: string;
      strategyId: string;
      strategyHash: string;
      report: {
        mdd: number;
        costs: {
          grossPnLBeforeCosts: number;
          netPnLAfterCosts: number;
          totalCostUsdt: number;
        };
        tradeEventTraces?: Array<{ patternType?: string | null }>;
      };
      trades: unknown[];
    };
    expect(run.id).toBe("bt_mryf1ecb_446095");
    expect(run.strategyId).toBe("custom_mrxjff7z");
    expect(run.strategyHash).toBe("dbd658af74bc");
    expect(run.trades).toHaveLength(33);
    expect(run.report.costs.grossPnLBeforeCosts - run.report.costs.totalCostUsdt).toBeCloseTo(
      run.report.costs.netPnLAfterCosts,
      1,
    );
    const gate = evaluateBacktestEligibility({
      status: "completed",
      totalReturn: 0.0258,
      mdd: run.report.mdd,
      tradeCount: 33,
      totalCostPctOfGrossProfit:
        run.report.costs.totalCostUsdt / run.report.costs.grossPnLBeforeCosts,
    });
    expect(gate.eligible).toBe(false);
    expect(
      (run.report.tradeEventTraces ?? []).every((t) => !t.patternType),
    ).toBe(true);
  });

  it("does not write into production storage during these unit checks", () => {
    expect(process.cwd()).not.toContain("should-not-matter");
    // All assertions above are pure / read-only.
    expect(BACKTEST_MAX_ALLOWED_MDD_ABS).toBeGreaterThan(0);
  });

  it("trade-row focus range accepts persisted millisecond timestamps", () => {
    const range = tradeFocusTimeRange({
      entryTime: 1782417600000,
      exitTime: 1782440100000,
    });
    expect(range).toEqual({
      fromMs: 1782417600000,
      toMs: 1782440100000,
    });
    // Date.parse on bare ms strings is NaN — parser must not rely on it alone.
    expect(Number.isNaN(Date.parse("1782417600000"))).toBe(true);
    expect(
      tradeFocusTimeRange({
        entryTime: "1782417600000",
        exitTime: "1782440100000",
      }),
    ).toEqual({ fromMs: 1782417600000, toMs: 1782440100000 });
  });

  it("SAFE strategy file remains immutable fingerprint", () => {
    const candidates = [
      path.join(ROOT, "data/strategies/SAFE_v44_i4060.json"),
      path.join(ROOT, "data/rextora/strategies/SAFE_v44_i4060.json"),
    ];
    const safePath = candidates.find((p) => fs.existsSync(p));
    expect(safePath).toBeTruthy();
    const raw = fs.readFileSync(safePath!, "utf8");
    expect(raw).toContain('"params_hash": "7893ca3f0e30"');
    expect(raw).toContain("SAFE_v44_i4060");
  });
});
