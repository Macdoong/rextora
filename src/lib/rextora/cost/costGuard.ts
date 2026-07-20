import type { SafeV44Params } from "../strategy/strategyTypes";

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

/** Binance USDT-M futures taker fee (estimate). */
export const BINANCE_FUTURES_TAKER_FEE = 0.0004;

export function evaluateCostGuard(input: CostGuardInput): CostGuardResult {
  const feeRate = input.feeRate ?? BINANCE_FUTURES_TAKER_FEE;
  const slippageRate = input.slippageRate ?? 0.0002;
  const spreadRate = input.spreadRate ?? 0.0001;
  const fundingRate = Math.abs(input.fundingRate ?? 0);
  const k = input.params.cost_guard_k ?? 3.0;

  const feeRoundTrip = feeRate * 2;
  const slippageCost = slippageRate * 2;
  const spreadCost = spreadRate;
  const fundingRisk = fundingRate;
  const totalCostPct = feeRoundTrip + slippageCost + spreadCost + fundingRisk;

  const rewardAbs =
    input.side === "LONG"
      ? input.takeProfitPrice - input.entryPrice
      : input.entryPrice - input.takeProfitPrice;
  const expectedRewardPct = input.entryPrice > 0 ? rewardAbs / input.entryPrice : 0;
  const requiredRewardPct = totalCostPct * k;

  if (!input.params.cost_guard) {
    return {
      passed: true,
      feeRoundTrip,
      slippageCost,
      spreadCost,
      fundingRisk,
      totalCostPct,
      expectedRewardPct,
      costGuardK: k,
      requiredRewardPct,
      reason: "cost_guard 비활성"
    };
  }

  const passed = expectedRewardPct >= requiredRewardPct;
  return {
    passed,
    feeRoundTrip,
    slippageCost,
    spreadCost,
    fundingRisk,
    totalCostPct,
    expectedRewardPct,
    costGuardK: k,
    requiredRewardPct,
    reason: passed
      ? `비용 가드 통과 (보상 ${expectedRewardPct.toFixed(5)} >= ${requiredRewardPct.toFixed(5)})`
      : `비용 대비 보상 부족 (보상 ${expectedRewardPct.toFixed(5)} < 필요 ${requiredRewardPct.toFixed(5)}, k=${k})`
  };
}
