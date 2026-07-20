/** Unified metrics types — single source of truth for all pages. */

export type TradeSide = "LONG" | "SHORT";

export interface UnifiedCostRates {
  feeRate: number;
  slippageRate: number;
  spreadRate: number;
  fundingRate: number;
}

/** All cost fields in decimal fractions (0.0008 = 0.08%). */
export interface UnifiedCostBreakdown {
  feeRate: number;
  feeRoundTrip: number;
  slippageRate: number;
  slippageCost: number;
  spreadRate: number;
  spreadCost: number;
  fundingRate: number;
  fundingCost: number;
  safetyMargin: number;
  totalCost: number;
  costPct: number;
  expectedReward: number;
  requiredReward: number;
  passed: boolean;
  reason: string;
}

export interface UnifiedTradeResult {
  id: string;
  symbol: string;
  side: TradeSide;
  strategyId: string;
  entryPrice: number;
  exitPrice: number;
  quantity: number;
  leverage: number;
  fee: number;
  funding: number;
  slippage: number;
  spread: number;
  grossPnl: number;
  netPnl: number;
  grossPct: number;
  netPct: number;
  realizedUsdt: number;
  holdingTimeMs: number;
  holdingTimeLabel: string;
  exitReason: string;
  timestamp: string;
  mode: "PAPER" | "LIVE";
  openedAt?: string;
}

export interface UnifiedPositionMetrics {
  symbol: string;
  side: TradeSide | "FLAT";
  quantity: number;
  entryPrice: number;
  currentPrice: number;
  leverage: number;
  unrealizedPnl: number;
  unrealizedPct: number;
  stopLoss: number;
  takeProfit: number;
  holdTimeLabel: string;
  mode: "PAPER" | "LIVE";
}

export interface UnifiedMetricsSnapshot {
  todayRealizedPnlUsdt: number;
  todayRealizedPnlPct: number;
  todayUnrealizedPnlUsdt: number;
  todayUnrealizedPnlPct: number;
  accountEquity: number;
  accountReturnPct: number;
  todayTradeCount: number;
  todayFeeUsdt: number;
  todayFundingUsdt: number;
  todaySlippageUsdt: number;
  openPositionCount: number;
  winRate: number;
  drawdownPct: number;
  riskUsagePct: number;
  strategyReturnPct: number | null;
  dailyTrades: number;
  consecutiveLosses: number;
  positions: UnifiedPositionMetrics[];
  recentTrades: UnifiedTradeResult[];
  updatedAt: string;
}

export interface UnifiedRiskView {
  riskState: "정상" | "주의" | "위험" | "자동 중단";
  dailyLossLimitPct: number;
  /** Loss-only daily PnL % (≤ 0). Profits clamped to 0. */
  currentDailyLossPct: number;
  /** Non-negative remaining loss room (e.g. 5.0 when unused). */
  remainingDailyLossPct: number;
  usagePct: number;
  accountDrawdownPct: number;
  accountLossLimitPct: number;
  consecutiveLosses: number;
  consecutiveLossLimit: number;
  dailyTrades: number;
  maxDailyTrades: number;
  remainingTrades: number;
  openPositions: number;
  maxPositions: number;
  remainingPositionSlots: number;
  currentLeverage: number;
  maxLeverage: number;
  todayRealizedLossUsdt?: number;
  todayUnrealizedLossUsdt?: number;
  todayTotalLossUsdt?: number;
  limitBreached?: boolean;
}
