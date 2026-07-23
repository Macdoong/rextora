import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  createSearchJob,
  createSeededRandom,
  generateRandomCandidate,
  getSearchJob,
  getSearchTrial,
  listSearchTrials,
  readRunnerPayloadFromCheckpoint,
  requestSearchJobPause,
  restoreSeededRandom,
  resumeSearchJobForRun,
  runSearchJob,
  saveSearchTrial,
  type EvaluateCompleteCandidateInput,
  type StrategySearchCompleteCandidateEvaluation,
  type StrategySearchConfig,
} from "../src/lib/rextora/strategySearch";
import { CONTEXT_FALLBACK_PARAMS } from "../src/lib/rextora/strategy/safeV44Params";

const tempRoots: string[] = [];

function makeTempRoot(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "rextora-search-resume-"));
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
    seed: 12345,
    generatorType: "random",
    maxIterations: 6,
    parameterRanges: [
      { key: "ema_fast", min: 10, max: 40, step: 1, valueType: "integer" },
      { key: "ema_mid", min: 20, max: 60, step: 1, valueType: "integer" },
      { key: "ema_slow", min: 40, max: 100, step: 1, valueType: "integer" },
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
        { key: "ema_fast", min: 10, max: 40, step: 1, valueType: "integer" as const },
      ],
    },
  };
}

