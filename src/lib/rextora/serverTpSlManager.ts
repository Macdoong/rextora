import { getConfig } from "./config";

import { evaluateLiveSafetyGate } from "./liveSafetyGate";
import { isServerTpSlManagerReady } from "./serverTpSlReadiness";

import type { LiveExecutionStatus } from "./tpSlTypes";

import type { TradingMode } from "./types";



export interface LiveExecutionContext {

  mode: TradingMode;

  confirmationText?: string;

  requestId: string;

  approvedAt: string;

  liveApproved: boolean;

  preflightPassed: boolean;

  riskPassed: boolean;

  serverTpSlSatisfied: boolean;

  emergency?: boolean;

}



export interface ServerTpSlState {

  active: boolean;

  tpOrderId?: number;

  slOrderId?: number;

  symbol?: string;

  registeredAt?: string;

  verified?: boolean;

  failedCount: number;

  lastMessage?: string;

}



let serverTpSlState: ServerTpSlState = { active: false, failedCount: 0 };

let liveStatus: LiveExecutionStatus = "LIVE_BLOCKED";

let executionLock = false;



export function getLiveExecutionStatus(): LiveExecutionStatus {

  return liveStatus;

}



export function setLiveExecutionStatus(status: LiveExecutionStatus): void {

  liveStatus = status;

}



export function acquireExecutionLock(): boolean {

  if (executionLock) return false;

  executionLock = true;

  return true;

}



export function releaseExecutionLock(): void {

  executionLock = false;

}



export function isExecutionLocked(): boolean {

  return executionLock;

}



export function getServerTpSlState(): ServerTpSlState {

  return serverTpSlState;

}



export function registerServerTpSl(input: { symbol: string; tpOrderId?: number; slOrderId?: number; verified?: boolean; message?: string }): ServerTpSlState {

  serverTpSlState = {

    active: Boolean(input.tpOrderId && input.slOrderId),

    symbol: input.symbol,

    tpOrderId: input.tpOrderId,

    slOrderId: input.slOrderId,

    registeredAt: new Date().toISOString(),

    verified: input.verified ?? Boolean(input.tpOrderId && input.slOrderId),

    failedCount: input.tpOrderId && input.slOrderId ? serverTpSlState.failedCount : serverTpSlState.failedCount + 1,

    lastMessage: input.message

  };

  return serverTpSlState;

}



export function clearServerTpSl(): ServerTpSlState {

  serverTpSlState = { active: false, failedCount: serverTpSlState.failedCount };

  return serverTpSlState;

}



export function validateServerTpSlRequired(mode: TradingMode = "LIVE"): { ok: boolean; message: string } {

  const config = getConfig();

  if (mode !== "LIVE") return { ok: true, message: "PAPER TP/SL simulation ready" };

  if (!config.serverTpSlRequired) return { ok: true, message: "서버 TP/SL 요구사항 비활성" };

  if (!isServerTpSlManagerReady()) return { ok: false, message: "LIVE 시작 전 서버 TP/SL 매니저가 준비되지 않았습니다." };

  if (serverTpSlState.active && !serverTpSlState.verified) return { ok: false, message: "서버 TP/SL 검증이 완료되지 않았습니다." };

  return { ok: true, message: "서버 TP/SL 상태가 확인되었습니다." };

}



export function getTpSlBlockReasons(): string[] {

  const reasons: string[] = [];

  if (!serverTpSlState.active) reasons.push("LIVE 시작 전 서버 TP/SL이 필수입니다.");

  if (serverTpSlState.active && !serverTpSlState.verified) reasons.push("서버 TP/SL 검증이 완료되지 않았습니다.");

  return Array.from(new Set(reasons));

}



export function createLiveExecutionContext(_confirmationText?: string, options?: { emergency?: boolean; preflightPassed?: boolean; riskPassed?: boolean }): LiveExecutionContext | null {

  if (options?.emergency) {

    return {

      mode: "LIVE",

      requestId: `emergency-${Date.now()}`,

      approvedAt: new Date().toISOString(),

      liveApproved: true,

      preflightPassed: true,

      riskPassed: true,

      serverTpSlSatisfied: true,

      emergency: true

    };

  }



  const gate = evaluateLiveSafetyGate({
    mode: "LIVE",
    operatorLiveStartRequested: true,
    executionInProgress: true
  });

  if (!gate.passed) return null;



  const tpSl = validateServerTpSlRequired("LIVE");

  return {

    mode: "LIVE",

    requestId: `live-${Date.now()}`,

    approvedAt: new Date().toISOString(),

    liveApproved: true,

    preflightPassed: options?.preflightPassed ?? true,

    riskPassed: options?.riskPassed ?? true,

    serverTpSlSatisfied: tpSl.ok

  };

}



export function createEmergencyLiveContext(): LiveExecutionContext {

  return {

    mode: "LIVE",

    requestId: `emergency-${Date.now()}`,

    approvedAt: new Date().toISOString(),

    liveApproved: true,

    preflightPassed: true,

    riskPassed: true,

    serverTpSlSatisfied: true,

    emergency: true

  };

}


