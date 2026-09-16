/**
 * P1-E3: repeatedSignatureThreshold enforcement.
 * Temp stores only — no production strategy-search data.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CONTEXT_FALLBACK_PARAMS } from "../src/lib/rextora/strategy/safeV44Params";
import * as candidateGenerator from "../src/lib/rextora/strategySearch/candidateGenerator";
import {
  StrategySearchGenerationError,
  buildRepeatedGenerationErrorFingerprint,
  classifyEngineError,
  createEmptySearchPlan,
  createSearchJob,
  decodeRunnerCheckpointPayload,
  encodeRunnerCheckpointPayload,
  getSearchJob,
  getSearchPlan,
  listSearchTrials,
  readRunnerPayloadFromCheckpoint,
  requestSearchJobPause,
  resumeSearchJobForRun,
  runSearchJob,
  saveSearchPlan,
  updateSearchCheckpoint,
  type EvaluateCompleteCandidateInput,
  type StrategySearchCompleteCandidateEvaluation,
  type StrategySearchConfig,
  type StrategySearchStoreOptions,
} from "../src/lib/rextora/strategySearch";
import {
  buildPersistedCheckpoint,
  createInitialRunnerPayload,
} from "../src/lib/rextora/strategySearch/jobCheckpoint";
import { createSeededRandom } from "../src/lib/rextora/strategySearch/random";

const roots: string[] = [];

function tempStore(): StrategySearchStoreOptions {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "rextora-p1e3-"));
  roots.push(rootDir);
  return { rootDir };
}

afterEach(() => {
  vi.restoreAllMocks();
  while (roots.length) {
    const root = roots.pop();
    if (root) fs.rmSync(root, { recursive: true, force: true });
  }
});

function sampleConfig(
  overrides: Partial<StrategySearchConfig> = {},
): StrategySearchConfig {
  return {
    searchVersion: "1",
    strategyTemplateId: "p1e3",
    symbols: ["BTCUSDT"],
    timeframe: "15m",
    dataVersion: "test",
    seed: 42,
    generatorType: "random",
    maxIterations: 10,
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
    passCriteria: { minTradeCount: 1 },
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

function mockEval(
  passed = true,
): (
  input: EvaluateCompleteCandidateInput,
) => Promise<StrategySearchCompleteCandidateEvaluation> {
  return async (input) => {
    const score = passed ? 1 : 0;
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
        passed,
        requiredWindowCount: 1,
        passedRequiredWindowCount: passed ? 1 : 0,
        failedRequiredWindowCount: passed ? 0 : 1,
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
      finalPassed: passed,
      startedAt: "2024-01-01T00:00:00.000Z",
      completedAt: "2024-01-01T00:00:01.000Z",
      durationMs: 1,
    };
  };
}

function attachPlan(
  jobId: string,
  store: StrategySearchStoreOptions,
  threshold: number | null = 25,
) {
  saveSearchPlan(
    jobId,
    createEmptySearchPlan({
      searchName: "p1e3",
      depthProfile: "fast",
      qualificationProfile: "balanced",
      qualifiedTarget: 1,
      candidateBudget: 40,
      stageBatchSize: 8,
      maxRuntimeMs: null,
      spaces: [{ id: "ema_core", labelKo: "EMA" }],
      repeatedSignatureThreshold: threshold,
    }),
    store,
  );
}

function invalidTrials(jobId: string, store: StrategySearchStoreOptions) {
  return listSearchTrials(jobId, store).filter((t) =>
    t.paramsHash.startsWith("invalid_"),
  );
}

function recoverableA(message = "candidate validation failed: OUT_OF_RANGE") {
  return new StrategySearchGenerationError("VALIDATION_FAILED", message);
}

function recoverableB() {
  return new Error("nextInt minInclusive must be <= maxInclusive");
}

describe("repeatedSignatureThreshold (P1-E3)", () => {
  it("defaults to 25 and survives plan creation/persistence", () => {
    const store = tempStore();
    const job = createSearchJob(sampleConfig(), store);
    const plan = createEmptySearchPlan({
      searchName: "p1e3-default",
      depthProfile: "fast",
      qualificationProfile: "balanced",
      qualifiedTarget: 1,
      candidateBudget: 8,
      stageBatchSize: 4,
      maxRuntimeMs: null,
      spaces: [{ id: "ema_core", labelKo: "EMA" }],
    });
    expect(plan.repeatedSignatureThreshold).toBe(25);
    saveSearchPlan(job.id, plan, store);
    expect(getSearchPlan(job.id, store)?.repeatedSignatureThreshold).toBe(25);
  });

  it("uses a stable structured fingerprint without raw messages", () => {
    const first = classifyEngineError(
      recoverableA("candidate validation failed: OUT_OF_RANGE at candle 12"),
      "candidate_generation",
    );
    const second = classifyEngineError(
      recoverableA("candidate validation failed: OUT_OF_RANGE at candle 99"),
      "candidate_generation",
    );
    const other = classifyEngineError(recoverableB(), "candidate_generation");
    const fpA = buildRepeatedGenerationErrorFingerprint(first);
    const fpB = buildRepeatedGenerationErrorFingerprint(second);
    const fpOther = buildRepeatedGenerationErrorFingerprint(other);
    expect(fpA).toBe("VALIDATION_FAILED|candidate_invalid");
    expect(fpA).toBe(fpB);
    expect(fpA).not.toMatch(/candle|12|99|OUT_OF_RANGE at/);
    expect(fpOther).toBe("PARAMETER_OUT_OF_RANGE|parameter_out_of_range");
    expect(fpOther).not.toBe(fpA);
  });

  it("does not pause one below threshold and pauses on the Nth identical occurrence", async () => {
    const store = tempStore();
    const job = createSearchJob(sampleConfig({ maxIterations: 2 }), store);
    attachPlan(job.id, store, 3);
    vi.spyOn(candidateGenerator, "generateUniqueCandidate").mockImplementation(
      () => {
        throw recoverableA();
      },
    );

    const below = await runSearchJob({
      jobId: job.id,
      storeOptions: store,
      ...fixtures(),
      baseParams: CONTEXT_FALLBACK_PARAMS,
      evaluate: mockEval(),
    });
    expect(below.stopReason).toBe("max_iterations");
    expect(below.job.status).toBe("completed");
    expect(invalidTrials(job.id, store)).toHaveLength(2);
    expect(
      readRunnerPayloadFromCheckpoint(below.job.checkpoint)
        ?.repeatedErrorSignatures?.["VALIDATION_FAILED|candidate_invalid"],
    ).toBe(2);
  });

  it("pauses on the threshold occurrence and does not write the next invalid_*", async () => {
    const store = tempStore();
    const job = createSearchJob(sampleConfig({ maxIterations: 10 }), store);
    attachPlan(job.id, store, 3);
    vi.spyOn(candidateGenerator, "generateUniqueCandidate").mockImplementation(
      () => {
        throw recoverableA();
      },
    );

    const result = await runSearchJob({
      jobId: job.id,
      storeOptions: store,
      ...fixtures(),
      baseParams: CONTEXT_FALLBACK_PARAMS,
      evaluate: mockEval(),
    });
    expect(result.stopReason).toBe("paused");
    expect(result.job.status).toBe("paused");
    const trials = invalidTrials(job.id, store);
    expect(trials).toHaveLength(3);
    expect(trials.map((t) => t.paramsHash)).toEqual([
      "invalid_0",
      "invalid_1",
      "invalid_2",
    ]);
    expect(listSearchTrials(job.id, store).some((t) => t.paramsHash === "invalid_3")).toBe(
      false,
    );
    const payload = readRunnerPayloadFromCheckpoint(result.job.checkpoint);
    expect(payload?.stopReason).toBe("repeated_signature_auto_pause");
    expect(payload?.jobStatus).toBe("paused");
    expect(payload?.repeatedErrorSignatures).toEqual({
      "VALIDATION_FAILED|candidate_invalid": 3,
    });
    expect(getSearchPlan(job.id, store)?.completionReason).not.toBe(
      "CONFIGURATION_INVALID",
    );
  });

  it("does not fragment one fingerprint when raw messages vary", async () => {
    const store = tempStore();
    const job = createSearchJob(sampleConfig({ maxIterations: 10 }), store);
    attachPlan(job.id, store, 2);
    let n = 0;
    vi.spyOn(candidateGenerator, "generateUniqueCandidate").mockImplementation(
      () => {
        n += 1;
        throw new Error(
          `nextInt minInclusive must be <= maxInclusive at candle ${n * 17}`,
        );
      },
    );

    const result = await runSearchJob({
      jobId: job.id,
      storeOptions: store,
      ...fixtures(),
      baseParams: CONTEXT_FALLBACK_PARAMS,
      evaluate: mockEval(),
    });
    expect(result.stopReason).toBe("paused");
    const payload = readRunnerPayloadFromCheckpoint(result.job.checkpoint);
    expect(payload?.repeatedErrorSignatures).toEqual({
      "PARAMETER_OUT_OF_RANGE|parameter_out_of_range": 2,
    });
    expect(invalidTrials(job.id, store)).toHaveLength(2);
  });

  it("counts different fingerprints independently and does not reset A on B", async () => {
    const store = tempStore();
    const job = createSearchJob(sampleConfig({ maxIterations: 10 }), store);
    attachPlan(job.id, store, 3);
    let n = 0;
    vi.spyOn(candidateGenerator, "generateUniqueCandidate").mockImplementation(
      () => {
        n += 1;
        if (n === 3) throw recoverableB();
        throw recoverableA();
      },
    );

    const result = await runSearchJob({
      jobId: job.id,
      storeOptions: store,
      ...fixtures(),
      baseParams: CONTEXT_FALLBACK_PARAMS,
      evaluate: mockEval(),
    });
    expect(result.stopReason).toBe("paused");
    expect(invalidTrials(job.id, store)).toHaveLength(4);
    expect(
      readRunnerPayloadFromCheckpoint(result.job.checkpoint)
        ?.repeatedErrorSignatures,
    ).toEqual({
      "PARAMETER_OUT_OF_RANGE|parameter_out_of_range": 1,
      "VALIDATION_FAILED|candidate_invalid": 3,
    });
  });

  it("preserves counts across process restart and pause/resume", async () => {
    const store = tempStore();
    const job = createSearchJob(sampleConfig({ maxIterations: 20 }), store);
    attachPlan(job.id, store, 3);
    let n = 0;
    vi.spyOn(candidateGenerator, "generateUniqueCandidate").mockImplementation(
      () => {
        n += 1;
        if (n === 2) requestSearchJobPause(job.id, store);
        throw recoverableA();
      },
    );

    const first = await runSearchJob({
      jobId: job.id,
      storeOptions: store,
      ...fixtures(),
      baseParams: CONTEXT_FALLBACK_PARAMS,
      evaluate: mockEval(),
    });
    expect(first.stopReason).toBe("paused");
    expect(first.job.status).toBe("paused");
    expect(invalidTrials(job.id, store)).toHaveLength(2);
    expect(
      readRunnerPayloadFromCheckpoint(first.job.checkpoint)
        ?.repeatedErrorSignatures?.["VALIDATION_FAILED|candidate_invalid"],
    ).toBe(2);

    resumeSearchJobForRun(job.id, store);
    const second = await runSearchJob({
      jobId: job.id,
      storeOptions: store,
      ...fixtures(),
      baseParams: CONTEXT_FALLBACK_PARAMS,
      evaluate: mockEval(),
    });
    expect(second.stopReason).toBe("paused");
    expect(second.job.status).toBe("paused");
    expect(invalidTrials(job.id, store)).toHaveLength(3);
    const payload = readRunnerPayloadFromCheckpoint(
      getSearchJob(job.id, store)!.checkpoint,
    );
    expect(payload?.stopReason).toBe("repeated_signature_auto_pause");
    expect(payload?.repeatedErrorSignatures).toEqual({
      "VALIDATION_FAILED|candidate_invalid": 3,
    });
  });

  it("preserves cumulative counts across a successful generation boundary", async () => {
    const store = tempStore();
    const job = createSearchJob(sampleConfig({ maxIterations: 3 }), store);
    attachPlan(job.id, store, 3);
    const original = candidateGenerator.generateUniqueCandidate;
    let n = 0;
    vi.spyOn(candidateGenerator, "generateUniqueCandidate").mockImplementation(
      (input) => {
        n += 1;
        if (n === 2) return original(input);
        throw recoverableA();
      },
    );

    const result = await runSearchJob({
      jobId: job.id,
      storeOptions: store,
      ...fixtures(),
      baseParams: CONTEXT_FALLBACK_PARAMS,
      evaluate: mockEval(),
    });
    expect(result.stopReason).toBe("max_iterations");
    expect(result.job.status).toBe("completed");
    expect(invalidTrials(job.id, store)).toHaveLength(2);
    expect(
      readRunnerPayloadFromCheckpoint(result.job.checkpoint)
        ?.repeatedErrorSignatures,
    ).toEqual({
      "VALIDATION_FAILED|candidate_invalid": 2,
    });
  });

  it("CONFIGURATION_INVALID bypasses the threshold and fails immediately", async () => {
    const store = tempStore();
    const job = createSearchJob(
      sampleConfig({
        maxIterations: 10,
        parameterRanges: [
          {
            key: "penetrationPct",
            min: 0.5,
            max: 0.45,
            step: 0.05,
            valueType: "float",
          },
        ],
      }),
      store,
    );
    attachPlan(job.id, store, 1);

    const result = await runSearchJob({
      jobId: job.id,
      storeOptions: store,
      ...fixtures(),
      baseParams: CONTEXT_FALLBACK_PARAMS,
      evaluate: mockEval(),
    });
    expect(result.stopReason).toBe("failed");
    expect(result.job.status).toBe("failed");
    expect(result.job.failureMessage).toMatch(/invalid parameterRanges/);
    expect(invalidTrials(job.id, store)).toHaveLength(0);
    expect(getSearchPlan(job.id, store)?.completionReason).toBe(
      "CONFIGURATION_INVALID",
    );
    expect(
      readRunnerPayloadFromCheckpoint(result.job.checkpoint)?.stopReason,
    ).not.toBe("repeated_signature_auto_pause");
  });

  it("qualification-gate failures do not count toward the threshold", async () => {
    const store = tempStore();
    const job = createSearchJob(sampleConfig({ maxIterations: 2 }), store);
    attachPlan(job.id, store, 1);

    const result = await runSearchJob({
      jobId: job.id,
      storeOptions: store,
      ...fixtures(),
      baseParams: CONTEXT_FALLBACK_PARAMS,
      evaluate: mockEval(false),
    });
    expect(result.stopReason).toBe("max_iterations");
    expect(result.job.status).toBe("completed");
    expect(invalidTrials(job.id, store)).toHaveLength(0);
    const payload = readRunnerPayloadFromCheckpoint(result.job.checkpoint);
    expect(payload?.repeatedErrorSignatures ?? {}).toEqual({});
    expect(
      listSearchTrials(job.id, store).every((t) =>
        t.failureReasons.some((r) => r.code === "EVALUATION_FAILED_GATES"),
      ),
    ).toBe(true);
  });

  it("duplicate/search-space exhaustion does not count as a repeated signature", async () => {
    const store = tempStore();
    const job = createSearchJob(
      sampleConfig({
        maxIterations: 8,
        parameterRanges: [
          { key: "ema_fast", min: 12, max: 12, step: 1, valueType: "integer" },
        ],
      }),
      store,
    );
    attachPlan(job.id, store, 1);

    const result = await runSearchJob({
      jobId: job.id,
      storeOptions: store,
      ...fixtures(),
      baseParams: CONTEXT_FALLBACK_PARAMS,
      evaluate: mockEval(),
    });
    expect(result.stopReason).toBe("search_space_exhausted");
    expect(result.job.status).toBe("completed");
    expect(invalidTrials(job.id, store)).toHaveLength(0);
    expect(
      readRunnerPayloadFromCheckpoint(result.job.checkpoint)?.stopReason,
    ).toBe("search_space_exhausted");
    expect(
      readRunnerPayloadFromCheckpoint(result.job.checkpoint)
        ?.repeatedErrorSignatures ?? {},
    ).toEqual({});
  });

  it("valid search does not auto-pause from the signature threshold", async () => {
    const store = tempStore();
    const job = createSearchJob(sampleConfig({ maxIterations: 3 }), store);
    attachPlan(job.id, store, 1);

    const result = await runSearchJob({
      jobId: job.id,
      storeOptions: store,
      ...fixtures(),
      baseParams: CONTEXT_FALLBACK_PARAMS,
      evaluate: mockEval(),
    });
    expect(result.stopReason).toBe("max_iterations");
    expect(result.job.status).toBe("completed");
    expect(invalidTrials(job.id, store)).toHaveLength(0);
    expect(
      readRunnerPayloadFromCheckpoint(result.job.checkpoint)?.stopReason,
    ).not.toBe("repeated_signature_auto_pause");
  });

  it("loads an old checkpoint without repeatedErrorSignatures as empty state", async () => {
    const store = tempStore();
    const job = createSearchJob(sampleConfig({ maxIterations: 10 }), store);
    attachPlan(job.id, store, 2);
    const legacyPayload = createInitialRunnerPayload({
      prng: createSeededRandom(job.config.seed).getState(),
      jobStatus: "queued",
    });
    expect(legacyPayload).not.toHaveProperty("repeatedErrorSignatures");
    const encoded = encodeRunnerCheckpointPayload(legacyPayload);
    expect(encoded).not.toContain("repeatedErrorSignatures");
    expect(decodeRunnerCheckpointPayload(encoded)).not.toHaveProperty(
      "repeatedErrorSignatures",
    );

    updateSearchCheckpoint(
      job.id,
      buildPersistedCheckpoint({
        completedIterations: 0,
        nextIteration: 0,
        payload: legacyPayload,
        bestCandidate: null,
        bestPassedCandidate: null,
        updatedAt: "2026-08-11T00:00:00.000Z",
      }),
      store,
    );

    vi.spyOn(candidateGenerator, "generateUniqueCandidate").mockImplementation(
      () => {
        throw recoverableA();
      },
    );
    const result = await runSearchJob({
      jobId: job.id,
      storeOptions: store,
      ...fixtures(),
      baseParams: CONTEXT_FALLBACK_PARAMS,
      evaluate: mockEval(),
    });
    expect(result.stopReason).toBe("paused");
    expect(invalidTrials(job.id, store)).toHaveLength(2);
    expect(
      readRunnerPayloadFromCheckpoint(result.job.checkpoint)
        ?.repeatedErrorSignatures,
    ).toEqual({
      "VALIDATION_FAILED|candidate_invalid": 2,
    });
  });
});
