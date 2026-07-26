/**
 * Soft-archive Research Jobs when hard deletion is unsafe.
 * Archived jobs remain on disk under jobs/ with status metadata in a sidecar.
 */

import fs from "node:fs";
import path from "node:path";
import {
  getSearchJob,
  listSearchJobs,
  type StrategySearchStoreOptions,
} from "./jobStore";
import { writeDeletionAudit } from "./deletionSafety";

export interface JobArchiveRecord {
  jobId: string;
  archivedAt: string;
  reason: string;
  previousStatus: string;
  restoredAt?: string | null;
}

function defaultRoot(): string {
  return path.join(
    /* turbopackIgnore: true */ process.cwd(),
    "data",
    "rextora",
    "strategy-search",
  );
}

function resolveRoot(options?: StrategySearchStoreOptions): string {
  return path.resolve(options?.rootDir ?? defaultRoot());
}

function archivePath(root: string, jobId: string): string {
  return path.join(root, "jobs", `${jobId}.archive.json`);
}

export function isJobArchived(
  jobId: string,
  options?: StrategySearchStoreOptions,
): boolean {
  const fp = archivePath(resolveRoot(options), jobId);
  if (!fs.existsSync(fp)) return false;
  try {
    const rec = JSON.parse(fs.readFileSync(fp, "utf8")) as JobArchiveRecord;
    return !rec.restoredAt;
  } catch {
    return false;
  }
}

export function archiveResearchJob(
  jobId: string,
  reason: string,
  options?: StrategySearchStoreOptions,
): JobArchiveRecord {
  const root = resolveRoot(options);
  const job = getSearchJob(jobId, options);
  if (!job) {
    throw new Error(`strategy-search job not found: ${jobId}`);
  }
  if (job.status === "running" || job.status === "queued") {
    throw new Error("active jobs cannot be archived; stop or cancel first");
  }
  const record: JobArchiveRecord = {
    jobId,
    archivedAt: new Date().toISOString(),
    reason,
    previousStatus: job.status,
    restoredAt: null,
  };
  fs.mkdirSync(path.join(root, "jobs"), { recursive: true });
  fs.writeFileSync(
    archivePath(root, jobId),
    JSON.stringify(record, null, 2),
    "utf8",
  );
  writeDeletionAudit(
    {
      action: "archive",
      jobId,
      reason,
      previousStatus: job.status,
    },
    options,
  );
  return record;
}

export function restoreArchivedResearchJob(
  jobId: string,
  options?: StrategySearchStoreOptions,
): JobArchiveRecord {
  const root = resolveRoot(options);
  const fp = archivePath(root, jobId);
  if (!fs.existsSync(fp)) {
    throw new Error(`archive record not found: ${jobId}`);
  }
  const prev = JSON.parse(fs.readFileSync(fp, "utf8")) as JobArchiveRecord;
  const next: JobArchiveRecord = {
    ...prev,
    restoredAt: new Date().toISOString(),
  };
  fs.writeFileSync(fp, JSON.stringify(next, null, 2), "utf8");
  writeDeletionAudit(
    { action: "restore_archive", jobId },
    options,
  );
  return next;
}

export function listArchivedResearchJobs(
  options?: StrategySearchStoreOptions,
): JobArchiveRecord[] {
  const root = resolveRoot(options);
  const jobsDir = path.join(root, "jobs");
  if (!fs.existsSync(jobsDir)) return [];
  const out: JobArchiveRecord[] = [];
  for (const name of fs.readdirSync(jobsDir)) {
    if (!name.endsWith(".archive.json")) continue;
    try {
      const rec = JSON.parse(
        fs.readFileSync(path.join(jobsDir, name), "utf8"),
      ) as JobArchiveRecord;
      if (!rec.restoredAt) out.push(rec);
    } catch {
      /* skip */
    }
  }
  return out.sort((a, b) => b.archivedAt.localeCompare(a.archivedAt));
}

/** Active (non-archived) jobs for UI history lists. */
export function listVisibleResearchJobs(
  options?: StrategySearchStoreOptions,
) {
  return listSearchJobs(options).filter((j) => !isJobArchived(j.id, options));
}
