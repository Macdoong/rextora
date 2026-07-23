import fs from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  UNSAFE_TEST_STRATEGY_STORE,
  copyStrategy,
  deleteStrategy,
  ensureStrategyStore,
  getStrategiesRoot,
  listStrategies,
  productionStrategiesRoot,
} from "../src/lib/rextora/strategy/strategyStore";
import { SAFE_STRATEGY_ID } from "../src/lib/rextora/strategy/strategyTypes";
import { StrategyValidationError } from "../src/lib/rextora/strategy/definition/validator";
import {
  hashFile,
  installIsolatedStrategyStore,
  productionStrategiesDir,
} from "./helpers/isolatedStrategyStore";

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
    const before = fs.readdirSync(prod).sort();
    const safePath = path.join(prod, `${SAFE_STRATEGY_ID}.json`);
    const beforeHash = hashFile(safePath);
    const beforeMtime = fs.statSync(safePath).mtimeMs;

    const prev = process.env.REXTORA_STRATEGIES_DIR;
    delete process.env.REXTORA_STRATEGIES_DIR;
    try {
      expect(() => ensureStrategyStore()).toThrow(/UNSAFE_TEST_STRATEGY_STORE/);
      expect(() => copyStrategy(SAFE_STRATEGY_ID)).toThrow(/UNSAFE_TEST_STRATEGY_STORE/);
    } finally {
      process.env.REXTORA_STRATEGIES_DIR = prev;
    }

    expect(fs.readdirSync(prod).sort()).toEqual(before);
    expect(hashFile(safePath)).toBe(beforeHash);
    expect(fs.statSync(safePath).mtimeMs).toBe(beforeMtime);
  });

  it("5-6. isolated temp roots work independently", () => {
    const a = installIsolatedStrategyStore();
    cleanups.push(a.cleanup);
    ensureStrategyStore();
    const copyA = copyStrategy(SAFE_STRATEGY_ID, "Iso A");
    const rootA = getStrategiesRoot();
    expect(fs.existsSync(path.join(rootA, `${copyA.id}.json`))).toBe(true);

    const b = installIsolatedStrategyStore();
    cleanups.push(b.cleanup);
    ensureStrategyStore();
    expect(listStrategies().every((s) => s.id === SAFE_STRATEGY_ID || s.id.startsWith("copy_") || s.id.startsWith("custom_"))).toBe(true);
    expect(listStrategies().some((s) => s.id === copyA.id)).toBe(false);
    const copyB = copyStrategy(SAFE_STRATEGY_ID, "Iso B");
    expect(copyB.id).not.toBe(copyA.id);
    expect(fs.existsSync(path.join(a.root, `${copyA.id}.json`))).toBe(true);
    expect(fs.existsSync(path.join(b.root, `${copyB.id}.json`))).toBe(true);
  });

  it("7. cleanup sweep deletes only isolated strategies", () => {
    const iso = installIsolatedStrategyStore();
    cleanups.push(iso.cleanup);
    ensureStrategyStore();
    const copy = copyStrategy(SAFE_STRATEGY_ID, "Sweep Target");
    for (const s of listStrategies()) {
      if (s.id === SAFE_STRATEGY_ID) continue;
      deleteStrategy(s.id);
    }
    expect(listStrategies().map((s) => s.id)).toEqual([SAFE_STRATEGY_ID]);
    expect(fs.existsSync(path.join(iso.root, `${copy.id}.json`))).toBe(false);
    expect(fs.existsSync(path.join(productionStrategiesDir(), `${SAFE_STRATEGY_ID}.json`))).toBe(true);
  });

  it("10. deliberately unsafe delete outside isolated root is rejected", () => {
    const iso = installIsolatedStrategyStore();
    cleanups.push(iso.cleanup);
    ensureStrategyStore();
    const prodSafe = path.join(productionStrategiesRoot(), `${SAFE_STRATEGY_ID}.json`);
    const beforeHash = hashFile(prodSafe);
    expect(() =>
      // Force a path check by attempting delete of SAFE id (also blocked by identity)
      deleteStrategy(SAFE_STRATEGY_ID)
    ).toThrow(/잠긴/);
    expect(hashFile(prodSafe)).toBe(beforeHash);
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
