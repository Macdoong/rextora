/**
 * P2-G3 MODEL B: startup auto-resume defaults to 0 in every environment.
 * Temp stores only for recovery. Production is hashed read-only.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_ORPHAN_AUTO_RESUME_LIMIT,
  recoverOrphanSearchJobs,
  resolveOrphanAutoResumeLimit,
} from "../src/lib/rextora/strategySearch/orphanJobRecovery";
import {
  collectProductionReadonlyHashes,
  planOrphanStartupSelection,
  productionStartupRoot,
} from "../src/lib/rextora/strategySearch/startupResumePolicyDiagnosis";
import {
  createInitialRunnerPayload,
  buildPersistedCheckpoint,
  readRunnerPayloadFromCheckpoint,
} from "../src/lib/rextora/strategySearch/jobCheckpoint";
import { saveJobExecutionProfile } from "../src/lib/rextora/strategySearch/jobExecutionProfile";
import {
  createSearchJob,
  getSearchJob,
  markSearchJobInterrupted,
  markSearchJobRunning,
  updateSearchCheckpoint,
  type StrategySearchStoreOptions,
} from "../src/lib/rextora/strategySearch/jobStore";
import * as executionRegistry from "../src/lib/rextora/strategySearch/jobExecutionRegistry";
import {
  createEmptySearchPlan,
  getSearchPlan,
  markPlanInterrupted,
  saveSearchPlan,
} from "../src/lib/rextora/strategySearch/searchPlan";
import { resumeStrategySearchJobApi } from "../src/lib/rextora/strategySearch/jobApiService";
import type { StrategySearchConfig } from "../src/lib/rextora/strategySearch/types";

const tempRoots: string[] = [];

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  for (const root of tempRoots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

function sampleConfig(): StrategySearchConfig {
  return {
    searchVersion: "1",
    strategyTemplateId: "template_search_base",
    symbols: ["BTCUSDT"],
    timeframe: "15m",
    dataVersion: "binance-v1",
    seed: 1,
    generatorType: "random",
    maxIterations: 10,
    parameterRanges: [{ key: "ema_fast", min: 10, max: 40, step: 1 }],
    evaluationWindows: [
      {
        id: "w1",
        label: "recent",
        fromOpenTime: 1_700_000_000_000,
        toOpenTime: 1_700_100_000_000,
      },
    ],
    passCriteria: { minTradeCount: 1, requireAllWindowsPass: true },
    costStress: { enabled: false, multipliers: [] },
    jitter: { enabled: false, samples: 0, relativeAmplitude: 0 },
  };
}

function tempStore(): StrategySearchStoreOptions {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "rextora-p2g3-"));
  tempRoots.push(rootDir);
  return { rootDir };
}

function sha256File(filePath: string): string | null {
  if (!fs.existsSync(filePath)) return null;
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
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

function snapshotStore(rootDir: string, jobIds: string[]) {
  const files: Record<string, string> = {};
  for (const id of jobIds) {
    files[`${id}.json`] = sha256File(path.join(rootDir, "jobs", `${id}.json`));
    const plan = path.join(rootDir, "jobs", `${id}.plan.json`);
    if (fs.existsSync(plan)) files[`${id}.plan.json`] = sha256File(plan);
  }
  const owners = fs.existsSync(path.join(rootDir, "owners"))
    ? fs.readdirSync(path.join(rootDir, "owners")).filter((n) => n.endsWith(".owner.json"))
    : [];
  return { files, owners };
}

function createQueued(store: StrategySearchStoreOptions) {
  const job = createSearchJob(sampleConfig(), store);
  saveJobExecutionProfile(job.id, executionProfile(), store);
  return job;
}

function createEligibleInterrupted(store: StrategySearchStoreOptions) {
  const t0 = Date.UTC(2026, 7, 1, 0, 0, 0);
  const job = createSearchJob(sampleConfig(), store);
  saveJobExecutionProfile(job.id, executionProfile(), store);
  markSearchJobRunning(job.id, store);
  const plan = {
    ...createEmptySearchPlan({
      searchName: "g3",
      depthProfile: "fast",
      qualificationProfile: "balanced",
      qualifiedTarget: 1,
      candidateBudget: 10,
      stageBatchSize: 1,
      maxRuntimeMs: 3 * 60 * 60 * 1_000,
      spaces: [{ id: "s1", labelKo: "s1" }],
    }),
    campaignStartedAtMs: t0,
  };
  saveSearchPlan(job.id, markPlanInterrupted(plan, t0 + 60_000, t0 + 120_000), store);
  const payload = createInitialRunnerPayload({
    prng: { algorithm: "mulberry32", seed: 1, state: 9 },
    jobStatus: "running",
  });
  updateSearchCheckpoint(
    job.id,
    buildPersistedCheckpoint({
      completedIterations: 3,
      nextIteration: 3,
      payload,
      bestCandidate: null,
      bestPassedCandidate: null,
      updatedAt: new Date(t0 + 60_000).toISOString(),
    }),
    store,
  );
  markSearchJobInterrupted(job.id, store);
  return getSearchJob(job.id, store)!;
}

describe("P2-G3 default-zero startup auto-resume", () => {
  it("1. development unset -> 0", () => {
    expect(
      resolveOrphanAutoResumeLimit({ NODE_ENV: "development" } as NodeJS.ProcessEnv),
    ).toBe(0);
  });

  it("2. production unset -> 0", () => {
    expect(
      resolveOrphanAutoResumeLimit({ NODE_ENV: "production" } as NodeJS.ProcessEnv),
    ).toBe(0);
  });

  it("3. test unset -> 0", () => {
    expect(
      resolveOrphanAutoResumeLimit({ NODE_ENV: "test" } as NodeJS.ProcessEnv),
    ).toBe(0);
    expect(DEFAULT_ORPHAN_AUTO_RESUME_LIMIT).toBe(0);
  });

  it("4. blank -> 0", () => {
    expect(
      resolveOrphanAutoResumeLimit({
        NODE_ENV: "production",
        REXTORA_ORPHAN_AUTO_RESUME_LIMIT: "  ",
      } as NodeJS.ProcessEnv),
    ).toBe(0);
  });

  it("5. invalid -> 0", () => {
    expect(
      resolveOrphanAutoResumeLimit({
        NODE_ENV: "production",
        REXTORA_ORPHAN_AUTO_RESUME_LIMIT: "abc",
      } as NodeJS.ProcessEnv),
    ).toBe(0);
  });

  it("6. negative -> 0", () => {
    expect(
      resolveOrphanAutoResumeLimit({
        NODE_ENV: "test",
        REXTORA_ORPHAN_AUTO_RESUME_LIMIT: "-1",
      } as NodeJS.ProcessEnv),
    ).toBe(0);
  });

  it("7. explicit 0 -> 0", () => {
    expect(
      resolveOrphanAutoResumeLimit({
        NODE_ENV: "production",
        REXTORA_ORPHAN_AUTO_RESUME_LIMIT: "0",
      } as NodeJS.ProcessEnv),
    ).toBe(0);
  });

  it("8. explicit 1 -> 1", () => {
    expect(
      resolveOrphanAutoResumeLimit({
        NODE_ENV: "development",
        REXTORA_ORPHAN_AUTO_RESUME_LIMIT: "1",
      } as NodeJS.ProcessEnv),
    ).toBe(1);
  });

  it("9. explicit 2 -> 2", () => {
    expect(
      resolveOrphanAutoResumeLimit({
        NODE_ENV: "test",
        REXTORA_ORPHAN_AUTO_RESUME_LIMIT: "2",
      } as NodeJS.ProcessEnv),
    ).toBe(2);
  });

  it("10. decimal 2.9 -> 2", () => {
    expect(
      resolveOrphanAutoResumeLimit({
        NODE_ENV: "production",
        REXTORA_ORPHAN_AUTO_RESUME_LIMIT: "2.9",
      } as NodeJS.ProcessEnv),
    ).toBe(2);
  });

  it("11. default-zero recovery starts zero queued jobs", async () => {
    const store = tempStore();
    const queued = createQueued(store);
    const jobApi = await import("../src/lib/rextora/strategySearch/jobApiService");
    const startSpy = vi.spyOn(jobApi, "startStrategySearchJobApi");
    const result = recoverOrphanSearchJobs(store);
    expect(result.resumeLimit).toBe(0);
    expect(result.resumed).toEqual([]);
    expect(startSpy).not.toHaveBeenCalled();
    expect(getSearchJob(queued.id, store)?.status).toBe("queued");
  });

  it("12. default-zero recovery starts zero interrupted jobs", async () => {
    const store = tempStore();
    const interrupted = createEligibleInterrupted(store);
    const jobApi = await import("../src/lib/rextora/strategySearch/jobApiService");
    const startSpy = vi.spyOn(jobApi, "startStrategySearchJobApi");
    const result = recoverOrphanSearchJobs(store);
    expect(result.resumeLimit).toBe(0);
    expect(result.resumed).toEqual([]);
    expect(result.deadlineCompleted).toEqual([]);
    expect(startSpy).not.toHaveBeenCalled();
    expect(getSearchJob(interrupted.id, store)?.status).toBe("interrupted");
  });

  it("13. default-zero creates no ownership", () => {
    const store = tempStore();
    const queued = createQueued(store);
    const interrupted = createEligibleInterrupted(store);
    recoverOrphanSearchJobs(store);
    const ownersDir = path.join(store.rootDir!, "owners");
    const owners = fs.existsSync(ownersDir)
      ? fs.readdirSync(ownersDir).filter((n) => n.endsWith(".owner.json"))
      : [];
    expect(owners).toEqual([]);
    expect(getSearchJob(queued.id, store)?.status).toBe("queued");
    expect(getSearchJob(interrupted.id, store)?.status).toBe("interrupted");
  });

  it("14. default-zero mutates no job", () => {
    const store = tempStore();
    const queued = createQueued(store);
    const interrupted = createEligibleInterrupted(store);
    const before = snapshotStore(store.rootDir!, [queued.id, interrupted.id]);
    recoverOrphanSearchJobs(store);
    const after = snapshotStore(store.rootDir!, [queued.id, interrupted.id]);
    expect(after.files[`${queued.id}.json`]).toBe(before.files[`${queued.id}.json`]);
    expect(after.files[`${interrupted.id}.json`]).toBe(
      before.files[`${interrupted.id}.json`],
    );
  });

  it("15. default-zero mutates no plan", () => {
    const store = tempStore();
    const interrupted = createEligibleInterrupted(store);
    const beforePlan = sha256File(
      path.join(store.rootDir!, "jobs", `${interrupted.id}.plan.json`),
    );
    const beforeInterruptedAt = getSearchPlan(interrupted.id, store)?.interruptedAtMs;
    recoverOrphanSearchJobs(store);
    expect(
      sha256File(path.join(store.rootDir!, "jobs", `${interrupted.id}.plan.json`)),
    ).toBe(beforePlan);
    expect(getSearchPlan(interrupted.id, store)?.interruptedAtMs).toBe(
      beforeInterruptedAt,
    );
  });

  it("16. explicit limit=2 preserves existing candidate ordering", async () => {
    const store = tempStore();
    const jobApi = await import("../src/lib/rextora/strategySearch/jobApiService");
    const jobStore = await import("../src/lib/rextora/strategySearch/jobStore");
    vi.spyOn(jobApi, "startStrategySearchJobApi").mockImplementation(() => ({}) as never);
    vi.spyOn(jobStore, "listSearchJobs").mockReturnValue([
      {
        id: "search_older",
        status: "queued",
        updatedAt: "2026-08-27T13:22:31.967Z",
      },
      {
        id: "search_newest",
        status: "queued",
        updatedAt: "2026-08-27T13:47:24.332Z",
      },
      {
        id: "search_middle",
        status: "queued",
        updatedAt: "2026-08-27T13:22:32.033Z",
      },
    ] as never);
    vi.stubEnv("REXTORA_ORPHAN_AUTO_RESUME_LIMIT", "2");
    const result = recoverOrphanSearchJobs(store);
    expect(result.resumeLimit).toBe(2);
    expect(result.resumed).toEqual(["search_newest", "search_middle"]);
  });

  it("17. explicit limit=2 still selects the expected first two fixture jobs", () => {
    const root = productionStartupRoot();
    const plan = planOrphanStartupSelection({ rootDir: root, resumeLimit: 2 });
    expect(plan.selected.map((s) => s.jobId)).toEqual([
      "search_cefbe580-8cd5-4ea6-b29b-974f1dd978e6",
      "search_fed7a3c6-1ec1-4392-a9fa-7de59712783b",
    ]);
  });

  it("18. terminal-reason guards remain intact", async () => {
    const store = tempStore();
    const job = createSearchJob(sampleConfig(), store);
    saveJobExecutionProfile(job.id, executionProfile(), store);
    saveSearchPlan(
      job.id,
      {
        ...createEmptySearchPlan({
          searchName: "g3-terminal",
          depthProfile: "fast",
          qualificationProfile: "balanced",
          qualifiedTarget: 1,
          candidateBudget: 10,
          stageBatchSize: 1,
          maxRuntimeMs: 60_000,
          spaces: [{ id: "s1", labelKo: "s1" }],
        }),
        completionReason: "DEADLINE_REACHED",
      },
      store,
    );
    const jobApi = await import("../src/lib/rextora/strategySearch/jobApiService");
    const startSpy = vi.spyOn(jobApi, "startStrategySearchJobApi");
    vi.stubEnv("REXTORA_ORPHAN_AUTO_RESUME_LIMIT", "2");
    const result = recoverOrphanSearchJobs(store);
    expect(result.resumed).toEqual([]);
    expect(result.terminalStaleSkipped).toContain(job.id);
    expect(startSpy).not.toHaveBeenCalled();
    expect(getSearchJob(job.id, store)?.status).toBe("queued");
  });

  it("19. checkpoint resumability remains intact", async () => {
    const store = tempStore();
    const interrupted = createEligibleInterrupted(store);
    const before = getSearchJob(interrupted.id, store)!.checkpoint;
    recoverOrphanSearchJobs(store);
    const after = getSearchJob(interrupted.id, store)!;
    expect(after.status).toBe("interrupted");
    expect(after.checkpoint).toEqual(before);
    expect(readRunnerPayloadFromCheckpoint(after.checkpoint)).toBeTruthy();

    const startSpy = vi
      .spyOn(executionRegistry, "startSearchJobExecution")
      .mockImplementation(() => undefined as never);
    const resumed = resumeStrategySearchJobApi(interrupted.id, {
      storeOptions: store,
    });
    expect(startSpy).toHaveBeenCalledTimes(1);
    expect(resumed.status === "queued" || resumed.status === "running").toBe(true);
  });

  it("20. no production write", () => {
    const root = productionStartupRoot();
    const before = collectProductionReadonlyHashes(root);
    const unsetLimit = resolveOrphanAutoResumeLimit({
      NODE_ENV: "production",
    } as NodeJS.ProcessEnv);
    const unsetPlan = planOrphanStartupSelection({
      rootDir: root,
      resumeLimit: unsetLimit,
    });
    const overridePlan = planOrphanStartupSelection({
      rootDir: root,
      resumeLimit: 2,
    });
    expect(unsetLimit).toBe(0);
    expect(unsetPlan.selected).toEqual([]);
    expect(overridePlan.selected.map((s) => s.jobId)).toEqual([
      "search_cefbe580-8cd5-4ea6-b29b-974f1dd978e6",
      "search_fed7a3c6-1ec1-4392-a9fa-7de59712783b",
    ]);
    const after = collectProductionReadonlyHashes(root);
    expect(after).toEqual(before);
    expect(Object.keys(before.nonTerminalJobs)).toHaveLength(41);
  });
});
