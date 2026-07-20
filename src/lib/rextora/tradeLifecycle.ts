import { recordTradeOutcome as recordLearningTradeOutcome } from "./learningEngine";
import { recordTradeOutcome, loadRiskState } from "./riskStateStore";
import { appendPaperOrder, closePositionBySymbol, upsertPosition } from "./positionManager";
import { notifyTradeEntry, notifyTradeClosed } from "./telegramOperation";
import { generateAiTradeReport } from "./report/aiTradeReport";
import { buildUnifiedTradeResult } from "./metrics/tradeResult";
import { appendUnifiedTradeResult } from "./metrics/tradeResultStore";
import { SAFE_STRATEGY_ID } from "./strategy/strategyTypes";
import type { AiCandidate, OrderRecord, Position, SignalType, TradeDirection } from "./types";

export interface SafePaperEntryPayload {
  symbol: string;
  side: "LONG" | "SHORT";
  signalType: string;
  entryReason: string;
  score: number;
  entryPrice: number;
  stopLoss: number;
  takeProfit: number;
  leverage: number;
  quantity: number;
  margin: number;
  strategyName: string;
  paramsHash: string;
  trailingDistance?: number;
  maxHoldBars?: number;
}

export interface TradeLifecycleEvent {
  phase: "entry" | "exit" | "blocked";
  symbol: string;
  direction: TradeDirection;
  reason: string;
  pnlPct?: number;
  signalType: SignalType;
}

export function recordPaperEntryFromSafe(payload: SafePaperEntryPayload): { position: Position; order: OrderRecord } {
  const position: Position = {
    id: `paper-safe-${payload.symbol}-${Date.now()}`,
    symbol: payload.symbol,
    side: payload.side === "LONG" ? "Long" : "Short",
    entryPrice: payload.entryPrice,
    currentPrice: payload.entryPrice,
    quantity: payload.quantity,
    leverage: payload.leverage,
    unrealizedPnl: 0,
    margin: payload.margin,
    stopLoss: payload.stopLoss,
    takeProfit: payload.takeProfit,
    mode: "PAPER",
    serviceState: "paper",
    aiScore: payload.score,
    finalScore: payload.score,
    entrySignalType: payload.side === "LONG" ? "long_candidate" : "short_candidate",
    openedAt: new Date().toISOString(),
    entryReason: payload.entryReason,
    paramsHash: payload.paramsHash,
    strategyName: payload.strategyName,
    trailingDistance: payload.trailingDistance,
    maxHoldBars: payload.maxHoldBars,
    barsHeld: 0
  };
  const order: OrderRecord = {
    id: `paper-order-${Date.now()}`,
    time: new Date().toISOString(),
    symbol: payload.symbol,
    side: payload.side === "LONG" ? "Long" : "Short",
    type: "시장가",
    price: payload.entryPrice,
    status: "paper",
    mode: "PAPER",
    serviceState: "paper"
  };
  upsertPosition(position);
  appendPaperOrder(order);
  void notifyTradeEntry({
    symbol: payload.symbol,
    direction: payload.side === "LONG" ? "롱" : "숏",
    entryPrice: payload.entryPrice,
    leverage: payload.leverage,
    mode: "PAPER"
  });
  return { position, order };
}

export function recordPaperEntry(candidate: AiCandidate, price: number): { position: Position; order: OrderRecord } {
  const leverage = candidate.leverage ?? 2;
  const position: Position = {
    id: `paper-${candidate.symbol}-${Date.now()}`,
    symbol: candidate.symbol,
    side: candidate.direction === "롱" ? "Long" : "Short",
    entryPrice: price,
    currentPrice: price,
    quantity: 1,
    leverage,
    unrealizedPnl: 0,
    margin: price,
    stopLoss: candidate.direction === "롱" ? price * 0.995 : price * 1.005,
    takeProfit: candidate.direction === "롱" ? price * 1.01 : price * 0.99,
    mode: "PAPER",
    serviceState: "paper",
    aiScore: candidate.aiScore,
    finalScore: candidate.finalScore,
    entrySignalType: candidate.signalType,
    openedAt: new Date().toISOString()
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
  void notifyTradeEntry({
    symbol: candidate.symbol,
    direction: candidate.direction,
    entryPrice: price,
    leverage,
    mode: "PAPER"
  });
  return { position, order };
}

export function recordPaperExit(symbol: string, exitPrice: number, exitReason: string): TradeLifecycleEvent | null {
  const closed = closePositionBySymbol(symbol);
  if (!closed) return null;
  const direction: TradeDirection = closed.side === "Short" ? "숏" : "롱";
  const tradeSide = closed.side === "Short" ? "SHORT" : "LONG";

  const unified = buildUnifiedTradeResult({
    symbol,
    side: tradeSide,
    strategyId: closed.strategyName ?? SAFE_STRATEGY_ID,
    entryPrice: closed.entryPrice,
    exitPrice,
    quantity: closed.quantity,
    leverage: closed.leverage || 1,
    exitReason,
    mode: "PAPER",
    openedAt: closed.openedAt
  });
  appendUnifiedTradeResult(unified);

  const pnlPct = unified.netPct;

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

  recordLearningTradeOutcome({
    mode: "PAPER",
    symbol,
    side: direction,
    signalType: closed.entrySignalType ?? "long_candidate",
    aiScore: closed.aiScore ?? 0,
    finalScore: closed.finalScore ?? closed.aiScore ?? 0,
    leverage: closed.leverage,
    entryPrice: closed.entryPrice,
    exitPrice,
    realizedPnl: unified.realizedUsdt,
    realizedPnlPct: pnlPct,
    result: unified.netPnl > 0 ? "win" : unified.netPnl < 0 ? "loss" : "flat",
    exitReason: exitReason.includes("손절") ? "stop_loss" : exitReason.includes("익절") ? "take_profit" : "manual",
    timestamp: unified.timestamp
  });
  recordTradeOutcome(loadRiskState(), pnlPct);

  void notifyTradeClosed({
    symbol,
    direction,
    pnlPct,
    exitReason,
    mode: "PAPER"
  });

  generateAiTradeReport({
    symbol,
    side: direction,
    signalType: closed.entrySignalType,
    entryReason: closed.entryReason,
    exitReason,
    entryPrice: closed.entryPrice,
    exitPrice,
    leverage: closed.leverage,
    realizedPnlPct: pnlPct,
    paramsHash: closed.paramsHash,
    mode: "PAPER"
  });

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
