/**
 * Cost ratio helpers derived from persisted BacktestReport.costs fields.
 */

import { BACKTEST_COST_OF_GROSS_CRITICAL } from "./backtestEligibility";

export interface CostRatioInput {
  grossPnLBeforeCosts: number;
  netPnLAfterCosts: number;
  totalCostUsdt: number;
  feeCostUsdt: number;
  slippageCostUsdt: number;
  spreadCostUsdt?: number;
  fundingCostUsdt?: number;
}

export interface CostRatioResult {
  grossProfitBeforeCosts: number;
  netProfitAfterCosts: number;
  totalCostUsdt: number;
  /** totalCost / gross when gross > 0; null when gross ≤ 0. */
  totalCostPctOfGrossProfit: number | null;
  /** totalCost / |net| when net ≠ 0; null when net == 0. */
  totalCostPctOfNetProfit: number | null;
  feePctOfTotalCost: number | null;
  slippagePctOfTotalCost: number | null;
  identityHolds: boolean;
  identityDeltaUsdt: number;
  criticalCostOfGross: boolean;
  criticalThreshold: number;
}

export function computeCostRatios(input: CostRatioInput): CostRatioResult {
  const gross = Number(input.grossPnLBeforeCosts) || 0;
  const net = Number(input.netPnLAfterCosts) || 0;
  const total = Number(input.totalCostUsdt) || 0;
  const fee = Number(input.feeCostUsdt) || 0;
  const slip = Number(input.slippageCostUsdt) || 0;
  const expectedNet = gross - total;
  const identityDeltaUsdt = Number((net - expectedNet).toFixed(6));

  return {
    grossProfitBeforeCosts: gross,
    netProfitAfterCosts: net,
    totalCostUsdt: total,
    totalCostPctOfGrossProfit: gross > 0 ? total / gross : null,
    totalCostPctOfNetProfit: net !== 0 ? total / Math.abs(net) : null,
    feePctOfTotalCost: total > 0 ? fee / total : null,
    slippagePctOfTotalCost: total > 0 ? slip / total : null,
    identityHolds: Math.abs(identityDeltaUsdt) <= 0.02,
    identityDeltaUsdt,
    criticalCostOfGross:
      gross > 0 && total / gross >= BACKTEST_COST_OF_GROSS_CRITICAL,
    criticalThreshold: BACKTEST_COST_OF_GROSS_CRITICAL,
  };
}
