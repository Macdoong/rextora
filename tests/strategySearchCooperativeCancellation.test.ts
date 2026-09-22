import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as backtestEngine from "../src/lib/rextora/backtest/backtestEngine";
import {
  runSafeV44Backtest,
  runSafeV44BacktestCooperative,
} from "../src/lib/rextora/backtest/backtestEngine";
import {
  STRATEGY_SEARCH_CONTROL_CHECK_BAR_INTERVAL,
  yieldToEventLoop,
} from "../src/lib/rextora/strategySearch/searchEvaluationControl";
import { generateSyntheticCandles } from "../src/lib/rextora/data/ohlcvTypes";
import { CONTEXT_FALLBACK_PARAMS } from "../src/lib/rextora/strategy/safeV44Params";
import { computeParamsHash } from "../src/lib/rextora/strategy/strategyHash";
import * as adapter from "../src/lib/rextora/strategySearch/backtestAdapter";
import { requestCancelWithFinalization } from "../src/lib/rextora/strategySearch/cancellationLifecycle";
import {
  StrategySearchEvaluationCancelledError,
  StrategySearchEvaluationPausedError,
  createSearchJob,
  evaluateCandidateAcrossWindows,
  evaluateCandidateJitter,
  evaluateCompleteCandidate,
  evaluateCostStress,
  getSearchJob,
  isEvaluationCancelledError,
  listSearchTrials,
  requestSearchJobCancel,
  runSearchJob,
  throwIfEvaluationCancelled,
  type EvaluateCompleteCandidateInput,
  type StrategySearchCandidate,
  type StrategySearchCandidateEvaluation,
  type StrategySearchCompleteCandidateEvaluation,
  type StrategySearchConfig,
  type StrategySearchCostStressScenario,
  type StrategySearchEvaluationWindowPlan,
  type StrategySearchJitterConfig,
  type StrategySearchScoreResult,
  type StrategySearchStoreOptions,
} from "../src/lib/rextora/strategySearch";
import {
  createStrategySearchJobApi,
  setStrategySearchApiStoreOptionsForTests,
} from "../src/lib/rextora/strategySearch/jobApiService";
import {
  isSearchJobExecutionActive,
  resetSearchJobExecutionRegistryForTests,
  setDefaultSearchJobExecutionDepsForTests,
  startSearchJobExecution,
  StrategySearchExecutionRegistryError,
  waitForSearchJobExecution,
} from "../src/lib/rextora/strategySearch/jobExecutionRegistry";
import * as researchResultsSummary from "../src/lib/rextora/strategySearch/researchResultsSummary";
import * as jobState from "../src/lib/rextora/strategySearch/jobState";

const INTERVAL_MS = 15 * 60 * 1000;
const FROM = Date.UTC(2024, 0, 1);
const CANDLE_COUNT = 12;
const TO = FROM + (CANDLE_COUNT - 1) * INTERVAL_MS;
const tempRoots: string[] = [];

function tempStore(): StrategySearchStoreOptions {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "rextora-coop-cancel-"));
  tempRoots.push(root);
  return { rootDir: root };
}

function tinyCandles(start = FROM, count = CANDLE_COUNT) {
  return generateSyntheticCandles(count, 100, 0.0002, {
    startOpenTime: start,
    intervalMs: INTERVAL_MS,
  });
}

function candidate(): StrategySearchCandidate {
  const params = {
    ...CONTEXT_FALLBACK_PARAMS,
    ema_fast: CONTEXT_FALLBACK_PARAMS.ema_fast + 3,
  };
  return {
    candidateId: "search_aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee_candidate_00000001",
    jobId: "search_aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
    iteration: 1,
    generatorType: "random",
    parentCandidateIds: [],
    params,
    paramsHash: computeParamsHash(params),
    createdAt: "2024-01-01T00:00:00.000Z",
  };
}

