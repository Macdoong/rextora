import { loadRiskState, resolveRiskStateFromStatus, saveRiskState, syncOpenPositionCount } from "../riskStateStore";
import { getOpenPositions } from "../positionManager";
import { getAccountState } from "../accountStateStore";
import { getRuntimeState } from "../runtimeState";
import { getUnifiedMetrics } from "./metricsEngine";
import {
  computeRemainingLossAllowancePct,
  computeRiskUsagePct,
  normalizeDailyLossPct
} from "./riskFormulas";
import type { UnifiedRiskView } from "./types";

export { computeRiskUsagePct, computeRemainingLossAllowancePct, normalizeDailyLossPct } from "./riskFormulas";

/**
 * Sole risk view provider.
 * - usagePct: loss-only
 * - remainingDailyLossPct: non-negative room
 * - openPositions: real open count only
 */
export function getUnifiedRiskView(): UnifiedRiskView {
  const status = loadRiskState();
  const metrics = getUnifiedMetrics();
  const runtime = getRuntimeState();
  const settings = status.settings;

  const openFromStore =
    runtime.mode === "LIVE"
      ? getAccountState().positions.filter((p) => p.side !== "FLAT" && p.quantity > 0).length
      : getOpenPositions().filter((p) => p.side !== "Flat" && p.quantity > 0).length;

  const openPositions = Math.max(openFromStore, metrics.openPositionCount);
  syncOpenPositionCount(openPositions);

  const currentDailyLossPct = normalizeDailyLossPct(status.dailyLossPct);
  const dailyLossLimitPct = settings.dailyLossLimitPct;
  const usagePct = computeRiskUsagePct(currentDailyLossPct, dailyLossLimitPct);
  const remainingDailyLossPct = computeRemainingLossAllowancePct(currentDailyLossPct, dailyLossLimitPct);

  const todayRealizedLossUsdt = Math.min(0, metrics.todayRealizedPnlUsdt);
  const todayUnrealizedLossUsdt = Math.min(0, metrics.todayUnrealizedPnlUsdt);
  const todayTotalLossUsdt = Number((todayRealizedLossUsdt + todayUnrealizedLossUsdt).toFixed(4));

  const riskState = resolveRiskStateFromStatus({
    ...status,
    dailyLossPct: currentDailyLossPct,
    openPositions
  });

  return {
    riskState,
    dailyLossLimitPct,
    currentDailyLossPct,
    remainingDailyLossPct,
    usagePct,
    accountDrawdownPct: metrics.drawdownPct,
    accountLossLimitPct: settings.totalLossLimitPct,
    consecutiveLosses: status.consecutiveLosses,
    consecutiveLossLimit: settings.consecutiveLossLimit,
    dailyTrades: status.dailyTrades,
    maxDailyTrades: settings.maxDailyTrades,
    remainingTrades: Math.max(0, settings.maxDailyTrades - status.dailyTrades),
    openPositions,
    maxPositions: settings.maxSimultaneousPositions,
    remainingPositionSlots: Math.max(0, settings.maxSimultaneousPositions - openPositions),
    currentLeverage: status.currentLeverage,
    maxLeverage: settings.maxLeverage,
    todayRealizedLossUsdt,
    todayUnrealizedLossUsdt,
    todayTotalLossUsdt,
    limitBreached: usagePct >= 100 || currentDailyLossPct <= dailyLossLimitPct
  };
}

export function sanitizePersistedRiskState(): void {
  const status = loadRiskState();
  const runtime = getRuntimeState();
  const openFromStore =
    runtime.mode === "LIVE"
      ? getAccountState().positions.filter((p) => p.side !== "FLAT" && p.quantity > 0).length
      : getOpenPositions().filter((p) => p.side !== "Flat" && p.quantity > 0).length;

  let dirty = false;
  const next = { ...status };
  if (status.dailyLossPct > 0) {
    next.dailyLossPct = 0;
    dirty = true;
  }
  if (status.openPositions !== openFromStore) {
    next.openPositions = openFromStore;
    dirty = true;
  }
  next.riskState = resolveRiskStateFromStatus(next);
  if (dirty || next.riskState !== status.riskState) {
    saveRiskState(next);
  }
}
