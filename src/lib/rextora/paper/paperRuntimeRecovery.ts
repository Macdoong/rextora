/**
 * Paper executor restore after process death.
 * Disk session status is the authority: only status === "active" may resume.
 * Never starts Live. Never creates a session. Never resets Paper capital/risk.
 */

import { getBootMode } from "../config";
import { getRuntimeState } from "../runtimeState";
import {
  hasScheduledTask,
  PAPER_SCAN_TASK_ID,
} from "../scheduler";
import { getRextoraSettings } from "../settings/settingsService";
import { getStrategyById } from "../strategy/strategyStore";
import {
  getCurrentPaperSession,
  getExecutablePaperSession,
  listPaperSessions,
  type PaperSession,
  type PaperSessionStoreOptions,
} from "./paperSessionStore";

export type PaperRuntimeRecoveryAction = "resumed" | "skipped" | "failed";

export type PaperRuntimeRecoveryResult = {
  action: PaperRuntimeRecoveryAction;
  reason: string;
  sessionId: string | null;
  strategyId: string | null;
};

export type PaperRuntimeRecoveryDeps = {
  listSessions?: () => PaperSession[];
  getCurrent?: () => PaperSession | null;
  getExecutable?: () => PaperSession | null;
  getStrategy?: (id: string) => { id: string } | null;
  getSettings?: () => {
    trading: { liveTradingEnabled: boolean; allowLiveTrading: boolean };
  };
  getBootMode?: () => "PAPER" | "LIVE";
  isRuntimeActive?: () => boolean;
  startPaperRuntime?: () => Promise<{ ok: boolean; message?: string }>;
};

function defaultGetStrategy(id: string): { id: string } | null {
  return getStrategyById(id) ?? null;
}

function defaultIsRuntimeActive(): boolean {
  if (hasScheduledTask(PAPER_SCAN_TASK_ID)) return true;
  const runtime = getRuntimeState();
  return runtime.running === true && runtime.mode === "PAPER";
}

let paperRecoveryInFlight = false;

function skip(
  reason: string,
  session: Pick<PaperSession, "id" | "strategyId"> | null,
): PaperRuntimeRecoveryResult {
  return {
    action: "skipped",
    reason,
    sessionId: session?.id ?? null,
    strategyId: session?.strategyId ?? null,
  };
}

export function evaluatePaperRuntimeRecovery(
  options?: PaperSessionStoreOptions,
  deps: PaperRuntimeRecoveryDeps = {},
): PaperRuntimeRecoveryResult {
  const bootMode = (deps.getBootMode ?? getBootMode)();
  if (bootMode !== "PAPER") {
    return skip("live_mode", null);
  }

  const settings = (deps.getSettings ?? getRextoraSettings)();
  if (
    settings.trading.liveTradingEnabled === true ||
    settings.trading.allowLiveTrading === true
  ) {
    return skip("live_flags", null);
  }

  if ((deps.isRuntimeActive ?? defaultIsRuntimeActive)()) {
    const executable = (deps.getExecutable ?? (() => getExecutablePaperSession(options)))();
    return skip("already_running", executable);
  }

  const sessions = (deps.listSessions ?? (() => listPaperSessions(options)))();
  const current = (deps.getCurrent ?? (() => getCurrentPaperSession(options)))();
  if (sessions.length === 0) {
    return skip("no_session", null);
  }

  const active = sessions.filter((session) => session.status === "active");
  if (active.length > 1) {
    return skip("multiple_active", active[0] ?? null);
  }
  if (active.length === 0) {
    if (current?.status === "paused") return skip("paused", current);
    if (current?.status === "risk_halted") return skip("risk_halted", current);
    if (current?.status === "ready") return skip("ready", current);
    if (current?.status === "pending_approval") {
      return skip("pending_approval", current);
    }
    const stopped = sessions.find((session) => session.status === "stopped");
    if (stopped) return skip("stopped", stopped);
    const failed = sessions.find((session) => session.status === "failed");
    if (failed) return skip("failed", failed);
    return skip("no_session", current);
  }

  const session = active[0]!;
  const executable = (deps.getExecutable ?? (() => getExecutablePaperSession(options)))();
  if (!executable || executable.id !== session.id) {
    return skip("not_executable", session);
  }

  const strategy = (deps.getStrategy ?? defaultGetStrategy)(session.strategyId);
  if (!strategy || strategy.id !== session.strategyId) {
    return skip("missing_strategy", session);
  }

  return {
    action: "resumed",
    reason: "active",
    sessionId: session.id,
    strategyId: session.strategyId,
  };
}

export async function recoverPaperRuntimeAfterBoot(
  options?: PaperSessionStoreOptions,
  deps: PaperRuntimeRecoveryDeps = {},
): Promise<PaperRuntimeRecoveryResult> {
  if (paperRecoveryInFlight) {
    const skipped = skip("already_running", null);
    console.info(`[PAPER RECOVERY] skipped reason=${skipped.reason}`);
    return skipped;
  }
  paperRecoveryInFlight = true;
  try {
    const decision = evaluatePaperRuntimeRecovery(options, deps);
    if (decision.action !== "resumed") {
      console.info(`[PAPER RECOVERY] skipped reason=${decision.reason}`);
      return decision;
    }

    console.info(
      `[PAPER RECOVERY] eligible session=${decision.sessionId ?? "unknown"}`,
    );

    const startPaperRuntime =
      deps.startPaperRuntime ??
      (async () => {
        const { startBotRuntime } = await import("../botRuntime");
        return startBotRuntime();
      });

    const started = await startPaperRuntime();
    if (!started.ok) {
      const reason = started.message || "executor_start_failed";
      console.warn(`[PAPER RECOVERY] failed reason=${reason}`);
      return {
        action: "failed",
        reason,
        sessionId: decision.sessionId,
        strategyId: decision.strategyId,
      };
    }

    console.info("[PAPER RECOVERY] resumed");
    return decision;
  } catch (error) {
    const reason =
      error instanceof Error ? error.message : "paper_runtime_recovery_failed";
    console.warn(`[PAPER RECOVERY] failed reason=${reason}`);
    return {
      action: "failed",
      reason,
      sessionId: null,
      strategyId: null,
    };
  } finally {
    paperRecoveryInFlight = false;
  }
}
