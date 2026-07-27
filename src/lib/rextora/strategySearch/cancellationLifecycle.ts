/**
 * Canonical Strategy Search cancellation finalization + stale recovery.
 *
 * cancel_requested / cancelling are temporary. When no in-process worker owns
 * the job, finalize to cancelled while preserving trials / Top-10 / references.
 * Never force-finalize while an active worker lease exists.
 */

import {
  getSearchJob,
  listSearchJobs,
  listSearchTrials,
  markSearchJobCancelled,
  markSearchJobCancelling,
  requestCancelSearchJob,
  saveSearchJob,
  type StrategySearchStoreOptions,
} from "./jobStore";
import {
  isSearchJobExecutionActive,
  isSearchJobExecutionWorkerActive,
  listActiveSearchJobExecutions,
} from "./jobExecutionRegistry";
import { getSearchPlan, saveSearchPlan } from "./searchPlan";
import { appendRecoveryAudit } from "./recoveryAudit";
import { getResearchTop10, finalizeResearchTop10 } from "./researchTop10";
import { buildResearchResultsSummary } from "./researchResultsSummary";
import type { StrategySearchJob } from "./types";

/** Default acknowledgement timeout before stale cancel recovery may finalize. */
export const CANCEL_ACK_TIMEOUT_MS = 60_000;

export type CancellationFinalizeBlockReason =
  | "active_worker"
  | "not_cancel_pending"
  | "already_cancelled"
  | "not_found"
  | "timeout_pending";

export interface CancellationFinalizeResult {
  jobId: string;
  finalized: boolean;
  beforeStatus: string | null;
  afterStatus: string | null;
  blockReason: CancellationFinalizeBlockReason | null;
  messageKo: string;
  trialsPreserved: number;
  top10Preserved: boolean;
  resultsPreserved: boolean;
}

function nowIso(): string {
  return new Date().toISOString();
}

function isCancelPending(status: string | undefined | null): boolean {
  return status === "cancel_requested" || status === "cancelling";
}

function stampCancelRequested(
  job: StrategySearchJob,
  options?: StrategySearchStoreOptions,
): StrategySearchJob {
  if (job.cancelRequestedAt) return job;
  return saveSearchJob(
    {
      ...job,
      cancelRequestedAt: nowIso(),
    },
    options,
  );
}

/**
 * Request cancel. If no active worker owns the job, finalize immediately.
 * If a worker is active, leave cancel_requested for cooperative observation.
 */
export function requestCancelWithFinalization(
  jobId: string,
  options?: StrategySearchStoreOptions,
): CancellationFinalizeResult {
  const existing = getSearchJob(jobId, options);
  if (!existing) {
    return {
      jobId,
      finalized: false,
      beforeStatus: null,
      afterStatus: null,
      blockReason: "not_found",
      messageKo: "탐색 작업을 찾을 수 없습니다.",
      trialsPreserved: 0,
      top10Preserved: false,
      resultsPreserved: false,
    };
  }

  if (existing.status === "cancelled") {
    return {
      jobId,
      finalized: true,
      beforeStatus: "cancelled",
      afterStatus: "cancelled",
      blockReason: "already_cancelled",
      messageKo: "이미 중지된 탐색입니다.",
      trialsPreserved: listSearchTrials(jobId, options).length,
      top10Preserved: true,
      resultsPreserved: true,
    };
  }

  if (existing.status === "completed" || existing.status === "failed") {
    return {
      jobId,
      finalized: false,
      beforeStatus: existing.status,
      afterStatus: existing.status,
      blockReason: "not_cancel_pending",
      messageKo: "종료된 탐색은 중지할 수 없습니다.",
      trialsPreserved: listSearchTrials(jobId, options).length,
      top10Preserved: false,
      resultsPreserved: false,
    };
  }

  let job = existing;
  if (!isCancelPending(job.status)) {
    job = requestCancelSearchJob(jobId, options);
  }
  job = stampCancelRequested(getSearchJob(jobId, options) ?? job, options);

  if (isSearchJobExecutionWorkerActive(jobId, options)) {
    return {
      jobId,
      finalized: false,
      beforeStatus: job.status,
      afterStatus: job.status,
      blockReason: "active_worker",
      messageKo: "현재 실행 중인 작업이 종료되기를 기다리는 중입니다.",
      trialsPreserved: listSearchTrials(jobId, options).length,
      top10Preserved: false,
      resultsPreserved: false,
    };
  }

  return finalizeCancellation(jobId, {
    ...options,
    reason: "no_active_worker_on_cancel",
    requireTimeout: false,
  });
}

/**
 * Finalize cancel_requested/cancelling → cancelled when safe.
 */
