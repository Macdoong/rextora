import { describe, expect, it, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "os";
import path from "path";
import {
  backtestResultHash,
  listSavedBacktestsForStrategy,
  saveBacktestResult,
} from "../src/lib/rextora/backtest/backtestStore";
import {
  configuredBacktestSymbols,
  isSymbolAllowedForStrategy,
  resolveStrategySymbolCompatibility,
} from "../src/lib/rextora/backtest/strategySymbolCompatibility";
import {
  formatSavedRunOptionLabel,
  dataVersionLabelKo,
} from "../src/lib/rextora/backtest/savedRunLabels";
import { computeDayPresetRange } from "../src/lib/rextora/backtest/backtestDateRange";
import type {
  BacktestConfig,
  BacktestReport,
  BacktestTrade,
} from "../src/lib/rextora/backtest/backtestTypes";

const ROOT = path.resolve(__dirname, "..");

function stubReport(
  strategyId: string,
  symbol: string,
  from: string,
  to: string,
  ret: number,
): BacktestReport {
  return {
    strategyId,
    strategyHash: "dbd658af74bc",
    strategyName: "test",
    symbol,
    symbols: [symbol],
    timeframe: "15m",
    fromDate: from,
    toDate: to,
    requestedFrom: null,
    requestedTo: null,
    actualFirstCandleTime: null,
    actualLastCandleTime: null,
    candleCount: 100,
    processedCandleCount: 100,
    dataSource: "binance",
    totalReturn: ret,
    mdd: -0.1,
    tradeCount: 10,
    winRate: 0.5,
    averageTrade: 0.01,
    profitFactor: 1.2,
    maxConsecutiveLosses: 2,
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
      totalTradingCost: 1,
      totalCostUsdt: 1,
      grossPnLBeforeCosts: 10,
      netPnLAfterCosts: 9,
    },
    monthlyReturns: [],
    negativeMonths: 0,
    startingBalance: 10_000,
    endingBalance: 10_000 * (1 + ret),
    validation: {
      paramsHashVerified: true,
      feesApplied: true,
      slippageApplied: true,
      fundingApplied: true,
      spreadApplied: true,
      noRealOrders: true,
    },
  };
}

function baseConfig(symbol: string): BacktestConfig {
  return {
    strategyId: "custom_mrxjff7z",
    symbols: [symbol],
    timeframe: "15m",
    fromOpenTime: Date.parse("2026-01-25T00:00:00.000Z"),
    toOpenTime: Date.parse("2026-07-24T00:00:00.000Z"),
    balance: 10_000,
    feeRate: 0.0004,
    slippageRate: 0.0002,
    fundingRate: 0.0001,
    applyFunding: false,
    applySpread: false,
    spreadRate: 0.0001,
    costStressMultipliers: [1],
    costGuardK: 3,
  };
}

describe("strategy symbol compatibility", () => {
  it("marks safe_params as symbol-agnostic with provider options", () => {
    const compat = resolveStrategySymbolCompatibility({
      id: "custom_mrxjff7z",
      strategyType: "safe_params",
      symbols: ["BTCUSDT"],
    });
    expect(compat.mode).toBe("symbol_agnostic");
    expect(compat.selectorDisabled).toBe(false);
    expect(compat.allowedSymbols).toContain("BTCUSDT");
    expect(compat.allowedSymbols).toContain("ETHUSDT");
    expect(compat.defaultSymbol).toBe("BTCUSDT");
  });

  it("disables selector for fixed-symbol strategies", () => {
    const compat = resolveStrategySymbolCompatibility({
      id: "fixed_one",
      strategyType: "condition_builder",
      symbols: ["BTCUSDT"],
      definition: {
        strategyType: "condition_builder",
        symbols: ["BTCUSDT"],
        metadata: { fixedSymbol: true },
      },
    });
    expect(compat.mode).toBe("fixed_symbol");
    expect(compat.selectorDisabled).toBe(true);
    expect(compat.allowedSymbols).toEqual(["BTCUSDT"]);
    expect(compat.reasonKo).toContain("BTCUSDT 전용");
  });

  it("blocks unsupported strategy/symbol combinations", () => {
    expect(
      isSymbolAllowedForStrategy(
        {
          strategyType: "condition_builder",
          symbols: ["BTCUSDT", "ETHUSDT"],
          definition: {
            strategyType: "condition_builder",
            symbols: ["BTCUSDT", "ETHUSDT"],
          },
        },
        "SOLUSDT",
      ),
    ).toBe(false);
    expect(
      isSymbolAllowedForStrategy(
        { strategyType: "safe_params", symbols: ["BTCUSDT"] },
        "ETHUSDT",
      ),
    ).toBe(true);
  });

  it("exposes configured provider symbols", () => {
    const all = configuredBacktestSymbols();
    expect(all[0]).toBe("BTCUSDT");
    expect(all).toContain("ETHUSDT");
  });
});

