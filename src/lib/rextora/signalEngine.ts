import { getKlines } from "./binance/binanceReadOnlyService";
import { ema, momentum, rsi, volumeSma } from "./indicators";
import { classifySignal, shouldBlockStaleOrSpread } from "./signalRules";
import { isMarketDataStale } from "./marketDataStore";
import type { MarketCoin, SignalType, TradeDirection } from "./types";

export interface SignalResult {
  symbol: string;
  direction: TradeDirection;
  signalType: SignalType;
  strength: number;
  reason: string;
  blocked?: boolean;
}

async function loadIndicatorContext(symbol: string) {
  const klines = await getKlines(symbol, "15m", 60);
  if (!klines.ok || !klines.data || !Array.isArray(klines.data)) {
    return { rsi: 50, emaFast: 0, emaSlow: 0, volumeRatio: 1, breakout: 0, momentum: 0 };
  }
  const closes = klines.data.map((k) => Number(k[4]));
  const highs = klines.data.map((k) => Number(k[2]));
  const lows = klines.data.map((k) => Number(k[3]));
  const volumes = klines.data.map((k) => Number(k[5]));
  const emaFastArr = ema(closes, 20);
  const emaSlowArr = ema(closes, 60);
  const avgVol = volumeSma(volumes, 20);
  const lastVol = volumes[volumes.length - 1] ?? 0;
  return {
    rsi: rsi(closes),
    emaFast: emaFastArr[emaFastArr.length - 1] ?? closes[closes.length - 1],
    emaSlow: emaSlowArr[emaSlowArr.length - 1] ?? closes[closes.length - 1],
    volumeRatio: avgVol > 0 ? lastVol / avgVol : 1,
    breakout: highs[highs.length - 1] - lows[lows.length - 1],
    momentum: momentum(closes)
  };
}

export async function detectSignalsAsync(coin: MarketCoin): Promise<SignalResult | null> {
  const staleBlock = isMarketDataStale() ? shouldBlockStaleOrSpread(coin) : null;
  if (staleBlock) {
    return { symbol: coin.symbol, direction: coin.directionHint ?? "롱", signalType: "weak_signal", strength: 0.3, reason: staleBlock, blocked: true };
  }
  const indicators = await loadIndicatorContext(coin.symbol);
  return classifySignal(coin, indicators);
}

export function detectSignals(coin: MarketCoin): SignalResult | null {
  const spreadBlock = shouldBlockStaleOrSpread(coin);
  if (spreadBlock && isMarketDataStale()) {
    return { symbol: coin.symbol, direction: coin.directionHint ?? "롱", signalType: "weak_signal", strength: 0.3, reason: spreadBlock, blocked: true };
  }
  const indicators = {
    rsi: coin.aiScore > 70 ? 65 : 50,
    emaFast: coin.price,
    emaSlow: coin.price * 0.99,
    volumeRatio: coin.volumeChangePct / 100,
    breakout: coin.volatility,
    momentum: coin.change24hPct / 10
  };
  return classifySignal(coin, indicators);
}

export function scanSignals(coins: MarketCoin[]): SignalResult[] {
  return coins.map(detectSignals).filter((s): s is SignalResult => s !== null);
}

export async function scanSignalsAsync(coins: MarketCoin[]): Promise<SignalResult[]> {
  const results = await Promise.all(coins.map(detectSignalsAsync));
  return results.filter((s): s is SignalResult => s !== null);
}
