import { FUTURES_SYMBOLS } from "./seedData";
import {
  getStoredMarketCoins,
  getMarketDataSource,
  refreshMarketData,
  isMarketDataStale,
  getMarketSnapshot,
  getMarketSnapshotAgeMs
} from "./marketDataStore";
import { computeMarketSummary } from "./marketMetrics";
import { marketCoinsSeed, marketWatcherSummarySeed } from "./seedData";
import { filterMarketCoins, sortMarketCoins, detectCoinState } from "./marketWatcherUtils";
import type { MarketCoin, MarketWatcherSummary } from "./types";

export { filterMarketCoins, sortMarketCoins, detectCoinState };

export function getWatchedSymbols(): string[] {
  return FUTURES_SYMBOLS.slice(0, 50);
}

export function getMarketCoins(): MarketCoin[] {
  const coins = getStoredMarketCoins();
  return coins.length > 0 ? coins : marketCoinsSeed;
}

export async function fetchMarketCoins(options?: { force?: boolean }): Promise<MarketCoin[]> {
  if (options?.force) {
    return (await refreshMarketData({ force: true })).coins;
  }

  const snapshot = getMarketSnapshot();
  if (snapshot.updatedAt === 0) {
    return (await refreshMarketData({ force: true })).coins;
  }

  return snapshot.coins;
}

export function getMarketWatcherSummary(): MarketWatcherSummary {
  const coins = getMarketCoins();
  if (coins.length === 0) return marketWatcherSummarySeed;
  return computeMarketSummary(coins);
}

export function getMarketSourceBadge(): "real" | "mock" | "stale" {
  if (isMarketDataStale()) return "stale";
  return getMarketDataSource();
}

export function getMarketCacheMeta() {
  const snapshot = getMarketSnapshot();
  return {
    source: getMarketSourceBadge(),
    cached: snapshot.updatedAt > 0,
    ageMs: getMarketSnapshotAgeMs(),
    updatedAt: snapshot.updatedAt > 0 ? new Date(snapshot.updatedAt).toISOString() : null
  };
}
