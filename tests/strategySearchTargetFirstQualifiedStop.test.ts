import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { completionReasonLabelKo } from "../components/rextora/strategySearch/formatters";
import {
  createSearchJob,
  markSearchJobRunning,
  type StrategySearchStoreOptions,
} from "../src/lib/rextora/strategySearch/jobStore";
import { resetJobExecutionOwnershipForTests } from "../src/lib/rextora/strategySearch/jobExecutionOwnership";
import { resetSearchJobExecutionRegistryForTests } from "../src/lib/rextora/strategySearch/jobExecutionRegistry";
import { runOrchestratedSearchJob } from "../src/lib/rextora/strategySearch/searchOrchestrator";
import {
  createEmptySearchPlan,
  getSearchPlan,
  SAFETY_BUDGET_CEILING,
  saveSearchPlan,
} from "../src/lib/rextora/strategySearch/searchPlan";
import type { StrategySearchConfig } from "../src/lib/rextora/strategySearch/types";

const roots: string[] = [];

function tempStore(): StrategySearchStoreOptions {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "rextora-target-stop-"));
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

function baseConfig(): StrategySearchConfig {
  return {
    searchVersion: "1",
    strategyTemplateId: "target_first_qualified",
    symbols: ["BTCUSDT"],
    timeframe: "15m",
    dataVersion: "test-v1",
    seed: 3,
    generatorType: "random",
    maxIterations: 4,
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
    passCriteria: { minTradeCount: 1, requireAllWindowsPass: false },
    costStress: { enabled: false, multipliers: [] },
    jitter: { enabled: false, samples: 0, relativeAmplitude: 0 },
  };
}

function orchInput(jobId: string, store: StrategySearchStoreOptions) {
  return {
    jobId,
    storeOptions: store,
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
    scoreWeights: { returnWeight: 1, mddWeight: 0.5 },
    costStressScenarios: [],
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
    preloadedCandlesByKey: {},
  };
}

function seedPlan(input: {
  stopWhenQualifiedTarget: boolean;
  qualifiedTarget: number;
  qualifiedHashes: string[];
  maxRuntimeMs: number | null;
  candidateBudgetUsed?: number;
  campaignStartedAtMs?: number | null;
}) {
  const store = tempStore();
  const job = createSearchJob(baseConfig(), store);
  markSearchJobRunning(job.id, store);
  const plan = createEmptySearchPlan({
    searchName: "target-stop",
    depthProfile: "fast",
    qualificationProfile: "balanced",
    qualifiedTarget: input.qualifiedTarget,
    candidateBudget: 10,
    stageBatchSize: 4,
    maxRuntimeMs: input.maxRuntimeMs,
    spaces: [{ id: "ema_core", labelKo: "EMA" }],
    stopWhenQualifiedTarget: input.stopWhenQualifiedTarget,
  });
  saveSearchPlan(
    job.id,
    {
      ...plan,
      qualifiedHashes: input.qualifiedHashes,
      candidateBudgetUsed: input.candidateBudgetUsed ?? 0,
      campaignStartedAtMs: input.campaignStartedAtMs ?? Date.now(),
    },
    store,
  );
  return { store, jobId: job.id };
}

describe("target mode stops at the first qualified candidate", () => {
  it("reaches QUALIFIED_TARGET_REACHED on the first qualified hash when the stop flag is on", async () => {
    const { store, jobId } = seedPlan({
      stopWhenQualifiedTarget: true,
      qualifiedTarget: 1,
      qualifiedHashes: ["first-qualified"],
      maxRuntimeMs: 60_000,
    });
    const result = await runOrchestratedSearchJob(orchInput(jobId, store));
    expect(result.finalStopReason).toBe("QUALIFIED_TARGET_REACHED");
    expect(result.lastRun).toBeNull();
    expect(getSearchPlan(jobId, store)?.completionReason).toBe(
      "QUALIFIED_TARGET_REACHED",
    );
    expect(completionReasonLabelKo("QUALIFIED_TARGET_REACHED")).toBe(
      "합격 목표 달성",
    );
  });

  it("does not stop a time-budget plan on the first qualified hash", async () => {
    const { store, jobId } = seedPlan({
      stopWhenQualifiedTarget: false,
      qualifiedTarget: 1,
      qualifiedHashes: ["first-qualified"],
      maxRuntimeMs: 60_000,
    });
    const result = await runOrchestratedSearchJob(orchInput(jobId, store));
    expect(result.finalStopReason).not.toBe("QUALIFIED_TARGET_REACHED");
    expect(getSearchPlan(jobId, store)?.completionReason).not.toBe(
      "QUALIFIED_TARGET_REACHED",
    );
  });

  it("still stops on runtime and candidate budget when nothing qualifies", async () => {
    const runtime = seedPlan({
      stopWhenQualifiedTarget: true,
      qualifiedTarget: 1,
      qualifiedHashes: [],
      maxRuntimeMs: 1,
      campaignStartedAtMs: Date.now() - 10_000,
    });
    const runtimeResult = await runOrchestratedSearchJob(
      orchInput(runtime.jobId, runtime.store),
    );
    expect(runtimeResult.finalStopReason).toBe("DEADLINE_REACHED");

    const budget = seedPlan({
      stopWhenQualifiedTarget: true,
      qualifiedTarget: 1,
      qualifiedHashes: [],
      maxRuntimeMs: null,
      candidateBudgetUsed: 10,
    });
    const budgetResult = await runOrchestratedSearchJob(
      orchInput(budget.jobId, budget.store),
    );
    expect(budgetResult.finalStopReason).toBe("MAX_CANDIDATE_BUDGET");
    expect(SAFETY_BUDGET_CEILING).toBe(50_000);
  });
});
