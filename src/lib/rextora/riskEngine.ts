import { loadRiskState, resolveRiskStateFromStatus } from "./riskStateStore";
import { evaluateRiskRules, isCandidateRiskBlocked } from "./riskRules";
import { isRiskLimitBreached } from "./safety";
import { getRiskWarnings } from "./riskManager";
import { riskStatusSeed } from "./seedData";
import type { AiCandidate, MarketCoin, RiskState, RiskStatus } from "./types";

export function getRiskEngineStatus(): RiskStatus {
  const status = loadRiskState();
  return { ...status, riskState: resolveRiskStateFromStatus(status) };
}

export function evaluateCandidateRisk(coin: MarketCoin, signalStrength: number): { passed: boolean; reason?: string } {
  return evaluateRiskRules(coin, signalStrength, getRiskEngineStatus());
}

export function isCandidateBlocked(candidate: AiCandidate, status: RiskStatus = getRiskEngineStatus()): boolean {
  if (isCandidateRiskBlocked(candidate, status)) return true;
  if (candidate.status === "비용 초과로 차단") return true;
  return false;
}

export function resolveRiskState(status: RiskStatus = riskStatusSeed): RiskState {
  return resolveRiskStateFromStatus(status);
}

export { isRiskLimitBreached, getRiskWarnings };
export { getRiskStatus, updateRiskSettings } from "./riskManager";
