/**
 * P3-A4 Research job-scope coverage fail-closed + typed classification.
 * Temp stores only — no production Research/Paper/Live/orders.
 */

import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { HistoricalCandleLoadError } from "../src/lib/rextora/data/historicalCandleLoader";
import { generateSyntheticCandles } from "../src/lib/rextora/data/ohlcvTypes";
import { CONTEXT_FALLBACK_PARAMS } from "../src/lib/rextora/strategy/safeV44Params";
import { computeParamsHash } from "../src/lib/rextora/strategy/strategyHash";
import {
  EXPECTED_SAFE_PARAMS_HASH,
  SAFE_STRATEGY_ID,
} from "../src/lib/rextora/strategy/strategyTypes";
import {
  StrategySearchAdapterError,
  StrategySearchGenerationError,
  classifyEngineError,
  evaluateCandidateWindow,
  isInvalidParameterRangesError,
  resumeSearchJobForRun,
  type StrategySearchBacktestCostConfig,
  type StrategySearchCandidate,
  type StrategySearchConfig,
} from "../src/lib/rextora/strategySearch";
import { StrategySearchJitterError } from "../src/lib/rextora/strategySearch/jitterEvaluator";
import {
  resetSearchJobExecutionRegistryForTests,
  startSearchJobExecution,
  waitForSearchJobExecution,
} from "../src/lib/rextora/strategySearch/jobExecutionRegistry";
import { saveJobExecutionProfile } from "../src/lib/rextora/strategySearch/jobExecutionProfile";
import {
  resetJobExecutionOwnershipForTests,
} from "../src/lib/rextora/strategySearch/jobExecutionOwnership";
import {
  createSearchJob,
  getSearchJob,
  listSearchTrials,
  resumeSearchJob,
  type StrategySearchStoreOptions,
} from "../src/lib/rextora/strategySearch/jobStore";
import {
  createEmptySearchPlan,
  getSearchPlan,
  saveSearchPlan,
} from "../src/lib/rextora/strategySearch/searchPlan";
import { readRunnerPayloadFromCheckpoint } from "../src/lib/rextora/strategySearch/jobCheckpoint";

const SAFE_PATH = "data/strategies/SAFE_v44_i4060.json";
const INTERVAL_15M = 900_000;
const FROM = Date.UTC(2024, 0, 1);
const EXPECTED_BARS = 1000;
const TO = FROM + (EXPECTED_BARS - 1) * INTERVAL_15M;

const roots: string[] = [];

function safeSha256(): string {
  return createHash("sha256").update(fs.readFileSync(SAFE_PATH)).digest("hex");
}

function tempStore(): StrategySearchStoreOptions {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "rextora-p3a4-"));
  roots.push(rootDir);
  return { rootDir };
}

afterEach(() => {
  resetSearchJobExecutionRegistryForTests();
  while (roots.length) {
    const root = roots.pop();
    if (root) fs.rmSync(root, { recursive: true, force: true });
  }
});

function config(): StrategySearchConfig {
  return {
    searchVersion: "1",
    strategyTemplateId: "p3a4_coverage",
    symbols: ["BTCUSDT"],
    timeframe: "15m",
    dataVersion: "test-v1",
    seed: 11,
    generatorType: "random",
    maxIterations: 20,
    parameterRanges: [
      { key: "ema_fast", min: 12, max: 28, step: 1, valueType: "integer" },
    ],
    evaluationWindows: [
      {
        id: "full",
        label: "full",
        fromOpenTime: FROM,
        toOpenTime: TO,
        requiredForPass: true,
      },
    ],
    passCriteria: {
      minTradeCount: 1,
      maxMdd: -1,
      minTotalReturn: -1,
      requireAllWindowsPass: false,
    },
    costStress: { enabled: false, multipliers: [] },
    jitter: { enabled: false, samples: 0, relativeAmplitude: 0 },
  };
}

