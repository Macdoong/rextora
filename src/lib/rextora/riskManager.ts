import { getConfig } from "./config";
import { riskStatusSeed } from "./seedData";
import { loadRiskSettings, saveRiskSettings } from "./localStore";
import { loadRiskState, saveRiskState } from "./riskStateStore";
import type { RiskSettings, RiskStatus } from "./types";

let currentRisk: RiskStatus | undefined;

function getCurrentRisk(): RiskStatus {
  if (!currentRisk) {
    currentRisk = loadRiskState();
  }
  return currentRisk;
}

export function getRiskSettings(): RiskSettings {
  const config = getConfig();
  const risk = getCurrentRisk();
  return {
    ...risk.settings,
    ...loadRiskSettings(),
    dailyLossLimitPct: config.risk.dailyLossLimitPct,
    totalLossLimitPct: config.risk.totalLossLimitPct,
    consecutiveLossLimit: config.risk.consecutiveLossLimit,
    maxDailyTrades: config.risk.maxDailyTrades,
    maxLeverage: config.risk.maxLeverage,
    maxSimultaneousPositions: config.risk.maxSimultaneousPositions
  };
}

export function getRiskStatus(): RiskStatus {
  currentRisk = loadRiskState();
  return currentRisk;
}

export function updateRiskSettings(settings: Partial<RiskSettings>): RiskStatus {
  const base = getCurrentRisk();
  currentRisk = {
    ...base,
    settings: saveRiskSettings({ ...base.settings, ...settings }),
    riskSettingsConfirmed: true
  };
  return saveRiskState(currentRisk);
}

export function resetRiskStatus(): RiskStatus {
  currentRisk = { ...riskStatusSeed, settings: getRiskSettings(), riskSettingsConfirmed: true };
  return saveRiskState(currentRisk);
}

export function checkDailyLossLimit(status: RiskStatus = getCurrentRisk()): boolean {
  return status.dailyLossPct <= status.settings.dailyLossLimitPct;
}

export function checkTotalLossLimit(status: RiskStatus = getCurrentRisk()): boolean {
  return status.totalLossPct <= status.settings.totalLossLimitPct;
}

export function checkConsecutiveLossLimit(status: RiskStatus = getCurrentRisk()): boolean {
  return status.consecutiveLosses >= status.settings.consecutiveLossLimit;
}

export function checkMaxDailyTrades(status: RiskStatus = getCurrentRisk()): boolean {
  return status.dailyTrades >= status.settings.maxDailyTrades;
}

export function checkMaxLeverage(status: RiskStatus = getCurrentRisk()): boolean {
  return status.currentLeverage > status.settings.maxLeverage;
}

export function checkMaxPositionCount(status: RiskStatus = getCurrentRisk()): boolean {
  return status.openPositions > status.settings.maxSimultaneousPositions;
}

export function getRiskWarnings(status: RiskStatus = getCurrentRisk()): string[] {
  const warnings: string[] = [];
  if (checkDailyLossLimit(status)) warnings.push("일 손실 한도를 초과했습니다.");
  if (checkTotalLossLimit(status)) warnings.push("총 손실 한도를 초과했습니다.");
  if (checkConsecutiveLossLimit(status)) warnings.push("연속 손실 한도를 초과했습니다.");
  if (checkMaxDailyTrades(status)) warnings.push("일 최대 거래 수에 도달했습니다.");
  if (checkMaxLeverage(status)) warnings.push("최대 레버리지 한도를 초과했습니다.");
  if (checkMaxPositionCount(status)) warnings.push("동시 포지션 한도를 초과했습니다.");
  return warnings;
}
