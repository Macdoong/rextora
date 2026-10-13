/**
 * Cost ratio helpers derived from persisted BacktestReport.costs fields.
 */

import { BACKTEST_COST_OF_GROSS_CRITICAL } from "./backtestEligibility";

export interface CostRatioInput {
  grossPnLBeforeCosts: number;
  netPnLAfterCosts: number;
  totalCostUsdt: number;
  /** Persisted attribution total; not necessarily a separately deducted ledger. */
  totalEconomicFrictionUsdt?: number;
  feeCostUsdt: number;
  slippageCostUsdt: number;
  spreadCostUsdt?: number;
  fundingCostUsdt?: number;
}

export interface CostRatioResult {
  grossProfitBeforeCosts: number;
  netProfitAfterCosts: number;
  totalCostUsdt: number;
  economicFrictionUsdt: number;
  /** totalCost / gross when gross > 0; null when gross ≤ 0. */
  totalCostPctOfGrossProfit: number | null;
  /** Economic friction / gross execution-price PnL. Falls back to totalCost for legacy records. */
  economicFrictionPctOfGrossProfit: number | null;
  /** totalCost / |net| when net ≠ 0; null when net == 0. */
  totalCostPctOfNetProfit: number | null;
  economicFrictionPctOfNetProfit: number | null;
  feePctOfTotalCost: number | null;
  slippagePctOfTotalCost: number | null;
  feePctOfEconomicFriction: number | null;
  slippagePctOfEconomicFriction: number | null;
  identityHolds: boolean;
  identityDeltaUsdt: number;
  criticalCostOfGross: boolean;
  criticalThreshold: number;
}

export function computeCostRatios(input: CostRatioInput): CostRatioResult {
  const gross = Number(input.grossPnLBeforeCosts) || 0;
  const net = Number(input.netPnLAfterCosts) || 0;
  const total = Number(input.totalCostUsdt) || 0;
  const economicFriction = Number.isFinite(input.totalEconomicFrictionUsdt)
    ? Number(input.totalEconomicFrictionUsdt)
    : total;
  const fee = Number(input.feeCostUsdt) || 0;
  const slip = Number(input.slippageCostUsdt) || 0;
  const expectedNet = gross - total;
  const identityDeltaUsdt = Number((net - expectedNet).toFixed(6));

  return {
    grossProfitBeforeCosts: gross,
    netProfitAfterCosts: net,
    totalCostUsdt: total,
    economicFrictionUsdt: economicFriction,
    totalCostPctOfGrossProfit: gross > 0 ? total / gross : null,
    economicFrictionPctOfGrossProfit:
      gross > 0 ? economicFriction / gross : null,
    totalCostPctOfNetProfit: net !== 0 ? total / Math.abs(net) : null,
    economicFrictionPctOfNetProfit:
      net !== 0 ? economicFriction / Math.abs(net) : null,
    feePctOfTotalCost: total > 0 ? fee / total : null,
    slippagePctOfTotalCost: total > 0 ? slip / total : null,
    feePctOfEconomicFriction:
      economicFriction > 0 ? fee / economicFriction : null,
    slippagePctOfEconomicFriction:
      economicFriction > 0 ? slip / economicFriction : null,
    identityHolds: Math.abs(identityDeltaUsdt) <= 0.02,
    identityDeltaUsdt,
    criticalCostOfGross:
      gross > 0 && economicFriction / gross >= BACKTEST_COST_OF_GROSS_CRITICAL,
    criticalThreshold: BACKTEST_COST_OF_GROSS_CRITICAL,
  };
}
