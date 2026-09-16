/**
 * Legacy /api/bot/restart gate — executor restart only when an authoritative
 * active Paper session exists. Never creates session truth or toggles paperActive.
 */

import { stopBotRuntime, startBotRuntime } from "../botRuntime";
import type { EngineResult } from "../types";
import {
  getActivePaperSessionService,
  getExecutablePaperSessionService,
} from "./paperSessionService";
import type { PaperSession, PaperSessionStatus } from "./paperSessionStore";

export type BotRestartRejectCode =
  | "NO_PAPER_SESSION"
  | "SESSION_NOT_EXECUTABLE"
  | "STRATEGY_MISMATCH";

export type BotRestartGateResult = EngineResult & {
  errorCode?: BotRestartRejectCode;
  sessionId?: string | null;
  sessionStatus?: PaperSessionStatus | null;
  sessionStrategyId?: string | null;
};

function reject(
  code: BotRestartRejectCode,
  message: string,
  session: PaperSession | null,
): BotRestartGateResult {
  return {
    ok: false,
    mode: "PAPER",
    serviceState: "paper",
    message,
    blockedReasons: [code],
    errorCode: code,
    sessionId: session?.id ?? null,
    sessionStatus: session?.status ?? null,
    sessionStrategyId: session?.strategyId ?? null,
  };
}

const NON_EXECUTABLE: ReadonlySet<PaperSessionStatus> = new Set([
  "pending_approval",
  "ready",
  "paused",
  "risk_halted",
  "stopped",
  "failed",
]);

/**
 * Restart paper executor only when current session is active and optional
 * strategyId matches session identity.
 */
export async function restartPaperBotWithSessionGate(input?: {
  strategyId?: string | null;
}): Promise<BotRestartGateResult> {
  const current = getActivePaperSessionService();
  if (!current) {
    return reject(
      "NO_PAPER_SESSION",
      "Paper 세션이 없습니다. Results 또는 Paper 화면에서 세션을 준비·승인하세요.",
      null,
    );
  }

  if (NON_EXECUTABLE.has(current.status)) {
    return reject(
      "SESSION_NOT_EXECUTABLE",
      `Paper 세션이 ${current.status} 상태입니다. 활성(active) 세션만 재시작할 수 있습니다.`,
      current,
    );
  }

  const executable = getExecutablePaperSessionService();
  if (!executable || executable.id !== current.id) {
    return reject(
      "SESSION_NOT_EXECUTABLE",
      "실행 가능한 Paper 세션이 없습니다. 세션을 승인·재개한 뒤 다시 시도하세요.",
      current,
    );
  }

  const requested = input?.strategyId?.trim() || null;
  if (requested && requested !== current.strategyId) {
    return reject(
      "STRATEGY_MISMATCH",
      `요청 strategyId(${requested})가 현재 Paper 세션(${current.strategyId})과 일치하지 않습니다.`,
      current,
    );
  }

  await stopBotRuntime();
  const started = await startBotRuntime();
  if (!started.ok) {
    return {
      ...started,
      errorCode: "SESSION_NOT_EXECUTABLE",
      sessionId: current.id,
      sessionStatus: current.status,
      sessionStrategyId: current.strategyId,
    };
  }

  return {
    ok: true,
    mode: "PAPER",
    serviceState: "paper",
    message: "Paper executor가 authoritative 세션 기준으로 재시작되었습니다.",
    sessionId: current.id,
    sessionStatus: current.status,
    sessionStrategyId: current.strategyId,
  };
}