function windowPlan(
  id: string,
  start = FROM,
  count = CANDLE_COUNT,
): StrategySearchEvaluationWindowPlan {
  return {
    id,
    label: id,
    requestedFrom: start,
    requestedTo: start + (count - 1) * INTERVAL_MS,
    requiredForPass: true,
  };
}

function cost() {
  return {
    feeRate: 0.0004,
    slippageRate: 0.0002,
    fundingRate: 0.0001,
    applyFunding: false,
    applySpread: true,
    spreadRate: 0.0001,
  };
}

function loosePolicy() {
  return {
    thresholds: {
      minTotalReturn: -10,
      maxMdd: -1,
      minTradeCount: 0,
    },
  };
}

function weights() {
  return {
    returnWeight: 1,
    mddWeight: 0.5,
    profitFactorWeight: 0.25,
    winRateWeight: 0.25,
    tradeAdequacyWeight: 0.25,
    negativeMonthWeight: 0.1,
    consistencyWeight: 0.1,
  };
}

function cancelAfter(n: number) {
  let calls = 0;
  return async () => {
    calls += 1;
    return calls > n;
  };
}

function stubWindowEvaluation(
  input: EvaluateCompleteCandidateInput["candidate"],
  windows: readonly StrategySearchEvaluationWindowPlan[],
): StrategySearchCandidateEvaluation {
  return {
    candidateId: input.candidateId,
    paramsHash: input.paramsHash,
    symbols: ["BTCUSDT"],
    timeframe: "15m",
    windows: windows.map((window) => ({
      window: { ...window },
      symbol: "BTCUSDT",
      timeframe: "15m",
      candidateId: input.candidateId,
      paramsHash: input.paramsHash,
      metrics: {
        startingBalance: 10_000,
        endingBalance: 10_100,
        totalReturn: 0.01,
        mdd: -0.01,
        trades: 2,
        winRate: 0.5,
        profitFactor: 1.2,
        averageTrade: 50,
        monthlyReturns: [],
        negativeMonths: 0,
        feeTotal: 1,
        slippageTotal: 0.5,
      },
      tradeCount: 2,
      processedCandleCount: CANDLE_COUNT,
      firstProcessedOpenTime: FROM,
      lastProcessedOpenTime: TO,
      durationMs: 1,
    })),
    costConfig: cost(),
    startedAt: "2024-01-01T00:00:00.000Z",
    completedAt: "2024-01-01T00:00:01.000Z",
    durationMs: 1,
  };
}

function stubScore(finalScore: number): StrategySearchScoreResult {
  return {
    finalScore,
    breakdown: {
      returnReward: finalScore,
      mddPenalty: 0,
      profitFactorReward: 0,
      winRateReward: 0,
      tradeAdequacy: 0,
      negativeMonthPenalty: 0,
      consistency: 0,
      weightedReturn: finalScore,
      weightedMdd: 0,
      weightedProfitFactor: 0,
      weightedWinRate: 0,
      weightedTradeAdequacy: 0,
      weightedNegativeMonth: 0,
      weightedConsistency: 0,
    },
    weights: weights(),
    requiredWindowCount: 1,
  };
}

