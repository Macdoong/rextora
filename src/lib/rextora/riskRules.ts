import type { AiCandidate, MarketCoin, RiskStatus } from "./types";

/** Pure risk-limit check with no safety/tpSl dependencies (avoids import cycles). */
export function isRiskLimitBreached(riskStatus: RiskStatus): boolean {
  const { settings } = riskStatus;

  return (
    riskStatus.dailyLossPct <= settings.dailyLossLimitPct ||
    riskStatus.totalLossPct <= settings.totalLossLimitPct ||
    riskStatus.consecutiveLosses >= settings.consecutiveLossLimit ||
    riskStatus.dailyTrades >= settings.maxDailyTrades ||
    riskStatus.currentLeverage > settings.maxLeverage ||
    riskStatus.openPositions > settings.maxSimultaneousPositions
  );
}

export function checkVolatilityRule(coin: MarketCoin): boolean {
  return coin.volatility < 4.5;
}

export function checkPositionCapacity(status: RiskStatus): boolean {
  return status.openPositions < status.settings.maxSimultaneousPositions;
}

export function checkSignalStrength(strength: number, min = 0.5): boolean {
  return strength >= min;
}

export function checkLeverage(status: RiskStatus): boolean {
  return status.currentLeverage <= status.settings.maxLeverage;
}

export function checkDailyTrades(status: RiskStatus): boolean {
  return status.dailyTrades < status.settings.maxDailyTrades;
}

export function evaluateRiskRules(coin: MarketCoin, signalStrength: number, status: RiskStatus): { passed: boolean; reason?: string } {
  if (isRiskLimitBreached(status)) return { passed: false, reason: "리스크 한도 위반으로 거래가 차단됩니다." };
  if (!checkVolatilityRule(coin)) return { passed: false, reason: "변동성 과다로 리스크 등급 높음" };
  if (!checkPositionCapacity(status)) return { passed: false, reason: "동시 포지션 한도 초과" };
  if (!checkSignalStrength(signalStrength)) return { passed: false, reason: "신호 강도 미달" };
  if (!checkLeverage(status)) return { passed: false, reason: "레버리지 한도 초과" };
  if (!checkDailyTrades(status)) return { passed: false, reason: "일 최대 거래 수 도달" };
  return { passed: true };
}

export function isCandidateRiskBlocked(candidate: AiCandidate, status: RiskStatus): boolean {
  if (isRiskLimitBreached(status)) return true;
  return candidate.status === "리스크 초과로 차단" || candidate.status === "과열 구간 차단" || candidate.status === "신호 약함";
}
