import fs from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  copyStrategy,
  createStrategy,
  deleteStrategy,
  ensureStrategyStore,
  getStrategiesRoot,
  getStrategyById,
  listStrategies,
  purgeTestStrategies,
} from "../src/lib/rextora/strategy/strategyStore";
import { listProductionStrategies } from "../src/lib/rextora/strategy/strategyMetadata";
import { promoteSearchCandidateToStrategy } from "../src/lib/rextora/strategySearch/promoteFromSearch";
import {
  createSearchJob,
  createStrategySearchCandidateId,
  saveSearchTrial,
  type StrategySearchConfig,
} from "../src/lib/rextora/strategySearch";
import { EXPECTED_SAFE_PARAMS_HASH, SAFE_STRATEGY_ID } from "../src/lib/rextora/strategy/strategyTypes";
import { CONTEXT_FALLBACK_PARAMS } from "../src/lib/rextora/strategy/safeV44Params";
import { computeParamsHash } from "../src/lib/rextora/strategy/strategyHash";
import {
  hashFile,
  installIsolatedStrategyStore,
  productionStrategiesDir,
} from "./helpers/isolatedStrategyStore";

const cleanups: Array<() => void> = [];

function seedPassedTrial(jobId: string, rootDir: string, params: Record<string, unknown>) {
  const merged = { ...CONTEXT_FALLBACK_PARAMS, ...params };
  const paramsHash = computeParamsHash(merged as never);
  saveSearchTrial(
    {
      jobId,
      iteration: 0,
      candidateId: createStrategySearchCandidateId(jobId, 0),
      params: params as Record<string, number | boolean | string | null>,
      paramsHash,
      generatorType: "random",
      parentCandidateIds: [],
      score: 1,
      passed: true,
      failureReasons: [],
      windowResults: [
        {
          totalReturn: 0.1,
          mdd: -0.05,
          trades: 12,
          winRate: 0.55,
        },
      ],
      costStressResults: [],
      jitterResults: [],
      durationMs: 1,
      createdAt: new Date().toISOString(),
    },
    { rootDir },
  );
  return paramsHash;
}

