import fs from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  UNSAFE_TEST_STRATEGY_STORE,
  copyStrategy,
  createStrategy,
  deleteStrategy,
  ensureStrategyStore,
  getStrategiesRoot,
  listStrategies,
  productionStrategiesRoot,
} from "../src/lib/rextora/strategy/strategyStore";

import { StrategyValidationError } from "../src/lib/rextora/strategy/definition/validator";
import {
  installIsolatedStrategyStore,
  productionStrategiesDir,
} from "./helpers/isolatedStrategyStore";
import { RETIRED_SAFE_STRATEGY_ID } from "../src/lib/rextora/strategy/retiredSafeBaseline";


describe("strategy store global test safety", () => {
  const cleanups: Array<() => void> = [];

  afterEach(() => {
    while (cleanups.length) cleanups.pop()!();
  });

  it("1. fails closed when REXTORA_STRATEGIES_DIR is unset in test runtime", () => {
    const prev = process.env.REXTORA_STRATEGIES_DIR;
    delete process.env.REXTORA_STRATEGIES_DIR;
    try {
      expect(() => getStrategiesRoot()).toThrow(StrategyValidationError);
      expect(() => getStrategiesRoot()).toThrow(/UNSAFE_TEST_STRATEGY_STORE/);
      expect(() => listStrategies()).toThrow(/UNSAFE_TEST_STRATEGY_STORE/);
    } finally {
      process.env.REXTORA_STRATEGIES_DIR = prev;
    }
  });

  it("2-4. unset root never reads/writes/deletes production files", () => {
    const prod = productionStrategiesDir();
    const before = fs.existsSync(prod) ? fs.readdirSync(prod).sort() : [];

    const prev = process.env.REXTORA_STRATEGIES_DIR;
    delete process.env.REXTORA_STRATEGIES_DIR;
    try {
      expect(() => ensureStrategyStore()).toThrow(/UNSAFE_TEST_STRATEGY_STORE/);
      expect(() => copyStrategy(RETIRED_SAFE_STRATEGY_ID)).toThrow(/UNSAFE_TEST_STRATEGY_STORE/);
    } finally {
      process.env.REXTORA_STRATEGIES_DIR = prev;
    }

    const after = fs.existsSync(prod) ? fs.readdirSync(prod).sort() : [];
    expect(after).toEqual(before);
  });

  it("5-6. isolated temp roots work independently", () => {
    const a = installIsolatedStrategyStore();
    cleanups.push(a.cleanup);
    ensureStrategyStore();
    const sourceA = createStrategy({ name: "Iso Source A" });
    const copyA = copyStrategy(sourceA.id, "Iso A");
    const rootA = getStrategiesRoot();
    expect(fs.existsSync(path.join(rootA, `${copyA.id}.json`))).toBe(true);

    const b = installIsolatedStrategyStore();
    cleanups.push(b.cleanup);
    ensureStrategyStore();
    expect(listStrategies().every((s) => s.id.startsWith("copy_") || s.id.startsWith("custom_"))).toBe(true);
    expect(listStrategies().some((s) => s.id === copyA.id)).toBe(false);
    const sourceB = createStrategy({ name: "Iso Source B" });
    const copyB = copyStrategy(sourceB.id, "Iso B");
    expect(copyB.id).not.toBe(copyA.id);
    expect(fs.existsSync(path.join(a.root, `${copyA.id}.json`))).toBe(true);
    expect(fs.existsSync(path.join(b.root, `${copyB.id}.json`))).toBe(true);
  });

  it("7. cleanup sweep deletes only isolated strategies", () => {
    const iso = installIsolatedStrategyStore();
    cleanups.push(iso.cleanup);
    ensureStrategyStore();
    const source = createStrategy({ name: "Sweep Source" });
    const copy = copyStrategy(source.id, "Sweep Target");
    for (const s of listStrategies()) {
      deleteStrategy(s.id);
    }
    expect(listStrategies().map((s) => s.id)).toEqual([]);
    expect(fs.existsSync(path.join(iso.root, `${copy.id}.json`))).toBe(false);
    expect(listStrategies().some((s) => s.id === RETIRED_SAFE_STRATEGY_ID)).toBe(false);
  });

  it("10. deliberately unsafe delete of retired SAFE is rejected", () => {
    const iso = installIsolatedStrategyStore();
    cleanups.push(iso.cleanup);
    ensureStrategyStore();
    deleteStrategy(RETIRED_SAFE_STRATEGY_ID);
    expect(listStrategies().some((s) => s.id === RETIRED_SAFE_STRATEGY_ID)).toBe(false);
  });

  it("rejects configuring production path as isolated root", () => {
    const prev = process.env.REXTORA_STRATEGIES_DIR;
    process.env.REXTORA_STRATEGIES_DIR = productionStrategiesRoot();
    try {
      expect(() => getStrategiesRoot()).toThrow(/UNSAFE_TEST_STRATEGY_STORE/);
    } finally {
      process.env.REXTORA_STRATEGIES_DIR = prev;
    }
  });
});

describe("message constant", () => {
  it("exports stable unsafe message", () => {
    expect(UNSAFE_TEST_STRATEGY_STORE).toContain("REXTORA_STRATEGIES_DIR");
  });
});
