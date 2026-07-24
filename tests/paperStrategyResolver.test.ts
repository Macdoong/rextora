import { describe, expect, it, beforeEach, afterEach } from "vitest";
import {
  copyStrategy,
  ensureStrategyStore,
  setPaperActiveStrategy,
} from "../src/lib/rextora/strategy/strategyStore";
import { SAFE_STRATEGY_ID } from "../src/lib/rextora/strategy/strategyTypes";
import { resolvePaperExecutionStrategy } from "../src/lib/rextora/execution/paperStrategyResolver";
import { installIsolatedStrategyStore } from "./helpers/isolatedStrategyStore";

describe("paperStrategyResolver", () => {
  let cleanup: (() => void) | undefined;

  beforeEach(() => {
    cleanup?.();
    cleanup = installIsolatedStrategyStore().cleanup;
    ensureStrategyStore();
  });

  afterEach(() => {
    cleanup?.();
    cleanup = undefined;
  });

  it("when non-SAFE paperActive, resolve returns that strategy id", () => {
    const copy = copyStrategy(SAFE_STRATEGY_ID, "resolver_non_safe");
    setPaperActiveStrategy(copy.id);

    const resolved = resolvePaperExecutionStrategy();
    expect(resolved.strategyId).toBe(copy.id);
    expect(resolved.strategyId).not.toBe(SAFE_STRATEGY_ID);
    expect(resolved.isProtectedSafe).toBe(false);
    expect(resolved.paramsHash).toBe(copy.paramsHash);
    expect(resolved.name).toBe(copy.name);
  });

  it("when SAFE is paperActive, resolve returns SAFE", () => {
    setPaperActiveStrategy(SAFE_STRATEGY_ID);
    const resolved = resolvePaperExecutionStrategy();
    expect(resolved.strategyId).toBe(SAFE_STRATEGY_ID);
    expect(resolved.isProtectedSafe).toBe(true);
  });
});
