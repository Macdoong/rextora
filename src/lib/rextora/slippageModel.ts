import type { MarketCoin } from "./types";

export function estimateSlippagePct(coin: MarketCoin, notionalUsd = 1000): number {
  const base = 0.05;
  const volFactor = Math.min(0.2, coin.volatility * 0.02);
  const spreadFactor = coin.spread * 0.5;
  const sizeFactor = notionalUsd > 5000 ? 0.03 : 0;
  return Number((base + volFactor + spreadFactor + sizeFactor).toFixed(3));
}

export function estimateSlippagePctSimple(volatility: number, spreadPct: number): number {
  return Number((0.05 + volatility * 0.02 + spreadPct * 0.5).toFixed(3));
}
