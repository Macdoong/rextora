/**
 * P2-F1 diagnosis only. Temp stores for current-source reproduction.
 * Production store is raw-read only (never getSearchJob / recoverReadJson).
 */
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  finalizeNormalSearchCompletion,
  isNormalSearchCompletionReason,
} from "../src/lib/rextora/strategySearch/jobExecutionRegistry";
import {
  createSearchJob,
  getSearchJob,
  markSearchJobCompleted,
  markSearchJobInterrupted,
  markSearchJobPaused,
  markSearchJobRunning,
  requestPauseSearchJob,
  reopenSearchJobForNextSpace,
  resumeSearchJob,
} from "../src/lib/rextora/strategySearch/jobStore";
import { completeInterruptedJobAtDeadline } from "../src/lib/rextora/strategySearch/processInterruption";
import { inspectStaleTerminalRecoveryCandidate } from "../src/lib/rextora/strategySearch/staleTerminalRecovery";
import {
  createEmptySearchPlan,
  getSearchPlan,
  markPlanResumed,
  saveSearchPlan,
} from "../src/lib/rextora/strategySearch/searchPlan";
import { resolveResearchOutcome } from "../src/lib/rextora/strategySearch/researchOutcome";
import { runOrchestratedSearchJob } from "../src/lib/rextora/strategySearch/searchOrchestrator";
import { isDashboardPendingResearch } from "../components/rextora/dashboard/dashboardResearchSelection";
import type { StrategySearchConfig } from "../src/lib/rextora/strategySearch/types";
import {
  HISTORICAL_MISSING_JOB_ID_SET,
  isHistoricalMissingJobId,
} from "./helpers/productionResearchBaseline";

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
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "rextora-p2f1-"));
  tempRoots.push(root);
  return root;
}