describe("strategy persistence (isolated)", () => {
  let isolatedRoot = "";
  let searchRoot = "";
  let prodSnapshot: { files: string[]; safeHash: string | null; safeMtime: number | null };

  beforeEach(() => {
    const prod = productionStrategiesDir();
    const safePath = path.join(prod, `${SAFE_STRATEGY_ID}.json`);
    prodSnapshot = {
      files: fs.existsSync(prod) ? fs.readdirSync(prod).sort() : [],
      safeHash: fs.existsSync(safePath) ? hashFile(safePath) : null,
      safeMtime: fs.existsSync(safePath) ? fs.statSync(safePath).mtimeMs : null,
    };

    const iso = installIsolatedStrategyStore();
    isolatedRoot = iso.root;
    cleanups.push(iso.cleanup);
    ensureStrategyStore();
    expect(getStrategiesRoot()).toBe(path.resolve(isolatedRoot));

    searchRoot = fs.mkdtempSync(path.join(path.dirname(isolatedRoot), "rextora-search-"));
    cleanups.push(() => fs.rmSync(searchRoot, { recursive: true, force: true }));
  });

  afterEach(() => {
    while (cleanups.length) cleanups.pop()!();

    const prod = productionStrategiesDir();
    const safePath = path.join(prod, `${SAFE_STRATEGY_ID}.json`);
    const files = fs.existsSync(prod) ? fs.readdirSync(prod).sort() : [];
    expect(files).toEqual(prodSnapshot.files);
    if (prodSnapshot.safeHash && fs.existsSync(safePath)) {
      expect(hashFile(safePath)).toBe(prodSnapshot.safeHash);
      expect(fs.statSync(safePath).mtimeMs).toBe(prodSnapshot.safeMtime);
    }
  });

  it("1-3. copied strategy persists after reload and restart simulation", () => {
    const copy = copyStrategy(SAFE_STRATEGY_ID, "Persist Copy A");
    const file = path.join(isolatedRoot, `${copy.id}.json`);
    expect(fs.existsSync(file)).toBe(true);
    expect(copy.id).not.toBe(SAFE_STRATEGY_ID);
    expect(copy.id.startsWith("copy_")).toBe(true);

    // API reload
    expect(listStrategies().some((s) => s.id === copy.id)).toBe(true);
    expect(getStrategyById(copy.id)?.name).toBe("Persist Copy A");

    // Browser refresh / server restart simulation: re-read disk + ensure
    ensureStrategyStore();
    expect(listStrategies().map((s) => s.id).sort()).toEqual(
      [SAFE_STRATEGY_ID, copy.id].sort(),
    );
    expect(fs.existsSync(file)).toBe(true);
  });

  it("4-5. search-registered strategy persists after reload and restart simulation", () => {
    const created = createStrategy({
      name: "탐색등록_Persist",
      description: "전략 탐색 · 출처 job=search_x · iteration=0",
      params: { ema_fast: 11, ema_slow: 44 },
      timeframe: "15m",
      strategyType: "safe_params",
    });
    const file = path.join(isolatedRoot, `${created.id}.json`);
    expect(fs.existsSync(file)).toBe(true);
    expect(created.id.startsWith("custom_")).toBe(true);

    ensureStrategyStore();
    expect(getStrategyById(created.id)?.name).toBe("탐색등록_Persist");
    expect(fs.existsSync(file)).toBe(true);
  });

  it("6-8. list API production filter keeps valid copies and search strategies", () => {
    const copy = copyStrategy(SAFE_STRATEGY_ID, "List Copy Visible");
    const registered = createStrategy({
      name: "List Search Visible",
      description: "전략 탐색 · job=j1",
      timeframe: "15m",
      strategyType: "safe_params",
      params: { ema_fast: 13 },
    });
    const prod = listProductionStrategies();
    expect(prod.some((s) => s.id === copy.id)).toBe(true);
    expect(prod.some((s) => s.id === registered.id)).toBe(true);
    expect(prod.some((s) => s.id === SAFE_STRATEGY_ID)).toBe(true);
    // SAFE-only fallback must not replace a non-empty store
    expect(prod.length).toBeGreaterThanOrEqual(3);
  });

  it("9. unique IDs and filenames for copies", () => {
    const a = copyStrategy(SAFE_STRATEGY_ID);
    const b = copyStrategy(SAFE_STRATEGY_ID);
    expect(a.id).not.toBe(b.id);
    expect(fs.existsSync(path.join(isolatedRoot, `${a.id}.json`))).toBe(true);
    expect(fs.existsSync(path.join(isolatedRoot, `${b.id}.json`))).toBe(true);
  });

  it("10. purgeTestStrategies never deletes valid user/search strategies", () => {
    const copy = copyStrategy(SAFE_STRATEGY_ID, "User Copy Keep");
    const registered = createStrategy({
      name: "Search Keep",
      description: "전략 탐색 · job=keep",
      timeframe: "15m",
      strategyType: "safe_params",
    });
    const pollution = copyStrategy(SAFE_STRATEGY_ID, "SAFE_copy_test");
    const result = purgeTestStrategies();
    expect(result.removed).toContain(pollution.id);
    expect(getStrategyById(copy.id)).toBeDefined();
    expect(getStrategyById(registered.id)).toBeDefined();
    expect(getStrategyById(pollution.id)).toBeUndefined();
    expect(fs.existsSync(path.join(isolatedRoot, `${copy.id}.json`))).toBe(true);
  });

  it("11. SAFE hash remains expected after copy/register/ensure", () => {
    copyStrategy(SAFE_STRATEGY_ID);
    createStrategy({ name: "x", timeframe: "15m", strategyType: "safe_params" });
    ensureStrategyStore();
    const safe = getStrategyById(SAFE_STRATEGY_ID)!;
    expect(safe.paramsHash).toBe(EXPECTED_SAFE_PARAMS_HASH);
    expect(safe.locked).toBe(true);
  });

  it("12-13. failed persistence does not leave false success (missing source)", () => {
    expect(() => copyStrategy("does_not_exist_strategy")).toThrow();
    expect(listStrategies().every((s) => s.id === SAFE_STRATEGY_ID || s.id.startsWith("copy_") || s.id.startsWith("custom_"))).toBe(true);
    // No orphan files from failed copy
    const files = fs.readdirSync(isolatedRoot).filter((f) => f.endsWith(".json") && f !== "index.json");
    expect(files).toEqual([`${SAFE_STRATEGY_ID}.json`]);
  });

  it("14. duplicate search registration remains idempotent", () => {
    const config: StrategySearchConfig = {
      searchVersion: "1",
      strategyTemplateId: "operator_persist",
      symbols: ["BTCUSDT"],
      timeframe: "15m",
      dataVersion: "binance-v1",
      seed: 7,
      generatorType: "random",
      maxIterations: 3,
      parameterRanges: [{ key: "ema_fast", min: 10, max: 12, step: 1, valueType: "integer" }],
      evaluationWindows: [
        {
          id: "w1",
          label: "recent",
          fromOpenTime: 1_700_000_000_000,
          toOpenTime: 1_700_100_000_000,
        },
      ],
      passCriteria: { minTradeCount: 1, requireAllWindowsPass: true },
      costStress: { enabled: false, multipliers: [1] },
      jitter: { enabled: false, samples: 0, relativeAmplitude: 0 },
    };
    const job = createSearchJob(config, { rootDir: searchRoot });
    const params = { ...CONTEXT_FALLBACK_PARAMS, ema_fast: 17, ema_slow: 55 };
    seedPassedTrial(job.id, searchRoot, params);

    const first = promoteSearchCandidateToStrategy({
      jobId: job.id,
      iteration: 0,
      storeOptions: { rootDir: searchRoot },
    });
    expect(first.registrationState).toBe("registered");
    expect(first.alreadyExists).toBe(false);
    expect(getStrategyById(first.strategyId)).toBeDefined();

    const second = promoteSearchCandidateToStrategy({
      jobId: job.id,
      iteration: 0,
      storeOptions: { rootDir: searchRoot },
    });
    expect(second.registrationState).toBe("duplicate");
    expect(second.alreadyExists).toBe(true);
    expect(second.strategyId).toBe(first.strategyId);
    expect(listStrategies().filter((s) => s.paramsHash === first.paramsHash).length).toBe(1);
  });

  it("builder-style afterEach only sweeps isolated store, not production", () => {
    const copy = copyStrategy(SAFE_STRATEGY_ID, "Temp Sweep Target");
    expect(getStrategyById(copy.id)).toBeDefined();
    for (const s of listStrategies()) {
      if (s.id === SAFE_STRATEGY_ID) continue;
      try {
        deleteStrategy(s.id);
      } catch {
        /* ignore */
      }
    }
    expect(listStrategies().map((s) => s.id)).toEqual([SAFE_STRATEGY_ID]);
    // production snapshot asserted in afterEach
  });
});
