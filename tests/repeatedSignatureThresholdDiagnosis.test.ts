/**
 * P1-E2 diagnosis only. Does not change production runner behavior.
 * Temp stores only — no production strategy-search data.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  generateRandomCandidate,
  generateUniqueCandidate,
  StrategySearchGenerationError,
} from "../src/lib/rextora/strategySearch/candidateGenerator";
import { CONTEXT_FALLBACK_PARAMS } from "../src/lib/rextora/strategy/safeV44Params";
import { buildCalculationErrorBreakdown } from "../src/lib/rextora/strategySearch/calculationErrorBreakdown";
import {
  buildPersistedCheckpoint,
  createInitialRunnerPayload,
  readRunnerPayloadFromCheckpoint,
} from "../src/lib/rextora/strategySearch/jobCheckpoint";
import {
  createSearchJob,
  type StrategySearchStoreOptions,
} from "../src/lib/rextora/strategySearch/jobStore";
import { createSeededRandom } from "../src/lib/rextora/strategySearch/random";
import {
  createEmptySearchPlan,
  getSearchPlan,
  saveSearchPlan,
} from "../src/lib/rextora/strategySearch/searchPlan";
import type { StrategySearchTrial } from "../src/lib/rextora/strategySearch/types";

const roots: string[] = [];

function tempStore(): StrategySearchStoreOptions {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "rextora-p1e2-"));
  roots.push(rootDir);
  return { rootDir };
}

afterEach(() => {
  while (roots.length) {
    const root = roots.pop();
    if (root) fs.rmSync(root, { recursive: true, force: true });
  }
});

function tinyRange() {
  return [
    {
      key: "ema_fast",
      min: 12,
      max: 12,
      step: 1,
      valueType: "integer" as const,
    },
  ];
}

function sampleTrial(
  iteration: number,
  code: string,
  message: string,
  passed = false,
): StrategySearchTrial {
  return {
    jobId: "search_00000000-0000-4000-8000-0000000000e2",
    iteration,
    candidateId: `c${iteration}`,
    generatorType: "random",
    parentCandidateIds: [],
    params: {},
    paramsHash: `invalid_${iteration}`,
    createdAt: "2026-08-11T00:00:00.000Z",
    score: null,
    passed,
    windowResults: [],
    costStressResults: [],
    jitterResults: [],
    durationMs: 0,
    failureReasons: passed ? [] : [{ code, message }],
  };
}

describe("repeatedSignatureThreshold diagnosis (P1-E2)", () => {
  it("defaults to 25 and persists on the plan only", () => {
    const store = tempStore();
    const job = createSearchJob(
      {
        searchVersion: "1",
        strategyTemplateId: "p1e2",
        symbols: ["BTCUSDT"],
        timeframe: "15m",
        dataVersion: "test",
        seed: 1,
        generatorType: "random",
        maxIterations: 4,
        parameterRanges: tinyRange(),
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
      },
      store,
    );
    const plan = createEmptySearchPlan({
      searchName: "p1e2",
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
    const loaded = getSearchPlan(job.id, store)!;
    expect(loaded.repeatedSignatureThreshold).toBe(25);
    expect(job.config).not.toHaveProperty("repeatedSignatureThreshold");
  });

  it("is consumed by the runner only; orchestrator and generator stay unused", () => {
    const runner = fs.readFileSync(
      path.join(
        process.cwd(),
        "src/lib/rextora/strategySearch/jobRunner.ts",
      ),
      "utf8",
    );
    const orch = fs.readFileSync(
      path.join(
        process.cwd(),
        "src/lib/rextora/strategySearch/searchOrchestrator.ts",
      ),
      "utf8",
    );
    const gen = fs.readFileSync(
      path.join(
        process.cwd(),
        "src/lib/rextora/strategySearch/candidateGenerator.ts",
      ),
      "utf8",
    );
    expect(runner).toMatch(/repeatedSignatureThreshold/);
    expect(orch).not.toMatch(/repeatedSignatureThreshold/);
    expect(gen).not.toMatch(/repeatedSignatureThreshold/);
    expect(runner).toMatch(/errorAutoPauseRate/);
    const autoPauseIdx = runner.indexOf("errorAutoPauseRate");
    const invalidContinueIdx = runner.indexOf("paramsHash: `invalid_${iteration}`");
    expect(autoPauseIdx).toBeGreaterThan(invalidContinueIdx);

    const payload = createInitialRunnerPayload({
      prng: { algorithm: "mulberry32", seed: 1, state: 1 },
      jobStatus: "queued",
    });
    expect(payload).not.toHaveProperty("repeatedSignatureThreshold");
    expect(payload).not.toHaveProperty("errorSignatures");
    expect(payload).not.toHaveProperty("repeatedSignatureCount");
    const decoded = readRunnerPayloadFromCheckpoint(
      buildPersistedCheckpoint({
        completedIterations: 0,
        nextIteration: 0,
        payload,
        bestCandidate: null,
        bestPassedCandidate: null,
        updatedAt: "2026-08-11T00:00:00.000Z",
      }),
    );
    expect(decoded).not.toHaveProperty("repeatedSignatureThreshold");
  });

  it("unique candidate progress and legitimate small-space duplicates use seenHashes", () => {
    const ranges = tinyRange();
    const first = generateRandomCandidate({
      jobId: "search_00000000-0000-4000-8000-0000000000e2",
      iteration: 0,
      parameterRanges: ranges,
      random: createSeededRandom(7),
      baseParams: { ...CONTEXT_FALLBACK_PARAMS },
      searchVersion: "1",
    });
    expect(first.paramsHash).toBeTruthy();
    expect(first.paramsHash.startsWith("invalid_")).toBe(false);

    const seen = new Set([first.paramsHash]);
    expect(() =>
      generateUniqueCandidate({
        mode: "random",
        existingHashes: seen,
        maxAttempts: 8,
        randomInput: {
          jobId: "search_00000000-0000-4000-8000-0000000000e2",
          iteration: 1,
          parameterRanges: ranges,
          random: createSeededRandom(7),
          baseParams: { ...CONTEXT_FALLBACK_PARAMS },
          searchVersion: "1",
        },
      }),
    ).toThrow(StrategySearchGenerationError);

    try {
      generateUniqueCandidate({
        mode: "random",
        existingHashes: seen,
        maxAttempts: 4,
        randomInput: {
          jobId: "search_00000000-0000-4000-8000-0000000000e2",
          iteration: 1,
          parameterRanges: ranges,
          random: createSeededRandom(11),
          baseParams: { ...CONTEXT_FALLBACK_PARAMS },
          searchVersion: "1",
        },
      });
      expect.fail("expected DUPLICATE_EXHAUSTED");
    } catch (err) {
      expect(err).toBeInstanceOf(StrategySearchGenerationError);
      expect((err as StrategySearchGenerationError).code).toBe(
        "DUPLICATE_EXHAUSTED",
      );
    }

    seen.clear();
    const recovered = generateUniqueCandidate({
      mode: "random",
      existingHashes: seen,
      maxAttempts: 8,
      randomInput: {
        jobId: "search_00000000-0000-4000-8000-0000000000e2",
        iteration: 2,
        parameterRanges: ranges,
        random: createSeededRandom(13),
        baseParams: { ...CONTEXT_FALLBACK_PARAMS },
        searchVersion: "1",
      },
    });
    expect(recovered.paramsHash).toBe(first.paramsHash);
  });

  it("error signatures accumulate independently of the unused threshold", () => {
    const breakdown = buildCalculationErrorBreakdown([
      sampleTrial(0, "VALIDATION_FAILED", "invalid parameterRanges: min must be <= max"),
      sampleTrial(1, "VALIDATION_FAILED", "invalid parameterRanges: min must be <= max"),
      sampleTrial(2, "VALIDATION_FAILED", "invalid parameterRanges: min must be <= max"),
      sampleTrial(3, "EVALUATION_FAILED_GATES", "candidate did not pass complete evaluation gates"),
      sampleTrial(4, "DATA_UNAVAILABLE", "no market data", false),
    ]);
    const invalidSig = breakdown.topSignatures.find((row) =>
      row.signature.includes("VALIDATION_FAILED"),
    );
    expect(invalidSig?.count).toBe(3);
    expect(breakdown.rejectedQualification).toBe(1);
    expect(breakdown.calculationErrors).toBeGreaterThanOrEqual(3);
  });

  it("plan field survives save/load generation-style snapshot without a runtime counter", () => {
    const store = tempStore();
    const job = createSearchJob(
      {
        searchVersion: "1",
        strategyTemplateId: "p1e2-gen",
        symbols: ["BTCUSDT"],
        timeframe: "15m",
        dataVersion: "test",
        seed: 2,
        generatorType: "random",
        maxIterations: 2,
        parameterRanges: tinyRange(),
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
      },
      store,
    );
    saveSearchPlan(
      job.id,
      {
        ...createEmptySearchPlan({
          searchName: "p1e2-gen",
          depthProfile: "fast",
          qualificationProfile: "balanced",
          qualifiedTarget: 1,
          candidateBudget: 8,
          stageBatchSize: 4,
          maxRuntimeMs: null,
          spaces: [{ id: "ema_core", labelKo: "EMA" }],
          repeatedSignatureThreshold: 25,
        }),
      },
      store,
    );
    const after = getSearchPlan(job.id, store)!;
    expect(after.repeatedSignatureThreshold).toBe(25);
    expect(after.completionReason).toBeNull();
  });
});
