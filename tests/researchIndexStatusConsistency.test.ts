/**
 * P2-E2A: recurrence prevention for index/job status desync.
 * Isolated temporary stores only — no production strategy-search mutation.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  MISSING_JOB_RECOVERY_REASON,
  recoverMissingJobRecord,
} from "../src/lib/rextora/strategySearch/jobRecordRecovery";
import {
  createSearchJob,
  getSearchJob,
  getSearchTrial,
  listSearchJobs,
  markSearchJobCompleted,
  markSearchJobFailed,
  markSearchJobInterrupted,
  markSearchJobPaused,
  markSearchJobRunning,
  requestPauseSearchJob,
  resumeSearchJob,
  saveSearchTrial,
} from "../src/lib/rextora/strategySearch/jobStore";
import type {
  StrategySearchConfig,
  StrategySearchTrial,
} from "../src/lib/rextora/strategySearch/types";
import {
  createEmptySearchPlan,
  getSearchPlan,
  markPlanInterrupted,
  markPlanPaused,
  saveSearchPlan,
} from "../src/lib/rextora/strategySearch/searchPlan";
import { inspectInterruptedRecovery } from "../src/lib/rextora/strategySearch/processInterruption";
import { CONTEXT_FALLBACK_PARAMS } from "../src/lib/rextora/strategy/safeV44Params";

const tempRoots: string[] = [];

function makeTempRoot(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "rextora-e2a-"));
  tempRoots.push(root);
  return root;
}

afterEach(() => {
  vi.restoreAllMocks();
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
    seed: 42,
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
    costStress: { enabled: true, multipliers: [1, 1.5] },
    jitter: { enabled: false, samples: 0, relativeAmplitude: 0 },
  };
}

function readIndex(root: string): {
  jobs: Array<{ id: string; status: string }>;
} {
  return JSON.parse(fs.readFileSync(path.join(root, "index.json"), "utf8")) as {
    jobs: Array<{ id: string; status: string }>;
  };
}

function indexStatus(root: string, jobId: string): string | undefined {
  return readIndex(root).jobs.find((row) => row.id === jobId)?.status;
}

function writeIdlePlan(jobId: string, root: string) {
  saveSearchPlan(
    jobId,
    createEmptySearchPlan({
      searchName: "e2a-plan",
      depthProfile: "standard",
      qualificationProfile: "balanced",
      qualifiedTarget: 3,
      candidateBudget: 100,
      stageBatchSize: 20,
      maxRuntimeMs: 60_000,
      spaces: [{ id: "trend", labelKo: "추세" }],
    }),
    { rootDir: root },
  );
}

function failIndexRenames() {
  const rename = fs.renameSync.bind(fs);
  vi.spyOn(fs, "renameSync").mockImplementation(((
    from: fs.PathLike,
    to: fs.PathLike,
  ) => {
    const src = String(from);
    const dest = String(to);
    if (
      src.includes(`${path.sep}index.json`) ||
      dest.includes(`${path.sep}index.json`)
    ) {
      throw new Error("forced index write failure");
    }
    return rename(from, to);
  }) as typeof fs.renameSync);
}

describe("Research index/job status consistency (P2-E2A)", () => {
  it("1. missing-job recovery no longer defaults blindly to paused", () => {
    const root = makeTempRoot();
    const job = createSearchJob(sampleConfig(), { rootDir: root });
    fs.unlinkSync(path.join(root, "jobs", `${job.id}.json`));
    const recovery = recoverMissingJobRecord(job.id, { rootDir: root });
    expect(recovery.recovered).toBe(false);
    expect(recovery.recoveredStatus).not.toBe("paused");
    expect(recovery.reason).toBe(MISSING_JOB_RECOVERY_REASON.INSUFFICIENT);
  });

  it("2. proven terminal recovery", () => {
    const root = makeTempRoot();
    const job = createSearchJob(sampleConfig(), { rootDir: root });
    writeIdlePlan(job.id, root);
    const plan = getSearchPlan(job.id, { rootDir: root })!;
    saveSearchPlan(
      job.id,
      { ...plan, completionReason: "DEADLINE_REACHED" },
      { rootDir: root },
    );
    const index = readIndex(root);
    index.jobs.find((row) => row.id === job.id)!.status = "paused";
    fs.writeFileSync(
      path.join(root, "index.json"),
      JSON.stringify({ version: 1, updatedAt: new Date().toISOString(), jobs: index.jobs }, null, 2),
    );
    fs.unlinkSync(path.join(root, "jobs", `${job.id}.json`));
    const recovery = recoverMissingJobRecord(job.id, { rootDir: root });
    expect(recovery.recovered).toBe(true);
    expect(recovery.recoveredStatus).toBe("completed");
    expect(recovery.reason).toBe(MISSING_JOB_RECOVERY_REASON.TERMINAL_COMPLETION);
    expect(getSearchJob(job.id, { rootDir: root })?.status).toBe("completed");
    expect(indexStatus(root, job.id)).toBe("completed");
  });

  it("3. proven queued recovery where evidence supports it", () => {
    const root = makeTempRoot();
    const job = createSearchJob(sampleConfig(), { rootDir: root });
    writeIdlePlan(job.id, root);
    fs.unlinkSync(path.join(root, "jobs", `${job.id}.json`));
    const recovery = recoverMissingJobRecord(job.id, { rootDir: root });
    expect(recovery.recovered).toBe(true);
    expect(recovery.recoveredStatus).toBe("queued");
    expect(recovery.reason).toBe(MISSING_JOB_RECOVERY_REASON.QUEUED);
    expect(indexStatus(root, job.id)).toBe("queued");
  });

  it("4. ambiguous recovery fails closed", () => {
    const root = makeTempRoot();
    const job = createSearchJob(sampleConfig(), { rootDir: root });
    writeIdlePlan(job.id, root);
    const index = readIndex(root);
    index.jobs.find((row) => row.id === job.id)!.status = "paused";
    fs.writeFileSync(
      path.join(root, "index.json"),
      JSON.stringify({ version: 1, updatedAt: new Date().toISOString(), jobs: index.jobs }, null, 2),
    );
    fs.unlinkSync(path.join(root, "jobs", `${job.id}.json`));
    const recovery = recoverMissingJobRecord(job.id, { rootDir: root });
    expect(recovery.recovered).toBe(false);
    expect(recovery.reason).toBe(MISSING_JOB_RECOVERY_REASON.INSUFFICIENT);
    expect(getSearchJob(job.id, { rootDir: root })).toBeNull();
    expect(indexStatus(root, job.id)).toBe("paused");
  });

  it("5. stale index cannot override stronger durable evidence", () => {
    const root = makeTempRoot();
    const job = createSearchJob(sampleConfig(), { rootDir: root });
    writeIdlePlan(job.id, root);
    const plan = getSearchPlan(job.id, { rootDir: root })!;
    saveSearchPlan(
      job.id,
      markPlanInterrupted({ ...plan, campaignStartedAtMs: Date.now() - 1_000 }, Date.now() - 500),
      { rootDir: root },
    );
    const index = readIndex(root);
    index.jobs.find((row) => row.id === job.id)!.status = "paused";
    fs.writeFileSync(
      path.join(root, "index.json"),
      JSON.stringify({ version: 1, updatedAt: new Date().toISOString(), jobs: index.jobs }, null, 2),
    );
    fs.unlinkSync(path.join(root, "jobs", `${job.id}.json`));
    const recovery = recoverMissingJobRecord(job.id, { rootDir: root });
    expect(recovery.recovered).toBe(true);
    expect(recovery.recoveredStatus).toBe("interrupted");
    expect(recovery.reason).toBe(MISSING_JOB_RECOVERY_REASON.INTERRUPTED);
    expect(indexStatus(root, job.id)).toBe("interrupted");
  });

  it("6. normal paused->queued keeps index aligned", () => {
    const root = makeTempRoot();
    const job = createSearchJob(sampleConfig(), { rootDir: root });
    markSearchJobRunning(job.id, { rootDir: root });
    requestPauseSearchJob(job.id, { rootDir: root });
    markSearchJobPaused(job.id, { rootDir: root });
    const resumed = resumeSearchJob(job.id, { rootDir: root });
    expect(resumed.status).toBe("queued");
    expect(getSearchJob(job.id, { rootDir: root })?.status).toBe(
      indexStatus(root, job.id),
    );
    expect(indexStatus(root, job.id)).toBe("queued");
  });

  it("7. normal completion keeps index aligned", () => {
    const root = makeTempRoot();
    const job = createSearchJob(sampleConfig(), { rootDir: root });
    markSearchJobRunning(job.id, { rootDir: root });
    markSearchJobCompleted(job.id, { rootDir: root });
    expect(getSearchJob(job.id, { rootDir: root })?.status).toBe("completed");
    expect(indexStatus(root, job.id)).toBe("completed");
  });

  it("8. injected index failure rolls back update", () => {
    const root = makeTempRoot();
    const job = createSearchJob(sampleConfig(), { rootDir: root });
    markSearchJobRunning(job.id, { rootDir: root });
    requestPauseSearchJob(job.id, { rootDir: root });
    markSearchJobPaused(job.id, { rootDir: root });
    failIndexRenames();
    expect(() => resumeSearchJob(job.id, { rootDir: root })).toThrow();
    vi.restoreAllMocks();
    expect(getSearchJob(job.id, { rootDir: root })?.status).toBe("paused");
    expect(indexStatus(root, job.id)).toBe("paused");
  });

  it("9. injected index failure rolls back failed create", () => {
    const root = makeTempRoot();
    failIndexRenames();
    expect(() => createSearchJob(sampleConfig(), { rootDir: root })).toThrow();
    vi.restoreAllMocks();
    const jobsDir = path.join(root, "jobs");
    const leftovers = fs.existsSync(jobsDir)
      ? fs.readdirSync(jobsDir).filter((name) => /^search_.*\.json$/.test(name))
      : [];
    expect(leftovers).toEqual([]);
    if (fs.existsSync(path.join(root, "index.json"))) {
      expect(readIndex(root).jobs).toEqual([]);
    }
  });

  it("10. .bak promotion resynchronizes index", () => {
    const root = makeTempRoot();
    const job = createSearchJob(sampleConfig(), { rootDir: root });
    const queued = fs.readFileSync(path.join(root, "jobs", `${job.id}.json`), "utf8");
    markSearchJobRunning(job.id, { rootDir: root });
    requestPauseSearchJob(job.id, { rootDir: root });
    markSearchJobPaused(job.id, { rootDir: root });
    expect(indexStatus(root, job.id)).toBe("paused");
    const jobPath = path.join(root, "jobs", `${job.id}.json`);
    fs.writeFileSync(`${jobPath}.bak`, queued, "utf8");
    fs.writeFileSync(jobPath, "{not-json", "utf8");
    const restored = getSearchJob(job.id, { rootDir: root });
    expect(restored?.status).toBe("queued");
    expect(indexStatus(root, job.id)).toBe("queued");
  });

  it("11. .tmp promotion resynchronizes index", () => {
    const root = makeTempRoot();
    const job = createSearchJob(sampleConfig(), { rootDir: root });
    markSearchJobRunning(job.id, { rootDir: root });
    const completed = markSearchJobCompleted(job.id, { rootDir: root });
    const completedJson = fs.readFileSync(
      path.join(root, "jobs", `${job.id}.json`),
      "utf8",
    );
    const jobPath = path.join(root, "jobs", `${job.id}.json`);
    fs.unlinkSync(jobPath);
    fs.writeFileSync(`${jobPath}.tmp`, completedJson, "utf8");
    const index = readIndex(root);
    index.jobs.find((row) => row.id === job.id)!.status = "paused";
    fs.writeFileSync(
      path.join(root, "index.json"),
      JSON.stringify({ version: 1, updatedAt: new Date().toISOString(), jobs: index.jobs }, null, 2),
    );
    const restored = getSearchJob(completed.id, { rootDir: root });
    expect(restored?.status).toBe("completed");
    expect(indexStatus(root, job.id)).toBe("completed");
  });

  it("12. normal read does not repair unrelated stale index", () => {
    const root = makeTempRoot();
    const job = createSearchJob(sampleConfig(), { rootDir: root });
    const index = readIndex(root);
    index.jobs.find((row) => row.id === job.id)!.status = "paused";
    const stale = JSON.stringify(
      { version: 1, updatedAt: new Date().toISOString(), jobs: index.jobs },
      null,
      2,
    );
    fs.writeFileSync(path.join(root, "index.json"), stale, "utf8");
    expect(getSearchJob(job.id, { rootDir: root })?.status).toBe("queued");
    listSearchJobs({ rootDir: root });
    expect(indexStatus(root, job.id)).toBe("paused");
  });

  it("13. plan/trial JSON recovery does not touch job index", () => {
    const root = makeTempRoot();
    const job = createSearchJob(sampleConfig(), { rootDir: root });
    writeIdlePlan(job.id, root);
    const trial: StrategySearchTrial = {
      jobId: job.id,
      iteration: 0,
      candidateId: `${job.id}_c0`,
      generatorType: "random",
      parentCandidateIds: [],
      params: { ...CONTEXT_FALLBACK_PARAMS },
      paramsHash: "abc123hash",
      createdAt: new Date().toISOString(),
      score: 1,
      passed: true,
      windowResults: [],
      costStressResults: [],
      jitterResults: [],
      durationMs: 1,
      failureReasons: [],
    };
    saveSearchTrial(trial, { rootDir: root });
    const index = readIndex(root);
    index.jobs.find((row) => row.id === job.id)!.status = "paused";
    fs.writeFileSync(
      path.join(root, "index.json"),
      JSON.stringify({ version: 1, updatedAt: new Date().toISOString(), jobs: index.jobs }, null, 2),
    );
    const trialPath = path.join(
      root,
      "trials",
      job.id,
      "00000000.json",
    );
    const body = fs.readFileSync(trialPath, "utf8");
    fs.writeFileSync(`${trialPath}.bak`, body, "utf8");
    fs.writeFileSync(trialPath, "{bad", "utf8");
    expect(getSearchTrial(job.id, 0, { rootDir: root })?.iteration).toBe(0);
    expect(indexStatus(root, job.id)).toBe("paused");
    expect(getSearchPlan(job.id, { rootDir: root })?.searchName).toBe("e2a-plan");
    expect(indexStatus(root, job.id)).toBe("paused");
  });

  it("14. existing process interruption lifecycle unaffected", () => {
    const root = makeTempRoot();
    const job = createSearchJob(sampleConfig(), { rootDir: root });
    markSearchJobRunning(job.id, { rootDir: root });
    markSearchJobInterrupted(job.id, { rootDir: root });
    expect(getSearchJob(job.id, { rootDir: root })?.status).toBe("interrupted");
    expect(indexStatus(root, job.id)).toBe("interrupted");
    const inspection = inspectInterruptedRecovery(job.id, { rootDir: root });
    expect(inspection.eligible).toBe(false);
    expect(getSearchJob(job.id, { rootDir: root })?.status).toBe(
      indexStatus(root, job.id),
    );
  });

  it("running -> failed stays aligned", () => {
    const root = makeTempRoot();
    const job = createSearchJob(sampleConfig(), { rootDir: root });
    markSearchJobRunning(job.id, { rootDir: root });
    markSearchJobFailed(job.id, "평가 실패", { rootDir: root });
    expect(getSearchJob(job.id, { rootDir: root })?.status).toBe("failed");
    expect(indexStatus(root, job.id)).toBe("failed");
  });

  it("cooperative pause evidence recovers paused, not a fabricated default", () => {
    const root = makeTempRoot();
    const job = createSearchJob(sampleConfig(), { rootDir: root });
    writeIdlePlan(job.id, root);
    const plan = getSearchPlan(job.id, { rootDir: root })!;
    saveSearchPlan(job.id, markPlanPaused(plan), { rootDir: root });
    fs.unlinkSync(path.join(root, "jobs", `${job.id}.json`));
    const recovery = recoverMissingJobRecord(job.id, { rootDir: root });
    expect(recovery.recovered).toBe(true);
    expect(recovery.recoveredStatus).toBe("paused");
    expect(recovery.reason).toBe(MISSING_JOB_RECOVERY_REASON.COOPERATIVE_PAUSE);
  });
});
