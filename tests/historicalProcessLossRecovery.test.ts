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
  EXECUTION_OWNERSHIP_STALE_MS,
  isJobExecutionOwnedOnDisk,
  recoverStaleJobExecutionOwnership,
  releaseJobExecutionOwnership,
  touchJobExecutionOwnershipHeartbeat,
} from "@/src/lib/rextora/strategySearch/jobExecutionOwnership";
import { saveJobExecutionProfile } from "@/src/lib/rextora/strategySearch/jobExecutionProfile";
import {
  createSearchJob,
  getSearchJob,
  markSearchJobRunning,
  updateSearchCheckpoint,
  type StrategySearchStoreOptions,
} from "@/src/lib/rextora/strategySearch/jobStore";
import {
  activeElapsedMs,
  createEmptySearchPlan,
  getSearchPlan,
  saveSearchPlan,
} from "@/src/lib/rextora/strategySearch/searchPlan";
import {
  isSearchJobExecutionActive,
  resetSearchJobExecutionRegistryForTests,
  setDefaultSearchJobExecutionDepsForTests,
  startSearchJobExecution,
  waitForSearchJobExecution,
} from "@/src/lib/rextora/strategySearch/jobExecutionRegistry";
import { recoverHistoricalProcessLossOrphans } from "@/src/lib/rextora/strategySearch/historicalProcessLossRecovery";
import {
  prepareInterruptedJobForRecovery,
} from "@/src/lib/rextora/strategySearch/processInterruption";
import type { StrategySearchConfig } from "@/src/lib/rextora/strategySearch/types";

const roots: string[] = [];
const T0 = Date.UTC(2026, 7, 1, 0, 0, 0);
const THREE_HOURS = 3 * 60 * 60 * 1_000;
const TEN_HOURS = 10 * 60 * 60 * 1_000;

function tempStore(): StrategySearchStoreOptions {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "rextora-p1c3-"));
  roots.push(rootDir);
  return { rootDir };
}