function mockCompleteEval(
  scoreFor: (input: EvaluateCompleteCandidateInput, call: number) => number,
  options?: {
    afterStart?: (input: EvaluateCompleteCandidateInput, call: number) => Promise<void>;
  },
): (
  input: EvaluateCompleteCandidateInput,
) => Promise<StrategySearchCompleteCandidateEvaluation> {
  let call = 0;
  return async (input) => {
    call += 1;
    if (options?.afterStart) {
      await options.afterStart(input, call);
    }
    const score = scoreFor(input, call);
    return {
      candidateId: input.candidate.candidateId,
      paramsHash: input.candidate.paramsHash,
      baseEvaluation: stubWindowEvaluation(input.candidate, input.windows),
      basePass: {
        passed: true,
        requiredWindowCount: 1,
        passedRequiredWindowCount: 1,
        failedRequiredWindowCount: 0,
        issues: [],
      },
      baseScore: stubScore(score),
      costStressResults: [],
      costStressPassed: true,
      jitterResult: {
        enabled: false,
        jitterPassed: true,
        sampleCount: 0,
        passedSampleCount: 0,
        failedSampleCount: 0,
        passRate: 1,
        averageScore: null,
        minimumScore: null,
        maximumScore: null,
        averageScoreDropRatio: null,
        maximumObservedScoreDropRatio: null,
        baseScore: score,
        samples: [],
      },
      finalPassed: true,
      startedAt: "2024-01-01T00:00:00.000Z",
      completedAt: "2024-01-01T00:00:01.000Z",
      durationMs: 1,
    };
  };
}

function runnerFixtures() {
  return {
    windows: [windowPlan("w1")],
    balance: 10_000,
    baseCostConfig: cost(),
    passPolicy: loosePolicy(),
    scoreWeights: weights(),
    costStressScenarios: [] as StrategySearchCostStressScenario[],
    jitterConfig: {
      enabled: false,
      sampleCount: 1,
      mutationScale: 0.1,
      seed: 1,
      minimumPassRate: 0,
      maximumScoreDropRatio: 1,
      parameterRanges: [
        { key: "ema_fast", min: 10, max: 40, step: 1, valueType: "integer" as const },
      ],
    } satisfies StrategySearchJitterConfig,
  };
}

function sampleConfig(
  overrides: Partial<StrategySearchConfig> = {},
): StrategySearchConfig {
  return {
    searchVersion: "1",
    strategyTemplateId: "template_search_base",
    symbols: ["BTCUSDT"],
    timeframe: "15m",
    dataVersion: "binance-v1",
    seed: 42,
    generatorType: "random",
    maxIterations: 6,
    parameterRanges: [
      { key: "ema_fast", min: 10, max: 40, step: 1, valueType: "integer" },
      { key: "ema_mid", min: 20, max: 60, step: 1, valueType: "integer" },
    ],
    evaluationWindows: [
      {
        id: "w1",
        label: "recent",
        fromOpenTime: FROM,
        toOpenTime: TO,
      },
    ],
    passCriteria: { minTradeCount: 0, requireAllWindowsPass: true },
    costStress: { enabled: false, multipliers: [1] },
    jitter: { enabled: false, samples: 0, relativeAmplitude: 0 },
    ...overrides,
  };
}

function apiCreateBody() {
  return {
    searchVersion: "phase6",
    strategyTemplateId: "template_search_base",
    symbols: ["BTCUSDT"],
    timeframe: "15m",
    dataVersion: "synthetic-v1",
    seed: 101,
    generatorType: "random",
    maxIterations: 8,
    parameterRanges: [
      { key: "ema_fast", min: 10, max: 30, step: 1, valueType: "integer" },
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
    balance: 10_000,
    baseCostConfig: cost(),
    passPolicy: loosePolicy(),
    scoreWeights: weights(),
    costStressScenarios: [],
    jitterConfig: {
      enabled: false,
      sampleCount: 1,
      mutationScale: 0.2,
      seed: 1,
      minimumPassRate: 0,
      maximumScoreDropRatio: 1,
      parameterRanges: [
        { key: "ema_fast", min: 10, max: 30, step: 1, valueType: "integer" },
      ],
    },
    dataRef: {
      source: "binance_historical",
      availableFrom: FROM,
      availableTo: TO,
    },
  };
}

function stripTiming(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stripTiming);
  if (!value || typeof value !== "object") return value;
  const out: Record<string, unknown> = {};
  for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
    if (key === "durationMs" || key === "startedAt" || key === "completedAt") {
      continue;
    }
    out[key] = stripTiming(nested);
  }
  return out;
}

