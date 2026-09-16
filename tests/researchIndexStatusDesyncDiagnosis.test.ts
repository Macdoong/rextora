/**
 * P2-E1 diagnosis only. Isolated temp stores for writer/atomicity cases.
 * Production store is raw-read only (never getSearchJob/recoverReadJson).
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createSearchJob,
  getSearchJob,
  listSearchJobs,
  markSearchJobCompleted,
  markSearchJobPaused,
  markSearchJobRunning,
  requestPauseSearchJob,
  resumeSearchJob,
  type StrategySearchConfig,
} from "../src/lib/rextora/strategySearch/jobStore";
import { listStrategySearchJobsApi } from "../src/lib/rextora/strategySearch/jobApiService";
import { recoverMissingJobRecord } from "../src/lib/rextora/strategySearch/jobRecordRecovery";

const tempRoots: string[] = [];

function makeTempRoot(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "rextora-index-desync-"));
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
  jobs: Array<{ id: string; status: string; updatedAt?: string }>;
} {
  return JSON.parse(fs.readFileSync(path.join(root, "index.json"), "utf8")) as {
    jobs: Array<{ id: string; status: string; updatedAt?: string }>;
  };
}

function indexStatus(root: string, jobId: string): string | undefined {
  return readIndex(root).jobs.find((row) => row.id === jobId)?.status;
}

/** Frozen P2-E1 production mismatch class. Not a repair list. */
const PRODUCTION_STATUS_DESYNC_MANIFEST = [
  {
    id: "search_0c286c6a-5d8c-4e2b-bdff-046dd71281a4",
    index: "paused",
    job: "queued",
  },
  {
    id: "search_1683a734-341d-4da8-99c7-476ad80c078d",
    index: "paused",
    job: "queued",
  },
  {
    id: "search_1697e585-9324-4a2b-8dde-95bcbc08a674",
    index: "paused",
    job: "completed",
  },
  {
    id: "search_32bc4514-085c-4351-95d0-aa553f3c2884",
    index: "paused",
    job: "queued",
  },
  {
    id: "search_5bedd873-2e89-4604-ab27-07a9dff27e74",
    index: "paused",
    job: "queued",
  },
  {
    id: "search_6b0b920d-e45b-4101-8f2d-2013380d86a5",
    index: "paused",
    job: "queued",
  },
  {
    id: "search_6b527e08-d01d-49b8-b398-1ad27482182f",
    index: "paused",
    job: "queued",
  },
  {
    id: "search_747c28e9-c250-47ca-acfb-06eba1ed9c69",
    index: "paused",
    job: "queued",
  },
  {
    id: "search_78e8dd3f-5fea-4955-8535-7578338a18e1",
    index: "paused",
    job: "queued",
  },
  {
    id: "search_bd7a9043-1ed1-42a7-8bdc-c70ff22d249d",
    index: "paused",
    job: "queued",
  },
  {
    id: "search_d15a7b41-867a-40da-a065-28256ffaf88e",
    index: "paused",
    job: "queued",
  },
  {
    id: "search_e47a902f-5ee3-484f-88ca-73313de44cc6",
    index: "paused",
    job: "queued",
  },
  {
    id: "search_e4fe7b86-5140-40a9-b098-f6fe1eaa3027",
    index: "paused",
    job: "queued",
  },
  {
    id: "search_edb3d3fc-5671-4b33-bc1a-b0cc036f98c8",
    index: "paused",
    job: "queued",
  },
] as const;

