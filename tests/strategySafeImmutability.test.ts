import fs from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  copyStrategy,
  createStrategy,
  ensureStrategyStore,
  getStrategyById,
  listStrategies,
  saveStrategy,
  deleteStrategy,
  setPaperActiveStrategy,
} from "../src/lib/rextora/strategy/strategyStore";

import {
  installIsolatedStrategyStore,
  canonicalSafeSourcePath,
} from "./helpers/isolatedStrategyStore";
import { RETIRED_SAFE_STRATEGY_ID } from "../src/lib/rextora/strategy/retiredSafeBaseline";


describe("SAFE retirement immutability", () => {
  let cleanup: (() => void) | undefined;
  let root = "";

  afterEach(() => {
    cleanup?.();
    cleanup = undefined;
  });

  function boot() {
    const iso = installIsolatedStrategyStore();
    cleanup = iso.cleanup;
    root = iso.root;
    ensureStrategyStore();
  }

  it("1-3. empty store stays empty and never injects SAFE", () => {
    boot();
    expect(listStrategies()).toEqual([]);
    ensureStrategyStore();
    listStrategies();
    expect(getStrategyById(RETIRED_SAFE_STRATEGY_ID)).toBeUndefined();
    expect(fs.existsSync(path.join(root, `${RETIRED_SAFE_STRATEGY_ID}.json`))).toBe(false);
  });

  it("6-7. missing SAFE is not created by ensure", () => {
    boot();
    expect(fs.existsSync(path.join(root, `${RETIRED_SAFE_STRATEGY_ID}.json`))).toBe(false);
    ensureStrategyStore();
    expect(fs.existsSync(path.join(root, `${RETIRED_SAFE_STRATEGY_ID}.json`))).toBe(false);
  });

  it("9. save against retired SAFE fails; delete retires without resurrecting", () => {
    boot();
    expect(() =>
      saveStrategy(RETIRED_SAFE_STRATEGY_ID, { name: "hacked" }),
    ).toThrow();
    deleteStrategy(RETIRED_SAFE_STRATEGY_ID);
    expect(getStrategyById(RETIRED_SAFE_STRATEGY_ID)).toBeUndefined();
    expect(listStrategies().some((s) => s.id === RETIRED_SAFE_STRATEGY_ID)).toBe(false);
  });

  it("10-11. copy works from an explicit user strategy", () => {
    boot();
    const source = createStrategy({ name: "Editable Source" });
    const copy = copyStrategy(source.id, "Editable Copy");
    expect(copy.id).not.toBe(RETIRED_SAFE_STRATEGY_ID);
    expect(copy.locked).toBe(false);
    expect(fs.existsSync(path.join(root, `${copy.id}.json`))).toBe(true);
    saveStrategy(copy.id, { name: "Edited Copy Name" });
    expect(getStrategyById(copy.id)?.name).toBe("Edited Copy Name");
  });

  it("paper activation never falls back to SAFE", () => {
    boot();
    const source = createStrategy({ name: "Paper Source" });
    const copy = copyStrategy(source.id, "Paper Target");
    setPaperActiveStrategy(copy.id);
    expect(getStrategyById(copy.id)?.paperActive).toBe(true);
    expect(getStrategyById(RETIRED_SAFE_STRATEGY_ID)).toBeUndefined();
    expect(() => setPaperActiveStrategy(RETIRED_SAFE_STRATEGY_ID)).toThrow();
  });

  it("canonical SAFE source file is retired", () => {
    expect(fs.existsSync(canonicalSafeSourcePath())).toBe(false);
    boot();
    createStrategy({ name: "Iso Source" });
    listStrategies();
    ensureStrategyStore();
    expect(fs.existsSync(canonicalSafeSourcePath())).toBe(false);
    expect(getStrategyById(RETIRED_SAFE_STRATEGY_ID)).toBeUndefined();
  });
});
