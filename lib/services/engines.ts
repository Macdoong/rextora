import { alertRulesSeed } from "@/src/lib/rextora/seedData";
import { generateAiBriefing } from "@/src/lib/rextora/aiBriefingService";
import { getApiStatus } from "@/src/lib/rextora/apiStatusService";
import { runBacktest } from "@/src/lib/rextora/backtestEngine";
import { preflightLiveStart, startLiveBot } from "@/src/lib/rextora/liveTradingEngine";
import { cancelAllOrders, closePosition, partialClose } from "@/src/lib/rextora/orderManager";
import { startPaperBot, stopPaperBot } from "@/src/lib/rextora/paperTradingEngine";
import { getRiskStatus, updateRiskSettings } from "@/src/lib/rextora/riskManager";
import { shouldEmergencyStop } from "@/src/lib/rextora/safety";
import { blockUnverifiedStrategies, generateRandomStrategies, rankStrategies } from "@/src/lib/rextora/strategyDiscoveryEngine";
import { getPreservedSafeStrategy, getStrategies, getStrategyById } from "@/src/lib/rextora/strategyRepository";
import { getTpSlStatus } from "@/src/lib/rextora/tpSlManager";
import type { AlertRule, EngineResult, RiskStatus, TradingMode } from "../types";

export class BacktestEngine {
  async run(strategyId = getPreservedSafeStrategy().id) {
    return runBacktest(strategyId);
  }
}

export class PaperTradingEngine {
  async start(): Promise<EngineResult> {
    return startPaperBot();
  }

  async stop(): Promise<EngineResult> {
    return stopPaperBot();
  }
}

export class LiveTradingEngine {
  async start(): Promise<EngineResult> {
    return startLiveBot();
  }

  async closePosition(): Promise<EngineResult> {
    return closePosition("LIVE");
  }

  preflight() {
    return preflightLiveStart();
  }
}

export class RiskManager {
  getStatus(): RiskStatus {
    return getRiskStatus();
  }

  updateSettings(next: Partial<RiskStatus["settings"]>): RiskStatus {
    return updateRiskSettings(next);
  }
}

export class OrderManager {
  async closePosition(): Promise<EngineResult> {
    return closePosition("PAPER");
  }

  async partialClose(percent = 50): Promise<EngineResult & { percent: number }> {
    return partialClose("PAPER", percent);
  }

  async cancelAll(): Promise<EngineResult> {
    return cancelAllOrders("PAPER");
  }
}

export class TpSlManager {
  isServerTpSlActive(): boolean {
    return getTpSlStatus("LIVE").active;
  }
}

export class ApiStatusService {
  getStatus() {
    return getApiStatus();
  }

  getPermissionErrorExample() {
    return { ...getApiStatus(), orderPermission: "오류" as const };
  }
}

export class AlertRuleEngine {
  listRules(): AlertRule[] {
    return alertRulesSeed;
  }

  saveRule(rule: AlertRule): AlertRule {
    return { ...rule, id: rule.id || `rule-${Date.now()}` };
  }
}

export class AiBriefingService {
  getLatestBriefing() {
    return generateAiBriefing();
  }
}

export class StrategyDiscoveryService {
  async discover(count = 20, symbol = "BTCUSDT", timeframe = "1H") {
    return {
      ok: true,
      message: "Random Search mock 탐색이 예약되었습니다. 실거래와 연결되지 않습니다.",
      count,
      symbol,
      timeframe,
      candidates: blockUnverifiedStrategies(generateRandomStrategies(count)).map((candidate) => ({ ...candidate, symbol, timeframe }))
    };
  }
}

export class StrategyValidationService {
  validate(strategyId: string) {
    const strategy = getStrategyById(strategyId) ?? getPreservedSafeStrategy();
    return {
      strategy,
      liveEligible: strategy.liveEligible,
      blockedAsAggressive: strategy.type === "공격형 후보" && !strategy.verifiedForLive
    };
  }
}

export class EmergencyService {
  async stopAll(): Promise<EngineResult & { emergencyStop: boolean }> {
    const status = getRiskStatus();
    const api = getApiStatus();
    return {
      ok: true,
      mode: "PAPER",
      serviceState: "paper",
      message: shouldEmergencyStop(status, api)
        ? "비상 정지 조건이 감지되어 모든 mock 자동매매를 중지했습니다."
        : "사용자 요청으로 모든 mock 자동매매를 중지했습니다.",
      emergencyStop: true
    };
  }
}

export function createEngineForMode(mode: TradingMode) {
  if (mode === "BACKTEST") return new BacktestEngine();
  if (mode === "PAPER") return new PaperTradingEngine();
  return new LiveTradingEngine();
}

export function getRankedStrategies() {
  return rankStrategies(getStrategies());
}