describe("Research index/job status desync (P2-E1 diagnosis)", () => {
  it("1. current canonical save keeps job/index status aligned", () => {
    const root = makeTempRoot();
    const job = createSearchJob(sampleConfig(), { rootDir: root });
    expect(job.status).toBe("queued");
    expect(indexStatus(root, job.id)).toBe("queued");
    markSearchJobRunning(job.id, { rootDir: root });
    expect(getSearchJob(job.id, { rootDir: root })?.status).toBe("running");
    expect(indexStatus(root, job.id)).toBe("running");
  });

  it("2. paused -> queued transition alignment", () => {
    const root = makeTempRoot();
    const job = createSearchJob(sampleConfig(), { rootDir: root });
    markSearchJobRunning(job.id, { rootDir: root });
    requestPauseSearchJob(job.id, { rootDir: root });
    markSearchJobPaused(job.id, { rootDir: root });
    const resumed = resumeSearchJob(job.id, { rootDir: root });
    expect(resumed.status).toBe("queued");
    expect(getSearchJob(job.id, { rootDir: root })?.status).toBe("queued");
    expect(indexStatus(root, job.id)).toBe("queued");
  });

  it("3. completion transition alignment", () => {
    const root = makeTempRoot();
    const job = createSearchJob(sampleConfig(), { rootDir: root });
    markSearchJobRunning(job.id, { rootDir: root });
    const completed = markSearchJobCompleted(job.id, { rootDir: root });
    expect(completed.status).toBe("completed");
    expect(getSearchJob(job.id, { rootDir: root })?.status).toBe("completed");
    expect(indexStatus(root, job.id)).toBe("completed");
  });

  it("4. forced partial-write behavior", () => {
    const root = makeTempRoot();
    const job = createSearchJob(sampleConfig(), { rootDir: root });
    markSearchJobRunning(job.id, { rootDir: root });
    requestPauseSearchJob(job.id, { rootDir: root });
    markSearchJobPaused(job.id, { rootDir: root });
    const rename = fs.renameSync.bind(fs);
    vi.spyOn(fs, "renameSync").mockImplementation(((
      from: fs.PathLike,
      to: fs.PathLike,
    ) => {
      const src = String(from);
      const dest = String(to);
      if (src.includes(`${path.sep}index.json`) || dest.includes(`${path.sep}index.json`)) {
        throw new Error("forced index write failure");
      }
      return rename(from, to);
    }) as typeof fs.renameSync);

    expect(() => resumeSearchJob(job.id, { rootDir: root })).toThrow(
      /forced index write failure|filesystem write failed/,
    );
    vi.restoreAllMocks();

    expect(getSearchJob(job.id, { rootDir: root })?.status).toBe("paused");
    expect(indexStatus(root, job.id)).toBe("paused");
  });

  it("5. list API uses file-backed status", () => {
    const root = makeTempRoot();
    const job = createSearchJob(sampleConfig(), { rootDir: root });
    markSearchJobRunning(job.id, { rootDir: root });
    requestPauseSearchJob(job.id, { rootDir: root });
    markSearchJobPaused(job.id, { rootDir: root });
    resumeSearchJob(job.id, { rootDir: root });

    const index = readIndex(root);
    const row = index.jobs.find((j) => j.id === job.id);
    expect(row).toBeTruthy();
    row!.status = "paused";
    fs.writeFileSync(
      path.join(root, "index.json"),
      JSON.stringify({ ...index, jobs: index.jobs }, null, 2),
      "utf8",
    );

    const listed = listStrategySearchJobsApi({ rootDir: root, limit: 20 });
    expect(listed.find((j) => j.id === job.id)?.status).toBe("queued");
    expect(indexStatus(root, job.id)).toBe("paused");
  });

  it("6. index-only stale status does not silently change job file", () => {
    const root = makeTempRoot();
    const job = createSearchJob(sampleConfig(), { rootDir: root });
    const before = fs.readFileSync(
      path.join(root, "jobs", `${job.id}.json`),
      "utf8",
    );
    const index = readIndex(root);
    const row = index.jobs.find((j) => j.id === job.id)!;
    row.status = "paused";
    fs.writeFileSync(
      path.join(root, "index.json"),
      JSON.stringify({ ...index, jobs: index.jobs }, null, 2),
      "utf8",
    );
    expect(getSearchJob(job.id, { rootDir: root })?.status).toBe("queued");
    expect(fs.readFileSync(path.join(root, "jobs", `${job.id}.json`), "utf8")).toBe(
      before,
    );
  });

  it("7. enumerate production mismatch read-only via fixture/manifest", () => {
    // Historical E2B mismatch set is frozen above. After P2-E2C apply,
    // live production index rows mirror job.json for those 14 IDs.
    expect(PRODUCTION_STATUS_DESYNC_MANIFEST).toHaveLength(14);
    expect(
      PRODUCTION_STATUS_DESYNC_MANIFEST.filter((r) => r.job === "queued"),
    ).toHaveLength(13);
    expect(
      PRODUCTION_STATUS_DESYNC_MANIFEST.filter((r) => r.job === "completed"),
    ).toHaveLength(1);

    const prodRoot = path.join(
      process.cwd(),
      "data/rextora/strategy-search",
    );
    const indexPath = path.join(prodRoot, "index.json");
    if (!fs.existsSync(indexPath)) return;

    const index = JSON.parse(fs.readFileSync(indexPath, "utf8")) as {
      jobs: Array<{ id: string; status: string }>;
    };
    const mismatches = [];
    for (const expected of PRODUCTION_STATUS_DESYNC_MANIFEST) {
      const row = index.jobs.find((j) => j.id === expected.id);
      const jobPath = path.join(prodRoot, "jobs", `${expected.id}.json`);
      if (!fs.existsSync(jobPath)) {
        mismatches.push({
          id: expected.id,
          index: row?.status,
          job: "missing_historical",
        });
        continue;
      }
      const job = JSON.parse(fs.readFileSync(jobPath, "utf8")) as {
        status: string;
      };
      mismatches.push({
        id: expected.id,
        index: row?.status,
        job: job.status,
      });
    }
    for (const row of mismatches) {
          if (row.job === "missing_historical") {
            expect(["completed", "cancelled"]).toContain(row.index);
            continue;
          }
      expect(row).toEqual({
        id: row.id,
        index: "completed",
        job: "completed",
      });
    }
  });

  it("8. no automatic repair occurs during normal reads", () => {
    const root = makeTempRoot();
    const job = createSearchJob(sampleConfig(), { rootDir: root });
    markSearchJobRunning(job.id, { rootDir: root });
    requestPauseSearchJob(job.id, { rootDir: root });
    markSearchJobPaused(job.id, { rootDir: root });
    resumeSearchJob(job.id, { rootDir: root });
    const index = readIndex(root);
    index.jobs.find((j) => j.id === job.id)!.status = "paused";
    const stale = JSON.stringify({ ...index, jobs: index.jobs }, null, 2);
    fs.writeFileSync(path.join(root, "index.json"), stale, "utf8");

    listSearchJobs({ rootDir: root });
    getSearchJob(job.id, { rootDir: root });
    listStrategySearchJobsApi({ rootDir: root, limit: 20 });

    expect(fs.readFileSync(path.join(root, "index.json"), "utf8")).toBe(stale);
    expect(indexStatus(root, job.id)).toBe("paused");
  });

  it("index-only missing job no longer fabricates paused (E2A fail-closed)", () => {
    const root = makeTempRoot();
    const job = createSearchJob(sampleConfig(), { rootDir: root });
    fs.unlinkSync(path.join(root, "jobs", `${job.id}.json`));
    const recovery = recoverMissingJobRecord(job.id, { rootDir: root });
    expect(recovery.recovered).toBe(false);
    expect(recovery.recoveredStatus).toBeNull();
    expect(recovery.reason).toBe("insufficient_lifecycle_evidence");
    expect(indexStatus(root, job.id)).toBe("queued");
    expect(getSearchJob(job.id, { rootDir: root })).toBeNull();
  });
});
