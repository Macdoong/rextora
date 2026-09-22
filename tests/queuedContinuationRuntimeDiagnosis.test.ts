/**
 * P2-G7 queued-continuation runtime-budget diagnosis.
 * Isolated fixtures + production raw-read hashes. No production start/resume.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createInitialRunnerPayload,
  buildPersistedCheckpoint,
} from "../src/lib/rextora/strategySearch/jobCheckpoint";
import { saveJobExecutionProfile } from "../src/lib/rextora/strategySearch/jobExecutionProfile";
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
  createEmptySearchPlan,
  getSearchPlan,
  saveSearchPlan,
  activeElapsedMs,
} from "../src/lib/rextora/strategySearch/searchPlan";
import { startStrategySearchJobApi } from "../src/lib/rextora/strategySearch/jobApiService";
import {
  listActiveSearchJobExecutions,
  resetSearchJobExecutionRegistryForTests,
  setDefaultSearchJobExecutionDepsForTests,
  waitForSearchJobExecution,
} from "../src/lib/rextora/strategySearch/jobExecutionRegistry";
import {
  CORRECT_OPERATOR_ACTION,
  CURRENT_REPRODUCTION,
  EXISTING_TARGET_AFTER_FIX,
  IS_QUEUED_CONTINUATION_PREDICATE,
  QUEUED_CONTINUATION_INTERRUPTION_TIMESTAMP_AUTHORITY,
  QUEUED_PROCESS_LOSS_DETECTION_SIGNAL,
  QUEUED_TO_INTERRUPTED_CURRENTLY_LEGAL,
  RECOMMENDED_MODEL,
  RUNTIME_BUDGET_FORMULA,
  THREE_HOURS_MS,
  TWENTY_TWO_DAYS_MS,
  currentDeadlineReached,
  isFreshQueued,
  isQueuedContinuation,
  modelBActiveElapsedMs,
  resolveQueuedContinuationBoundaryMs,
  standardDeadlineCases,
  writeQueuedContinuationRuntimeArtifacts,
} from "../src/lib/rextora/strategySearch/queuedContinuationRuntimeDiagnosis";
import {
  collectStaleQueuedReadonlyHashes,
  productionStaleQueuedRoot,
} from "../src/lib/rextora/strategySearch/staleQueuedJobForensic";
import { ownerFilesExcludingKnownFossil } from "./helpers/productionResearchBaseline";
import type { StrategySearchConfig } from "../src/lib/rextora/strategySearch/types";

const ARTIFACT_DIR = path.join(
  process.cwd(),
  ".validation/research-p2-g7-queued-continuation-runtime-design/2026-09-03T06-15-00-000Z",
);
const SAFE = path.join(process.cwd(), "data/strategies/SAFE_v44_i4060.json");
const roots: string[] = [];
const T0 = Date.UTC(2026, 7, 11, 16, 20, 43);

function tempStore(): StrategySearchStoreOptions {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "rextora-p2g7-"));
  roots.push(rootDir);
  return { rootDir };
}

function config(): StrategySearchConfig {
  return {
    searchVersion: "1",
    strategyTemplateId: "p2g7_continuation",
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
        searchName: "P2-G7",
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
  markSearchJobCompleted(job.id, input.store);
  const reopened = reopenSearchJobForNextSpace(job.id, input.store);
  return { jobId: job.id, boundary, reopened };
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

describe("P2-G7 queued continuation runtime-budget diagnosis", () => {
  it("1. exact runtime formula captured", () => {
    expect(RUNTIME_BUDGET_FORMULA).toContain("now - campaignStartedAtMs");
    expect(RUNTIME_BUDGET_FORMULA).toContain("accumulatedInterruptionMs");
    expect(RUNTIME_BUDGET_FORMULA).toContain("openInterruption");
    const src = fs.readFileSync(
      path.join(process.cwd(), "src/lib/rextora/strategySearch/searchPlan.ts"),
      "utf8",
    );
    expect(src).toContain("now -");
    expect(src).toContain("plan.campaignStartedAtMs");
    expect(src).toContain("openInterruption");
  });

  it("2. fresh queued distinguished from continuation queued", () => {
    const fresh = {
      status: "queued" as const,
      startedAt: null,
      finishedAt: null,
      checkpoint: { completedIterations: 0, nextIteration: 0, randomState: null, bestCandidate: null, bestPassedCandidate: null },
    };
    const cont = {
      ...fresh,
      startedAt: "2026-08-11T16:20:43.076Z",
      checkpoint: { ...fresh.checkpoint, completedIterations: 4560, nextIteration: 4560 },
    };
    expect(isFreshQueued(fresh, { campaignStartedAtMs: null })).toBe(true);
    expect(isQueuedContinuation(fresh, { campaignStartedAtMs: null, completionReason: null })).toBe(false);
    expect(
      isQueuedContinuation(cont, {
        campaignStartedAtMs: 1786465243009,
        completionReason: null,
      }),
    ).toBe(true);
    expect(IS_QUEUED_CONTINUATION_PREDICATE).toContain("startedAt!=null");
  });

  it("3. normal immediate reopen remains valid", () => {
    vi.useFakeTimers();
    const store = tempStore();
    const { reopened, boundary } = persistContinuationQueued({
      store,
      activeMs: 10 * 60_000,
      completedIterations: 40,
    });
    expect(reopened.status).toBe("queued");
    expect(reopened.startedAt).not.toBeNull();
    const plan = getSearchPlan(reopened.id, store)!;
    expect(currentDeadlineReached(plan, boundary)).toBe(false);
    expect(modelBActiveElapsedMs(plan, boundary, boundary)).toBe(10 * 60_000);
  });

  it("4. process loss after reopen reproduced", () => {
    vi.useFakeTimers();
    const store = tempStore();
    const { reopened } = persistContinuationQueued({
      store,
      activeMs: 10 * 60_000,
      completedIterations: 40,
    });
    vi.setSystemTime(T0 + 10 * 60_000 + TWENTY_TWO_DAYS_MS);
    const plan = getSearchPlan(reopened.id, store)!;
    expect(reopened.status).toBe("queued");
    expect(currentDeadlineReached(plan, Date.now())).toBe(true);
    expect(QUEUED_PROCESS_LOSS_DETECTION_SIGNAL).toBe("PARTIAL");
  });

  it("5. long downtime causes current false deadline", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const store = tempStore();
    const { jobId, reopened } = persistContinuationQueued({
      store,
      activeMs: 10 * 60_000,
      completedIterations: 40,
    });
    const beforeNext = reopened.checkpoint.nextIteration;
    const beforeSeen = 40;
    vi.setSystemTime(T0 + 10 * 60_000 + TWENTY_TWO_DAYS_MS);
    setDefaultSearchJobExecutionDepsForTests({
      storeOptions: store,
      preloadedCandlesByKey: {},
      evaluate: async () => {
        throw new Error("evaluate must not run after false deadline");
      },
    });
    const unnormalized = getSearchPlan(jobId, store)!;
    expect(currentDeadlineReached(unnormalized, Date.now())).toBe(true);
    startStrategySearchJobApi(jobId, { storeOptions: store });
    const afterStart = getSearchPlan(jobId, store)!;
    const jobAfterStart = getSearchJob(jobId, store)!;
    expect(CURRENT_REPRODUCTION).toBe("FALSE_DEADLINE_REACHED");
    expect(afterStart.completionReason).not.toBe("DEADLINE_REACHED");
    expect(activeElapsedMs(afterStart, Date.now())).toBe(10 * 60_000);
    expect(jobAfterStart.checkpoint.nextIteration).toBeGreaterThanOrEqual(beforeNext);
    expect(jobAfterStart.checkpoint.completedIterations).toBeGreaterThanOrEqual(beforeSeen);
    await waitForSearchJobExecution(jobId);
  });

  it("6. interrupted downtime accounting captured", () => {
    const src = fs.readFileSync(
      path.join(process.cwd(), "src/lib/rextora/strategySearch/processInterruption.ts"),
      "utf8",
    );
    expect(src).toContain("resolveProcessInterruptionBoundaryMs");
    expect(src).toContain("job.status !== \"running\"");
    expect(src).toContain("markPlanInterrupted");
    const resume = fs.readFileSync(
      path.join(process.cwd(), "src/lib/rextora/strategySearch/searchPlan.ts"),
      "utf8",
    );
    expect(resume).toContain("accumulatedInterruptionMs");
    expect(resume).toContain("now - plan.interruptedAtMs");
  });

  it("7. timestamp authority classification", () => {
    expect(QUEUED_CONTINUATION_INTERRUPTION_TIMESTAMP_AUTHORITY).toContain(
      "job.updatedAt",
    );
    expect(QUEUED_CONTINUATION_INTERRUPTION_TIMESTAMP_AUTHORITY).toContain(
      "checkpoint.updatedAt",
    );
    const boundary = resolveQueuedContinuationBoundaryMs({
      jobUpdatedAt: "2026-08-11T16:30:49.901Z",
      checkpointUpdatedAt: "2026-08-11T16:30:49.247Z",
      heartbeatAt: "2026-08-11T16:30:41.410Z",
    });
    expect(boundary).toBe(Date.parse("2026-08-11T16:30:49.901Z"));
  });

  it("8. 10m active + long downtime case", () => {
    const cases = standardDeadlineCases();
    expect(cases.A.currentDeadline).toBe(true);
    expect(cases.A.modelBDeadline).toBe(false);
    expect(cases.A.modelBRemainingMs).toBe(THREE_HOURS_MS - 10 * 60_000);
  });

  it("9. 179m active + long downtime case", () => {
    const cases = standardDeadlineCases();
    expect(cases.B.currentDeadline).toBe(true);
    expect(cases.B.modelBDeadline).toBe(false);
    expect(cases.B.modelBRemainingMs).toBe(THREE_HOURS_MS - 179 * 60_000);
  });

  it("10. already-expired case", () => {
    const cases = standardDeadlineCases();
    expect(cases.C.modelBDeadline).toBe(true);
    expect(cases.D.modelBDeadline).toBe(true);
    expect(cases.C.modelBRemainingMs).toBe(0);
    expect(cases.D.modelBRemainingMs).toBe(0);
  });

  it("11. immediate reopen case", () => {
    const cases = standardDeadlineCases();
    expect(cases.E.currentDeadline).toBe(false);
    expect(cases.E.modelBDeadline).toBe(false);
    expect(cases.E.modelBActiveMs).toBe(10 * 60_000);
  });

  it("12. fresh queued case", () => {
    const cases = standardDeadlineCases();
    expect(cases.F.currentDeadline).toBe(false);
    expect(cases.F.modelBDeadline).toBe(false);
    expect(cases.F.modelBRemainingMs).toBe(THREE_HOURS_MS);
  });

  it("13. checkpoint continuity preserved", () => {
    vi.useFakeTimers();
    const store = tempStore();
    const { reopened } = persistContinuationQueued({
      store,
      activeMs: 10 * 60_000,
      completedIterations: 40,
    });
    expect(reopened.checkpoint.completedIterations).toBe(40);
    expect(reopened.checkpoint.nextIteration).toBe(40);
    expect(reopened.checkpoint.randomState).toBeTruthy();
    const plan = getSearchPlan(reopened.id, store)!;
    expect(plan.currentSpaceIndex).toBe(1);
  });

  it("14. duplicate work not introduced", () => {
    const cases = standardDeadlineCases();
    expect(cases.A.modelBActiveMs).toBe(10 * 60_000);
    const src = fs.readFileSync(
      path.join(
        process.cwd(),
        "src/lib/rextora/strategySearch/queuedContinuationRuntimeDiagnosis.ts",
      ),
      "utf8",
    );
    expect(src).not.toContain("nextIteration = 0");
    expect(src).not.toContain("seenHashes = []");
  });

  it("15. explicit auto-resume override safety analysis", () => {
    const orphan = fs.readFileSync(
      path.join(process.cwd(), "src/lib/rextora/strategySearch/orphanJobRecovery.ts"),
      "utf8",
    );
    expect(orphan).toContain("startStrategySearchJobApi");
    expect(orphan).toContain('job.status === "queued"');
    expect(RECOMMENDED_MODEL).toBe("MODEL_B");
    expect(CORRECT_OPERATOR_ACTION).toBe("Start");
  });

  it("16. selected model decision", () => {
    expect(RECOMMENDED_MODEL).toBe("MODEL_B");
  });

  it("17. existing target handling decision", () => {
    expect(EXISTING_TARGET_AFTER_FIX).toBe("SAFE_WITHOUT_DATA_REWRITE");
    expect(QUEUED_TO_INTERRUPTED_CURRENTLY_LEGAL).toBe(true);
  });

  it("18. no production writes", () => {
    const before = collectStaleQueuedReadonlyHashes();
    writeQueuedContinuationRuntimeArtifacts(ARTIFACT_DIR);
    expect(collectStaleQueuedReadonlyHashes()).toEqual(before);
    for (const name of [
      "runtime-equation.json",
      "interrupted-timing-contract.json",
      "queued-continuation-contract.json",
      "failure-reproduction.json",
      "timestamp-authority.json",
      "model-comparison.json",
      "recommended-model.json",
      "existing-target-plan.json",
      "production-readonly-hashes.json",
    ]) {
      expect(fs.existsSync(path.join(ARTIFACT_DIR, name))).toBe(true);
    }
  });

  it("19. no Research execution", () => {
    expect(listActiveSearchJobExecutions()).toEqual([]);
    expect(
      ownerFilesExcludingKnownFossil(
        path.join(productionStaleQueuedRoot(), "owners"),
      ),
    ).toEqual([]);
    const helper = fs.readFileSync(
      path.join(
        process.cwd(),
        "src/lib/rextora/strategySearch/queuedContinuationRuntimeDiagnosis.ts",
      ),
      "utf8",
    );
    expect(helper).not.toContain("recoverOrphanSearchJobs(");
    expect(helper).not.toContain("startStrategySearchJobApi(");
  });

  it("20. retired SAFE file remains absent", () => {
    expect(fs.existsSync(SAFE)).toBe(false);
    expect(collectStaleQueuedReadonlyHashes().safe).toBeNull();
  });
});
