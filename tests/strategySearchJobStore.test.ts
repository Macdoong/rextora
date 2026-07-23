import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  createSearchJob,
  createStrategySearchCandidateId,
  createStrategySearchJobId,
  getSearchJob,
  getSearchTrial,
  listSearchJobs,
  listSearchTrials,
  markSearchJobCancelled,
  markSearchJobCompleted,
  markSearchJobFailed,
  markSearchJobPaused,
  markSearchJobRunning,
  requestCancelSearchJob,
  requestPauseSearchJob,
  resumeSearchJob,
  saveSearchTrial,
  updateSearchCheckpoint,
  type StrategySearchConfig,
  type StrategySearchTrial,
} from "../src/lib/rextora/strategySearch";
import { StrategySearchPersistenceError } from "../src/lib/rextora/strategySearch/jobStore";

const tempRoots: string[] = [];

function makeTempRoot(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "rextora-search-"));
  tempRoots.push(root);
  return root;
}

afterEach(() => {
  for (const root of tempRoots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

function sampleConfig(
  overrides: Partial<StrategySearchConfig> = {},
): StrategySearchConfig {
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
    passCriteria: {
      minTradeCount: 1,
      requireAllWindowsPass: true,
    },
    costStress: { enabled: true, multipliers: [1, 1.5] },
    jitter: { enabled: false, samples: 0, relativeAmplitude: 0 },
    ...overrides,
  };
}

function sampleTrial(
  jobId: string,
  iteration: number,
  patch: Partial<StrategySearchTrial> = {},
): StrategySearchTrial {
  return {
    jobId,
    iteration,
    candidateId: createStrategySearchCandidateId(jobId, iteration),
    params: { ema_fast: 20 },
    paramsHash: "abc123def456",
    generatorType: "random",
    parentCandidateIds: [],
    score: 1.25,
    passed: true,
    failureReasons: [],
    windowResults: [{ windowId: "w1", totalReturn: 0.1 }],
    costStressResults: [],
    jitterResults: [],
    durationMs: 12,
    createdAt: new Date().toISOString(),
    ...patch,
  };
}

describe("strategySearch jobStore", () => {
  it("creates a job with search_<uuid> id and persists/reloads", () => {
    const root = makeTempRoot();
    const job = createSearchJob(sampleConfig(), { rootDir: root });
    expect(job.id).toMatch(
      /^search_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );
    expect(job.status).toBe("queued");
    expect(job.failureMessage).toBeNull();
    expect(job.checkpoint.completedIterations).toBe(0);

    const file = path.join(root, "jobs", `${job.id}.json`);
    expect(fs.existsSync(file)).toBe(true);
    expect(fs.existsSync(path.join(root, "index.json"))).toBe(true);

    const loaded = getSearchJob(job.id, { rootDir: root });
    expect(loaded).not.toBeNull();
    expect(loaded?.id).toBe(job.id);
    expect(loaded?.config.strategyTemplateId).toBe("template_search_base");
  });

  it("generates candidate ids with 8-digit iteration padding", () => {
    const jobId = createStrategySearchJobId();
    expect(createStrategySearchCandidateId(jobId, 0)).toBe(
      `${jobId}_candidate_00000000`,
    );
    expect(createStrategySearchCandidateId(jobId, 12)).toBe(
      `${jobId}_candidate_00000012`,
    );
    expect(() => createStrategySearchCandidateId("", 0)).toThrow();
    expect(() => createStrategySearchCandidateId(jobId, 1.5)).toThrow();
    expect(() => createStrategySearchCandidateId(jobId, -1)).toThrow();
  });

  it("lists jobs from the temporary root only", () => {
    const root = makeTempRoot();
    const a = createSearchJob(sampleConfig({ seed: 1 }), { rootDir: root });
    const b = createSearchJob(sampleConfig({ seed: 2 }), { rootDir: root });
    const listed = listSearchJobs({ rootDir: root });
    expect(listed.map((j) => j.id).sort()).toEqual([a.id, b.id].sort());
  });

  it("allows valid status transitions including pause/resume and cancel", () => {
    const root = makeTempRoot();
    const job = createSearchJob(sampleConfig(), { rootDir: root });
    const opts = { rootDir: root };

    markSearchJobRunning(job.id, opts);
    requestPauseSearchJob(job.id, opts);
    markSearchJobPaused(job.id, opts);
    const resumed = resumeSearchJob(job.id, opts);
    expect(resumed.status).toBe("queued");

    markSearchJobRunning(job.id, opts);
    requestCancelSearchJob(job.id, opts);
    const cancelled = markSearchJobCancelled(job.id, opts);
    expect(cancelled.status).toBe("cancelled");
    expect(cancelled.finishedAt).toBeTruthy();
  });

  it("rejects invalid status transitions", () => {
    const root = makeTempRoot();
    const job = createSearchJob(sampleConfig(), { rootDir: root });
    const opts = { rootDir: root };
    expect(() => requestPauseSearchJob(job.id, opts)).toThrow(/transition/);
    expect(() => markSearchJobCompleted(job.id, opts)).toThrow(/transition/);
  });

  it("updates checkpoints and preserves createdAt", () => {
    const root = makeTempRoot();
    const job = createSearchJob(sampleConfig(), { rootDir: root });
    const createdAt = job.createdAt;
    const updated = updateSearchCheckpoint(
      job.id,
      {
        completedIterations: 3,
        nextIteration: 3,
        randomState: "rng-token",
        bestCandidate: {
          candidateId: createStrategySearchCandidateId(job.id, 2),
          iteration: 2,
          paramsHash: "hashhashhash",
          score: 9,
          passed: false,
        },
        bestPassedCandidate: null,
        updatedAt: new Date().toISOString(),
      },
      { rootDir: root },
    );
    expect(updated.createdAt).toBe(createdAt);
    expect(updated.checkpoint.completedIterations).toBe(3);
    expect(updated.checkpoint.randomState).toBe("rng-token");
  });

  it("persists trials, supports identical idempotency, rejects conflicts", () => {
    const root = makeTempRoot();
    const job = createSearchJob(sampleConfig(), { rootDir: root });
    const opts = { rootDir: root };
    const trial = sampleTrial(job.id, 0);
    const saved = saveSearchTrial(trial, opts);
    expect(saved.candidateId).toContain("_candidate_00000000");
    expect(getSearchTrial(job.id, 0, opts)?.paramsHash).toBe("abc123def456");
    expect(listSearchTrials(job.id, opts)).toHaveLength(1);

    const again = saveSearchTrial({ ...trial }, opts);
    expect(again.paramsHash).toBe(trial.paramsHash);

    expect(() =>
      saveSearchTrial({ ...trial, score: 99 }, opts),
    ).toThrow(/different contents/);
  });

  it("persists failed jobs with failure message", () => {
    const root = makeTempRoot();
    const job = createSearchJob(sampleConfig(), { rootDir: root });
    const opts = { rootDir: root };
    markSearchJobRunning(job.id, opts);
    const failed = markSearchJobFailed(job.id, "boom", opts);
    expect(failed.status).toBe("failed");
    expect(failed.failureMessage).toBe("boom");
    expect(getSearchJob(job.id, opts)?.failureMessage).toBe("boom");
  });

  it("completes a job and refuses resume from terminal states", () => {
    const root = makeTempRoot();
    const job = createSearchJob(sampleConfig(), { rootDir: root });
    const opts = { rootDir: root };
    markSearchJobRunning(job.id, opts);
    markSearchJobCompleted(job.id, opts);
    expect(() => resumeSearchJob(job.id, opts)).toThrow(/cannot resume/);
  });

  it("rejects path-traversal and invalid job ids", () => {
    const root = makeTempRoot();
    expect(() => getSearchJob("../etc/passwd", { rootDir: root })).toThrow(
      /invalid strategy-search job id/,
    );
    expect(() => getSearchJob("search_.._evil", { rootDir: root })).toThrow();
    expect(() =>
      getSearchJob("SAFE_v44_i4060", { rootDir: root }),
    ).toThrow();
    expect(() =>
      getSearchJob("search_SAFE_v44_i4060", { rootDir: root }),
    ).toThrow();
  });

  it("isolates storage to the provided temporary root", () => {
    const rootA = makeTempRoot();
    const rootB = makeTempRoot();
    const job = createSearchJob(sampleConfig(), { rootDir: rootA });
    expect(getSearchJob(job.id, { rootDir: rootA })).not.toBeNull();
    expect(getSearchJob(job.id, { rootDir: rootB })).toBeNull();
    expect(fs.existsSync(path.join(rootA, "jobs", `${job.id}.json`))).toBe(
      true,
    );
    expect(fs.existsSync(path.join(rootB, "jobs", `${job.id}.json`))).toBe(
      false,
    );
  });

  it("supports queued → cancel_requested → cancelled", () => {
    const root = makeTempRoot();
    const job = createSearchJob(sampleConfig(), { rootDir: root });
    const opts = { rootDir: root };
    requestCancelSearchJob(job.id, opts);
    const cancelled = markSearchJobCancelled(job.id, opts);
    expect(cancelled.status).toBe("cancelled");
  });

  it("supports maxIterations null in config", () => {
    const root = makeTempRoot();
    const job = createSearchJob(sampleConfig({ maxIterations: null }), {
      rootDir: root,
    });
    expect(job.config.maxIterations).toBeNull();
  });
});

describe("strategySearch recoverable persistence", () => {
  it("keeps valid target authoritative and removes stale .tmp", () => {
    const root = makeTempRoot();
    const opts = { rootDir: root };
    const job = createSearchJob(sampleConfig(), opts);
    const target = path.join(root, "jobs", `${job.id}.json`);
    const tmp = `${target}.tmp`;
    fs.writeFileSync(tmp, '{"stale":true}', "utf8");

    const loaded = getSearchJob(job.id, opts);
    expect(loaded?.id).toBe(job.id);
    expect(loaded?.status).toBe("queued");
    expect(fs.existsSync(tmp)).toBe(false);
    expect(fs.existsSync(target)).toBe(true);
  });

  it("restores missing target from valid .bak", () => {
    const root = makeTempRoot();
    const opts = { rootDir: root };
    const job = createSearchJob(sampleConfig({ seed: 11 }), opts);
    const target = path.join(root, "jobs", `${job.id}.json`);
    const bak = `${target}.bak`;
    fs.renameSync(target, bak);

    const loaded = getSearchJob(job.id, opts);
    expect(loaded?.id).toBe(job.id);
    expect(loaded?.config.seed).toBe(11);
    expect(fs.existsSync(target)).toBe(true);
    expect(fs.existsSync(bak)).toBe(false);
  });

  it("restores invalid target from valid .bak", () => {
    const root = makeTempRoot();
    const opts = { rootDir: root };
    const job = createSearchJob(sampleConfig({ seed: 22 }), opts);
    const target = path.join(root, "jobs", `${job.id}.json`);
    const bak = `${target}.bak`;
    fs.copyFileSync(target, bak);
    fs.writeFileSync(target, "{not-json", "utf8");

    const loaded = getSearchJob(job.id, opts);
    expect(loaded?.config.seed).toBe(22);
    expect(JSON.parse(fs.readFileSync(target, "utf8")).config.seed).toBe(22);
  });

  it("promotes valid .tmp when target and .bak are missing", () => {
    const root = makeTempRoot();
    const opts = { rootDir: root };
    const job = createSearchJob(sampleConfig({ seed: 33 }), opts);
    const target = path.join(root, "jobs", `${job.id}.json`);
    const tmp = `${target}.tmp`;
    fs.renameSync(target, tmp);

    const loaded = getSearchJob(job.id, opts);
    expect(loaded?.config.seed).toBe(33);
    expect(fs.existsSync(target)).toBe(true);
    expect(fs.existsSync(tmp)).toBe(false);
  });

  it("throws corruption error when target/bak/tmp are all invalid", () => {
    const root = makeTempRoot();
    const opts = { rootDir: root };
    const job = createSearchJob(sampleConfig(), opts);
    const target = path.join(root, "jobs", `${job.id}.json`);
    fs.writeFileSync(target, "{bad", "utf8");
    fs.writeFileSync(`${target}.bak`, "{bad", "utf8");
    fs.writeFileSync(`${target}.tmp`, "{bad", "utf8");

    expect(() => getSearchJob(job.id, opts)).toThrow(
      StrategySearchPersistenceError,
    );
    try {
      getSearchJob(job.id, opts);
    } catch (error) {
      expect(error).toBeInstanceOf(StrategySearchPersistenceError);
      expect((error as StrategySearchPersistenceError).code).toBe("CORRUPTED");
      expect((error as StrategySearchPersistenceError).targetPath).toContain(
        job.id,
      );
    }
    // Must not silently replace with an empty job file
    expect(fs.readFileSync(target, "utf8")).toBe("{bad");
  });

  it("preserves trial conflict protection after .bak recovery", () => {
    const root = makeTempRoot();
    const opts = { rootDir: root };
    const job = createSearchJob(sampleConfig(), opts);
    const trial = sampleTrial(job.id, 0);
    saveSearchTrial(trial, opts);

    const target = path.join(root, "trials", job.id, "00000000.json");
    const bak = `${target}.bak`;
    fs.renameSync(target, bak);

    const recovered = getSearchTrial(job.id, 0, opts);
    expect(recovered?.paramsHash).toBe(trial.paramsHash);
    expect(() =>
      saveSearchTrial({ ...trial, score: 999 }, opts),
    ).toThrow(StrategySearchPersistenceError);
  });

  it("recovers index.json and preserves all job summaries", () => {
    const root = makeTempRoot();
    const opts = { rootDir: root };
    const a = createSearchJob(sampleConfig({ seed: 1 }), opts);
    const b = createSearchJob(sampleConfig({ seed: 2 }), opts);
    const indexPath = path.join(root, "index.json");
    const bak = `${indexPath}.bak`;
    fs.copyFileSync(indexPath, bak);
    fs.writeFileSync(indexPath, "{broken-index", "utf8");

    const listed = listSearchJobs(opts);
    expect(listed.map((j) => j.id).sort()).toEqual([a.id, b.id].sort());
    expect(fs.existsSync(indexPath)).toBe(true);
    const index = JSON.parse(fs.readFileSync(indexPath, "utf8")) as {
      jobs: Array<{ id: string }>;
    };
    expect(index.jobs.map((j) => j.id).sort()).toEqual([a.id, b.id].sort());
  });
});
