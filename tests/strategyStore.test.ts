import { describe, expect, it, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  copyStrategy,
  deleteStrategy,
  ensureStrategyStore,
  getStrategyById,
  listStrategies,
  saveStrategy,
  setPaperActiveStrategy
} from "../src/lib/rextora/strategy/strategyStore";
import { computeParamsHash } from "../src/lib/rextora/strategy/strategyHash";
import { EXPECTED_SAFE_PARAMS_HASH, SAFE_STRATEGY_ID } from "../src/lib/rextora/strategy/strategyTypes";
import { runConfiguredBacktest } from "../src/lib/rextora/backtest/backtestRunner";
import { isTestStrategyRecord } from "../src/lib/rextora/strategy/strategyTestFilter";

const DIR = path.join(process.cwd(), "data", "rextora", "strategies");
const createdIds: string[] = [];

describe("strategyStore", () => {
  beforeEach(() => {
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
    // Sweep leftover pollution clones from interrupted runs
    for (const s of listStrategies()) {
      if (s.id === SAFE_STRATEGY_ID) continue;
      if (isTestStrategyRecord(s as never)) {
        try {
          deleteStrategy(s.id);
        } catch {
          /* ignore */
        }
      }
    }
  });

  it("lists protected SAFE_v44_i4060 with verified hash", () => {
    const list = listStrategies();
    const safe = list.find((s) => s.id === SAFE_STRATEGY_ID);
    expect(safe).toBeDefined();
    expect(safe!.locked).toBe(true);
    expect(safe!.paramsHash).toBe(EXPECTED_SAFE_PARAMS_HASH);
    expect(safe!.timeframe).toBe("15m");
    expect(fs.existsSync(path.join(DIR, "index.json"))).toBe(true);
  });

  it("copy creates editable strategy with new hash", () => {
    const copy = copyStrategy(SAFE_STRATEGY_ID, "SAFE_copy_test");
    createdIds.push(copy.id);
    expect(copy.locked).toBe(false);
    expect(copy.id).not.toBe(SAFE_STRATEGY_ID);
    const edited = saveStrategy(copy.id, {
      params: { ...copy.params, ema_fast: copy.params.ema_fast + 1 }
    });
    expect(edited.paramsHash).not.toBe(EXPECTED_SAFE_PARAMS_HASH);
    expect(edited.paramsHash).toBe(computeParamsHash(edited.params));
  });

  it("refuses direct save of locked SAFE", () => {
    const safe = getStrategyById(SAFE_STRATEGY_ID)!;
    expect(() => saveStrategy(SAFE_STRATEGY_ID, { params: safe.params })).toThrow(/잠긴/);
  });

  it("can set paper active strategy", () => {
    const copy = copyStrategy(SAFE_STRATEGY_ID);
    createdIds.push(copy.id);
    const active = setPaperActiveStrategy(copy.id);
    expect(active.paperActive).toBe(true);
    const list = listStrategies();
    expect(list.find((s) => s.id === copy.id)?.paperActive).toBe(true);
    expect(list.filter((s) => s.paperActive).length).toBe(1);
    setPaperActiveStrategy(SAFE_STRATEGY_ID);
  });
});

describe("backtestRunner", () => {
  it("runs configured backtest without live orders", () => {
    ensureStrategyStore();
    const result = runConfiguredBacktest({
      strategyId: SAFE_STRATEGY_ID,
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
      costGuardK: 3
    });
    expect(result.report.validation.noRealOrders).toBe(true);
    expect(result.report.costStress?.length).toBe(3);
    expect(result.report.strategyHash).toBe(EXPECTED_SAFE_PARAMS_HASH);
  });
});
