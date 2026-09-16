/**
 * Isolated P1-C5 canary: remaining REVIEW jobs are invalid-generation
 * placeholders (min>max ranges) that crashed after trial persist and before
 * checkpoint advance. Temp-store only.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  createSearchJob,
  createStrategySearchCandidateId,
  generateUniqueCandidate,
  getSearchJob,
  getSearchTrial,
  readRunnerPayloadFromCheckpoint,
  requestSearchJobPause,
  restoreSeededRandom,
  runSearchJob,
  saveSearchJob,
  saveSearchTrial,
  type EvaluateCompleteCandidateInput,
  type StrategySearchCompleteCandidateEvaluation,
  type StrategySearchConfig,
} from "../src/lib/rextora/strategySearch";
import { CONTEXT_FALLBACK_PARAMS } from "../src/lib/rextora/strategy/safeV44Params";

const tempRoots: string[] = [];

function makeTempRoot(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "rextora-p1c5-lag-"));
  tempRoots.push(root);
  return root;
}

afterEach(() => {
  for (const root of tempRoots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

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
    maxIterations: 4,
    parameterRanges: [
      { key: "ema_fast", min: 10, max: 40, step: 1, valueType: "integer" },
      { key: "ema_mid", min: 20, max: 60, step: 1, valueType: "integer" },
    ],
    evaluationWindows: [
      {
        id: "w1",
        label: "recent",
        fromOpenTime: 1,
        toOpenTime: 2,
      },
    ],
    passCriteria: { minTradeCount: null },
    costStress: { enabled: false, multipliers: [1] },
    jitter: { enabled: false, samples: 0, relativeAmplitude: 0 },
    ...overrides,
  };
}

function fixtures() {
  return {
    windows: [
      {
        id: "w1",
        label: "recent",
        requestedFrom: 1,
        requestedTo: 2,
        requiredForPass: true,
      },
    ],
    balance: 10_000,
    baseCostConfig: {
      feeRate: 0.0004,
      slippageRate: 0.0002,
      fundingRate: 0,
      applyFunding: false,
      applySpread: false,
      spreadRate: 0,
    },
    passPolicy: { thresholds: { minTradeCount: 0 } },
    scoreWeights: {
      returnWeight: 1,
      mddWeight: 0.5,
      profitFactorWeight: 0.25,
      winRateWeight: 0.25,
      tradeAdequacyWeight: 0.25,
      negativeMonthWeight: 0.1,
      consistencyWeight: 0.1,
    },
    costStressScenarios: [] as [],
    jitterConfig: {
      enabled: false,
      sampleCount: 1,
      mutationScale: 0.1,
      seed: 1,
      minimumPassRate: 0,
      maximumScoreDropRatio: 1,
      parameterRanges: [
        {
          key: "ema_fast",
          min: 10,
          max: 40,
          step: 1,
          valueType: "integer" as const,
        },
      ],
    },
  };
}

function mockEval(
  score: number,
): (
  input: EvaluateCompleteCandidateInput,
) => Promise<StrategySearchCompleteCandidateEvaluation> {
  return async (input) => ({
    candidateId: input.candidate.candidateId,
    paramsHash: input.candidate.paramsHash,
    baseEvaluation: {
      candidateId: input.candidate.candidateId,
      paramsHash: input.candidate.paramsHash,
      symbols: ["BTCUSDT"],
      timeframe: "15m",
      windows: [],
      costConfig: {
        feeRate: 0,
        slippageRate: 0,
        fundingRate: 0,
        applyFunding: false,
        applySpread: false,
        spreadRate: 0,
      },
      startedAt: "2024-01-01T00:00:00.000Z",
      completedAt: "2024-01-01T00:00:01.000Z",
      durationMs: 1,
    },
    basePass: {
      passed: true,
      requiredWindowCount: 1,
      passedRequiredWindowCount: 1,
      failedRequiredWindowCount: 0,
      issues: [],
    },
    baseScore: {
      finalScore: score,
      breakdown: {
        returnReward: score,
        mddPenalty: 0,
        profitFactorReward: 0,
        winRateReward: 0,
        tradeAdequacy: 0,
        negativeMonthPenalty: 0,
        consistency: 0,
        weightedReturn: score,
        weightedMdd: 0,
        weightedProfitFactor: 0,
        weightedWinRate: 0,
        weightedTradeAdequacy: 0,
        weightedNegativeMonth: 0,
        weightedConsistency: 0,
      },
      weights: fixtures().scoreWeights,
      requiredWindowCount: 1,
    },
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
  });
}

describe("P1-C5 invalid-placeholder checkpoint lag canary", () => {
  it("does not consume PRNG when parameterRanges min > max", () => {
    const random = restoreSeededRandom({
      algorithm: "mulberry32",
      seed: 42,
      state: 191862126,
    });
    const before = random.getState();
    expect(() =>
      generateUniqueCandidate({
        mode: "random",
        existingHashes: new Set(),
        maxAttempts: 64,
        randomInput: {
          jobId: "search_00000000-0000-4000-8000-000000000001",
          iteration: 0,
          parameterRanges: [
            {
              key: "ema_fast",
              min: 40,
              max: 10,
              step: 1,
              valueType: "integer",
            },
          ],
          random,
          baseParams: CONTEXT_FALLBACK_PARAMS,
          searchVersion: "1",
        },
      }),
    ).toThrow(/min must be <= max/);
    expect(random.getState()).toEqual(before);
  });

  it("fails closed on inverted ranges without evaluating N or writing N+1 invalid placeholders", async () => {
    const root = makeTempRoot();
    const opts = { rootDir: root };
    const job = createSearchJob(sampleConfig({ maxIterations: 4, seed: 123 }), opts);

    await runSearchJob({
      jobId: job.id,
      storeOptions: opts,
      ...fixtures(),
      evaluate: async (input) => {
        if (input.candidate.iteration === 0) {
          requestSearchJobPause(job.id, opts);
        }
        return mockEval(5)(input);
      },
    });

    const paused = getSearchJob(job.id, opts)!;
    expect(paused.status).toBe("paused");
    const n = paused.checkpoint.nextIteration;
    const payload = readRunnerPayloadFromCheckpoint(paused.checkpoint)!;
    const prngBefore = payload.prng;

    saveSearchJob(
      {
        ...paused,
        status: "running",
        config: {
          ...paused.config,
          maxIterations: n + 2,
          parameterRanges: [
            {
              key: "ema_fast",
              min: 40,
              max: 10,
              step: 1,
              valueType: "integer",
            },
          ],
        },
      },
      opts,
    );

    saveSearchTrial(
      {
        jobId: job.id,
        iteration: n,
        candidateId: createStrategySearchCandidateId(job.id, n),
        generatorType: "random",
        parentCandidateIds: [],
        params: {},
        paramsHash: `invalid_${n}`,
        createdAt: new Date().toISOString(),
        score: null,
        passed: false,
        windowResults: [],
        costStressResults: [],
        jitterResults: [],
        durationMs: 0,
        failureReasons: [
          {
            code: "VALIDATION_FAILED",
            message: "invalid parameterRanges: min must be <= max",
          },
        ],
      },
      opts,
    );

    expect(getSearchJob(job.id, opts)?.checkpoint.nextIteration).toBe(n);

    const evalIterations: number[] = [];
    const resumed = await runSearchJob({
      jobId: job.id,
      storeOptions: opts,
      ...fixtures(),
      evaluate: async (input) => {
        evalIterations.push(input.candidate.iteration);
        return mockEval(1)(input);
      },
    });

    expect(evalIterations).toEqual([]);
    expect(getSearchTrial(job.id, n, opts)?.paramsHash).toBe(`invalid_${n}`);
    expect(getSearchTrial(job.id, n + 1, opts)).toBeNull();
    const afterJob = getSearchJob(job.id, opts)!;
    expect(afterJob.status).toBe("failed");
    expect(afterJob.failureMessage).toMatch(/invalid parameterRanges/);
    const after = readRunnerPayloadFromCheckpoint(afterJob.checkpoint)!;
    expect(after.prng).toEqual(prngBefore);
    expect(resumed.stopReason).toBe("failed");
    expect(afterJob.checkpoint.nextIteration).toBeLessThanOrEqual(n + 1);
  });
});
