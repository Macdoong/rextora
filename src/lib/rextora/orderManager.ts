import { appendEmergencyAction } from "./localStore";
import { preflightLiveExecution } from "./liveExecutionEngine";
import { cancelPaperOrders, closePaperPosition, emergencyStopPaper } from "./paperExecutionEngine";
import type { EngineResult, TradingMode } from "./types";

function logAction(label: string, mode: TradingMode, result: "logged" | "blocked" | "simulated", message: string) {
  appendEmergencyAction({
    id: `${label}-${Date.now()}`,
    time: new Date().toISOString(),
    label,
    severity: result === "blocked" ? "danger" : "warning",
    requiresConfirmation: true,
    mode,
    result,
    message,
    serviceState: mode === "LIVE" ? "live-blocked" : mode === "PAPER" ? "paper" : "simulated"
  });
}

const backtestBlocked = (message: string): EngineResult => ({
  ok: false,
  mode: "BACKTEST",
  serviceState: "simulated",
  message,
  blockedReasons: ["BACKTEST 모드는 주문 동작을 실행하지 않습니다."]
});

export async function closePosition(mode: TradingMode = "PAPER"): Promise<EngineResult> {
  if (mode === "PAPER") {
    const result = await closePaperPosition();
    logAction("포지션 청산", mode, "simulated", result.message);
    return result;
  }
  if (mode === "LIVE") {
    const result = preflightLiveExecution();
    logAction("LIVE 포지션 청산 차단", mode, "blocked", result.message);
    return result;
  }
  const result = backtestBlocked("BACKTEST 포지션 청산은 차단됩니다.");
  logAction("BACKTEST 포지션 청산 차단", mode, "blocked", result.message);
  return result;
}

export async function partialClose(mode: TradingMode = "PAPER", percent = 50): Promise<EngineResult & { percent: number }> {
  if (mode === "PAPER") {
    const message = `PAPER ${percent}% 부분 청산이 모의 기록되었습니다.`;
    logAction("부분 청산", mode, "simulated", message);
    return { ok: true, mode, serviceState: "paper", message, percent };
  }
  const message = mode === "LIVE" ? "LIVE 부분 청산은 실거래 엔진 연결 전까지 차단됩니다." : "BACKTEST 부분 청산은 차단됩니다.";
  logAction("부분 청산 차단", mode, "blocked", message);
  return { ok: false, mode, serviceState: mode === "LIVE" ? "live-blocked" : "simulated", message, percent, blockedReasons: [message] };
}

export async function cancelAllOrders(mode: TradingMode = "PAPER"): Promise<EngineResult> {
  if (mode === "PAPER") {
    const result = await cancelPaperOrders();
    logAction("모든 주문 취소", mode, "simulated", result.message);
    return result;
  }
  if (mode === "LIVE") {
    const result = preflightLiveExecution();
    logAction("LIVE 주문 취소 차단", mode, "blocked", result.message);
    return result;
  }
  const result = backtestBlocked("BACKTEST 주문 취소는 차단됩니다.");
  logAction("BACKTEST 주문 취소 차단", mode, "blocked", result.message);
  return result;
}

export async function emergencyStopAll(mode: TradingMode = "PAPER"): Promise<EngineResult> {
  if (mode === "PAPER") {
    const result = await emergencyStopPaper();
    logAction("긴급 전체 중단", mode, "simulated", result.message);
    return result;
  }
  const message = mode === "LIVE" ? "LIVE 긴급 중지는 실거래 엔진 미연결로 차단 로그만 남깁니다." : `${mode} 긴급 중지가 기록되었습니다.`;
  logAction("긴급 전체 중단", mode, mode === "LIVE" ? "blocked" : "simulated", message);
  return { ok: mode !== "LIVE", mode, serviceState: mode === "LIVE" ? "live-blocked" : "simulated", message, blockedReasons: mode === "LIVE" ? ["실거래 엔진 미연결"] : undefined };
}
