import { describe, expect, it, beforeEach, afterEach } from "vitest";
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
  createPaperSession,
  getActivePaperSession,
  listPaperSessions,
  pausePaperSession,
  resumePaperSession,
  stopPaperSession,
  PaperSessionError,
} from "../src/lib/rextora/paper/paperSessionStore";

describe("paperSessionStore", () => {
  let cleanupStrategies: (() => void) | undefined;
  let rootDir: string;
  let strategyId: string;

  beforeEach(() => {
    cleanupStrategies?.();
    const iso = installIsolatedStrategyStore();
    cleanupStrategies = iso.cleanup;
    ensureStrategyStore();
    const copy = copyStrategy(SAFE_STRATEGY_ID, "paper_session_test");
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
    const safeFile = path.join(strategiesRoot, `${SAFE_STRATEGY_ID}.json`);
    expect(fs.existsSync(safeFile)).toBe(true);
    expect(rootDir.includes("strategies")).toBe(false);
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
