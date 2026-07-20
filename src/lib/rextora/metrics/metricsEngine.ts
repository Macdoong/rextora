import { getAccountState } from "../accountStateStore";
import { getOpenPositions } from "../positionManager";
import { getRuntimeState } from "../runtimeState";
import { loadRiskState, resolveRiskStateFromStatus } from "../riskStateStore";
import { getPaperActiveStrategy } from "../strategy/strategyStore";
import { computeUnrealizedMetrics, formatHoldingTime } from "./tradeResult";
import { getTodayTradeResults, loadUnifiedTradeResults } from "./tradeResultStore";
import { computeRiskUsagePct } from "./riskFormulas";
import type {
  UnifiedMetricsSnapshot,
  UnifiedPositionMetrics,
  UnifiedTradeResult
} from "./types";
import type { TodayPnlSummary } from "../types";

export { computeRiskUsagePct, computeRemainingLossAllowancePct, normalizeDailyLossPct } from "./riskFormulas";

function mapSide(side: string): "LONG" | "SHORT" | "FLAT" {
  if (side === "Long" || side === "LONG" || side === "롱") return "LONG";
  if (side === "Short" || side === "SHORT" || side === "숏") return "SHORT";
  return "FLAT";
}

function buildPaperPositions(): UnifiedPositionMetrics[] {
  return getOpenPositions()
    .filter((p) => p.quantity > 0 && p.side !== "Flat")
    .map((p) => {
      const side = mapSide(p.side);
      const metrics =
        side === "FLAT"
          ? { unrealizedPnl: 0, unrealizedPct: 0 }
          : computeUnrealizedMetrics(side, p.entryPrice, p.currentPrice, p.quantity);
      const openedMs = p.openedAt ? Date.parse(p.openedAt) : NaN;
      const holdMs = Number.isFinite(openedMs) ? Math.max(0, Date.now() - openedMs) : 0;
      return {
        symbol: p.symbol,
        side,
        quantity: p.quantity,
        entryPrice: p.entryPrice,
        currentPrice: p.currentPrice,
        leverage: p.leverage,
        unrealizedPnl: metrics.unrealizedPnl,
        unrealizedPct: metrics.unrealizedPct,
        stopLoss: p.stopLoss,
        takeProfit: p.takeProfit,
        holdTimeLabel: formatHoldingTime(holdMs),
        mode: "PAPER" as const
      };
    });
}

function buildLivePositions(): UnifiedPositionMetrics[] {
  return getAccountState()
    .positions.filter((p) => p.side !== "FLAT" && p.quantity > 0)
    .map((p) => {
      const side = p.side === "LONG" ? "LONG" : "SHORT";
      const metrics = computeUnrealizedMetrics(side, p.entryPrice, p.markPrice, p.quantity);
      return {
        symbol: p.symbol,
        side,
        quantity: p.quantity,
        entryPrice: p.entryPrice,
        currentPrice: p.markPrice,
        leverage: p.leverage,
        unrealizedPnl: Number(p.unrealizedPnl.toFixed(6)),
        unrealizedPct: metrics.unrealizedPct,
        stopLoss: 0,
        takeProfit: 0,
        holdTimeLabel: "-",
        mode: "LIVE" as const
      };
    });
}

function computeDrawdownPct(equity: number, peakEquity: number): number {
  if (peakEquity <= 0) return 0;
  return Number((((equity - peakEquity) / peakEquity) * 100).toFixed(4));
}

/**
 * Sole metrics provider for Dashboard, Paper, Live, Trades, Risk.
 */
