import fs from "node:fs";
import path from "node:path";
import strategyRuntimeIo from "@rextora/strategy-runtime-io";
import { afterEach, describe, expect, it } from "vitest";
import {
  copyStrategy,
  createStrategy,
  deleteStrategy,
  ensureStrategyStore,
  getStrategiesRoot,
  getStrategyById,
  listStrategies,
  saveStrategy,
} from "../src/lib/rextora/strategy/strategyStore";

import {
  canonicalSafeSourcePath,
  installIsolatedStrategyStore,
} from "./helpers/isolatedStrategyStore";
import { RETIRED_SAFE_STRATEGY_ID } from "../src/lib/rextora/strategy/retiredSafeBaseline";


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

    const initial = ensureStrategyStore();
    expect(getStrategiesRoot()).toBe(path.resolve(isolated.root));
    expect(initial.map((strategy) => strategy.id)).toEqual([]);
    expect(getStrategyById(RETIRED_SAFE_STRATEGY_ID)).toBeUndefined();
    expect(getStrategyById("missing_strategy")).toBeUndefined();

    const source = createStrategy({ name: "Runtime Source" });
    const created = copyStrategy(source.id, "Runtime User Strategy");
    const runtimeFile = path.join(isolated.root, `${created.id}.json`);
    expect(fs.existsSync(runtimeFile)).toBe(true);
    expect(listStrategies().map((strategy) => strategy.id).sort()).toEqual(
      [source.id, created.id].sort(),
    );

    const updated = saveStrategy(created.id, { name: "Runtime User Strategy Updated" });
    expect(getStrategyById(created.id)?.name).toBe(updated.name);

    deleteStrategy(created.id);
    expect(getStrategyById(created.id)).toBeUndefined();
    expect(fs.existsSync(runtimeFile)).toBe(false);
    expect(fs.existsSync(canonicalSafeSourcePath())).toBe(false);
  });

  it("preserves malformed user-strategy failure behavior without injecting SAFE", () => {
    const isolated = installIsolatedStrategyStore();
    cleanups.push(isolated.cleanup);
    ensureStrategyStore();
    const source = createStrategy({ name: "Runtime Source" });
    const created = copyStrategy(source.id, "Malformed Runtime Strategy");
    fs.writeFileSync(path.join(isolated.root, `${created.id}.json`), "{", "utf8");

    expect(listStrategies().some((s) => s.id === created.id)).toBe(false);
    expect(listStrategies().some((s) => s.id === RETIRED_SAFE_STRATEGY_ID)).toBe(false);
    expect(fs.existsSync(canonicalSafeSourcePath())).toBe(false);
  });
});
