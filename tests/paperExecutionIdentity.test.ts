import { describe, expect, it, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  installIsolatedStrategyStore,
} from "./helpers/isolatedStrategyStore";
import {
  createStrategy,
  copyStrategy,
  setPaperActiveStrategy,
} from "../src/lib/rextora/strategy/strategyStore";

import {
  resolvePaperExecutionStrategy,
  assertPaperStrategyIntegrity,
} from "../src/lib/rextora/execution/paperStrategyResolver";
import { RETIRED_SAFE_PARAMS_HASH, RETIRED_SAFE_STRATEGY_ID } from "../src/lib/rextora/strategy/retiredSafeBaseline";


describe("paper execution strategy identity", () => {
  let cleanup: (() => void) | undefined;
  let paperRootDir: string;
  let prevPaperSessionsDir: string | undefined;

  beforeEach(() => {
    cleanup = installIsolatedStrategyStore().cleanup;
    paperRootDir = fs.mkdtempSync(path.join(os.tmpdir(), "rextora-paper-exec-"));
    prevPaperSessionsDir = process.env.REXTORA_PAPER_SESSIONS_DIR;
    process.env.REXTORA_PAPER_SESSIONS_DIR = paperRootDir;
  });

  afterEach(() => {
    cleanup?.();
    if (prevPaperSessionsDir === undefined) {
      delete process.env.REXTORA_PAPER_SESSIONS_DIR;
    } else {
      process.env.REXTORA_PAPER_SESSIONS_DIR = prevPaperSessionsDir;
    }
    fs.rmSync(paperRootDir, { recursive: true, force: true });
  });

  it("uses paperActive copy — does not substitute SAFE", () => {
    const source = createStrategy({ name: "Paper Exec Source", params: { ema_fast: 21 } });
    const copy = copyStrategy(source.id, "paper_exec_copy");
    expect(copy.id).not.toBe(RETIRED_SAFE_STRATEGY_ID);
    expect(copy.paramsHash).not.toBe(RETIRED_SAFE_PARAMS_HASH);
    setPaperActiveStrategy(copy.id);

    const resolved = resolvePaperExecutionStrategy();
    expect(resolved.strategyId).toBe(copy.id);
    expect(resolved.paramsHash).toBe(copy.paramsHash);
    expect(resolved.isProtectedSafe).toBe(false);
    expect(resolved.name).toContain("paper_exec_copy");
  });

  it("fails closed when SAFE is requested as paperActive", () => {
    expect(() => setPaperActiveStrategy(RETIRED_SAFE_STRATEGY_ID)).toThrow();
    expect(() => resolvePaperExecutionStrategy()).toThrow(/전략이 없습니다/);
  });
});
