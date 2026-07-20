/**
 * Unified cost engine — sole cost formula source.
 * Units: decimal fractions (0.0008 = 0.08%), matching Binance rate style.
 * Derived from costGuard defaults + feeModel/safety margin for candidate checks.
 */
import { getConfig } from "../config";
import type { UnifiedCostBreakdown, UnifiedCostRates } from "./types";

/** Binance USDT-M futures taker fee (verified constant from costGuard). */
export const BINANCE_FUTURES_TAKER_FEE = 0.0004;
export const DEFAULT_SLIPPAGE_RATE = 0.0002;
export const DEFAULT_SPREAD_RATE = 0.0001;

export function getDefaultCostRates(overrides?: Partial<UnifiedCostRates>): UnifiedCostRates {
  return {
    feeRate: overrides?.feeRate ?? BINANCE_FUTURES_TAKER_FEE,
    slippageRate: overrides?.slippageRate ?? DEFAULT_SLIPPAGE_RATE,
    spreadRate: overrides?.spreadRate ?? DEFAULT_SPREAD_RATE,
    fundingRate: Math.abs(overrides?.fundingRate ?? 0)
  };
}

export function computeRoundTripFee(feeRate = BINANCE_FUTURES_TAKER_FEE): number {
  return feeRate * 2;
}

export function computeSlippageCost(slippageRate = DEFAULT_SLIPPAGE_RATE): number {
  return slippageRate * 2;
}

/**
 * Total cost fraction for a round-trip.
 * totalCost = feeRoundTrip + slippageCost + spreadCost + fundingCost
 */
export function computeTotalCostFraction(rates: UnifiedCostRates): {
  feeRoundTrip: number;
  slippageCost: number;
  spreadCost: number;
  fundingCost: number;
  totalCost: number;
} {
  const feeRoundTrip = computeRoundTripFee(rates.feeRate);
  const slippageCost = computeSlippageCost(rates.slippageRate);
  const spreadCost = rates.spreadRate;
  const fundingCost = Math.abs(rates.fundingRate);
  return {
    feeRoundTrip,
    slippageCost,
    spreadCost,
    fundingCost,
    totalCost: feeRoundTrip + slippageCost + spreadCost + fundingCost
  };
}

export function computeTradeCostsUsdt(notional: number, rates: UnifiedCostRates): {
  fee: number;
  slippage: number;
  spread: number;
  funding: number;
  total: number;
} {
  const parts = computeTotalCostFraction(rates);
  const fee = Number((notional * parts.feeRoundTrip).toFixed(6));
  const slippage = Number((notional * parts.slippageCost).toFixed(6));
  const spread = Number((notional * parts.spreadCost).toFixed(6));
  const funding = Number((notional * parts.fundingCost).toFixed(6));
  return {
    fee,
    slippage,
    spread,
    funding,
    total: Number((fee + slippage + spread + funding).toFixed(6))
  };
}

/**
 * Cost guard / candidate evaluation.
 * Pass when expectedReward >= totalCost * k (cost_guard_k).
 * Safety margin (config percent points → fraction) added to totalCost for ranking/UI decisions.
 */
export function evaluateUnifiedCost(input: {
  entryPrice: number;
  takeProfitPrice?: number;
  side: "LONG" | "SHORT";
  expectedProfitFraction?: number;
  rates?: Partial<UnifiedCostRates>;
  costGuardEnabled?: boolean;
  costGuardK?: number;
  includeSafetyMargin?: boolean;
}): UnifiedCostBreakdown {
  const rates = getDefaultCostRates(input.rates);
  const parts = computeTotalCostFraction(rates);
  const safetyMarginPctPoints = getConfig().risk.safetyMarginPct;
  const safetyMargin = input.includeSafetyMargin === false ? 0 : safetyMarginPctPoints / 100;
  const totalCost = parts.totalCost + safetyMargin;
  const costPct = Number((totalCost * 100).toFixed(4));

  let expectedReward = input.expectedProfitFraction ?? 0;
  if (input.takeProfitPrice != null && input.entryPrice > 0) {
    const rewardAbs =
      input.side === "LONG"
        ? input.takeProfitPrice - input.entryPrice
        : input.entryPrice - input.takeProfitPrice;
    expectedReward = rewardAbs / input.entryPrice;
  }

  const k = input.costGuardK ?? 3.0;
  const requiredReward = totalCost * k;
  const costGuardEnabled = input.costGuardEnabled !== false;

  if (!costGuardEnabled) {
    return {
      feeRate: rates.feeRate,
      feeRoundTrip: parts.feeRoundTrip,
      slippageRate: rates.slippageRate,
      slippageCost: parts.slippageCost,
      spreadRate: rates.spreadRate,
      spreadCost: parts.spreadCost,
      fundingRate: rates.fundingRate,
      fundingCost: parts.fundingCost,
      safetyMargin,
      totalCost,
      costPct,
      expectedReward,
      requiredReward,
      passed: true,
      reason: "cost_guard 비활성"
    };
  }

  const passed = expectedReward >= requiredReward;
  return {
    feeRate: rates.feeRate,
    feeRoundTrip: parts.feeRoundTrip,
    slippageRate: rates.slippageRate,
    slippageCost: parts.slippageCost,
    spreadRate: rates.spreadRate,
    spreadCost: parts.spreadCost,
    fundingRate: rates.fundingRate,
    fundingCost: parts.fundingCost,
    safetyMargin,
    totalCost,
    costPct,
    expectedReward,
    requiredReward,
    passed,
    reason: passed
      ? `비용 가드 통과 (보상 ${expectedReward.toFixed(5)} >= ${requiredReward.toFixed(5)})`
      : `비용 대비 보상 부족 (보상 ${expectedReward.toFixed(5)} < 필요 ${requiredReward.toFixed(5)}, k=${k})`
  };
}

/**
 * Candidate ranking pass rule (legacy CostBreakdown percent-point API).
 * expectedProfitPct and costs are percent points (1.85 = 1.85%).
 * Rule: expected > fee + slip + funding + safety (+ spread included in total for decision).
 */
export function passesExpectedProfitRule(
  expectedProfitPct: number,
  costsPctPoints: {
    roundTripFeePct: number;
    estimatedSlippagePct: number;
    spreadPct: number;
    fundingFeePct: number;
    safetyMarginPct: number;
  }
): boolean {
  const total =
    costsPctPoints.roundTripFeePct +
    costsPctPoints.estimatedSlippagePct +
    costsPctPoints.spreadPct +
    costsPctPoints.fundingFeePct +
    costsPctPoints.safetyMarginPct;
  const edge = expectedProfitPct - total;
  const minEdge = getConfig().risk.minExpectedEdgePct;
  return edge > 0 && edge >= minEdge;
}