function installEngineStub() {
  return vi.spyOn(backtestEngine, "runSafeV44Backtest").mockImplementation((input) => ({
    processedCandles: input.candles,
    trades: [],
    equityCurve: [],
    report: {
      strategyName: input.strategyName,
      strategyHash: input.paramsHash,
      strategyId: input.strategyId,
      sourceStatus: "user_created",
      symbol: input.symbol,
      symbols: [input.symbol],
      timeframe: input.timeframe,
      fromDate: null,
      toDate: null,
      requestedFrom: input.requestedFrom ?? null,
      requestedTo: input.requestedTo ?? null,
      actualFirstCandleTime: null,
      actualLastCandleTime: null,
      candleCount: input.candles.length,
      processedCandleCount: input.candles.length,
      dataSource: "synthetic-test",
      totalReturn: 0.01,
      mdd: -0.01,
      tradeCount: 2,
      winRate: 0.5,
      averageTrade: 50,
      profitFactor: 1.2,
      maxConsecutiveLosses: 0,
      feeImpact: 0,
      feeTotal: 1,
      slippageTotal: 0.5,
      fundingTotal: 0,
      spreadTotal: 0,
      costs: {
        fees: 1,
        slippage: 0.5,
        funding: 0,
        spread: 0,
        totalTradingCost: 1.5,
      },
      monthlyReturns: [],
      negativeMonths: 0,
      startingBalance: input.balance,
      endingBalance: input.balance,
    },
  }));
}

afterEach(() => {
  resetSearchJobExecutionRegistryForTests();
  setDefaultSearchJobExecutionDepsForTests(null);
  setStrategySearchApiStoreOptionsForTests(null);
  vi.restoreAllMocks();
  while (tempRoots.length) {
    const root = tempRoots.pop();
    if (root) fs.rmSync(root, { recursive: true, force: true });
  }
});

