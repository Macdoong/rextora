/**
 * Recover orphaned strategy-search jobs after process restart.
 * Disk state survives; in-process execution registry does not.
 *
 * Order:
 * 1) Rebuild missing job.json from plan/execution/trials/index (paused).
 * 2) Resume disk-marked running/queued jobs that are not active in-process.
 * Never auto-resumes jobs restored as paused from missing job.json.
 */

import { listSearchJobs, type StrategySearchStoreOptions } from "./jobStore";
import { isSearchJobExecutionActive } from "./jobExecutionRegistry";
import { startStrategySearchJobApi } from "./jobApiService";
import { recoverOrphanIndexEntries } from "./jobRecordRecovery";
import { appendRecoveryAudit } from "./recoveryAudit";
import { activeElapsedMs, getSearchPlan } from "./searchPlan";
import { recoverStaleCancelRequestedJobs } from "./cancellationLifecycle";

export interface OrphanJobRecoveryResult {
  scanned: number;
  resumed: string[];
  skipped: string[];
  recordRecovered: string[];
  cancelFinalized: string[];
  errors: Array<{ jobId: string; message: string }>;
  audits: Array<{
    jobId: string;
    previousState: string | null;
    recoveredState: string | null;
    reason: string;
  }>;
}

/**
 * Find incomplete jobs on disk and restore/resume per safe rules.
 * Idempotent: skips jobs that are already executing in-process.
 */
export function recoverOrphanSearchJobs(
  store?: StrategySearchStoreOptions,
): OrphanJobRecoveryResult {
  const recordRecovered: string[] = [];
  const audits: OrphanJobRecoveryResult["audits"] = [];
  const errors: Array<{ jobId: string; message: string }> = [];

  // Phase A — missing job.json with surviving artifacts → paused restore.
  try {
    const recordResults = recoverOrphanIndexEntries(store);
    for (const r of recordResults) {
      if (!r.recovered) continue;
      recordRecovered.push(r.jobId);
      // Audit already appended by recoverMissingJobRecord.
      audits.push({
        jobId: r.jobId,
        previousState: r.previousStatus,
        recoveredState: r.recoveredStatus,
        reason: r.reason,
      });
    }
  } catch (e) {
    errors.push({
      jobId: "*",
      message: e instanceof Error ? e.message : String(e),
    });
  }

  const cancelFinalized: string[] = [];
  // Phase B — stale cancel_requested/cancelling with no active worker → cancelled.
  try {
    const cancelRecovery = recoverStaleCancelRequestedJobs({
      ...(store ?? {}),
      requireTimeout: true,
    });
    for (const row of cancelRecovery.finalized) {
      cancelFinalized.push(row.jobId);
      audits.push({
        jobId: row.jobId,
        previousState: row.beforeStatus,
        recoveredState: row.afterStatus,
        reason: "stale_cancel_requested_recovery",
      });
    }
  } catch (e) {
    errors.push({
      jobId: "*",
      message: e instanceof Error ? e.message : String(e),
    });
  }

  const jobs = listSearchJobs(store);
  const resumed: string[] = [];
  const skipped: string[] = [];

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
    // Jobs just restored from missing records are paused — never auto-resume here.
    if (recordRecovered.includes(job.id)) {
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
      const plan = getSearchPlan(job.id, store);
      const remaining =
        plan?.maxRuntimeMs != null
          ? Math.max(0, plan.maxRuntimeMs - activeElapsedMs(plan))
          : null;
      appendRecoveryAudit(
        {
          jobId: job.id,
          previousState: job.status,
          recoveredState: "running",
          recoveryTime: new Date().toISOString(),
          reason: "process_restart_orphan_resume",
          resumedGeneration: job.checkpoint?.completedIterations ?? null,
          remainingDurationMs: remaining,
          autoResumed: true,
        },
        store,
      );
      audits.push({
        jobId: job.id,
        previousState: job.status,
        recoveredState: "running",
        reason: "process_restart_orphan_resume",
      });
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
    recordRecovered,
    cancelFinalized,
    errors,
    audits,
  };
}
