import type { BinancePremiumIndex, BinanceTicker24hr } from "./binance/binanceTypes";

export interface CoinMetrics {
  price: number;
  change24hPct: number;
  volumeChangePct: number;
  volatility: number;
  spreadPct: number;
  fundingRate: number;
  aiScore: number;
}

export function computeCoinMetrics(ticker: BinanceTicker24hr, funding?: BinancePremiumIndex): CoinMetrics {
  const price = Number(ticker.lastPrice);
  const change24hPct = Number(ticker.priceChangePercent);
  const high = Number(ticker.highPrice);
  const low = Number(ticker.lowPrice);
  const open = Number(ticker.openPrice);
  const volatility = open > 0 ? Number((((high - low) / open) * 100).toFixed(2)) : 0;
  const volumeChangePct = Number(ticker.volume) > 0 ? Math.min(300, 80 + (Number(ticker.volume) % 200)) : 80;
  const spreadPct = price > 0 ? Number(((Math.abs(high - low) / price) * 0.01).toFixed(3)) : 0.05;
  const fundingRate = funding ? Number(funding.lastFundingRate) : 0.0001;
  const aiScore = Math.max(40, Math.min(98, 55 + change24hPct * 2 + volatility * 3));

  return { price, change24hPct, volumeChangePct, volatility, spreadPct, fundingRate, aiScore: Number(aiScore.toFixed(1)) };
}

export function detectCoinStateFromMetrics(metrics: CoinMetrics): import("./types").CoinState {
  if (metrics.change24hPct >= 7) return "급등";
  if (metrics.change24hPct <= -5) return "급락";
  if (metrics.volumeChangePct >= 200 && metrics.volatility >= 3) return "돌파";
  if (metrics.volatility >= 4) return "과열";
  if (metrics.volumeChangePct >= 120) return "관찰";
  return "정상";
}

export function computeMarketSummary(coins: import("./types").MarketCoin[]) {
  return {
    watchedCoinCount: coins.length,
    pumpDetected: coins.filter((c) => c.state === "급등").length,
    dumpDetected: coins.filter((c) => c.state === "급락").length,
    volumeSpikeDetected: coins.filter((c) => c.volumeChangePct >= 150).length,
    breakoutDetected: coins.filter((c) => c.state === "돌파").length,
    volatilityExpanded: coins.filter((c) => c.volatility >= 3).length
  };
}
