/**
 * Order Block Search path: generate → evaluate → promote.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import type { OhlcvCandle } from "../src/lib/rextora/data/ohlcvTypes";
import { computeParamsHash } from "../src/lib/rextora/strategy/strategyHash";
import { getStrategyById } from "../src/lib/rextora/strategy/strategyStore";
import { evaluateCandidateWindow } from "../src/lib/rextora/strategySearch/backtestAdapter";
import { generateRandomCandidate } from "../src/lib/rextora/strategySearch/candidateGenerator";
import {
  ORDER_BLOCK_BASE_PARAMS,
  orderBlockSearchRanges,
} from "../src/lib/rextora/strategySearch/patternSearchSpaces";
import { promoteSearchCandidateToStrategy } from "../src/lib/rextora/strategySearch/promoteFromSearch";
import {
  createSearchJob,
  saveSearchTrial,
  type StrategySearchConfig,
  type StrategySearchStoreOptions,
} from "../src/lib/rextora/strategySearch/jobStore";
import { createStrategySearchJobId } from "../src/lib/rextora/strategySearch/searchId";
import { createSeededRandom } from "../src/lib/rextora/strategySearch/random";
import {
  getSearchSpaceById,
  rangesForSpace,
} from "../src/lib/rextora/strategySearch/searchSpaces";
import type { StrategySearchTrial } from "../src/lib/rextora/strategySearch/types";
import { installIsolatedStrategyStore } from "./helpers/isolatedStrategyStore";

const INTERVAL = 15 * 60 * 1000;
const START = Date.UTC(2024, 0, 1);

function candle(
  i: number,
  o: number,
  h: number,
  l: number,
  c: number,
  volume = 1000,
): OhlcvCandle {
  return {
    openTime: START + i * INTERVAL,
    open: o,
    high: h,
    low: l,
    close: c,
    volume,
    closeTime: START + (i + 1) * INTERVAL - 1,
  };
}

/** Same geometry as eventSequenceBacktest.test.ts — known OB long entry. */
function buildObLongCandles(): OhlcvCandle[] {
  const out: OhlcvCandle[] = [];
  for (let i = 0; i < 24; i += 1) {
    const px = 100 + (i % 3) * 0.05;
    out.push(candle(i, px, px + 0.2, px - 0.2, px + 0.05, 1000));
  }
  out.push(candle(24, 100, 100.2, 97.8, 98, 1200));
  out.push(candle(25, 98.1, 104.5, 97.9, 104, 8000));
  out.push(candle(26, 104, 106.5, 103.5, 106, 2000));
  out.push(candle(27, 106, 107.2, 105.5, 107, 1800));
  out.push(candle(28, 99.2, 100.3, 98.1, 100.05, 2500));
  out.push(candle(29, 100.05, 101.5, 99.8, 101.2, 1500));
  out.push(candle(30, 101.2, 112, 100.5, 110, 1600));
  return out;
}

const tempDirs: string[] = [];
const cleanups: Array<() => void> = [];

function tempStore(): StrategySearchStoreOptions {
  const dir = fs.mkdtempSync(
    path.join(os.tmpdir(), `ob-search-${crypto.randomBytes(4).toString("hex")}-`),
  );
  tempDirs.push(dir);
  return { rootDir: dir };
}

function sampleConfig(
  overrides: Partial<StrategySearchConfig> = {},
): StrategySearchConfig {
  return {
    searchVersion: "1",
    strategyTemplateId: "t",
    symbols: ["BTCUSDT"],
    timeframe: "15m",
    dataVersion: "v1",
    seed: 1,
    generatorType: "random",
    maxIterations: 10,
    parameterRanges: orderBlockSearchRanges(),
    evaluationWindows: [
      {
        id: "w",
        label: "w",
        fromOpenTime: START,
        toOpenTime: START + 40 * INTERVAL,
      },
    ],
    passCriteria: {},
    costStress: { enabled: false, multipliers: [] },
    jitter: { enabled: false, samples: 0, relativeAmplitude: 0 },
    ...overrides,
  };
}

