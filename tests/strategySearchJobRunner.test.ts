import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  StrategySearchJobRunnerError,
  StrategySearchJobStateError,
  assertJobStateTransition,
  canTransitionJobState,
  createSearchJob,
  getSearchJob,
  getSearchTrial,
  isTerminalJobStatus,
  listSearchTrials,
  readRunnerPayloadFromCheckpoint,
  requestSearchJobCancel,
  requestSearchJobPause,
  resumeSearchJobForRun,
  runSearchJob,
  toJobStateLabel,
  type StrategySearchCompleteCandidateEvaluation,
  type StrategySearchConfig,
  type EvaluateCompleteCandidateInput,
} from "../src/lib/rextora/strategySearch";

const tempRoots: string[] = [];

function makeTempRoot(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "rextora-search-run-"));
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
    maxIterations: 5,
    parameterRanges: [
      { key: "ema_fast", min: 10, max: 40, step: 1, valueType: "integer" },
      { key: "ema_mid", min: 20, max: 60, step: 1, valueType: "integer" },
    ],
    evaluationWindows: [
      {
        id: "w1",
        label: "recent",
        fromOpenTime: 1_700_000_000_000,
        toOpenTime: 1_700_100_000_000,
      },
    ],
    passCriteria: { minTradeCount: 1, requireAllWindowsPass: true },
    costStress: { enabled: false, multipliers: [1] },
    jitter: { enabled: false, samples: 0, relativeAmplitude: 0 },
    ...overrides,
  };
}

