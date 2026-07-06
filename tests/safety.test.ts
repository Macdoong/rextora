import { describe, expect, it } from "vitest";
import { defaultApiStatus, defaultChecklist, defaultRiskStatus, safeBaselineStrategy, strategies } from "../lib/mock-data";
import { getBacktestValidation } from "../src/lib/rextora/backtestEngine";
import { getApiStatus } from "../src/lib/rextora/apiStatusService";
import { getTopCandidates } from "../src/lib/rextora/aiRanker";
import { calculateCostBreakdown, passesCostRule } from "../src/lib/rextora/costEngine";
import { isCandidateBlocked } from "../src/lib/rextora/riskEngine";
import { getLearningLogs } from "../src/lib/rextora/learningLogger";
import { generateRandomStrategies } from "../src/lib/rextora/strategyDiscoveryEngine";
import { sendTestMessage } from "../src/lib/rextora/telegramService";
import { evaluateLiveSafetyGate } from "../src/lib/rextora/liveSafetyGate";
import { getBootMode, getConfig } from "../src/lib/rextora/config";
import { getEnv } from "../src/lib/rextora/env";
import { LiveTradeBlockedError } from "../src/lib/rextora/binance/binanceTradeService";
import { placeFuturesOrder } from "../src/lib/rextora/binance/binanceTradeService";
import {
  canStartLiveTrading,
  canUsePaperMode,
  isAggressiveStrategyBlocked,
  isRiskLimitBreached,
  isServerTpSlRequired
} from "../lib/safety";
import { ApiStatusService, BacktestEngine, EmergencyService, LiveTradingEngine, PaperTradingEngine, createEngineForMode } from "../lib/services";

describe("Rextora safety MVP", () => {
  it("includes SAFE_v44_i4060 as legacy reference", () => {
    expect(strategies.some((strategy) => strategy.name === "SAFE_v44_i4060")).toBe(true);
  });

  it("preserves SAFE_v44_i4060 params_hash", () => {
    expect(safeBaselineStrategy.paramsHash).toBe("7893ca3f0e30");
  });

  it("blocks LIVE mode without the full safety checklist", () => {
    expect(canStartLiveTrading(defaultChecklist, safeBaselineStrategy, defaultRiskStatus, defaultApiStatus)).toBe(false);
  });

  it("blocks LIVE via liveSafetyGate", () => {
    expect(evaluateLiveSafetyGate().passed).toBe(false);
  });

  it("defaults to PAPER boot mode", () => {
    expect(getBootMode()).toBe("PAPER");
    expect(getConfig().mode.bootMode).toBe("PAPER");
  });

  it("blocks aggressive candidate strategies from LIVE mode", () => {
    const aggressive = strategies.find((strategy) => strategy.type === "공격형 후보");
    expect(aggressive).toBeDefined();
    expect(isAggressiveStrategyBlocked(aggressive!)).toBe(true);
  });

  it("allows PAPER mode without real order permission", () => {
    expect(defaultApiStatus.orderPermission).toBe("차단");
    expect(canUsePaperMode(safeBaselineStrategy, defaultRiskStatus)).toBe(true);
  });

  it("blocks Binance trade without LiveExecutionContext", async () => {
    await expect(placeFuturesOrder({ symbol: "BTCUSDT", side: "BUY", type: "MARKET", quantity: 1 })).rejects.toBeInstanceOf(LiveTradeBlockedError);
  });

  it("keeps BACKTEST mode away from LiveTradingEngine", () => {
    const engine = createEngineForMode("BACKTEST");
    expect(engine).toBeInstanceOf(BacktestEngine);
    expect(engine).not.toBeInstanceOf(LiveTradingEngine);
  });

  it("blocks trading when a risk limit is breached", () => {
    const breachedRisk = { ...defaultRiskStatus, dailyLossPct: -5.1 };
    expect(isRiskLimitBreached(breachedRisk)).toBe(true);
    expect(canUsePaperMode(safeBaselineStrategy, breachedRisk)).toBe(false);
  });

  it("reports Telegram mock or configured status", async () => {
    const result = await sendTestMessage();
    expect(["mock", "read-only"]).toContain(result.serviceState);
  });

  it("shows real order engine disconnected", () => {
    expect(getApiStatus().realOrderEngineConnected).toBe(false);
  });

  it("reads env defaults safely", () => {
    expect(getEnv().REXTORA_LIVE_APPROVED).toBe(false);
    expect(getEnv().REXTORA_DEFAULT_MODE).toBe("PAPER");
  });
});

describe("Rextora scalping pipeline", () => {
  it("returns TOP 5 AI candidates with statuses", () => {
    const candidates = getTopCandidates(5);
    expect(candidates.length).toBeLessThanOrEqual(5);
    expect(candidates.length).toBeGreaterThan(0);
  });

  it("calculates cost pass/fail from expected profit minus costs", () => {
    const passed = calculateCostBreakdown({ symbol: "SOLUSDT", expectedProfitPct: 1.85 });
    const failed = calculateCostBreakdown({ symbol: "TESTUSDT", expectedProfitPct: 0.1 });
    expect(passesCostRule(passed)).toBe(true);
    expect(passed.passed).toBe(true);
    expect(failed.passed).toBe(false);
  });

  it("blocks unsafe candidates via risk engine", () => {
    const blocked = getTopCandidates(5).find((c) => c.status === "리스크 초과로 차단");
    if (blocked) expect(isCandidateBlocked(blocked)).toBe(true);
  });

  it("learning logger records entry and exit reasons", () => {
    const logs = getLearningLogs();
    expect(logs.length).toBeGreaterThan(0);
    expect(logs.every((log) => log.entryReason && log.exitReason)).toBe(true);
  });

  it("requires server TP/SL for LIVE", () => {
    expect(isServerTpSlRequired("LIVE")).toBe(true);
  });
});
