import { getConfig } from "./config";
import type { BotRunState, TradingMode } from "./types";
import type { MarketDataSource } from "./marketDataStore";

export interface RuntimeState {
  running: boolean;
  mode: TradingMode;
  state: BotRunState | "대기" | "감시 중" | "거래 차단";
  lastHeartbeat: string;
  lastScanAt?: string;
  lastScanStartedAt?: string;
  lastScanFinishedAt?: string;
  lastScanDurationMs?: number;
  scanInProgress: boolean;
  scanCount: number;
  marketSnapshotAgeMs?: number;
  candidateSnapshotAgeMs?: number;
  dataSource?: MarketDataSource;
  lastError?: string;
  emergencyStopped: boolean;
}

let runtime: RuntimeState = {
  running: false,
  mode: getConfig().mode.bootMode,
  state: "대기",
  lastHeartbeat: new Date().toISOString(),
  scanCount: 0,
  scanInProgress: false,
  emergencyStopped: false
};

export function getRuntimeState(): RuntimeState {
  return runtime;
}

export function setRuntimeState(partial: Partial<RuntimeState>): RuntimeState {
  runtime = { ...runtime, ...partial, lastHeartbeat: new Date().toISOString() };
  return runtime;
}

export function markScanStarted(): RuntimeState {
  runtime = {
    ...runtime,
    scanInProgress: true,
    lastScanStartedAt: new Date().toISOString(),
    lastHeartbeat: new Date().toISOString()
  };
  return runtime;
}

export function markScanComplete(meta?: {
  durationMs?: number;
  marketSnapshotAgeMs?: number;
  candidateSnapshotAgeMs?: number;
  dataSource?: MarketDataSource;
}): RuntimeState {
  runtime = {
    ...runtime,
    scanCount: runtime.scanCount + 1,
    lastScanAt: new Date().toISOString(),
    lastScanFinishedAt: new Date().toISOString(),
    lastScanDurationMs: meta?.durationMs,
    marketSnapshotAgeMs: meta?.marketSnapshotAgeMs,
    candidateSnapshotAgeMs: meta?.candidateSnapshotAgeMs,
    dataSource: meta?.dataSource,
    scanInProgress: false,
    lastHeartbeat: new Date().toISOString()
  };
  return runtime;
}

export function markEmergencyStop(reason?: string): RuntimeState {
  runtime = {
    ...runtime,
    running: false,
    state: "거래 차단",
    emergencyStopped: true,
    scanInProgress: false,
    lastError: reason,
    lastHeartbeat: new Date().toISOString()
  };
  return runtime;
}

export function clearEmergencyStop(): RuntimeState {
  runtime = { ...runtime, emergencyStopped: false, lastError: undefined };
  return runtime;
}