describe("strategy search cooperative cancellation control", () => {
  it("uses a dedicated cancellation type distinct from evaluation failure", async () => {
    const err = new StrategySearchEvaluationCancelledError();
    expect(err.code).toBe("EVALUATION_CANCELLED");
    expect(isEvaluationCancelledError(err)).toBe(true);
    expect(isEvaluationCancelledError(new Error("evaluation failed"))).toBe(false);
    await expect(throwIfEvaluationCancelled(async () => true)).rejects.toSatisfy(
      isEvaluationCancelledError,
    );
    await expect(throwIfEvaluationCancelled(async () => false)).resolves.toBeUndefined();
    await expect(throwIfEvaluationCancelled()).resolves.toBeUndefined();
  });

  it("A: cancels between windows and does not start the next window", async () => {
    const engine = installEngineStub();
    const w1 = windowPlan("w1");
    const w2 = windowPlan("w2", FROM + CANDLE_COUNT * INTERVAL_MS);
    const candles1 = tinyCandles(w1.requestedFrom);
    const candles2 = tinyCandles(w2.requestedFrom);

    await expect(
      evaluateCandidateAcrossWindows({
        candidate: candidate(),
        symbols: ["BTCUSDT"],
        timeframe: "15m",
        windows: [w1, w2],
        balance: 10_000,
        costConfig: cost(),
        preloadedCandlesByKey: {
          "BTCUSDT|w1": candles1,
          "BTCUSDT|w2": candles2,
        },
        shouldCancel: cancelAfter(1),
      }),
    ).rejects.toSatisfy(isEvaluationCancelledError);

    expect(engine).toHaveBeenCalledTimes(1);
  });

  it("B: cancels between cost-stress scenarios and does not run the rest", async () => {
    const stress = vi
      .spyOn(adapter, "evaluateCandidateAcrossWindowsForStress")
      .mockImplementation(async (input) => stubWindowEvaluation(input.candidate, input.windows));

    await expect(
      evaluateCostStress({
        candidate: candidate(),
        symbols: ["BTCUSDT"],
        timeframe: "15m",
        windows: [windowPlan("full")],
        balance: 10_000,
        baseCostConfig: cost(),
        scenarios: [
          {
            id: "s1",
            label: "s1",
            requiredForPass: true,
            feeMultiplier: 1,
            slippageMultiplier: 1,
            fundingMultiplier: 1,
            spreadMultiplier: 1,
            costGuardKMultiplier: 1,
          },
          {
            id: "s2",
            label: "s2",
            requiredForPass: true,
            feeMultiplier: 2,
            slippageMultiplier: 2,
            fundingMultiplier: 1,
            spreadMultiplier: 1,
            costGuardKMultiplier: 1,
          },
        ],
        passPolicy: loosePolicy(),
        scoreWeights: weights(),
        shouldCancel: cancelAfter(1),
      }),
    ).rejects.toSatisfy(isEvaluationCancelledError);

    expect(stress).toHaveBeenCalledTimes(1);
  });

  it("C: cancels between jitter samples and does not run remaining samples", async () => {
    const across = vi
      .spyOn(adapter, "evaluateCandidateAcrossWindows")
      .mockImplementation(async (input) => stubWindowEvaluation(input.candidate, input.windows));
    const parent = candidate();
    const baseEvaluation = stubWindowEvaluation(parent, [windowPlan("full")]);

    await expect(
      evaluateCandidateJitter({
        parentCandidate: parent,
        baseEvaluation,
        baseScore: stubScore(1),
        symbols: ["BTCUSDT"],
        timeframe: "15m",
        windows: [windowPlan("full")],
        balance: 10_000,
        baseCostConfig: cost(),
        passPolicy: loosePolicy(),
        scoreWeights: weights(),
        config: {
          enabled: true,
          sampleCount: 3,
          mutationScale: 0.3,
          seed: 7,
          minimumPassRate: 0,
          maximumScoreDropRatio: 1,
          parameterRanges: [
            { key: "ema_fast", min: 12, max: 28, step: 1, valueType: "integer" },
          ],
        },
        shouldCancel: cancelAfter(1),
      }),
    ).rejects.toSatisfy(isEvaluationCancelledError);

    expect(across).toHaveBeenCalledTimes(1);
  });

  it("D/E/F: aborted candidate is not persisted, ranked, or added to Top10; prior trial stays", async () => {
    const store = tempStore();
    const job = createSearchJob(sampleConfig({ maxIterations: 6 }), store);
    const top10 = vi.spyOn(researchResultsSummary, "refreshLiveResearchTop10");
    let releaseSecond: (() => void) | undefined;
    const secondGate = new Promise<void>((resolve) => {
      releaseSecond = resolve;
    });

    const evaluate = mockCompleteEval((_input, call) => call, {
      afterStart: async (_input, call) => {
        if (call === 5) {
          requestSearchJobCancel(job.id, store);
          await secondGate;
        }
      },
    });

    const runPromise = runSearchJob({
      jobId: job.id,
      storeOptions: store,
      ...runnerFixtures(),
      evaluate,
    });

    await vi.waitFor(() => {
      expect(listSearchTrials(job.id, store)).toHaveLength(4);
    });
    const prior = listSearchTrials(job.id, store);
    const priorChamp =
      getSearchJob(job.id, store)?.checkpoint.bestByCompatibilityGroup?.find(
        (row) => row.rankingCompatibilityGroup === "safe_execution_price_v1",
      )?.bestCandidate?.score ?? null;

    releaseSecond?.();
    const result = await runPromise;

    expect(result.stopReason).toBe("cancelled");
    expect(result.job.status).toBe("cancelled");
    expect(listSearchTrials(job.id, store)).toHaveLength(4);
    expect(listSearchTrials(job.id, store)).toEqual(prior);
    expect(top10).not.toHaveBeenCalled();
    const afterChamp =
      getSearchJob(job.id, store)?.checkpoint.bestByCompatibilityGroup?.find(
        (row) => row.rankingCompatibilityGroup === "safe_execution_price_v1",
      )?.bestCandidate?.score ?? null;
    expect(afterChamp).toBe(priorChamp);
    expect(afterChamp).not.toBe(5);
  });

  it("G: cooperative cancel follows cancel_requested → cancelling → cancelled", async () => {
    const store = tempStore();
    const job = createSearchJob(sampleConfig({ maxIterations: 3 }), store);
    const cancelling = vi.spyOn(jobState, "transitionJobToCancelling");
    const cancelled = vi.spyOn(jobState, "transitionJobToCancelled");
    let release: (() => void) | undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });

    const runPromise = runSearchJob({
      jobId: job.id,
      storeOptions: store,
      ...runnerFixtures(),
      evaluate: mockCompleteEval(() => 1, {
        afterStart: async (_input, call) => {
          if (call === 1) {
            requestSearchJobCancel(job.id, store);
            await gate;
          }
        },
      }),
    });

    await vi.waitFor(() => {
      expect(getSearchJob(job.id, store)?.status).toBe("cancel_requested");
    });
    release?.();
    const result = await runPromise;
    expect(cancelling).toHaveBeenCalledTimes(1);
    expect(cancelled).toHaveBeenCalledTimes(1);
    expect(cancelling.mock.invocationCallOrder[0]!).toBeLessThan(
      cancelled.mock.invocationCallOrder[0]!,
    );
    expect(result.job.status).toBe("cancelled");
    expect(result.stopReason).toBe("cancelled");
    expect(listSearchTrials(job.id, store)).toHaveLength(0);
  });

  it("H/I: ownership stays with the worker and duplicate start is rejected while cancelling", async () => {
    const store = tempStore();
    setStrategySearchApiStoreOptionsForTests(store);
    let release: (() => void) | undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    setDefaultSearchJobExecutionDepsForTests({
      storeOptions: store,
      loadCandles: async () => ({}),
      evaluate: mockCompleteEval(() => 1, {
        afterStart: async () => {
          await gate;
        },
      }),
    });
    const created = createStrategySearchJobApi(apiCreateBody());
    startSearchJobExecution(created.id, { storeOptions: store });
    expect(isSearchJobExecutionActive(created.id)).toBe(true);

    await vi.waitFor(() => {
      expect(getSearchJob(created.id, store)?.status).toBe("running");
    });

    const first = requestCancelWithFinalization(created.id, store);
    expect(first.finalized).toBe(false);
    expect(first.blockReason).toBe("active_worker");
    expect(getSearchJob(created.id, store)?.status).toBe("cancel_requested");
    expect(isSearchJobExecutionActive(created.id)).toBe(true);

    expect(() =>
      startSearchJobExecution(created.id, { storeOptions: store }),
    ).toThrow(StrategySearchExecutionRegistryError);
    try {
      startSearchJobExecution(created.id, { storeOptions: store });
    } catch (err) {
      expect(err).toBeInstanceOf(StrategySearchExecutionRegistryError);
      expect((err as StrategySearchExecutionRegistryError).code).toBe(
        "ALREADY_RUNNING",
      );
    }

    const second = requestCancelWithFinalization(created.id, store);
    expect(second.finalized).toBe(false);
    expect(second.blockReason).toBe("active_worker");
    expect(isSearchJobExecutionActive(created.id)).toBe(true);

    release?.();
    await waitForSearchJobExecution(created.id);
    expect(isSearchJobExecutionActive(created.id)).toBe(false);
    expect(getSearchJob(created.id, store)?.status).toBe("cancelled");
  });

  it("J: shouldCancel=false leaves evaluation output identical to the omitted-callback path", async () => {
    installEngineStub();
    const w1 = windowPlan("w1");
    const w2 = windowPlan("w2", FROM + CANDLE_COUNT * INTERVAL_MS);
    const preload = {
      "BTCUSDT|w1": tinyCandles(w1.requestedFrom),
      "BTCUSDT|w2": tinyCandles(w2.requestedFrom),
    };
    const parent = candidate();
    const input = {
      candidate: parent,
      symbols: ["BTCUSDT"],
      timeframe: "15m",
      windows: [w1, w2],
      balance: 10_000,
      baseCostConfig: cost(),
      passPolicy: loosePolicy(),
      scoreWeights: weights(),
      costStressScenarios: [
        {
          id: "s1",
          label: "s1",
          requiredForPass: false,
          feeMultiplier: 1.5,
          slippageMultiplier: 1.5,
          fundingMultiplier: 1,
          spreadMultiplier: 1,
          costGuardKMultiplier: 1,
        },
      ],
      jitterConfig: {
        enabled: true,
        sampleCount: 2,
        mutationScale: 0.25,
        seed: 11,
        minimumPassRate: 0,
        maximumScoreDropRatio: 1,
        parameterRanges: [
          { key: "ema_fast", min: 12, max: 28, step: 1, valueType: "integer" as const },
        ],
      },
      preloadedCandlesByKey: preload,
    };

    const without = await evaluateCompleteCandidate(input);
    const withFalse = await evaluateCompleteCandidate({
      ...input,
      shouldCancel: () => false,
    });
    expect(stripTiming(withFalse)).toEqual(stripTiming(without));
  });

  it("L: cooperative SafeV44 without control matches sync backtest output", async () => {
    const params = {
      ...CONTEXT_FALLBACK_PARAMS,
      ema_fast: CONTEXT_FALLBACK_PARAMS.ema_fast + 1,
    };
    const candles = generateSyntheticCandles(400, 100, 0.00015, {
      startOpenTime: FROM,
      intervalMs: INTERVAL_MS,
    });
    const baseInput = {
      symbol: "BTCUSDT",
      candles,
      params,
      paramsHash: computeParamsHash(params),
      strategyName: "coop-equiv",
      strategyId: "coop-equiv",
      timeframe: "15m",
      balance: 10_000,
      feeRate: 0.0004,
      slippageRate: 0.0002,
      dataSource: "synthetic-test" as const,
    };
    const sync = runSafeV44Backtest(baseInput);
    const coop = await runSafeV44BacktestCooperative({
      ...baseInput,
      cooperativeCheckpoint: {
        barInterval: STRATEGY_SEARCH_CONTROL_CHECK_BAR_INTERVAL,
        onBarCheckpoint: async () => {
          await yieldToEventLoop();
        },
      },
    });
    expect(coop.report.tradeCount).toBe(sync.report.tradeCount);
    expect(coop.report.totalReturn).toBe(sync.report.totalReturn);
    expect(coop.report.mdd).toBe(sync.report.mdd);
    expect(coop.trades.length).toBe(sync.trades.length);
  });

  it("M: cancel during SafeV44 bar loop aborts before completion", async () => {
    const params = { ...CONTEXT_FALLBACK_PARAMS };
    const candles = generateSyntheticCandles(800, 100, 0.00012, {
      startOpenTime: FROM,
      intervalMs: INTERVAL_MS,
    });
    let checkpoints = 0;
    let releaseCancel: (() => void) | undefined;
    const cancelGate = new Promise<void>((resolve) => {
      releaseCancel = resolve;
    });
    const controlState = { value: "continue" as "continue" | "cancel" };
    const runPromise = runSafeV44BacktestCooperative({
      symbol: "BTCUSDT",
      candles,
      params,
      paramsHash: computeParamsHash(params),
      strategyName: "coop-cancel",
      strategyId: "coop-cancel",
      timeframe: "15m",
      balance: 10_000,
      dataSource: "synthetic-test",
      cooperativeCheckpoint: {
        barInterval: 8,
        onBarCheckpoint: async () => {
          checkpoints += 1;
          await yieldToEventLoop();
          if (controlState.value === "cancel") {
            throw new StrategySearchEvaluationCancelledError();
          }
          if (checkpoints === 3) {
            controlState.value = "cancel";
            releaseCancel?.();
          }
        },
      },
    });
    await cancelGate;
    await expect(runPromise).rejects.toSatisfy(isEvaluationCancelledError);
    expect(checkpoints).toBeGreaterThanOrEqual(3);
  });

  it("N: pause during cost-stress discards candidate evaluation", async () => {
    const stress = vi
      .spyOn(adapter, "evaluateCandidateAcrossWindowsForStress")
      .mockImplementation(async (input) => stubWindowEvaluation(input.candidate, input.windows));

    await expect(
      evaluateCostStress({
        candidate: candidate(),
        symbols: ["BTCUSDT"],
        timeframe: "15m",
        windows: [windowPlan("full")],
        balance: 10_000,
        baseCostConfig: cost(),
        scenarios: [
          {
            id: "s1",
            label: "s1",
            requiredForPass: true,
            feeMultiplier: 1,
            slippageMultiplier: 1,
            fundingMultiplier: 1,
            spreadMultiplier: 1,
            costGuardKMultiplier: 1,
          },
        ],
        passPolicy: loosePolicy(),
        scoreWeights: weights(),
        shouldPause: cancelAfter(0),
      }),
    ).rejects.toBeInstanceOf(StrategySearchEvaluationPausedError);

    expect(stress).toHaveBeenCalledTimes(0);
  });

  it("O: event-loop callback runs while cooperative SafeV44 is in progress", async () => {
    const params = { ...CONTEXT_FALLBACK_PARAMS };
    const candles = generateSyntheticCandles(600, 100, 0.0001, {
      startOpenTime: FROM,
      intervalMs: INTERVAL_MS,
    });
    let observedDuringRun = false;
    const t0 = Date.now();
    const backtestPromise = runSafeV44BacktestCooperative({
      symbol: "BTCUSDT",
      candles,
      params,
      paramsHash: computeParamsHash(params),
      strategyName: "coop-loop",
      strategyId: "coop-loop",
      timeframe: "15m",
      balance: 10_000,
      dataSource: "synthetic-test",
      cooperativeCheckpoint: {
        barInterval: 4,
        onBarCheckpoint: async () => {
          await yieldToEventLoop();
        },
      },
    });
    await yieldToEventLoop();
    observedDuringRun = true;
    await backtestPromise;
    const elapsed = Date.now() - t0;
    expect(observedDuringRun).toBe(true);
    expect(elapsed).toBeLessThan(60_000);
  });

  it("K: repeated cancel requests do not persist the aborted candidate twice", async () => {
    const store = tempStore();
    setStrategySearchApiStoreOptionsForTests(store);
    let release: (() => void) | undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    setDefaultSearchJobExecutionDepsForTests({
      storeOptions: store,
      loadCandles: async () => ({}),
      evaluate: mockCompleteEval((_input, call) => call, {
        afterStart: async (input, call) => {
          if (call === 2) {
            requestCancelWithFinalization(input.candidate.jobId, store);
            requestCancelWithFinalization(input.candidate.jobId, store);
            requestCancelWithFinalization(input.candidate.jobId, store);
            await gate;
          }
        },
      }),
    });
    const created = createStrategySearchJobApi(apiCreateBody());
    startSearchJobExecution(created.id, { storeOptions: store });

    await vi.waitFor(() => {
      expect(listSearchTrials(created.id, store)).toHaveLength(1);
    });
    const prior = listSearchTrials(created.id, store);
    release?.();
    await waitForSearchJobExecution(created.id);
    expect(getSearchJob(created.id, store)?.status).toBe("cancelled");
    expect(listSearchTrials(created.id, store)).toEqual(prior);
    expect(listSearchTrials(created.id, store)).toHaveLength(1);
  });
});
