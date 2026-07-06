import type { CoinState, MarketCoin } from "./types";

export function filterMarketCoins(
  coins: MarketCoin[],
  filter: "전체" | "급등" | "급락" | "거래량 급증" | "돌파" | "롱 후보" | "숏 후보"
): MarketCoin[] {
  switch (filter) {
    case "급등":
      return coins.filter((c) => c.state === "급등");
    case "급락":
      return coins.filter((c) => c.state === "급락");
    case "거래량 급증":
      return coins.filter((c) => c.volumeChangePct >= 150);
    case "돌파":
      return coins.filter((c) => c.state === "돌파");
    case "롱 후보":
      return coins.filter((c) => c.directionHint === "롱" && c.aiScore >= 70);
    case "숏 후보":
      return coins.filter((c) => c.directionHint === "숏" && c.aiScore >= 70);
    default:
      return coins;
  }
}

export function sortMarketCoins(
  coins: MarketCoin[],
  sortBy: "AI 점수순" | "거래량순" | "변동성순" | "비용 낮은 순"
): MarketCoin[] {
  const sorted = [...coins];
  switch (sortBy) {
    case "AI 점수순":
      return sorted.sort((a, b) => b.aiScore - a.aiScore);
    case "거래량순":
      return sorted.sort((a, b) => b.volumeChangePct - a.volumeChangePct);
    case "변동성순":
      return sorted.sort((a, b) => b.volatility - a.volatility);
    case "비용 낮은 순":
      return sorted.sort((a, b) => a.spread + a.fundingFee - (b.spread + b.fundingFee));
    default:
      return sorted;
  }
}

export function detectCoinState(change24hPct: number, volumeChangePct: number, volatility: number): CoinState {
  if (change24hPct >= 7) return "급등";
  if (change24hPct <= -5) return "급락";
  if (volumeChangePct >= 200 && volatility >= 3) return "돌파";
  if (volatility >= 4) return "과열";
  if (volumeChangePct >= 120) return "관찰";
  return "정상";
}
