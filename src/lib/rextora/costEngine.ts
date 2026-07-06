import { getConfig } from "./config";
import { COST_RULE_KO } from "./seedData";
import { estimateRoundTripFeePct, getDefaultSafetyMarginPct, getFundingFeePctFromRate } from "./feeModel";
import { estimateSlippagePctSimple } from "./slippageModel";
import type { CostBreakdown, CostDecision, MarketCoin } from "./types";

export { COST_RULE_KO };

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
  const roundTripFeePct = input.roundTripFeePct ?? estimateRoundTripFeePct();
  const spreadPct = input.spreadPct ?? input.coin?.spread ?? 0.05;
  const fundingFeePct = input.fundingFeePct ?? (input.coin ? getFundingFeePctFromRate(input.coin.fundingFee) : 0.03);
  const estimatedSlippagePct = input.estimatedSlippagePct ?? estimateSlippagePctSimple(input.coin?.volatility ?? 1.5, spreadPct);
  const safetyMarginPct = input.safetyMarginPct ?? getDefaultSafetyMarginPct();

  const totalCost = roundTripFeePct + estimatedSlippagePct + spreadPct + fundingFeePct + safetyMarginPct;
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
  return breakdown.expectedProfitPct > breakdown.roundTripFeePct + breakdown.estimatedSlippagePct + breakdown.fundingFeePct + breakdown.safetyMarginPct;
}