function config(): StrategySearchConfig {
  return {
    searchVersion: "1",
    strategyTemplateId: "p1c3_historical",
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

function createHistoricalOrphan(input: {
  activeMs: number;
  downtimeMs?: number;
  completedIterations?: number;
  checkpoint?: "valid" | "missing" | "invalid";
  heartbeat?: boolean;
  laterRelease?: boolean;
  campaignStartedAtMs?: number;
  trialAtNextIteration?: boolean;
}) {
  const store = tempStore();
  vi.setSystemTime(T0);
  const job = createSearchJob(config(), store);
  saveJobExecutionProfile(job.id, executionProfile(), store);
  markSearchJobRunning(job.id, store);
  const campaignStartedAtMs = input.campaignStartedAtMs ?? T0;
  saveSearchPlan(
    job.id,
    {
      ...createEmptySearchPlan({
        searchName: "P1-C3",
        depthProfile: "fast",
        qualificationProfile: "balanced",
        qualifiedTarget: 1,
        candidateBudget: 100,
        stageBatchSize: 10,
        maxRuntimeMs: THREE_HOURS,
        spaces: [{ id: "ema_core", labelKo: "EMA" }],
      }),
      campaignStartedAtMs,
      elapsedMs: input.activeMs,
      expectedCompletionAtMs: campaignStartedAtMs + THREE_HOURS,
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
  if (input.heartbeat !== false) {
    touchJobExecutionOwnershipHeartbeat(job.id, "dead_process_owner", store);
  }
  if (input.trialAtNextIteration) {
    const trialDir = path.join(store.rootDir!, "trials", job.id);
    fs.mkdirSync(trialDir, { recursive: true });
    fs.writeFileSync(
      path.join(trialDir, `${String(completed).padStart(8, "0")}.json`),
      JSON.stringify({ jobId: job.id, iteration: completed }),
    );
  }
  vi.setSystemTime(boundary + EXECUTION_OWNERSHIP_STALE_MS + 1);
  recoverStaleJobExecutionOwnership(store);
  if (input.laterRelease) {
    acquireJobExecutionOwnership(job.id, "later_owner", store);
    releaseJobExecutionOwnership(job.id, "later_owner", "runner_finished", store);
  }
  vi.setSystemTime(boundary + (input.downtimeMs ?? TEN_HOURS));
  return { store, jobId: job.id, boundary, checkpoint, completed };
}

afterEach(() => {
  setDefaultSearchJobExecutionDepsForTests(null);
  resetSearchJobExecutionRegistryForTests();
  vi.restoreAllMocks();
  vi.useRealTimers();
  while (roots.length) {
    const root = roots.pop();
    if (root) fs.rmSync(root, { recursive: true, force: true });
  }
});

describe("P1-C3 historical process-loss recovery", () => {
  it("classifies a recoverable orphan and applies interrupted timing on a temp store", () => {
    vi.useFakeTimers();
    const activeMs = 45 * 60 * 1_000;
    const fixture = createHistoricalOrphan({ activeMs, completedIterations: 37 });
    const now = fixture.boundary + TEN_HOURS;

    const dry = recoverHistoricalProcessLossOrphans({
      dryRun: true,
      storeOptions: fixture.store,
      now,
    });
    expect(dry.candidates).toHaveLength(1);
    const candidate = dry.candidates[0]!;
    expect(candidate.classification).toBe(
      "SAFE_TO_MIGRATE_INTERRUPTED_AND_RESUME",
    );
    expect(candidate.processLossEvidence).toBe("CONFIRMED");
    expect(candidate.checkpointVerdict).toBe("CHECKPOINT_VALID");
    expect(candidate.activeElapsedAtInterruptionMs).toBe(activeMs);
    expect(candidate.reconstructedRemainingMs).toBe(135 * 60 * 1_000);
    expect(candidate.reconstructedDowntimeMs).toBe(TEN_HOURS);

    const applied = recoverHistoricalProcessLossOrphans({
      dryRun: false,
      expectedCandidates: dry.candidates,
      storeOptions: fixture.store,
      now,
    });
    expect(applied.results).toEqual([
      {
        jobId: fixture.jobId,
        outcome: "APPLIED_INTERRUPTED",
        status: "interrupted",
      },
    ]);
    const persisted = getSearchJob(fixture.jobId, fixture.store)!;
    const plan = getSearchPlan(fixture.jobId, fixture.store)!;
    expect(persisted.status).toBe("interrupted");
    expect(persisted.checkpoint.nextIteration).toBe(37);
    expect(plan.interruptedAtMs).toBe(fixture.boundary);
    expect(activeElapsedMs(plan, now)).toBe(activeMs);
    expect(isJobExecutionOwnedOnDisk(fixture.jobId, fixture.store)).toBe(false);
    expect(isSearchJobExecutionActive(fixture.jobId)).toBe(false);

    const queued = prepareInterruptedJobForRecovery(
      fixture.jobId,
      now,
      fixture.store,
    );
    expect(queued.status).toBe("queued");
    markSearchJobRunning(fixture.jobId, fixture.store);
    expect(getSearchJob(fixture.jobId, fixture.store)?.status).toBe("running");
    expect(
      getSearchJob(fixture.jobId, fixture.store)?.checkpoint.nextIteration,
    ).toBe(37);
  });

  it("completes a true ACTIVE budget exhaustion without starting a worker", async () => {
    vi.useFakeTimers();
    const fixture = createHistoricalOrphan({ activeMs: THREE_HOURS });
    const now = fixture.boundary + TEN_HOURS;
    const dry = recoverHistoricalProcessLossOrphans({
      dryRun: true,
      storeOptions: fixture.store,
      now,
    });
    expect(dry.candidates[0]?.classification).toBe(
      "SAFE_TO_MIGRATE_INTERRUPTED_AND_COMPLETE_DEADLINE",
    );

    let started = 0;
    setDefaultSearchJobExecutionDepsForTests({
      storeOptions: fixture.store,
      preloadedCandlesByKey: {},
      evaluate: async () => {
        started += 1;
        return {
          passed: false,
          score: 0,
          paramsHash: "x",
          failureReasons: [],
          costStressResults: [],
          jitterResults: [],
          windowResults: [],
        };
      },
    });
    const applied = recoverHistoricalProcessLossOrphans({
      dryRun: false,
      expectedCandidates: dry.candidates,
      storeOptions: fixture.store,
      now,
    });
    expect(applied.results[0]?.outcome).toBe("APPLIED_DEADLINE");
    expect(getSearchJob(fixture.jobId, fixture.store)?.status).toBe("completed");
    expect(getSearchPlan(fixture.jobId, fixture.store)?.completionReason).toBe(
      "DEADLINE_REACHED",
    );
    expect(started).toBe(0);
    expect(isSearchJobExecutionActive(fixture.jobId)).toBe(false);
  });

  it("keeps a no-heartbeat strongly-supported record in operator review", () => {
    vi.useFakeTimers();
    const fixture = createHistoricalOrphan({
      activeMs: 45 * 60 * 1_000,
      heartbeat: false,
    });
    const dry = recoverHistoricalProcessLossOrphans({
      dryRun: true,
      storeOptions: fixture.store,
      now: fixture.boundary + TEN_HOURS,
    });
    expect(dry.candidates[0]?.processLossEvidence).toBe("STRONGLY_SUPPORTED");
    expect(dry.candidates[0]?.classification).toBe("REQUIRES_OPERATOR_REVIEW");
    expect(dry.candidates[0]?.blockers).toContain(
      "PROCESS_LOSS_STRONGLY_SUPPORTED_ONLY",
    );
    const applied = recoverHistoricalProcessLossOrphans({
      dryRun: false,
      expectedCandidates: dry.candidates,
      storeOptions: fixture.store,
      now: fixture.boundary + TEN_HOURS,
    });
    expect(applied.results[0]?.outcome).toBe("PRECONDITION_FAILED");
    expect(getSearchJob(fixture.jobId, fixture.store)?.status).toBe("running");
  });

  it("sends timing ambiguity to operator review", () => {
    vi.useFakeTimers();
    const fixture = createHistoricalOrphan({
      activeMs: 45 * 60 * 1_000,
      campaignStartedAtMs: T0 + TEN_HOURS,
    });
    const dry = recoverHistoricalProcessLossOrphans({
      dryRun: true,
      storeOptions: fixture.store,
      now: fixture.boundary + TEN_HOURS,
    });
    expect(dry.candidates[0]?.classification).toBe("REQUIRES_OPERATOR_REVIEW");
    expect(dry.candidates[0]?.blockers).toContain("TIMING_AMBIGUOUS");
  });

  it("does not auto-migrate an invalid checkpoint", () => {
    vi.useFakeTimers();
    const fixture = createHistoricalOrphan({
      activeMs: 45 * 60 * 1_000,
      checkpoint: "invalid",
    });
    const dry = recoverHistoricalProcessLossOrphans({
      dryRun: true,
      storeOptions: fixture.store,
      now: fixture.boundary + TEN_HOURS,
    });
    expect(dry.candidates[0]?.checkpointVerdict).toBe("CHECKPOINT_INVALID");
    expect(dry.candidates[0]?.classification).toBe("DO_NOT_TOUCH");
    const applied = recoverHistoricalProcessLossOrphans({
      dryRun: false,
      expectedCandidates: dry.candidates,
      storeOptions: fixture.store,
      now: fixture.boundary + TEN_HOURS,
    });
    expect(applied.results[0]?.outcome).toBe("PRECONDITION_FAILED");
    expect(getSearchJob(fixture.jobId, fixture.store)?.status).toBe("running");
  });

  it("fails apply when evidence changes after dry-run", () => {
    vi.useFakeTimers();
    const fixture = createHistoricalOrphan({ activeMs: 45 * 60 * 1_000 });
    const now = fixture.boundary + TEN_HOURS;
    const dry = recoverHistoricalProcessLossOrphans({
      dryRun: true,
      storeOptions: fixture.store,
      now,
    });
    updateSearchCheckpoint(
      fixture.jobId,
      {
        ...getSearchJob(fixture.jobId, fixture.store)!.checkpoint,
        completedIterations: 99,
        nextIteration: 99,
      },
      fixture.store,
    );
    const applied = recoverHistoricalProcessLossOrphans({
      dryRun: false,
      expectedCandidates: dry.candidates,
      storeOptions: fixture.store,
      now,
    });
    expect(applied.results[0]?.outcome).toBe("PRECONDITION_FAILED");
    expect(getSearchJob(fixture.jobId, fixture.store)?.status).toBe("running");
  });

  it("fails apply when an active owner appears after dry-run", () => {
    vi.useFakeTimers();
    const fixture = createHistoricalOrphan({ activeMs: 45 * 60 * 1_000 });
    const now = fixture.boundary + TEN_HOURS;
    const dry = recoverHistoricalProcessLossOrphans({
      dryRun: true,
      storeOptions: fixture.store,
      now,
    });
    acquireJobExecutionOwnership(fixture.jobId, "live_owner", fixture.store);
    const applied = recoverHistoricalProcessLossOrphans({
      dryRun: false,
      expectedCandidates: dry.candidates,
      storeOptions: fixture.store,
      now,
    });
    expect(applied.results[0]?.outcome).toBe("PRECONDITION_FAILED");
    expect(getSearchJob(fixture.jobId, fixture.store)?.status).toBe("running");
    expect(isJobExecutionOwnedOnDisk(fixture.jobId, fixture.store)).toBe(true);
  });

  it("is idempotent: a second apply is PRECONDITION_FAILED", () => {
    vi.useFakeTimers();
    const fixture = createHistoricalOrphan({ activeMs: 45 * 60 * 1_000 });
    const now = fixture.boundary + TEN_HOURS;
    const dry = recoverHistoricalProcessLossOrphans({
      dryRun: true,
      storeOptions: fixture.store,
      now,
    });
    const first = recoverHistoricalProcessLossOrphans({
      dryRun: false,
      expectedCandidates: dry.candidates,
      storeOptions: fixture.store,
      now,
    });
    const second = recoverHistoricalProcessLossOrphans({
      dryRun: false,
      expectedCandidates: dry.candidates,
      storeOptions: fixture.store,
      now,
    });
    expect(first.results[0]?.outcome).toBe("APPLIED_INTERRUPTED");
    expect(second.results[0]?.outcome).toBe("PRECONDITION_FAILED");
    expect(getSearchJob(fixture.jobId, fixture.store)?.status).toBe(
      "interrupted",
    );
  });

  it("resumes checkpoint N from the durable next iteration without duplicating prior work", async () => {
    vi.useFakeTimers();
    const fixture = createHistoricalOrphan({
      activeMs: 45 * 60 * 1_000,
      completedIterations: 37,
    });
    const now = fixture.boundary + TEN_HOURS;
    const dry = recoverHistoricalProcessLossOrphans({
      dryRun: true,
      storeOptions: fixture.store,
      now,
    });
    recoverHistoricalProcessLossOrphans({
      dryRun: false,
      expectedCandidates: dry.candidates,
      storeOptions: fixture.store,
      now,
    });
    prepareInterruptedJobForRecovery(fixture.jobId, now, fixture.store);

    let evaluatedIteration: number | null = null;
    setDefaultSearchJobExecutionDepsForTests({
      storeOptions: fixture.store,
      preloadedCandlesByKey: {},
      evaluate: async (input) => {
        evaluatedIteration = input.candidate.iteration;
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
    startSearchJobExecution(fixture.jobId, { storeOptions: fixture.store });
    for (let attempt = 0; attempt < 40 && evaluatedIteration == null; attempt += 1) {
      await vi.advanceTimersByTimeAsync(1);
    }
    const running = getSearchJob(fixture.jobId, fixture.store)!;
    expect(running.checkpoint.nextIteration).toBe(37);
    expect(running.checkpoint.completedIterations).toBe(37);
    expect(readRunnerPayloadFromCheckpoint(running.checkpoint)).toMatchObject({
      prng: { algorithm: "mulberry32", seed: 7, state: 123 },
      seenHashes: Array.from({ length: 37 }, (_, i) => `hash_${i}`),
    });
    expect(evaluatedIteration).toBe(37);
    await waitForSearchJobExecution(fixture.jobId);
  });

  it("treats a later ownership release after recovered_stale as do-not-touch", () => {
    vi.useFakeTimers();
    const fixture = createHistoricalOrphan({
      activeMs: 45 * 60 * 1_000,
      laterRelease: true,
    });
    const dry = recoverHistoricalProcessLossOrphans({
      dryRun: true,
      storeOptions: fixture.store,
      now: fixture.boundary + TEN_HOURS,
    });
    expect(dry.candidates[0]?.classification).toBe("DO_NOT_TOUCH");
    expect(dry.candidates[0]?.blockers).toContain(
      "PROCESS_LOSS_NOT_ESTABLISHED",
    );
  });

  it("sends a trial-at-next-iteration checkpoint to operator review", () => {
    vi.useFakeTimers();
    const fixture = createHistoricalOrphan({
      activeMs: 45 * 60 * 1_000,
      trialAtNextIteration: true,
    });
    const dry = recoverHistoricalProcessLossOrphans({
      dryRun: true,
      storeOptions: fixture.store,
      now: fixture.boundary + TEN_HOURS,
    });
    expect(dry.candidates[0]?.checkpointVerdict).toBe("CHECKPOINT_AMBIGUOUS");
    expect(dry.candidates[0]?.classification).toBe("REQUIRES_OPERATOR_REVIEW");
  });
});
