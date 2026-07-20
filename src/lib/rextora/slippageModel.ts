/**
 * Slippage estimates — aligned with unified cost defaults.
 * Returns percent points for CostBreakdown UI compatibility.
 */
import type { MarketCoin } from "./types";
import { DEFAULT_SLIPPAGE_RATE, computeSlippageCost } from "./metrics/unifiedCost";

/** Percent-point slippage for a coin (legacy UI). */
export function estimateSlippagePct(coin: MarketCoin, notionalUsd = 1000): number {
  const base = computeSlippageCost(DEFAULT_SLIPPAGE_RATE) * 100;
  const volFactor = Math.min(0.2, coin.volatility * 0.02);
  const spreadFactor = coin.spread * 0.5;
  const sizeFactor = notionalUsd > 5000 ? 0.03 : 0;
  return Number((base + volFactor + spreadFactor + sizeFactor).toFixed(3));
}

export function estimateSlippagePctSimple(volatility: number, spreadPct: number): number {
  const base = computeSlippageCost(DEFAULT_SLIPPAGE_RATE) * 100;
  return Number((base + volatility * 0.02 + spreadPct * 0.5).toFixed(3));
}
