/**
 * P2-F2A recurrence prevention. Temp stores only for mutations.
 * Production store is raw-read only (never getSearchJob / recoverReadJson).
 */
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  finalizeNormalSearchCompletion,
  isNormalSearchCompletionReason,
  isSearchJobExecutionActive,
  planHasNormalTerminalCompletionReason,
  resetSearchJobExecutionRegistryForTests,
  startSearchJobExecution,
  waitForSearchJobExecution,
} from "../src/lib/rextora/strategySearch/jobExecutionRegistry";
import { isJobExecutionOwnedOnDisk } from "../src/lib/rextora/strategySearch/jobExecutionOwnership";
import { resetJobExecutionOwnershipForTests } from "../src/lib/rextora/strategySearch/jobExecutionOwnership";
import { saveJobExecutionProfile } from "../src/lib/rextora/strategySearch/jobExecutionProfile";
import {
  StrategySearchApiError,
  startStrategySearchJobApi,
} from "../src/lib/rextora/strategySearch/jobApiService";
import {
  createSearchJob,
  getSearchJob,
  listSearchTrials,
  markSearchJobCompleted,
  markSearchJobInterrupted,
  markSearchJobRunning,
  reopenSearchJobForNextSpace,
} from "../src/lib/rextora/strategySearch/jobStore";
import { completeInterruptedJobAtDeadline } from "../src/lib/rextora/strategySearch/processInterruption";
import { recoverOrphanSearchJobs } from "../src/lib/rextora/strategySearch/orphanJobRecovery";
import { resolveResearchOutcome } from "../src/lib/rextora/strategySearch/researchOutcome";
import { runOrchestratedSearchJob } from "../src/lib/rextora/strategySearch/searchOrchestrator";
import {
  createEmptySearchPlan,
  getSearchPlan,
  saveSearchPlan,
} from "../src/lib/rextora/strategySearch/searchPlan";
import type { StrategySearchCompletionReason } from "../src/lib/rextora/strategySearch/searchPlan";
import type { StrategySearchConfig } from "../src/lib/rextora/strategySearch/types";
import {
  HISTORICAL_MISSING_JOB_ID_SET,
  isHistoricalMissingJobId,
} from "./helpers/productionResearchBaseline";
import { isDashboardPendingResearch } from "../components/rextora/dashboard/dashboardResearchSelection";
import * as jobApi from "../src/lib/rextora/strategySearch/jobApiService";

const APPROVED_13 = [
  "search_0c286c6a-5d8c-4e2b-bdff-046dd71281a4",
  "search_1683a734-341d-4da8-99c7-476ad80c078d",
  "search_32bc4514-085c-4351-95d0-aa553f3c2884",
  "search_5bedd873-2e89-4604-ab27-07a9dff27e74",
  "search_6b0b920d-e45b-4101-8f2d-2013380d86a5",
  "search_6b527e08-d01d-49b8-b398-1ad27482182f",
  "search_747c28e9-c250-47ca-acfb-06eba1ed9c69",
  "search_78e8dd3f-5fea-4955-8535-7578338a18e1",
  "search_bd7a9043-1ed1-42a7-8bdc-c70ff22d249d",
  "search_d15a7b41-867a-40da-a065-28256ffaf88e",
  "search_e47a902f-5ee3-484f-88ca-73313de44cc6",
  "search_e4fe7b86-5140-40a9-b098-f6fe1eaa3027",
  "search_edb3d3fc-5671-4b33-bc1a-b0cc036f98c8",
] as const;

const tempRoots: string[] = [];

function makeTempRoot(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "rextora-p2f2a-"));
  tempRoots.push(root);
  return root;
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  resetSearchJobExecutionRegistryForTests();
  for (const root of tempRoots.splice(0)) {
    resetJobExecutionOwnershipForTests({ rootDir: root });
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

function writePlan(
  jobId: string,
  root: string,
  reason: StrategySearchCompletionReason,
) {
  const plan = createEmptySearchPlan({
    searchName: "p2f2a",
    depthProfile: "standard",
    qualificationProfile: "balanced",
    qualifiedTarget: 3,
    candidateBudget: 100,
    stageBatchSize: 20,
    maxRuntimeMs: 60_000,
    spaces: [
      { id: "ema_core", labelKo: "EMA" },
      { id: "fvg", labelKo: "FVG" },
    ],
  });
  saveSearchPlan(
    jobId,
    {
      ...plan,
      campaignStartedAtMs: Date.now() - 120_000,
      elapsedMs: 120_000,
      completionReason: reason,
    },
    { rootDir: root },
  );
}

function writeFreshQueuedPlan(jobId: string, root: string) {
  const plan = createEmptySearchPlan({
    searchName: "p2f2a-fresh",
    depthProfile: "standard",
    qualificationProfile: "balanced",
    qualifiedTarget: 3,
    candidateBudget: 100,
    stageBatchSize: 20,
    maxRuntimeMs: 60_000,
    spaces: [{ id: "ema_core", labelKo: "EMA" }],
  });
  saveSearchPlan(jobId, plan, { rootDir: root });
}

function saveProfile(jobId: string, root: string) {
  saveJobExecutionProfile(
    jobId,
    {
      version: 1,
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
        mutationScale: 0.1,
        seed: 1,
        minimumPassRate: 0,
        maximumScoreDropRatio: 1,
        parameterRanges: [],
      },
      dataRef: { availableFrom: 0, availableTo: 1, source: "preloaded" },
    },
    { rootDir: root },
  );
}

