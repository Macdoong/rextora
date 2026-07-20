import { positionsSeed, orderHistorySeed } from "./seedData";
import { loadPaperOrders, loadPaperPositions, savePaperOrders, savePaperPositions } from "./storage/tradeStore";
import type { OrderRecord, Position } from "./types";

export function getOpenPositions(): Position[] {
  const stored = loadPaperPositions(positionsSeed);
  return stored.filter((p) => p.side !== "Flat" && p.quantity > 0);
}

export function getAllPaperPositions(): Position[] {
  return loadPaperPositions(positionsSeed);
}

export function upsertPosition(position: Position): Position[] {
  const current = loadPaperPositions(positionsSeed);
  const idx = current.findIndex((p) => p.id === position.id || p.symbol === position.symbol);
  const next = idx >= 0 ? current.map((p, i) => (i === idx ? position : p)) : [position, ...current];
  return savePaperPositions(next);
}

export function closePositionBySymbol(symbol: string): Position | null {
  const current = loadPaperPositions(positionsSeed);
  const target = current.find((p) => p.symbol === symbol && p.side !== "Flat");
  if (!target) return null;
  const closed = { ...target, side: "Flat" as const, quantity: 0, unrealizedPnl: 0 };
  upsertPosition(closed);
  // Return the open snapshot so callers can compute PnL with original quantity.
  return target;
}

export function closeAllPositions(): Position[] {
  const current = loadPaperPositions(positionsSeed);
  const next = current.map((p) => ({ ...p, side: "Flat" as const, quantity: 0, unrealizedPnl: 0 }));
  savePaperPositions(next);
  return next;
}

export function getPaperOrderHistory(): OrderRecord[] {
  return loadPaperOrders(orderHistorySeed);
}

export function appendPaperOrder(order: OrderRecord): OrderRecord[] {
  return savePaperOrders([order, ...loadPaperOrders(orderHistorySeed)].slice(0, 200));
}

export function cancelPendingOrders(): OrderRecord[] {
  const next = loadPaperOrders(orderHistorySeed).map((o) => (o.status === "대기" ? { ...o, status: "취소됨" as const } : o));
  return savePaperOrders(next);
}

export function countOpenPositions(): number {
  return getOpenPositions().length;
}
