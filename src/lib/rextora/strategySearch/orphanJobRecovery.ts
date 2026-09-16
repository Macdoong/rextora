/**
 * Recover orphaned strategy-search jobs after process restart.
 * Disk state survives; in-process execution registry does not.
 *
 * Order:
 * 1) Rebuild missing job.json from proven durable artifacts (fail closed).
 * 2) Convert proven stale-owner running jobs to interrupted.
 * 3) Resume validated interrupted jobs and ordinary queued jobs within the cap.
 * Never auto-resumes jobs restored as paused from missing job.json.
 */

import {
  getSearchJob,
  listSearchJobs,
  type StrategySearchStoreOptions,
} from "./jobStore";
import {
  isSearchJobExecutionActive,
  isSearchJobExecutionWorkerActive,
  planHasNormalTerminalCompletionReason,
} from "./jobExecutionRegistry";
import { recoverStaleJobExecutionOwnershipDetailed } from "./jobExecutionOwnership";
import { startStrategySearchJobApi } from "./jobApiService";
import { recoverOrphanIndexEntries } from "./jobRecordRecovery";
import { appendRecoveryAudit } from "./recoveryAudit";
import { activeElapsedMs, getSearchPlan } from "./searchPlan";
import { recoverStaleCancelRequestedJobs } from "./cancellationLifecycle";
import { inspectStaleTerminalRecoveryCandidate } from "./staleTerminalRecovery";
import {
  completeInterruptedJobAtDeadline,
  inspectInterruptedRecovery,
  interruptRunningJobFromStaleOwnership,
  prepareInterruptedJobForRecovery,
  rollbackPreparedInterruptedRecovery,
} from "./processInterruption";

export interface OrphanJobRecoveryResult {
  scanned: number;
  resumeLimit: number;
  resumed: string[];
  skipped: string[];
  recordRecovered: string[];
  cancelFinalized: string[];
  ownershipRecovered: string[];
  interrupted: string[];
  deadlineCompleted: string[];
  recoveryBlocked: Array<{ jobId: string; reason: string }>;
  terminalStaleSkipped: string[];
  errors: Array<{ jobId: string; message: string }>;
  audits: Array<{
    jobId: string;
    previousState: string | null;
    recoveredState: string | null;
    reason: string;
  }>;
}

/** Default max jobs auto-resumed on one boot. 0 = operator-only (MODEL B). */
export const DEFAULT_ORPHAN_AUTO_RESUME_LIMIT = 0;

/**
 * Resolve boot auto-resume limit.
 * - Unset / blank / invalid / negative → 0 in every NODE_ENV.
 * - REXTORA_ORPHAN_AUTO_RESUME_LIMIT=N overrides (0 disables; finite n>=0 → floor).
 * Explicit nonzero is an expert override. Candidate selection is unchanged.
 */
