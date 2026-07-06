import { apiStatusSeed, riskStatusSeed } from "./seedData";
import { isRiskLimitBreached } from "./riskRules";
import { isStrategyLiveEligible as repositoryLiveEligible } from "./strategyRepository";
import { evaluateLiveSafetyGate } from "./liveSafetyGate";
import type { ApiStatus, LiveSafetyChecklist, RiskStatus, Strategy, TradingMode } from "./types";

export { isRiskLimitBreached };

export function isAggressiveStrategyBlocked(strategy: Strategy): boolean {
  return strategy.type === "공격형 후보" && !strategy.verifiedForLive;
}

export function isStrategyLiveEligible(strategy: Strategy): boolean {
  return repositoryLiveEligible(strategy);
}

export function isServerTpSlRequired(mode: TradingMode): boolean {
  return mode === "LIVE";
}

export function shouldEmergencyStop(riskStatus: RiskStatus = riskStatusSeed, apiStatus: ApiStatus = apiStatusSeed): boolean {
  return isRiskLimitBreached(riskStatus) || apiStatus.dummyLoopDetected;
}

export function getLiveBlockReasons(
  checklist: LiveSafetyChecklist,
  strategy: Strategy,
  riskStatus: RiskStatus,
  apiStatus: ApiStatus
): string[] {
  void checklist;
  const gate = evaluateLiveSafetyGate({ readinessOnly: true, api: apiStatus });
  return gate.blockedReasons;
}

export const getLiveTradingBlockReasons = getLiveBlockReasons;

export function canStartLiveTrading(
  checklist: LiveSafetyChecklist,
  strategy: Strategy,
  riskStatus: RiskStatus,
  apiStatus: ApiStatus
): boolean {
  return getLiveBlockReasons(checklist, strategy, riskStatus, apiStatus).length === 0;
}

export function canUsePaperMode(strategy: Strategy, riskStatus: RiskStatus): boolean {
  return !isRiskLimitBreached(riskStatus) && strategy.type !== "탐색 중";
}

export const canStartPaperTrading = canUsePaperMode;

export function canUseBacktestMode(): boolean {
  return true;
}
