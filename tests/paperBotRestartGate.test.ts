/**
 * Legacy /api/bot/restart gate + Results apply_paper contract tests.
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
  activatePaperSession,
  getCurrentPaperSession,
  pausePaperSession,
  preparePaperSession,
  stopPaperSession,
} from "../src/lib/rextora/paper/paperSessionStore";
import {
  approveAndStartPaperSession,
  preparePaperFromResults,
  restartPaperBotGuarded,
} from "../src/lib/rextora/paper/paperSessionService";

describe("preparePaperFromResults (Results apply_paper contract)", () => {
  let cleanupStrategies: (() => void) | undefined;
  let rootDir: string;
  let strategyId: string;
  const opts = () => ({ rootDir, manageExecutor: false as const });

  beforeEach(() => {
    cleanupStrategies?.();
    const iso = installIsolatedStrategyStore();
    cleanupStrategies = iso.cleanup;
    ensureStrategyStore();
    const copy = copyStrategy(SAFE_STRATEGY_ID, "paper_apply_test");
    strategyId = copy.id;
    rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "rextora-paper-apply-"));
  });

  afterEach(() => {
    cleanupStrategies?.();
    fs.rmSync(rootDir, { recursive: true, force: true });
  });

  it("creates pending_approval session and deep link without auto-start", () => {
    const result = preparePaperFromResults(
      {
        strategyId,
        backtestRunId: "bt_run_123",
        symbol: "BTCUSDT",
        sourceResearchJobId: "search_job_1",
      },
      opts(),
    );

    expect(result.session.status).toBe("pending_approval");
    expect(result.session.strategyId).toBe(strategyId);
    expect(result.session.backtestRunId).toBe("bt_run_123");
    expect(result.session.sourceResearchJobId).toBe("search_job_1");
    expect(result.session.exchangeCalled).toBe(false);
    expect(result.strategy.paperActive).toBe(true);
    expect(result.paperApprovalDeepLink).toContain(
      encodeURIComponent(strategyId),
    );
    expect(result.paperApprovalDeepLink).toContain(
      encodeURIComponent(result.session.id),
    );
    expect(getCurrentPaperSession(opts())?.status).toBe("pending_approval");
  });
});

describe("restartPaperBotGuarded (legacy bot restart gate)", () => {
  let cleanupStrategies: (() => void) | undefined;
  let rootDir: string;
  let strategyId: string;
  let otherStrategyId: string;
  const opts = () => ({ rootDir, manageExecutor: false as const });

  beforeEach(() => {
    cleanupStrategies?.();
    const iso = installIsolatedStrategyStore();
    cleanupStrategies = iso.cleanup;
    ensureStrategyStore();
    strategyId = copyStrategy(SAFE_STRATEGY_ID, "restart_gate_a").id;
    otherStrategyId = copyStrategy(SAFE_STRATEGY_ID, "restart_gate_b").id;
    rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "rextora-paper-restart-"));
  });

  afterEach(() => {
    cleanupStrategies?.();
    fs.rmSync(rootDir, { recursive: true, force: true });
  });

  it("rejects when no session exists", async () => {
    const result = await restartPaperBotGuarded(undefined, opts());
    expect(result.ok).toBe(false);
    expect(result.errorCode).toBe("NO_PAPER_SESSION");
  });

  it("rejects pending_approval session", async () => {
    preparePaperSession(
      { strategyId, requireApproval: true },
      opts(),
    );
    const result = await restartPaperBotGuarded(undefined, opts());
    expect(result.ok).toBe(false);
    expect(result.errorCode).toBe("SESSION_PENDING_APPROVAL");
    expect(result.sessionStatus).toBe("pending_approval");
  });

  it("rejects paused session", async () => {
    const prepared = preparePaperSession({ strategyId }, opts());
    activatePaperSession(prepared.id, opts());
    pausePaperSession(prepared.id, opts());
    const result = await restartPaperBotGuarded(undefined, opts());
    expect(result.ok).toBe(false);
    expect(result.errorCode).toBe("SESSION_PAUSED");
  });

  it("rejects stopped session", async () => {
    const prepared = preparePaperSession({ strategyId }, opts());
    activatePaperSession(prepared.id, opts());
    stopPaperSession(prepared.id, opts());
    const result = await restartPaperBotGuarded(undefined, opts());
    expect(result.ok).toBe(false);
    expect(result.errorCode).toBe("SESSION_STOPPED");
  });

  it("rejects conflicting strategyId on active session", async () => {
    setPaperActiveStrategy(strategyId);
    await approveAndStartPaperSession(
      { sessionId: preparePaperSession({ strategyId }, opts()).id },
      opts(),
    );
    const result = await restartPaperBotGuarded(
      { strategyId: otherStrategyId },
      opts(),
    );
    expect(result.ok).toBe(false);
    expect(result.errorCode).toBe("STRATEGY_MISMATCH");
    expect(result.expectedStrategyId).toBe(strategyId);
  });

  it("allows restart when active session matches strategyId", async () => {
    const prepared = preparePaperSession({ strategyId }, opts());
    await approveAndStartPaperSession({ sessionId: prepared.id }, opts());
    const result = await restartPaperBotGuarded({ strategyId }, opts());
    expect(result.ok).toBe(true);
    expect(result.sessionStatus).toBe("active");
    expect(result.expectedStrategyId).toBe(strategyId);
  });
});