export function resolveOrphanAutoResumeLimit(
  env: NodeJS.ProcessEnv = process.env,
): number {
  const raw = env.REXTORA_ORPHAN_AUTO_RESUME_LIMIT?.trim();
  if (raw == null || raw === "") return DEFAULT_ORPHAN_AUTO_RESUME_LIMIT;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return DEFAULT_ORPHAN_AUTO_RESUME_LIMIT;
  return Math.floor(n);
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
  const ownershipRecovered: string[] = [];
  const interrupted: string[] = [];
  const deadlineCompleted: string[] = [];
  const recoveryBlocked: Array<{ jobId: string; reason: string }> = [];
  // Phase A0 — drop stale cross-process owner leases before any resume attempt.
  try {
    const staleOwnership = recoverStaleJobExecutionOwnershipDetailed(store);
    ownershipRecovered.push(...staleOwnership.map((row) => row.jobId));
    for (const ownership of staleOwnership) {
      if (isSearchJobExecutionActive(ownership.jobId)) continue;
      const result = interruptRunningJobFromStaleOwnership(ownership, store);
      if (!result.interrupted) continue;
      interrupted.push(ownership.jobId);
      const current = getSearchJob(ownership.jobId, store);
      const plan = getSearchPlan(ownership.jobId, store);
      appendRecoveryAudit(
        {
          jobId: ownership.jobId,
          previousState: "running",
          recoveredState: "interrupted",
          recoveryTime: ownership.recoveredAt,
          reason: "process_loss_interrupted",
          resumedGeneration: current?.checkpoint.completedIterations ?? null,
          remainingDurationMs:
            plan?.maxRuntimeMs != null
              ? Math.max(0, plan.maxRuntimeMs - activeElapsedMs(plan))
              : null,
          autoResumed: false,
          interruptionStartedAt:
            result.interruptionStartedAtMs == null
              ? null
              : new Date(result.interruptionStartedAtMs).toISOString(),
        },
        store,
      );
      audits.push({
        jobId: ownership.jobId,
        previousState: "running",
        recoveredState: "interrupted",
        reason: "process_loss_interrupted",
      });
    }
  } catch (e) {
    errors.push({
      jobId: "*",
      message: e instanceof Error ? e.message : String(e),
    });
  }
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
  const terminalStaleSkipped: string[] = [];

  // Cap scan to newest 100 to avoid long boot stalls.
  const scan = jobs
    .slice()
    .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)))
    .slice(0, 100);

  // Hard cap auto-resumes per boot. Resuming dozens of shared-disk orphans into one
  // Next process (especially next-dev / Turbopack) saturates the event loop, blocks
  // compilation, and drops Settings/Agent HTTP readiness. Remaining eligible orphans
  // stay on disk for a later boot or explicit operator resume.
  const resumeLimit = resolveOrphanAutoResumeLimit();

  for (const job of scan) {
    // A persisted normal terminal reason is authoritative even when the stale
    // job still says running. Keep P1-A repair explicit and never restart it.
    if (inspectStaleTerminalRecoveryCandidate(job, store)) {
      terminalStaleSkipped.push(job.id);
      skipped.push(job.id);
      continue;
    }
    if (job.status === "queued") {
      try {
        const queuedPlan = getSearchPlan(job.id, store);
        if (planHasNormalTerminalCompletionReason(queuedPlan)) {
          terminalStaleSkipped.push(job.id);
          skipped.push(job.id);
          continue;
        }
      } catch {
        // Invalid id / unreadable plan is not proof of a terminal reason.
      }
    }
    if (job.status !== "interrupted" && job.status !== "queued") {
      skipped.push(job.id);
      continue;
    }
    // Jobs just restored from missing records are paused — never auto-resume here.
    if (recordRecovered.includes(job.id)) {
      skipped.push(job.id);
      continue;
    }
    if (isSearchJobExecutionWorkerActive(job.id, store)) {
      skipped.push(job.id);
      continue;
    }
    if (resumed.length >= resumeLimit) {
      skipped.push(job.id);
      continue;
    }
    try {
      const previousState = job.status;
      if (job.status === "interrupted") {
        const inspection = inspectInterruptedRecovery(job.id, store);
        if (!inspection.eligible) {
          recoveryBlocked.push({ jobId: job.id, reason: inspection.blocker });
          skipped.push(job.id);
          continue;
        }
        const plan = getSearchPlan(job.id, store);
        if (
          plan?.maxRuntimeMs != null &&
          inspection.activeElapsedMs >= plan.maxRuntimeMs
        ) {
          completeInterruptedJobAtDeadline(job.id, Date.now(), store);
          deadlineCompleted.push(job.id);
          appendRecoveryAudit(
            {
              jobId: job.id,
              previousState: "interrupted",
              recoveredState: "completed",
              recoveryTime: new Date().toISOString(),
              reason: "process_loss_active_deadline_reached",
              resumedGeneration: job.checkpoint.completedIterations,
              remainingDurationMs: 0,
              autoResumed: false,
            },
            store,
          );
          audits.push({
            jobId: job.id,
            previousState: "interrupted",
            recoveredState: "completed",
            reason: "process_loss_active_deadline_reached",
          });
          continue;
        }
        prepareInterruptedJobForRecovery(job.id, Date.now(), store);
      }
      try {
        startStrategySearchJobApi(job.id, { storeOptions: store });
      } catch (error) {
        if (previousState === "interrupted") {
          rollbackPreparedInterruptedRecovery(job.id, Date.now(), store);
        }
        throw error;
      }
      resumed.push(job.id);
      const plan = getSearchPlan(job.id, store);
      const remaining =
        plan?.maxRuntimeMs != null
          ? Math.max(0, plan.maxRuntimeMs - activeElapsedMs(plan))
          : null;
      appendRecoveryAudit(
        {
          jobId: job.id,
          previousState,
          recoveredState: "running",
          recoveryTime: new Date().toISOString(),
          reason:
            previousState === "interrupted"
              ? "process_loss_interrupted_resume"
              : "queued_startup_resume",
          resumedGeneration: job.checkpoint?.completedIterations ?? null,
          remainingDurationMs: remaining,
          autoResumed: true,
        },
        store,
      );
      audits.push({
        jobId: job.id,
        previousState,
        recoveredState: "running",
        reason:
          previousState === "interrupted"
            ? "process_loss_interrupted_resume"
            : "queued_startup_resume",
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
    resumeLimit,
    resumed,
    skipped,
    recordRecovered,
    cancelFinalized,
    ownershipRecovered,
    interrupted,
    deadlineCompleted,
    recoveryBlocked,
    terminalStaleSkipped,
    errors,
    audits,
  };
}

export interface OrphanJobInspectionResult {
  scanned: number;
  resumeLimit: number;
  candidates: string[];
  skipped: string[];
  resumed: string[];
  recordRecovered: string[];
  errors: Array<{ jobId: string; message: string }>;
  audits: OrphanJobRecoveryResult["audits"];
  mutation: false;
}

/** Read-only recovery discovery. Does not write jobs, audits, or resume. */
export function inspectOrphanSearchJobs(
  store?: StrategySearchStoreOptions,
): OrphanJobInspectionResult {
  const jobs = listSearchJobs(store);
  const scan = jobs
    .slice()
    .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)))
    .slice(0, 100);
  const candidates: string[] = [];
  const skipped: string[] = [];
  for (const job of scan) {
    if (job.status === "interrupted" || job.status === "queued") {
      candidates.push(job.id);
    } else {
      skipped.push(job.id);
    }
  }
  return {
    scanned: scan.length,
    resumeLimit: resolveOrphanAutoResumeLimit(),
    candidates,
    skipped,
    resumed: [],
    recordRecovered: [],
    errors: [],
    audits: [],
    mutation: false,
  };
}