function orchInput(jobId: string, root: string) {
  return {
    jobId,
    storeOptions: { rootDir: root },
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
      mutationScale: 0.1,
      seed: 1,
      minimumPassRate: 0,
      maximumScoreDropRatio: 1,
      parameterRanges: [],
    },
    baseParams: {},
    preloadedCandlesByKey: {},
    evaluate: async () => {
      throw new Error("P2-F2A must not evaluate candidates after deadline");
    },
  };
}

function sha256File(filePath: string): string | null {
  if (!fs.existsSync(filePath)) return null;
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

function productionRoot(): string {
  return path.join(process.cwd(), "data", "rextora", "strategy-search");
}

describe("P2-F2A queued + terminal-reason recurrence prevention", () => {
  it("1. terminal-reason helper uses canonical isNormalSearchCompletionReason", () => {
    expect(planHasNormalTerminalCompletionReason({ completionReason: "DEADLINE_REACHED" })).toBe(
      isNormalSearchCompletionReason("DEADLINE_REACHED"),
    );
    expect(planHasNormalTerminalCompletionReason({ completionReason: "MAX_ITERATIONS" })).toBe(
      true,
    );
    expect(planHasNormalTerminalCompletionReason({ completionReason: null })).toBe(false);
    expect(planHasNormalTerminalCompletionReason({ completionReason: "PAUSED" })).toBe(false);
    expect(planHasNormalTerminalCompletionReason(null)).toBe(false);
  });

  it("2. queued + null reason remains startable", async () => {
    const root = makeTempRoot();
    const store = { rootDir: root };
    const job = createSearchJob(sampleConfig(), store);
    writeFreshQueuedPlan(job.id, root);
    saveProfile(job.id, root);
    const started = startStrategySearchJobApi(job.id, {
      storeOptions: store,
      preloadedCandlesByKey: {},
      evaluate: async () => {
        throw new Error("start-allowed test must not evaluate");
      },
    });
    expect(started.status === "queued" || started.status === "running").toBe(true);
    expect(isSearchJobExecutionActive(job.id)).toBe(true);
    try {
      await waitForSearchJobExecution(job.id);
    } catch {
      /* start-allowed assertion already passed; runner may fail closed */
    }
  });

  it("3. queued + DEADLINE_REACHED start is rejected", () => {
    const root = makeTempRoot();
    const store = { rootDir: root };
    const job = createSearchJob(sampleConfig(), store);
    writePlan(job.id, root, "DEADLINE_REACHED");
    saveProfile(job.id, root);
    try {
      startStrategySearchJobApi(job.id, { storeOptions: store });
      expect.unreachable("start must be rejected");
    } catch (err) {
      expect(err).toBeInstanceOf(StrategySearchApiError);
      expect((err as StrategySearchApiError).code).toBe("INVALID_STATE");
      expect((err as StrategySearchApiError).httpStatus).toBe(409);
      expect((err as Error).message).toMatch(/정상 종료 사유|수명주기 정합/);
    }
    expect(getSearchJob(job.id, store)?.status).toBe("queued");
  });

  it("4. queued + another normal terminal reason start is rejected", () => {
    const root = makeTempRoot();
    const store = { rootDir: root };
    const job = createSearchJob(sampleConfig(), store);
    writePlan(job.id, root, "SEARCH_SPACE_EXHAUSTED");
    saveProfile(job.id, root);
    expect(() => startStrategySearchJobApi(job.id, { storeOptions: store })).toThrow(
      StrategySearchApiError,
    );
    expect(getSearchJob(job.id, store)?.status).toBe("queued");
  });

  it("5. rejected start creates no ownership", () => {
    const root = makeTempRoot();
    const store = { rootDir: root };
    const job = createSearchJob(sampleConfig(), store);
    writePlan(job.id, root, "DEADLINE_REACHED");
    saveProfile(job.id, root);
    expect(() => startStrategySearchJobApi(job.id, { storeOptions: store })).toThrow(
      StrategySearchApiError,
    );
    expect(isSearchJobExecutionActive(job.id)).toBe(false);
    expect(isJobExecutionOwnedOnDisk(job.id, store)).toBe(false);
    const ownersDir = path.join(root, "owners");
    const leftover = fs.existsSync(ownersDir)
      ? fs.readdirSync(ownersDir).filter((name) => name.endsWith(".owner.json"))
      : [];
    expect(leftover).toEqual([]);
  });

  it("6. rejected start mutates no job/plan", () => {
    const root = makeTempRoot();
    const store = { rootDir: root };
    const job = createSearchJob(sampleConfig(), store);
    writePlan(job.id, root, "DEADLINE_REACHED");
    const jobPath = path.join(root, "jobs", `${job.id}.json`);
    const planPath = path.join(root, "jobs", `${job.id}.plan.json`);
    const beforeJob = sha256File(jobPath);
    const beforePlan = sha256File(planPath);
    expect(() => startStrategySearchJobApi(job.id, { storeOptions: store })).toThrow(
      StrategySearchApiError,
    );
    expect(sha256File(jobPath)).toBe(beforeJob);
    expect(sha256File(planPath)).toBe(beforePlan);
    expect(getSearchJob(job.id, store)?.finishedAt).toBeNull();
    expect(getSearchPlan(job.id, store)?.completionReason).toBe("DEADLINE_REACHED");
  });

  it("7. startup recovery skips queued + terminal reason", () => {
    const root = makeTempRoot();
    const store = { rootDir: root };
    const job = createSearchJob(sampleConfig(), store);
    writePlan(job.id, root, "DEADLINE_REACHED");
    vi.stubEnv("REXTORA_ORPHAN_AUTO_RESUME_LIMIT", "2");
    const startSpy = vi
      .spyOn(jobApi, "startStrategySearchJobApi")
      .mockImplementation(() => ({ ok: true } as never));
    const result = recoverOrphanSearchJobs(store);
    expect(result.resumed).not.toContain(job.id);
    expect(result.skipped).toContain(job.id);
    expect(result.terminalStaleSkipped).toContain(job.id);
    expect(startSpy).not.toHaveBeenCalled();
    expect(getSearchJob(job.id, store)?.status).toBe("queued");
    expect(getSearchPlan(job.id, store)?.completionReason).toBe("DEADLINE_REACHED");
  });

  it("8. skipped terminal job does not consume resume cap", () => {
    const root = makeTempRoot();
    const store = { rootDir: root };
    const normal = createSearchJob(sampleConfig(), store);
    writeFreshQueuedPlan(normal.id, root);
    const terminal = createSearchJob(sampleConfig(), store);
    writePlan(terminal.id, root, "DEADLINE_REACHED");
    vi.stubEnv("REXTORA_ORPHAN_AUTO_RESUME_LIMIT", "1");
    const startSpy = vi
      .spyOn(jobApi, "startStrategySearchJobApi")
      .mockImplementation(() => ({ ok: true } as never));
    const result = recoverOrphanSearchJobs(store);
    expect(result.terminalStaleSkipped).toContain(terminal.id);
    expect(result.resumed).toEqual([normal.id]);
    expect(result.resumed).not.toContain(terminal.id);
    expect(startSpy).toHaveBeenCalledTimes(1);
    expect(startSpy.mock.calls[0]?.[0]).toBe(normal.id);
  });

  it("9. normal queued startup behavior unchanged", () => {
    const root = makeTempRoot();
    const store = { rootDir: root };
    const job = createSearchJob(sampleConfig(), store);
    writeFreshQueuedPlan(job.id, root);
    vi.stubEnv("REXTORA_ORPHAN_AUTO_RESUME_LIMIT", "2");
    const startSpy = vi
      .spyOn(jobApi, "startStrategySearchJobApi")
      .mockImplementation(() => ({ ok: true } as never));
    const result = recoverOrphanSearchJobs(store);
    expect(result.resumed).toContain(job.id);
    expect(result.terminalStaleSkipped).not.toContain(job.id);
    expect(startSpy).toHaveBeenCalledTimes(1);
  });

  it("10. current reproduction no longer ends queued + DEADLINE_REACHED", async () => {
    const root = makeTempRoot();
    const store = { rootDir: root };
    const job = createSearchJob(sampleConfig(), store);
    writePlan(job.id, root, null);
    markSearchJobRunning(job.id, store);
    markSearchJobCompleted(job.id, store);
    expect(reopenSearchJobForNextSpace(job.id, store).status).toBe("queued");
    const orch = await runOrchestratedSearchJob(orchInput(job.id, root));
    expect(orch.finalStopReason).toBe("DEADLINE_REACHED");
    const finalized = finalizeNormalSearchCompletion(
      job.id,
      orch.finalStopReason,
      store,
    );
    expect(finalized?.status).toBe("completed");
    expect(getSearchJob(job.id, store)?.finishedAt).toBeTruthy();
    expect(getSearchPlan(job.id, store)?.completionReason).toBe("DEADLINE_REACHED");
  });

  it("11. active owned deadline path ends completed", async () => {
    const root = makeTempRoot();
    const store = { rootDir: root };
    const job = createSearchJob(
      {
        ...sampleConfig(),
        evaluationWindows: [
          {
            id: "w1",
            label: "recent",
            fromOpenTime: 0,
            toOpenTime: 1,
          },
        ],
      },
      store,
    );
    writePlan(job.id, root, null);
    saveProfile(job.id, root);
    startSearchJobExecution(job.id, {
      storeOptions: store,
      preloadedCandlesByKey: {},
      evaluate: async () => {
        throw new Error("owned deadline path must not evaluate");
      },
    });
    await waitForSearchJobExecution(job.id);
    const after = getSearchJob(job.id, store);
    expect(after?.status).toBe("completed");
    expect(getSearchPlan(job.id, store)?.completionReason).toBe("DEADLINE_REACHED");
    expect(isSearchJobExecutionActive(job.id)).toBe(false);
    expect(isJobExecutionOwnedOnDisk(job.id, store)).toBe(false);
  });

  it("12. finishedAt is set on active deadline finalization", async () => {
    const root = makeTempRoot();
    const store = { rootDir: root };
    const job = createSearchJob(sampleConfig(), store);
    writePlan(job.id, root, null);
    markSearchJobRunning(job.id, store);
    markSearchJobCompleted(job.id, store);
    reopenSearchJobForNextSpace(job.id, store);
    const orch = await runOrchestratedSearchJob(orchInput(job.id, root));
    const finalized = finalizeNormalSearchCompletion(
      job.id,
      orch.finalStopReason,
      store,
    );
    expect(finalized?.finishedAt).toBeTruthy();
    expect(Date.parse(finalized!.finishedAt!)).toBeGreaterThan(0);
  });

  it("13. no new trial after deadline boundary", async () => {
    const root = makeTempRoot();
    const store = { rootDir: root };
    const job = createSearchJob(sampleConfig(), store);
    writePlan(job.id, root, null);
    markSearchJobRunning(job.id, store);
    markSearchJobCompleted(job.id, store);
    reopenSearchJobForNextSpace(job.id, store);
    await runOrchestratedSearchJob(orchInput(job.id, root));
    expect(listSearchTrials(job.id, store)).toEqual([]);
  });

  it("14. no duplicate trial", async () => {
    const root = makeTempRoot();
    const store = { rootDir: root };
    const job = createSearchJob(sampleConfig(), store);
    writePlan(job.id, root, null);
    markSearchJobRunning(job.id, store);
    markSearchJobCompleted(job.id, store);
    reopenSearchJobForNextSpace(job.id, store);
    await runOrchestratedSearchJob(orchInput(job.id, root));
    await runOrchestratedSearchJob(orchInput(job.id, root));
    expect(listSearchTrials(job.id, store)).toHaveLength(0);
  });

  it("15. arbitrary inactive queued job is NOT silently auto-completed", () => {
    const root = makeTempRoot();
    const store = { rootDir: root };
    const job = createSearchJob(sampleConfig(), store);
    writePlan(job.id, root, "DEADLINE_REACHED");
    expect(isSearchJobExecutionActive(job.id)).toBe(false);
    const after = finalizeNormalSearchCompletion(job.id, "DEADLINE_REACHED", store);
    expect(after?.status).toBe("queued");
    expect(getSearchJob(job.id, store)?.finishedAt).toBeNull();
  });

  it("16. normal reads do not repair historical invalid pairs", () => {
    const root = productionRoot();
    const presentIds = APPROVED_13.filter((id) => !isHistoricalMissingJobId(id));
    const before = presentIds.map((id) => ({
      job: sha256File(path.join(root, "jobs", `${id}.json`)),
      plan: sha256File(path.join(root, "jobs", `${id}.plan.json`)),
    }));
    for (const id of presentIds) {
      const job = JSON.parse(
        fs.readFileSync(path.join(root, "jobs", `${id}.json`), "utf8"),
      ) as { status: string; finishedAt: string | null };
      const plan = JSON.parse(
        fs.readFileSync(path.join(root, "jobs", `${id}.plan.json`), "utf8"),
      ) as { completionReason: string | null };
      expect(job.status).toBe("completed");
      expect(job.finishedAt).toBeTruthy();
      expect(plan.completionReason).toBe("DEADLINE_REACHED");
      expect(
        isDashboardPendingResearch({
          id,
          status: job.status,
          executionActive: false,
        }),
      ).toBe(false);
      expect(
        resolveResearchOutcome({
          status: job.status,
          completionReason: plan.completionReason,
          preservedResultCount: 1,
        }).id,
      ).toBe("normal_completed");
    }
    expect(
      presentIds.map((id) => ({
        job: sha256File(path.join(root, "jobs", `${id}.json`)),
        plan: sha256File(path.join(root, "jobs", `${id}.plan.json`)),
      })),
    ).toEqual(before);
  });

  it("17. completed + DEADLINE_REACHED remains valid", () => {
    const root = makeTempRoot();
    const store = { rootDir: root };
    const job = createSearchJob(sampleConfig(), store);
    writePlan(job.id, root, "DEADLINE_REACHED");
    markSearchJobRunning(job.id, store);
    const completed = finalizeNormalSearchCompletion(
      job.id,
      "DEADLINE_REACHED",
      store,
    );
    expect(completed?.status).toBe("completed");
    expect(getSearchPlan(job.id, store)?.completionReason).toBe("DEADLINE_REACHED");
    expect(() => startStrategySearchJobApi(job.id, { storeOptions: store })).toThrow(
      /cannot start strategy-search job in status: completed/,
    );
  });

  it("18. existing interrupted deadline completion remains valid", () => {
    const root = makeTempRoot();
    const store = { rootDir: root };
    const job = createSearchJob(sampleConfig(), store);
    writePlan(job.id, root, null);
    markSearchJobRunning(job.id, store);
    markSearchJobInterrupted(job.id, store);
    const completed = completeInterruptedJobAtDeadline(job.id, Date.now(), store);
    expect(completed.status).toBe("completed");
    expect(getSearchPlan(job.id, store)?.completionReason).toBe("DEADLINE_REACHED");
    expect(completed.finishedAt).toBeTruthy();
  });

  it("19. current 13 detectable read-only and unchanged", () => {
    const root = productionRoot();
    const found: string[] = [];
    const index = JSON.parse(
      fs.readFileSync(path.join(root, "index.json"), "utf8"),
    ) as { jobs: Array<{ id: string; status: string }> };
    for (const row of index.jobs) {
      const jobPath = path.join(root, "jobs", `${row.id}.json`);
      if (!fs.existsSync(jobPath)) continue;
      const job = JSON.parse(
        fs.readFileSync(jobPath, "utf8"),
      ) as { status: string };
      const planPath = path.join(root, "jobs", `${row.id}.plan.json`);
      if (!fs.existsSync(planPath)) continue;
      const plan = JSON.parse(fs.readFileSync(planPath, "utf8")) as {
        completionReason?: string | null;
      };
      if (job.status === "queued" && plan.completionReason === "DEADLINE_REACHED") {
        found.push(row.id);
      }
    }
    expect(found.sort()).toEqual([]);
  });

  it("20. production index/job mirror remains aligned", () => {
    const root = productionRoot();
    const index = JSON.parse(
      fs.readFileSync(path.join(root, "index.json"), "utf8"),
    ) as { jobs: Array<{ id: string; status: string }> };
    const missing: string[] = [];
    let statusDesync = 0;
    for (const row of index.jobs) {
      const jobPath = path.join(root, "jobs", `${row.id}.json`);
      if (!fs.existsSync(jobPath)) {
        missing.push(row.id);
        continue;
      }
      const job = JSON.parse(fs.readFileSync(jobPath, "utf8")) as { status: string };
      if (row.status !== job.status) statusDesync += 1;
    }
    expect(missing.sort()).toEqual([...HISTORICAL_MISSING_JOB_ID_SET].sort());
    expect(statusDesync).toBe(0);
    for (const id of APPROVED_13) {
      const row = index.jobs.find((item) => item.id === id);
      expect(row?.status).toBe("completed");
    }
  });
});