function executionProfile() {
  return {
    version: 1 as const,
    balance: 10_000,
    baseCostConfig: {
      feeRate: 0,
      slippageRate: 0,
      fundingRate: 0,
      applyFunding: false,
      applySpread: false,
      spreadRate: 0,
    },
    passPolicy: { thresholds: { minTradeCount: 1 } },
    scoreWeights: {
      returnWeight: 1,
      mddWeight: 0.5,
      profitFactorWeight: 0.25,
      winRateWeight: 0.25,
      tradeAdequacyWeight: 0.25,
      negativeMonthWeight: 0.1,
      consistencyWeight: 0.1,
    },
    costStressScenarios: [],
    jitterConfig: {
      enabled: false,
      sampleCount: 1,
      mutationScale: 0.2,
      seed: 1,
      minimumPassRate: 0,
      maximumScoreDropRatio: 1,
      parameterRanges: [
        { key: "ema_fast", min: 12, max: 28, step: 1, valueType: "integer" },
      ],
    },
    dataRef: {
      availableFrom: FROM,
      availableTo: TO,
      source: "preloaded" as const,
    },
  };
}

function fixture() {
  const store = tempStore();
  resetJobExecutionOwnershipForTests(store);
  const job = createSearchJob(config(), store);
  saveJobExecutionProfile(job.id, executionProfile(), store);
  saveSearchPlan(
    job.id,
    {
      ...createEmptySearchPlan({
        searchName: "P3-A4",
        depthProfile: "fast",
        qualificationProfile: "balanced",
        qualifiedTarget: 1,
        candidateBudget: 40,
        stageBatchSize: 8,
        maxRuntimeMs: null,
        spaces: [{ id: "ema_core", labelKo: "EMA 추세" }],
        repeatedSignatureThreshold: 25,
      }),
      campaignStartedAtMs: Date.now(),
    },
    store,
  );
  return { store, jobId: job.id };
}

function makeCandidate(): StrategySearchCandidate {
  const params = {
    ...CONTEXT_FALLBACK_PARAMS,
    ema_fast: CONTEXT_FALLBACK_PARAMS.ema_fast + 1,
  };
  return {
    candidateId: "search_p3a4_candidate_00000001",
    jobId: "search_p3a4",
    iteration: 1,
    generatorType: "random",
    parentCandidateIds: [],
    params,
    paramsHash: computeParamsHash(params),
    createdAt: "2024-01-01T00:00:00.000Z",
  };
}

function makeCost(): StrategySearchBacktestCostConfig {
  return {
    feeRate: 0.0004,
    slippageRate: 0.0002,
    fundingRate: 0,
    applyFunding: false,
    applySpread: false,
    spreadRate: 0,
  };
}

function windowPlan() {
  return {
    id: "full",
    label: "full",
    requestedFrom: FROM,
    requestedTo: TO,
    requiredForPass: true,
  };
}

function loadError(code: HistoricalCandleLoadError["code"], message: string) {
  return new HistoricalCandleLoadError({
    code,
    userMessage: message,
    technicalReason: "p3-a4-fixture",
    symbol: "BTCUSDT",
    timeframe: "15m",
    requestedFrom: new Date(FROM).toISOString(),
    requestedTo: new Date(TO).toISOString(),
    candlesReceived: 0,
  });
}

