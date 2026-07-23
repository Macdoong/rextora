import fs from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as backtestEngine from "../src/lib/rextora/backtest/backtestEngine";
import { generateSyntheticCandles } from "../src/lib/rextora/data/ohlcvTypes";
import { CONTEXT_FALLBACK_PARAMS } from "../src/lib/rextora/strategy/safeV44Params";
import { computeParamsHash } from "../src/lib/rextora/strategy/strategyHash";
import * as strategyStore from "../src/lib/rextora/strategy/strategyStore";
import {
  StrategySearchAdapterError,
  evaluateCandidateAcrossWindows,
  evaluateCandidateWindow,
  type StrategySearchBacktestCostConfig,
  type StrategySearchCandidate,
  type StrategySearchEvaluationWindowPlan,
} from "../src/lib/rextora/strategySearch";

const SAFE_PATH = path.join(
  process.cwd(),
  "data",
  "strategies",
  "SAFE_v44_i4060.json",
);
const STRATEGIES_DIR = path.join(process.cwd(), "data", "strategies");
const INTERVAL_MS = 15 * 60 * 1000;
const WINDOW_FROM = Date.UTC(2024, 0, 1);
const CANDLE_COUNT = 400;
const WINDOW_TO = WINDOW_FROM + (CANDLE_COUNT - 1) * INTERVAL_MS;

const ADAPTER_SRC = fs.readFileSync(
  path.join(
    process.cwd(),
    "src",
    "lib",
    "rextora",
    "strategySearch",
    "backtestAdapter.ts",
  ),
  "utf8",
);

function makeCandles(count = CANDLE_COUNT, start = WINDOW_FROM) {
  return generateSyntheticCandles(count, 100, 0.00025, {
    startOpenTime: start,
    intervalMs: INTERVAL_MS,
  });
}