function evalFixtures() {
  return {
    windows: [
      {
        id: "w1",
        label: "recent",
        requestedFrom: 1_700_000_000_000,
        requestedTo: 1_700_100_000_000,
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
  scoreFor: (input: EvaluateCompleteCandidateInput, call: number) => number,
  options?: { failCalls?: Set<number>; passScore?: number },
): (input: EvaluateCompleteCandidateInput) => Promise<StrategySearchCompleteCandidateEvaluation> {
  let call = 0;
  return async (input) => {
    call += 1;
    if (options?.failCalls?.has(call)) {
      throw new Error(`eval boom #${call}`);
    }
    const score = scoreFor(input, call);
    const passed = score >= (options?.passScore ?? 0);
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
        weights: evalFixtures().scoreWeights,
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

describe("strategySearch jobState transitions", () => {
  it("maps conceptual labels onto persisted statuses", () => {
    expect(toJobStateLabel("queued")).toBe("CREATED");
    expect(toJobStateLabel("running")).toBe("RUNNING");
    expect(toJobStateLabel("paused")).toBe("PAUSED");
    expect(toJobStateLabel("cancel_requested")).toBe("CANCELLING");
    expect(toJobStateLabel("cancelled")).toBe("CANCELLED");
    expect(toJobStateLabel("completed")).toBe("COMPLETED");
    expect(toJobStateLabel("failed")).toBe("FAILED");
  });

  it("allows valid transitions and rejects invalid ones", () => {
    expect(canTransitionJobState("queued", "running")).toBe(true);
    expect(canTransitionJobState("running", "completed")).toBe(true);
    expect(canTransitionJobState("running", "pause_requested")).toBe(true);
    expect(canTransitionJobState("paused", "queued")).toBe(true);
    expect(canTransitionJobState("completed", "running")).toBe(false);
    expect(canTransitionJobState("queued", "completed")).toBe(false);
    expect(() => assertJobStateTransition("failed", "running")).toThrow(
      StrategySearchJobStateError,
    );
    expect(isTerminalJobStatus("completed")).toBe(true);
    expect(isTerminalJobStatus("running")).toBe(false);
  });
});

describe("strategySearch jobRunner", () => {
  it("runs full execution until maxIterations", async () => {
    const root = makeTempRoot();
    const opts = { rootDir: root };
    const job = createSearchJob(sampleConfig({ maxIterations: 3 }), opts);
    const scores = [1, 5, 3];
    const result = await runSearchJob({
      jobId: job.id,
      storeOptions: opts,
      ...evalFixtures(),
      evaluate: mockEval((_i, call) => scores[call - 1]!),
    });
    expect(result.stopReason).toBe("max_iterations");
    expect(result.job.status).toBe("completed");
    expect(result.statistics.generated).toBe(3);
    expect(result.statistics.evaluated).toBe(3);
    expect(result.statistics.bestScore).toBe(5);
    expect(listSearchTrials(job.id, opts)).toHaveLength(3);
    expect(result.job.checkpoint.bestCandidate?.score).toBe(5);
    expect(result.job.checkpoint.completedIterations).toBe(3);
  });

  it("never overwrites best candidate with a worse score", async () => {
    const root = makeTempRoot();
    const opts = { rootDir: root };
    const job = createSearchJob(sampleConfig({ maxIterations: 3 }), opts);
    const result = await runSearchJob({
      jobId: job.id,
      storeOptions: opts,
      ...evalFixtures(),
      evaluate: mockEval((_i, call) => [10, 2, 7][call - 1]!),
    });
    expect(result.job.checkpoint.bestCandidate?.score).toBe(10);
    expect(result.statistics.bestScore).toBe(10);
  });

  it("recovers from candidate evaluation failures and continues", async () => {
    const root = makeTempRoot();
    const opts = { rootDir: root };
    const job = createSearchJob(sampleConfig({ maxIterations: 3 }), opts);
    const result = await runSearchJob({
      jobId: job.id,
      storeOptions: opts,
      ...evalFixtures(),
      evaluate: mockEval((_i, call) => 4, { failCalls: new Set([2]) }),
    });
    expect(result.job.status).toBe("completed");
    expect(result.statistics.errors).toBe(1);
    expect(result.statistics.evaluated).toBe(3);
    expect(result.statistics.failed).toBeGreaterThanOrEqual(1);
    const trial1 = getSearchTrial(job.id, 1, opts);
    expect(trial1?.failureReasons[0]?.code).toBeTruthy();
  });

  it("stops on cancellation", async () => {
    const root = makeTempRoot();
    const opts = { rootDir: root };
    const job = createSearchJob(sampleConfig({ maxIterations: 20 }), opts);
    let calls = 0;
    const result = await runSearchJob({
      jobId: job.id,
      storeOptions: opts,
      ...evalFixtures(),
      evaluate: async (input) => {
        calls += 1;
        if (calls === 2) {
          requestSearchJobCancel(job.id, opts);
        }
        return mockEval(() => 1)(input);
      },
    });
    expect(result.stopReason).toBe("cancelled");
    expect(result.job.status).toBe("cancelled");
    expect(result.iterationsCompletedThisRun).toBeGreaterThanOrEqual(2);
  });

  it("pauses cooperatively and leaves job paused", async () => {
    const root = makeTempRoot();
    const opts = { rootDir: root };
    const job = createSearchJob(sampleConfig({ maxIterations: 20 }), opts);
    let calls = 0;
    const result = await runSearchJob({
      jobId: job.id,
      storeOptions: opts,
      ...evalFixtures(),
      evaluate: async (input) => {
        calls += 1;
        if (calls === 1) {
          requestSearchJobPause(job.id, opts);
        }
        return mockEval(() => 2)(input);
      },
    });
    expect(result.stopReason).toBe("paused");
    expect(result.job.status).toBe("paused");
    const payload = readRunnerPayloadFromCheckpoint(result.job.checkpoint);
    expect(payload?.jobStatus).toBe("paused");
    expect(payload?.statistics.evaluated).toBeGreaterThanOrEqual(1);
  });

  it("fails fatally on corrupt checkpoint", async () => {
    const root = makeTempRoot();
    const opts = { rootDir: root };
    const job = createSearchJob(sampleConfig({ maxIterations: 2 }), opts);
    // Force a corrupt payload via direct file edit after start path
    const file = path.join(root, "jobs", `${job.id}.json`);
    const raw = JSON.parse(fs.readFileSync(file, "utf8")) as {
      status: string;
      checkpoint: { randomState: string | null };
    };
    raw.status = "running";
    raw.checkpoint.randomState = "{not-json";
    fs.writeFileSync(file, JSON.stringify(raw));

    await expect(
      runSearchJob({
        jobId: job.id,
        storeOptions: opts,
        ...evalFixtures(),
        evaluate: mockEval(() => 1),
      }),
    ).rejects.toMatchObject({ code: "CORRUPT_CHECKPOINT" });

    const failed = getSearchJob(job.id, opts);
    expect(failed?.status).toBe("failed");
  });

  it("rejects running a terminal job", async () => {
    const root = makeTempRoot();
    const opts = { rootDir: root };
    const job = createSearchJob(sampleConfig({ maxIterations: 1 }), opts);
    await runSearchJob({
      jobId: job.id,
      storeOptions: opts,
      ...evalFixtures(),
      evaluate: mockEval(() => 1),
    });
    await expect(
      runSearchJob({
        jobId: job.id,
        storeOptions: opts,
        ...evalFixtures(),
        evaluate: mockEval(() => 1),
      }),
    ).rejects.toBeInstanceOf(StrategySearchJobRunnerError);
  });

  it("requires resume before running a paused job", async () => {
    const root = makeTempRoot();
    const opts = { rootDir: root };
    const job = createSearchJob(sampleConfig({ maxIterations: 5 }), opts);
    let calls = 0;
    await runSearchJob({
      jobId: job.id,
      storeOptions: opts,
      ...evalFixtures(),
      evaluate: async (input) => {
        calls += 1;
        if (calls === 1) requestSearchJobPause(job.id, opts);
        return mockEval(() => 1)(input);
      },
    });
    await expect(
      runSearchJob({
        jobId: job.id,
        storeOptions: opts,
        ...evalFixtures(),
        evaluate: mockEval(() => 1),
      }),
    ).rejects.toMatchObject({ code: "INVALID_STATE" });

    resumeSearchJobForRun(job.id, opts);
    const resumed = await runSearchJob({
      jobId: job.id,
      storeOptions: opts,
      ...evalFixtures(),
      evaluate: mockEval(() => 3),
    });
    expect(resumed.job.status).toBe("completed");
  });
});
