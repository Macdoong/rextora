import { appendEmergencyAction } from "./localStore";
import { emergencyStopAll } from "./orderManager";
import { executePaperEntry, executePaperExit, startPaperBot, stopPaperBot } from "./paperExecutionEngine";
import { preflightLiveExecution } from "./liveExecutionEngine";
import { startBotRuntime, startLiveBotRuntime, stopBotRuntime, emergencyStopRuntime } from "./botRuntime";
import type { EngineResult, TradingMode } from "./types";

export async function startExecution(mode: TradingMode = "PAPER"): Promise<EngineResult> {
  if (mode === "LIVE") {
    const preflight = preflightLiveExecution();
    if (!preflight.ok) {
      appendEmergencyAction({
        id: `live-start-blocked-${Date.now()}`,
        time: new Date().toISOString(),
        label: "LIVE 시작 차단",
        severity: "danger",
        requiresConfirmation: true,
        mode: "LIVE",
        result: "blocked",
        message: preflight.message,
        serviceState: "live-blocked"
      });
      return preflight;
    }
    return startLiveBotRuntime();
  }
  return startBotRuntime();
}

export async function stopExecution(mode: TradingMode = "PAPER"): Promise<EngineResult> {
  if (mode === "LIVE") return stopBotRuntime();
  return stopBotRuntime();
}

export async function logEmergencyAction(label: string, mode: TradingMode = "PAPER"): Promise<EngineResult> {
  if (mode === "PAPER") return emergencyStopRuntime(label);
  return emergencyStopAll(mode);
}

export { executePaperEntry, executePaperExit, emergencyStopAll, startPaperBot, stopPaperBot };
