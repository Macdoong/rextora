import { appendEmergencyAction } from "./localStore";
import { emergencyStopPaper } from "./paperExecutionEngine";
import { createEmergencyLiveContext, setLiveExecutionStatus } from "./serverTpSlManager";
import { cancelAllFuturesOrders } from "./binance/binanceTradeService";
import { getAccountState } from "./accountStateStore";
import { clearServerTpSlOrders } from "./tpSlPlacement";
import { notifyEmergency } from "./telegramOperation";
import { appendAuditLog } from "./storage/auditStore";
import { stopBotRuntime } from "./botRuntime";
import type { EngineResult, TradingMode } from "./types";

let emergencyActive = false;

export function isEmergencyActive(): boolean {
  return emergencyActive;
}

function logEmergency(label: string, mode: TradingMode, message: string, result: "logged" | "blocked" | "simulated") {
  appendEmergencyAction({
    id: `${label}-${Date.now()}`,
    time: new Date().toISOString(),
    label,
    severity: "danger",
    requiresConfirmation: true,
    mode,
    result,
    message,
    serviceState: mode === "LIVE" ? "live-ready" : "paper"
  });
  appendAuditLog({
    type: "emergency_action",
    actor: "emergencyControls",
    message,
    mode,
    correlationId: `emergency-${Date.now()}`
  });
}

export async function emergencyStopLive(mode: TradingMode = "PAPER"): Promise<EngineResult> {
  emergencyActive = true;
  setLiveExecutionStatus("LIVE_EMERGENCY_STOPPED");
  await stopBotRuntime();

  if (mode === "PAPER") {
    const result = await emergencyStopPaper();
    logEmergency("긴급 전체 중단", mode, result.message, "simulated");
    await notifyEmergency("PAPER emergency stop");
    return result;
  }

  const context = createEmergencyLiveContext();
  const account = getAccountState();
  for (const position of account.positions) {
    await cancelAllFuturesOrders(position.symbol, context).catch(() => undefined);
  }
  clearServerTpSlOrders();
  logEmergency("LIVE 긴급 전체 중단", mode, "LIVE emergency stop executed", "logged");
  await notifyEmergency("LIVE emergency stop");
  return { ok: true, mode: "LIVE", serviceState: "live-ready", message: "LIVE emergency stop executed" };
}

export async function closeAllLivePositions(mode: TradingMode = "PAPER"): Promise<EngineResult> {
  if (mode === "PAPER") {
    const message = "PAPER close-all simulated";
    logEmergency("전체 포지션 청산", mode, message, "simulated");
    return { ok: true, mode, serviceState: "paper", message };
  }
  const context = createEmergencyLiveContext();
  const account = getAccountState();
  for (const position of account.positions) {
    await cancelAllFuturesOrders(position.symbol, context).catch(() => undefined);
  }
  const message = "LIVE close-all executed";
  logEmergency("LIVE 전체 포지션 청산", mode, message, "logged");
  return { ok: true, mode: "LIVE", serviceState: "live-ready", message };
}

export async function cancelAllLiveOrders(mode: TradingMode = "PAPER"): Promise<EngineResult> {
  if (mode === "PAPER") {
    const message = "PAPER cancel-all simulated";
    logEmergency("전체 주문 취소", mode, message, "simulated");
    return { ok: true, mode, serviceState: "paper", message };
  }
  const context = createEmergencyLiveContext();
  const account = getAccountState();
  for (const position of account.positions) {
    await cancelAllFuturesOrders(position.symbol, context).catch(() => undefined);
  }
  clearServerTpSlOrders();
  const message = "LIVE cancel-all executed";
  logEmergency("LIVE 전체 주문 취소", mode, message, "logged");
  return { ok: true, mode: "LIVE", serviceState: "live-ready", message };
}
