/**
 * Execution cost guard — thin adapter over unified cost engine.
 * Preserves CostGuardResult shape for botRuntime / safePaperLoop / backtest.
 */
import type { SafeV44Params } from "../strategy/strategyTypes";
import {
  BINANCE_FUTURES_TAKER_FEE,
  evaluateUnifiedCost
} from "../metrics/unifiedCost";

export interface CostGuardInput {
  entryPrice: number;
  takeProfitPrice: number;
  side: "LONG" | "SHORT";
  atr: number;
  params: Pick<SafeV44Params, "cost_guard" | "cost_guard_k">;
  feeRate?: number;
  slippageRate?: number;
  spreadRate?: number;
  fundingRate?: number;
}

export interface CostGuardResult {
  passed: boolean;
  feeRoundTrip: number;
  slippageCost: number;
  spreadCost: number;
  fundingRisk: number;
  totalCostPct: number;
  expectedRewardPct: number;
  costGuardK: number;
  requiredRewardPct: number;
  reason: string;
}

export { BINANCE_FUTURES_TAKER_FEE };

export function evaluateCostGuard(input: CostGuardInput): CostGuardResult {
  const unified = evaluateUnifiedCost({
    entryPrice: input.entryPrice,
    takeProfitPrice: input.takeProfitPrice,
    side: input.side,
    rates: {
      feeRate: input.feeRate,
      slippageRate: input.slippageRate,
      spreadRate: input.spreadRate,
      fundingRate: input.fundingRate
    },
    costGuardEnabled: input.params.cost_guard,
    costGuardK: input.params.cost_guard_k,
    includeSafetyMargin: false
  });

  return {
    passed: unified.passed,
    feeRoundTrip: unified.feeRoundTrip,
    slippageCost: unified.slippageCost,
    spreadCost: unified.spreadCost,
    fundingRisk: unified.fundingCost,
    totalCostPct: unified.totalCost,
    expectedRewardPct: unified.expectedReward,
    costGuardK: input.params.cost_guard_k ?? 3.0,
    requiredRewardPct: unified.requiredReward,
    reason: unified.reason
  };
}
