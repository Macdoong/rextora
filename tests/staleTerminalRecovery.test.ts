import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { recoverOrphanSearchJobs } from "@/src/lib/rextora/strategySearch/orphanJobRecovery";
import { acquireJobExecutionOwnership } from "@/src/lib/rextora/strategySearch/jobExecutionOwnership";
import {
  createSearchJob,
  getSearchJob,
  markSearchJobCompleted,
  markSearchJobRunning,
  requestCancelSearchJob,
  requestPauseSearchJob,
  type StrategySearchStoreOptions,
} from "@/src/lib/rextora/strategySearch/jobStore";
import {
  createEmptySearchPlan,
  getSearchPlan,
  saveSearchPlan,
  type StrategySearchCompletionReason,
} from "@/src/lib/rextora/strategySearch/searchPlan";
import { recoverStaleTerminalSearchJobs } from "@/src/lib/rextora/strategySearch/staleTerminalRecovery";
import type { StrategySearchConfig } from "@/src/lib/rextora/strategySearch/types";

const roots: string[] = [];

function tempStore(): StrategySearchStoreOptions {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "rextora-stale-terminal-"));
  roots.push(rootDir);
  return { rootDir };
}

function config(): StrategySearchConfig {
  return {
    searchVersion: "1",
    strategyTemplateId: "stale_terminal_test",
    symbols: ["BTCUSDT"],
    timeframe: "15m",
    dataVersion: "test-v1",
    seed: 1,
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
    passCriteria: {},
    costStress: { enabled: false, multipliers: [] },
    jitter: { enabled: false, samples: 0, relativeAmplitude: 0 },
  };
}

function createJobWithReason(
  reason: StrategySearchCompletionReason,
  store: StrategySearchStoreOptions,
) {
  const created = createSearchJob(config(), store);
  const running = markSearchJobRunning(created.id, store);
  saveSearchPlan(
    created.id,
    {
      ...createEmptySearchPlan({
        searchName: "stale terminal test",
        depthProfile: "fast",
        qualificationProfile: "balanced",
        qualifiedTarget: 1,
        candidateBudget: 1,
        stageBatchSize: 1,
        maxRuntimeMs: 1,
        spaces: [{ id: "ema_core", labelKo: "EMA" }],
      }),
      completionReason: reason,
      campaignStartedAtMs: Date.now() - 10_000,
    },
    store,
  );
  return running;
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  while (roots.length) {
    const root = roots.pop();
    if (root) fs.rmSync(root, { recursive: true, force: true });
  }
});

describe("verified terminal-stale research recovery", () => {
  it("dry-runs then applies DEADLINE_REACHED without changing its plan reason", () => {
    const store = tempStore();
    const job = createJobWithReason("DEADLINE_REACHED", store);

    const dryRun = recoverStaleTerminalSearchJobs({ ...store, dryRun: true });
    expect(dryRun.candidates).toEqual([
      {
        jobId: job.id,
        completionReason: "DEADLINE_REACHED",
        currentStatus: "running",
        wouldTransitionTo: "completed",
      },
    ]);
    expect(dryRun.completed).toEqual([]);
    expect(getSearchJob(job.id, store)?.status).toBe("running");
    expect(getSearchJob(job.id, store)?.finishedAt).toBeNull();

    const applied = recoverStaleTerminalSearchJobs({ ...store, dryRun: false });
    expect(applied.completed).toEqual([job.id]);
    expect(getSearchJob(job.id, store)?.status).toBe("completed");
    expect(getSearchJob(job.id, store)?.finishedAt).toBeTruthy();
    expect(getSearchPlan(job.id, store)?.completionReason).toBe(
      "DEADLINE_REACHED",
    );
  });

  it("finalizes another verified normal reason", () => {
    const store = tempStore();
    const job = createJobWithReason("SEARCH_SPACE_EXHAUSTED", store);
    const result = recoverStaleTerminalSearchJobs({ ...store, dryRun: false });
    expect(result.completed).toEqual([job.id]);
    expect(getSearchJob(job.id, store)?.status).toBe("completed");
  });

  it("does not finalize a running job with a null completion reason", () => {
    const store = tempStore();
    const job = createJobWithReason(null, store);
    const result = recoverStaleTerminalSearchJobs({ ...store, dryRun: false });
    expect(result.candidates).toEqual([]);
    expect(result.completed).toEqual([]);
    expect(getSearchJob(job.id, store)?.status).toBe("running");
  });

  it("does not finalize while a valid execution owner exists", () => {
    const store = tempStore();
    const job = createJobWithReason("DEADLINE_REACHED", store);
    acquireJobExecutionOwnership(job.id, "active_test_owner", store);
    const result = recoverStaleTerminalSearchJobs({ ...store, dryRun: false });
    expect(result.candidates).toEqual([]);
    expect(getSearchJob(job.id, store)?.status).toBe("running");
  });

  it("does not finalize pause-requested or cancel-requested jobs", () => {
    const store = tempStore();
    const pausing = createJobWithReason("DEADLINE_REACHED", store);
    requestPauseSearchJob(pausing.id, store);
    const cancelling = createJobWithReason("DEADLINE_REACHED", store);
    requestCancelSearchJob(cancelling.id, store);

    const result = recoverStaleTerminalSearchJobs({ ...store, dryRun: false });
    expect(result.candidates).toEqual([]);
    expect(getSearchJob(pausing.id, store)?.status).toBe("pause_requested");
    expect(getSearchJob(cancelling.id, store)?.status).toBe(
      "cancel_requested",
    );
  });

  it("is a no-op for completed jobs and on a second recovery", () => {
    const store = tempStore();
    const precompleted = createJobWithReason("MAX_ITERATIONS", store);
    markSearchJobCompleted(precompleted.id, store);
    const stale = createJobWithReason("MAX_CANDIDATE_BUDGET", store);

    const first = recoverStaleTerminalSearchJobs({ ...store, dryRun: false });
    const firstSnapshot = getSearchJob(stale.id, store);
    const second = recoverStaleTerminalSearchJobs({ ...store, dryRun: false });

    expect(first.completed).toEqual([stale.id]);
    expect(second.candidates).toEqual([]);
    expect(second.completed).toEqual([]);
    expect(getSearchJob(stale.id, store)).toEqual(firstSnapshot);
    expect(getSearchJob(precompleted.id, store)?.status).toBe("completed");
  });

  it("prevents terminal-stale jobs from startup auto-resume", async () => {
    const store = tempStore();
    const job = createJobWithReason("DEADLINE_REACHED", store);
    const jobApi = await import(
      "@/src/lib/rextora/strategySearch/jobApiService"
    );
    const startSpy = vi
      .spyOn(jobApi, "startStrategySearchJobApi")
      .mockImplementation(() => ({ ok: true }) as never);
    vi.stubEnv("REXTORA_ORPHAN_AUTO_RESUME_LIMIT", "2");

    const result = recoverOrphanSearchJobs(store);

    expect(result.terminalStaleSkipped).toEqual([job.id]);
    expect(result.resumed).toEqual([]);
    expect(startSpy).not.toHaveBeenCalled();
    expect(getSearchJob(job.id, store)?.status).toBe("running");
  });
});
