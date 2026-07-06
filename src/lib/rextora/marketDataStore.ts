import { getConfig } from "./config";
import { FUTURES_SYMBOLS, marketCoinsSeed } from "./seedData";
import type { MarketCoin } from "./types";
import { getAllMarketTickers, getAllPremiumIndexes } from "./binance/binanceReadOnlyService";
import { computeCoinMetrics, detectCoinStateFromMetrics } from "./marketMetrics";

export type MarketDataSource = "real" | "mock" | "stale";

export interface MarketDataSnapshot {
  coins: MarketCoin[];
  source: MarketDataSource;
  updatedAt: number;
  symbolCount: number;
}

let snapshot: MarketDataSnapshot = {
  coins: marketCoinsSeed,
  source: "mock",
  updatedAt: 0,
  symbolCount: marketCoinsSeed.length
};

let refreshPromise: Promise<MarketDataSnapshot> | null = null;

function isStale(updatedAt: number): boolean {
  return Date.now() - updatedAt > getConfig().market.staleAfterMs;
}

function buildMockCoins(): MarketCoin[] {
  return marketCoinsSeed.map((coin) => ({ ...coin, serviceState: "mock" as const }));
}

function pickSymbols(allSymbols: string[]): string[] {
  const config = getConfig();
  const preferred = FUTURES_SYMBOLS.filter((s) => allSymbols.includes(s));
  return preferred.slice(0, config.market.maxWatchedSymbols);
}

async function doRefresh(): Promise<MarketDataSnapshot> {
  const [tickers, premiums] = await Promise.all([getAllMarketTickers(), getAllPremiumIndexes()]);
  if (!tickers.ok || !tickers.data) {
    snapshot = {
      coins: buildMockCoins(),
      source: "mock",
      updatedAt: Date.now(),
      symbolCount: buildMockCoins().length
    };
    return snapshot;
  }

  const premiumMap = new Map((premiums.data ?? []).map((p) => [p.symbol, p]));
  const usdtSymbols = tickers.data.filter((t) => t.symbol.endsWith("USDT"));
  const watched = pickSymbols(usdtSymbols.map((t) => t.symbol));
  const coins: MarketCoin[] = [];

  for (const symbol of watched) {
    const ticker = usdtSymbols.find((t) => t.symbol === symbol);
    if (!ticker) continue;
    const funding = premiumMap.get(symbol);
    const metrics = computeCoinMetrics(ticker, funding);
    coins.push({
      symbol,
      price: metrics.price,
      change24hPct: metrics.change24hPct,
      volumeChangePct: metrics.volumeChangePct,
      volatility: metrics.volatility,
      spread: metrics.spreadPct,
      fundingFee: metrics.fundingRate,
      state: detectCoinStateFromMetrics(metrics),
      aiScore: metrics.aiScore,
      directionHint: metrics.change24hPct >= 0 ? "롱" : "숏",
      serviceState: "read-only"
    });
  }

  snapshot = {
    coins: coins.length >= getConfig().market.minWatchedSymbols ? coins : buildMockCoins(),
    source: coins.length > 0 ? "real" : "mock",
    updatedAt: Date.now(),
    symbolCount: coins.length || buildMockCoins().length
  };
  return snapshot;
}

export async function refreshMarketData(options?: { force?: boolean }): Promise<MarketDataSnapshot> {
  const config = getConfig();
  const cacheFresh = snapshot.updatedAt > 0 && Date.now() - snapshot.updatedAt < config.market.cacheTtlMs;

  if (!options?.force && cacheFresh) {
    return snapshot;
  }

  if (refreshPromise) {
    return refreshPromise;
  }

  refreshPromise = doRefresh().finally(() => {
    refreshPromise = null;
  });
  return refreshPromise;
}

export function getMarketSnapshot(): MarketDataSnapshot {
  if (snapshot.updatedAt === 0 || isStale(snapshot.updatedAt)) {
    return { ...snapshot, source: snapshot.source === "real" ? "stale" : snapshot.source };
  }
  return snapshot;
}

export function getMarketSnapshotAgeMs(): number {
  if (snapshot.updatedAt === 0) return Number.POSITIVE_INFINITY;
  return Date.now() - snapshot.updatedAt;
}

export function getStoredMarketCoins(): MarketCoin[] {
  return getMarketSnapshot().coins;
}

export function getMarketDataSource(): MarketDataSource {
  return getMarketSnapshot().source;
}

export function isMarketDataStale(): boolean {
  return getMarketDataSource() === "stale" || isStale(snapshot.updatedAt);
}

export function getMarketDataSnapshot(): MarketDataSnapshot & { stale: boolean } {
  const snap = getMarketSnapshot();
  return { ...snap, stale: isMarketDataStale() };
}

export function getMarketStaleBlockReason(): string | null {
  const market = getMarketDataSnapshot();
  if (!market.stale) return null;
  const ageMs = getMarketSnapshotAgeMs();
  const ageLabel = Number.isFinite(ageMs) ? `${Math.round(ageMs / 1000)}초` : "알 수 없음";
  return `시장 데이터가 ${ageLabel} 지연 상태입니다. 시장 감시 새로고침을 실행하세요.`;
}
