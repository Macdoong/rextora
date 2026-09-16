import { readRunnerPayloadFromCheckpoint } from "./jobCheckpoint";
import type { StaleJobExecutionOwnershipRecovery } from "./jobExecutionOwnership";
import { isJobExecutionOwnedOnDisk } from "./jobExecutionOwnership";
import { getJobExecutionProfile } from "./jobExecutionProfile";
import {
  getSearchJob,
  type StrategySearchStoreOptions,
} from "./jobStore";
import {
  transitionJobToCompleted,
  transitionJobToInterrupted,
  transitionJobToQueued,
} from "./jobState";
import {
  activeElapsedMs,
  getSearchPlan,
  markPlanInterrupted,
  markPlanInterruptionResumed,
  saveSearchPlan,
  type StrategySearchPlan,
} from "./searchPlan";
import type { StrategySearchJob } from "./types";

export type InterruptedRecoveryBlocker =
  | "NOT_INTERRUPTED"
  | "ACTIVE_OWNER"
  | "MISSING_PLAN"
  | "INVALID_TIMING"
  | "MISSING_CHECKPOINT"
  | "INVALID_CHECKPOINT"
  | "MISSING_EXECUTION_PROFILE";

export type InterruptedRecoveryInspection =
  | {
      eligible: true;
      job: StrategySearchJob;
      activeElapsedMs: number;
      remainingMs: number | null;
    }
  | {
      eligible: false;
      blocker: InterruptedRecoveryBlocker;
      job: StrategySearchJob | null;
    };

