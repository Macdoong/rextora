/**
 * Canonical Paper Session Service — single commercial write path.
 *
 * AUTHORITATIVE: persisted PaperSession (paperSessionStore)
 * EXECUTOR: botRuntime / safePaperLoop (never owns session truth)
 * REGISTRY: paperActive is eligibility/policy only — never overrides session status
 *
 * All UI/API/Agent Paper lifecycle actions must call this service.
 */

import {
  activatePaperSession,
  assertSessionIdMatch,
  assertSessionStrategyMatch,
  failPaperSession,
  getCurrentPaperSession,
  getExecutablePaperSession,
  getPaperSession,
  listPaperSessions,
  markPaperSessionReady,
  migratePaperSessionRecord,
  pausePaperSession,
  preparePaperSession,
  PaperSessionError,
  resumePaperSession,
  stopPaperSession,
  touchPaperSessionHeartbeat,
  type PaperSession,
  type PaperSessionStoreOptions,
  type PreparePaperSessionInput,
} from "./paperSessionStore";
import { getStrategyById } from "../strategy/strategyStore";
import type { StoredStrategy } from "../strategy/strategyTypes";

export {
  PaperSessionError,
  migratePaperSessionRecord,
  type PaperSession,
  type PaperSessionStatus,
  type PreparePaperSessionInput,
} from "./paperSessionStore";

export type PaperSessionServiceOptions = PaperSessionStoreOptions & {
  /** When false, do not start/stop botRuntime (unit tests). Default true. */
  manageExecutor?: boolean;
};

type IdempotencyEntry = {
  key: string;
  action: string;
  sessionId: string;
  resultSessionId: string;
  at: number;
};

const IDEMPOTENCY_TTL_MS = 60_000;
const idempotencyCache = new Map<string, IdempotencyEntry>();

function pruneIdempotency(): void {
  const now = Date.now();
  for (const [k, v] of idempotencyCache) {
    if (now - v.at > IDEMPOTENCY_TTL_MS) idempotencyCache.delete(k);
  }
}

function rememberIdempotent(
  key: string | undefined,
  action: string,
  sessionId: string,
  session: PaperSession,
): PaperSession | null {
  if (!key?.trim()) return null;
  pruneIdempotency();
  const cacheKey = `${action}:${key.trim()}`;
  const hit = idempotencyCache.get(cacheKey);
  if (hit && hit.sessionId === sessionId) {
    return getPaperSession(hit.resultSessionId) ?? session;
  }
  idempotencyCache.set(cacheKey, {
    key: key.trim(),
    action,
    sessionId,
    resultSessionId: session.id,
    at: Date.now(),
  });
  return null;
}

async function startExecutorSafe(): Promise<void> {
  const { startBotRuntime } = await import("../botRuntime");
  const result = await startBotRuntime();
  if (!result.ok) {
    throw new PaperSessionError(
      result.message || "paper executor failed to start",
      "EXECUTOR_START_FAILED",
    );
  }
}

async function stopExecutorSafe(): Promise<void> {
  const { stopBotRuntime } = await import("../botRuntime");
  await stopBotRuntime();
}

function shouldManageExecutor(options?: PaperSessionServiceOptions): boolean {
  return options?.manageExecutor !== false;
}

export function preparePaperSessionService(
  input: PreparePaperSessionInput,
  options?: PaperSessionServiceOptions,
): PaperSession {
  return preparePaperSession(input, options);
}

export function getActivePaperSessionService(
  options?: PaperSessionServiceOptions,
): PaperSession | null {
  return getCurrentPaperSession(options);
}

export function getExecutablePaperSessionService(
  options?: PaperSessionServiceOptions,
): PaperSession | null {
  return getExecutablePaperSession(options);
}

export function getPaperSessionById(
  id: string,
  options?: PaperSessionServiceOptions,
): PaperSession | null {
  return getPaperSession(id, options);
}

export function listPaperSessionsService(
  options?: PaperSessionServiceOptions,
): PaperSession[] {
  return listPaperSessions(options);
}

/**
 * Explicit human approval: ready|pending_approval → active, then start executor.
 */
