import { notifyBotStarted, notifyBotStopped, notifyCandidate, notifyRiskBlock } from "./telegramOperation";
import { appendAuditLog } from "./storage/auditStore";
import { runBinanceDiagnostics } from "./binance/binanceDiagnosticsService";
import { cacheDiagnosticsReport } from "./systemStatusSyncService";
import { initializeServerTpSlManagerReadiness } from "./serverTpSlReadiness";
import { evaluateLiveSafetyGate } from "./liveSafetyGate";
import { executeLiveEntry, preflightLiveExecution } from "./liveExecutionEngine";
import { getRextoraSettings } from "./settings/settingsService";
import { getConfig } from "./config";
import { refreshMarketData } from "./marketDataStore";
import { rankCandidates, invalidateCandidateCache } from "./aiRanker";
import { loadRiskState, resolveRiskStateFromStatus } from "./riskStateStore";
import { isRiskLimitBreached } from "./safety";
import { emergencyStopPaper, getPaperBotStatus, startPaperBot, stopPaperBot } from "./paperExecutionEngine";
import { sendRiskAlertIfNeeded } from "./telegramAssistant";
import { logCandidateSnapshot } from "./learningLogger";
import { cancelAllScheduledTasks, scheduleInterval } from "./scheduler";
import {
  clearEmergencyStop,
  getRuntimeState,
  markEmergencyStop,
  markScanComplete,
  markScanStarted,
  setRuntimeState
} from "./runtimeState";
import { getMarketSnapshotAgeMs, getMarketDataSource } from "./marketDataStore";
import { getCandidateSnapshotAgeMs } from "./aiRanker";
import { isEmergencyActive } from "./emergencyControls";
import type { EngineResult } from "./types";

const SCAN_TASK_ID = "rextora-scan-loop";
const HEARTBEAT_TASK_ID = "rextora-heartbeat";

let scanLock = false;
let liveEntryInProgress = false;

async function runPaperScanLoop(): Promise<void> {
  const state = getRuntimeState();
  if (!state.running || state.emergencyStopped || scanLock || state.scanInProgress || state.mode !== "PAPER") return;

  scanLock = true;
  markScanStarted();
  const started = Date.now();

  try {
    await refreshMarketData({ force: true });
    invalidateCandidateCache();
    const candidates = rankCandidates(5, { force: true });
    const top = candidates.find((c) => c.status === "진입 가능");
    if (top) logCandidateSnapshot(top);

    const risk = loadRiskState();
    if (isRiskLimitBreached(risk)) {
      await sendRiskAlertIfNeeded("리스크 한도 위반으로 자동 중단");
      await emergencyStopPaper();
      markEmergencyStop("리스크 한도 위반");
      return;
    }

    void resolveRiskStateFromStatus(risk);
    markScanComplete({
      durationMs: Date.now() - started,
      marketSnapshotAgeMs: getMarketSnapshotAgeMs(),
      candidateSnapshotAgeMs: getCandidateSnapshotAgeMs(),
      dataSource: getMarketDataSource()
    });
  } catch (error) {
    setRuntimeState({
      lastError: error instanceof Error ? error.message : "scan error",
      state: "오류",
      scanInProgress: false
    });
  } finally {
    scanLock = false;
  }
}

async function runLiveScanLoop(): Promise<void> {
  const state = getRuntimeState();
  if (!state.running || state.emergencyStopped || scanLock || state.scanInProgress || state.mode !== "LIVE") return;
  if (isEmergencyActive() || liveEntryInProgress) return;

  scanLock = true;
  markScanStarted();
  const started = Date.now();

  try {
    await refreshMarketData({ force: true });
    invalidateCandidateCache();
    const candidates = rankCandidates(5, { force: true });
    const top = candidates.find((c) => c.status === "진입 가능" && c.costPassed);

    if (top) {
      logCandidateSnapshot(top);
      await notifyCandidate(top.symbol, top.direction, top.aiScore);

      const report = await runBinanceDiagnostics().catch(() => null);
      if (report) cacheDiagnosticsReport(report);
      if (report) {
        await initializeServerTpSlManagerReadiness({ exchangeInfoValidated: true }).catch(() => undefined);
      }

      const gate = evaluateLiveSafetyGate({
        mode: "LIVE",
        operatorLiveStartRequested: true,
        diagnostics: report ?? undefined,
        candidate: top
      });

      if (!gate.passed) {
        await notifyRiskBlock(gate.blockedReasons[0] ?? "LIVE gate blocked");
        appendAuditLog({
          type: "live_execution_attempt",
          actor: "botRuntime",
          message: "LIVE scan blocked candidate",
          mode: "LIVE",
          correlationId: `live-scan-${Date.now()}`,
          symbol: top.symbol,
          details: { blockedReasons: gate.blockedReasons, candidateScore: top.aiScore }
        });
      } else {
        liveEntryInProgress = true;
        try {
          await executeLiveEntry(top);
        } finally {
          liveEntryInProgress = false;
        }
      }
    }

    markScanComplete({
      durationMs: Date.now() - started,
      marketSnapshotAgeMs: getMarketSnapshotAgeMs(),
      candidateSnapshotAgeMs: getCandidateSnapshotAgeMs(),
      dataSource: getMarketDataSource()
    });
  } catch (error) {
    setRuntimeState({
      lastError: error instanceof Error ? error.message : "live scan error",
      state: "오류",
      scanInProgress: false
    });
  } finally {
    scanLock = false;
  }
}