function finiteTimestamp(value: string | number | null | undefined): number | null {
  const parsed = typeof value === "number" ? value : Date.parse(value ?? "");
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * Shared durable-work clocks for process-loss accounting.
 * Never use Date.now() or sweep recoveredAt as the downtime START — those are
 * the not-after cap (interruption END). Heartbeat is optional at manual Start.
 */
function maxDurableWorkClockMs(input: {
  job: StrategySearchJob;
  heartbeatAt?: string | number | null;
  notAfterMs: number;
}): number | null {
  const candidates = [
    finiteTimestamp(input.heartbeatAt),
    finiteTimestamp(input.job.checkpoint.updatedAt),
    finiteTimestamp(input.job.updatedAt),
  ].filter(
    (value): value is number => value != null && value <= input.notAfterMs,
  );
  if (candidates.length === 0) return null;
  return Math.max(...candidates);
}

/**
 * The stale lease heartbeat proves the previous worker was alive through that
 * instant. A later durable checkpoint/job mutation proves it was alive longer,
 * so use the latest boundary and never backdate the interruption.
 */
export function resolveProcessInterruptionBoundaryMs(input: {
  job: StrategySearchJob;
  ownership: StaleJobExecutionOwnershipRecovery;
}): number | null {
  const recoveredAt = finiteTimestamp(input.ownership.recoveredAt);
  if (recoveredAt == null) return null;
  return maxDurableWorkClockMs({
    job: input.job,
    heartbeatAt: input.ownership.heartbeatAt,
    notAfterMs: recoveredAt,
  });
}

/**
 * G7 base queued-continuation shape. This ALONE is not production authority:
 * prepareInterruptedJobForRecovery yields the same shape after folding.
 */
export function isQueuedContinuationJob(
  job: Pick<
    StrategySearchJob,
    "status" | "startedAt" | "finishedAt" | "checkpoint"
  >,
  plan: Pick<
    StrategySearchPlan,
    "campaignStartedAtMs" | "completionReason"
  > | null,
): boolean {
  return (
    job.status === "queued" &&
    job.startedAt != null &&
    job.finishedAt == null &&
    plan != null &&
    plan.campaignStartedAtMs != null &&
    plan.completionReason == null &&
    job.checkpoint.completedIterations > 0
  );
}

/**
 * Same durable-clock family as resolveProcessInterruptionBoundaryMs.
 * `now` is the interruption END (Start time), not the downtime start.
 */
export function resolveQueuedContinuationBoundaryMs(input: {
  job: StrategySearchJob;
  now: number;
  heartbeatAt?: string | number | null;
}): number | null {
  return maxDurableWorkClockMs({
    job: input.job,
    heartbeatAt: input.heartbeatAt,
    notAfterMs: input.now,
  });
}

/**
 * True only when the G7 shape matches AND there is still unaccounted downtime.
 * After prepareInterruptedJobForRecovery, job.updatedAt is the prepare/queue
 * time, so the durable max is ~now and this returns false (no double-fold).
 */
export function queuedContinuationNeedsDowntimeNormalization(
  job: StrategySearchJob,
  plan: StrategySearchPlan | null,
  now: number,
  heartbeatAt?: string | number | null,
): boolean {
  if (!isQueuedContinuationJob(job, plan) || plan == null) return false;
  if (plan.interruptedAtMs != null) return false;
  const boundary = resolveQueuedContinuationBoundaryMs({
    job,
    now,
    heartbeatAt,
  });
  return boundary != null && boundary < now;
}

export function foldQueuedContinuationDowntime(
  plan: StrategySearchPlan,
  boundaryMs: number,
  now: number,
): StrategySearchPlan {
  return markPlanInterruptionResumed(
    markPlanInterrupted(plan, boundaryMs, now),
    now,
  );
}

export function normalizeQueuedContinuationRuntimeIfNeeded(
  jobId: string,
  now = Date.now(),
  options?: StrategySearchStoreOptions,
  heartbeatAt?: string | number | null,
): {
  normalized: boolean;
  planBefore: StrategySearchPlan | null;
  boundaryMs: number | null;
} {
  const job = getSearchJob(jobId, options);
  const plan = getSearchPlan(jobId, options);
  if (
    !job ||
    !queuedContinuationNeedsDowntimeNormalization(job, plan, now, heartbeatAt)
  ) {
    return { normalized: false, planBefore: null, boundaryMs: null };
  }
  const boundaryMs = resolveQueuedContinuationBoundaryMs({
    job,
    now,
    heartbeatAt,
  });
  if (boundaryMs == null || plan == null) {
    return { normalized: false, planBefore: null, boundaryMs: null };
  }
  saveSearchPlan(
    jobId,
    foldQueuedContinuationDowntime(plan, boundaryMs, now),
    options,
  );
  return { normalized: true, planBefore: plan, boundaryMs };
}

export function restoreQueuedContinuationPlan(
  jobId: string,
  planBefore: StrategySearchPlan,
  options?: StrategySearchStoreOptions,
): void {
  saveSearchPlan(jobId, planBefore, options);
}

export function interruptRunningJobFromStaleOwnership(
  ownership: StaleJobExecutionOwnershipRecovery,
  options?: StrategySearchStoreOptions,
): { interrupted: boolean; interruptionStartedAtMs: number | null } {
  const job = getSearchJob(ownership.jobId, options);
  if (!job || job.status !== "running") {
    return { interrupted: false, interruptionStartedAtMs: null };
  }
  const interruptionStartedAtMs = resolveProcessInterruptionBoundaryMs({
    job,
    ownership,
  });
  const plan = getSearchPlan(job.id, options);

  transitionJobToInterrupted(job.id, options);
  if (plan && interruptionStartedAtMs != null) {
    const recoveredAt = finiteTimestamp(ownership.recoveredAt) ?? Date.now();
    saveSearchPlan(
      job.id,
      markPlanInterrupted(plan, interruptionStartedAtMs, recoveredAt),
      options,
    );
  }
  return { interrupted: true, interruptionStartedAtMs };
}

export function inspectInterruptedRecovery(
  jobId: string,
  options?: StrategySearchStoreOptions,
): InterruptedRecoveryInspection {
  const job = getSearchJob(jobId, options);
  if (!job || job.status !== "interrupted") {
    return { eligible: false, blocker: "NOT_INTERRUPTED", job };
  }
  if (isJobExecutionOwnedOnDisk(jobId, options)) {
    return { eligible: false, blocker: "ACTIVE_OWNER", job };
  }
  const plan = getSearchPlan(jobId, options);
  if (!plan) return { eligible: false, blocker: "MISSING_PLAN", job };
  if (
    plan.campaignStartedAtMs == null ||
    !Number.isFinite(plan.campaignStartedAtMs) ||
    plan.interruptedAtMs == null ||
    !Number.isFinite(plan.interruptedAtMs)
  ) {
    return { eligible: false, blocker: "INVALID_TIMING", job };
  }
  if (job.checkpoint.randomState == null) {
    return { eligible: false, blocker: "MISSING_CHECKPOINT", job };
  }
  try {
    const payload = readRunnerPayloadFromCheckpoint(job.checkpoint);
    if (
      !payload ||
      !Number.isInteger(job.checkpoint.completedIterations) ||
      job.checkpoint.completedIterations < 0 ||
      !Number.isInteger(job.checkpoint.nextIteration) ||
      job.checkpoint.nextIteration < job.checkpoint.completedIterations
    ) {
      return { eligible: false, blocker: "INVALID_CHECKPOINT", job };
    }
  } catch {
    return { eligible: false, blocker: "INVALID_CHECKPOINT", job };
  }
  if (!getJobExecutionProfile(jobId, options)) {
    return { eligible: false, blocker: "MISSING_EXECUTION_PROFILE", job };
  }
  const elapsed = activeElapsedMs(plan);
  return {
    eligible: true,
    job,
    activeElapsedMs: elapsed,
    remainingMs:
      plan.maxRuntimeMs == null
        ? null
        : Math.max(0, plan.maxRuntimeMs - elapsed),
  };
}

export function prepareInterruptedJobForRecovery(
  jobId: string,
  now = Date.now(),
  options?: StrategySearchStoreOptions,
): StrategySearchJob {
  const plan = getSearchPlan(jobId, options);
  if (!plan || plan.interruptedAtMs == null) {
    throw new Error("interrupted strategy-search timing is unavailable");
  }
  saveSearchPlan(jobId, markPlanInterruptionResumed(plan, now), options);
  return transitionJobToQueued(jobId, options);
}

export function rollbackPreparedInterruptedRecovery(
  jobId: string,
  now = Date.now(),
  options?: StrategySearchStoreOptions,
): void {
  const job = getSearchJob(jobId, options);
  if (!job || job.status !== "queued") return;
  transitionJobToInterrupted(jobId, options);
  const plan = getSearchPlan(jobId, options);
  if (plan) saveSearchPlan(jobId, markPlanInterrupted(plan, now, now), options);
}

export function completeInterruptedJobAtDeadline(
  jobId: string,
  now = Date.now(),
  options?: StrategySearchStoreOptions,
): StrategySearchJob {
  const plan = getSearchPlan(jobId, options);
  if (!plan) throw new Error("interrupted strategy-search plan is unavailable");
  const elapsedMs = activeElapsedMs(plan, now);
  saveSearchPlan(
    jobId,
    {
      ...plan,
      elapsedMs,
      expectedCompletionAtMs: null,
      completionReason: "DEADLINE_REACHED",
    },
    options,
  );
  return transitionJobToCompleted(jobId, options);
}
