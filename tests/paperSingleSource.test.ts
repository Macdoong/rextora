/**
 * Paper single-source-of-truth test matrix (STEP 4).
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  copyStrategy,
  createStrategy,
  ensureStrategyStore,
  getPaperActiveStrategy,
  setPaperActiveStrategy,
} from "../src/lib/rextora/strategy/strategyStore";

import { installIsolatedStrategyStore } from "./helpers/isolatedStrategyStore";
import {
  PaperSessionError,
  activatePaperSession,
  createPaperSession,
  getCurrentPaperSession,
  getExecutablePaperSession,
  getPaperSession,
  migratePaperSessionRecord,
  pausePaperSession,
  preparePaperSession,
  resumePaperSession,
  stopPaperSession,
} from "../src/lib/rextora/paper/paperSessionStore";
import {
  approveAndStartPaperSession,
  pausePaperSessionService,
  recoverPaperSessionsAfterRestart,
  resolvePaperDisplayStrategyId,
  resumePaperSessionService,
  startPaperSessionFromStrategy,
  stopPaperSessionService,
} from "../src/lib/rextora/paper/paperSessionService";
import { resolvePaperExecutionStrategy } from "../src/lib/rextora/execution/paperStrategyResolver";

const SAFE = path.join(process.cwd(), "data/strategies/SAFE_v44_i4060.json");

describe("paper single source of truth", () => {
  let cleanupStrategies: (() => void) | undefined;
  let rootDir: string;
  let strategyId: string;
  const opts = () => ({ rootDir, manageExecutor: false as const });

  beforeEach(() => {
    cleanupStrategies?.();
    const iso = installIsolatedStrategyStore();
    cleanupStrategies = iso.cleanup;
    ensureStrategyStore();
    const copy = copyStrategy(createStrategy({ name: "Paper SSOT Source" }).id, "paper_ssot_test");
    strategyId = copy.id;
    setPaperActiveStrategy(strategyId);
    rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "rextora-paper-ssot-"));
    process.env.REXTORA_PAPER_SESSIONS_DIR = rootDir;
  });

  afterEach(() => {
    fs.rmSync(rootDir, { recursive: true, force: true });
    delete process.env.REXTORA_PAPER_SESSIONS_DIR;
    cleanupStrategies?.();
    cleanupStrategies = undefined;
  });

  it("1. canonical identity creation separates paramsHash and strategyHash", () => {
    const prepared = preparePaperSession(
      {
        strategyId,
        backtestRunId: "bt_run_1",
        sourceResearchJobId: "search_job_1",
        sourceTrialIteration: 7,
        symbol: "BTCUSDT",
      },
      opts(),
    );
    expect(prepared.status).toBe("ready");
    expect(prepared.mode).toBe("paper");
    expect(prepared.exchangeCalled).toBe(false);
    expect(prepared.strategyId).toBe(strategyId);
    expect(prepared.strategyHash).toBeTruthy();
    expect(prepared.paramsHash).toBeTruthy();
    expect(prepared.strategyHash).not.toBe(prepared.paramsHash);
    expect(prepared.backtestRunId).toBe("bt_run_1");
    expect(prepared.sourceResearchJobId).toBe("search_job_1");
    expect(prepared.sourceTrialIteration).toBe(7);
    expect(prepared.sessionId).toBe(prepared.id);
    expect(getExecutablePaperSession(opts())).toBeNull();
  });

  it("2-4. pending approval does not execute; explicit approve starts", async () => {
    const pending = preparePaperSession(
      { strategyId, requireApproval: true },
      opts(),
    );
    expect(pending.status).toBe("pending_approval");
    expect(getExecutablePaperSession(opts())).toBeNull();
    expect(() => resolvePaperExecutionStrategy()).toThrow(/pending_approval|blocked/i);

    const started = await approveAndStartPaperSession(
      { sessionId: pending.id, strategyId },
      opts(),
    );
    expect(started.status).toBe("active");
    expect(started.exchangeCalled).toBe(false);
    expect(getExecutablePaperSession(opts())?.id).toBe(started.id);
    const resolved = resolvePaperExecutionStrategy();
    expect(resolved.strategyId).toBe(strategyId);
    expect(resolved.sessionId).toBe(started.id);
    expect(resolved.exchangeCalled).toBe(false);
  });

  it("5. duplicate start blocked", async () => {
    const started = await startPaperSessionFromStrategy(
      { strategyId },
      opts(),
    );
    await expect(
      approveAndStartPaperSession({ sessionId: started.id }, opts()),
    ).rejects.toMatchObject({ code: "DUPLICATE_START" });
  });

  it("6-8. pause / resume / stop", async () => {
    const started = await startPaperSessionFromStrategy(
      { strategyId },
      opts(),
    );
    const paused = await pausePaperSessionService(
      { sessionId: started.id, strategyId },
      opts(),
    );
    expect(paused.status).toBe("paused");
    expect(getExecutablePaperSession(opts())).toBeNull();

    await expect(
      pausePaperSessionService({ sessionId: paused.id }, opts()),
    ).rejects.toMatchObject({ code: "DUPLICATE_PAUSE" });

    const resumed = await resumePaperSessionService(
      { sessionId: paused.id, strategyId },
      opts(),
    );
    expect(resumed.status).toBe("active");

    const stopped = await stopPaperSessionService(
      { sessionId: resumed.id, strategyId },
      opts(),
    );
    expect(stopped.status).toBe("stopped");
    expect(getCurrentPaperSession(opts())).toBeNull();
  });

  it("9-10. stopped remains stopped; paused remains paused after recovery", async () => {
    const a = await startPaperSessionFromStrategy({ strategyId }, opts());
    stopPaperSession(a.id, opts(), "test_stop");
    const recoveryStopped = recoverPaperSessionsAfterRestart(opts());
    expect(getPaperSession(a.id, opts())?.status).toBe("stopped");
    expect(recoveryStopped.notes.some((n) => n.includes("stopped"))).toBe(true);

    const other = copyStrategy(createStrategy({ name: "Paper SSOT Paused" }).id, "paper_ssot_paused");
    const b = await startPaperSessionFromStrategy(
      { strategyId: other.id },
      opts(),
    );
    pausePaperSession(b.id, opts());
    const recoveryPaused = recoverPaperSessionsAfterRestart(opts());
    expect(getPaperSession(b.id, opts())?.status).toBe("paused");
    expect(recoveryPaused.notes.some((n) => n.includes("remains paused"))).toBe(
      true,
    );
  });

  it("11. active at restart remains active for runtime restore", async () => {
    const started = await startPaperSessionFromStrategy(
      { strategyId },
      opts(),
    );
    expect(started.status).toBe("active");
    const recovery = recoverPaperSessionsAfterRestart(opts());
    expect(recovery.safePaused).toHaveLength(0);
    expect(getPaperSession(started.id, opts())?.status).toBe("active");
    expect(getExecutablePaperSession(opts())?.id).toBe(started.id);
    expect(
      recovery.notes.some((n) => n.includes("runtime restore eligible")),
    ).toBe(true);
  });

  it("12. stale paperActive ignored when paused session owns identity", async () => {
    const other = copyStrategy(createStrategy({ name: "Paper SSOT Stale" }).id, "paper_stale_flag");
    const started = await startPaperSessionFromStrategy(
      { strategyId },
      opts(),
    );
    await pausePaperSessionService({ sessionId: started.id }, opts());
    setPaperActiveStrategy(other.id);
    expect(getPaperActiveStrategy().id).toBe(other.id);
    expect(getCurrentPaperSession(opts())?.strategyId).toBe(strategyId);
    expect(() => resolvePaperExecutionStrategy()).toThrow(/paused/);
  });

  it("13. conflicting URL strategyId blocked by session", async () => {
    await startPaperSessionFromStrategy({ strategyId }, opts());
    const resolved = resolvePaperDisplayStrategyId({
      urlStrategyId: "other_strategy",
      registryPaperActiveId: "registry_id",
    });
    expect(resolved.source).toBe("session");
    expect(resolved.strategyId).toBe(strategyId);
    expect(resolved.blockedUrlOverride).toBe(true);
  });

  it("14-15. wrong session/strategy mutation blocked", async () => {
    const started = await startPaperSessionFromStrategy(
      { strategyId },
      opts(),
    );
    await expect(
      pausePaperSessionService(
        { sessionId: started.id, strategyId: "wrong_id" },
        opts(),
      ),
    ).rejects.toMatchObject({ code: "WRONG_STRATEGY" });
  });

  it("16. idempotency key prevents duplicate action side effects", async () => {
    const started = await startPaperSessionFromStrategy(
      { strategyId, idempotencyKey: "idem-1" },
      opts(),
    );
    const again = await approveAndStartPaperSession(
      {
        sessionId: started.id,
        idempotencyKey: "idem-pause-1",
      },
      opts(),
    ).catch(() => null);
    // already active → duplicate; then pause with same key twice
    const paused = await pausePaperSessionService(
      { sessionId: started.id, idempotencyKey: "idem-pause-1" },
      opts(),
    );
    const paused2 = await pausePaperSessionService(
      { sessionId: started.id, idempotencyKey: "idem-pause-1" },
      opts(),
    );
    expect(paused.status).toBe("paused");
    expect(paused2.status).toBe("paused");
    expect(paused2.id).toBe(paused.id);
    expect(again).toBeNull();
  });

  it("17. exchangeCalled remains false", async () => {
    const started = await startPaperSessionFromStrategy(
      { strategyId },
      opts(),
    );
    expect(started.exchangeCalled).toBe(false);
    expect(started.mode).toBe("paper");
  });

  it("20. legacy createPaperSession still activates without executor", () => {
    const created = createPaperSession({ strategyId }, opts());
    expect(created.status).toBe("active");
    expect(getExecutablePaperSession(opts())?.id).toBe(created.id);
  });

  it("21. migration is idempotent", () => {
    const legacy = {
      id: "paper_legacy_test_001",
      strategyId,
      strategyHash: "hash_abc",
      sourceParamsHash: "params_xyz",
      strategyName: "Legacy",
      status: "stopped",
      startedAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
      stoppedAt: "2026-01-01T01:00:00.000Z",
      virtualBalance: 10000,
      realizedPnl: 0,
      unrealizedPnl: 0,
      tradeCount: 0,
      signalCount: 0,
      drawdown: 0,
      backtestResultId: "bt_old",
      linkedJobId: "job_old",
    };
    const once = migratePaperSessionRecord(legacy);
    const twice = migratePaperSessionRecord(once as unknown as Record<string, unknown>);
    expect(once.schemaVersion).toBe(2);
    expect(once.backtestRunId).toBe("bt_old");
    expect(once.sourceResearchJobId).toBe("job_old");
    expect(once.status).toBe("stopped");
    expect(twice.backtestRunId).toBe(once.backtestRunId);
    expect(twice.status).toBe("stopped");
  });

  it("22. corrupted session fails safely", () => {
    expect(() =>
      migratePaperSessionRecord({ id: "paper_x", status: "bogus" }),
    ).toThrow(PaperSessionError);
  });

  it("24. SAFE file stays retired", () => {
    expect(fs.existsSync(SAFE)).toBe(false);
  });

  it("resume then activate identity preserved", async () => {
    const started = await startPaperSessionFromStrategy(
      { strategyId, backtestRunId: "bt_keep" },
      opts(),
    );
    const hash = started.strategyHash;
    const params = started.paramsHash;
    await pausePaperSessionService({ sessionId: started.id }, opts());
    const resumed = await resumePaperSessionService(
      { sessionId: started.id },
      opts(),
    );
    expect(resumed.strategyHash).toBe(hash);
    expect(resumed.paramsHash).toBe(params);
    expect(resumed.backtestRunId).toBe("bt_keep");
    expect(resumed.strategyId).toBe(strategyId);
  });
});
