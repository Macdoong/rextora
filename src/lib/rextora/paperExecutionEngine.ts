import { botStatusSeed, riskStatusSeed } from "./seedData";
import { canUsePaperMode } from "./safety";
import { getPreservedSafeStrategy } from "./strategyRepository";
import { saveBotMode } from "./localStore";
import { appendPaperOrder, cancelPendingOrders, closeAllPositions, getOpenPositions, getPaperOrderHistory } from "./positionManager";
import { recordPaperEntry, recordPaperExit } from "./tradeLifecycle";
import { getTopCandidates } from "./aiRanker";
import type { BotStatus, EngineResult, OrderRecord, Position, Strategy } from "./types";

let botStatus: BotStatus = { ...botStatusSeed };
let orders: OrderRecord[] = getPaperOrderHistory();
let positions: Position[] = getOpenPositions();

export function getPaperBotStatus(): BotStatus {
  return botStatus;
}

export function getPaperOrders(): OrderRecord[] {
  return orders.length ? orders : getPaperOrderHistory();
}

export function getPaperPosition(): Position {
  const open = getOpenPositions();
  if (open.length > 0) return open[0];
  return { ...positions[0], side: "Flat", quantity: 0, unrealizedPnl: 0, serviceState: "paper" };
}

export async function startPaperBot(strategy: Strategy = getPreservedSafeStrategy()): Promise<EngineResult> {
  if (!canUsePaperMode(strategy, riskStatusSeed)) {
    return { ok: false, mode: "PAPER", serviceState: "paper", message: "PAPER 모드 시작 조건을 만족하지 못했습니다." };
  }
  saveBotMode("PAPER");
  botStatus = { ...botStatus, running: true, mode: "PAPER", state: "감시 중", lastHeartbeat: new Date().toISOString(), serviceState: "paper" };
  return { ok: true, mode: "PAPER", serviceState: "paper", message: "PAPER 모의 감시가 시작되었습니다. 실제 주문은 전송되지 않습니다." };
}

export async function stopPaperBot(): Promise<EngineResult> {
  botStatus = { ...botStatus, running: false, state: "대기", lastHeartbeat: new Date().toISOString() };
  return { ok: true, mode: "PAPER", serviceState: "paper", message: "PAPER 모의 감시가 중지되었습니다." };
}

export async function restartPaperBot(): Promise<EngineResult> {
  await stopPaperBot();
  return startPaperBot();
}

export async function executePaperEntry(symbol?: string): Promise<EngineResult> {
  const candidate = getTopCandidates(5).find((c) => c.symbol === symbol) ?? getTopCandidates(1)[0];
  if (!candidate || candidate.status !== "진입 가능") {
    return { ok: false, mode: "PAPER", serviceState: "paper", message: "진입 가능한 PAPER 후보가 없습니다." };
  }
  const price = 100;
  const { order } = recordPaperEntry(candidate, price);
  orders = [order, ...orders];
  return { ok: true, mode: "PAPER", serviceState: "paper", message: `PAPER 모의 진입이 기록되었습니다: ${candidate.symbol}. 실제 주문은 전송되지 않습니다.` };
}

export async function executePaperExit(symbol?: string): Promise<EngineResult> {
  const target = symbol ?? getPaperPosition().symbol;
  const event = recordPaperExit(target, 101, "PAPER 모의 청산");
  if (!event) return { ok: false, mode: "PAPER", serviceState: "paper", message: "청산할 PAPER 포지션이 없습니다." };
  return { ok: true, mode: "PAPER", serviceState: "paper", message: `PAPER 모의 청산이 기록되었습니다: ${target}. 실제 주문은 전송되지 않습니다.` };
}

export async function closePaperPosition(): Promise<EngineResult> {
  return executePaperExit();
}

export async function cancelPaperOrders(): Promise<EngineResult> {
  orders = cancelPendingOrders();
  return { ok: true, mode: "PAPER", serviceState: "paper", message: "PAPER 미체결 주문 취소가 모의 기록되었습니다." };
}

export function simulateOrder(order: Partial<OrderRecord> = {}): OrderRecord {
  const next: OrderRecord = {
    id: `paper-${Date.now()}`,
    time: new Date().toISOString(),
    symbol: "BTCUSDT",
    side: "Long",
    type: "시장가",
    price: 100,
    status: "paper",
    mode: "PAPER",
    serviceState: "paper",
    ...order
  };
  orders = appendPaperOrder(next);
  return next;
}

export async function emergencyStopPaper(): Promise<EngineResult> {
  closeAllPositions();
  await cancelPaperOrders();
  await stopPaperBot();
  return { ok: true, mode: "PAPER", serviceState: "paper", message: "PAPER 긴급 중지가 기록되었습니다." };
}

// Legacy aliases
export const simulateSignal = () => ({ ok: true, signal: "EMA20 재돌파", serviceState: "simulated" as const, message: "PAPER 신호가 모의 생성되었습니다." });
export const simulatePosition = getPaperPosition;