export async function approveAndStartPaperSession(
  input: {
    sessionId: string;
    strategyId?: string;
    idempotencyKey?: string;
  },
  options?: PaperSessionServiceOptions,
): Promise<PaperSession> {
  const session = getPaperSession(input.sessionId, options);
  if (!session) {
    throw new PaperSessionError(
      `session not found: ${input.sessionId}`,
      "NOT_FOUND",
    );
  }
  assertSessionIdMatch(session, input.sessionId);
  if (input.strategyId) {
    assertSessionStrategyMatch(session, input.strategyId);
  }

  const cached = rememberIdempotent(
    input.idempotencyKey,
    "approveAndStart",
    session.id,
    session,
  );
  if (cached && cached.status === "active") return cached;

  let ready = session;
  if (ready.status === "pending_approval") {
    ready = markPaperSessionReady(ready.id, options);
  }
  const activated = activatePaperSession(ready.id, options);

  if (shouldManageExecutor(options)) {
    try {
      await startExecutorSafe();
    } catch (err) {
      failPaperSession(
        activated.id,
        err instanceof Error ? err.message : "executor start failed",
        options,
      );
      throw err;
    }
  }

  rememberIdempotent(
    input.idempotencyKey,
    "approveAndStart",
    activated.id,
    activated,
  );
  return getPaperSession(activated.id, options) ?? activated;
}

/**
 * Prepare + approve in one commercial start (Paper page).
 * Still requires explicit call — never auto-starts from URL alone.
 */
export async function startPaperSessionFromStrategy(
  input: PreparePaperSessionInput & {
    idempotencyKey?: string;
  },
  options?: PaperSessionServiceOptions,
): Promise<PaperSession> {
  const prepared = preparePaperSession(
    { ...input, requireApproval: false },
    options,
  );
  return approveAndStartPaperSession(
    {
      sessionId: prepared.id,
      strategyId: prepared.strategyId,
      idempotencyKey: input.idempotencyKey,
    },
    options,
  );
}

export async function pausePaperSessionService(
  input: {
    sessionId: string;
    strategyId?: string;
    idempotencyKey?: string;
  },
  options?: PaperSessionServiceOptions,
): Promise<PaperSession> {
  const session = getPaperSession(input.sessionId, options);
  if (!session) {
    throw new PaperSessionError(
      `session not found: ${input.sessionId}`,
      "NOT_FOUND",
    );
  }
  assertSessionIdMatch(session, input.sessionId);
  if (input.strategyId) assertSessionStrategyMatch(session, input.strategyId);

  const cached = rememberIdempotent(
    input.idempotencyKey,
    "pause",
    session.id,
    session,
  );
  if (cached && cached.status === "paused") return cached;

  const paused = pausePaperSession(session.id, options);
  if (shouldManageExecutor(options)) {
    await stopExecutorSafe();
  }
  rememberIdempotent(input.idempotencyKey, "pause", paused.id, paused);
  return paused;
}

export async function resumePaperSessionService(
  input: {
    sessionId: string;
    strategyId?: string;
    idempotencyKey?: string;
  },
  options?: PaperSessionServiceOptions,
): Promise<PaperSession> {
  const session = getPaperSession(input.sessionId, options);
  if (!session) {
    throw new PaperSessionError(
      `session not found: ${input.sessionId}`,
      "NOT_FOUND",
    );
  }
  assertSessionIdMatch(session, input.sessionId);
  if (input.strategyId) assertSessionStrategyMatch(session, input.strategyId);

  const cached = rememberIdempotent(
    input.idempotencyKey,
    "resume",
    session.id,
    session,
  );
  if (cached && cached.status === "active") return cached;

  const resumed = resumePaperSession(session.id, options);
  if (shouldManageExecutor(options)) {
    try {
      await startExecutorSafe();
    } catch (err) {
      // Keep session active for retry; surface error.
      throw err;
    }
  }
  rememberIdempotent(input.idempotencyKey, "resume", resumed.id, resumed);
  return resumed;
}

export async function stopPaperSessionService(
  input: {
    sessionId: string;
    strategyId?: string;
    stopReason?: string;
    idempotencyKey?: string;
  },
  options?: PaperSessionServiceOptions,
): Promise<PaperSession> {
  const session = getPaperSession(input.sessionId, options);
  if (!session) {
    throw new PaperSessionError(
      `session not found: ${input.sessionId}`,
      "NOT_FOUND",
    );
  }
  assertSessionIdMatch(session, input.sessionId);
  if (input.strategyId) assertSessionStrategyMatch(session, input.strategyId);

  const cached = rememberIdempotent(
    input.idempotencyKey,
    "stop",
    session.id,
    session,
  );
  if (cached && cached.status === "stopped") return cached;

  const stopped = stopPaperSession(
    session.id,
    options,
    input.stopReason ?? "user_stop",
  );
  if (shouldManageExecutor(options)) {
    await stopExecutorSafe();
  }
  rememberIdempotent(input.idempotencyKey, "stop", stopped.id, stopped);
  return stopped;
}

