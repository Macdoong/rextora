import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CONTEXT_FALLBACK_PARAMS } from "../src/lib/rextora/strategy/safeV44Params";
import { computeParamsHash } from "../src/lib/rextora/strategy/strategyHash";
import * as strategyStore from "../src/lib/rextora/strategy/strategyStore";
import { EXPECTED_SAFE_PARAMS_HASH } from "../src/lib/rextora/strategy/strategyTypes";
import {
  createSearchJob,
  getSearchJob,
  listSearchTrials,
  readRunnerPayloadFromCheckpoint,
  runSearchJob,
  saveSearchTrial,
  type EvaluateCompleteCandidateInput,
  type StrategySearchCompleteCandidateEvaluation,
  type StrategySearchConfig,
} from "../src/lib/rextora/strategySearch";
import { promoteSearchCandidateToStrategy } from "../src/lib/rextora/strategySearch/promoteFromSearch";

const tempRoots: string[] = [];
const SAFE_CANDIDATES = [
  path.join(process.cwd(), "data", "strategies", "SAFE_v44_i4060.json"),
  path.join(
    process.cwd(),
    "data",
    "rextora",
    "strategies",
    "SAFE_v44_i4060.json",
  ),
];

function safePath(): string {
  for (const p of SAFE_CANDIDATES) {
    if (fs.existsSync(p)) return p;
  }
  return SAFE_CANDIDATES[0]!;
}

function makeTempRoot(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "rextora-promote-"));
  tempRoots.push(root);
  return root;
}

afterEach(() => {
  vi.restoreAllMocks();
  for (const root of tempRoots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

function sampleConfig(
  overrides: Partial<StrategySearchConfig> = {},
): StrategySearchConfig {
  return {
    searchVersion: "1",
    strategyTemplateId: "operator_promote",
    symbols: ["BTCUSDT"],
    timeframe: "15m",
    dataVersion: "binance-v1",
    seed: 42,
    generatorType: "random",
    maxIterations: 5,
    parameterRanges: [
      { key: "ema_fast", min: 10, max: 12, step: 1, valueType: "integer" },
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
        {
          key: "ema_fast",
          min: 10,
          max: 10,
          step: 1,
          valueType: "integer" as const,
        },
      ],
    },
  };
}

function mockEval(): (
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
      finalScore: 1,
      breakdown: {
        returnReward: 1,
        mddPenalty: 0,
        profitFactorReward: 0,
        winRateReward: 0,
        tradeAdequacy: 0,
        negativeMonthPenalty: 0,
        consistency: 0,
        weightedReturn: 1,
        weightedMdd: 0,
        weightedProfitFactor: 0,
        weightedWinRate: 0,
        weightedTradeAdequacy: 0,
        weightedNegativeMonth: 0,
        weightedConsistency: 0,
      },
    },
    costStress: { enabled: false, scenarios: [], allRequiredPassed: true },
    jitterResult: {
      enabled: false,
      samples: [],
      passRate: 1,
      scoreDropRatio: 0,
      passed: true,
    },
    finalPass: { passed: true, reasons: [] },
    finalScore: 1,
  });
}