function mockEval(
  score: number,
): (input: EvaluateCompleteCandidateInput) => Promise<StrategySearchCompleteCandidateEvaluation> {
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

describe("strategySearch resume", () => {
  it("resumes from checkpoint without repeating candidates or losing best/stats", async () => {
    const root = makeTempRoot();
    const opts = { rootDir: root };
    const job = createSearchJob(sampleConfig({ maxIterations: 5, seed: 777 }), opts);

    let calls = 0;
    const first = await runSearchJob({
      jobId: job.id,
      storeOptions: opts,
      ...fixtures(),
      evaluate: async (input) => {
        calls += 1;
        if (calls === 2) requestSearchJobPause(job.id, opts);
        return mockEval(calls === 1 ? 9 : 4)(input);
      },
    });
    expect(first.stopReason).toBe("paused");
    const hashesAfterPause = listSearchTrials(job.id, opts).map((t) => t.paramsHash);
    expect(hashesAfterPause.length).toBeGreaterThanOrEqual(2);
    const bestAfterPause = first.job.checkpoint.bestCandidate;
    expect(bestAfterPause?.score).toBe(9);
    const statsAfterPause = readRunnerPayloadFromCheckpoint(first.job.checkpoint)!;
    expect(statsAfterPause.statistics.evaluated).toBe(hashesAfterPause.length);
    const prngAfterPause = statsAfterPause.prng;

    resumeSearchJobForRun(job.id, opts);
    const second = await runSearchJob({
      jobId: job.id,
      storeOptions: opts,
      ...fixtures(),
      evaluate: mockEval(1),
    });
    expect(second.stopReason).toBe("max_iterations");
    expect(second.job.status).toBe("completed");

    const allTrials = listSearchTrials(job.id, opts);
    expect(allTrials).toHaveLength(5);
    const hashes = allTrials.map((t) => t.paramsHash);
    expect(new Set(hashes).size).toBe(hashes.length);
    // First trials unchanged
    for (let i = 0; i < hashesAfterPause.length; i += 1) {
      expect(getSearchTrial(job.id, i, opts)?.paramsHash).toBe(hashesAfterPause[i]);
    }
    expect(second.job.checkpoint.bestCandidate?.score).toBe(9);
    expect(second.statistics.evaluated).toBe(5);
    expect(second.statistics.generated).toBe(5);

    // Random sequence continues from checkpoint (same next candidate as fresh PRNG restore)
    const expectedNext = generateRandomCandidate({
      jobId: job.id,
      iteration: hashesAfterPause.length,
      parameterRanges: sampleConfig().parameterRanges,
      random: restoreSeededRandom(prngAfterPause),
      baseParams: CONTEXT_FALLBACK_PARAMS,
      searchVersion: "1",
    });
    expect(allTrials[hashesAfterPause.length]?.paramsHash).toBe(
      expectedNext.paramsHash,
    );
  });

  it("skips already-persisted trial when checkpoint lags (crash recovery)", async () => {
    const root = makeTempRoot();
    const opts = { rootDir: root };
    const job = createSearchJob(sampleConfig({ maxIterations: 3, seed: 55 }), opts);

    const partial = await runSearchJob({
      jobId: job.id,
      storeOptions: opts,
      ...fixtures(),
      evaluate: async (input) => {
        // Pause after first iteration completes + checkpoints
        requestSearchJobPause(job.id, opts);
        return mockEval(8)(input);
      },
    });
    expect(partial.job.status).toBe("paused");

    // Simulate: trial for next iteration written, checkpoint not advanced
    resumeSearchJobForRun(job.id, opts);
    const mid = getSearchJob(job.id, opts)!;
    const payload = readRunnerPayloadFromCheckpoint(mid.checkpoint)!;
    const rng = restoreSeededRandom(payload.prng);
    const orphan = generateRandomCandidate({
      jobId: job.id,
      iteration: mid.checkpoint.nextIteration,
      parameterRanges: mid.config.parameterRanges,
      random: rng,
      baseParams: CONTEXT_FALLBACK_PARAMS,
      searchVersion: mid.config.searchVersion,
    });
    saveSearchTrial(
      {
        jobId: job.id,
        iteration: orphan.iteration,
        candidateId: orphan.candidateId,
        params: orphan.params,
        paramsHash: orphan.paramsHash,
        generatorType: orphan.generatorType,
        parentCandidateIds: orphan.parentCandidateIds,
        score: 3,
        passed: true,
        failureReasons: [],
        windowResults: [],
        costStressResults: [],
        jitterResults: [],
        durationMs: 1,
        createdAt: new Date().toISOString(),
      },
      opts,
    );

    // Also advance the "would-be" PRNG in a forged checkpoint? Runner will regenerate
    // from checkpoint PRNG; skip path must consume orphan and not re-evaluate it.
    let evalCalls = 0;
    const finished = await runSearchJob({
      jobId: job.id,
      storeOptions: opts,
      ...fixtures(),
      evaluate: async (input) => {
        evalCalls += 1;
        return mockEval(2)(input);
      },
    });
    expect(finished.job.status).toBe("completed");
    expect(getSearchTrial(job.id, orphan.iteration, opts)?.paramsHash).toBe(
      orphan.paramsHash,
    );
    // One orphan skipped + remaining iterations evaluated; max 3 total
    expect(listSearchTrials(job.id, opts)).toHaveLength(3);
    expect(evalCalls).toBe(1); // only the last missing iteration
    expect(finished.statistics.evaluated).toBe(3);
  });

  it("deterministic full run matches split pause/resume run", async () => {
    const rootA = makeTempRoot();
    const rootB = makeTempRoot();
    const cfg = sampleConfig({ maxIterations: 4, seed: 999 });

    const continuous = await runSearchJob({
      jobId: createSearchJob(cfg, { rootDir: rootA }).id,
      storeOptions: { rootDir: rootA },
      ...fixtures(),
      evaluate: mockEval(5),
    });

    const jobB = createSearchJob(cfg, { rootDir: rootB });
    let calls = 0;
    await runSearchJob({
      jobId: jobB.id,
      storeOptions: { rootDir: rootB },
      ...fixtures(),
      evaluate: async (input) => {
        calls += 1;
        if (calls === 2) requestSearchJobPause(jobB.id, { rootDir: rootB });
        return mockEval(5)(input);
      },
    });
    resumeSearchJobForRun(jobB.id, { rootDir: rootB });
    const resumed = await runSearchJob({
      jobId: jobB.id,
      storeOptions: { rootDir: rootB },
      ...fixtures(),
      evaluate: mockEval(5),
    });

    const hashesA = listSearchTrials(continuous.job.id, {
      rootDir: rootA,
    }).map((t) => t.paramsHash);
    const hashesB = listSearchTrials(jobB.id, { rootDir: rootB }).map(
      (t) => t.paramsHash,
    );
    expect(hashesB).toEqual(hashesA);
    expect(resumed.statistics.bestScore).toBe(continuous.statistics.bestScore);
    expect(resumed.job.checkpoint.bestCandidate).toMatchObject({
      iteration: continuous.job.checkpoint.bestCandidate?.iteration,
      paramsHash: continuous.job.checkpoint.bestCandidate?.paramsHash,
      score: continuous.job.checkpoint.bestCandidate?.score,
      passed: continuous.job.checkpoint.bestCandidate?.passed,
    });
  });
});
