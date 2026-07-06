import type { MarketCoin, SignalType, TradeDirection } from "./types";
import type { SignalResult } from "./signalEngine";
import { isMarketDataStale } from "./marketDataStore";

const MAX_SPREAD_PCT = 0.15;

export function shouldBlockStaleOrSpread(coin: MarketCoin): string | null {
  if (isMarketDataStale()) return "시장 데이터가 stale 상태입니다.";
  if (coin.spread > MAX_SPREAD_PCT) return "스프레드가 과도합니다.";
  return null;
}

export function classifySignal(
  coin: MarketCoin,
  indicators: { rsi: number; emaFast: number; emaSlow: number; volumeRatio: number; breakout: number; momentum: number }
): SignalResult | null {
  const block = shouldBlockStaleOrSpread(coin);
  if (block) {
    return {
      symbol: coin.symbol,
      direction: coin.directionHint ?? "롱",
      signalType: "weak_signal",
      strength: 0.3,
      reason: block
    };
  }

  if (coin.state === "돌파" && indicators.volumeRatio >= 1.5) {
    return { symbol: coin.symbol, direction: "롱", signalType: "breakout", strength: 0.85, reason: "거래량 동반 상단 돌파" };
  }
  if (coin.state === "과열" || indicators.rsi >= 72) {
    return { symbol: coin.symbol, direction: "숏", signalType: "overheated_zone", strength: 0.78, reason: "과열 구간 되돌림 숏 후보" };
  }
  if (indicators.volumeRatio >= 2) {
    return { symbol: coin.symbol, direction: coin.directionHint ?? "롱", signalType: "volume_spike", strength: 0.72, reason: "거래량 급증" };
  }
  if (indicators.emaFast > indicators.emaSlow && indicators.momentum > 0.5 && indicators.rsi >= 45 && indicators.rsi <= 62) {
    return { symbol: coin.symbol, direction: "롱", signalType: "pullback", strength: 0.7, reason: "EMA 상향 + 눌림 후 반등" };
  }
  if (coin.change24hPct <= -4 && indicators.momentum < -0.5) {
    return { symbol: coin.symbol, direction: "숏", signalType: "trend_reversal", strength: 0.68, reason: "단기 추세 반전" };
  }
  if (coin.change24hPct > 2 && indicators.volumeRatio >= 1) {
    return { symbol: coin.symbol, direction: "롱", signalType: "long_candidate", strength: 0.75, reason: "상승 모멘텀 + 거래량" };
  }
  if (coin.change24hPct < -2) {
    return { symbol: coin.symbol, direction: "숏", signalType: "short_candidate", strength: 0.7, reason: "하락 모멘텀" };
  }
  if (coin.aiScore < 65) {
    return { symbol: coin.symbol, direction: coin.directionHint ?? "롱", signalType: "weak_signal", strength: 0.45, reason: "신호 강도 미달" };
  }
  return null;
}

export function signalTypeLabel(type: SignalType): string {
  const labels: Record<SignalType, string> = {
    long_candidate: "롱 후보",
    short_candidate: "숏 후보",
    breakout: "돌파",
    pullback: "눌림",
    volume_spike: "거래량 급증",
    trend_reversal: "추세 전환",
    overheated_zone: "과열 구간",
    weak_signal: "신호 약함"
  };
  return labels[type];
}

export function directionFromSignal(type: SignalType): TradeDirection {
  return type === "short_candidate" || type === "overheated_zone" || type === "trend_reversal" ? "숏" : "롱";
}
