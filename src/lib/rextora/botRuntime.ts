import { notifyBotStarted, notifyBotStopped } from "./telegramOperation";
import { appendAuditLog } from "./storage/auditStore";
import { runBinanceDiagnostics } from "./binance/binanceDiagnosticsService";
import { cacheDiagnosticsReport } from "./systemStatusSyncService";
import { initializeServerTpSlManagerReadiness } from "./serverTpSlReadiness";
import { evaluateLiveSafetyGate } from "./liveSafetyGate";
import { preflightLiveExecution } from "./liveExecutionEngine";
import {
  dispatchLiveExecution,
  liveExecutionDispatchRoute,
  resolveLiveExecutionTarget,
} from "./live/liveExecutionTarget";
import { runEventSequenceLiveEntries } from "./live/liveEventSequenceLiveScan";
import { getRextoraSettings } from "./settings/settingsService";
import { getConfig } from "./config";
import { refreshMarketData, getMarketSnapshotAgeMs, getMarketDataSource } from "./marketDataStore";
import { invalidateCandidateCache, getCandidateSnapshotAgeMs } from "./aiRanker";
import {
  getEffectiveRiskState,
  resetPaperRiskStateForNewSession,
  resolveRiskStateFromStatus
} from "./riskStateStore";
import { isRiskLimitBreached } from "./safety";
import { getRiskBreachKeys } from "./riskRules";
import {
  emergencyStopPaper,
  getPaperBotStatus,
  startPaperBot,
  stopPaperBot
} from "./paperExecutionEngine";
import { runSafePaperScanLoop } from "./execution/safePaperLoop";
import { getPaperActiveStrategy } from "./strategy/strategyStore";
import { markRiskAlertStateNormal, sendRiskAlertIfNeeded } from "./telegramAssistant";
import { logSystemEvent } from "./learningLogger";
import {
  cancelAllScheduledTasks,
  PAPER_SCAN_TASK_ID,
  scheduleInterval,
} from "./scheduler";
import {
  clearEmergencyStop,
  getRuntimeState,
  markEmergencyStop,
  markScanComplete,
  markScanStarted,
  setRuntimeState
} from "./runtimeState";
import { isEmergencyActive } from "./emergencyControls";
import type { EngineResult, TradingMode } from "./types";

export { PAPER_SCAN_TASK_ID };
const SCAN_TASK_ID = PAPER_SCAN_TASK_ID;
const HEARTBEAT_TASK_ID = "rextora-heartbeat";

let scanLock = false;
let liveEntryInProgress = false;

async function runSafeLiveEntries(_maxEntries = 1): Promise<number> {
  return 0;
}

