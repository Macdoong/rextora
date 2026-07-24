/**
 * Recover orphaned "running" strategy-search jobs after process restart.
 * Disk state survives; in-process execution registry does not.
 */

import { listSearchJobs, type StrategySearchStoreOptions } from "./jobStore";
import { isSearchJobExecutionActive } from "./jobExecutionRegistry";
import { startStrategySearchJobApi } from "./jobApiService";

export interface OrphanJobRecoveryResult {
  scanned: number;
  resumed: string[];
  skipped: string[];
  errors: Array<{ jobId: string; message: string }>;
}

/**
 * Find jobs marked running on disk but not active in this process, and resume them.
 * Idempotent: skips jobs that are already executing in-process.
 */
export function recoverOrphanSearchJobs(
  store?: StrategySearchStoreOptions,
): OrphanJobRecoveryResult {
  const jobs = listSearchJobs(store);
  const resumed: string[] = [];
  const skipped: string[] = [];
  const errors: Array<{ jobId: string; message: string }> = [];

  // Cap scan to newest 100 to avoid long boot stalls.
  const scan = jobs
    .slice()
    .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)))
    .slice(0, 100);

  for (const job of scan) {
    if (job.status !== "running" && job.status !== "queued") {
      skipped.push(job.id);
      continue;
    }
    if (isSearchJobExecutionActive(job.id)) {
      skipped.push(job.id);
      continue;
    }
    try {
      startStrategySearchJobApi(job.id, { storeOptions: store });
      resumed.push(job.id);
    } catch (e) {
      errors.push({
        jobId: job.id,
        message: e instanceof Error ? e.message : String(e),
      });
    }
  }

  return {
    scanned: scan.length,
    resumed,
    skipped,
    errors,
  };
}
