import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createInitialRunnerPayload,
  buildPersistedCheckpoint,
  readRunnerPayloadFromCheckpoint,
} from "@/src/lib/rextora/strategySearch/jobCheckpoint";
import {
  acquireJobExecutionOwnership,
  isJobExecutionOwnedOnDisk,
} from "@/src/lib/rextora/strategySearch/jobExecutionOwnership";
import { saveJobExecutionProfile } from "@/src/lib/rextora/strategySearch/jobExecutionProfile";
import {
  createSearchJob,
  getSearchJob,
  markSearchJobPaused,
  markSearchJobRunning,
  requestPauseSearchJob,
  requestCancelSearchJob,
  updateSearchCheckpoint,
  type StrategySearchStoreOptions,
} from "@/src/lib/rextora/strategySearch/jobStore";
import {
  activeElapsedMs,
  createEmptySearchPlan,
  getSearchPlan,
  markPlanInterrupted,
  saveSearchPlan,
} from "@/src/lib/rextora/strategySearch/searchPlan";
import { recoverOrphanSearchJobs } from "@/src/lib/rextora/strategySearch/orphanJobRecovery";
import {
  isSearchJobExecutionActive,
  resetSearchJobExecutionRegistryForTests,
  setDefaultSearchJobExecutionDepsForTests,
  waitForSearchJobExecution,
} from "@/src/lib/rextora/strategySearch/jobExecutionRegistry";
import { transitionJobToInterrupted } from "@/src/lib/rextora/strategySearch/jobState";
import {
  cancelStrategySearchJobApi,
  getStrategySearchJobApi,
} from "@/src/lib/rextora/strategySearch/jobApiService";
import { researchStatusLabelKo } from "@/components/rextora/strategySearch/formatters";
import type { StrategySearchConfig } from "@/src/lib/rextora/strategySearch/types";

const roots: string[] = [];
const T0 = Date.UTC(2026, 7, 1, 0, 0, 0);
const THREE_HOURS = 3 * 60 * 60 * 1_000;
const TEN_HOURS = 10 * 60 * 60 * 1_000;

function tempStore(): StrategySearchStoreOptions {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "rextora-p1c1-"));
  roots.push(rootDir);
  return { rootDir };
}

