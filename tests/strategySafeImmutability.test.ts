import fs from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  PROTECTED_STRATEGY_INTEGRITY,
  copyStrategy,
  ensureStrategyStore,
  getStrategyById,
  listStrategies,
  saveStrategy,
  deleteStrategy,
  setPaperActiveStrategy,
} from "../src/lib/rextora/strategy/strategyStore";
import {
  EXPECTED_SAFE_PARAMS_HASH,
  SAFE_STRATEGY_ID,
} from "../src/lib/rextora/strategy/strategyTypes";
import {
  hashFile,
  installIsolatedStrategyStore,
  productionStrategiesDir,
  canonicalSafeSourcePath,
} from "./helpers/isolatedStrategyStore";

describe("SAFE immutability", () => {
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

  function safePath() {
    return path.join(root, `${SAFE_STRATEGY_ID}.json`);
  }

  it("1-3. ensure/list do not rewrite existing SAFE bytes or mtime", () => {
    boot();
    const p = safePath();
    const h1 = hashFile(p);
    const m1 = fs.statSync(p).mtimeMs;
    ensureStrategyStore();
    listStrategies();
    ensureStrategyStore();
    listStrategies();
    expect(hashFile(p)).toBe(h1);
    expect(fs.statSync(p).mtimeMs).toBe(m1);
    expect(getStrategyById(SAFE_STRATEGY_ID)?.paramsHash).toBe(EXPECTED_SAFE_PARAMS_HASH);
  });

  it("6-7. missing SAFE is created once; second ensure does not rewrite", () => {
    const iso = installIsolatedStrategyStore();
    cleanup = iso.cleanup;
    root = iso.root;
    expect(fs.existsSync(safePath())).toBe(false);
    ensureStrategyStore();
    expect(fs.existsSync(safePath())).toBe(true);
    const h1 = hashFile(safePath());
    const m1 = fs.statSync(safePath()).mtimeMs;
    ensureStrategyStore();
    expect(hashFile(safePath())).toBe(h1);
    expect(fs.statSync(safePath()).mtimeMs).toBe(m1);
  });

  it("8. invalid SAFE hash causes protected integrity error without overwrite", () => {
    boot();
    const p = safePath();
    const original = fs.readFileSync(p, "utf8");
    const bad = JSON.parse(original);
    bad.paramsHash = "deadbeefdead";
    fs.writeFileSync(p, JSON.stringify(bad, null, 2), "utf8");
    const badBytes = fs.readFileSync(p);
    expect(() => listStrategies()).toThrow(
      new RegExp(PROTECTED_STRATEGY_INTEGRITY),
    );
    expect(Buffer.compare(fs.readFileSync(p), badBytes)).toBe(0);
    fs.writeFileSync(p, original, "utf8");
  });

  it("9. save/delete against SAFE are rejected", () => {
    boot();
    const p = safePath();
    const h1 = hashFile(p);
    expect(() =>
      saveStrategy(SAFE_STRATEGY_ID, { name: "hacked" }),
    ).toThrow(/잠긴/);
    expect(() => deleteStrategy(SAFE_STRATEGY_ID)).toThrow(/잠긴/);
    expect(hashFile(p)).toBe(h1);
  });

  it("10-11. copy creates separate editable strategy without mutating SAFE", () => {
    boot();
    const p = safePath();
    const h1 = hashFile(p);
    const m1 = fs.statSync(p).mtimeMs;
    const copy = copyStrategy(SAFE_STRATEGY_ID, "Editable Copy");
    expect(copy.id).not.toBe(SAFE_STRATEGY_ID);
    expect(copy.locked).toBe(false);
    expect(fs.existsSync(path.join(root, `${copy.id}.json`))).toBe(true);
    saveStrategy(copy.id, { name: "Edited Copy Name" });
    expect(getStrategyById(copy.id)?.name).toBe("Edited Copy Name");
    expect(hashFile(p)).toBe(h1);
    expect(fs.statSync(p).mtimeMs).toBe(m1);
  });

  it("paper activation updates index overlay without rewriting SAFE file", () => {
    boot();
    const p = safePath();
    const h1 = hashFile(p);
    const m1 = fs.statSync(p).mtimeMs;
    const copy = copyStrategy(SAFE_STRATEGY_ID, "Paper Target");
    setPaperActiveStrategy(copy.id);
    expect(hashFile(p)).toBe(h1);
    expect(fs.statSync(p).mtimeMs).toBe(m1);
    expect(getStrategyById(copy.id)?.paperActive).toBe(true);
    expect(getStrategyById(SAFE_STRATEGY_ID)?.paperActive).toBe(false);
    setPaperActiveStrategy(SAFE_STRATEGY_ID);
    expect(hashFile(p)).toBe(h1);
    expect(fs.statSync(p).mtimeMs).toBe(m1);
    expect(getStrategyById(SAFE_STRATEGY_ID)?.paperActive).toBe(true);
  });

  it("production SAFE and canonical source remain untouched by isolated ops", () => {
    const prodSafe = path.join(productionStrategiesDir(), `${SAFE_STRATEGY_ID}.json`);
    const canonical = canonicalSafeSourcePath();
    const prodHash = hashFile(prodSafe);
    const prodMtime = fs.statSync(prodSafe).mtimeMs;
    const canonHash = hashFile(canonical);
    const canonMtime = fs.statSync(canonical).mtimeMs;
    boot();
    copyStrategy(SAFE_STRATEGY_ID);
    listStrategies();
    ensureStrategyStore();
    expect(hashFile(prodSafe)).toBe(prodHash);
    expect(fs.statSync(prodSafe).mtimeMs).toBe(prodMtime);
    expect(hashFile(canonical)).toBe(canonHash);
    expect(fs.statSync(canonical).mtimeMs).toBe(canonMtime);
  });
});