async function runExecutionScanLoop(mode: TradingMode): Promise<void> {
  const state = getRuntimeState();
  if (!state.running || state.emergencyStopped || scanLock || state.scanInProgress || state.mode !== mode) return;
  if (mode === "LIVE" && (isEmergencyActive() || liveEntryInProgress)) return;

  scanLock = true;
  markScanStarted();
  const started = Date.now();

  try {
    await refreshMarketData({ force: true });
    invalidateCandidateCache();
    const paperStrategy = getPaperActiveStrategy();
    const strategyMeta = paperStrategy
      ? {
          name: paperStrategy.name,
          paramsHash: paperStrategy.paramsHash,
          sourceStatus: paperStrategy.sourceStatus ?? "user_created",
        }
      : { name: "none", paramsHash: "", sourceStatus: "none" };

    if (mode === "PAPER") {
      const risk = getEffectiveRiskState(mode);
      if (isRiskLimitBreached(risk)) {
        const breachFingerprint = getRiskBreachKeys(risk).sort().join("|");
        await sendRiskAlertIfNeeded("리스크 한도 위반으로 자동 중단", breachFingerprint);
        await emergencyStopPaper();
        markEmergencyStop("리스크 한도 위반");
        try {
          const { getCurrentPaperSession, haltPaperSessionForRisk } = await import(
            "./paper/paperSessionStore"
          );
          const current = getCurrentPaperSession();
          if (current?.status === "active") {
            haltPaperSessionForRisk(current.id, "리스크 한도 위반");
          }
        } catch {
          // Session halt is best-effort after executor stop; never resume.
        }
        return;
      }
      markRiskAlertStateNormal();
      void resolveRiskStateFromStatus(risk);

      const scan = await runSafePaperScanLoop({ maxSymbols: 40, maxNewEntries: 2 });
      appendAuditLog({
        type: "candidate_selected",
        actor: "botRuntime",
        message: `SAFE paper scan: ${scan.scanned} symbols, ${scan.entries} entries`,
        mode: "PAPER",
        correlationId: `safe-paper-${Date.now()}`,
        details: {
          scanned: scan.scanned,
          entries: scan.entries,
          strategy: strategyMeta.name,
          paramsHash: strategyMeta.paramsHash,
          sourceStatus: strategyMeta.sourceStatus
        }
      });
    } else {
      const report = await runBinanceDiagnostics().catch(() => null);
      if (report) cacheDiagnosticsReport(report);
      if (report) {
        await initializeServerTpSlManagerReadiness({ exchangeInfoValidated: true }).catch(() => undefined);
      }

      const liveTarget = resolveLiveExecutionTarget();
      const entered = await dispatchLiveExecution(liveTarget, {
        runSafe: () => runSafeLiveEntries(1),
        runEventSequence: async () => {
          if (!liveTarget.ok) return 0;
          liveEntryInProgress = true;
          try {
            const result = await runEventSequenceLiveEntries({
              strategyId: liveTarget.strategyId,
              maxEntries: 1,
            });
            return result.entered;
          } finally {
            liveEntryInProgress = false;
          }
        },
        failClosed: async (reason) => {
          appendAuditLog({
            type: "candidate_block",
            actor: "botRuntime",
            message: reason.message,
            mode: "LIVE",
            correlationId: `live-target-${Date.now()}`,
            details: { code: reason.code, fallbackToSafe: false },
          });
          return 0;
        },
      });
      appendAuditLog({
        type: "candidate_selected",
        actor: "botRuntime",
        message: `live scan entries=${entered}`,
        mode: "LIVE",
        correlationId: `live-scan-${Date.now()}`,
        details: {
          entered,
          strategyId: liveTarget.ok ? liveTarget.strategyId : null,
          executionKind: liveTarget.ok ? liveTarget.executionKind : null,
          paramsHash: liveTarget.ok ? liveTarget.paramsHash : null,
        }
      });
    }

    markScanComplete({
      durationMs: Date.now() - started,
      marketSnapshotAgeMs: getMarketSnapshotAgeMs(),
      candidateSnapshotAgeMs: getCandidateSnapshotAgeMs(),
      dataSource: getMarketDataSource()
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "scan error";
    logSystemEvent({
      eventType: "오류",
      message: `자동매매 스캔 오류: ${message}`,
      mode: mode === "LIVE" ? "LIVE" : "PAPER"
    });
    setRuntimeState({
      lastError: message,
      state: "오류",
      scanInProgress: false
    });
  } finally {
    scanLock = false;
  }
}

async function runPaperScanLoop(): Promise<void> {
  await runExecutionScanLoop("PAPER");
}

async function runLiveScanLoop(): Promise<void> {
  await runExecutionScanLoop("LIVE");
}

function startHeartbeat(): void {
  scheduleInterval(HEARTBEAT_TASK_ID, 30_000, () => {
    if (getRuntimeState().running) {
      setRuntimeState({ lastHeartbeat: new Date().toISOString() });
    }
  });
}

export async function startBotRuntime(options?: { resetPaperRiskState?: boolean }): Promise<EngineResult> {
  clearEmergencyStop();
  try {
    const { recoverOrphanSearchJobs } = await import(
      "./strategySearch/orphanJobRecovery"
    );
    recoverOrphanSearchJobs();
  } catch {
    // Non-fatal: paper bot can start even if search recovery fails.
  }

  // Executor must not create an independent Paper session. An active session
  // is required — approveAndStartPaperSession creates it before calling here.
  try {
    const { getExecutablePaperSession } = await import("./paper/paperSessionStore");
    if (!getExecutablePaperSession()) {
      return {
        ok: false,
        mode: "PAPER",
        message:
          "활성 Paper 세션이 없습니다. Paper 화면에서 승인 후 시작하세요.",
        serviceState: "paper",
        blockedReasons: ["NO_EXECUTABLE_PAPER_SESSION"],
      };
    }
  } catch {
    // If store cannot load, fail closed.
    return {
      ok: false,
      mode: "PAPER",
      message: "Paper 세션을 확인할 수 없습니다.",
      serviceState: "paper",
      blockedReasons: ["PAPER_SESSION_UNAVAILABLE"],
    };
  }

  if (options?.resetPaperRiskState) {
    resetPaperRiskStateForNewSession();
    markRiskAlertStateNormal();
  }

  const result = await startPaperBot();
  if (!result.ok) return result;

  const config = getConfig();
  setRuntimeState({ running: true, mode: "PAPER", state: "감시 중", scanInProgress: false });
  scheduleInterval(SCAN_TASK_ID, config.market.scanIntervalMs, () => void runPaperScanLoop());
  startHeartbeat();
  void runPaperScanLoop();
  logSystemEvent({ eventType: "자동매매 시작", message: "모의 자동매매가 시작되었습니다.", mode: "PAPER" });
  await notifyBotStarted("PAPER");
  return result;
}

export async function startLiveBotRuntime(): Promise<EngineResult> {
  const preflight = preflightLiveExecution();
  if (!preflight.ok) {
    return preflight;
  }
  const liveTarget = resolveLiveExecutionTarget();
  if (!liveTarget.ok || liveExecutionDispatchRoute(liveTarget) === "blocked") {
    return {
      ok: false,
      mode: "LIVE",
      serviceState: "live-blocked",
      message: liveTarget.ok
        ? "이 전략은 실전 실행 경로가 없습니다."
        : liveTarget.message,
      blockedReasons: [liveTarget.ok ? "UNSUPPORTED_LIVE_EXECUTION_KIND" : liveTarget.code],
    };
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
    logSystemEvent({
      eventType: "실전 거래 차단",
      message: gate.blockedReasons[0] ?? "실전 거래 시작 조건을 통과하지 못했습니다.",
      mode: "LIVE"
    });
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
  logSystemEvent({ eventType: "자동매매 시작", message: "실전 자동매매가 시작되었습니다.", mode: "LIVE" });
  await notifyBotStarted("LIVE");

  return {
    ok: true,
    mode: "LIVE",
    serviceState: "live-ready",
    message: "실전 거래 감시가 시작되었습니다. SAFE 수학 시그널만 실행됩니다."
  };
}

export async function stopBotRuntime(): Promise<EngineResult> {
  cancelAllScheduledTasks();
  scanLock = false;
  liveEntryInProgress = false;

  const mode = getRuntimeState().mode;
  const result =
    mode === "LIVE"
      ? { ok: true, mode: "LIVE" as const, serviceState: "live-ready" as const, message: "LIVE bot stopped" }
      : await stopPaperBot();

  setRuntimeState({ running: false, state: "대기", scanInProgress: false });
  logSystemEvent({
    eventType: "자동매매 중지",
    message: mode === "LIVE" ? "실전 자동매매가 중지되었습니다." : "모의 자동매매가 중지되었습니다.",
    mode: mode === "LIVE" ? "LIVE" : "PAPER"
  });
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
  logSystemEvent({
    eventType: "긴급 중지",
    message: reason,
    mode: getRuntimeState().mode === "LIVE" ? "LIVE" : "PAPER"
  });

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