export function getUnifiedMetrics(): UnifiedMetricsSnapshot {
  const runtime = getRuntimeState();
  const account = getAccountState();
  const risk = loadRiskState();
  const todayTrades = getTodayTradeResults();
  const allTrades = loadUnifiedTradeResults();

  const paperPositions = buildPaperPositions();
  const livePositions = buildLivePositions();
  const positions =
    runtime.mode === "LIVE"
      ? livePositions
      : paperPositions.length > 0
        ? paperPositions
        : livePositions;

  const todayRealizedPnlUsdt = Number(
    todayTrades.reduce((s, t) => s + t.realizedUsdt, 0).toFixed(4)
  );
  const todayFeeUsdt = Number(todayTrades.reduce((s, t) => s + t.fee, 0).toFixed(4));
  const todayFundingUsdt = Number(todayTrades.reduce((s, t) => s + t.funding, 0).toFixed(4));
  const todaySlippageUsdt = Number(todayTrades.reduce((s, t) => s + t.slippage, 0).toFixed(4));
  const todayUnrealizedPnlUsdt = Number(
    positions.reduce((s, p) => s + p.unrealizedPnl, 0).toFixed(4)
  );

  const equityBase = account.balanceUsdt || 10_000;
  const accountEquity = Number((equityBase + todayUnrealizedPnlUsdt).toFixed(4));
  const seed = account.initialSeedUsdt ?? equityBase;
  const accountReturnPct =
    seed > 0 ? Number((((accountEquity - seed) / seed) * 100).toFixed(4)) : 0;

  const todayRealizedPnlPct =
    seed > 0 ? Number(((todayRealizedPnlUsdt / seed) * 100).toFixed(4)) : 0;
  const todayUnrealizedPnlPct =
    seed > 0 ? Number(((todayUnrealizedPnlUsdt / seed) * 100).toFixed(4)) : 0;

  const wins = todayTrades.filter((t) => t.netPnl > 0).length;
  const winRate =
    todayTrades.length > 0 ? Number(((wins / todayTrades.length) * 100).toFixed(1)) : 0;

  const peak = Math.max(seed, accountEquity);
  const drawdownPct = computeDrawdownPct(accountEquity, peak);

  const strategy = getPaperActiveStrategy();
  const strategyReturnPct =
    strategy.lastBacktest?.totalReturn != null
      ? Number((strategy.lastBacktest.totalReturn * 100).toFixed(2))
      : null;

  const riskUsagePct = computeRiskUsagePct(
    Math.min(0, risk.dailyLossPct),
    risk.settings.dailyLossLimitPct
  );

  return {
    todayRealizedPnlUsdt,
    todayRealizedPnlPct,
    todayUnrealizedPnlUsdt,
    todayUnrealizedPnlPct,
    accountEquity,
    accountReturnPct,
    todayTradeCount: todayTrades.length,
    todayFeeUsdt,
    todayFundingUsdt,
    todaySlippageUsdt,
    openPositionCount: positions.length,
    winRate,
    drawdownPct,
    riskUsagePct,
    strategyReturnPct,
    dailyTrades: risk.dailyTrades,
    consecutiveLosses: risk.consecutiveLosses,
    positions,
    recentTrades: (allTrades.length > 0 ? allTrades : todayTrades).slice(0, 50),
    updatedAt: new Date().toISOString()
  };
}

/** Adapter for existing TodayPnlSummary UI contract. */
export function getTodayPnlSummary(): TodayPnlSummary {
  const m = getUnifiedMetrics();
  const risk = loadRiskState();
  return {
    todayPnlPct: m.todayRealizedPnlPct,
    dailyLossLimitUsagePct: m.riskUsagePct,
    openPositionCount: m.openPositionCount,
    todayTradeCount: m.todayTradeCount,
    riskState: resolveRiskStateFromStatus(risk),
    todayRealizedPnlUsdt: m.todayRealizedPnlUsdt,
    todayUnrealizedPnlUsdt: m.todayUnrealizedPnlUsdt,
    todayFeeUsdt: m.todayFeeUsdt,
    todayFundingUsdt: m.todayFundingUsdt,
    todaySlippageUsdt: m.todaySlippageUsdt,
    accountEquity: m.accountEquity,
    accountReturnPct: m.accountReturnPct
  };
}

export function getRecentUnifiedTrades(limit = 50): UnifiedTradeResult[] {
  return getUnifiedMetrics().recentTrades.slice(0, limit);
}
