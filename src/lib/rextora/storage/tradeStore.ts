import { readJsonStore, writeJsonStore, invalidateJsonStoreCache } from "./jsonStore";
import type { LearningLogItem, OrderRecord, Position } from "../types";

const TRADES_FILE = "trades.json";
const ORDERS_FILE = "orders.json";
const POSITIONS_FILE = "positions.json";

export function loadTradeLogs(fallback: LearningLogItem[] = []): LearningLogItem[] {
  return readJsonStore(TRADES_FILE, fallback);
}

export function saveTradeLogs(logs: LearningLogItem[]): LearningLogItem[] {
  return writeJsonStore(TRADES_FILE, logs);
}

export function resetTradeLogsForTests(seed: LearningLogItem[] = []): void {
  invalidateJsonStoreCache(TRADES_FILE);
  writeJsonStore(TRADES_FILE, seed);
}

export function loadPaperOrders(fallback: OrderRecord[] = []): OrderRecord[] {
  return readJsonStore(ORDERS_FILE, fallback);
}

export function savePaperOrders(orders: OrderRecord[]): OrderRecord[] {
  return writeJsonStore(ORDERS_FILE, orders);
}

export function loadPaperPositions(fallback: Position[] = []): Position[] {
  return readJsonStore(POSITIONS_FILE, fallback);
}

export function savePaperPositions(positions: Position[]): Position[] {
  return writeJsonStore(POSITIONS_FILE, positions);
}
