import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as jobState from "@/src/lib/rextora/strategySearch/jobState";
import * as searchOrchestrator from "@/src/lib/rextora/strategySearch/searchOrchestrator";
import {
  isSearchJobExecutionActive,
  resetSearchJobExecutionRegistryForTests,
  startSearchJobExecution,
  UNEXPECTED_EXECUTION_FAILURE_MESSAGE,
  waitForSearchJobExecution,
} from "@/src/lib/rextora/strategySearch/jobExecutionRegistry";
import {
  isJobExecutionOwnedOnDisk,
  listJobExecutionOwnershipAudits,
  resetJobExecutionOwnershipForTests,
} from "@/src/lib/rextora/strategySearch/jobExecutionOwnership";
import { saveJobExecutionProfile } from "@/src/lib/rextora/strategySearch/jobExecutionProfile";
import {
  createSearchJob,
  getSearchJob,
  markSearchJobCancelled,
  markSearchJobCancelling,
  markSearchJobCompleted,
  markSearchJobFailed,
  markSearchJobInterrupted,
  markSearchJobPaused,
  requestCancelSearchJob,
  requestPauseSearchJob,
  type StrategySearchStoreOptions,
} from "@/src/lib/rextora/strategySearch/jobStore";
import {
  createEmptySearchPlan,
  getSearchPlan,
  saveSearchPlan,
} from "@/src/lib/rextora/strategySearch/searchPlan";
import type { StrategySearchConfig } from "@/src/lib/rextora/strategySearch/types";

const roots: string[] = [];
const FAKE_SECRET = "FAKE_SECRET_ABC123";

function tempStore(): StrategySearchStoreOptions {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "rextora-p1c2-"));
  roots.push(rootDir);
  return { rootDir };
}