function config(): StrategySearchConfig {
  return {
    searchVersion: "1",
    strategyTemplateId: "p1c1_process_loss",
    symbols: ["BTCUSDT"],
    timeframe: "15m",
    dataVersion: "test-v1",
    seed: 7,
    generatorType: "random",
    maxIterations: 100,
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

function createProcessLossFixture(input: {
  activeMs: number;
  downtimeMs?: number;
  completedIterations?: number;
  checkpoint?: "valid" | "missing" | "invalid";
}) {
  const store = tempStore();
  vi.setSystemTime(T0);
  const job = createSearchJob(config(), store);
  saveJobExecutionProfile(job.id, executionProfile(), store);
  markSearchJobRunning(job.id, store);
  saveSearchPlan(
    job.id,
    {
      ...createEmptySearchPlan({
        searchName: "P1-C1",
        depthProfile: "fast",
        qualificationProfile: "balanced",
        qualifiedTarget: 1,
        candidateBudget: 100,
        stageBatchSize: 10,
        maxRuntimeMs: THREE_HOURS,
        spaces: [{ id: "ema_core", labelKo: "EMA" }],
      }),
      campaignStartedAtMs: T0,
      elapsedMs: input.activeMs,
      expectedCompletionAtMs: T0 + THREE_HOURS,
    },
    store,
  );

  const boundary = T0 + input.activeMs;
  vi.setSystemTime(boundary);
  const completed = input.completedIterations ?? 12;
  const payload = {
    ...createInitialRunnerPayload({
      prng: { algorithm: "mulberry32" as const, seed: 7, state: 123 },
      jobStatus: "running",
    }),
    seenHashes: Array.from({ length: completed }, (_, i) => `hash_${i}`),
  };
  const checkpoint =
    input.checkpoint === "missing"
      ? {
          completedIterations: completed,
          nextIteration: completed,
          randomState: null,
          bestCandidate: null,
          bestPassedCandidate: null,
          updatedAt: new Date(boundary).toISOString(),
        }
      : input.checkpoint === "invalid"
        ? {
            completedIterations: completed,
            nextIteration: completed,
            randomState: "{invalid",
            bestCandidate: null,
            bestPassedCandidate: null,
            updatedAt: new Date(boundary).toISOString(),
          }
        : buildPersistedCheckpoint({
            completedIterations: completed,
            nextIteration: completed,
            payload,
            bestCandidate: null,
            bestPassedCandidate: null,
            updatedAt: new Date(boundary).toISOString(),
          });
  updateSearchCheckpoint(job.id, checkpoint, store);
  acquireJobExecutionOwnership(job.id, "dead_process_owner", store);
  vi.setSystemTime(boundary + (input.downtimeMs ?? TEN_HOURS));
  return { store, jobId: job.id, boundary, checkpoint };
}

afterEach(() => {
  setDefaultSearchJobExecutionDepsForTests(null);
  resetSearchJobExecutionRegistryForTests();
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.useRealTimers();
  while (roots.length) {
    const root = roots.pop();
    if (root) fs.rmSync(root, { recursive: true, force: true });
  }
});

describe("P1-C1 process interruption lifecycle", () => {
  it("transitions proven stale ownership to interrupted and freezes active time", () => {
    vi.useFakeTimers();
    const activeMs = 45 * 60 * 1_000;
    const fixture = createProcessLossFixture({ activeMs });
    vi.stubEnv("REXTORA_ORPHAN_AUTO_RESUME_LIMIT", "0");

    const result = recoverOrphanSearchJobs(fixture.store);
    const persisted = getSearchJob(fixture.jobId, fixture.store)!;
    const plan = getSearchPlan(fixture.jobId, fixture.store)!;

    expect(result.interrupted).toEqual([fixture.jobId]);
    expect(persisted.status).toBe("interrupted");
    expect(persisted.checkpoint).toEqual(fixture.checkpoint);
    expect(isJobExecutionOwnedOnDisk(fixture.jobId, fixture.store)).toBe(false);
    expect(plan.interruptedAtMs).toBe(fixture.boundary);
    expect(activeElapsedMs(plan)).toBe(activeMs);
    expect(THREE_HOURS - activeElapsedMs(plan)).toBe(135 * 60 * 1_000);
  });

  it("reports interrupted without an active execution and preserves cancellation", () => {
    vi.useFakeTimers();
    const activeMs = 45 * 60 * 1_000;
    const fixture = createProcessLossFixture({ activeMs });
    vi.stubEnv("REXTORA_ORPHAN_AUTO_RESUME_LIMIT", "0");
    recoverOrphanSearchJobs(fixture.store);

    const detail = getStrategySearchJobApi(fixture.jobId, fixture.store);
    expect(detail.status).toBe("interrupted");
    expect(detail.executionActive).toBe(false);
    expect(detail.elapsedMs).toBe(activeMs);
    expect(detail.remainingMs).toBe(135 * 60 * 1_000);
    expect(detail.recoveryBlocker).toBeNull();
    expect(researchStatusLabelKo(detail.status)).toBe("실행 중단");

    const cancelled = cancelStrategySearchJobApi(fixture.jobId, fixture.store);
    expect(cancelled.status).toBe("cancelled");
  });

  it("recovers interrupted through queued to running and preserves checkpoint", async () => {
    vi.useFakeTimers();
    const fixture = createProcessLossFixture({
      activeMs: 45 * 60 * 1_000,
      completedIterations: 37,
    });
    vi.stubEnv("REXTORA_ORPHAN_AUTO_RESUME_LIMIT", "2");
    const api = await import(
      "@/src/lib/rextora/strategySearch/jobApiService"
    );
    const startSpy = vi
      .spyOn(api, "startStrategySearchJobApi")
      .mockImplementation((jobId, deps) => {
        markSearchJobRunning(jobId, deps.storeOptions);
        return {} as never;
      });

    const result = recoverOrphanSearchJobs(fixture.store);
    const persisted = getSearchJob(fixture.jobId, fixture.store)!;
    const plan = getSearchPlan(fixture.jobId, fixture.store)!;

    expect(result.interrupted).toEqual([fixture.jobId]);
    expect(result.resumed).toEqual([fixture.jobId]);
    expect(startSpy).toHaveBeenCalledTimes(1);
    expect(persisted.status).toBe("running");
    expect(persisted.checkpoint).toEqual(fixture.checkpoint);
    expect(persisted.checkpoint.nextIteration).toBe(37);
    expect(plan.interruptedAtMs).toBeNull();
    expect(plan.accumulatedInterruptionMs).toBe(TEN_HOURS);
    expect(activeElapsedMs(plan)).toBe(45 * 60 * 1_000);
  });

  it("runs the isolated 45m + 10h recovery canary through the normal worker path", async () => {
    vi.useFakeTimers();
    const fixture = createProcessLossFixture({
      activeMs: 45 * 60 * 1_000,
      completedIterations: 37,
    });
    vi.stubEnv("REXTORA_ORPHAN_AUTO_RESUME_LIMIT", "2");

    let releaseEvaluation!: () => void;
    const evaluationGate = new Promise<void>((resolve) => {
      releaseEvaluation = resolve;
    });
    let evaluatedIteration: number | null = null;
    setDefaultSearchJobExecutionDepsForTests({
      storeOptions: fixture.store,
      preloadedCandlesByKey: {},
      evaluate: async (input) => {
        evaluatedIteration = input.candidate.iteration;
        await evaluationGate;
        return {
          passed: false,
          score: 0,
          paramsHash: input.candidate.paramsHash,
          failureReasons: [],
          costStressResults: [],
          jitterResults: [],
          windowResults: [],
        };
      },
    });
    const api = await import(
      "@/src/lib/rextora/strategySearch/jobApiService"
    );
    const actualStart = api.startStrategySearchJobApi;
    const statusAtNormalStart: string[] = [];
    const startSpy = vi
      .spyOn(api, "startStrategySearchJobApi")
      .mockImplementation((jobId, deps) => {
        statusAtNormalStart.push(
          getSearchJob(jobId, deps.storeOptions)?.status ?? "missing",
        );
        return actualStart(jobId, deps);
      });

    const result = recoverOrphanSearchJobs(fixture.store);
    for (let attempt = 0; attempt < 20 && evaluatedIteration == null; attempt += 1) {
      await vi.advanceTimersByTimeAsync(1);
    }

    const running = getSearchJob(fixture.jobId, fixture.store)!;
    const plan = getSearchPlan(fixture.jobId, fixture.store)!;
    const ownerFiles = fs
      .readdirSync(path.join(fixture.store.rootDir!, "owners"))
      .filter((name) => name.endsWith(".owner.json"));

    expect(result.interrupted).toEqual([fixture.jobId]);
    expect(result.resumed).toEqual([fixture.jobId]);
    expect(statusAtNormalStart).toEqual(["queued"]);
    expect(startSpy).toHaveBeenCalledTimes(1);
    expect(running.status).toBe("running");
    expect(isSearchJobExecutionActive(fixture.jobId)).toBe(true);
    expect(ownerFiles).toHaveLength(1);
    expect(running.checkpoint.nextIteration).toBe(37);
    expect(running.checkpoint.completedIterations).toBe(37);
    expect(readRunnerPayloadFromCheckpoint(running.checkpoint)).toMatchObject({
      prng: { algorithm: "mulberry32", seed: 7, state: 123 },
      seenHashes: Array.from({ length: 37 }, (_, i) => `hash_${i}`),
    });
    expect(evaluatedIteration).toBe(37);
    expect(plan.accumulatedInterruptionMs).toBe(TEN_HOURS);
    expect(activeElapsedMs(plan)).toBeGreaterThanOrEqual(45 * 60 * 1_000);
    expect(activeElapsedMs(plan)).toBeLessThan(45 * 60 * 1_000 + 20);
    expect(THREE_HOURS - activeElapsedMs(plan)).toBeGreaterThan(
      135 * 60 * 1_000 - 20,
    );

    requestCancelSearchJob(fixture.jobId, fixture.store);
    releaseEvaluation();
    for (
      let attempt = 0;
      attempt < 20 && isSearchJobExecutionActive(fixture.jobId);
      attempt += 1
    ) {
      await vi.advanceTimersByTimeAsync(1);
    }
    await waitForSearchJobExecution(fixture.jobId);
    expect(isSearchJobExecutionActive(fixture.jobId)).toBe(false);
    expect(isJobExecutionOwnedOnDisk(fixture.jobId, fixture.store)).toBe(false);
  });

  it("completes a truly exhausted active budget without starting a worker", async () => {
    vi.useFakeTimers();
    const fixture = createProcessLossFixture({ activeMs: THREE_HOURS });
    vi.stubEnv("REXTORA_ORPHAN_AUTO_RESUME_LIMIT", "2");
    const api = await import(
      "@/src/lib/rextora/strategySearch/jobApiService"
    );
    const startSpy = vi.spyOn(api, "startStrategySearchJobApi");

    const result = recoverOrphanSearchJobs(fixture.store);

    expect(result.deadlineCompleted).toEqual([fixture.jobId]);
    expect(result.resumed).toEqual([]);
    expect(startSpy).not.toHaveBeenCalled();
    expect(getSearchJob(fixture.jobId, fixture.store)?.status).toBe("completed");
    expect(getSearchPlan(fixture.jobId, fixture.store)?.completionReason).toBe(
      "DEADLINE_REACHED",
    );
  });

  it.each(["missing", "invalid"] as const)(
    "leaves an interrupted job with %s checkpoint blocked",
    async (checkpoint) => {
      vi.useFakeTimers();
      const fixture = createProcessLossFixture({
        activeMs: 45 * 60 * 1_000,
        checkpoint,
      });
      vi.stubEnv("REXTORA_ORPHAN_AUTO_RESUME_LIMIT", "2");
      const api = await import(
        "@/src/lib/rextora/strategySearch/jobApiService"
      );
      const startSpy = vi.spyOn(api, "startStrategySearchJobApi");

      const result = recoverOrphanSearchJobs(fixture.store);

      expect(result.resumed).toEqual([]);
      expect(result.recoveryBlocked).toEqual([
        {
          jobId: fixture.jobId,
          reason:
            checkpoint === "missing"
              ? "MISSING_CHECKPOINT"
              : "INVALID_CHECKPOINT",
        },
      ]);
      expect(startSpy).not.toHaveBeenCalled();
      expect(getSearchJob(fixture.jobId, fixture.store)?.status).toBe(
        "interrupted",
      );
    },
  );

  it("does not recover a running or interrupted job with a fresh owner", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(T0);
    const store = tempStore();
    const running = createSearchJob(config(), store);
    markSearchJobRunning(running.id, store);
    acquireJobExecutionOwnership(running.id, "fresh_running", store);

    const interrupted = createSearchJob(config(), store);
    markSearchJobRunning(interrupted.id, store);
    transitionJobToInterrupted(interrupted.id, store);
    const plan = {
      ...createEmptySearchPlan({
        searchName: "active owner",
        depthProfile: "fast",
        qualificationProfile: "balanced",
        qualifiedTarget: 1,
        candidateBudget: 1,
        stageBatchSize: 1,
        maxRuntimeMs: THREE_HOURS,
        spaces: [{ id: "ema_core", labelKo: "EMA" }],
      }),
      campaignStartedAtMs: T0,
    };
    saveSearchPlan(
      interrupted.id,
      markPlanInterrupted(plan, T0, T0),
      store,
    );
    acquireJobExecutionOwnership(interrupted.id, "fresh_interrupted", store);
    vi.stubEnv("REXTORA_ORPHAN_AUTO_RESUME_LIMIT", "2");
    const api = await import(
      "@/src/lib/rextora/strategySearch/jobApiService"
    );
    const startSpy = vi.spyOn(api, "startStrategySearchJobApi");

    const result = recoverOrphanSearchJobs(store);

    expect(result.resumed).toEqual([]);
    expect(startSpy).not.toHaveBeenCalled();
    expect(getSearchJob(running.id, store)?.status).toBe("running");
    expect(getSearchJob(interrupted.id, store)?.status).toBe("interrupted");
  });

  it("preserves pause/cancel states and repeated recovery creates one start", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(T0);
    const controlStore = tempStore();
    const paused = createSearchJob(config(), controlStore);
    markSearchJobRunning(paused.id, controlStore);
    requestPauseSearchJob(paused.id, controlStore);
    markSearchJobPaused(paused.id, controlStore);
    const cancelling = createSearchJob(config(), controlStore);
    markSearchJobRunning(cancelling.id, controlStore);
    requestCancelSearchJob(cancelling.id, controlStore);
    recoverOrphanSearchJobs(controlStore);
    expect(getSearchJob(paused.id, controlStore)?.status).toBe("paused");
    expect(getSearchJob(cancelling.id, controlStore)?.status).toBe(
      "cancel_requested",
    );

    const fixture = createProcessLossFixture({ activeMs: 45 * 60 * 1_000 });
    vi.stubEnv("REXTORA_ORPHAN_AUTO_RESUME_LIMIT", "2");
    const api = await import(
      "@/src/lib/rextora/strategySearch/jobApiService"
    );
    const startSpy = vi
      .spyOn(api, "startStrategySearchJobApi")
      .mockImplementation((jobId, deps) => {
        markSearchJobRunning(jobId, deps.storeOptions);
        return {} as never;
      });

    recoverOrphanSearchJobs(fixture.store);
    recoverOrphanSearchJobs(fixture.store);

    expect(startSpy).toHaveBeenCalledTimes(1);
    expect(getSearchJob(fixture.jobId, fixture.store)?.status).toBe("running");
  });
});
