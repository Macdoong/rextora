/**
 * P2-G8 queued-continuation process-downtime runtime accounting (MODEL B).
 * Isolated temp stores only. Production is raw-read / hashed, never started.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildPersistedCheckpoint,
  createInitialRunnerPayload,
  readRunnerPayloadFromCheckpoint,
} from "../src/lib/rextora/strategySearch/jobCheckpoint";
import { saveJobExecutionProfile } from "../src/lib/rextora/strategySearch/jobExecutionProfile";
import {
  acquireJobExecutionOwnership,
  releaseJobExecutionOwnership,
} from "../src/lib/rextora/strategySearch/jobExecutionOwnership";
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
  StrategySearchApiError,
  startStrategySearchJobApi,
} from "../src/lib/rextora/strategySearch/jobApiService";
import {
  listActiveSearchJobExecutions,
  planHasNormalTerminalCompletionReason,
  resetSearchJobExecutionRegistryForTests,
  setDefaultSearchJobExecutionDepsForTests,
  waitForSearchJobExecution,
} from "../src/lib/rextora/strategySearch/jobExecutionRegistry";
import {
  foldQueuedContinuationDowntime,
  interruptRunningJobFromStaleOwnership,
  isQueuedContinuationJob,
  normalizeQueuedContinuationRuntimeIfNeeded,
  prepareInterruptedJobForRecovery,
  queuedContinuationNeedsDowntimeNormalization,
  resolveQueuedContinuationBoundaryMs,
} from "../src/lib/rextora/strategySearch/processInterruption";
import {
  DEFAULT_ORPHAN_AUTO_RESUME_LIMIT,
  recoverOrphanSearchJobs,
  resolveOrphanAutoResumeLimit,
} from "../src/lib/rextora/strategySearch/orphanJobRecovery";
import {
  THREE_HOURS_MS,
  TWENTY_TWO_DAYS_MS,
} from "../src/lib/rextora/strategySearch/queuedContinuationRuntimeDiagnosis";
import {
  STALE_QUEUED_TARGET_ID,
  collectStaleQueuedReadonlyHashes,
  productionStaleQueuedRoot,
} from "../src/lib/rextora/strategySearch/staleQueuedJobForensic";
import { ownerFilesExcludingKnownFossil } from "./helpers/productionResearchBaseline";
import type { StrategySearchConfig } from "../src/lib/rextora/strategySearch/types";

const SAFE = path.join(process.cwd(), "data/strategies/SAFE_v44_i4060.json");
const HISTORICAL_TARGET_PRESENT = fs.existsSync(
  path.join(productionStaleQueuedRoot(), "jobs", `${STALE_QUEUED_TARGET_ID}.json`),
);
const roots: string[] = [];
const T0 = Date.UTC(2026, 7, 11, 16, 20, 43);
const TEN_MIN = 10 * 60_000;
const TEN_HOURS = 10 * 60 * 60_000;
const PRE_FIX_HASHES = collectStaleQueuedReadonlyHashes();

function sha256File(filePath: string): string | null {
  if (!fs.existsSync(filePath)) return null;
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

function tempStore(): StrategySearchStoreOptions {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "rextora-p2g8-"));
  roots.push(rootDir);
  return { rootDir };
}

function config(maxIterations = 100): StrategySearchConfig {
  return {
    searchVersion: "1",
    strategyTemplateId: "p2g8_continuation",
    symbols: ["ETHUSDT"],
    timeframe: "15m",
    dataVersion: "test-v1",
    seed: 7,
    generatorType: "random",
    maxIterations,
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

function remainingMs(plan: NonNullable<ReturnType<typeof getSearchPlan>>, now = Date.now()) {
  if (plan.maxRuntimeMs == null) return null;
  return Math.max(0, plan.maxRuntimeMs - activeElapsedMs(plan, now));
}

function persistContinuationQueued(input: {
  store: StrategySearchStoreOptions;
  activeMs: number;
  completedIterations: number;
  accumulatedInterruptionMs?: number;
}) {
  vi.setSystemTime(T0);
  const job = createSearchJob(config(), input.store);
  saveJobExecutionProfile(job.id, executionProfile(), input.store);
  markSearchJobRunning(job.id, input.store);
  saveSearchPlan(
    job.id,
    {
      ...createEmptySearchPlan({
        searchName: "P2-G8",
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
      accumulatedInterruptionMs: input.accumulatedInterruptionMs ?? 0,
    },
    input.store,
  );
  const boundary = T0 + input.activeMs;
  vi.setSystemTime(boundary);
  const payload = {
    ...createInitialRunnerPayload({
      prng: { algorithm: "mulberry32" as const, seed: 7, state: 123 },
      jobStatus: "completed",
    }),
    stopReason: "max_iterations" as const,
    seenHashes: Array.from({ length: input.completedIterations }, (_, i) => `h${i}`),
  };
  updateSearchCheckpoint(
    job.id,
    buildPersistedCheckpoint({
      completedIterations: input.completedIterations,
      nextIteration: input.completedIterations,
      payload,
      bestCandidate: null,
      bestPassedCandidate: null,
      updatedAt: new Date(boundary).toISOString(),
    }),
    input.store,
  );
  const jobsDir = path.join(input.store.rootDir!, "jobs");
  fs.writeFileSync(
    path.join(jobsDir, `${job.id}.generations.json`),
    JSON.stringify({ generations: [{ id: "g1", note: "p2g8" }] }),
  );
  fs.writeFileSync(
    path.join(jobsDir, `${job.id}.top10.json`),
    JSON.stringify({ entries: [{ hash: "top1" }] }),
  );
  const trialDir = path.join(input.store.rootDir!, "trials", job.id);
  fs.mkdirSync(trialDir, { recursive: true });
  fs.writeFileSync(
    path.join(trialDir, "00000000.json"),
    JSON.stringify({ jobId: job.id, iteration: 0, paramsHash: "t0" }),
  );
  markSearchJobCompleted(job.id, input.store);
  const reopened = reopenSearchJobForNextSpace(job.id, input.store);
  return { jobId: job.id, boundary, reopened };
}

function persistPreparedInterruptedQueued(input: {
  store: StrategySearchStoreOptions;
  activeMs: number;
  downtimeMs: number;
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
        searchName: "P2-G8-interrupt",
        depthProfile: "fast",
        qualificationProfile: "balanced",
        qualifiedTarget: 1,
        candidateBudget: 100,
        stageBatchSize: 10,
        maxRuntimeMs: THREE_HOURS_MS,
        spaces: [{ id: "order_block", labelKo: "OB" }],
      }),
      campaignStartedAtMs: T0,
      elapsedMs: input.activeMs,
    },
    input.store,
  );
  const boundary = T0 + input.activeMs;
  vi.setSystemTime(boundary);
  const payload = {
    ...createInitialRunnerPayload({
      prng: { algorithm: "mulberry32" as const, seed: 7, state: 123 },
      jobStatus: "running",
    }),
    seenHashes: Array.from({ length: input.completedIterations }, (_, i) => `ih${i}`),
  };
  updateSearchCheckpoint(
    job.id,
    buildPersistedCheckpoint({
      completedIterations: input.completedIterations,
      nextIteration: input.completedIterations,
      payload,
      bestCandidate: null,
      bestPassedCandidate: null,
      updatedAt: new Date(boundary).toISOString(),
    }),
    input.store,
  );
  const recoveredAt = boundary + input.downtimeMs;
  interruptRunningJobFromStaleOwnership(
    {
      jobId: job.id,
      previousOwnerId: "dead_owner",
      acquiredAt: new Date(T0).toISOString(),
      heartbeatAt: new Date(boundary).toISOString(),
      recoveredAt: new Date(recoveredAt).toISOString(),
    },
    input.store,
  );
  vi.setSystemTime(recoveredAt);
  const prepared = prepareInterruptedJobForRecovery(job.id, recoveredAt, input.store);
  return { jobId: job.id, boundary, recoveredAt, prepared };
}

function useThrowingEvaluate(store: StrategySearchStoreOptions) {
  setDefaultSearchJobExecutionDepsForTests({
    storeOptions: store,
    preloadedCandlesByKey: {},
    evaluate: async () => {
      throw new Error("p2g8 evaluate must not advance search work");
    },
  });
}

function sidecarHashes(store: StrategySearchStoreOptions, jobId: string) {
  const jobsDir = path.join(store.rootDir!, "jobs");
  const trialDir = path.join(store.rootDir!, "trials", jobId);
  const lastTrial = fs.existsSync(trialDir)
    ? fs.readdirSync(trialDir).filter((n) => /^\d{8}\.json$/.test(n)).sort().at(-1)
    : null;
  return {
    generations: sha256File(path.join(jobsDir, `${jobId}.generations.json`)),
    top10: sha256File(path.join(jobsDir, `${jobId}.top10.json`)),
    lastTrial: lastTrial ? sha256File(path.join(trialDir, lastTrial)) : null,
    trialCount: lastTrial
      ? fs.readdirSync(trialDir).filter((n) => /^\d{8}\.json$/.test(n)).length
      : 0,
  };
}

function copyHistoricalTarget(destRoot: string) {
  const src = productionStaleQueuedRoot();
  const id = STALE_QUEUED_TARGET_ID;
  fs.mkdirSync(path.join(destRoot, "jobs"), { recursive: true });
  for (const name of [
    `${id}.json`,
    `${id}.plan.json`,
    `${id}.execution.json`,
    `${id}.generations.json`,
    `${id}.top10.json`,
  ]) {
    const from = path.join(src, "jobs", name);
    if (fs.existsSync(from)) {
      fs.copyFileSync(from, path.join(destRoot, "jobs", name));
    }
  }
  const hist = path.join(src, "jobs", `${id}.top10.history.jsonl`);
  if (fs.existsSync(hist)) {
    fs.copyFileSync(hist, path.join(destRoot, "jobs", `${id}.top10.history.jsonl`));
  }
  const trialSrc = path.join(src, "trials", id);
  const trialDest = path.join(destRoot, "trials", id);
  if (fs.existsSync(trialSrc)) {
    const trials = fs.readdirSync(trialSrc).filter((n) => /^\d{8}\.json$/.test(n)).sort();
    const last = trials.at(-1);
    if (last) {
      fs.mkdirSync(trialDest, { recursive: true });
      fs.copyFileSync(path.join(trialSrc, last), path.join(trialDest, last));
    }
  }
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

describe("P2-G8 queued continuation runtime fix", () => {
  it("1. fresh queued is not normalized", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(T0);
    const store = tempStore();
    const job = createSearchJob(config(), store);
    saveJobExecutionProfile(job.id, executionProfile(), store);
    const plan = getSearchPlan(job.id, store);
    expect(isQueuedContinuationJob(job, plan)).toBe(false);
    expect(
      queuedContinuationNeedsDowntimeNormalization(job, plan, T0 + TWENTY_TWO_DAYS_MS),
    ).toBe(false);
    useThrowingEvaluate(store);
    startStrategySearchJobApi(job.id, { storeOptions: store });
    const after = getSearchPlan(job.id, store);
    expect(after?.accumulatedInterruptionMs ?? 0).toBe(0);
    await waitForSearchJobExecution(job.id);
  });

  it("2. valid same-family queued continuation detected", () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const store = tempStore();
    const { reopened } = persistContinuationQueued({
      store,
      activeMs: TEN_MIN,
      completedIterations: 40,
    });
    const plan = getSearchPlan(reopened.id, store)!;
    expect(isQueuedContinuationJob(reopened, plan)).toBe(true);
    expect(
      queuedContinuationNeedsDowntimeNormalization(
        getSearchJob(reopened.id, store)!,
        plan,
        T0 + TEN_MIN + TWENTY_TWO_DAYS_MS,
      ),
    ).toBe(true);
  });

  it("3. case A = 170 min remaining", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const store = tempStore();
    const { jobId } = persistContinuationQueued({
      store,
      activeMs: TEN_MIN,
      completedIterations: 40,
    });
    const startAt = T0 + TEN_MIN + TWENTY_TWO_DAYS_MS;
    vi.setSystemTime(startAt);
    useThrowingEvaluate(store);
    startStrategySearchJobApi(jobId, { storeOptions: store });
    const plan = getSearchPlan(jobId, store)!;
    expect(plan.campaignStartedAtMs).toBe(T0);
    expect(activeElapsedMs(plan, startAt)).toBe(TEN_MIN);
    expect(remainingMs(plan, startAt)).toBe(THREE_HOURS_MS - TEN_MIN);
    expect(plan.completionReason).toBeNull();
    await waitForSearchJobExecution(jobId);
  });

  it("4. case B = 1 min remaining", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const store = tempStore();
    const activeMs = 179 * 60_000;
    const { jobId } = persistContinuationQueued({
      store,
      activeMs,
      completedIterations: 40,
    });
    const startAt = T0 + activeMs + TWENTY_TWO_DAYS_MS;
    vi.setSystemTime(startAt);
    useThrowingEvaluate(store);
    startStrategySearchJobApi(jobId, { storeOptions: store });
    const plan = getSearchPlan(jobId, store)!;
    expect(activeElapsedMs(plan, startAt)).toBe(activeMs);
    expect(remainingMs(plan, startAt)).toBe(60_000);
    await waitForSearchJobExecution(jobId);
  });

  it("5. case C remains deadline", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const store = tempStore();
    const activeMs = 181 * 60_000;
    const { jobId } = persistContinuationQueued({
      store,
      activeMs,
      completedIterations: 40,
    });
    vi.setSystemTime(T0 + activeMs + TWENTY_TWO_DAYS_MS);
    useThrowingEvaluate(store);
    startStrategySearchJobApi(jobId, { storeOptions: store });
    await waitForSearchJobExecution(jobId);
    expect(getSearchPlan(jobId, store)?.completionReason).toBe("DEADLINE_REACHED");
  });

  it("6. case D remains deadline", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const store = tempStore();
    const activeMs = THREE_HOURS_MS + 60_000;
    const { jobId } = persistContinuationQueued({
      store,
      activeMs,
      completedIterations: 40,
    });
    vi.setSystemTime(T0 + activeMs + 1_000);
    useThrowingEvaluate(store);
    startStrategySearchJobApi(jobId, { storeOptions: store });
    await waitForSearchJobExecution(jobId);
    expect(getSearchPlan(jobId, store)?.completionReason).toBe("DEADLINE_REACHED");
  });

  it("7. immediate reopen behavior unchanged", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const store = tempStore();
    const { jobId, reopened, boundary } = persistContinuationQueued({
      store,
      activeMs: TEN_MIN,
      completedIterations: 40,
    });
    const job = getSearchJob(jobId, store)!;
    const plan = getSearchPlan(jobId, store)!;
    expect(queuedContinuationNeedsDowntimeNormalization(job, plan, boundary)).toBe(false);
    useThrowingEvaluate(store);
    startStrategySearchJobApi(jobId, { storeOptions: store });
    const after = getSearchPlan(jobId, store)!;
    expect(after.accumulatedInterruptionMs ?? 0).toBe(0);
    expect(activeElapsedMs(after, boundary)).toBe(TEN_MIN);
    expect(reopened.checkpoint.nextIteration).toBe(40);
    await waitForSearchJobExecution(jobId);
  });

  it.skipIf(!HISTORICAL_TARGET_PRESENT)("8. target temp-copy preserves 4560/4560", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const store = tempStore();
    copyHistoricalTarget(store.rootDir!);
    const job = getSearchJob(STALE_QUEUED_TARGET_ID, store)!;
    const plan = getSearchPlan(STALE_QUEUED_TARGET_ID, store)!;
    expect(job.checkpoint.completedIterations).toBe(4560);
    expect(job.checkpoint.nextIteration).toBe(4560);
    const startAt = Date.UTC(2026, 8, 3, 6, 30, 0);
    vi.setSystemTime(startAt);
    useThrowingEvaluate(store);
    startStrategySearchJobApi(STALE_QUEUED_TARGET_ID, { storeOptions: store });
    const afterJob = getSearchJob(STALE_QUEUED_TARGET_ID, store)!;
    const afterPlan = getSearchPlan(STALE_QUEUED_TARGET_ID, store)!;
    expect(afterJob.checkpoint.completedIterations).toBe(4560);
    expect(afterJob.checkpoint.nextIteration).toBe(4560);
    expect(afterPlan.campaignStartedAtMs).toBe(plan.campaignStartedAtMs);
    expect(fs.existsSync(path.join(productionStaleQueuedRoot(), "jobs", `${STALE_QUEUED_TARGET_ID}.json`))).toBe(true);
    await waitForSearchJobExecution(STALE_QUEUED_TARGET_ID);
  });

  it.skipIf(!HISTORICAL_TARGET_PRESENT)("9. target temp-copy preserves checkpoint PRNG/seenHashes", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const store = tempStore();
    copyHistoricalTarget(store.rootDir!);
    const before = getSearchJob(STALE_QUEUED_TARGET_ID, store)!;
    const beforePayload = readRunnerPayloadFromCheckpoint(before.checkpoint)!;
    const startAt = Date.UTC(2026, 8, 3, 6, 30, 0);
    vi.setSystemTime(startAt);
    useThrowingEvaluate(store);
    startStrategySearchJobApi(STALE_QUEUED_TARGET_ID, { storeOptions: store });
    const after = getSearchJob(STALE_QUEUED_TARGET_ID, store)!;
    const afterPayload = readRunnerPayloadFromCheckpoint(after.checkpoint)!;
    expect(after.checkpoint.randomState).toBe(before.checkpoint.randomState);
    expect(afterPayload.prng).toEqual(beforePayload.prng);
    expect(afterPayload.seenHashes).toEqual(beforePayload.seenHashes);
    expect(afterPayload.seenHashes.length).toBe(400);
    await waitForSearchJobExecution(STALE_QUEUED_TARGET_ID);
  });

  it.skipIf(!HISTORICAL_TARGET_PRESENT)("10. target does not receive fresh budget", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const store = tempStore();
    copyHistoricalTarget(store.rootDir!);
    const before = getSearchPlan(STALE_QUEUED_TARGET_ID, store)!;
    const startAt = Date.UTC(2026, 8, 3, 6, 30, 0);
    vi.setSystemTime(startAt);
    useThrowingEvaluate(store);
    startStrategySearchJobApi(STALE_QUEUED_TARGET_ID, { storeOptions: store });
    const after = getSearchPlan(STALE_QUEUED_TARGET_ID, store)!;
    expect(after.campaignStartedAtMs).toBe(before.campaignStartedAtMs);
    expect(after.maxRuntimeMs).toBe(THREE_HOURS_MS);
    expect(activeElapsedMs(after, startAt)).toBeGreaterThan(9 * 60_000);
    expect(activeElapsedMs(after, startAt)).toBeLessThan(11 * 60_000);
    expect(remainingMs(after, startAt)).toBeGreaterThan(169 * 60_000);
    expect(remainingMs(after, startAt)).toBeLessThan(171 * 60_000);
    expect(activeElapsedMs(after, startAt)).not.toBe(0);
    await waitForSearchJobExecution(STALE_QUEUED_TARGET_ID);
  });

  it("11. interrupted Resume downtime counted once", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const store = tempStore();
    const { jobId, recoveredAt } = persistPreparedInterruptedQueued({
      store,
      activeMs: TEN_MIN,
      downtimeMs: TEN_HOURS,
      completedIterations: 12,
    });
    const prepared = getSearchJob(jobId, store)!;
    const preparedPlan = getSearchPlan(jobId, store)!;
    expect(isQueuedContinuationJob(prepared, preparedPlan)).toBe(true);
    expect(
      queuedContinuationNeedsDowntimeNormalization(prepared, preparedPlan, recoveredAt),
    ).toBe(false);
    expect(preparedPlan.accumulatedInterruptionMs).toBe(TEN_HOURS);
    useThrowingEvaluate(store);
    startStrategySearchJobApi(jobId, { storeOptions: store });
    const after = getSearchPlan(jobId, store)!;
    expect(after.accumulatedInterruptionMs).toBe(TEN_HOURS);
    expect(activeElapsedMs(after, recoveredAt)).toBe(TEN_MIN);
    await waitForSearchJobExecution(jobId);
  });

  it("12. prepared interrupted queued is not double-normalized", () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const store = tempStore();
    const { jobId, recoveredAt, prepared } = persistPreparedInterruptedQueued({
      store,
      activeMs: TEN_MIN,
      downtimeMs: TEN_HOURS,
      completedIterations: 12,
    });
    const plan = getSearchPlan(jobId, store)!;
    expect(isQueuedContinuationJob(prepared, plan)).toBe(true);
    const result = normalizeQueuedContinuationRuntimeIfNeeded(
      jobId,
      recoveredAt,
      store,
    );
    expect(result.normalized).toBe(false);
    expect(getSearchPlan(jobId, store)?.accumulatedInterruptionMs).toBe(TEN_HOURS);
    const later = recoveredAt + 50;
    vi.setSystemTime(later);
    const resultLater = normalizeQueuedContinuationRuntimeIfNeeded(jobId, later, store);
    expect(resultLater.normalized).toBe(true);
    expect(resultLater.boundaryMs).toBe(recoveredAt);
    expect(getSearchPlan(jobId, store)!.accumulatedInterruptionMs).toBe(TEN_HOURS + 50);
  });

  it("13. previously resumed campaign can later normalize a NEW queued-loss interval", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const store = tempStore();
    const { jobId, recoveredAt } = persistPreparedInterruptedQueued({
      store,
      activeMs: TEN_MIN,
      downtimeMs: TEN_HOURS,
      completedIterations: 12,
    });
    expect(getSearchPlan(jobId, store)?.accumulatedInterruptionMs).toBe(TEN_HOURS);
    markSearchJobRunning(jobId, store);
    markSearchJobCompleted(jobId, store);
    reopenSearchJobForNextSpace(jobId, store);
    const reopenAt = Date.now();
    const startAt = reopenAt + TWENTY_TWO_DAYS_MS;
    vi.setSystemTime(startAt);
    useThrowingEvaluate(store);
    startStrategySearchJobApi(jobId, { storeOptions: store });
    const after = getSearchPlan(jobId, store)!;
    expect(after.accumulatedInterruptionMs).toBe(TEN_HOURS + TWENTY_TWO_DAYS_MS);
    expect(activeElapsedMs(after, startAt)).toBe(TEN_MIN);
    expect(after.campaignStartedAtMs).toBe(T0);
    expect(recoveredAt).toBeLessThan(startAt);
    await waitForSearchJobExecution(jobId);
  });

  it("14. failed Start does not cause double accounting on retry", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const store = tempStore();
    const { jobId } = persistContinuationQueued({
      store,
      activeMs: TEN_MIN,
      completedIterations: 40,
    });
    const startAt = T0 + TEN_MIN + TWENTY_TWO_DAYS_MS;
    vi.setSystemTime(startAt);
    const before = getSearchPlan(jobId, store)!;
    acquireJobExecutionOwnership(jobId, "blocker_owner", store);
    expect(() => startStrategySearchJobApi(jobId, { storeOptions: store })).toThrow(
      StrategySearchApiError,
    );
    const rolled = getSearchPlan(jobId, store)!;
    expect(rolled.accumulatedInterruptionMs).toBe(before.accumulatedInterruptionMs);
    expect(rolled.interruptedAtMs).toBeNull();
    releaseJobExecutionOwnership(jobId, "blocker_owner", "test_release", store);
    useThrowingEvaluate(store);
    startStrategySearchJobApi(jobId, { storeOptions: store });
    const after = getSearchPlan(jobId, store)!;
    expect(after.accumulatedInterruptionMs).toBe(TWENTY_TWO_DAYS_MS);
    expect(activeElapsedMs(after, startAt)).toBe(TEN_MIN);
    await waitForSearchJobExecution(jobId);
  });

  it("15. explicit override path uses corrected Start semantics", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const store = tempStore();
    const { jobId } = persistContinuationQueued({
      store,
      activeMs: TEN_MIN,
      completedIterations: 40,
    });
    vi.setSystemTime(T0 + TEN_MIN + TWENTY_TWO_DAYS_MS);
    useThrowingEvaluate(store);
    vi.stubEnv("REXTORA_ORPHAN_AUTO_RESUME_LIMIT", "100");
    expect(resolveOrphanAutoResumeLimit()).toBe(100);
    const result = recoverOrphanSearchJobs(store);
    expect(result.resumeLimit).toBe(100);
    expect(result.resumed).toContain(jobId);
    const plan = getSearchPlan(jobId, store)!;
    expect(activeElapsedMs(plan)).toBe(TEN_MIN);
    expect(plan.completionReason).not.toBe("DEADLINE_REACHED");
    await waitForSearchJobExecution(jobId);
  });

  it("16. default-zero remains zero", () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const store = tempStore();
    const { jobId } = persistContinuationQueued({
      store,
      activeMs: TEN_MIN,
      completedIterations: 40,
    });
    vi.setSystemTime(T0 + TEN_MIN + TWENTY_TWO_DAYS_MS);
    vi.stubEnv("REXTORA_ORPHAN_AUTO_RESUME_LIMIT", "");
    expect(DEFAULT_ORPHAN_AUTO_RESUME_LIMIT).toBe(0);
    expect(resolveOrphanAutoResumeLimit()).toBe(0);
    const result = recoverOrphanSearchJobs(store);
    expect(result.resumeLimit).toBe(0);
    expect(result.resumed).toEqual([]);
    expect(getSearchJob(jobId, store)?.status).toBe("queued");
    const plan = getSearchPlan(jobId, store)!;
    expect(plan.accumulatedInterruptionMs ?? 0).toBe(0);
  });

  it("17. checkpoint/trials/generations/top10 unchanged", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const store = tempStore();
    const { jobId, reopened } = persistContinuationQueued({
      store,
      activeMs: TEN_MIN,
      completedIterations: 40,
    });
    const beforeSidecar = sidecarHashes(store, jobId);
    const beforeCheckpoint = reopened.checkpoint;
    const beforePayload = readRunnerPayloadFromCheckpoint(beforeCheckpoint)!;
    const beforePlan = getSearchPlan(jobId, store)!;
    vi.setSystemTime(T0 + TEN_MIN + TWENTY_TWO_DAYS_MS);
    useThrowingEvaluate(store);
    startStrategySearchJobApi(jobId, { storeOptions: store });
    const afterJob = getSearchJob(jobId, store)!;
    const afterPlan = getSearchPlan(jobId, store)!;
    const afterSidecar = sidecarHashes(store, jobId);
    expect(afterJob.checkpoint.completedIterations).toBe(40);
    expect(afterJob.checkpoint.nextIteration).toBe(40);
    expect(afterJob.checkpoint.randomState).toBe(beforeCheckpoint.randomState);
    expect(readRunnerPayloadFromCheckpoint(afterJob.checkpoint)?.seenHashes).toEqual(
      beforePayload.seenHashes,
    );
    expect(afterPlan.currentSpaceIndex).toBe(beforePlan.currentSpaceIndex);
    expect(afterPlan.candidateBudget).toBe(beforePlan.candidateBudget);
    expect(afterSidecar).toEqual(beforeSidecar);
    await waitForSearchJobExecution(jobId);
  });

  it("18. P2-F2A terminal guard unchanged", () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(T0);
    const store = tempStore();
    const job = createSearchJob(config(), store);
    saveJobExecutionProfile(job.id, executionProfile(), store);
    saveSearchPlan(
      job.id,
      {
        ...createEmptySearchPlan({
          searchName: "P2-G8-f2a",
          depthProfile: "fast",
          qualificationProfile: "balanced",
          qualifiedTarget: 1,
          candidateBudget: 100,
          stageBatchSize: 10,
          maxRuntimeMs: THREE_HOURS_MS,
          spaces: [{ id: "order_block", labelKo: "OB" }],
        }),
        completionReason: "DEADLINE_REACHED",
      },
      store,
    );
    expect(
      planHasNormalTerminalCompletionReason(getSearchPlan(job.id, store)),
    ).toBe(true);
    expect(() => startStrategySearchJobApi(job.id, { storeOptions: store })).toThrow(
      /정상 종료 사유/,
    );
    expect(getSearchPlan(job.id, store)?.completionReason).toBe("DEADLINE_REACHED");
    expect(getSearchJob(job.id, store)?.status).toBe("queued");
  });

  it("19. no production write", () => {
    const after = collectStaleQueuedReadonlyHashes();
    expect(after).toEqual(PRE_FIX_HASHES);
  });

  it("20. no production Research execution", () => {
    expect(listActiveSearchJobExecutions()).toEqual([]);
    expect(
      ownerFilesExcludingKnownFossil(
        path.join(productionStaleQueuedRoot(), "owners"),
      ),
    ).toEqual([]);
    expect(sha256File(SAFE)).toBeNull();
  });

  it("collision: G7 base predicate matches prepared interrupted queued", () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const preparedStore = tempStore();
    const { prepared, recoveredAt } = persistPreparedInterruptedQueued({
      store: preparedStore,
      activeMs: TEN_MIN,
      downtimeMs: TEN_HOURS,
      completedIterations: 12,
    });
    const preparedPlan = getSearchPlan(prepared.id, preparedStore)!;
    expect(isQueuedContinuationJob(prepared, preparedPlan)).toBe(true);
    expect(
      queuedContinuationNeedsDowntimeNormalization(
        prepared,
        preparedPlan,
        recoveredAt,
      ),
    ).toBe(false);

    const lostStore = tempStore();
    const lost = persistContinuationQueued({
      store: lostStore,
      activeMs: TEN_MIN,
      completedIterations: 40,
    });
    const lostJob = getSearchJob(lost.jobId, lostStore)!;
    const lostPlan = getSearchPlan(lost.jobId, lostStore)!;
    expect(isQueuedContinuationJob(lostJob, lostPlan)).toBe(true);
    expect(
      queuedContinuationNeedsDowntimeNormalization(
        lostJob,
        lostPlan,
        T0 + TEN_MIN + TWENTY_TWO_DAYS_MS,
      ),
    ).toBe(true);
  });

  it("boundary uses durable clocks not Date.now as start", () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const store = tempStore();
    const { jobId, boundary } = persistContinuationQueued({
      store,
      activeMs: TEN_MIN,
      completedIterations: 40,
    });
    const job = getSearchJob(jobId, store)!;
    const now = T0 + TEN_MIN + TWENTY_TWO_DAYS_MS;
    const resolved = resolveQueuedContinuationBoundaryMs({ job, now });
    expect(resolved).toBe(boundary);
    expect(resolved).not.toBe(now);
    const folded = foldQueuedContinuationDowntime(getSearchPlan(jobId, store)!, resolved!, now);
    expect(activeElapsedMs(folded, now)).toBe(TEN_MIN);
  });
});