function config(): StrategySearchConfig {
  return {
    searchVersion: "1",
    strategyTemplateId: "p1c2_execution_failure",
    symbols: ["BTCUSDT"],
    timeframe: "15m",
    dataVersion: "test-v1",
    seed: 17,
    generatorType: "random",
    maxIterations: 1,
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

function executionProfile() {
  return {
    version: 1 as const,
    balance: 10_000,
    baseCostConfig: {
      feeRate: 0,
      slippageRate: 0,
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
      parameterRanges: [],
    },
    dataRef: { availableFrom: 0, availableTo: 1, source: "preloaded" as const },
  };
}

function fixture(maxRuntimeMs = 3 * 60 * 60 * 1_000) {
  const store = tempStore();
  resetJobExecutionOwnershipForTests(store);
  const job = createSearchJob(config(), store);
  saveJobExecutionProfile(job.id, executionProfile(), store);
  saveSearchPlan(
    job.id,
    {
      ...createEmptySearchPlan({
        searchName: "P1-C2",
        depthProfile: "fast",
        qualificationProfile: "balanced",
        qualifiedTarget: 1,
        candidateBudget: 1,
        stageBatchSize: 1,
        maxRuntimeMs,
        spaces: [{ id: "ema_core", labelKo: "EMA" }],
      }),
      campaignStartedAtMs: Date.now(),
    },
    store,
  );
  return { store, jobId: job.id };
}

function deferredLoader() {
  let reject!: (reason: Error) => void;
  const promise = new Promise<Record<string, never[]>>((_, rejectPromise) => {
    reject = rejectPromise;
  });
  return { load: async () => promise, reject };
}

function persistedText(store: StrategySearchStoreOptions, jobId: string): string {
  const jobsDir = path.join(store.rootDir!, "jobs");
  return [
    fs.readFileSync(path.join(jobsDir, `${jobId}.json`), "utf8"),
    fs.readFileSync(path.join(jobsDir, `${jobId}.plan.json`), "utf8"),
    fs.readFileSync(path.join(store.rootDir!, "execution-ownership-audit.jsonl"), "utf8"),
  ].join("\n");
}

afterEach(() => {
  vi.restoreAllMocks();
  resetSearchJobExecutionRegistryForTests();
  while (roots.length) {
    const root = roots.pop();
    if (root) fs.rmSync(root, { recursive: true, force: true });
  }
});

describe("P1-C2 unexpected execution failure persistence", () => {
  it("persists a sanitized ENGINE_ERROR for candle/bootstrap rejection", async () => {
    const { store, jobId } = fixture();
    const loader = deferredLoader();
    startSearchJobExecution(jobId, { storeOptions: store, loadCandles: loader.load });
    const pending = waitForSearchJobExecution(jobId);

    expect(getSearchJob(jobId, store)?.status).toBe("running");
    loader.reject(new Error(`provider rejected ${FAKE_SECRET}`));
    await expect(pending).rejects.toMatchObject({
      code: "FATAL",
      message: UNEXPECTED_EXECUTION_FAILURE_MESSAGE,
    });

    const failed = getSearchJob(jobId, store)!;
    expect(failed.status).toBe("failed");
    expect(failed.finishedAt).toBeTruthy();
    expect(failed.failureMessage).toBe(UNEXPECTED_EXECUTION_FAILURE_MESSAGE);
    expect(getSearchPlan(jobId, store)?.completionReason).toBe("ENGINE_ERROR");
    expect(isSearchJobExecutionActive(jobId)).toBe(false);
    expect(isJobExecutionOwnedOnDisk(jobId, store)).toBe(false);
    const releases = listJobExecutionOwnershipAudits({ ...store, limit: 100 }).filter(
      (row) => row.jobId === jobId && row.event === "released",
    );
    expect(releases).toHaveLength(1);
    expect(releases[0]?.reason).toBe("runner_failed");
    expect(persistedText(store, jobId)).not.toContain(FAKE_SECRET);
  });

  it("persists the same sanitized failure when the orchestrator rejects", async () => {
    const { store, jobId } = fixture();
    vi.spyOn(searchOrchestrator, "runOrchestratedSearchJob").mockRejectedValueOnce(
      new Error(`orchestrator exploded ${FAKE_SECRET}`),
    );

    startSearchJobExecution(jobId, {
      storeOptions: store,
      preloadedCandlesByKey: {},
    });
    await expect(waitForSearchJobExecution(jobId)).rejects.toMatchObject({
      code: "FATAL",
      message: UNEXPECTED_EXECUTION_FAILURE_MESSAGE,
    });

    expect(getSearchJob(jobId, store)).toMatchObject({
      status: "failed",
      failureMessage: UNEXPECTED_EXECUTION_FAILURE_MESSAGE,
    });
    expect(getSearchPlan(jobId, store)?.completionReason).toBe("ENGINE_ERROR");
    expect(persistedText(store, jobId)).not.toContain(FAKE_SECRET);
  });

  it.each([
    "completed",
    "cancelled",
    "cancelling",
    "paused",
    "interrupted",
    "failed",
  ] as const)(
    "does not overwrite a durable %s state after a racing rejection",
    async (protectedStatus) => {
      const { store, jobId } = fixture();
      const loader = deferredLoader();
      startSearchJobExecution(jobId, { storeOptions: store, loadCandles: loader.load });
      const pending = waitForSearchJobExecution(jobId);

      if (protectedStatus === "completed") markSearchJobCompleted(jobId, store);
      if (protectedStatus === "cancelled") {
        requestCancelSearchJob(jobId, store);
        markSearchJobCancelling(jobId, store);
        markSearchJobCancelled(jobId, store);
      }
      if (protectedStatus === "cancelling") {
        requestCancelSearchJob(jobId, store);
        markSearchJobCancelling(jobId, store);
      }
      if (protectedStatus === "paused") {
        requestPauseSearchJob(jobId, store);
        markSearchJobPaused(jobId, store);
      }
      if (protectedStatus === "interrupted") markSearchJobInterrupted(jobId, store);
      if (protectedStatus === "failed") {
        markSearchJobFailed(jobId, "existing sanitized failure", store);
      }

      loader.reject(new Error(FAKE_SECRET));
      await expect(pending).resolves.toBeUndefined();
      expect(getSearchJob(jobId, store)?.status).toBe(protectedStatus);
      if (protectedStatus === "failed") {
        expect(getSearchJob(jobId, store)?.failureMessage).toBe(
          "existing sanitized failure",
        );
      }
      expect(persistedText(store, jobId)).not.toContain(FAKE_SECRET);
    },
  );

  it.each(["pause_requested", "cancel_requested"] as const)(
    "does not overwrite pending operator state %s",
    async (protectedStatus) => {
      const { store, jobId } = fixture();
      const loader = deferredLoader();
      startSearchJobExecution(jobId, { storeOptions: store, loadCandles: loader.load });
      const pending = waitForSearchJobExecution(jobId);
      if (protectedStatus === "pause_requested") requestPauseSearchJob(jobId, store);
      else requestCancelSearchJob(jobId, store);

      loader.reject(new Error(FAKE_SECRET));
      await expect(pending).resolves.toBeUndefined();
      expect(getSearchJob(jobId, store)?.status).toBe(protectedStatus);
      expect(persistedText(store, jobId)).not.toContain(FAKE_SECRET);
    },
  );

  it("keeps cleanup observable when failure persistence itself throws", async () => {
    const { store, jobId } = fixture();
    const loader = deferredLoader();
    vi.spyOn(jobState, "transitionJobToFailed").mockImplementationOnce(() => {
      throw new Error(`persistence failed ${FAKE_SECRET}`);
    });
    startSearchJobExecution(jobId, { storeOptions: store, loadCandles: loader.load });
    const pending = waitForSearchJobExecution(jobId);

    loader.reject(new Error(FAKE_SECRET));
    await expect(pending).rejects.toMatchObject({
      code: "FATAL",
      message: "전략 탐색 오류 상태를 저장하지 못했습니다.",
    });
    expect(isSearchJobExecutionActive(jobId)).toBe(false);
    expect(isJobExecutionOwnedOnDisk(jobId, store)).toBe(false);
    const releases = listJobExecutionOwnershipAudits({ ...store, limit: 100 }).filter(
      (row) => row.jobId === jobId && row.event === "released",
    );
    expect(releases).toHaveLength(1);
    expect(releases[0]?.reason).toBe("runner_failed");
    expect(persistedText(store, jobId)).not.toContain(FAKE_SECRET);
  });

  it("retains runner_finished and normal completion on success", async () => {
    const { store, jobId } = fixture(1);
    const plan = getSearchPlan(jobId, store)!;
    saveSearchPlan(
      jobId,
      { ...plan, campaignStartedAtMs: Date.now() - 1_000 },
      store,
    );
    startSearchJobExecution(jobId, {
      storeOptions: store,
      preloadedCandlesByKey: {},
    });
    await expect(waitForSearchJobExecution(jobId)).resolves.toBeUndefined();

    expect(getSearchJob(jobId, store)?.status).toBe("completed");
    expect(getSearchPlan(jobId, store)?.completionReason).toBe("DEADLINE_REACHED");
    const releases = listJobExecutionOwnershipAudits({ ...store, limit: 100 }).filter(
      (row) => row.jobId === jobId && row.event === "released",
    );
    expect(releases).toHaveLength(1);
    expect(releases[0]?.reason).toBe("runner_finished");
  });
});
