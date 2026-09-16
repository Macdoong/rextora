import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  createSearchJob,
  getSearchJob,
  listSearchTrials,
  saveSearchTrial,
  type StrategySearchStoreOptions,
} from "../src/lib/rextora/strategySearch/jobStore";
import {
  createEmptySearchPlan,
  saveSearchPlan,
} from "../src/lib/rextora/strategySearch/searchPlan";
import { recoverMissingJobRecord } from "../src/lib/rextora/strategySearch/jobRecordRecovery";
import { recoverOrphanSearchJobs } from "../src/lib/rextora/strategySearch/orphanJobRecovery";
import { buildCalculationErrorBreakdown } from "../src/lib/rextora/strategySearch/calculationErrorBreakdown";
import { createStrategySearchJobApi } from "../src/lib/rextora/strategySearch/jobApiService";
import type { StrategySearchTrial } from "../src/lib/rextora/strategySearch/types";
import { CONTEXT_FALLBACK_PARAMS } from "../src/lib/rextora/strategy/safeV44Params";

const tempRoots: string[] = [];

function tempStore(): StrategySearchStoreOptions {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "rextora-jobrec-"));
  tempRoots.push(root);
  return { rootDir: root };
}

afterEach(() => {
  while (tempRoots.length) {
    const root = tempRoots.pop();
    if (root) fs.rmSync(root, { recursive: true, force: true });
  }
});

function minimalConfig() {
  return {
    searchVersion: "1",
    strategyTemplateId: "test",
    symbols: ["BTCUSDT"],
    timeframe: "15m",
    dataVersion: "binance-v1",
    seed: 42,
    generatorType: "random" as const,
    maxIterations: 10,
    parameterRanges: [
      {
        key: "ema_fast",
        min: 10,
        max: 30,
        step: 1,
        valueType: "integer" as const,
      },
    ],
    evaluationWindows: [
      {
        id: "w1",
        label: "primary",
        fromOpenTime: 0,
        toOpenTime: 1,
        requiredForPass: true,
      },
    ],
    passCriteria: { minTradeCount: 5 },
    costStress: { enabled: true, multipliers: [1.5] },
    jitter: { enabled: true, samples: 2, relativeAmplitude: 0.2 },
  };
}

describe("job record recovery", () => {
  it("rebuilds missing job.json from plan/trials as queued without deleting trials", () => {
    const store = tempStore();
    const job = createSearchJob(minimalConfig(), store);
    saveSearchPlan(
      job.id,
      createEmptySearchPlan({
        searchName: "recover-test",
        depthProfile: "standard",
        qualificationProfile: "balanced",
        qualifiedTarget: 3,
        candidateBudget: 100,
        stageBatchSize: 20,
        maxRuntimeMs: 60_000,
        spaces: [{ id: "trend", labelKo: "추세" }],
      }),
      store,
    );
    const trial: StrategySearchTrial = {
      jobId: job.id,
      iteration: 0,
      candidateId: `${job.id}_c0`,
      generatorType: "random",
      parentCandidateIds: [],
      params: { ...CONTEXT_FALLBACK_PARAMS },
      paramsHash: "abc123hash",
      createdAt: new Date().toISOString(),
      score: 1,
      passed: true,
      windowResults: [],
      costStressResults: [],
      jitterResults: [],
      durationMs: 1,
      failureReasons: [],
    };
    saveSearchTrial(trial, store);

    const jobPath = path.join(store.rootDir!, "jobs", `${job.id}.json`);
    fs.unlinkSync(jobPath);
    expect(getSearchJob(job.id, store)).toBeNull();
    expect(listSearchTrials(job.id, store)).toHaveLength(1);

    const recovery = recoverMissingJobRecord(job.id, store);
    expect(recovery.recovered).toBe(true);
    const restored = getSearchJob(job.id, store);
    expect(restored?.status).toBe("queued");
    expect(restored?.checkpoint.completedIterations).toBeGreaterThanOrEqual(1);
    expect(listSearchTrials(job.id, store)).toHaveLength(1);
  });

  it("create API read-back succeeds and returns persisted id", () => {
    const store = tempStore();
    const from = Date.UTC(2024, 0, 1);
    const to = Date.UTC(2024, 0, 31);
    const detail = createStrategySearchJobApi(
      {
        searchVersion: "phase6",
        strategyTemplateId: "create-readback",
        symbols: ["BTCUSDT"],
        timeframe: "15m",
        dataVersion: "synthetic-v1",
        seed: 7,
        generatorType: "random",
        maxIterations: 5,
        parameterRanges: minimalConfig().parameterRanges,
        evaluationWindows: [
          {
            id: "full",
            label: "full",
            fromOpenTime: from,
            toOpenTime: to,
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
        costStressScenarios: [],
        jitterConfig: {
          enabled: false,
          sampleCount: 1,
          mutationScale: 0.2,
          seed: 7,
          minimumPassRate: 0,
          maximumScoreDropRatio: 1,
          parameterRanges: minimalConfig().parameterRanges,
        },
        dataRef: {
          source: "binance_historical",
          availableFrom: from,
          availableTo: to,
        },
        operatorPlan: {
          depthProfile: "fast",
          qualificationProfile: "balanced",
          qualifiedTarget: 2,
          candidateBudget: 50,
          stageBatchSize: 10,
          maxRuntimeMs: 60_000,
          minScore: null,
          searchName: "create-readback",
          errorWarningRate: 0.35,
          errorAutoPauseRate: 0.55,
          repeatedSignatureThreshold: 25,
        },
      },
      store,
    );
    expect(detail.id.startsWith("search_")).toBe(true);
    expect(getSearchJob(detail.id, store)?.id).toBe(detail.id);
  });
});

describe("calculation error breakdown", () => {
  it("does not count qualification failures as calculation errors", () => {
    const trials = [
      {
        passed: true,
        failureReasons: [],
        iteration: 0,
      },
      {
        passed: false,
        failureReasons: [
          {
            code: "EVALUATION_FAILED_GATES",
            message: "gates",
          },
        ],
        iteration: 1,
      },
      {
        passed: false,
        failureReasons: [
          {
            code: "JITTER_DUPLICATE_EXHAUSTED",
            message: "jitter",
          },
        ],
        iteration: 2,
      },
      {
        passed: false,
        failureReasons: [
          {
            code: "BACKTEST_CRASH",
            message: "engine",
          },
        ],
        iteration: 3,
      },
    ] as unknown as StrategySearchTrial[];

    const breakdown = buildCalculationErrorBreakdown(trials);
    expect(breakdown.passed).toBe(1);
    expect(breakdown.rejectedQualification).toBe(1);
    expect(breakdown.robustnessRejects).toBe(1);
    expect(breakdown.calculationErrors).toBe(1);
    expect(breakdown.byCode.BACKTEST_CRASH).toBe(1);
  });
});

describe("orphan recovery recordRecovered field", () => {
  it("exposes recordRecovered array", () => {
    const store = tempStore();
    const result = recoverOrphanSearchJobs(store);
    expect(Array.isArray(result.recordRecovered)).toBe(true);
    expect(Array.isArray(result.audits)).toBe(true);
  });
});