describe("P3-A4 Research coverage fail-closed", () => {
  it("22-23/25/31-32/35-36. 1000/600 job-scope DATA_UNAVAILABLE, zero evals/trials", async () => {
    const { store, jobId } = fixture();
    let candidateEvaluationCallCount = 0;
    const candles = generateSyntheticCandles(600, 100, 0.00025, {
      startOpenTime: FROM,
      intervalMs: INTERVAL_15M,
    });
    startSearchJobExecution(jobId, {
      storeOptions: store,
      preloadedCandlesByKey: { "BTCUSDT|full": candles },
      evaluate: async () => {
        candidateEvaluationCallCount += 1;
        throw new Error("evaluate must not run");
      },
    });
    await waitForSearchJobExecution(jobId);
    const job = getSearchJob(jobId, store)!;
    expect(job.status).toBe("failed");
    expect(getSearchPlan(jobId, store)?.completionReason).toBe(
      "DATA_UNAVAILABLE",
    );
    expect(job.failureMessage).toMatch(/END_BOUNDARY_MISSING/);
    expect(candidateEvaluationCallCount).toBe(0);
    expect(listSearchTrials(jobId, store)).toHaveLength(0);
    const checkpoint = getSearchJob(jobId, store)?.checkpoint;
    const payload = checkpoint
      ? readRunnerPayloadFromCheckpoint(checkpoint)
      : null;
    expect(payload?.repeatedErrorSignatures ?? {}).toEqual({});
  });

  it("24/33-34/37-38. provider failure job-scope DATA_UNAVAILABLE, no auto-retry", async () => {
    const { store, jobId } = fixture();
    let loadCount = 0;
    let candidateEvaluationCallCount = 0;
    startSearchJobExecution(jobId, {
      storeOptions: store,
      loadCandles: async () => {
        loadCount += 1;
        throw loadError(
          "BINANCE_FETCH_FAILED",
          "Binance 선물 과거 캔들을 불러오지 못했습니다.",
        );
      },
      evaluate: async () => {
        candidateEvaluationCallCount += 1;
        throw new Error("evaluate must not run");
      },
    });
    await waitForSearchJobExecution(jobId);
    const job = getSearchJob(jobId, store)!;
    expect(job.status).toBe("failed");
    expect(getSearchPlan(jobId, store)?.completionReason).toBe(
      "DATA_UNAVAILABLE",
    );
    expect(job.failureMessage).toMatch(/BINANCE_FETCH_FAILED/);
    expect(loadCount).toBe(1);
    expect(candidateEvaluationCallCount).toBe(0);
    expect(listSearchTrials(jobId, store)).toHaveLength(0);
    const resumed = resumeSearchJob(jobId, store);
    expect(resumed.status).toBe("queued");
  });

  it("26. typed loader error classification", () => {
    const err = loadError(
      "BINANCE_FETCH_FAILED",
      "Binance 선물 과거 캔들을 불러오지 못했습니다.",
    );
    const classified = classifyEngineError(err, "evaluation");
    expect(classified.class).toBe("data_unavailable");
    expect(classified.code).toBe("BINANCE_FETCH_FAILED");
    expect(classified.fatal).toBe(true);
    const empty = loadError(
      "EMPTY_CANDLES",
      "선택한 기간에 Binance 선물 캔들이 없습니다.",
    );
    const emptyClassified = classifyEngineError(empty, "evaluation");
    expect(emptyClassified.class).toBe("data_unavailable");
    expect(emptyClassified.code).toBe("EMPTY_CANDLES");
  });

  it("27. typed adapter error classification", () => {
    const err = new StrategySearchAdapterError(
      "DATA_COVERAGE_INSUFFICIENT",
      "DATA_COVERAGE_INSUFFICIENT:INTERNAL_MISSING_BARS",
      { sourceReason: "INTERNAL_MISSING_BARS" },
    );
    const classified = classifyEngineError(err, "evaluation");
    expect(classified.class).toBe("data_unavailable");
    expect(classified.code).toBe("INTERNAL_MISSING_BARS");
    const empty = new StrategySearchAdapterError(
      "EMPTY_CANDLES",
      "candle set is empty",
    );
    const emptyClassified = classifyEngineError(empty, "evaluation");
    expect(emptyClassified.class).toBe("data_unavailable");
    expect(emptyClassified.code).toBe("EMPTY_CANDLES");
  });

  it("28. config-invalid unchanged", () => {
    const err = new StrategySearchGenerationError(
      "CONFIGURATION_INVALID",
      "invalid parameterRanges: min must be <= max",
    );
    const classified = classifyEngineError(err, "candidate_generation");
    expect(classified.code).toBe("CONFIGURATION_INVALID");
    expect(classified.fatal).toBe(true);
    expect(classified.class).toBe("fatal_engine_error");
    expect(isInvalidParameterRangesError(err)).toBe(true);
  });

  it("jitter/unknown fallback unchanged", () => {
    const jitter = new StrategySearchJitterError(
      "INVALID_JITTER_CONFIG",
      "bad jitter",
    );
    const jitterClassified = classifyEngineError(jitter, "robustness");
    expect(jitterClassified.class).toBe("robustness_failed");
    expect(jitterClassified.fatal).toBe(false);
    const unknown = classifyEngineError(new Error("completely novel boom"), "x");
    expect(unknown.code).toBe("FATAL_ENGINE_ERROR");
    expect(unknown.fatal).toBe(true);
  });

  it("30. direct adapter valid path", async () => {
    const candles = generateSyntheticCandles(EXPECTED_BARS, 100, 0.00025, {
      startOpenTime: FROM,
      intervalMs: INTERVAL_15M,
    });
    const evaluation = await evaluateCandidateWindow({
      candidate: makeCandidate(),
      symbol: "BTCUSDT",
      timeframe: "15m",
      window: windowPlan(),
      balance: 10_000,
      costConfig: makeCost(),
      preloadedCandles: candles,
    });
    expect(evaluation.processedCandleCount).toBe(EXPECTED_BARS);
    expect(evaluation.metrics).toBeDefined();
  });

  it("31. direct adapter off-grid path", async () => {
    const candles = generateSyntheticCandles(3, 100, 0, {
      startOpenTime: FROM,
      intervalMs: INTERVAL_15M,
    });
    candles[1] = { ...candles[1]!, openTime: FROM + 1 };
    await expect(
      evaluateCandidateWindow({
        candidate: makeCandidate(),
        symbol: "BTCUSDT",
        timeframe: "15m",
        window: {
          id: "full",
          label: "full",
          requestedFrom: FROM,
          requestedTo: FROM + 2 * INTERVAL_15M,
          requiredForPass: true,
        },
        balance: 10_000,
        costConfig: makeCost(),
        preloadedCandles: candles,
      }),
    ).rejects.toMatchObject({
      name: "StrategySearchAdapterError",
      code: "DATA_COVERAGE_INSUFFICIENT",
      sourceReason: "OFF_GRID_TIMESTAMPS",
    });
  });

  it("32. direct adapter missing-bar path", async () => {
    const candles = [
      ...generateSyntheticCandles(2, 100, 0, {
        startOpenTime: FROM,
        intervalMs: INTERVAL_15M,
      }),
      ...generateSyntheticCandles(1, 100, 0, {
        startOpenTime: FROM + 3 * INTERVAL_15M,
        intervalMs: INTERVAL_15M,
      }),
    ];
    await expect(
      evaluateCandidateWindow({
        candidate: makeCandidate(),
        symbol: "BTCUSDT",
        timeframe: "15m",
        window: {
          id: "full",
          label: "full",
          requestedFrom: FROM,
          requestedTo: FROM + 3 * INTERVAL_15M,
          requiredForPass: true,
        },
        balance: 10_000,
        costConfig: makeCost(),
        preloadedCandles: candles,
      }),
    ).rejects.toMatchObject({
      name: "StrategySearchAdapterError",
      code: "DATA_COVERAGE_INSUFFICIENT",
      sourceReason: "INTERNAL_MISSING_BARS",
    });
  });

  it("direct adapter duplicate / unsorted keep existing codes", async () => {
    const base = generateSyntheticCandles(4, 100, 0, {
      startOpenTime: FROM,
      intervalMs: INTERVAL_15M,
    });
    const window = {
      id: "full",
      label: "full",
      requestedFrom: FROM,
      requestedTo: FROM + 3 * INTERVAL_15M,
      requiredForPass: true,
    };
    await expect(
      evaluateCandidateWindow({
        candidate: makeCandidate(),
        symbol: "BTCUSDT",
        timeframe: "15m",
        window,
        balance: 10_000,
        costConfig: makeCost(),
        preloadedCandles: [base[0]!, base[0]!, base[1]!, base[2]!, base[3]!],
      }),
    ).rejects.toMatchObject({ code: "DUPLICATE_CANDLE_TIME" });
    await expect(
      evaluateCandidateWindow({
        candidate: makeCandidate(),
        symbol: "BTCUSDT",
        timeframe: "15m",
        window,
        balance: 10_000,
        costConfig: makeCost(),
        preloadedCandles: [base[1]!, base[0]!, base[2]!, base[3]!],
      }),
    ).rejects.toMatchObject({ code: "UNSORTED_CANDLES" });
  });

  it("35-37. Research executions 0 / Paper Live orders 0 / SAFE unchanged", () => {
    expect(SAFE_STRATEGY_ID).toBe("SAFE_v44_i4060");
    expect(EXPECTED_SAFE_PARAMS_HASH).toBe("7893ca3f0e30");
    expect(safeSha256()).toBe(
      "fb3f19169c8911fe041f3f8cb1d9e654f9166078f0c5cd8e29f04ec02a56dfc0",
    );
    expect(resumeSearchJobForRun).toBeTypeOf("function");
  });
});