export function finalizeCancellation(
  jobId: string,
  options?: StrategySearchStoreOptions & {
    reason?: string;
    /** When true, require cancelRequestedAt age ≥ timeout before finalize. */
    requireTimeout?: boolean;
    timeoutMs?: number;
  },
): CancellationFinalizeResult {
  const before = getSearchJob(jobId, options);
  if (!before) {
    return {
      jobId,
      finalized: false,
      beforeStatus: null,
      afterStatus: null,
      blockReason: "not_found",
      messageKo: "탐색 작업을 찾을 수 없습니다.",
      trialsPreserved: 0,
      top10Preserved: false,
      resultsPreserved: false,
    };
  }

  if (before.status === "cancelled") {
    return {
      jobId,
      finalized: true,
      beforeStatus: "cancelled",
      afterStatus: "cancelled",
      blockReason: "already_cancelled",
      messageKo: "이미 중지된 탐색입니다.",
      trialsPreserved: listSearchTrials(jobId, options).length,
      top10Preserved: true,
      resultsPreserved: true,
    };
  }

  if (!isCancelPending(before.status)) {
    return {
      jobId,
      finalized: false,
      beforeStatus: before.status,
      afterStatus: before.status,
      blockReason: "not_cancel_pending",
      messageKo: "중지 대기 상태가 아닙니다.",
      trialsPreserved: listSearchTrials(jobId, options).length,
      top10Preserved: false,
      resultsPreserved: false,
    };
  }

  if (isSearchJobExecutionWorkerActive(jobId, options)) {
    return {
      jobId,
      finalized: false,
      beforeStatus: before.status,
      afterStatus: before.status,
      blockReason: "active_worker",
      messageKo: "현재 실행 중인 작업이 종료되기를 기다리는 중입니다.",
      trialsPreserved: listSearchTrials(jobId, options).length,
      top10Preserved: false,
      resultsPreserved: false,
    };
  }

  if (options?.requireTimeout) {
    const timeoutMs = options.timeoutMs ?? CANCEL_ACK_TIMEOUT_MS;
    const requestedAt = before.cancelRequestedAt ?? before.updatedAt;
    const age = Date.now() - Date.parse(requestedAt);
    if (!Number.isFinite(age) || age < timeoutMs) {
      return {
        jobId,
        finalized: false,
        beforeStatus: before.status,
        afterStatus: before.status,
        blockReason: "timeout_pending",
        messageKo: "현재 실행 중인 작업이 종료되기를 기다리는 중입니다.",
        trialsPreserved: listSearchTrials(jobId, options).length,
        top10Preserved: false,
        resultsPreserved: false,
      };
    }
  }

  // UI phase: 결과 정리 중
  if (before.status === "cancel_requested") {
    try {
      markSearchJobCancelling(jobId, options);
    } catch {
      /* worker may already be transitioning; continue */
    }
  }

  const trials = listSearchTrials(jobId, options);
  let top10Preserved = getResearchTop10(jobId, options) != null;
  // Rebuild summary only when Top-10 is missing — large jobs keep cancel fast.
  if (!top10Preserved && trials.length > 0 && trials.length <= 2_000) {
    try {
      const summary = buildResearchResultsSummary(jobId, options);
      top10Preserved = (summary.counts.top10Saved ?? 0) > 0;
    } catch {
      /* summary optional — cancel must still complete */
    }
  } else if (top10Preserved) {
    // Live Top-10 already exists: freeze it as final without a full summary rebuild.
    try {
      finalizeResearchTop10(jobId, options);
    } catch {
      /* non-fatal — live snapshot remains usable */
    }
  }

  const plan = getSearchPlan(jobId, options);
  if (plan) {
    saveSearchPlan(
      jobId,
      {
        ...plan,
        completionReason: "USER_CANCELLED",
        pausedAtMs: null,
      },
      options,
    );
  }

  const cancelled = markSearchJobCancelled(jobId, options);
  const acknowledgedAt = nowIso();
  const finalJob = saveSearchJob(
    {
      ...cancelled,
      cancelRequestedAt: cancelled.cancelRequestedAt ?? before.cancelRequestedAt,
      cancellationAcknowledgedAt: acknowledgedAt,
      resultsPreserved: true,
      finishedAt: cancelled.finishedAt ?? acknowledgedAt,
    },
    options,
  );

  appendRecoveryAudit(
    {
      jobId,
      previousState: before.status,
      recoveredState: "cancelled",
      recoveryTime: acknowledgedAt,
      reason: options?.reason ?? "cancellation_finalized",
      resumedGeneration: finalJob.checkpoint?.completedIterations ?? null,
      remainingDurationMs: null,
      trialCount: trials.length,
      autoResumed: false,
    },
    options,
  );

  return {
    jobId,
    finalized: true,
    beforeStatus: before.status,
    afterStatus: finalJob.status,
    blockReason: null,
    messageKo: "결과가 안전하게 보존되었습니다.",
    trialsPreserved: trials.length,
    top10Preserved,
    resultsPreserved: true,
  };
}

/**
 * Recover all safe stale cancel_requested/cancelling jobs (no active worker).
 */
export function recoverStaleCancelRequestedJobs(
  options?: StrategySearchStoreOptions & {
    timeoutMs?: number;
    /** Default true for boot; false for explicit operator recovery. */
    requireTimeout?: boolean;
  },
): {
  scanned: number;
  finalized: CancellationFinalizeResult[];
  blocked: CancellationFinalizeResult[];
  activeWorkers: string[];
} {
  const requireTimeout = options?.requireTimeout !== false;
  const jobs = listSearchJobs(options).filter((j) => isCancelPending(j.status));
  const finalized: CancellationFinalizeResult[] = [];
  const blocked: CancellationFinalizeResult[] = [];
  for (const job of jobs) {
    const result = finalizeCancellation(job.id, {
      ...options,
      requireTimeout,
      timeoutMs: options?.timeoutMs ?? CANCEL_ACK_TIMEOUT_MS,
      reason: "stale_cancel_requested_recovery",
    });
    if (result.finalized) finalized.push(result);
    else blocked.push(result);
  }
  return {
    scanned: jobs.length,
    finalized,
    blocked,
    activeWorkers: listActiveSearchJobExecutions(),
  };
}
