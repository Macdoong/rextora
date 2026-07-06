import { readJsonStore, writeJsonStore } from "./storage/jsonStore";
import { getConfig } from "./config";
import { riskStatusSeed } from "./seedData";
import type { RiskState, RiskStatus } from "./types";
import { isRiskLimitBreached } from "./riskRules";

const RISK_STATE_FILE = "risk-state.json";

export function loadRiskState(): RiskStatus {
  const config = getConfig();
  const stored = readJsonStore<RiskStatus | null>(RISK_STATE_FILE, null, { ttlMs: config.market.jsonStoreTtlMs });
  if (!stored) {
    return {
      ...riskStatusSeed,
      settings: {
        ...riskStatusSeed.settings,
        dailyLossLimitPct: config.risk.dailyLossLimitPct,
        totalLossLimitPct: config.risk.totalLossLimitPct,
        consecutiveLossLimit: config.risk.consecutiveLossLimit,
        maxDailyTrades: config.risk.maxDailyTrades,
        maxLeverage: config.risk.maxLeverage,
        maxSimultaneousPositions: config.risk.maxSimultaneousPositions
      }
    };
  }
  return stored;
}

export function saveRiskState(status: RiskStatus): RiskStatus {
  return writeJsonStore(RISK_STATE_FILE, status);
}

export function resolveRiskStateFromStatus(status: RiskStatus): RiskState {
  if (isRiskLimitBreached(status)) return "자동 중단";
  const warnings = countRiskWarnings(status);
  if (warnings >= 2) return "위험";
  if (warnings === 1 || status.dailyLossPct <= status.settings.dailyLossLimitPct * 0.7) return "주의";
  return "정상";
}

function countRiskWarnings(status: RiskStatus): number {
  let count = 0;
  if (status.dailyLossPct <= status.settings.dailyLossLimitPct) count += 1;
  if (status.totalLossPct <= status.settings.totalLossLimitPct) count += 1;
  if (status.consecutiveLosses >= status.settings.consecutiveLossLimit) count += 1;
  if (status.dailyTrades >= status.settings.maxDailyTrades) count += 1;
  if (status.currentLeverage > status.settings.maxLeverage) count += 1;
  if (status.openPositions > status.settings.maxSimultaneousPositions) count += 1;
  return count;
}

export function recordTradeOutcome(status: RiskStatus, pnlPct: number): RiskStatus {
  const next: RiskStatus = {
    ...status,
    dailyLossPct: Number((status.dailyLossPct + pnlPct).toFixed(2)),
    totalLossPct: Number((status.totalLossPct + pnlPct).toFixed(2)),
    dailyTrades: status.dailyTrades + 1,
    consecutiveLosses: pnlPct < 0 ? status.consecutiveLosses + 1 : 0,
    riskState: "정상"
  };
  next.riskState = resolveRiskStateFromStatus(next);
  return saveRiskState(next);
}
