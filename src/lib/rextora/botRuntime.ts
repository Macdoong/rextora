import { notifyBotStarted, notifyBotStopped, notifyRiskBlock } from "./telegramOperation";
import { appendAuditLog } from "./storage/auditStore";
import { runBinanceDiagnostics } from "./binance/binanceDiagnosticsService";
import { cacheDiagnosticsReport } from "./systemStatusSyncService";
import { initializeServerTpSlManagerReadiness } from "./serverTpSlReadiness";
import { evaluateLiveSafetyGate } from "./liveSafetyGate";
import { executeLiveEntry, preflightLiveExecution } from "./liveExecutionEngine";
import { getRextoraSettings } from "./settings/settingsService";
import { getConfig } from "./config";
import { refreshMarketData, getMarketSnapshotAgeMs, getMarketDataSource } from "./marketDataStore";
import { invalidateCandidateCache, getCandidateSnapshotAgeMs } from "./aiRanker";
import { loadRiskState, resolveRiskStateFromStatus } from "./riskStateStore";
import { isRiskLimitBreached } from "./safety";
import {
  emergencyStopPaper,
  getPaperBotStatus,
  startPaperBot,
  stopPaperBot
} from "./paperExecutionEngine";
import { runSafePaperScanLoop, getLastSafeSignals } from "./execution/safePaperLoop";
import { loadSafeV44Strategy } from "./strategy/safeV44Strategy";
import { loadOhlcvCandles } from "./data/candleLoader";
import { computeIndicators } from "./indicator/indicatorEngine";
import { evaluateSafeV44Signal } from "./signal/safeV44SignalEngine";
import { evaluateCostGuard } from "./cost/costGuard";
import { calculateSafeV44Risk } from "./risk/safeV44RiskEngine";
import { getWatchedSymbols } from "./marketWatcherService";
import { getAccountState } from "./accountStateStore";
import { sendRiskAlertIfNeeded } from "./telegramAssistant";
import { logSystemEvent } from "./learningLogger";
import { cancelAllScheduledTasks, scheduleInterval } from "./scheduler";
import {
  clearEmergencyStop,
  getRuntimeState,
  markEmergencyStop,
  markScanComplete,
  markScanStarted,
  setRuntimeState
} from "./runtimeState";
import { isEmergencyActive } from "./emergencyControls";
import type { AiCandidate, EngineResult, TradingMode } from "./types";

const SCAN_TASK_ID = "rextora-scan-loop";
const HEARTBEAT_TASK_ID = "rextora-heartbeat";

let scanLock = false;
let liveEntryInProgress = false;

function toLiveCandidateFromSafe(input: {
  symbol: string;
  side: "LONG" | "SHORT";
  score: number;
  entryReason: string;
  signalType: string;
  leverage: number;
  expectedProfitPct: number;
  stopLossDistancePct: number;
}): AiCandidate {
  return {
    rank: 1,
    symbol: input.symbol,
    direction: input.side === "LONG" ? "롱" : "숏",
    signalType: input.side === "LONG" ? "long_candidate" : "short_candidate",
    aiScore: input.score,
    finalScore: input.score,
    expectedProfitPct: input.expectedProfitPct,
    expectedCostPct: 0.08,
    stopLossDistancePct: input.stopLossDistancePct,
    riskGrade: "중간",
    status: "진입 가능",
    entryReason: input.entryReason,
    signalReason: `SAFE ${input.signalType}`,
    costPassed: true,
    riskPassed: true,
    serviceState: "live-ready",
    leverage: input.leverage
  };
}

async function runSafeLiveEntries(maxEntries = 1): Promise<number> {
  const strategy = loadSafeV44Strategy({ throwOnHashMismatch: false });
  if (!strategy.hashVerified) return 0;

  const balance = getAccountState().availableBalanceUsdt || 10_000;
  const symbols = getWatchedSymbols().slice(0, 30);
  let entered = 0;

  for (const symbol of symbols) {
    if (entered >= maxEntries) break;
    const { candles, source } = await loadOhlcvCandles(symbol, { limit: 250, allowSynthetic: false });
    if (source !== "binance" || candles.length < strategy.params.ema_slow + 5) continue;

    const series = computeIndicators(candles, strategy.params);
    const signal = evaluateSafeV44Signal({
      symbol,
      series,
      params: strategy.params,
      paramsHash: strategy.paramsHash
    });
    if (!signal.passed || signal.side === "NONE" || !signal.indicators) continue;

    const risk = calculateSafeV44Risk({
      entryPrice: signal.indicators.close,
      atr: signal.indicators.atr,
      atrPct: signal.indicators.atrPct,
      side: signal.side,
      signalType: signal.signalType,
      balance,
      params: strategy.params
    });
    const cost = evaluateCostGuard({
      entryPrice: risk.entryPrice,
      takeProfitPrice: risk.takeProfitPrice,
      side: signal.side,
      atr: signal.indicators.atr,
      params: strategy.params
    });
    if (!cost.passed) continue;

    const tpDist =
      signal.side === "LONG"
        ? (risk.takeProfitPrice - risk.entryPrice) / risk.entryPrice
        : (risk.entryPrice - risk.takeProfitPrice) / risk.entryPrice;
    const slDist =
      signal.side === "LONG"
        ? (risk.entryPrice - risk.stopLossPrice) / risk.entryPrice
        : (risk.stopLossPrice - risk.entryPrice) / risk.entryPrice;

    const candidate = toLiveCandidateFromSafe({
      symbol,
      side: signal.side,
      score: signal.score,
      entryReason: signal.entryReason,
      signalType: signal.signalType,
      leverage: risk.leverage,
      expectedProfitPct: tpDist * 100,
      stopLossDistancePct: slDist * 100
    });

    const gate = evaluateLiveSafetyGate({
      mode: "LIVE",
      operatorLiveStartRequested: true,
      candidate,
      executionInProgress: true
    });
    if (!gate.passed) {
      await notifyRiskBlock(gate.blockedReasons[0] ?? "실전 거래 조건 미통과");
      continue;
    }

    liveEntryInProgress = true;
    try {
      const result = await executeLiveEntry(candidate);
      appendAuditLog({
        type: result.ok ? "live_entry" : "candidate_block",
        actor: "botRuntime",
        message: result.message,
        mode: "LIVE",
        correlationId: `safe-live-${Date.now()}`,
        symbol,
        details: { paramsHash: strategy.paramsHash, signalType: signal.signalType }
      });
      if (result.ok) entered += 1;
    } finally {
      liveEntryInProgress = false;
    }
  }

  return entered;
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
    const strategyMeta = loadSafeV44Strategy({ throwOnHashMismatch: false });

    if (mode === "PAPER") {
      const risk = loadRiskState();
      if (isRiskLimitBreached(risk)) {
        await sendRiskAlertIfNeeded("리스크 한도 위반으로 자동 중단");
        await emergencyStopPaper();
        markEmergencyStop("리스크 한도 위반");
        return;
      }
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

      const entered = await runSafeLiveEntries(1);
      appendAuditLog({
        type: "candidate_selected",
        actor: "botRuntime",
        message: `SAFE live scan entries=${entered}`,
        mode: "LIVE",
        correlationId: `safe-live-scan-${Date.now()}`,
        details: {
          entered,
          signals: getLastSafeSignals(5).length,
          paramsHash: strategyMeta.paramsHash
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

export async function startBotRuntime(): Promise<EngineResult> {
  clearEmergencyStop();
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