/**
 * After process restart: session disk is authoritative.
 * - active → safe-paused (require explicit resume) to avoid duplicate owner
 * - paused → remains paused
 * - stopped/failed → unchanged
 * - ready/pending → unchanged (never auto-start)
 * Stale paperActive flags never override session truth.
 */
export function recoverPaperSessionsAfterRestart(
  options?: PaperSessionServiceOptions,
): {
  recovered: PaperSession[];
  safePaused: string[];
  notes: string[];
} {
  const notes: string[] = [];
  const safePaused: string[] = [];
  const recovered: PaperSession[] = [];

  for (const session of listPaperSessions(options)) {
    recovered.push(session);
    if (session.status === "active") {
      // Policy: active before crash → safe-paused (no auto executor).
      const paused = pausePaperSession(session.id, options);
      safePaused.push(paused.id);
      notes.push(
        `session ${paused.id} was active at restart → safe-paused (explicit resume required)`,
      );
    } else if (session.status === "paused") {
      notes.push(`session ${session.id} remains paused`);
    } else if (session.status === "stopped" || session.status === "failed") {
      notes.push(`session ${session.id} remains ${session.status}`);
    } else {
      notes.push(
        `session ${session.id} remains ${session.status} (no auto-start)`,
      );
    }
  }

  return { recovered, safePaused, notes };
}

/** Heartbeat from executor while scanning an active session. */
export function recordPaperHeartbeat(
  sessionId: string,
  options?: PaperSessionServiceOptions,
): PaperSession | null {
  return touchPaperSessionHeartbeat(sessionId, options);
}

/**
 * Reject URL strategy overrides when a current session already owns identity.
 */
export function resolvePaperDisplayStrategyId(input: {
  urlStrategyId?: string | null;
  registryPaperActiveId?: string | null;
}): {
  strategyId: string | null;
  source: "session" | "url" | "registry" | "none";
  blockedUrlOverride: boolean;
} {
  const current = getCurrentPaperSession();
  if (current) {
    const url = input.urlStrategyId?.trim() || null;
    const blocked = Boolean(url && url !== current.strategyId);
    return {
      strategyId: current.strategyId,
      source: "session",
      blockedUrlOverride: blocked,
    };
  }
  if (input.urlStrategyId?.trim()) {
    return {
      strategyId: input.urlStrategyId.trim(),
      source: "url",
      blockedUrlOverride: false,
    };
  }
  if (input.registryPaperActiveId?.trim()) {
    return {
      strategyId: input.registryPaperActiveId.trim(),
      source: "registry",
      blockedUrlOverride: false,
    };
  }
  return { strategyId: null, source: "none", blockedUrlOverride: false };
}

export type PreparePaperFromResultsInput = {
  strategyId: string;
  backtestRunId?: string | null;
  backtestResultId?: string | null;
  symbol?: string | null;
  timeframe?: string | null;
  sourceResearchJobId?: string | null;
  sourceTrialIteration?: number | null;
};

export type PreparePaperFromResultsResult = {
  strategy: StoredStrategy;
  session: PaperSession;
  paperApprovalDeepLink: string;
};

/**
 * Commercial Results/Backtest handoff — prepare pending_approval session only.
 * Never auto-starts execution. Registry paperActive syncs inside preparePaperSession.
 */
export function preparePaperFromResults(
  input: PreparePaperFromResultsInput,
  options?: PaperSessionServiceOptions,
): PreparePaperFromResultsResult {
  const strategyId = input.strategyId?.trim();
  if (!strategyId) {
    throw new PaperSessionError("strategyId required", "STRATEGY_REQUIRED");
  }

  const session = preparePaperSessionService(
    {
      strategyId,
      backtestRunId: input.backtestRunId ?? input.backtestResultId ?? null,
      backtestResultId: input.backtestResultId ?? input.backtestRunId ?? null,
      symbol: input.symbol ?? null,
      timeframe: input.timeframe ?? null,
      sourceResearchJobId: input.sourceResearchJobId ?? null,
      sourceTrialIteration: input.sourceTrialIteration ?? null,
      requireApproval: true,
    },
    options,
  );

  const strategy = getStrategyById(strategyId);
  if (!strategy) {
    throw new PaperSessionError(
      `strategy not found after prepare: ${strategyId}`,
      "STRATEGY_NOT_FOUND",
    );
  }

  const paperApprovalDeepLink = `/paper-trading?strategyId=${encodeURIComponent(strategyId)}&sessionId=${encodeURIComponent(session.id)}`;

  return {
    strategy,
    session,
    paperApprovalDeepLink,
  };
}