function startHeartbeat(): void {
  scheduleInterval(HEARTBEAT_TASK_ID, 30_000, () => {
    if (getRuntimeState().running) {
      setRuntimeState({ lastHeartbeat: new Date().toISOString() });
    }
  });
}

export async function startBotRuntime(): Promise<EngineResult> {
  clearEmergencyStop();
  const result = await startPaperBot();
  if (!result.ok) return result;

  const config = getConfig();
  setRuntimeState({ running: true, mode: "PAPER", state: "감시 중", scanInProgress: false });
  scheduleInterval(SCAN_TASK_ID, config.market.scanIntervalMs, () => void runPaperScanLoop());
  startHeartbeat();
  void runPaperScanLoop();
  await notifyBotStarted();
  return result;
}

export async function startLiveBotRuntime(): Promise<EngineResult> {
  const preflight = preflightLiveExecution();
  if (!preflight.ok) {
    return preflight;
  }

  const report = await runBinanceDiagnostics().catch(() => null);
  if (report) cacheDiagnosticsReport(report);
  if (report) {
    await initializeServerTpSlManagerReadiness({ exchangeInfoValidated: true }).catch(() => undefined);
  }

  const gate = evaluateLiveSafetyGate({
    mode: "LIVE",
    operatorLiveStartRequested: true,
    diagnostics: report ?? undefined,
    readinessOnly: true
  });

  if (!gate.passed) {
    return {
      ok: false,
      mode: "LIVE",
      serviceState: "live-blocked",
      message: gate.blockedReasons[0] ?? "LIVE start blocked",
      blockedReasons: gate.blockedReasons
    };
  }

  clearEmergencyStop();
  cancelAllScheduledTasks();
  scanLock = false;
  liveEntryInProgress = false;

  const settings = getRextoraSettings();
  setRuntimeState({ running: true, mode: "LIVE", state: "감시 중", scanInProgress: false });
  scheduleInterval(SCAN_TASK_ID, settings.market.scanIntervalMs, () => void runLiveScanLoop());
  startHeartbeat();
  void runLiveScanLoop();

  appendAuditLog({
    type: "live_execution_attempt",
    actor: "botRuntime",
    message: "LIVE bot started by operator",
    mode: "LIVE",
    correlationId: `live-start-${Date.now()}`
  });
  await notifyBotStarted();

  return {
    ok: true,
    mode: "LIVE",
    serviceState: "live-ready",
    message: "LIVE 실전 감시가 시작되었습니다. 진입 가능 후보만 실행됩니다."
  };
}

export async function stopBotRuntime(): Promise<EngineResult> {
  cancelAllScheduledTasks();
  scanLock = false;
  liveEntryInProgress = false;

  const mode = getRuntimeState().mode;
  const result = mode === "LIVE" ? { ok: true, mode: "LIVE" as const, serviceState: "live-ready" as const, message: "LIVE bot stopped" } : await stopPaperBot();

  setRuntimeState({ running: false, state: "대기", scanInProgress: false });
  await notifyBotStopped();
  return result;
}

export async function restartBotRuntime(): Promise<EngineResult> {
  const mode = getRuntimeState().mode;
  await stopBotRuntime();
  return mode === "LIVE" ? startLiveBotRuntime() : startBotRuntime();
}

export async function emergencyStopRuntime(reason = "긴급 중지"): Promise<EngineResult> {
  cancelAllScheduledTasks();
  scanLock = false;
  liveEntryInProgress = false;
  markEmergencyStop(reason);

  const mode = getRuntimeState().mode;
  if (mode === "LIVE") {
    return { ok: true, mode: "LIVE", serviceState: "live-blocked", message: `${reason}. LIVE 신규 진입이 차단되었습니다.` };
  }

  const result = await emergencyStopPaper();
  return { ...result, message: `${reason}. ${result.message}` };
}

export function getBotRuntimeStatus() {
  const bot = getPaperBotStatus();
  const runtime = getRuntimeState();
  return { bot, runtime };
}
