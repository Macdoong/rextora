import { describe, expect, it, beforeEach, afterEach } from "vitest";
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
  createPaperSession,
  getActivePaperSession,
  listPaperSessions,
  pausePaperSession,
  resumePaperSession,
  stopPaperSession,
  PaperSessionError,
} from "../src/lib/rextora/paper/paperSessionStore";
import { RETIRED_SAFE_STRATEGY_ID } from "../src/lib/rextora/strategy/retiredSafeBaseline";


describe("paperSessionStore", () => {
  let cleanupStrategies: (() => void) | undefined;
  let rootDir: string;
  let strategyId: string;

  beforeEach(() => {
    cleanupStrategies?.();
    const iso = installIsolatedStrategyStore();
    cleanupStrategies = iso.cleanup;
    ensureStrategyStore();
    const copy = copyStrategy(createStrategy({ name: "Paper Session Source" }).id, "paper_session_test");
    strategyId = copy.id;
    setPaperActiveStrategy(strategyId);
    rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "rextora-paper-sess-"));
  });

  afterEach(() => {
    fs.rmSync(rootDir, { recursive: true, force: true });
    cleanupStrategies?.();
    cleanupStrategies = undefined;
  });

  it("creates, pauses, resumes, and stops a session with isolated rootDir", () => {
    const opts = { rootDir };
    const created = createPaperSession({ strategyId }, opts);
    expect(created.status).toBe("active");
    expect(created.strategyId).toBe(strategyId);
    expect(created.strategyHash).toBeTruthy();
    expect(created.sourceParamsHash).toBe(
      getPaperActiveStrategy()?.paramsHash,
    );
    expect(getActivePaperSession(opts)?.id).toBe(created.id);

    const paused = pausePaperSession(created.id, opts);
    expect(paused.status).toBe("paused");
    expect(getActivePaperSession(opts)?.status).toBe("paused");

    const resumed = resumePaperSession(created.id, opts);
    expect(resumed.status).toBe("active");

    const stopped = stopPaperSession(created.id, opts);
    expect(stopped.status).toBe("stopped");
    expect(stopped.stoppedAt).toBeTruthy();
    expect(getActivePaperSession(opts)).toBeNull();
    expect(listPaperSessions(opts).some((s) => s.id === created.id)).toBe(true);

    // Never wrote under strategies/
    const strategiesRoot = process.env.REXTORA_STRATEGIES_DIR!;
    const safeFile = path.join(strategiesRoot, `${RETIRED_SAFE_STRATEGY_ID}.json`);
    expect(fs.existsSync(safeFile)).toBe(false);
    expect(rootDir.includes("strategies")).toBe(false);
  });

  it("createPaperSession syncs registry paperActive to the session strategy", () => {
    const opts = { rootDir };
    const other = copyStrategy(createStrategy({ name: "Paper Other Source" }).id, "paper_other");
    setPaperActiveStrategy(other.id);
    const created = createPaperSession({ strategyId }, opts);
    expect(created.strategyId).toBe(strategyId);
    expect(getPaperActiveStrategy()?.id).toBe(strategyId);
    expect(getPaperActiveStrategy()?.id).not.toBe(other.id);
  });

  it("rejects create for unknown strategy", () => {
    expect(() =>
      createPaperSession({ strategyId: "missing_strategy_xyz" }, { rootDir }),
    ).toThrow(PaperSessionError);
    try {
      createPaperSession({ strategyId: "missing_strategy_xyz" }, { rootDir });
    } catch (err) {
      expect(err).toMatchObject({ code: "STRATEGY_NOT_FOUND" });
    }
  });
});
