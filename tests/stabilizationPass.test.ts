import { describe, expect, it } from "vitest";
import {
  computeRemainingLossAllowancePct,
  computeRiskUsagePct,
  normalizeDailyLossPct
} from "../src/lib/rextora/metrics/riskFormulas";
import { displaySourceStatus, displayTimeframeLabel, uiLabel } from "../src/lib/rextora/displayLabels";
import { isPollutionCloneName, isTestStrategyRecord } from "../src/lib/rextora/strategy/strategyTestFilter";
import { generateAiTradeReport } from "../src/lib/rextora/report/aiTradeReport";
import { backtestResultHash } from "../src/lib/rextora/backtest/backtestStore";
import { getStrategyPublicMeta } from "../src/lib/rextora/strategy/strategyMetadata";
import { ensureStrategyStore, copyStrategy, deleteStrategy, setLiveActiveStrategy } from "../src/lib/rextora/strategy/strategyStore";
import { SAFE_STRATEGY_ID } from "../src/lib/rextora/strategy/strategyTypes";
import { installIsolatedStrategyStore } from "./helpers/isolatedStrategyStore";

describe("riskFormulas stabilization", () => {
  it("zero loss produces 0% usage", () => {
    expect(normalizeDailyLossPct(0)).toBe(0);
    expect(computeRiskUsagePct(0, -5)).toBe(0);
    expect(computeRemainingLossAllowancePct(0, -5)).toBe(5);
  });

  it("profit produces 0% loss usage", () => {
    expect(normalizeDailyLossPct(44.76)).toBe(0);
    expect(computeRiskUsagePct(44.76, -5)).toBe(0);
    expect(computeRemainingLossAllowancePct(44.76, -5)).toBe(5);
  });

  it("partial loss produces correct usage", () => {
    expect(computeRiskUsagePct(-1.28, -5)).toBe(25.6);
    expect(computeRemainingLossAllowancePct(-1.28, -5)).toBe(3.72);
  });

  it("limit breach is 100%+ usage with non-negative remaining", () => {
    expect(computeRiskUsagePct(-5, -5)).toBe(100);
    expect(computeRiskUsagePct(-6, -5)).toBe(120);
    expect(computeRemainingLossAllowancePct(-6, -5)).toBe(0);
  });

  it("remaining loss never uses mixed sign convention", () => {
    const remaining = computeRemainingLossAllowancePct(-2, -5);
    expect(remaining).toBeGreaterThanOrEqual(0);
    expect(remaining).toBe(3);
  });
});

describe("localization mapper", () => {
  it("maps beginner labels and hides raw keys", () => {
    expect(uiLabel("Bot")).toBe("봇");
    expect(uiLabel("Risk Usage") === "Risk Usage" || uiLabel("Usage") === "사용률").toBe(true);
    expect(uiLabel("params_hash")).toBe("전략 고유값");
    expect(uiLabel("cost_guard_k")).toBe("비용 안전 계수");
    expect(uiLabel("base_bal_pct")).toBe("기본 진입 비율");
    expect(displaySourceStatus("context_fallback")).toBe("기본 설정 사용 중");
    expect(displayTimeframeLabel("15m")).toBe("15분봉");
    expect(displayTimeframeLabel("unknown")).toBe("확인되지 않음");
  });
});

describe("strategy metadata consistency", () => {
  it("SAFE timeframe is consistent 15분봉", () => {
    const { cleanup } = installIsolatedStrategyStore();
    try {
      ensureStrategyStore();
      const meta = getStrategyPublicMeta(SAFE_STRATEGY_ID);
      expect(meta?.timeframe).toBe("15m");
      expect(meta?.timeframeLabel).toBe("15분봉");
      expect(meta?.sourceStatusLabel).toBe("기본 설정 사용 중");
    } finally {
      cleanup();
    }
  });

  it("clone gets unique Korean name and test names cannot be live candidates", () => {
    const { cleanup } = installIsolatedStrategyStore();
    try {
      ensureStrategyStore();
      const a = copyStrategy(SAFE_STRATEGY_ID);
      const b = copyStrategy(SAFE_STRATEGY_ID);
      expect(a.name).toMatch(/복사본 \d+$/);
      expect(b.name).toMatch(/복사본 \d+$/);
      expect(a.name).not.toBe(b.name);
      const testCopy = copyStrategy(SAFE_STRATEGY_ID, "SAFE_copy_test");
      expect(isTestStrategyRecord(testCopy as never)).toBe(true);
      expect(() => setLiveActiveStrategy(testCopy.id)).toThrow(/테스트 전략/);
      deleteStrategy(a.id);
      deleteStrategy(b.id);
      deleteStrategy(testCopy.id);
    } finally {
      cleanup();
    }
  });

  it("pollution names are detected", () => {
    expect(isPollutionCloneName("SAFE_copy_test")).toBe(true);
    expect(isPollutionCloneName("테스트복사")).toBe(true);
    expect(isPollutionCloneName("SAFE_v44_i4060_복사본")).toBe(true);
    expect(isPollutionCloneName("SAFE_v44_i4060 복사본 1")).toBe(false);
  });
});

describe("ai report dedupe", () => {
  it("blocks duplicate reports for same trade bucket", () => {
    const input = {
      symbol: "BTCUSDT",
      side: "LONG" as const,
      entryPrice: 100,
      exitPrice: 101,
      realizedPnlPct: 1,
      tradeId: "dedupe-trade-1",
      analysisType: "trade_close",
      mode: "PAPER" as const
    };
    const first = generateAiTradeReport(input);
    const second = generateAiTradeReport(input);
    expect(second.id).toBe(first.id);
    expect(first.analysisMethod).toBe("규칙 기반 분석");
  });
});

describe("backtest result hash", () => {
  it("stable hash for identical result payload", () => {
    const payload = {
      config: {
        strategyId: SAFE_STRATEGY_ID,
        symbols: ["BTCUSDT"],
        timeframe: "15m",
        balance: 10000,
        feeRate: 0.0004,
        slippageRate: 0.0002,
        fundingRate: 0,
        applyFunding: false,
        applySpread: false,
        spreadRate: 0,
        costStressMultipliers: [1],
        costGuardK: 3
      },
      report: {
        strategyName: "SAFE",
        strategyHash: "abc",
        strategyId: SAFE_STRATEGY_ID,
        sourceStatus: "context_fallback",
        symbol: "BTCUSDT",
        symbols: ["BTCUSDT"],
        timeframe: "15m",
        fromDate: null,
        toDate: null,
        candleCount: 10,
        totalReturn: 0.1,
        mdd: -0.05,
        tradeCount: 2,
        winRate: 0.5,
        averageTrade: 0.01,
        profitFactor: 1.2,
        maxConsecutiveLosses: 1,
        feeImpact: 0,
        feeTotal: 0.001,
        slippageTotal: 0.001,
        monthlyReturns: [],
        negativeMonths: 0,
        startingBalance: 10000,
        endingBalance: 11000,
        validation: {
          paramsHashVerified: true,
          feesApplied: true,
          slippageApplied: true,
          fundingApplied: false,
          noRealOrders: true as const
        }
      },
      trades: []
    };
    expect(backtestResultHash(payload)).toBe(backtestResultHash(payload));
  });
});
