/**
 * Cross-process Strategy Search job execution ownership.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  acquireJobExecutionOwnership,
  EXECUTION_OWNERSHIP_STALE_MS,
  getProcessExecutionOwnerId,
  isJobExecutionOwnedOnDisk,
  JobExecutionOwnershipError,
  listJobExecutionOwnershipAudits,
  releaseJobExecutionOwnership,
  resetJobExecutionOwnershipForTests,
} from "@/src/lib/rextora/strategySearch/jobExecutionOwnership";
import {
  resetSearchJobExecutionRegistryForTests,
  startSearchJobExecution,
  StrategySearchExecutionRegistryError,
} from "@/src/lib/rextora/strategySearch/jobExecutionRegistry";
import {
  createSearchJob,
  saveSearchTrial,
  type StrategySearchStoreOptions,
} from "@/src/lib/rextora/strategySearch/jobStore";
import { saveJobExecutionProfile } from "@/src/lib/rextora/strategySearch/jobExecutionProfile";
import type { StrategySearchConfig } from "@/src/lib/rextora/strategySearch/types";

function tmpStore(): StrategySearchStoreOptions {
  return { rootDir: fs.mkdtempSync(path.join(os.tmpdir(), "rextora-owner-")) };
}

function sampleExecution() {
  return {
    version: 1 as const,
    balance: 10_000,
    baseCostConfig: {
      feeRate: 0.0004,
      slippageRate: 0.0002,
      fundingRate: 0,
      applyFunding: false,
      applySpread: false,
      spreadRate: 0,
    },
    passPolicy: { thresholds: { minTradeCount: 1 } },
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
      seed: 1,
      minimumPassRate: 0,
      maximumScoreDropRatio: 1,
      parameterRanges: [
        {
          key: "ema_fast",
          min: 10,
          max: 30,
          step: 1,
          valueType: "integer" as const,
        },
      ],
    },
    dataRef: {
      availableFrom: 0,
      availableTo: 1,
      source: "preloaded" as const,
    },
  };
}

function minimalConfig(): StrategySearchConfig {
  return {
    searchVersion: "1",
    strategyTemplateId: "owner_test",
    symbols: ["BTCUSDT"],
    timeframe: "15m",
    dataVersion: "binance-v1",
    seed: 1,
    generatorType: "random",
    maxIterations: 3,
    parameterRanges: [],
    evaluationWindows: [
      {
        id: "full",
        label: "full",
        fromOpenTime: 0,
        toOpenTime: 1,
        requiredForPass: true,
      },
    ],
    passCriteria: {
      minTradeCount: 1,
      maxMdd: -1,
      minTotalReturn: -1,
      requireAllWindowsPass: false,
    },
    costStress: { enabled: false, multipliers: [] },
    jitter: { enabled: false, samples: 0, relativeAmplitude: 0 },
  };
}

describe("job execution ownership", () => {
  afterEach(() => {
    resetSearchJobExecutionRegistryForTests();
  });

  it("two simultaneous acquire attempts: one accepted, one rejected", () => {
    const store = tmpStore();
    resetJobExecutionOwnershipForTests(store);
    const ownerA = "owner_a";
    const ownerB = "owner_b";
    const jobId = "search_owner_test_001";

    const first = acquireJobExecutionOwnership(jobId, ownerA, store);
    expect(first.outcome).toBe("acquired");

    expect(() => acquireJobExecutionOwnership(jobId, ownerB, store)).toThrow(
      JobExecutionOwnershipError,
    );

    expect(isJobExecutionOwnedOnDisk(jobId, store)).toBe(true);
    const audits = listJobExecutionOwnershipAudits(store);
    expect(audits.some((a) => a.event === "rejected_duplicate")).toBe(true);
  });

  it("same owner re-acquire is idempotent", () => {
    const store = tmpStore();
    resetJobExecutionOwnershipForTests(store);
    const owner = "owner_same";
    const jobId = "search_owner_test_002";

    const first = acquireJobExecutionOwnership(jobId, owner, store);
    const second = acquireJobExecutionOwnership(jobId, owner, store);
    expect(first.outcome).toBe("acquired");
    expect(second.outcome).toBe("idempotent_same_owner");
  });

  it("stale owner can be recovered without force-stealing fresh lease", () => {
    const store = tmpStore();
    resetJobExecutionOwnershipForTests(store);
    const jobId = "search_owner_test_003";
    const staleOwner = "owner_stale";
    const freshOwner = "owner_fresh";

    acquireJobExecutionOwnership(jobId, staleOwner, store);
    const fp = path.join(store.rootDir!, "owners", `${jobId}.owner.json`);
    const record = JSON.parse(fs.readFileSync(fp, "utf8")) as {
      heartbeatAt: string;
    };
    record.heartbeatAt = new Date(
      Date.now() - EXECUTION_OWNERSHIP_STALE_MS - 5_000,
    ).toISOString();
    fs.writeFileSync(fp, JSON.stringify(record, null, 2), "utf8");

    const recovered = acquireJobExecutionOwnership(jobId, freshOwner, store);
    expect(recovered.outcome).toBe("recovered_stale_owner");
    expect(recovered.record.ownerId).toBe(freshOwner);
  });

  it("registry rejects second in-process start for same job", () => {
    const store = tmpStore();
    resetJobExecutionOwnershipForTests(store);
    const job = createSearchJob(minimalConfig(), store);
    saveJobExecutionProfile(job.id, sampleExecution(), store);

    startSearchJobExecution(job.id, {
      storeOptions: store,
      preloadedCandlesByKey: {},
      evaluate: async () => ({
        passed: false,
        score: 0,
        paramsHash: "abc",
        failureReasons: [],
        costStressResults: [],
        jitterResults: [],
        windowResults: [],
      }),
    });

    expect(() =>
      startSearchJobExecution(job.id, { storeOptions: store }),
    ).toThrow(StrategySearchExecutionRegistryError);
  });

  it("existing trial contents are never overwritten when replay matches", () => {
    const store = tmpStore();
    resetJobExecutionOwnershipForTests(store);
    const job = createSearchJob(minimalConfig(), store);
    saveSearchTrial(
      {
        jobId: job.id,
        iteration: 0,
        paramsHash: "deadbeef0001",
        score: 1,
        passed: false,
        failureReasons: [],
        costStressResults: [],
        jitterResults: [],
        windowResults: [],
        params: {},
        createdAt: new Date().toISOString(),
      },
      store,
    );
    const readBack = fs.readFileSync(
      path.join(store.rootDir!, "trials", job.id, "00000000.json"),
      "utf8",
    );
    expect(readBack).toContain("deadbeef0001");
  });
});

describe("process owner id", () => {
  it("is stable within the process", () => {
    expect(getProcessExecutionOwnerId()).toBe(getProcessExecutionOwnerId());
  });
});
