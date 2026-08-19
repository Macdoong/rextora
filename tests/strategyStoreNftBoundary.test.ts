import fs from "node:fs";
import path from "node:path";
import strategyRuntimeIo from "@rextora/strategy-runtime-io";
import { afterEach, describe, expect, it } from "vitest";
import {
  copyStrategy,
  deleteStrategy,
  ensureStrategyStore,
  getStrategiesRoot,
  getStrategyById,
  listStrategies,
  saveStrategy,
} from "../src/lib/rextora/strategy/strategyStore";
import { SAFE_STRATEGY_ID } from "../src/lib/rextora/strategy/strategyTypes";
import {
  canonicalSafeSourcePath,
  hashFile,
  installIsolatedStrategyStore,
} from "./helpers/isolatedStrategyStore";

describe("strategyStore NFT runtime boundary", () => {
  const cleanups: Array<() => void> = [];

  afterEach(() => {
    while (cleanups.length) cleanups.pop()!();
  });

  it("preserves exact index and strategy path construction", () => {
    expect(strategyRuntimeIo.resolveIndexPath("/runtime/strategies")).toBe(
      path.join("/runtime/strategies", "index.json"),
    );
    expect(strategyRuntimeIo.resolveStrategyPath("/runtime/strategies", "custom_1")).toBe(
      path.resolve("/runtime/strategies", "custom_1.json"),
    );
  });

  it("preserves list, read, write, delete, missing, custom-root, and runtime-file behavior", () => {
    const isolated = installIsolatedStrategyStore();
    cleanups.push(isolated.cleanup);
    const canonicalSafeHash = hashFile(canonicalSafeSourcePath());

    const initial = ensureStrategyStore();
    expect(getStrategiesRoot()).toBe(path.resolve(isolated.root));
    expect(initial.map((strategy) => strategy.id)).toEqual([SAFE_STRATEGY_ID]);
    expect(getStrategyById(SAFE_STRATEGY_ID)?.locked).toBe(true);
    expect(getStrategyById("missing_strategy")).toBeUndefined();

    const created = copyStrategy(SAFE_STRATEGY_ID, "Runtime User Strategy");
    const runtimeFile = path.join(isolated.root, `${created.id}.json`);
    expect(fs.existsSync(runtimeFile)).toBe(true);
    expect(listStrategies().map((strategy) => strategy.id)).toEqual([
      SAFE_STRATEGY_ID,
      created.id,
    ]);

    const updated = saveStrategy(created.id, { name: "Runtime User Strategy Updated" });
    expect(getStrategyById(created.id)?.name).toBe(updated.name);

    deleteStrategy(created.id);
    expect(getStrategyById(created.id)).toBeUndefined();
    expect(fs.existsSync(runtimeFile)).toBe(false);
    expect(hashFile(canonicalSafeSourcePath())).toBe(canonicalSafeHash);
  });

  it("preserves malformed user-strategy failure behavior without touching SAFE", () => {
    const isolated = installIsolatedStrategyStore();
    cleanups.push(isolated.cleanup);
    const canonicalSafeHash = hashFile(canonicalSafeSourcePath());
    ensureStrategyStore();
    const created = copyStrategy(SAFE_STRATEGY_ID, "Malformed Runtime Strategy");
    fs.writeFileSync(path.join(isolated.root, `${created.id}.json`), "{", "utf8");

    expect(() => listStrategies()).toThrow(SyntaxError);
    expect(hashFile(canonicalSafeSourcePath())).toBe(canonicalSafeHash);
  });
});