function makeCandidate(
  overrides?: Partial<StrategySearchCandidate>,
): StrategySearchCandidate {
  const params = {
    ...CONTEXT_FALLBACK_PARAMS,
    ema_fast: CONTEXT_FALLBACK_PARAMS.ema_fast + 1,
  };
  const paramsHash = computeParamsHash(params);
  return {
    candidateId: "search_testjob_candidate_00000001",
    jobId: "search_testjob",
    iteration: 1,
    generatorType: "random",
    parentCandidateIds: [],
    params,
    paramsHash,
    createdAt: "2024-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function makeWindow(
  overrides?: Partial<StrategySearchEvaluationWindowPlan>,
): StrategySearchEvaluationWindowPlan {
  return {
    id: "w1",
    label: "Window 1",
    requestedFrom: WINDOW_FROM,
    requestedTo: WINDOW_TO,
    requiredForPass: true,
    ...overrides,
  };
}

function makeCost(
  overrides?: Partial<StrategySearchBacktestCostConfig>,
): StrategySearchBacktestCostConfig {
  return {
    feeRate: 0.0004,
    slippageRate: 0.0002,
    fundingRate: 0.0001,
    applyFunding: false,
    applySpread: true,
    spreadRate: 0.0001,
    ...overrides,
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("strategySearch backtestAdapter", () => {
  it("uses the real runSafeV44Backtest path and does not import legacy engines", () => {
    expect(ADAPTER_SRC).toContain(
      'from "../backtest/backtestEngine"',
    );
    expect(ADAPTER_SRC).toContain("runSafeV44Backtest");
    expect(ADAPTER_SRC).toContain("loadHistoricalCandles");
    expect(ADAPTER_SRC).not.toContain('from "../backtestEngine"');
    expect(ADAPTER_SRC).not.toContain("strategyDiscoveryEngine");
    expect(ADAPTER_SRC).not.toContain("/api/strategies/discover");
    expect(ADAPTER_SRC).not.toContain("updateStrategyLastBacktest");
    expect(ADAPTER_SRC).not.toContain("saveStrategy");
    expect(ADAPTER_SRC).not.toContain("deleteStrategy");
  });

  it("passes candidate params and fee/slippage rates; omits engine costGuardK on base path", async () => {
    const spy = vi.spyOn(backtestEngine, "runSafeV44Backtest");
    const candidate = makeCandidate();
    const candles = makeCandles();
    const cost = makeCost({
      feeRate: 0.0011,
      slippageRate: 0.0007,
    });

    await evaluateCandidateWindow({
      candidate,
      symbol: "BTCUSDT",
      timeframe: "15m",
      window: makeWindow(),
      balance: 10_000,
      costConfig: cost,
      preloadedCandles: candles,
    });

    expect(spy).toHaveBeenCalledTimes(1);
    const arg = spy.mock.calls[0][0];
    expect(arg.params).toEqual(candidate.params);
    expect(arg.paramsHash).toBe(candidate.paramsHash);
    expect(arg.feeRate).toBe(0.0011);
    expect(arg.slippageRate).toBe(0.0007);
    expect(arg.costGuardK).toBeUndefined();
    expect(arg.params?.cost_guard_k).toBe(candidate.params.cost_guard_k);
    expect(arg.strategyId).toBe(candidate.candidateId);
    expect(arg.strategyName).toBe(candidate.candidateId);
    expect(arg.strategyId).not.toBe("SAFE_v44_i4060");
  });

  it("base evaluation uses candidate.params.cost_guard_k and rejects cost_guard_k channels", async () => {
    const spy = vi.spyOn(backtestEngine, "runSafeV44Backtest");
    const candidate = makeCandidate();
    const guard = candidate.params.cost_guard_k as number;
    const hashBefore = candidate.paramsHash;
    const paramsBefore = structuredClone(candidate.params);

    const a = await evaluateCandidateWindow({
      candidate,
      symbol: "BTCUSDT",
      timeframe: "15m",
      window: makeWindow(),
      balance: 10_000,
      costConfig: makeCost(),
      preloadedCandles: makeCandles(),
    });
    const b = await evaluateCandidateWindow({
      candidate,
      symbol: "BTCUSDT",
      timeframe: "15m",
      window: makeWindow(),
      balance: 10_000,
      costConfig: makeCost(),
      preloadedCandles: makeCandles(),
    });

    const arg = spy.mock.calls[0][0];
    expect(arg.costGuardK).toBeUndefined();
    expect(arg.params?.cost_guard_k).toBe(guard);
    expect(candidate.params).toEqual(paramsBefore);
    expect(candidate.paramsHash).toBe(hashBefore);
    expect(a.metrics).toEqual(b.metrics);

    await expect(
      evaluateCandidateWindow({
        candidate,
        symbol: "BTCUSDT",
        timeframe: "15m",
        window: makeWindow(),
        balance: 10_000,
        costConfig: {
          ...makeCost(),
          ...({ costGuardKOverride: 4.5 } as object),
        } as StrategySearchBacktestCostConfig,
        preloadedCandles: makeCandles(20),
      }),
    ).rejects.toThrow(/costGuardKOverride is not allowed/);

    await expect(
      evaluateCandidateWindow({
        candidate,
        symbol: "BTCUSDT",
        timeframe: "15m",
        window: makeWindow(),
        balance: 10_000,
        costConfig: {
          ...makeCost(),
          ...({ costGuardK: 9 } as object),
        } as StrategySearchBacktestCostConfig,
        preloadedCandles: makeCandles(20),
      }),
    ).rejects.toThrow(/costGuardK is not allowed/);

    // Compile-time: base cost config has neither costGuardK nor costGuardKOverride.
    type BaseKeys = keyof StrategySearchBacktestCostConfig;
    type HasOverride = "costGuardKOverride" extends BaseKeys ? true : false;
    type HasLegacy = "costGuardK" extends BaseKeys ? true : false;
    const _noOverride: HasOverride = false;
    const _noLegacy: HasLegacy = false;
    expect(_noOverride).toBe(false);
    expect(_noLegacy).toBe(false);
  });

  it("returns real BacktestReport-mapped metrics for one window", async () => {
    const candidate = makeCandidate();
    const candles = makeCandles();
    const evaluation = await evaluateCandidateWindow({
      candidate,
      symbol: "BTCUSDT",
      timeframe: "15m",
      window: makeWindow(),
      balance: 10_000,
      costConfig: makeCost(),
      preloadedCandles: candles,
    });

    expect(evaluation.candidateId).toBe(candidate.candidateId);
    expect(evaluation.paramsHash).toBe(candidate.paramsHash);
    expect(evaluation.processedCandleCount).toBe(candles.length);
    expect(evaluation.firstProcessedOpenTime).toBe(candles[0].openTime);
    expect(evaluation.lastProcessedOpenTime).toBe(
      candles[candles.length - 1].openTime,
    );
    expect(evaluation.metrics.startingBalance).toBe(10_000);
    expect(typeof evaluation.metrics.endingBalance).toBe("number");
    expect(typeof evaluation.metrics.totalReturn).toBe("number");
    expect(typeof evaluation.metrics.mdd).toBe("number");
    expect(evaluation.metrics.trades).toBe(evaluation.tradeCount);
    expect(typeof evaluation.metrics.winRate).toBe("number");
    expect(typeof evaluation.metrics.profitFactor).toBe("number");
    expect(Array.isArray(evaluation.metrics.monthlyReturns)).toBe(true);
    expect(typeof evaluation.metrics.negativeMonths).toBe("number");
    expect(typeof evaluation.metrics.feeTotal).toBe("number");
    expect(typeof evaluation.metrics.slippageTotal).toBe("number");
  });

  it("keeps multiple windows independent and preserves symbol/window order", async () => {
    const candidate = makeCandidate();
    const mid = WINDOW_FROM + Math.floor(CANDLE_COUNT / 2) * INTERVAL_MS;
    const wA = makeWindow({
      id: "a",
      label: "A",
      requestedFrom: WINDOW_FROM,
      requestedTo: mid,
    });
    const wB = makeWindow({
      id: "b",
      label: "B",
      requestedFrom: mid + INTERVAL_MS,
      requestedTo: WINDOW_TO,
    });
    const candlesA = makeCandles(
      Math.floor(CANDLE_COUNT / 2) + 1,
      WINDOW_FROM,
    ).filter((c) => c.openTime >= wA.requestedFrom && c.openTime <= wA.requestedTo);
    const candlesB = makeCandles(CANDLE_COUNT, WINDOW_FROM).filter(
      (c) => c.openTime >= wB.requestedFrom && c.openTime <= wB.requestedTo,
    );

    const result = await evaluateCandidateAcrossWindows({
      candidate,
      symbols: ["ETHUSDT", "BTCUSDT"],
      timeframe: "15m",
      windows: [wA, wB],
      balance: 10_000,
      costConfig: makeCost(),
      preloadedCandlesByKey: {
        "ETHUSDT|a": candlesA,
        "ETHUSDT|b": candlesB,
        "BTCUSDT|a": candlesA,
        "BTCUSDT|b": candlesB,
      },
    });

    expect(result.windows.map((w) => `${w.symbol}:${w.window.id}`)).toEqual([
      "ETHUSDT:a",
      "ETHUSDT:b",
      "BTCUSDT:a",
      "BTCUSDT:b",
    ]);
    expect(result.windows[0].firstProcessedOpenTime).toBe(
      candlesA[0].openTime,
    );
    expect(result.windows[1].firstProcessedOpenTime).toBe(
      candlesB[0].openTime,
    );
    expect(result.windows[0].lastProcessedOpenTime).not.toBe(
      result.windows[1].lastProcessedOpenTime,
    );
  });

  it("rejects empty candles", async () => {
    await expect(
      evaluateCandidateWindow({
        candidate: makeCandidate(),
        symbol: "BTCUSDT",
        timeframe: "15m",
        window: makeWindow(),
        balance: 10_000,
        costConfig: makeCost(),
        preloadedCandles: [],
      }),
    ).rejects.toMatchObject({ code: "EMPTY_CANDLES" });
  });

  it("rejects unsorted candles", async () => {
    const candles = makeCandles(10);
    const unsorted = [candles[2], candles[0], candles[1]];
    await expect(
      evaluateCandidateWindow({
        candidate: makeCandidate(),
        symbol: "BTCUSDT",
        timeframe: "15m",
        window: makeWindow({
          requestedFrom: unsorted[1].openTime,
          requestedTo: unsorted[0].openTime,
        }),
        balance: 10_000,
        costConfig: makeCost(),
        preloadedCandles: unsorted,
      }),
    ).rejects.toMatchObject({ code: "UNSORTED_CANDLES" });
  });

  it("rejects duplicate open times", async () => {
    const candles = makeCandles(5);
    const dup = [...candles, { ...candles[2] }];
    // Keep chronological by placing duplicate at end with same time as earlier — still unsorted by time if last < previous? 
    // Better: insert duplicate after same time keeping non-decreasing then detect duplicate.
    const withDup = [candles[0], candles[1], candles[1], candles[2]];
    await expect(
      evaluateCandidateWindow({
        candidate: makeCandidate(),
        symbol: "BTCUSDT",
        timeframe: "15m",
        window: makeWindow({
          requestedFrom: candles[0].openTime,
          requestedTo: candles[2].openTime,
        }),
        balance: 10_000,
        costConfig: makeCost(),
        preloadedCandles: withDup,
      }),
    ).rejects.toMatchObject({ code: "DUPLICATE_CANDLE_TIME" });
    expect(dup.length).toBeGreaterThan(0);
  });

  it("rejects candles outside the requested window", async () => {
    const candles = makeCandles(20);
    await expect(
      evaluateCandidateWindow({
        candidate: makeCandidate(),
        symbol: "BTCUSDT",
        timeframe: "15m",
        window: makeWindow({
          requestedFrom: candles[5].openTime,
          requestedTo: candles[10].openTime,
        }),
        balance: 10_000,
        costConfig: makeCost(),
        preloadedCandles: candles,
      }),
    ).rejects.toMatchObject({ code: "CANDLE_OUTSIDE_WINDOW" });
  });

  it("rejects protected SAFE hash", async () => {
    await expect(
      evaluateCandidateWindow({
        candidate: makeCandidate({ paramsHash: "7893ca3f0e30" }),
        symbol: "BTCUSDT",
        timeframe: "15m",
        window: makeWindow(),
        balance: 10_000,
        costConfig: makeCost(),
        preloadedCandles: makeCandles(50),
      }),
    ).rejects.toMatchObject({
      code: "PROTECTED_HASH_COLLISION",
      name: "StrategySearchAdapterError",
    });
    expect(StrategySearchAdapterError).toBeTypeOf("function");
  });

  it("does not mutate candidate params or candle input", async () => {
    const candidate = makeCandidate();
    const paramsSnapshot = structuredClone(candidate.params);
    const candles = makeCandles(120);
    const candleSnapshot = structuredClone(candles);
    Object.freeze(candidate.params);
    for (const c of candles) Object.freeze(c);

    await evaluateCandidateWindow({
      candidate,
      symbol: "BTCUSDT",
      timeframe: "15m",
      window: makeWindow({
        requestedFrom: candles[0].openTime,
        requestedTo: candles[candles.length - 1].openTime,
      }),
      balance: 10_000,
      costConfig: makeCost(),
      preloadedCandles: candles,
    });

    expect(candidate.params).toEqual(paramsSnapshot);
    expect(candles).toEqual(candleSnapshot);
  });

  it("sends the full candle sequence to the engine without sampling", async () => {
    const spy = vi.spyOn(backtestEngine, "runSafeV44Backtest");
    const candles = makeCandles(350);
    await evaluateCandidateWindow({
      candidate: makeCandidate(),
      symbol: "BTCUSDT",
      timeframe: "15m",
      window: makeWindow({
        requestedFrom: candles[0].openTime,
        requestedTo: candles[candles.length - 1].openTime,
      }),
      balance: 10_000,
      costConfig: makeCost(),
      preloadedCandles: candles,
    });
    expect(spy.mock.calls[0][0].candles).toBe(candles);
    expect(spy.mock.calls[0][0].candles).toHaveLength(350);
    expect(spy.mock.calls[0][0].candles.map((c) => c.openTime)).toEqual(
      candles.map((c) => c.openTime),
    );
  });

  it("persists nothing and leaves SAFE bytes / strategies dir unchanged", async () => {
    const before = fs.readFileSync(SAFE_PATH);
    const beforeNames = new Set(fs.readdirSync(STRATEGIES_DIR));
    const saveSpy = vi.spyOn(strategyStore, "saveStrategy");
    const updateSpy = vi.spyOn(strategyStore, "updateStrategyLastBacktest");
    const writeSpy = vi.spyOn(fs, "writeFileSync");
    const renameSpy = vi.spyOn(fs, "renameSync");

    await evaluateCandidateWindow({
      candidate: makeCandidate(),
      symbol: "BTCUSDT",
      timeframe: "15m",
      window: makeWindow(),
      balance: 10_000,
      costConfig: makeCost(),
      preloadedCandles: makeCandles(),
    });

    expect(saveSpy).not.toHaveBeenCalled();
    expect(updateSpy).not.toHaveBeenCalled();
    const strategyWrites = writeSpy.mock.calls.filter((call) =>
      String(call[0]).includes(`${path.sep}strategies${path.sep}`),
    );
    const strategyRenames = renameSpy.mock.calls.filter((call) =>
      String(call[0]).includes(`${path.sep}strategies${path.sep}`) ||
      String(call[1]).includes(`${path.sep}strategies${path.sep}`),
    );
    expect(strategyWrites).toHaveLength(0);
    expect(strategyRenames).toHaveLength(0);

    const after = fs.readFileSync(SAFE_PATH);
    expect(Buffer.compare(before, after)).toBe(0);
    const safeJson = JSON.parse(after.toString("utf8")) as {
      name: string;
      params_hash: string;
    };
    expect(safeJson.name).toBe("SAFE_v44_i4060");
    expect(safeJson.params_hash).toBe("7893ca3f0e30");
    expect(new Set(fs.readdirSync(STRATEGIES_DIR))).toEqual(beforeNames);
  });

  it("is deterministic for identical inputs", async () => {
    const candidate = makeCandidate();
    const candles = makeCandles();
    const window = makeWindow();
    const cost = makeCost();
    const a = await evaluateCandidateWindow({
      candidate,
      symbol: "BTCUSDT",
      timeframe: "15m",
      window,
      balance: 10_000,
      costConfig: cost,
      preloadedCandles: candles,
    });
    const b = await evaluateCandidateWindow({
      candidate,
      symbol: "BTCUSDT",
      timeframe: "15m",
      window,
      balance: 10_000,
      costConfig: cost,
      preloadedCandles: candles,
    });
    expect(a.metrics).toEqual(b.metrics);
    expect(a.tradeCount).toBe(b.tradeCount);
    expect(a.processedCandleCount).toBe(b.processedCandleCount);
    expect(a.firstProcessedOpenTime).toBe(b.firstProcessedOpenTime);
    expect(a.lastProcessedOpenTime).toBe(b.lastProcessedOpenTime);
  });
});
