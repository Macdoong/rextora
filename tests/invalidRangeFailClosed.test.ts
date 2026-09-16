/**
 * P1-D2 persist-gate and runner fail-closed for invalid parameterRanges.
 * Temp stores only — no production strategy-search data.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { CONTEXT_FALLBACK_PARAMS } from "../src/lib/rextora/strategy/safeV44Params";
import {
  StrategySearchGenerationError,
  classifyEngineError,
  isInvalidParameterRangesError,
  isRecoverableGenerationError,
} from "../src/lib/rextora/strategySearch";
import {
  isJobExecutionOwnedOnDisk,
  resetJobExecutionOwnershipForTests,
} from "../src/lib/rextora/strategySearch/jobExecutionOwnership";
import { saveJobExecutionProfile } from "../src/lib/rextora/strategySearch/jobExecutionProfile";
import {
  isSearchJobExecutionActive,
  resetSearchJobExecutionRegistryForTests,
  startSearchJobExecution,
  waitForSearchJobExecution,
} from "../src/lib/rextora/strategySearch/jobExecutionRegistry";
import {
  createSearchJob,
  getSearchJob,
  listSearchTrials,
  markSearchJobRunning,
  type StrategySearchStoreOptions,
} from "../src/lib/rextora/strategySearch/jobStore";
import { generateRandomCandidate } from "../src/lib/rextora/strategySearch/candidateGenerator";
import {
  applyPatternOperatorConfigToRanges,
  patternConfigFromPlanFields,
} from "../src/lib/rextora/strategySearch/patternSearchConfig";
import {
  FVG_BASE_PARAMS,
  fvgSearchRanges,
} from "../src/lib/rextora/strategySearch/patternSearchSpaces";
import { createSeededRandom } from "../src/lib/rextora/strategySearch/random";
import { runOrchestratedSearchJob } from "../src/lib/rextora/strategySearch/searchOrchestrator";
import {
  createEmptySearchPlan,
  getSearchPlan,
  saveSearchPlan,
} from "../src/lib/rextora/strategySearch/searchPlan";
import { runSearchJob } from "../src/lib/rextora/strategySearch/jobRunner";
import { resolveTerminationReason } from "../src/lib/rextora/strategySearch/terminationReason";
import type {
  EvaluateCompleteCandidateInput,
  StrategySearchCompleteCandidateEvaluation,
  StrategySearchConfig,
} from "../src/lib/rextora/strategySearch/types";

const roots: string[] = [];

function tempStore(): StrategySearchStoreOptions {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "rextora-p1d2-"));
  roots.push(rootDir);
  return { rootDir };
}

afterEach(() => {
  resetSearchJobExecutionRegistryForTests();
  while (roots.length) {
    const root = roots.pop();
    if (root) {
      resetJobExecutionOwnershipForTests({ rootDir: root });
      fs.rmSync(root, { recursive: true, force: true });
    }
  }
});

function baseConfig(
  overrides: Partial<StrategySearchConfig> = {},
): StrategySearchConfig {
  return {
    searchVersion: "1",
    strategyTemplateId: "p1d2_range_safety",
    symbols: ["BTCUSDT"],
    timeframe: "15m",
    dataVersion: "test-v1",
    seed: 17,
    generatorType: "random",
    maxIterations: 8,
    parameterRanges: [
      { key: "ema_fast", min: 10, max: 40, step: 1, valueType: "integer" },
    ],
    evaluationWindows: [
      {
        id: "w1",
        label: "w1",
        fromOpenTime: 0,
        toOpenTime: 1,
        requiredForPass: true,
      },
    ],
    passCriteria: {
      minTradeCount: 1,
      requireAllWindowsPass: false,
    },
    costStress: { enabled: false, multipliers: [] },
    jitter: { enabled: false, samples: 0, relativeAmplitude: 0 },
    ...overrides,
  };
}

function fixtures() {
  return {
    windows: [
      {
        id: "w1",
        label: "w1",
        requestedFrom: 0,
        requestedTo: 1,
        requiredForPass: true,
      },
    ],
    balance: 10_000,
    baseCostConfig: {
      feeRate: 0,
      slippageRate: 0,
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
    costStressScenarios: [] as const,
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
    },
  };
}

function mockEval(): (
  input: EvaluateCompleteCandidateInput,
) => Promise<StrategySearchCompleteCandidateEvaluation> {
  return async (input) => {
    const score = 1;
    return {
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
    };
  };
}

function executionProfile() {
  return {
    version: 1 as const,
    balance: 10_000,
    baseCostConfig: fixtures().baseCostConfig,
    passPolicy: fixtures().passPolicy,
    scoreWeights: fixtures().scoreWeights,
    costStressScenarios: [],
    jitterConfig: fixtures().jitterConfig,
    dataRef: { availableFrom: 0, availableTo: 1, source: "preloaded" as const },
  };
}

function invalidCount(jobId: string, store: StrategySearchStoreOptions): number {
  return listSearchTrials(jobId, store).filter((t) =>
    t.paramsHash.startsWith("invalid_"),
  ).length;
}

describe("P1-D2 invalid-range fail-closed", () => {
  it("classifies range-level CONFIGURATION_INVALID as fatal and keeps candidate VALIDATION_FAILED recoverable", () => {
    const configErr = new StrategySearchGenerationError(
      "CONFIGURATION_INVALID",
      "invalid parameterRanges: min must be <= max",
    );
    expect(isInvalidParameterRangesError(configErr)).toBe(true);
    expect(isRecoverableGenerationError(configErr)).toBe(false);
    const classified = classifyEngineError(configErr, "candidate_generation");
    expect(classified.fatal).toBe(true);
    expect(classified.code).toBe("CONFIGURATION_INVALID");

    const candidateErr = new StrategySearchGenerationError(
      "VALIDATION_FAILED",
      "candidate validation failed: OUT_OF_RANGE",
    );
    expect(isRecoverableGenerationError(candidateErr)).toBe(true);
    expect(classifyEngineError(candidateErr, "candidate_generation").fatal).toBe(
      false,
    );
  });

  it("does not persist inverted mutated ranges into job.config and fails CONFIGURATION_INVALID", async () => {
    const store = tempStore();
    const validRanges = [
      { key: "ema_fast", min: 10, max: 40, step: 1, valueType: "integer" as const },
    ];
    const job = createSearchJob(baseConfig({ parameterRanges: validRanges }), store);
    markSearchJobRunning(job.id, store);
    saveSearchPlan(
      job.id,
      {
        ...createEmptySearchPlan({
          searchName: "p1d2-persist",
          depthProfile: "fast",
          qualificationProfile: "balanced",
          qualifiedTarget: 1,
          candidateBudget: 40,
          stageBatchSize: 8,
          maxRuntimeMs: null,
          spaces: [{ id: "ema_core", labelKo: "EMA 추세" }],
        }),
        mutatedParameterRanges: [
          {
            key: "ema_fast",
            min: 40,
            max: 10,
            step: 1,
            valueType: "integer",
          },
        ],
      },
      store,
    );

    const result = await runOrchestratedSearchJob({
      jobId: job.id,
      storeOptions: store,
      ...fixtures(),
      evaluate: mockEval(),
      preloadedCandlesByKey: {},
    });

    expect(result.finalStopReason).toBe("CONFIGURATION_INVALID");
    const persisted = getSearchJob(job.id, store)!;
    expect(persisted.config.parameterRanges).toEqual(validRanges);
    expect(persisted.status).toBe("failed");
    expect(persisted.failureMessage).toMatch(/invalid parameterRanges/);
    expect(getSearchPlan(job.id, store)?.completionReason).toBe(
      "CONFIGURATION_INVALID",
    );
    expect(
      resolveTerminationReason({
        status: persisted.status,
        completionReason: getSearchPlan(job.id, store)?.completionReason,
        failureMessage: persisted.failureMessage,
      }),
    ).toBe("CONFIGURATION_INVALID");
    expect(invalidCount(job.id, store)).toBeLessThanOrEqual(1);
  });

  it("runner terminates on inverted parameterRanges without an invalid_* loop", async () => {
    const store = tempStore();
    const job = createSearchJob(
      baseConfig({
        maxIterations: 40,
        parameterRanges: [
          {
            key: "penetrationPct",
            min: 0.4999999999927325,
            max: 0.45000000000726753,
            step: 0.05,
            valueType: "float",
          },
        ],
      }),
      store,
    );

    const evals: number[] = [];
    const result = await runSearchJob({
      jobId: job.id,
      storeOptions: store,
      ...fixtures(),
      baseParams: CONTEXT_FALLBACK_PARAMS,
      evaluate: async (input) => {
        evals.push(input.candidate.iteration);
        return mockEval()(input);
      },
    });

    expect(result.stopReason).toBe("failed");
    expect(result.job.status).toBe("failed");
    expect(result.job.failureMessage).toMatch(/invalid parameterRanges/);
    expect(evals).toEqual([]);
    expect(invalidCount(job.id, store)).toBeLessThanOrEqual(1);
    expect(result.job.checkpoint.nextIteration).toBeLessThanOrEqual(1);
    expect(
      resolveTerminationReason({
        status: result.job.status,
        completionReason: getSearchPlan(job.id, store)?.completionReason,
        failureMessage: result.job.failureMessage,
      }),
    ).toBe("CONFIGURATION_INVALID");
  });

  it("startSearchJobExecution fail-closed leaves no active worker or owner", async () => {
    const store = tempStore();
    const job = createSearchJob(
      baseConfig({
        maxIterations: 20,
        parameterRanges: [
          { key: "ema_fast", min: 10, max: 40, step: 1, valueType: "integer" },
        ],
      }),
      store,
    );
    saveJobExecutionProfile(job.id, executionProfile(), store);
    saveSearchPlan(
      job.id,
      {
        ...createEmptySearchPlan({
          searchName: "p1d2-worker",
          depthProfile: "fast",
          qualificationProfile: "balanced",
          qualifiedTarget: 1,
          candidateBudget: 20,
          stageBatchSize: 8,
          maxRuntimeMs: null,
          spaces: [{ id: "ema_core", labelKo: "EMA 추세" }],
        }),
        mutatedParameterRanges: [
          {
            key: "ema_fast",
            min: 40,
            max: 10,
            step: 1,
            valueType: "integer",
          },
        ],
      },
      store,
    );

    startSearchJobExecution(job.id, {
      storeOptions: store,
      preloadedCandlesByKey: {},
      evaluate: mockEval(),
    });
    await waitForSearchJobExecution(job.id);

    const failed = getSearchJob(job.id, store)!;
    expect(failed.status).toBe("failed");
    expect(getSearchPlan(job.id, store)?.completionReason).toBe(
      "CONFIGURATION_INVALID",
    );
    expect(isSearchJobExecutionActive(job.id)).toBe(false);
    expect(isJobExecutionOwnedOnDisk(job.id, store)).toBe(false);
    expect(invalidCount(job.id, store)).toBeLessThanOrEqual(1);
  });

  it("valid overlay still generates and a valid search completes normally", async () => {
    const config = patternConfigFromPlanFields({
      patternConfigLevel: "basic",
      patternRetestMode: "required",
      patternConfirmStrength: "standard",
      patternStrength: "standard",
    });
    const overlayed = applyPatternOperatorConfigToRanges(
      fvgSearchRanges(),
      config,
    );
    const pen = overlayed.find((r) => r.key === "penetrationPct")!;
    expect((pen.min as number) <= (pen.max as number)).toBe(true);
    const generated = generateRandomCandidate({
      jobId: "search_00000000-0000-4000-8000-0000000000d2",
      iteration: 0,
      parameterRanges: overlayed,
      random: createSeededRandom(7),
      baseParams: { ...FVG_BASE_PARAMS },
      searchVersion: "1",
    });
    expect(generated.paramsHash).toBeTruthy();

    const store = tempStore();
    const job = createSearchJob(baseConfig({ maxIterations: 2 }), store);
    const result = await runSearchJob({
      jobId: job.id,
      storeOptions: store,
      ...fixtures(),
      evaluate: mockEval(),
    });
    expect(result.stopReason).not.toBe("failed");
    expect(result.job.status).toBe("completed");
    expect(invalidCount(job.id, store)).toBe(0);
    expect(result.iterationsCompletedThisRun).toBeGreaterThan(0);
  });
});
