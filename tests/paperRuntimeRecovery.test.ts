/**
 * Isolated Paper boot recovery. Never starts a real scan loop or Live runtime.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  copyStrategy,
  ensureStrategyStore,
  setPaperActiveStrategy,
} from "../src/lib/rextora/strategy/strategyStore";
import { SAFE_STRATEGY_ID } from "../src/lib/rextora/strategy/strategyTypes";
import { installIsolatedStrategyStore } from "./helpers/isolatedStrategyStore";
import {
  applyActivePaperSessionRealizedPnl,
  createPaperSession,
  failPaperSession,
  getPaperSession,
  pausePaperSession,
  stopPaperSession,
  type PaperSession,
} from "../src/lib/rextora/paper/paperSessionStore";
import {
  pausePaperSessionService,
  recoverPaperSessionsAfterRestart,
  resumePaperSessionService,
  startPaperSessionFromStrategy,
  stopPaperSessionService,
} from "../src/lib/rextora/paper/paperSessionService";
import {
  evaluatePaperRuntimeRecovery,
  recoverPaperRuntimeAfterBoot,
  type PaperRuntimeRecoveryDeps,
} from "../src/lib/rextora/paper/paperRuntimeRecovery";
import {
  cancelAllScheduledTasks,
  hasScheduledTask,
  listScheduledTasks,
  PAPER_SCAN_TASK_ID,
  scheduleInterval,
} from "../src/lib/rextora/scheduler";
import { getRuntimeState, setRuntimeState } from "../src/lib/rextora/runtimeState";
import {
  getEffectiveRiskState,
  loadRiskState,
  PAPER_MAX_CONSECUTIVE_LOSSES,
  saveRiskState,
} from "../src/lib/rextora/riskStateStore";
import { invalidateJsonStoreCache } from "../src/lib/rextora/storage/jsonStore";

const paperOff = {
  trading: { liveTradingEnabled: false, allowLiveTrading: false },
};

function session(partial: Partial<PaperSession> & Pick<PaperSession, "id" | "status" | "strategyId">): PaperSession {
  return {
    schemaVersion: 2,
    sessionId: partial.id,
    strategyHash: "hash",
    paramsHash: "params",
    sourceParamsHash: null,
    sourceResearchJobId: null,
    sourceTrialIteration: null,
    backtestRunId: null,
    backtestResultId: null,
    linkedJobId: null,
    strategyName: "test",
    displayAliasSnapshot: null,
    displayNameSnapshot: null,
    mode: "paper",
    exchangeCalled: false,
    symbol: "BTCUSDT",
    timeframe: "1h",
    createdAt: "2026-01-01T00:00:00.000Z",
    startedAt: "2026-01-01T00:00:00.000Z",
    pausedAt: null,
    resumedAt: null,
    stoppedAt: null,
    updatedAt: "2026-01-01T00:00:00.000Z",
    heartbeatAt: null,
    stopReason: null,
    lastError: null,
    version: 1,
    virtualBalance: 10_000,
    realizedPnl: 0,
    unrealizedPnl: 0,
    tradeCount: 0,
    signalCount: 0,
    drawdown: 0,
    ...partial,
  };
}

function mockDeps(
  current: PaperSession | null,
  extra: PaperRuntimeRecoveryDeps = {},
): PaperRuntimeRecoveryDeps {
  const sessions = current ? [current] : extra.listSessions?.() ?? [];
  return {
    getBootMode: () => "PAPER",
    getSettings: () => paperOff,
    isRuntimeActive: () => false,
    getStrategy: (id) => ({ id }),
    listSessions: () => sessions,
    getCurrent: () => current,
    getExecutable: () => (current?.status === "active" ? current : null),
    startPaperRuntime: async () => ({ ok: true }),
    ...extra,
  };
}

describe("evaluatePaperRuntimeRecovery (mocked)", () => {
  it("1. persisted active Paper session is eligible", () => {
    const active = session({ id: "ps_run", status: "active", strategyId: "strat_a" });
    const result = evaluatePaperRuntimeRecovery(undefined, mockDeps(active));
    expect(result).toMatchObject({
      action: "resumed",
      reason: "active",
      sessionId: "ps_run",
      strategyId: "strat_a",
    });
  });

  it("2. paused is not eligible", () => {
    const paused = session({ id: "ps_pause", status: "paused", strategyId: "strat_a" });
    expect(evaluatePaperRuntimeRecovery(undefined, mockDeps(paused))).toMatchObject({
      action: "skipped",
      reason: "paused",
      sessionId: "ps_pause",
    });
  });

  it("3. stopped is not eligible", () => {
    const stopped = session({ id: "ps_stop", status: "stopped", strategyId: "strat_a" });
    expect(evaluatePaperRuntimeRecovery(undefined, mockDeps(stopped))).toMatchObject({
      action: "skipped",
      reason: "stopped",
      sessionId: "ps_stop",
    });
  });

  it("4. completed equivalent (stopped) is not eligible", () => {
    const completed = session({
      id: "ps_done",
      status: "stopped",
      strategyId: "strat_a",
      stopReason: "completed",
    });
    expect(evaluatePaperRuntimeRecovery(undefined, mockDeps(completed)).reason).toBe(
      "stopped",
    );
  });

  it("5. no Paper session is not eligible", () => {
    expect(
      evaluatePaperRuntimeRecovery(undefined, mockDeps(null, { listSessions: () => [] })),
    ).toMatchObject({ action: "skipped", reason: "no_session", sessionId: null });
  });

  it("8. Live mode and Live flags never auto-start Paper or Live", () => {
    const active = session({ id: "ps_live", status: "active", strategyId: "strat_a" });
    expect(
      evaluatePaperRuntimeRecovery(
        undefined,
        mockDeps(active, { getBootMode: () => "LIVE" }),
      ).reason,
    ).toBe("live_mode");
    expect(
      evaluatePaperRuntimeRecovery(
        undefined,
        mockDeps(active, {
          getSettings: () => ({
            trading: { liveTradingEnabled: true, allowLiveTrading: false },
          }),
        }),
      ).reason,
    ).toBe("live_flags");
    expect(
      evaluatePaperRuntimeRecovery(
        undefined,
        mockDeps(active, {
          getSettings: () => ({
            trading: { liveTradingEnabled: false, allowLiveTrading: true },
          }),
        }),
      ).reason,
    ).toBe("live_flags");
  });

  it("risk_halted / ready / pending are not eligible", () => {
    expect(
      evaluatePaperRuntimeRecovery(
        undefined,
        mockDeps(session({ id: "h", status: "risk_halted", strategyId: "s" })),
      ).reason,
    ).toBe("risk_halted");
    expect(
      evaluatePaperRuntimeRecovery(
        undefined,
        mockDeps(session({ id: "r", status: "ready", strategyId: "s" })),
      ).reason,
    ).toBe("ready");
    expect(
      evaluatePaperRuntimeRecovery(
        undefined,
        mockDeps(
          session({ id: "p", status: "pending_approval", strategyId: "s" }),
        ),
      ).reason,
    ).toBe("pending_approval");
  });

  it("multiple active sessions fail closed", () => {
    const a = session({ id: "a", status: "active", strategyId: "s1" });
    const b = session({ id: "b", status: "active", strategyId: "s2" });
    expect(
      evaluatePaperRuntimeRecovery(
        undefined,
        mockDeps(a, { listSessions: () => [a, b] }),
      ).reason,
    ).toBe("multiple_active");
  });
});

describe("recoverPaperRuntimeAfterBoot", () => {
  let cleanupStrategies: (() => void) | undefined;
  let rootDir: string;
  let dataDir: string;
  let strategyId: string;
  let previousRunning: boolean;
  let previousMode: ReturnType<typeof getRuntimeState>["mode"];
  let startCount: number;

  const storeOpts = () => ({ rootDir });

  function recoveryDeps(extra: PaperRuntimeRecoveryDeps = {}): PaperRuntimeRecoveryDeps {
    return {
      getBootMode: () => "PAPER",
      getSettings: () => paperOff,
      getStrategy: (id) => ({ id }),
      startPaperRuntime: async () => {
        startCount += 1;
        if (!hasScheduledTask(PAPER_SCAN_TASK_ID)) {
          scheduleInterval(PAPER_SCAN_TASK_ID, 60_000, () => {});
        }
        setRuntimeState({ running: true, mode: "PAPER" });
        return { ok: true };
      },
      ...extra,
    };
  }

  beforeEach(() => {
    cleanupStrategies?.();
    const iso = installIsolatedStrategyStore();
    cleanupStrategies = iso.cleanup;
    ensureStrategyStore();
    const copy = copyStrategy(SAFE_STRATEGY_ID, "paper_recovery_test");
    strategyId = copy.id;
    setPaperActiveStrategy(strategyId);
    rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "rextora-paper-recovery-"));
    dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "rextora-paper-recovery-data-"));
    process.env.REXTORA_DATA_DIR = dataDir;
    process.env.REXTORA_PAPER_SESSIONS_DIR = rootDir;
    invalidateJsonStoreCache();
    cancelAllScheduledTasks();
    previousRunning = getRuntimeState().running;
    previousMode = getRuntimeState().mode;
    setRuntimeState({ running: false, mode: "PAPER" });
    startCount = 0;
  });

  afterEach(() => {
    cancelAllScheduledTasks();
    setRuntimeState({ running: previousRunning, mode: previousMode });
    invalidateJsonStoreCache();
    delete process.env.REXTORA_DATA_DIR;
    delete process.env.REXTORA_PAPER_SESSIONS_DIR;
    fs.rmSync(rootDir, { recursive: true, force: true });
    fs.rmSync(dataDir, { recursive: true, force: true });
    cleanupStrategies?.();
    cleanupStrategies = undefined;
  });

  it("1. persisted RUNNING/active session resumes the same session", async () => {
    const created = createPaperSession({ strategyId }, storeOpts());
    const result = await recoverPaperRuntimeAfterBoot(storeOpts(), recoveryDeps());
    expect(result.action).toBe("resumed");
    expect(result.sessionId).toBe(created.id);
    expect(getPaperSession(created.id, storeOpts())?.status).toBe("active");
    expect(hasScheduledTask(PAPER_SCAN_TASK_ID)).toBe(true);
    expect(startCount).toBe(1);
  });

  it("2. PAUSED does not resume", async () => {
    const created = createPaperSession({ strategyId }, storeOpts());
    pausePaperSession(created.id, storeOpts());
    const result = await recoverPaperRuntimeAfterBoot(storeOpts(), recoveryDeps());
    expect(result).toMatchObject({ action: "skipped", reason: "paused" });
    expect(startCount).toBe(0);
    expect(hasScheduledTask(PAPER_SCAN_TASK_ID)).toBe(false);
    expect(getPaperSession(created.id, storeOpts())?.status).toBe("paused");
  });

  it("3. STOPPED does not resume", async () => {
    const created = createPaperSession({ strategyId }, storeOpts());
    stopPaperSession(created.id, storeOpts());
    const result = await recoverPaperRuntimeAfterBoot(storeOpts(), recoveryDeps());
    expect(result).toMatchObject({ action: "skipped", reason: "stopped" });
    expect(startCount).toBe(0);
  });

  it("4. COMPLETED equivalent (stopped) does not resume", async () => {
    const created = createPaperSession({ strategyId }, storeOpts());
    stopPaperSession(created.id, storeOpts(), "completed");
    const result = await recoverPaperRuntimeAfterBoot(storeOpts(), recoveryDeps());
    expect(result.action).toBe("skipped");
    expect(startCount).toBe(0);
  });

  it("5. no Paper session does not resume", async () => {
    const result = await recoverPaperRuntimeAfterBoot(storeOpts(), recoveryDeps());
    expect(result).toMatchObject({ action: "skipped", reason: "no_session" });
    expect(startCount).toBe(0);
  });

  it("6. two recovery calls create one scheduler only", async () => {
    createPaperSession({ strategyId }, storeOpts());
    const first = await recoverPaperRuntimeAfterBoot(storeOpts(), recoveryDeps());
    const second = await recoverPaperRuntimeAfterBoot(storeOpts(), recoveryDeps());
    expect(first.action).toBe("resumed");
    expect(second).toMatchObject({ action: "skipped", reason: "already_running" });
    expect(startCount).toBe(1);
    expect(listScheduledTasks().filter((id) => id === PAPER_SCAN_TASK_ID)).toHaveLength(1);
  });

  it("7. runtime already running is a no-op", async () => {
    createPaperSession({ strategyId }, storeOpts());
    scheduleInterval(PAPER_SCAN_TASK_ID, 60_000, () => {});
    setRuntimeState({ running: true, mode: "PAPER" });
    const result = await recoverPaperRuntimeAfterBoot(storeOpts(), recoveryDeps());
    expect(result).toMatchObject({ action: "skipped", reason: "already_running" });
    expect(startCount).toBe(0);
    expect(listScheduledTasks().filter((id) => id === PAPER_SCAN_TASK_ID)).toHaveLength(1);
  });

  it("8. Live flags skip Paper start and never start Live", async () => {
    createPaperSession({ strategyId }, storeOpts());
    const liveStarts: string[] = [];
    const result = await recoverPaperRuntimeAfterBoot(
      storeOpts(),
      recoveryDeps({
        getSettings: () => ({
          trading: { liveTradingEnabled: true, allowLiveTrading: true },
        }),
        startPaperRuntime: async () => {
          startCount += 1;
          liveStarts.push("paper");
          return { ok: true };
        },
      }),
    );
    expect(result.reason).toBe("live_flags");
    expect(startCount).toBe(0);
    expect(liveStarts).toEqual([]);
    expect(hasScheduledTask(PAPER_SCAN_TASK_ID)).toBe(false);
    const recoverySource = fs.readFileSync(
      path.join(process.cwd(), "src/lib/rextora/paper/paperRuntimeRecovery.ts"),
      "utf8",
    );
    const bootSource = fs.readFileSync(
      path.join(process.cwd(), "instrumentation.ts"),
      "utf8",
    );
    expect(recoverySource).not.toContain("startLiveBotRuntime");
    expect(bootSource).not.toContain("startLiveBotRuntime");
  });

  it("9-11. same session, same strategy, capital/trades/PnL preserved", async () => {
    const created = createPaperSession({ strategyId }, storeOpts());
    const withPnl = applyActivePaperSessionRealizedPnl(123.45, storeOpts());
    expect(withPnl?.id).toBe(created.id);
    const before = getPaperSession(created.id, storeOpts())!;
    const result = await recoverPaperRuntimeAfterBoot(storeOpts(), recoveryDeps());
    const after = getPaperSession(created.id, storeOpts())!;
    expect(result.action).toBe("resumed");
    expect(result.sessionId).toBe(created.id);
    expect(after.id).toBe(before.id);
    expect(after.strategyId).toBe(before.strategyId);
    expect(after.strategyId).toBe(strategyId);
    expect(after.virtualBalance).toBe(before.virtualBalance);
    expect(after.realizedPnl).toBe(123.45);
    expect(after.tradeCount).toBe(before.tradeCount);
    expect(after.status).toBe("active");
  });

  it("12-13. Paper effective consecutive-loss 6 and persisted shared 3 stay put", async () => {
    createPaperSession({ strategyId }, storeOpts());
    const persisted = loadRiskState();
    saveRiskState({
      ...persisted,
      consecutiveLosses: 4,
      openPositions: 1,
      settings: { ...persisted.settings, consecutiveLossLimit: 3 },
    });
    await recoverPaperRuntimeAfterBoot(storeOpts(), recoveryDeps());
    expect(PAPER_MAX_CONSECUTIVE_LOSSES).toBe(6);
    expect(getEffectiveRiskState("PAPER").settings.consecutiveLossLimit).toBe(6);
    expect(loadRiskState().settings.consecutiveLossLimit).toBe(3);
    expect(loadRiskState().consecutiveLosses).toBe(4);
    expect(loadRiskState().openPositions).toBe(1);
    const disk = JSON.parse(
      fs.readFileSync(path.join(dataDir, "risk-state.json"), "utf8"),
    ) as { consecutiveLosses: number; settings: { consecutiveLossLimit: number } };
    expect(disk.settings.consecutiveLossLimit).toBe(3);
    expect(disk.consecutiveLosses).toBe(4);
  });

  it("14. recovery failure does not throw (boot remains non-fatal)", async () => {
    createPaperSession({ strategyId }, storeOpts());
    const result = await recoverPaperRuntimeAfterBoot(
      storeOpts(),
      recoveryDeps({
        startPaperRuntime: async () => {
          throw new Error("executor boom");
        },
      }),
    );
    expect(result.action).toBe("failed");
    expect(result.reason).toBe("executor boom");
    await expect(
      recoverPaperRuntimeAfterBoot(
        storeOpts(),
        recoveryDeps({
          listSessions: () => {
            throw new Error("disk unreadable");
          },
        }),
      ),
    ).resolves.toMatchObject({ action: "failed", reason: "disk unreadable" });
  });

  it("15. manual start/pause/resume/stop still persist operator intent", async () => {
    const started = await startPaperSessionFromStrategy(
      { strategyId },
      { ...storeOpts(), manageExecutor: false },
    );
    expect(started.status).toBe("active");
    const paused = await pausePaperSessionService(
      { sessionId: started.id },
      { ...storeOpts(), manageExecutor: false },
    );
    expect(paused.status).toBe("paused");
    expect(
      (await recoverPaperRuntimeAfterBoot(storeOpts(), recoveryDeps())).reason,
    ).toBe("paused");
    const resumed = await resumePaperSessionService(
      { sessionId: started.id },
      { ...storeOpts(), manageExecutor: false },
    );
    expect(resumed.status).toBe("active");
    const stopped = await stopPaperSessionService(
      { sessionId: started.id },
      { ...storeOpts(), manageExecutor: false },
    );
    expect(stopped.status).toBe("stopped");
    expect(
      (await recoverPaperRuntimeAfterBoot(storeOpts(), recoveryDeps())).reason,
    ).toBe("stopped");
  });

  it("disk recovery no longer safe-pauses an active session", () => {
    const created = createPaperSession({ strategyId }, storeOpts());
    const disk = recoverPaperSessionsAfterRestart(storeOpts());
    expect(disk.safePaused).toEqual([]);
    expect(getPaperSession(created.id, storeOpts())?.status).toBe("active");
  });

  it("failed sessions do not resume", async () => {
    const created = createPaperSession({ strategyId }, storeOpts());
    failPaperSession(created.id, "engine boom", storeOpts());
    const result = await recoverPaperRuntimeAfterBoot(storeOpts(), recoveryDeps());
    expect(result.reason).toBe("failed");
    expect(startCount).toBe(0);
  });
});
