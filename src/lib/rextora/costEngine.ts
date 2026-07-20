/**
 * Cost breakdown for UI / candidate ranking.
 * Delegates all formulas to metrics/unifiedCost — no independent calculation.
 */
import { getConfig } from "./config";
import { COST_RULE_KO } from "./seedData";
import {
  evaluateUnifiedCost,
  getDefaultCostRates,
  passesExpectedProfitRule
} from "./metrics/unifiedCost";
import type { CostBreakdown, CostDecision, MarketCoin } from "./types";

export { COST_RULE_KO };

/**
 * Convert unified fractional costs → CostBreakdown percent-point fields
 * (0.08 = 0.08%) for existing UI/formatPercent compatibility.
 */
export function calculateCostBreakdown(input: {
  symbol: string;
  expectedProfitPct: number;
  roundTripFeePct?: number;
  estimatedSlippagePct?: number;
  spreadPct?: number;
  fundingFeePct?: number;
  safetyMarginPct?: number;
  coin?: MarketCoin;
}): CostBreakdown {
  const config = getConfig();
  const defaults = getDefaultCostRates({
    fundingRate: input.coin ? Math.abs(input.coin.fundingFee) : 0
  });

  // Allow override in percent points → convert to fraction
  const feeRate =
    input.roundTripFeePct != null ? input.roundTripFeePct / 100 / 2 : defaults.feeRate;
  const slippageRate =
    input.estimatedSlippagePct != null
      ? input.estimatedSlippagePct / 100 / 2
      : defaults.slippageRate;
  const spreadRate =
    input.spreadPct != null ? input.spreadPct / 100 : defaults.spreadRate;
  const fundingRate =
    input.fundingFeePct != null ? input.fundingFeePct / 100 : defaults.fundingRate;

  const unified = evaluateUnifiedCost({
    entryPrice: input.coin?.price ?? 1,
    side: "LONG",
    expectedProfitFraction: input.expectedProfitPct / 100,
    rates: { feeRate, slippageRate, spreadRate, fundingRate },
    costGuardEnabled: true,
    costGuardK: 1,
    includeSafetyMargin: true
  });

  const roundTripFeePct = Number((unified.feeRoundTrip * 100).toFixed(3));
  const estimatedSlippagePct = Number((unified.slippageCost * 100).toFixed(3));
  const spreadPct = Number((unified.spreadCost * 100).toFixed(3));
  const fundingFeePct = Number((unified.fundingCost * 100).toFixed(3));
  const safetyMarginPct =
    input.safetyMarginPct ?? Number((unified.safetyMargin * 100).toFixed(3));

  const totalCost =
    roundTripFeePct + estimatedSlippagePct + spreadPct + fundingFeePct + safetyMarginPct;
  const finalExpectedValuePct = Number((input.expectedProfitPct - totalCost).toFixed(2));

  let decision: CostDecision = "비용 통과";
  let passed = true;

  if (finalExpectedValuePct <= 0) {
    decision = "진입 금지";
    passed = false;
  } else if (finalExpectedValuePct < config.risk.minExpectedEdgePct) {
    decision = "비용 부족";
    passed = false;
  }

  return {
    symbol: input.symbol,
    expectedProfitPct: input.expectedProfitPct,
    roundTripFeePct,
    estimatedSlippagePct,
    spreadPct,
    fundingFeePct,
    safetyMarginPct,
    finalExpectedValuePct,
    decision,
    passed,
    serviceState: input.coin?.serviceState ?? "mock"
  };
}

export function passesCostRule(breakdown: CostBreakdown): boolean {
  return passesExpectedProfitRule(breakdown.expectedProfitPct, {
    roundTripFeePct: breakdown.roundTripFeePct,
    estimatedSlippagePct: breakdown.estimatedSlippagePct,
    spreadPct: breakdown.spreadPct,
    fundingFeePct: breakdown.fundingFeePct,
    safetyMarginPct: breakdown.safetyMarginPct
  });
}
