/**
 * P2-E2B historical index reconciliation dry-run.
 * Isolated fixtures + raw production reads only. Never writes production Research.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  APPROVED_P2_E2B_RECONCILE_IDS,
  assessJobCatalogAuthority,
  buildIndexReconciliationPlan,
  projectIndexInPlace,
  projectSearchJobIndexEntry,
} from "../src/lib/rextora/strategySearch/indexReconciliationPlan";
import {
  loadRawIndexReconciliationSnapshot,
  productionStrategySearchRootCanonical,
  runIndexReconciliationDryRun,
  sha256File,
} from "../src/lib/rextora/strategySearch/indexReconciliationDryRun";
import type {
  StrategySearchJob,
  StrategySearchJobIndex,
  StrategySearchJobIndexEntry,
  StrategySearchJobStatus,
} from "../src/lib/rextora/strategySearch/types";
import { HISTORICAL_MISSING_JOB_IDS } from "./helpers/productionResearchBaseline";

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

function tempDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "rextora-e2b-"));
  tempDirs.push(dir);
  return dir;
}

function makeJob(input: {
  id: string;
  status: StrategySearchJobStatus;
  updatedAt?: string;
  finishedAt?: string | null;
  createdAt?: string;
  completedIterations?: number;
}): StrategySearchJob {
  const createdAt = input.createdAt ?? "2026-08-10T00:00:00.000Z";
  const updatedAt = input.updatedAt ?? "2026-08-11T00:00:00.000Z";
  return {
    id: input.id,
    status: input.status,
    config: {
      searchVersion: "1",
      strategyTemplateId: "template_search_base",
      symbols: ["BTCUSDT"],
      timeframe: "15m",
      dataVersion: "binance-v1",
      seed: 1,
      generatorType: "random",
      maxIterations: 10,
      parameterRanges: [],
      evaluationWindows: [],
      passCriteria: { minTradeCount: 1, requireAllWindowsPass: true },
      costStress: { enabled: false, multipliers: [] },
      jitter: { enabled: false, samples: 0, relativeAmplitude: 0 },
    },
    checkpoint: {
      completedIterations: input.completedIterations ?? 3,
      nextIteration: (input.completedIterations ?? 3) + 1,
      randomState: null,
      bestCandidate: null,
      bestPassedCandidate: null,
      updatedAt,
    },
    createdAt,
    updatedAt,
    startedAt: createdAt,
    finishedAt: input.finishedAt === undefined ? null : input.finishedAt,
    failureMessage: null,
  };
}

function makeIndexRow(
  job: StrategySearchJob,
  patch?: Partial<StrategySearchJobIndexEntry>,
): StrategySearchJobIndexEntry {
  return {
    ...projectSearchJobIndexEntry(job),
    ...patch,
  };
}

function makeIndex(
  jobs: StrategySearchJob[],
  stale: ReadonlyMap<string, Partial<StrategySearchJobIndexEntry>>,
): StrategySearchJobIndex {
  return {
    version: 1,
    updatedAt: "2026-08-11T02:23:48.000Z",
    jobs: jobs.map((job) => makeIndexRow(job, stale.get(job.id))),
  };
}

function alignedAuthority(job: StrategySearchJob): ReturnType<typeof assessJobCatalogAuthority> {
  return assessJobCatalogAuthority({
    jobId: job.id,
    job,
    parseError: null,
    jobFileNameId: job.id,
    indexId: job.id,
    ownedOnDisk: false,
    executionActive: false,
    registryActive: false,
    plan: {
      completionReason:
        job.status === "queued" ? "DEADLINE_REACHED" : null,
      pausedAtMs: null,
      interruptedAtMs: null,
      campaignStartedAtMs: Date.parse(job.createdAt),
    },
    planParseError: null,
  });
}

function hashesFor(jobs: StrategySearchJob[]): Record<string, string> {
  return Object.fromEntries(jobs.map((job) => [job.id, `jobhash_${job.id}`]));
}

function plansFor(jobs: StrategySearchJob[]): Record<string, string | null> {
  return Object.fromEntries(jobs.map((job) => [job.id, `planhash_${job.id}`]));
}

function authoritiesFor(jobs: StrategySearchJob[]) {
  return new Map(jobs.map((job) => [job.id, alignedAuthority(job)]));
}

function productionLikeFixture() {
  const extras = Array.from({ length: 4 }, (_, i) =>
    makeJob({
      id: `search_aligned0000-0000-4000-8000-00000000000${i}`,
      status: i === 0 ? "completed" : "paused",
      finishedAt: i === 0 ? "2026-08-10T18:00:00.000Z" : null,
    }),
  );
  const targets = APPROVED_P2_E2B_RECONCILE_IDS.map((id) => {
    const completed = id === "search_1697e585-9324-4a2b-8dde-95bcbc08a674";
    return makeJob({
      id,
      status: completed ? "completed" : "queued",
      updatedAt: completed
        ? "2026-08-10T18:32:59.187Z"
        : "2026-08-11T00:41:53.000Z",
      finishedAt: completed ? "2026-08-10T18:32:59.187Z" : null,
    });
  });
  const jobs = [...targets, ...extras];
  const stale = new Map(
    targets.map((job) => [
      job.id,
      {
        status: "paused" as const,
        updatedAt: "2026-08-11T02:23:48.000Z",
        finishedAt: null,
      },
    ]),
  );
  const index = makeIndex(jobs, stale);
  const jobsById = new Map(jobs.map((job) => [job.id, job]));
  return {
    jobs,
    targets,
    extras,
    index,
    jobsById,
    jobFileHashes: hashesFor(jobs),
    planFileHashes: plansFor(jobs),
    authorities: authoritiesFor(jobs),
  };
}

describe("P2-E2B index reconciliation dry-run", () => {
  it("1. exact approved mismatch set succeeds", () => {
    const fx = productionLikeFixture();
    const plan = buildIndexReconciliationPlan({
      allowlist: APPROVED_P2_E2B_RECONCILE_IDS,
      index: fx.index,
      jobsById: fx.jobsById,
      authorities: fx.authorities,
      jobFileHashes: fx.jobFileHashes,
      planFileHashes: fx.planFileHashes,
      currentIndexHash: "index-hash",
      expectedJobFileHashes: fx.jobFileHashes,
    });
    expect(plan.ok).toBe(true);
    expect(plan.actualDesyncCount).toBe(14);
    expect(plan.unapprovedDesyncCount).toBe(0);
    expect(plan.safeCount).toBe(14);
    expect(plan.unsafeCount).toBe(0);
    expect(plan.changedRowCount).toBe(14);
  });

  it("2. unapproved 15th mismatch fails", () => {
    const fx = productionLikeFixture();
    const extra = fx.extras[1]!;
    extra.status = "queued";
    fx.jobsById.set(extra.id, extra);
    fx.index.jobs = fx.index.jobs.map((row) =>
      row.id === extra.id ? { ...row, status: "paused" } : row,
    );
    const plan = buildIndexReconciliationPlan({
      allowlist: APPROVED_P2_E2B_RECONCILE_IDS,
      index: fx.index,
      jobsById: fx.jobsById,
      authorities: fx.authorities,
      jobFileHashes: fx.jobFileHashes,
      planFileHashes: fx.planFileHashes,
      currentIndexHash: "index-hash",
    });
    expect(plan.ok).toBe(false);
    expect(plan.preconditionCode).toBe("UNAPPROVED_DESYNC");
    expect(plan.unapprovedDesyncCount).toBe(1);
  });

  it("3. missing approved mismatch fails", () => {
    const fx = productionLikeFixture();
    const alignedId = APPROVED_P2_E2B_RECONCILE_IDS[0]!;
    const job = fx.jobsById.get(alignedId)!;
    fx.index.jobs = fx.index.jobs.map((row) =>
      row.id === alignedId ? projectSearchJobIndexEntry(job) : row,
    );
    const plan = buildIndexReconciliationPlan({
      allowlist: APPROVED_P2_E2B_RECONCILE_IDS,
      index: fx.index,
      jobsById: fx.jobsById,
      authorities: fx.authorities,
      jobFileHashes: fx.jobFileHashes,
      planFileHashes: fx.planFileHashes,
      currentIndexHash: "index-hash",
    });
    expect(plan.ok).toBe(false);
    expect(plan.preconditionCode).toBe("MISSING_APPROVED_DESYNC");
  });

  it("4. job hash changed after manifest fails", () => {
    const fx = productionLikeFixture();
    const drifted = APPROVED_P2_E2B_RECONCILE_IDS[0]!;
    const plan = buildIndexReconciliationPlan({
      allowlist: APPROVED_P2_E2B_RECONCILE_IDS,
      index: fx.index,
      jobsById: fx.jobsById,
      authorities: fx.authorities,
      jobFileHashes: fx.jobFileHashes,
      planFileHashes: fx.planFileHashes,
      expectedJobFileHashes: {
        ...fx.jobFileHashes,
        [drifted]: "stale-manifest-hash",
      },
      currentIndexHash: "index-hash",
    });
    expect(plan.ok).toBe(false);
    expect(plan.preconditionCode).toBe("JOB_HASH_CHANGED");
  });

  it("5. canonical projection updates queued row", () => {
    const job = makeJob({
      id: "search_0c286c6a-5d8c-4e2b-bdff-046dd71281a4",
      status: "queued",
      updatedAt: "2026-08-11T00:41:52.518Z",
    });
    const stale = makeIndexRow(job, {
      status: "paused",
      updatedAt: "2026-08-11T02:23:48.514Z",
    });
    const projected = projectSearchJobIndexEntry(job);
    expect(projected.status).toBe("queued");
    expect(projected.updatedAt).toBe(job.updatedAt);
    expect(projected.finishedAt).toBeNull();
    expect(projected.status).not.toBe(stale.status);
    expect(projected.updatedAt).not.toBe(stale.updatedAt);
  });

  it("6. canonical projection updates completed row including finishedAt", () => {
    const job = makeJob({
      id: "search_1697e585-9324-4a2b-8dde-95bcbc08a674",
      status: "completed",
      updatedAt: "2026-08-10T18:32:59.187Z",
      finishedAt: "2026-08-10T18:32:59.187Z",
    });
    const stale = makeIndexRow(job, {
      status: "paused",
      updatedAt: "2026-08-11T02:23:48.459Z",
      finishedAt: null,
    });
    const projected = projectSearchJobIndexEntry(job);
    expect(projected.status).toBe("completed");
    expect(projected.finishedAt).toBe("2026-08-10T18:32:59.187Z");
    expect(projected.updatedAt).toBe(job.updatedAt);
    expect(stale.finishedAt).toBeNull();
    expect(stale.status).toBe("paused");
  });

  it("7. ID set unchanged", () => {
    const fx = productionLikeFixture();
    const proposed = projectIndexInPlace(
      fx.index,
      fx.jobsById,
      APPROVED_P2_E2B_RECONCILE_IDS,
    );
    expect(proposed.jobs.map((row) => row.id).sort()).toEqual(
      fx.index.jobs.map((row) => row.id).sort(),
    );
  });

  it("8. row count unchanged", () => {
    const fx = productionLikeFixture();
    const proposed = projectIndexInPlace(
      fx.index,
      fx.jobsById,
      APPROVED_P2_E2B_RECONCILE_IDS,
    );
    expect(proposed.jobs.length).toBe(fx.index.jobs.length);
  });

  it("9. only approved rows changed", () => {
    const fx = productionLikeFixture();
    const plan = buildIndexReconciliationPlan({
      allowlist: APPROVED_P2_E2B_RECONCILE_IDS,
      index: fx.index,
      jobsById: fx.jobsById,
      authorities: fx.authorities,
      jobFileHashes: fx.jobFileHashes,
      planFileHashes: fx.planFileHashes,
      currentIndexHash: "index-hash",
    });
    const approved = new Set<string>(APPROVED_P2_E2B_RECONCILE_IDS);
    for (let i = 0; i < fx.index.jobs.length; i += 1) {
      const before = fx.index.jobs[i]!;
      const after = plan.proposedIndex.jobs[i]!;
      if (approved.has(before.id)) {
        expect(after).toEqual(projectSearchJobIndexEntry(fx.jobsById.get(before.id)!));
      } else {
        expect(after).toEqual(before);
      }
    }
    expect(plan.unapprovedChangedRowCount).toBe(0);
  });

  it("10. post-proposal status desync = 0", () => {
    const fx = productionLikeFixture();
    const plan = buildIndexReconciliationPlan({
      allowlist: APPROVED_P2_E2B_RECONCILE_IDS,
      index: fx.index,
      jobsById: fx.jobsById,
      authorities: fx.authorities,
      jobFileHashes: fx.jobFileHashes,
      planFileHashes: fx.planFileHashes,
      currentIndexHash: "index-hash",
    });
    expect(plan.postProposalStatusDesyncCount).toBe(0);
    expect(plan.postProposalProjectionMismatchCount).toBe(0);
  });

  it("11. queued+DEADLINE_REACHED remains untouched outside index projection", () => {
    const fx = productionLikeFixture();
    const queued = fx.targets.filter((job) => job.status === "queued");
    expect(queued).toHaveLength(13);
    for (const job of queued) {
      const authority = fx.authorities.get(job.id)!;
      expect(authority.safeToReconcile).toBe(true);
      expect(authority.lifecycleDebt).toContain("queued_plus_deadline_reached");
      expect(job.status).toBe("queued");
      expect(job.finishedAt).toBeNull();
    }
    const plan = buildIndexReconciliationPlan({
      allowlist: APPROVED_P2_E2B_RECONCILE_IDS,
      index: fx.index,
      jobsById: fx.jobsById,
      authorities: fx.authorities,
      jobFileHashes: fx.jobFileHashes,
      planFileHashes: fx.planFileHashes,
      currentIndexHash: "index-hash",
    });
    for (const target of plan.targets.filter((row) => row.currentJobProjection.status === "queued")) {
      expect(target.currentJobProjection.status).toBe("queued");
      expect(target.lifecycleDebt).toContain("queued_plus_deadline_reached");
      expect(target.planFileHash).toBe(`planhash_${target.jobId}`);
    }
  });

  it("12. no disk-only job enters index", () => {
    const fx = productionLikeFixture();
    const diskOnly = "search_diskonly00-0000-4000-8000-000000000001";
    const plan = buildIndexReconciliationPlan({
      allowlist: APPROVED_P2_E2B_RECONCILE_IDS,
      index: fx.index,
      jobsById: fx.jobsById,
      authorities: fx.authorities,
      jobFileHashes: fx.jobFileHashes,
      planFileHashes: fx.planFileHashes,
      currentIndexHash: "index-hash",
      diskJobIds: [...fx.jobs.map((job) => job.id), diskOnly],
    });
    expect(plan.proposedIndex.jobs.some((row) => row.id === diskOnly)).toBe(false);
    expect(plan.diskOnlyJobsAdded).toBe(false);
    expect(plan.ok).toBe(true);
  });

  it("13. no production write occurs in dry-run", () => {
    const productionRoot = productionStrategySearchRootCanonical();
    const beforeIndex = sha256File(path.join(productionRoot, "index.json"));
    const beforeJobs = APPROVED_P2_E2B_RECONCILE_IDS.map((id) =>
      sha256File(path.join(productionRoot, "jobs", `${id}.json`)),
    );
    const beforePlans = APPROVED_P2_E2B_RECONCILE_IDS.map((id) =>
      sha256File(path.join(productionRoot, "jobs", `${id}.plan.json`)),
    );
    const outputDir = tempDir();
    const result = runIndexReconciliationDryRun({
      rootDir: productionRoot,
      outputDir,
      allowlist: APPROVED_P2_E2B_RECONCILE_IDS,
    });
    // Current verified production: 7 historical index rows lack job.json.
    expect(result.plan.actualDesyncCount).toBe(HISTORICAL_MISSING_JOB_IDS.length);
    expect(result.plan.preconditionCode).toBe("UNAPPROVED_DESYNC");
    expect(fs.existsSync(path.join(outputDir, "manifest.json"))).toBe(true);
    expect(fs.existsSync(path.join(outputDir, "proposed-index.json"))).toBe(true);
    expect(sha256File(path.join(productionRoot, "index.json"))).toBe(beforeIndex);
    expect(
      APPROVED_P2_E2B_RECONCILE_IDS.map((id) =>
        sha256File(path.join(productionRoot, "jobs", `${id}.json`)),
      ),
    ).toEqual(beforeJobs);
    expect(
      APPROVED_P2_E2B_RECONCILE_IDS.map((id) =>
        sha256File(path.join(productionRoot, "jobs", `${id}.plan.json`)),
      ),
    ).toEqual(beforePlans);
    const snapshot = loadRawIndexReconciliationSnapshot(productionRoot);
    expect(snapshot.indexHash).toBe(beforeIndex);
  });
});
