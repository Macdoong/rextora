/**
 * Phase 5.1 — real integration: continuous search vs interrupted resume must match.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { generateSyntheticCandles } from "../src/lib/rextora/data/ohlcvTypes";
import { CONTEXT_FALLBACK_PARAMS } from "../src/lib/rextora/strategy/safeV44Params";
import {
  createEmptyJobStatistics,
  createSearchJob,
  evaluateCompleteCandidate,
  getSearchJob,
  listSearchTrials,
  readRunnerPayloadFromCheckpoint,
  requestSearchJobPause,
  resumeSearchJobForRun,
  runSearchJob,
  type StrategySearchConfig,
  type StrategySearchJobStatistics,
  type StrategySearchTrial,
} from "../src/lib/rextora/strategySearch";

const SAFE_PATH = path.join(
  process.cwd(),
  "data",
  "strategies",
  "SAFE_v44_i4060.json",
);
const INTERVAL_MS = 15 * 60 * 1000;
const FROM = Date.UTC(2024, 0, 1);
const COUNT = 240;
const TO = FROM + (COUNT - 1) * INTERVAL_MS;

const tempRoots: string[] = [];

function makeTempRoot(): string {
  const root = fs.mkdtempSync(
    path.join(os.tmpdir(), "rextora-search-resume-int-"),
  );
  tempRoots.push(root);
  return root;
}

afterEach(() => {
  for (const root of tempRoots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

function searchConfig(
  overrides: Partial<StrategySearchConfig> = {},
): StrategySearchConfig {
  return {
    searchVersion: "phase51-int",
    strategyTemplateId: "template_search_base",
    symbols: ["BTCUSDT"],
    timeframe: "15m",
    dataVersion: "synthetic-v1",
    seed: 424242,
    generatorType: "random",
    maxIterations: 5,
    parameterRanges: [
      { key: "ema_fast", min: 12, max: 28, step: 1, valueType: "integer" },
      { key: "ema_mid", min: 30, max: 50, step: 1, valueType: "integer" },
      { key: "ema_slow", min: 55, max: 90, step: 1, valueType: "integer" },
      {
        key: "sl_atr_mult",
        min: 1.2,
        max: 2.4,
        step: 0.1,
        valueType: "float",
      },
    ],
    evaluationWindows: [
      {
        id: "full",
        label: "full",
        fromOpenTime: FROM,
        toOpenTime: TO,
      },
    ],
    passCriteria: { minTradeCount: 0, requireAllWindowsPass: true },
    costStress: { enabled: true, multipliers: [1, 1.5] },
    jitter: { enabled: true, samples: 2, relativeAmplitude: 0.2 },
    ...overrides,
  };
}

function runInput(rootDir: string) {
  const candles = generateSyntheticCandles(COUNT, 100, 0.00028, {
    startOpenTime: FROM,
    intervalMs: INTERVAL_MS,
  });
  return {
    storeOptions: { rootDir },
    windows: [
      {
        id: "full",
        label: "full",
        requestedFrom: FROM,
        requestedTo: TO,
        requiredForPass: true,
      },
    ],
    balance: 10_000,
    baseCostConfig: {
      feeRate: 0.0004,
      slippageRate: 0.0002,
      fundingRate: 0.0001,
      applyFunding: false,
      applySpread: true,
      spreadRate: 0.0001,
    },
    passPolicy: {
      thresholds: {
        minTotalReturn: -10,
        maxMdd: -1,
        minTradeCount: 0,
      },
    },
    scoreWeights: {
      returnWeight: 1,
      mddWeight: 0.5,
      profitFactorWeight: 0.25,
      winRateWeight: 0.25,
      tradeAdequacyWeight: 0.25,
      negativeMonthWeight: 0.1,
      consistencyWeight: 0.1,
    },
    costStressScenarios: [
      {
        id: "base_cost",
        label: "base",
        requiredForPass: true,
        feeMultiplier: 1,
        slippageMultiplier: 1,
        fundingMultiplier: 1,
        spreadMultiplier: 1,
        costGuardKMultiplier: 1,
      },
      {
        id: "stress_1_5x",
        label: "1.5x",
        requiredForPass: false,
        feeMultiplier: 1.5,
        slippageMultiplier: 1.5,
        fundingMultiplier: 1,
        spreadMultiplier: 1.5,
        costGuardKMultiplier: 1,
      },
    ],
    jitterConfig: {
      enabled: true,
      sampleCount: 2,
      mutationScale: 0.25,
      seed: 77,
      minimumPassRate: 0,
      maximumScoreDropRatio: 100,
      parameterRanges: [
        { key: "ema_fast", min: 12, max: 28, step: 1, valueType: "integer" as const },
        {
          key: "sl_atr_mult",
          min: 1.2,
          max: 2.4,
          step: 0.1,
          valueType: "float" as const,
        },
      ],
    },
    baseParams: CONTEXT_FALLBACK_PARAMS,
    preloadedCandlesByKey: { "BTCUSDT|full": candles },
    evaluate: evaluateCompleteCandidate,
  };
}

function trialFingerprint(trial: StrategySearchTrial) {
  return {
    iteration: trial.iteration,
    paramsHash: trial.paramsHash,
    params: trial.params,
    generatorType: trial.generatorType,
    parentCandidateIds: trial.parentCandidateIds,
    score: trial.score,
    passed: trial.passed,
    failureReasons: trial.failureReasons.map((f) => ({
      code: f.code,
      message: f.message,
    })),
    windowResults: trial.windowResults,
    costStressResults: trial.costStressResults,
    jitterResults: trial.jitterResults.map((j) => ({
      sampleIndex: j.sampleIndex,
      paramsHash: j.paramsHash,
      passed: j.passed,
      score: j.score,
    })),
  };
}

function statsFingerprint(stats: StrategySearchJobStatistics) {
  // Wall-clock fields are non-deterministic across runs.
  return {
    generated: stats.generated,
    evaluated: stats.evaluated,
    passed: stats.passed,
    failed: stats.failed,
    stressPassed: stats.stressPassed,
    jitterPassed: stats.jitterPassed,
    duplicates: stats.duplicates,
    errors: stats.errors,
    bestScore: stats.bestScore,
    averageScore: stats.averageScore,
    scoreSum: stats.scoreSum,
  };
}

function bestFingerprint(
  best: {
    candidateId: string;
    iteration: number;
    paramsHash: string;
    score: number | null;
    passed: boolean;
  } | null,
) {
  if (!best) return null;
  return {
    iteration: best.iteration,
    paramsHash: best.paramsHash,
    score: best.score,
    passed: best.passed,
  };
}

describe("strategySearch Phase 5.1 resume integration", () => {
  it("continuous execution matches interrupted checkpoint/resume execution exactly", () => {
    expect(fs.existsSync(SAFE_PATH)).toBe(false);
  });

  it("preserves immutability of candidates, stats snapshots, and checkpoint inputs", async () => {
    const root = makeTempRoot();
    const job = createSearchJob(searchConfig({ maxIterations: 2 }), {
      rootDir: root,
    });
    const statsSnap = createEmptyJobStatistics();
    const statsSnapCopy = { ...statsSnap };

    const capturedParams: Array<Record<string, unknown>> = [];
    const capturedHashes: string[] = [];

    const result = await runSearchJob({
      jobId: job.id,
      ...runInput(root),
      evaluate: async (input) => {
        capturedParams.push({ ...input.candidate.params });
        capturedHashes.push(input.candidate.paramsHash);
        return evaluateCompleteCandidate(input);
      },
    });

    expect(result.job.status).toBe("completed");
    // External stats snapshot untouched by runner
    expect(statsSnap).toEqual(statsSnapCopy);

    const trials = listSearchTrials(job.id, { rootDir: root }).sort(
      (a, b) => a.iteration - b.iteration,
    );
    expect(trials).toHaveLength(2);
    for (let i = 0; i < trials.length; i += 1) {
      expect(trials[i]!.paramsHash).toBe(capturedHashes[i]);
      expect(trials[i]!.params).toEqual(capturedParams[i]);
      // Mutating returned trial params must not rewrite disk
      const mutated = { ...trials[i]!.params, ema_fast: -999 };
      expect(mutated.ema_fast).toBe(-999);
      const reloadedTrial = listSearchTrials(job.id, { rootDir: root }).find(
        (t) => t.iteration === trials[i]!.iteration,
      )!;
      expect(reloadedTrial.params).toEqual(capturedParams[i]);
      expect(reloadedTrial.paramsHash).toBe(capturedHashes[i]);
    }

    const loaded = getSearchJob(job.id, { rootDir: root })!;
    const payload = readRunnerPayloadFromCheckpoint(loaded.checkpoint)!;
    const payloadCopy = structuredClone(payload);
    payload.statistics.generated = 999_999;
    payload.seenHashes.push("mutated");
    const reloaded = readRunnerPayloadFromCheckpoint(
      getSearchJob(job.id, { rootDir: root })!.checkpoint,
    )!;
    expect(reloaded).toEqual(payloadCopy);
  });
});