export type PaperBotRestartGateResult = {
  ok: boolean;
  mode: "PAPER";
  message: string;
  serviceState: "paper";
  blockedReasons?: string[];
  errorCode?: string;
  sessionId?: string | null;
  sessionStatus?: string | null;
  expectedStrategyId?: string | null;
};

/**
 * Legacy /api/bot/restart gate — requires authoritative active session.
 * Does not create session truth or mutate registry flags.
 */
export async function restartPaperBotGuarded(
  input?: {
    strategyId?: string | null;
  },
  options?: PaperSessionServiceOptions,
): Promise<PaperBotRestartGateResult> {
  const current = getCurrentPaperSession(options);
  if (!current) {
    const latest = listPaperSessions(options)
      .slice()
      .sort(
        (a, b) =>
          new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
      )[0];
    if (latest?.status === "stopped") {
      return {
        ok: false,
        mode: "PAPER",
        message:
          "Paper 세션이 종료되었습니다. Results 또는 Paper 화면에서 새 세션을 준비하세요.",
        serviceState: "paper",
        blockedReasons: ["SESSION_STOPPED"],
        errorCode: "SESSION_STOPPED",
        sessionId: latest.id,
        sessionStatus: latest.status,
        expectedStrategyId: latest.strategyId,
      };
    }
    if (latest?.status === "failed") {
      return {
        ok: false,
        mode: "PAPER",
        message: "Paper 세션이 실패 상태입니다. 새 세션을 준비하세요.",
        serviceState: "paper",
        blockedReasons: ["SESSION_FAILED"],
        errorCode: "SESSION_FAILED",
        sessionId: latest.id,
        sessionStatus: latest.status,
        expectedStrategyId: latest.strategyId,
      };
    }
    return {
      ok: false,
      mode: "PAPER",
      message:
        "Paper 세션이 없습니다. Results 또는 Paper 화면에서 준비·승인 후 시작하세요.",
      serviceState: "paper",
      blockedReasons: ["NO_PAPER_SESSION"],
      errorCode: "NO_PAPER_SESSION",
      sessionId: null,
      sessionStatus: null,
    };
  }

  if (current.status !== "active") {
    const code =
      current.status === "pending_approval"
        ? "SESSION_PENDING_APPROVAL"
        : current.status === "ready"
          ? "SESSION_NOT_STARTED"
          : current.status === "paused"
            ? "SESSION_PAUSED"
            : current.status === "stopped"
              ? "SESSION_STOPPED"
              : current.status === "failed"
                ? "SESSION_FAILED"
                : "SESSION_NOT_EXECUTABLE";
    return {
      ok: false,
      mode: "PAPER",
      message: `Paper 세션이 ${current.status} 상태입니다. 재시작하려면 active 세션이 필요합니다.`,
      serviceState: "paper",
      blockedReasons: [code],
      errorCode: code,
      sessionId: current.id,
      sessionStatus: current.status,
      expectedStrategyId: current.strategyId,
    };
  }

  const requested = input?.strategyId?.trim() || null;
  if (requested && requested !== current.strategyId) {
    return {
      ok: false,
      mode: "PAPER",
      message: `요청 strategyId(${requested})가 활성 Paper 세션(${current.strategyId})과 일치하지 않습니다.`,
      serviceState: "paper",
      blockedReasons: ["STRATEGY_MISMATCH"],
      errorCode: "STRATEGY_MISMATCH",
      sessionId: current.id,
      sessionStatus: current.status,
      expectedStrategyId: current.strategyId,
    };
  }

  if (options?.manageExecutor === false) {
    return {
      ok: true,
      mode: "PAPER",
      message: `Paper executor restart validated for session ${current.id.slice(0, 12)}… (simulated only)`,
      serviceState: "paper",
      sessionId: current.id,
      sessionStatus: current.status,
      expectedStrategyId: current.strategyId,
    };
  }

  const { stopBotRuntime, startBotRuntime } = await import("../botRuntime");
  await stopBotRuntime();
  const started = await startBotRuntime();
  if (!started.ok) {
    return {
      ok: false,
      mode: "PAPER",
      message: started.message,
      serviceState: "paper",
      blockedReasons: started.blockedReasons ?? ["EXECUTOR_RESTART_FAILED"],
      errorCode: "EXECUTOR_RESTART_FAILED",
      sessionId: current.id,
      sessionStatus: current.status,
      expectedStrategyId: current.strategyId,
    };
  }

  return {
    ok: true,
    mode: "PAPER",
    message: `Paper executor restarted for session ${current.id.slice(0, 12)}… (simulated only)`,
    serviceState: "paper",
    sessionId: current.id,
    sessionStatus: current.status,
    expectedStrategyId: current.strategyId,
  };
}