afterEach(() => {
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

function writeDeadlinePlan(
  jobId: string,
  root: string,
  reason: "DEADLINE_REACHED" | null,
) {
  const plan = createEmptySearchPlan({
    searchName: "p2f1",
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

function sha256File(filePath: string): string | null {
  if (!fs.existsSync(filePath)) return null;
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

function productionRoot(): string {
  return path.join(process.cwd(), "data", "rextora", "strategy-search");
}

function rawEnumerateQueuedDeadline(root: string) {
  const index = JSON.parse(
    fs.readFileSync(path.join(root, "index.json"), "utf8"),
  ) as { jobs: Array<{ id: string; status: string }> };
  const out: string[] = [];
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
      out.push(row.id);
    }
  }
  return out.sort();
}

describe("P2-F1 queued + DEADLINE_REACHED diagnosis", () => {
  it("1. normal DEADLINE_REACHED lifecycle contract", () => {
    expect(isNormalSearchCompletionReason("DEADLINE_REACHED")).toBe(true);
    expect(isNormalSearchCompletionReason("PAUSED")).toBe(false);
    const view = resolveResearchOutcome({
      status: "completed",
      completionReason: "DEADLINE_REACHED",
      preservedResultCount: 1,
    });
    expect(view.id).toBe("normal_completed");
    expect(view.isPresentedAsCompleted).toBe(true);
  });

  it("2. expected terminal job status after deadline", () => {
    const root = makeTempRoot();
    const job = createSearchJob(sampleConfig(), { rootDir: root });
    writeDeadlinePlan(job.id, root, "DEADLINE_REACHED");
    markSearchJobRunning(job.id, { rootDir: root });
    const finalized = finalizeNormalSearchCompletion(
      job.id,
      "DEADLINE_REACHED",
      { rootDir: root },
    );
    expect(finalized?.status).toBe("completed");
    expect(getSearchJob(job.id, { rootDir: root })?.finishedAt).toBeTruthy();
    expect(getSearchPlan(job.id, { rootDir: root })?.completionReason).toBe(
      "DEADLINE_REACHED",
    );
  });

  it("3. queued compatibility with DEADLINE_REACHED", () => {
    const root = makeTempRoot();
    const job = createSearchJob(sampleConfig(), { rootDir: root });
    writeDeadlinePlan(job.id, root, "DEADLINE_REACHED");
    const finalized = finalizeNormalSearchCompletion(
      job.id,
      "DEADLINE_REACHED",
      { rootDir: root },
    );
    expect(finalized?.status).toBe("queued");
    expect(getSearchJob(job.id, { rootDir: root })?.finishedAt).toBeNull();
    expect(
      isDashboardPendingResearch({
        id: job.id,
        status: "queued",
        executionActive: false,
      }),
    ).toBe(true);
  });

  it("4. requeue/resume behavior after deadline", () => {
    const root = makeTempRoot();
    const job = createSearchJob(sampleConfig(), { rootDir: root });
    writeDeadlinePlan(job.id, root, "DEADLINE_REACHED");
    markSearchJobRunning(job.id, { rootDir: root });
    requestPauseSearchJob(job.id, { rootDir: root });
    markSearchJobPaused(job.id, { rootDir: root });
    const resumed = resumeSearchJob(job.id, { rootDir: root });
    expect(resumed.status).toBe("queued");
    expect(getSearchPlan(job.id, { rootDir: root })?.completionReason).toBe(
      "DEADLINE_REACHED",
    );
    const plan = getSearchPlan(job.id, { rootDir: root })!;
    expect(markPlanResumed(plan).completionReason).toBe("DEADLINE_REACHED");
  });

  it("5. process-loss behavior around deadline", () => {
    const root = makeTempRoot();
    const job = createSearchJob(sampleConfig(), { rootDir: root });
    writeDeadlinePlan(job.id, root, null);
    markSearchJobRunning(job.id, { rootDir: root });
    const store = { rootDir: root };
    markSearchJobInterrupted(job.id, store);
    const completed = completeInterruptedJobAtDeadline(job.id, Date.now(), store);
    expect(completed.status).toBe("completed");
    expect(getSearchPlan(job.id, store)?.completionReason).toBe("DEADLINE_REACHED");

    const queued = createSearchJob(sampleConfig(), store);
    writeDeadlinePlan(queued.id, root, "DEADLINE_REACHED");
    expect(inspectStaleTerminalRecoveryCandidate(queued, store)).toBeNull();
  });

  it("6. current-source reproduction result", async () => {
    const root = makeTempRoot();
    const store = { rootDir: root };
    const job = createSearchJob(sampleConfig(), store);
    writeDeadlinePlan(job.id, root, null);
    markSearchJobRunning(job.id, store);
    markSearchJobCompleted(job.id, store);
    const reopened = reopenSearchJobForNextSpace(job.id, store);
    expect(reopened.status).toBe("queued");
    const orch = await runOrchestratedSearchJob({
      jobId: job.id,
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
        throw new Error("P2-F1 reproduction must not evaluate candidates");
      },
    });
    expect(orch.finalStopReason).toBe("DEADLINE_REACHED");
    const finalized = finalizeNormalSearchCompletion(
      job.id,
      orch.finalStopReason,
      store,
    );
    expect(finalized?.status).toBe("completed");
    expect(getSearchJob(job.id, store)?.finishedAt).toBeTruthy();
    expect(getSearchPlan(job.id, store)?.completionReason).toBe(
      "DEADLINE_REACHED",
    );
  });

  it("7. checkpoint resume behavior", () => {
    const root = makeTempRoot();
    const job = createSearchJob(sampleConfig(), { rootDir: root });
    writeDeadlinePlan(job.id, root, "DEADLINE_REACHED");
    expect(job.status).toBe("queued");
    expect(job.finishedAt).toBeNull();
    expect(job.checkpoint.nextIteration).toBe(job.checkpoint.completedIterations);
    const after = finalizeNormalSearchCompletion(job.id, "DEADLINE_REACHED", {
      rootDir: root,
    });
    expect(after?.checkpoint.completedIterations).toBe(
      job.checkpoint.completedIterations,
    );
    expect(after?.status).toBe("queued");
  });

  it("8. no duplicate-trial behavior if applicable", () => {
    const root = makeTempRoot();
    const job = createSearchJob(sampleConfig(), { rootDir: root });
    writeDeadlinePlan(job.id, root, "DEADLINE_REACHED");
    markSearchJobRunning(job.id, { rootDir: root });
    finalizeNormalSearchCompletion(job.id, "DEADLINE_REACHED", { rootDir: root });
    const trialsDir = path.join(root, "trials", job.id);
    const names = fs.existsSync(trialsDir) ? fs.readdirSync(trialsDir) : [];
    expect(names).toEqual([]);
  });

  it("9. all 13 production records detected read-only", () => {
    const found = rawEnumerateQueuedDeadline(productionRoot());
    expect(found).toEqual([]);
  });

  it("10. no unrelated production record classified", () => {
    const found = rawEnumerateQueuedDeadline(productionRoot());
    expect(found).toEqual([]);
  });

  it("11. diagnosis performs no production writes", () => {
    const root = productionRoot();
    const beforeIndex = sha256File(path.join(root, "index.json"));
    const beforeJobs = APPROVED_13.map((id) =>
      sha256File(path.join(root, "jobs", `${id}.json`)),
    );
    const beforePlans = APPROVED_13.map((id) =>
      sha256File(path.join(root, "jobs", `${id}.plan.json`)),
    );
    rawEnumerateQueuedDeadline(root);
    expect(sha256File(path.join(root, "index.json"))).toBe(beforeIndex);
    expect(
      APPROVED_13.map((id) => sha256File(path.join(root, "jobs", `${id}.json`))),
    ).toEqual(beforeJobs);
    expect(
      APPROVED_13.map((id) =>
        sha256File(path.join(root, "jobs", `${id}.plan.json`)),
      ),
    ).toEqual(beforePlans);
  });

  it("12. current index/job mirror remains aligned", () => {
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
      if (isHistoricalMissingJobId(id)) continue;
      const row = index.jobs.find((item) => item.id === id);
      const job = JSON.parse(
        fs.readFileSync(path.join(root, "jobs", `${id}.json`), "utf8"),
      ) as { status: string };
      expect(row?.status).toBe("completed");
      expect(job.status).toBe("completed");
    }
  });
});
