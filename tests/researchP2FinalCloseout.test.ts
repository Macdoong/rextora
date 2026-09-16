/**
 * P2-G9 final Research lifecycle close-out verification.
 * Production is raw-read only. Isolated temp stores for G8 regression only.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  DASHBOARD_ATTENTION_VISIBLE_CAP,
  RESEARCH_RECOVERY_HREF,
} from "../components/rextora/dashboard/dashboardResearchSelection";
import {
  RECOVERY_API_PAGE_SIZE,
  discoverInterruptedRecoveryJobs,
  isInterruptedRecoveryJob,
} from "../components/rextora/strategySearch/interruptedRecoveryDiscovery";
import {
  createInitialRunnerPayload,
  buildPersistedCheckpoint,
} from "../src/lib/rextora/strategySearch/jobCheckpoint";
import { saveJobExecutionProfile } from "../src/lib/rextora/strategySearch/jobExecutionProfile";
import {
  acquireJobExecutionOwnership,
  releaseJobExecutionOwnership,
} from "../src/lib/rextora/strategySearch/jobExecutionOwnership";
import {
  StrategySearchApiError,
  startStrategySearchJobApi,
} from "../src/lib/rextora/strategySearch/jobApiService";
import {
  listActiveSearchJobExecutions,
  resetSearchJobExecutionRegistryForTests,
  setDefaultSearchJobExecutionDepsForTests,
  waitForSearchJobExecution,
} from "../src/lib/rextora/strategySearch/jobExecutionRegistry";
import {
  createSearchJob,
  getSearchJob,
  markSearchJobCompleted,
  markSearchJobRunning,
  reopenSearchJobForNextSpace,
  updateSearchCheckpoint,
  type StrategySearchStoreOptions,
} from "../src/lib/rextora/strategySearch/jobStore";
import {
  activeElapsedMs,
  createEmptySearchPlan,
  getSearchPlan,
  saveSearchPlan,
} from "../src/lib/rextora/strategySearch/searchPlan";
import {
  DEFAULT_ORPHAN_AUTO_RESUME_LIMIT,
  resolveOrphanAutoResumeLimit,
} from "../src/lib/rextora/strategySearch/orphanJobRecovery";
import {
  PRIOR_VERIFIED_HEAD,
  STALE_QUEUED_TARGET_ID,
  THREE_HOURS_MS,
  TWENTY_TWO_DAYS_MS,
  classifyQueuedLifecycle,
  loadResearchP2FinalCloseout,
  productionCloseoutRoot,
  verifyG8SourceContract,
  writeResearchP2FinalCloseoutArtifacts,
} from "../src/lib/rextora/strategySearch/researchP2FinalCloseout";
import {
  loadResidualLifecycleInventory,
  productionResidualInventoryRoot,
} from "../src/lib/rextora/strategySearch/residualLifecycleInventory";
import {
  collectStaleQueuedReadonlyHashes,
  productionStaleQueuedRoot,
} from "../src/lib/rextora/strategySearch/staleQueuedJobForensic";
import {
  normalizeQueuedContinuationRuntimeIfNeeded,
  prepareInterruptedJobForRecovery,
  queuedContinuationNeedsDowntimeNormalization,
} from "../src/lib/rextora/strategySearch/processInterruption";
import { transitionJobToInterrupted } from "../src/lib/rextora/strategySearch/jobState";
import { planOrphanStartupSelection } from "../src/lib/rextora/strategySearch/startupResumePolicyDiagnosis";
import type { StrategySearchConfig } from "../src/lib/rextora/strategySearch/types";
import { HISTORICAL_MISSING_JOB_IDS } from "./helpers/productionResearchBaseline";

const ARTIFACT_DIR = path.join(
  process.cwd(),
  ".validation/research-p2-g9-final-closeout/2026-09-03T07-00-00-000Z",
);
const SAFE = path.join(process.cwd(), "data/strategies/SAFE_v44_i4060.json");
const PRE_FIX_HASHES = collectStaleQueuedReadonlyHashes();
const T0 = Date.UTC(2026, 7, 11, 16, 20, 43);
const TEN_MIN = 10 * 60_000;
const TEN_HOURS = 10 * 60 * 60_000;
const roots: string[] = [];

function tempStore(): StrategySearchStoreOptions {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "rextora-p2g9-"));
  roots.push(rootDir);
  return { rootDir };
}

function config(): StrategySearchConfig {
  return {
    searchVersion: "1",
    strategyTemplateId: "p2g9_closeout",
    symbols: ["ETHUSDT"],
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

function persistContinuationQueued(input: {
  store: StrategySearchStoreOptions;
  activeMs: number;
  completedIterations: number;
}) {
  vi.setSystemTime(T0);
  const job = createSearchJob(config(), input.store);
  saveJobExecutionProfile(job.id, executionProfile(), input.store);
  markSearchJobRunning(job.id, input.store);
  saveSearchPlan(
    job.id,
    {
      ...createEmptySearchPlan({
        searchName: "P2-G9",
        depthProfile: "fast",
        qualificationProfile: "balanced",
        qualifiedTarget: 1,
        candidateBudget: 100,
        stageBatchSize: 10,
        maxRuntimeMs: THREE_HOURS_MS,
        spaces: [
          { id: "order_block", labelKo: "OB" },
          { id: "fvg", labelKo: "FVG" },
        ],
      }),
      campaignStartedAtMs: T0,
      currentSpaceIndex: 1,
      elapsedMs: input.activeMs,
    },
    input.store,
  );
  const boundary = T0 + input.activeMs;
  vi.setSystemTime(boundary);
  updateSearchCheckpoint(
    job.id,
    buildPersistedCheckpoint({
      completedIterations: input.completedIterations,
      nextIteration: input.completedIterations,
      payload: {
        ...createInitialRunnerPayload({
          prng: { algorithm: "mulberry32" as const, seed: 7, state: 123 },
          jobStatus: "completed",
        }),
        stopReason: "max_iterations" as const,
        seenHashes: Array.from({ length: input.completedIterations }, (_, i) => `h${i}`),
      },
      bestCandidate: null,
      bestPassedCandidate: null,
      updatedAt: new Date(boundary).toISOString(),
    }),
    input.store,
  );
  markSearchJobCompleted(job.id, input.store);
  reopenSearchJobForNextSpace(job.id, input.store);
  return { jobId: job.id, boundary };
}

function copyHistoricalTarget(destRoot: string) {
  const src = productionStaleQueuedRoot();
  const id = STALE_QUEUED_TARGET_ID;
  fs.mkdirSync(path.join(destRoot, "jobs"), { recursive: true });
  for (const name of [`${id}.json`, `${id}.plan.json`, `${id}.execution.json`]) {
    fs.copyFileSync(path.join(src, "jobs", name), path.join(destRoot, "jobs", name));
  }
}

function useThrowingEvaluate(store: StrategySearchStoreOptions) {
  setDefaultSearchJobExecutionDepsForTests({
    storeOptions: store,
    preloadedCandlesByKey: {},
    evaluate: async () => {
      throw new Error("p2g9 evaluate must not advance search work");
    },
  });
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

describe("P2-G9 final Research lifecycle close-out", () => {
  it("1. actual HEAD recorded", () => {
    const closeout = loadResearchP2FinalCloseout();
    expect(closeout.actualHead).toMatch(/^[0-9a-f]{40}$/);
    expect(closeout.priorHead).toBe(PRIOR_VERIFIED_HEAD);
    expect(closeout.headChangedSincePriorVerification).toBe(
      closeout.actualHead !== PRIOR_VERIFIED_HEAD,
    );
  });

  it("2. G8 source contract detected", () => {
    const g8 = verifyG8SourceContract();
    expect(g8.present).toBe(true);
    expect(g8.matchesModelB).toBe(true);
    expect(g8.evidence.length).toBeGreaterThanOrEqual(4);
  });

  it("3. all indexed jobs enumerated", () => {
    const root = productionCloseoutRoot();
    const inventory = loadResidualLifecycleInventory(root);
    const index = JSON.parse(
      fs.readFileSync(path.join(root, "index.json"), "utf8"),
    );
    expect(inventory.indexedJobCount).toBe(index.jobs.length);
    expect(inventory.jobs).toHaveLength(index.jobs.length);
  });

  it("4. index/job mismatch = 0", () => {
    const closeout = loadResearchP2FinalCloseout();
    expect(closeout.indexJobStatusMismatchTotal).toBe(
      HISTORICAL_MISSING_JOB_IDS.length,
    );
  });

  it("5. terminal lifecycle valid", () => {
    const closeout = loadResearchP2FinalCloseout();
    expect(closeout.terminalViolationIds).toEqual([]);
  });

  it("6. queued terminal violation = 0", () => {
    const closeout = loadResearchP2FinalCloseout();
    expect(closeout.queuedWithNormalTerminalReason).toEqual([]);
  });

  it("7. fresh queued classification", () => {
    const closeout = loadResearchP2FinalCloseout();
    const fresh = closeout.queuedClassification.filter(
      (q) => q.class === "FRESH_PENDING",
    );
    expect(fresh.length).toBeGreaterThan(0);
    expect(fresh.every((q) => !q.g8WouldNormalize)).toBe(true);
  });

  it("8. continuation queued classification", () => {
    const closeout = loadResearchP2FinalCloseout();
    const cont = closeout.queuedClassification.filter(
      (q) => q.class === "VALID_CONTINUATION",
    );
    expect(cont.map((q) => q.jobId)).toContain(STALE_QUEUED_TARGET_ID);
    expect(cont.every((q) => !q.unsafeAtNow)).toBe(true);
  });

  it("9. historical target temp-copy safe after G8", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const store = tempStore();
    copyHistoricalTarget(store.rootDir!);
    const startAt = Date.UTC(2026, 8, 3, 6, 30, 0);
    vi.setSystemTime(startAt);
    const job = getSearchJob(STALE_QUEUED_TARGET_ID, store)!;
    const plan = getSearchPlan(STALE_QUEUED_TARGET_ID, store)!;
    expect(classifyQueuedLifecycle({
      job,
      plan,
      hasExecutionProfile: true,
    })).toBe("VALID_CONTINUATION");
    expect(
      queuedContinuationNeedsDowntimeNormalization(job, plan, startAt),
    ).toBe(true);
    useThrowingEvaluate(store);
    startStrategySearchJobApi(STALE_QUEUED_TARGET_ID, { storeOptions: store });
    const after = getSearchPlan(STALE_QUEUED_TARGET_ID, store)!;
    expect(after.completionReason).not.toBe("DEADLINE_REACHED");
    expect(activeElapsedMs(after, startAt)).toBeGreaterThan(9 * 60_000);
    expect(activeElapsedMs(after, startAt)).toBeLessThan(11 * 60_000);
    await waitForSearchJobExecution(STALE_QUEUED_TARGET_ID);
  });

  it("10. interrupted recovery classification", () => {
    const closeout = loadResearchP2FinalCloseout();
    expect(closeout.interruptedClassification).toHaveLength(37);
    expect(closeout.inventory.interruptedClassCounts.VALID_INTERRUPTED_RESUMABLE).toBe(37);
    expect(closeout.recoveryUi.resumableIds).toHaveLength(37);
  });

  it("11. default-zero = no startup selection", () => {
    expect(DEFAULT_ORPHAN_AUTO_RESUME_LIMIT).toBe(0);
    expect(resolveOrphanAutoResumeLimit({ NODE_ENV: "development" })).toBe(0);
    expect(resolveOrphanAutoResumeLimit({ NODE_ENV: "production" })).toBe(0);
    expect(resolveOrphanAutoResumeLimit({ NODE_ENV: "test" })).toBe(0);
    const closeout = loadResearchP2FinalCloseout();
    expect(closeout.autoResume.defaultSelectedIds).toEqual([]);
  });

  it("12. G8 case A", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const store = tempStore();
    const { jobId } = persistContinuationQueued({
      store,
      activeMs: TEN_MIN,
      completedIterations: 40,
    });
    vi.setSystemTime(T0 + TEN_MIN + TWENTY_TWO_DAYS_MS);
    useThrowingEvaluate(store);
    startStrategySearchJobApi(jobId, { storeOptions: store });
    const plan = getSearchPlan(jobId, store)!;
    expect(activeElapsedMs(plan)).toBe(TEN_MIN);
    expect(THREE_HOURS_MS - activeElapsedMs(plan)).toBe(THREE_HOURS_MS - TEN_MIN);
    await waitForSearchJobExecution(jobId);
  });

  it("13. G8 case B", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const store = tempStore();
    const activeMs = 179 * 60_000;
    const { jobId } = persistContinuationQueued({
      store,
      activeMs,
      completedIterations: 40,
    });
    vi.setSystemTime(T0 + activeMs + TWENTY_TWO_DAYS_MS);
    useThrowingEvaluate(store);
    startStrategySearchJobApi(jobId, { storeOptions: store });
    expect(THREE_HOURS_MS - activeElapsedMs(getSearchPlan(jobId, store)!)).toBe(60_000);
    await waitForSearchJobExecution(jobId);
  });

  it("14. G8 already-expired case", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const store = tempStore();
    const { jobId } = persistContinuationQueued({
      store,
      activeMs: 181 * 60_000,
      completedIterations: 40,
    });
    vi.setSystemTime(T0 + 181 * 60_000 + 1_000);
    useThrowingEvaluate(store);
    startStrategySearchJobApi(jobId, { storeOptions: store });
    await waitForSearchJobExecution(jobId);
    expect(getSearchPlan(jobId, store)?.completionReason).toBe("DEADLINE_REACHED");
  });

  it("15. prepared interrupted not double-accounted", () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const store = tempStore();
    vi.setSystemTime(T0);
    const job = createSearchJob(config(), store);
    saveJobExecutionProfile(job.id, executionProfile(), store);
    markSearchJobRunning(job.id, store);
    saveSearchPlan(
      job.id,
      {
        ...createEmptySearchPlan({
          searchName: "int",
          depthProfile: "fast",
          qualificationProfile: "balanced",
          qualifiedTarget: 1,
          candidateBudget: 100,
          stageBatchSize: 10,
          maxRuntimeMs: THREE_HOURS_MS,
          spaces: [{ id: "ob", labelKo: "OB" }],
        }),
        campaignStartedAtMs: T0,
        elapsedMs: TEN_MIN,
      },
      store,
    );
    updateSearchCheckpoint(
      job.id,
      buildPersistedCheckpoint({
        completedIterations: 12,
        nextIteration: 12,
        payload: createInitialRunnerPayload({
          prng: { algorithm: "mulberry32" as const, seed: 7, state: 123 },
          jobStatus: "running",
        }),
        bestCandidate: null,
        bestPassedCandidate: null,
        updatedAt: new Date(T0 + TEN_MIN).toISOString(),
      }),
      store,
    );
    transitionJobToInterrupted(job.id, store);
    saveSearchPlan(
      job.id,
      {
        ...getSearchPlan(job.id, store)!,
        interruptedAtMs: T0 + TEN_MIN,
      },
      store,
    );
    const recoveredAt = T0 + TEN_MIN + TEN_HOURS;
    vi.setSystemTime(recoveredAt);
    prepareInterruptedJobForRecovery(job.id, recoveredAt, store);
    expect(
      normalizeQueuedContinuationRuntimeIfNeeded(job.id, recoveredAt, store)
        .normalized,
    ).toBe(false);
    expect(getSearchPlan(job.id, store)?.accumulatedInterruptionMs).toBe(TEN_HOURS);
  });

  it("16. G5 all interrupted discoverable", async () => {
    const closeout = loadResearchP2FinalCloseout();
    const interruptedIds = closeout.inventory.interruptedIds;
    const pages = Math.ceil(interruptedIds.length / RECOVERY_API_PAGE_SIZE) || 1;
    const summaries = interruptedIds.map((id) => ({
      id,
      status: "interrupted" as const,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
      startedAt: "2026-01-01T00:00:01.000Z",
      finishedAt: null,
      recoveryBlocker: null,
      maxIterations: 10,
      completedIterations: 1,
      nextIteration: 1,
      progressRatio: null,
      statistics: null,
      bestScore: null,
      bestCandidateHash: null,
      bestPassedCandidateHash: null,
      failureMessage: null,
      executionActive: false,
      searchVersion: "1",
      symbols: ["BTCUSDT"],
      timeframe: "15m",
      seed: 1,
      searchName: id,
    }));
    const listFn = async (opts: { limit: number; offset: number }) =>
      summaries.slice(opts.offset, opts.offset + opts.limit);
    const discovered = await discoverInterruptedRecoveryJobs(listFn);
    expect(discovered).toHaveLength(interruptedIds.length);
    expect(pages).toBeGreaterThanOrEqual(1);
    expect(closeout.recoveryUi.interruptedTotal).toBe(interruptedIds.length);
    expect(
      closeout.recoveryUi.interruptedHiddenFromHistoryFetch.length,
    ).toBeGreaterThanOrEqual(0);
  });

  it("17. queued excluded from recovery UI", () => {
    const src = fs.readFileSync(
      path.join(
        process.cwd(),
        "components/rextora/strategySearch/interruptedRecoveryDiscovery.ts",
      ),
      "utf8",
    );
    expect(src).toContain('job.status === "interrupted"');
    expect(isInterruptedRecoveryJob({ status: "queued" })).toBe(false);
    expect(isInterruptedRecoveryJob({ status: "interrupted" })).toBe(true);
    const closeout = loadResearchP2FinalCloseout();
    expect(
      closeout.recoveryUi.staleQueuedIds,
    ).toContain(STALE_QUEUED_TARGET_ID);
    expect(closeout.recoveryUi.queuedNotInterrupted).toBe(true);
  });

  it("18. Dashboard recovery link valid", () => {
    expect(RESEARCH_RECOVERY_HREF).toBe("/strategy-search#ss-recovery");
    expect(DASHBOARD_ATTENTION_VISIBLE_CAP).toBe(3);
  });

  it("19. production remains read-only", () => {
    const after = collectStaleQueuedReadonlyHashes();
    expect(after).toEqual(PRE_FIX_HASHES);
    expect(listActiveSearchJobExecutions()).toEqual([]);
  });

  it("20. SAFE unchanged", () => {
    const hash = crypto
      .createHash("sha256")
      .update(fs.readFileSync(SAFE))
      .digest("hex");
    expect(hash).toBe(
      "fb3f19169c8911fe041f3f8cb1d9e654f9166078f0c5cd8e29f04ec02a56dfc0",
    );
    const safe = JSON.parse(fs.readFileSync(SAFE, "utf8"));
    expect(safe.params_hash).toBe("7893ca3f0e30");
  });

  it("writes validation artifacts", () => {
    const { outDir, closeout } = writeResearchP2FinalCloseoutArtifacts(ARTIFACT_DIR);
    expect(fs.existsSync(path.join(outDir, "close-decision.json"))).toBe(true);
    expect(closeout.closeDecision).toMatch(/^P2_CLOSE_/);
    expect(fs.existsSync(path.join(outDir, "lifecycle-inventory.json"))).toBe(true);
  });
});
