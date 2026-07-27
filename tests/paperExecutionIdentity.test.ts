import { describe, expect, it, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  installIsolatedStrategyStore,
} from "./helpers/isolatedStrategyStore";
import {
  copyStrategy,
  setPaperActiveStrategy,
} from "../src/lib/rextora/strategy/strategyStore";
import {
  EXPECTED_SAFE_PARAMS_HASH,
  SAFE_STRATEGY_ID,
} from "../src/lib/rextora/strategy/strategyTypes";
import {
  resolvePaperExecutionStrategy,
  assertPaperStrategyIntegrity,
} from "../src/lib/rextora/execution/paperStrategyResolver";

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
    const copy = copyStrategy(SAFE_STRATEGY_ID, "paper_exec_copy");
    expect(copy.id).not.toBe(SAFE_STRATEGY_ID);
    expect(copy.paramsHash).not.toBe(EXPECTED_SAFE_PARAMS_HASH);
    setPaperActiveStrategy(copy.id);

    const resolved = resolvePaperExecutionStrategy();
    expect(resolved.strategyId).toBe(copy.id);
    expect(resolved.paramsHash).toBe(copy.paramsHash);
    expect(resolved.isProtectedSafe).toBe(false);
    expect(resolved.name).toContain("paper_exec_copy");
  });

  it("uses SAFE only when SAFE is paperActive", () => {
    setPaperActiveStrategy(SAFE_STRATEGY_ID);
    const resolved = resolvePaperExecutionStrategy();
    expect(resolved.strategyId).toBe(SAFE_STRATEGY_ID);
    expect(resolved.paramsHash).toBe(EXPECTED_SAFE_PARAMS_HASH);
    expect(resolved.isProtectedSafe).toBe(true);
    assertPaperStrategyIntegrity(resolved);
  });
});
