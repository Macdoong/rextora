import { describe, expect, it, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  copyStrategy,
  createStrategy,
  ensureStrategyStore,
  getPaperActiveStrategy,
  setLiveActiveStrategy,
  setPaperActiveStrategy,
} from "../src/lib/rextora/strategy/strategyStore";

import {
  resolveLiveDryRunExecutionStrategy,
  resolvePaperExecutionStrategy,
} from "../src/lib/rextora/execution/paperStrategyResolver";
import { createPaperSession } from "../src/lib/rextora/paper/paperSessionStore";
import { installIsolatedStrategyStore } from "./helpers/isolatedStrategyStore";
import { buildPatternSearchDefinition } from "../src/lib/rextora/strategySearch/patternEventSequence";
import { ORDER_BLOCK_BASE_PARAMS } from "../src/lib/rextora/strategySearch/patternSearchSpaces";
import { RETIRED_SAFE_STRATEGY_ID } from "../src/lib/rextora/strategy/retiredSafeBaseline";


describe("paperStrategyResolver", () => {
  let cleanup: (() => void) | undefined;
  let paperRoot: string | undefined;

  beforeEach(() => {
    cleanup?.();
    cleanup = installIsolatedStrategyStore().cleanup;
    ensureStrategyStore();
    if (paperRoot) {
      fs.rmSync(paperRoot, { recursive: true, force: true });
    }
    // Always isolate paper sessions so production active/paused sessions
    // cannot hijack resolvePaperExecutionStrategy during unit tests.
    paperRoot = fs.mkdtempSync(path.join(os.tmpdir(), "rextora-paper-res-"));
    process.env.REXTORA_PAPER_SESSIONS_DIR = paperRoot;
  });

  afterEach(() => {
    cleanup?.();
    cleanup = undefined;
    if (paperRoot) {
      fs.rmSync(paperRoot, { recursive: true, force: true });
      paperRoot = undefined;
    }
    delete process.env.REXTORA_PAPER_SESSIONS_DIR;
  });

  it("when non-SAFE paperActive, resolve returns that strategy id", () => {
    const copy = createStrategy({ name: "resolver_non_safe" });
    setPaperActiveStrategy(copy.id);

    const resolved = resolvePaperExecutionStrategy();
    expect(resolved.strategyId).toBe(copy.id);
    expect(resolved.strategyId).not.toBe(RETIRED_SAFE_STRATEGY_ID);
    expect(resolved.isProtectedSafe).toBe(false);
    expect(resolved.paramsHash).toBe(copy.paramsHash);
    expect(resolved.strategyHash).toHaveLength(64);
    expect(resolved.name).toMatch(/resolver_non_safe|SAFE|복사/);
    expect(resolved.strategyId).toBe(copy.id);
  });

  it("active paper session identity wins over stale paperActive registry", () => {
    const sessionOwner = createStrategy({ name: "session_owner" });
    const staleFlag = createStrategy({ name: "stale_paper_flag" });

    createPaperSession({ strategyId: sessionOwner.id });
    // Intentionally leave registry pointing at a different strategy.
    setPaperActiveStrategy(staleFlag.id);
    expect(getPaperActiveStrategy()?.id).toBe(staleFlag.id);

    const resolved = resolvePaperExecutionStrategy();
    expect(resolved.strategyId).toBe(sessionOwner.id);
    expect(resolved.strategyId).not.toBe(staleFlag.id);
    expect(resolved.paramsHash).toBe(sessionOwner.paramsHash);
  });

  it("when no strategy is selected, paper resolve fails closed", () => {
    expect(() => resolvePaperExecutionStrategy()).toThrow(/전략이 없습니다/);
  });

  it("paper and live dry-run resolve the same stored eventSequence identity", () => {
    const definition = buildPatternSearchDefinition({
      candidateId: "pending",
      strategyName: "exact event sequence",
      timeframe: "15m",
      params: { ...ORDER_BLOCK_BASE_PARAMS, minImpulseAtrMult: 1.7 },
      family: "order_block",
    })!;
    const created = createStrategy({
      name: "exact event sequence",
      strategyType: "condition_builder",
      definition,
      sourceParamsHash: "source_exact_1",
    });
    setPaperActiveStrategy(created.id);
    setLiveActiveStrategy(created.id);
    const paper = resolvePaperExecutionStrategy();
    const live = resolveLiveDryRunExecutionStrategy();
    expect(live.strategyId).toBe(paper.strategyId);
    expect(live.strategyHash).toBe(paper.strategyHash);
    expect(live.strategyHash).toBe(created.strategyHash);
    expect(live.strategyHash).not.toBe(created.paramsHash);
    expect(live.strategy.definition?.eventSequence).toEqual(
      created.definition?.eventSequence,
    );
  });
});