afterEach(() => {
  while (cleanups.length) {
    const fn = cleanups.pop();
    if (typeof fn === "function") fn();
  }
  while (tempDirs.length) {
    const dir = tempDirs.pop();
    if (dir) fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe("Order Block Search engine", () => {
  it("exposes order_block space ranges", () => {
    const space = getSearchSpaceById("order_block");
    expect(space?.id).toBe("order_block");
    const ranges = rangesForSpace(space!);
    const keys = ranges.map((r) => r.key);
    expect(keys).toEqual(
      expect.arrayContaining([
        "penetrationPct",
        "stopAtrMult",
        "tpAtrMult",
        "maxHoldBars",
        "zoneLookback",
        "minImpulseAtrMult",
        "mitigationPct",
      ]),
    );
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("generates OB candidates from OB base params + ranges", () => {
    const ranges = orderBlockSearchRanges();
    const candidate = generateRandomCandidate({
      jobId: createStrategySearchJobId(),
      iteration: 1,
      parameterRanges: ranges,
      baseParams: { ...ORDER_BLOCK_BASE_PARAMS },
      random: createSeededRandom(42),
      searchVersion: "1",
    });
    expect(candidate.params.penetrationPct).toBeTypeOf("number");
    expect(candidate.params.zoneLookback).toBeTypeOf("number");
    expect(candidate.paramsHash).toBe(computeParamsHash(candidate.params));
    expect(candidate.params).not.toHaveProperty("ema_fast");
  });

  it("evaluates OB candidate via event-sequence adapter", async () => {
    const candles = buildObLongCandles();
    const params = {
      penetrationPct: 0.5,
      stopAtrMult: 0.5,
      tpAtrMult: 2,
      maxHoldBars: 48,
      zoneLookback: 40,
    };
    const evaluation = await evaluateCandidateWindow({
      candidate: {
        candidateId: "cand_ob_1",
        jobId: createStrategySearchJobId(),
        iteration: 1,
        generatorType: "random",
        parentCandidateIds: [],
        params,
        paramsHash: computeParamsHash(params),
        createdAt: new Date().toISOString(),
      },
      symbol: "BTCUSDT",
      timeframe: "15m",
      window: {
        id: "w1",
        label: "test",
        requestedFrom: candles[0]!.openTime,
        requestedTo: candles[candles.length - 1]!.openTime,
        requiredForPass: true,
      },
      balance: 10_000,
      costConfig: {
        feeRate: 0.0004,
        slippageRate: 0.0002,
        fundingRate: 0,
        applyFunding: false,
        applySpread: false,
        spreadRate: 0,
      },
      preloadedCandles: candles,
    });
    expect(evaluation.metrics.trades).toBeGreaterThanOrEqual(1);
    expect(evaluation.metrics.startingBalance).toBe(10_000);
  });

  it("promotes OB Final PASS to condition_builder with eventSequence", () => {
    const isolated = installIsolatedStrategyStore();
    cleanups.push(isolated.cleanup);
    const store = tempStore();
    const job = createSearchJob(sampleConfig(), store);
    const params = { ...ORDER_BLOCK_BASE_PARAMS, penetrationPct: 0.55 };
    const paramsHash = computeParamsHash(params);
    const trial: StrategySearchTrial = {
      jobId: job.id,
      iteration: 1,
      candidateId: `${job.id}_candidate_00000001`,
      params,
      paramsHash,
      generatorType: "random",
      parentCandidateIds: [],
      score: 1.2,
      passed: true,
      failureReasons: [],
      windowResults: [
        {
          windowId: "w1",
          totalReturn: 0.12,
          mdd: 0.05,
          trades: 3,
          winRate: 0.66,
          profitFactor: 1.8,
        },
      ],
      costStressResults: [],
      jitterResults: [],
      durationMs: 10,
      createdAt: new Date().toISOString(),
    };
    saveSearchTrial(trial, store);

    const result = promoteSearchCandidateToStrategy({
      jobId: job.id,
      iteration: 1,
      storeOptions: store,
    });
    expect(result.registrationState).toBe("registered");
    expect(result.strategyFamily).toBe("order_block");

    const strategy = getStrategyById(result.strategyId);
    expect(strategy?.strategyType).toBe("condition_builder");
    expect(strategy?.definition?.eventSequence?.steps?.[0]?.patternFamily).toBe(
      "order_block",
    );
    expect(strategy?.description).toContain(`sourceResearchJobId=${job.id}`);
    expect(strategy?.description).toContain("searchFamily=order_block");
    expect(strategy?.description).toContain(`candidateParamsHash=${paramsHash}`);
  });
});
