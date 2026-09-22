import { describe, expect, it, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  copyStrategy,
  createStrategy,
  deleteStrategy,
  ensureStrategyStore,
  getPaperActiveStrategy,
  getStrategiesRoot,
  getStrategyById,
  listStrategies,
  saveStrategy,
  setPaperActiveStrategy
} from "../src/lib/rextora/strategy/strategyStore";
import { computeParamsHash } from "../src/lib/rextora/strategy/strategyHash";

import { runConfiguredBacktest } from "../src/lib/rextora/backtest/backtestRunner";
import { isTestStrategyRecord } from "../src/lib/rextora/strategy/strategyTestFilter";
import { installIsolatedStrategyStore } from "./helpers/isolatedStrategyStore";
import { RETIRED_SAFE_STRATEGY_ID } from "../src/lib/rextora/strategy/retiredSafeBaseline";


const createdIds: string[] = [];
let cleanupIsolated: (() => void) | undefined;

describe("strategyStore", () => {
  beforeEach(() => {
    cleanupIsolated?.();
    cleanupIsolated = installIsolatedStrategyStore().cleanup;
    ensureStrategyStore();
    createdIds.length = 0;
  });

  afterEach(() => {
    for (const id of createdIds) {
      try {
        deleteStrategy(id);
      } catch {
        /* already gone */
      }
    }
    for (const s of listStrategies()) {
      if (isTestStrategyRecord(s as never)) {
        try {
          deleteStrategy(s.id);
        } catch {
          /* ignore */
        }
      }
    }
    cleanupIsolated?.();
    cleanupIsolated = undefined;
  });

  it("starts empty with no SAFE injection", () => {
    const list = listStrategies();
    expect(list.find((s) => s.id === RETIRED_SAFE_STRATEGY_ID)).toBeUndefined();
    expect(getPaperActiveStrategy()).toBeNull();
    expect(fs.existsSync(path.join(getStrategiesRoot(), "index.json"))).toBe(true);
  });

  it("copy creates editable strategy with new hash", () => {
    const source = createStrategy({ name: "Persist Base" });
    createdIds.push(source.id);
    const copy = copyStrategy(source.id, "SAFE_copy_test");
    createdIds.push(copy.id);
    expect(copy.locked).toBe(false);
    expect(copy.id).not.toBe(RETIRED_SAFE_STRATEGY_ID);
    const edited = saveStrategy(copy.id, {
      params: { ...copy.params, ema_fast: copy.params.ema_fast + 1 }
    });
    expect(edited.paramsHash).not.toBe(source.paramsHash);
    expect(edited.paramsHash).toBe(computeParamsHash(edited.params));
  });

  it("retired SAFE cannot be saved as a store identity", () => {
    expect(getStrategyById(RETIRED_SAFE_STRATEGY_ID)).toBeUndefined();
    expect(() => saveStrategy(RETIRED_SAFE_STRATEGY_ID, { name: "hacked" })).toThrow();
  });

  it("can set paper active strategy without SAFE fallback", () => {
    const source = createStrategy({ name: "Paper Source" });
    createdIds.push(source.id);
    const copy = copyStrategy(source.id);
    createdIds.push(copy.id);
    const active = setPaperActiveStrategy(copy.id);
    expect(active.paperActive).toBe(true);
    const list = listStrategies();
    expect(list.find((s) => s.id === copy.id)?.paperActive).toBe(true);
    expect(list.filter((s) => s.paperActive).length).toBe(1);
    expect(getPaperActiveStrategy()?.id).toBe(copy.id);
  });
});

describe("backtestRunner", () => {
  it("runs configured backtest without live orders", async () => {
    const { cleanup } = installIsolatedStrategyStore();
    try {
      ensureStrategyStore();
      const source = createStrategy({ name: "Backtest Source" });
      const result = await runConfiguredBacktest({
        strategyId: source.id,
        symbols: ["BTCUSDT"],
        timeframe: "15m",
        balance: 10000,
        feeRate: 0.0004,
        slippageRate: 0.0002,
        fundingRate: 0.0001,
        applyFunding: false,
        applySpread: false,
        spreadRate: 0,
        costStressMultipliers: [1, 1.5, 2],
        costGuardK: 3,
        dataMode: "synthetic-test",
      });
      expect(result.report.validation.noRealOrders).toBe(true);
      expect(result.report.costStress?.length).toBe(3);
      expect(result.report.strategyHash).toHaveLength(64);
      expect(result.report.dataSource).toBe("synthetic-test");
      expect(result.candles.length).toBe(result.report.candleCount);
    } finally {
      cleanup();
    }
  });
});
