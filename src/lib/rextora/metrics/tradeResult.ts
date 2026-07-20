import {
  computeTradeCostsUsdt,
  getDefaultCostRates
} from "./unifiedCost";
import type { TradeSide, UnifiedTradeResult } from "./types";

export function formatHoldingTime(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return "-";
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 60) return `${minutes}분`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}시간 ${minutes % 60}분`;
  return `${Math.floor(hours / 24)}일 ${hours % 24}시간`;
}

export function computeGrossPnlUsdt(
  side: TradeSide,
  entryPrice: number,
  exitPrice: number,
  quantity: number
): number {
  const raw =
    side === "LONG"
      ? (exitPrice - entryPrice) * quantity
      : (entryPrice - exitPrice) * quantity;
  return Number(raw.toFixed(6));
}

export function computePriceReturnFraction(
  side: TradeSide,
  entryPrice: number,
  exitPrice: number
): number {
  if (entryPrice <= 0) return 0;
  return side === "LONG"
    ? (exitPrice - entryPrice) / entryPrice
    : (entryPrice - exitPrice) / entryPrice;
}

/**
 * Build a completed trade result with identical cost formulas for every page.
 *
 * Formulas (verified):
 * - grossPnl = (exit-entry)*qty (LONG) | (entry-exit)*qty (SHORT)
 * - notional = entryPrice * quantity
 * - fee/slippage/spread/funding = notional * respective round-trip fractions
 * - netPnl = grossPnl - fee - slippage - spread - funding
 * - grossPct = priceReturn * 100
 * - netPct = (priceReturn - totalCostFraction) * 100
 * - realizedUsdt = netPnl
 */
export function buildUnifiedTradeResult(input: {
  id?: string;
  symbol: string;
  side: TradeSide;
  strategyId: string;
  entryPrice: number;
  exitPrice: number;
  quantity: number;
  leverage: number;
  exitReason: string;
  mode: "PAPER" | "LIVE";
  openedAt?: string;
  timestamp?: string;
  fundingRate?: number;
  feeRate?: number;
  slippageRate?: number;
  spreadRate?: number;
}): UnifiedTradeResult {
  const side = input.side;
  const notional = Math.abs(input.entryPrice * input.quantity);
  const rates = getDefaultCostRates({
    feeRate: input.feeRate,
    slippageRate: input.slippageRate,
    spreadRate: input.spreadRate,
    fundingRate: input.fundingRate ?? 0
  });
  const costs = computeTradeCostsUsdt(notional, rates);
  const grossPnl = computeGrossPnlUsdt(side, input.entryPrice, input.exitPrice, input.quantity);
  const netPnl = Number((grossPnl - costs.total).toFixed(6));
  const priceReturn = computePriceReturnFraction(side, input.entryPrice, input.exitPrice);
  const totalCostFraction =
    rates.feeRate * 2 + rates.slippageRate * 2 + rates.spreadRate + Math.abs(rates.fundingRate);
  const grossPct = Number((priceReturn * 100).toFixed(4));
  const netPct = Number(((priceReturn - totalCostFraction) * 100).toFixed(4));

  const timestamp = input.timestamp ?? new Date().toISOString();
  const openedMs = input.openedAt ? Date.parse(input.openedAt) : NaN;
  const exitMs = Date.parse(timestamp);
  const holdingTimeMs =
    Number.isFinite(openedMs) && Number.isFinite(exitMs) ? Math.max(0, exitMs - openedMs) : 0;

  return {
    id: input.id ?? `trade-${Date.now()}-${input.symbol}`,
    symbol: input.symbol,
    side,
    strategyId: input.strategyId,
    entryPrice: input.entryPrice,
    exitPrice: input.exitPrice,
    quantity: input.quantity,
    leverage: input.leverage,
    fee: costs.fee,
    funding: costs.funding,
    slippage: costs.slippage,
    spread: costs.spread,
    grossPnl,
    netPnl,
    grossPct,
    netPct,
    realizedUsdt: netPnl,
    holdingTimeMs,
    holdingTimeLabel: formatHoldingTime(holdingTimeMs),
    exitReason: input.exitReason,
    timestamp,
    mode: input.mode,
    openedAt: input.openedAt
  };
}

export function computeUnrealizedMetrics(
  side: TradeSide,
  entryPrice: number,
  currentPrice: number,
  quantity: number
): { unrealizedPnl: number; unrealizedPct: number } {
  const unrealizedPnl = computeGrossPnlUsdt(side, entryPrice, currentPrice, quantity);
  const unrealizedPct = Number((computePriceReturnFraction(side, entryPrice, currentPrice) * 100).toFixed(4));
  return { unrealizedPnl, unrealizedPct };
}
