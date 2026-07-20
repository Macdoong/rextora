import { readJsonStore, writeJsonStore, invalidateJsonStoreCache } from "../storage/jsonStore";
import type { UnifiedTradeResult } from "./types";

const TRADE_RESULTS_FILE = "unified-trade-results.json";

export function loadUnifiedTradeResults(): UnifiedTradeResult[] {
  return readJsonStore<UnifiedTradeResult[]>(TRADE_RESULTS_FILE, []);
}

export function saveUnifiedTradeResults(trades: UnifiedTradeResult[]): UnifiedTradeResult[] {
  return writeJsonStore(TRADE_RESULTS_FILE, trades.slice(0, 500));
}

export function appendUnifiedTradeResult(trade: UnifiedTradeResult): UnifiedTradeResult {
  const next = [trade, ...loadUnifiedTradeResults()].slice(0, 500);
  saveUnifiedTradeResults(next);
  return trade;
}

export function resetUnifiedTradeResultsForTests(seed: UnifiedTradeResult[] = []): void {
  invalidateJsonStoreCache(TRADE_RESULTS_FILE);
  writeJsonStore(TRADE_RESULTS_FILE, seed);
}

export function getTodayTradeResults(now = new Date()): UnifiedTradeResult[] {
  const prefix = now.toLocaleString("ko-KR", { month: "2-digit", day: "2-digit" });
  return loadUnifiedTradeResults().filter((t) => {
    const local = new Date(t.timestamp).toLocaleString("ko-KR", {
      month: "2-digit",
      day: "2-digit"
    });
    return local === prefix || t.timestamp.startsWith(prefix);
  });
}
