import { logTradeOutcome } from "./learningLogger";
import { recordTradeOutcome, loadRiskState } from "./riskStateStore";
import { appendPaperOrder, closePositionBySymbol, upsertPosition } from "./positionManager";
import type { AiCandidate, OrderRecord, Position, SignalType, TradeDirection } from "./types";

export interface TradeLifecycleEvent {
  phase: "entry" | "exit" | "blocked";
  symbol: string;
  direction: TradeDirection;
  reason: string;
  pnlPct?: number;
  signalType: SignalType;
}

export function recordPaperEntry(candidate: AiCandidate, price: number): { position: Position; order: OrderRecord } {
  const position: Position = {
    id: `paper-${candidate.symbol}-${Date.now()}`,
    symbol: candidate.symbol,
    side: candidate.direction === "롱" ? "Long" : "Short",
    entryPrice: price,
    currentPrice: price,
    quantity: 1,
    leverage: 2,
    unrealizedPnl: 0,
    margin: price,
    stopLoss: candidate.direction === "롱" ? price * 0.995 : price * 1.005,
    takeProfit: candidate.direction === "롱" ? price * 1.01 : price * 0.99,
    mode: "PAPER",
    serviceState: "paper"
  };
  const order: OrderRecord = {
    id: `paper-order-${Date.now()}`,
    time: new Date().toISOString(),
    symbol: candidate.symbol,
    side: candidate.direction === "롱" ? "Long" : "Short",
    type: "시장가",
    price,
    status: "paper",
    mode: "PAPER",
    serviceState: "paper"
  };
  upsertPosition(position);
  appendPaperOrder(order);
  return { position, order };
}

export function recordPaperExit(symbol: string, exitPrice: number, exitReason: string): TradeLifecycleEvent | null {
  const closed = closePositionBySymbol(symbol);
  if (!closed) return null;
  const direction: TradeDirection = closed.side === "Short" ? "숏" : "롱";
  const pnlPct =
    closed.side === "Long"
      ? Number((((exitPrice - closed.entryPrice) / closed.entryPrice) * 100).toFixed(2))
      : Number((((closed.entryPrice - exitPrice) / closed.entryPrice) * 100).toFixed(2));

  appendPaperOrder({
    id: `paper-exit-${Date.now()}`,
    time: new Date().toISOString(),
    symbol,
    side: closed.side === "Long" ? "Long" : "Short",
    type: "청산",
    price: exitPrice,
    status: "paper",
    mode: "PAPER",
    serviceState: "paper"
  });

  logTradeOutcome({
    symbol,
    direction,
    entryReason: "PAPER 모의 진입",
    exitReason,
    pnlPct,
    signalType: "long_candidate"
  });
  recordTradeOutcome(loadRiskState(), pnlPct);

  return { phase: "exit", symbol, direction, reason: exitReason, pnlPct, signalType: "long_candidate" };
}

export function recordBlockedCandidate(candidate: AiCandidate): TradeLifecycleEvent {
  return {
    phase: "blocked",
    symbol: candidate.symbol,
    direction: candidate.direction,
    reason: candidate.blockReason ?? candidate.status,
    signalType: candidate.signalType
  };
}