describe("symbol-aware result identity", () => {
  let prevCwd: string;
  let tmp: string;

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "rextora-bt-sym-"));
    prevCwd = process.cwd();
    process.chdir(tmp);
    fs.mkdirSync(path.join(tmp, "data", "rextora", "backtests"), {
      recursive: true,
    });
  });

  afterEach(() => {
    process.chdir(prevCwd);
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it("includes symbol in resultHash and keeps unique run IDs", () => {
    const trades: BacktestTrade[] = [];
    const btc = saveBacktestResult({
      config: baseConfig("BTCUSDT"),
      report: stubReport("custom_mrxjff7z", "BTCUSDT", "2026-01-25", "2026-07-24", 0.02),
      trades,
      sourceType: "user_backtest_run",
      strategyId: "custom_mrxjff7z",
      strategyHash: "dbd658af74bc",
      engineVersion: "rextora-backtest-1",
      dataVersion: "binance",
    });
    const eth = saveBacktestResult({
      config: baseConfig("ETHUSDT"),
      report: stubReport("custom_mrxjff7z", "ETHUSDT", "2026-01-25", "2026-07-24", 0.02),
      trades,
      sourceType: "user_backtest_run",
      strategyId: "custom_mrxjff7z",
      strategyHash: "dbd658af74bc",
      engineVersion: "rextora-backtest-1",
      dataVersion: "binance",
    });
    expect(btc.id).not.toBe(eth.id);
    expect(btc.resultHash).not.toBe(eth.resultHash);
    expect(backtestResultHash(btc)).toBe(btc.resultHash);

    const btc2 = saveBacktestResult({
      config: baseConfig("BTCUSDT"),
      report: stubReport("custom_mrxjff7z", "BTCUSDT", "2026-01-25", "2026-07-24", 0.02),
      trades,
      sourceType: "user_backtest_run",
      strategyId: "custom_mrxjff7z",
      strategyHash: "dbd658af74bc",
      engineVersion: "rextora-backtest-1",
      dataVersion: "binance",
    });
    expect(btc2.id).not.toBe(btc.id);
    expect(btc2.resultHash).toBe(btc.resultHash);

    const onlyBtc = listSavedBacktestsForStrategy("custom_mrxjff7z", 30, {
      symbol: "BTCUSDT",
    });
    expect(onlyBtc.every((r) => r.report.symbol === "BTCUSDT")).toBe(true);
    expect(onlyBtc.length).toBeGreaterThanOrEqual(2);
    expect(process.cwd()).not.toBe(ROOT);
  });
});

describe("saved-run labels and date presets", () => {
  it("includes symbol and seconds when same-minute collisions exist", () => {
    const peers = [
      {
        id: "a",
        createdAt: "2026-07-24T07:15:10.000Z",
        status: "completed" as const,
        report: {
          symbol: "BTCUSDT",
          fromDate: "2026-01-25",
          toDate: "2026-07-24",
        },
      },
      {
        id: "b",
        createdAt: "2026-07-24T07:15:34.000Z",
        status: "completed" as const,
        report: {
          symbol: "BTCUSDT",
          fromDate: "2026-01-25",
          toDate: "2026-07-24",
        },
      },
    ];
    const label = formatSavedRunOptionLabel(peers[1]!, peers);
    expect(label.startsWith("BTCUSDT ·")).toBe(true);
    expect(label).toMatch(/\d{2}:\d{2}:\d{2} 실행/);
    expect(label).not.toContain("T07:15");
    expect(dataVersionLabelKo("binance")).toBe("Binance Futures");
  });

  it("clamps day presets to selected-symbol bounds", () => {
    const range = computeDayPresetRange(30, Date.parse("2026-07-24T00:00:00Z"), {
      fromOpenTime: Date.parse("2026-06-01T00:00:00Z"),
      toOpenTime: Date.parse("2026-07-20T00:00:00Z"),
    });
    expect(range.toDate).toBe("2026-07-20");
    expect(range.fromDate).toBe("2026-06-20");
  });
});

describe("backtest symbol UI contracts", () => {
  const wb = () =>
    fs.readFileSync(
      path.join(ROOT, "components/rextora/backtest/BacktestReviewWorkbench.tsx"),
      "utf8",
    );
  const route = () =>
    fs.readFileSync(
      path.join(ROOT, "app/api/rextora/backtest/run/route.ts"),
      "utf8",
    );

  it("wires symbol selector, payload, filters, and handoff identity", () => {
    const src = wb();
    expect(src).toContain('data-testid="backtest-symbol-select"');
    expect(src).toContain('data-testid="backtest-symbol-search"');
    expect(src).toContain("전략 로직은 유지하고 선택한 시장 데이터로 새 백테스트를 실행합니다.");
    expect(src).toContain("symbols: [symbol]");
    expect(src).toContain("selectSymbol");
    expect(src).toContain("clearResultState");
    expect(src).toContain("clearRunId");
    expect(src).toContain("backtest-run-filter-current");
    expect(src).toContain("현재 심볼");
    expect(src).toContain("전체 심볼");
    expect(src).toContain("symbol:");
    expect(src).toContain("paper/session");
    expect(src).toContain("&symbol=");
    expect(src).toContain("/paper-trading?strategyId=");
    expect(src).toContain("pickActive");
    expect(src).toContain("bt-force-expand");
    expect(src).toContain("backtest-nav-scroll-spacer");
    expect(src).toContain("navClickLocked");
  });

  it("API validates symbol compatibility and filters saved runs", () => {
    const src = route();
    expect(src).toContain("SYMBOL_STRATEGY_INCOMPATIBLE");
    expect(src).toContain("SYMBOL_UNSUPPORTED");
    expect(src).toContain("allSymbols");
    expect(src).toContain("isSymbolAllowedForStrategy");
  });

  it("does not call exchange order adapters from workbench", () => {
    const src = wb();
    expect(src).not.toMatch(/createOrder|placeOrder|submitOrder/);
  });
});
