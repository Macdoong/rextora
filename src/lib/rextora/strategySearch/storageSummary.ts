/**
 * Aggregate storage footprint for Strategy Search artifacts (jobs, trials, Top-10).
 */

import fs from "node:fs";
import path from "node:path";
import { listSearchJobs, type StrategySearchStoreOptions } from "./jobStore";
import { getRawTrialRetentionPolicy } from "./rawTrialRetention";
import { listArchivedResearchJobs } from "./jobArchive";
import { strategySearchRoot } from "../storage/runtimePaths";

export interface StorageSummary {
  totalJobs: number;
  activeJobs: number;
  archivedJobs: number;
  totalTrialFiles: number;
  top10Files: number;
  totalBytes: number;
  rawTrialRetentionPolicy: string;
}

function defaultRoot(): string {
  return strategySearchRoot();
}

function resolveRoot(options?: StrategySearchStoreOptions): string {
  return path.resolve(options?.rootDir ?? defaultRoot());
}

function dirBytes(dir: string): number {
  if (!fs.existsSync(dir)) return 0;
  let total = 0;
  const walk = (p: string) => {
    const st = fs.statSync(p);
    if (st.isFile()) {
      total += st.size;
      return;
    }
    if (st.isDirectory()) {
      for (const name of fs.readdirSync(p)) walk(path.join(p, name));
    }
  };
  walk(dir);
  return total;
}

function countTrialFiles(root: string): number {
  const trialsDir = path.join(root, "trials");
  if (!fs.existsSync(trialsDir)) return 0;
  let count = 0;
  for (const jobDir of fs.readdirSync(trialsDir)) {
    const fp = path.join(trialsDir, jobDir);
    if (!fs.statSync(fp).isDirectory()) continue;
    for (const name of fs.readdirSync(fp)) {
      if (name.endsWith(".json")) count += 1;
    }
  }
  return count;
}

function countTop10Files(root: string): number {
  const jobsDir = path.join(root, "jobs");
  if (!fs.existsSync(jobsDir)) return 0;
  return fs.readdirSync(jobsDir).filter((n) => n.endsWith(".top10.json")).length;
}

export function buildStorageSummary(
  options?: StrategySearchStoreOptions,
): StorageSummary {
  const root = resolveRoot(options);
  const jobs = listSearchJobs(options);
  const archived = listArchivedResearchJobs(options);
  const archivedIds = new Set(archived.map((a) => a.jobId));
  const activeJobs = jobs.filter((j) => !archivedIds.has(j.id)).length;

  return {
    totalJobs: jobs.length,
    activeJobs,
    archivedJobs: archived.length,
    totalTrialFiles: countTrialFiles(root),
    top10Files: countTop10Files(root),
    totalBytes:
      dirBytes(path.join(root, "trials")) +
      dirBytes(path.join(root, "jobs")),
    rawTrialRetentionPolicy: getRawTrialRetentionPolicy(options),
  };
}