describe("strategySearch promote + search space exhausted", () => {
  it("promotes Final PASS into Strategy Management without touching SAFE", () => {
    const beforeSafe = fs.readFileSync(safePath());

    const params = { ...CONTEXT_FALLBACK_PARAMS, ema_fast: 11 };
    const paramsHash = computeParamsHash(params);
    expect(paramsHash).not.toBe(EXPECTED_SAFE_PARAMS_HASH);

    const root = makeTempRoot();
    const store = { rootDir: root };
    const job = createSearchJob(sampleConfig({ maxIterations: 1 }), store);
    saveSearchTrial(
      {
        jobId: job.id,
        iteration: 0,
        candidateId: "c0",
        params,
        paramsHash,
        generatorType: "random",
        parentCandidateIds: [],
        score: 1.5,
        passed: true,
        failureReasons: [],
        windowResults: [
          {
            windowId: "w1",
            symbol: "BTCUSDT",
            totalReturn: 0.12,
            mdd: -0.04,
            trades: 15,
            winRate: 0.6,
            profitFactor: 1.5,
          },
        ],
        costStressResults: [],
        jitterResults: [],
        durationMs: 5,
        createdAt: new Date().toISOString(),
      },
      store,
    );

    const createdId = `custom_promote_${Date.now().toString(36)}`;
    const createSpy = vi.spyOn(strategyStore, "createStrategy").mockReturnValue({
      id: createdId,
      name: "탐색 #1",
      paramsHash,
      locked: false,
    } as ReturnType<typeof strategyStore.createStrategy>);
    vi.spyOn(strategyStore, "listStrategies").mockReturnValue([]);
    vi.spyOn(strategyStore, "updateStrategyLastBacktest").mockReturnValue(
      undefined as never,
    );

    const first = promoteSearchCandidateToStrategy({
      jobId: job.id,
      iteration: 0,
      storeOptions: store,
    });
    expect(first.alreadyExists).toBe(false);
    expect(first.registrationState).toBe("registered");
    expect(first.strategyId).toBe(createdId);
    expect(createSpy).toHaveBeenCalledTimes(1);

    vi.spyOn(strategyStore, "listStrategies").mockReturnValue([
      {
        id: createdId,
        name: "탐색 #1",
        paramsHash,
        locked: false,
      } as ReturnType<typeof strategyStore.listStrategies>[number],
    ]);

    const second = promoteSearchCandidateToStrategy({
      jobId: job.id,
      iteration: 0,
      storeOptions: store,
    });
    expect(second.alreadyExists).toBe(true);
    expect(second.registrationState).toBe("duplicate");
    expect(second.strategyId).toBe(createdId);
    expect(createSpy).toHaveBeenCalledTimes(1);

    expect(Buffer.compare(beforeSafe, fs.readFileSync(safePath()))).toBe(0);
  });

  it("rejects SAFE-hash and non-passing candidates", () => {
    const root = makeTempRoot();
    const store = { rootDir: root };
    const job = createSearchJob(sampleConfig({ maxIterations: 1 }), store);
    saveSearchTrial(
      {
        jobId: job.id,
        iteration: 0,
        candidateId: "c0",
        params: {},
        paramsHash: "7893ca3f0e30",
        generatorType: "random",
        parentCandidateIds: [],
        score: 1,
        passed: true,
        failureReasons: [],
        windowResults: [],
        costStressResults: [],
        jitterResults: [],
        durationMs: 1,
        createdAt: new Date().toISOString(),
      },
      store,
    );
    expect(() =>
      promoteSearchCandidateToStrategy({
        jobId: job.id,
        iteration: 0,
        storeOptions: store,
      }),
    ).toThrow(/SAFE|protected/i);

    saveSearchTrial(
      {
        jobId: job.id,
        iteration: 1,
        candidateId: "c1",
        params: { ema_fast: 11 },
        paramsHash: "ok_hash",
        generatorType: "random",
        parentCandidateIds: [],
        score: 0.1,
        passed: false,
        failureReasons: [{ code: "FAIL", message: "x" }],
        windowResults: [],
        costStressResults: [],
        jitterResults: [],
        durationMs: 1,
        createdAt: new Date().toISOString(),
      },
      store,
    );
    expect(() =>
      promoteSearchCandidateToStrategy({
        jobId: job.id,
        iteration: 1,
        storeOptions: store,
      }),
    ).toThrow(/Final PASS|PASS/i);
  });

  it("classifies DUPLICATE_EXHAUSTED as search_space_exhausted, not an error", async () => {
    const root = makeTempRoot();
    const opts = { rootDir: root };
    const job = createSearchJob(
      sampleConfig({
        maxIterations: 3,
        parameterRanges: [
          {
            key: "ema_fast",
            min: 10,
            max: 10,
            step: 1,
            valueType: "integer",
          },
        ],
      }),
      opts,
    );

    const result = await runSearchJob({
      jobId: job.id,
      storeOptions: opts,
      ...evalFixtures(),
      evaluate: mockEval(),
    });

    expect(result.stopReason).toBe("search_space_exhausted");
    expect(result.job.status).toBe("completed");
    expect(result.statistics.errors).toBe(0);

    const trials = listSearchTrials(job.id, opts);
    expect(
      trials.every((t) => !String(t.paramsHash).startsWith("duplicate_exhausted_")),
    ).toBe(true);

    const stored = getSearchJob(job.id, opts);
    const payload = readRunnerPayloadFromCheckpoint(stored!.checkpoint);
    expect(payload?.stopReason).toBe("search_space_exhausted");
    expect(payload?.statistics.errors).toBe(0);
  });
});
