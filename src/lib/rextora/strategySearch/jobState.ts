/**
 * Strategy-search job state machine (Phase 5).
 *
 * Conceptual Phase 5 names map onto the persisted StrategySearchJobStatus values:
 *   CREATED     → queued
 *   RUNNING     → running
 *   PAUSED      → paused
 *   CANCELLING  → cancel_requested
 *   CANCELLED   → cancelled
 *   COMPLETED   → completed
 *   FAILED      → failed
 *
 * Intermediate pause_requested is preserved from Phase 1 persistence.
 */

import {
  StrategySearchPersistenceError,
  markSearchJobCancelled,
  markSearchJobCompleted,
  markSearchJobFailed,
  markSearchJobPaused,
  markSearchJobRunning,
  requestCancelSearchJob,
  requestPauseSearchJob,
  resumeSearchJob,
  type StrategySearchStoreOptions,
} from "./jobStore";
import type { StrategySearchJob, StrategySearchJobStatus } from "./types";

/** Conceptual labels for documentation / tests (persist as StrategySearchJobStatus). */
export type StrategySearchJobStateLabel =
  | "CREATED"
  | "RUNNING"
  | "PAUSE_REQUESTED"
  | "PAUSED"
  | "CANCELLING"
  | "CANCELLED"
  | "COMPLETED"
  | "FAILED";

export class StrategySearchJobStateError extends Error {
  readonly code: "INVALID_TRANSITION" | "INVALID_STATE" | "NOT_FOUND";
  readonly from: StrategySearchJobStatus | null;
  readonly to: StrategySearchJobStatus | null;

  constructor(
    code: StrategySearchJobStateError["code"],
    message: string,
    from: StrategySearchJobStatus | null = null,
    to: StrategySearchJobStatus | null = null,
  ) {
    super(message);
    this.name = "StrategySearchJobStateError";
    this.code = code;
    this.from = from;
    this.to = to;
  }
}

/** Same transition matrix as jobStore — validated here for pure checks. */
const ALLOWED_TRANSITIONS: ReadonlyArray<
  readonly [StrategySearchJobStatus, StrategySearchJobStatus]
> = [
  ["queued", "running"],
  ["queued", "cancel_requested"],
  ["running", "pause_requested"],
  ["running", "cancel_requested"],
  ["running", "completed"],
  ["running", "failed"],
  ["pause_requested", "paused"],
  ["pause_requested", "cancel_requested"],
  ["paused", "queued"],
  ["paused", "cancel_requested"],
  ["cancel_requested", "cancelled"],
  ["completed", "queued"],
];

export function toJobStateLabel(
  status: StrategySearchJobStatus,
): StrategySearchJobStateLabel {
  switch (status) {
    case "queued":
      return "CREATED";
    case "running":
      return "RUNNING";
    case "pause_requested":
      return "PAUSE_REQUESTED";
    case "paused":
      return "PAUSED";
    case "cancel_requested":
      return "CANCELLING";
    case "cancelled":
      return "CANCELLED";
    case "completed":
      return "COMPLETED";
    case "failed":
      return "FAILED";
    default: {
      const _exhaustive: never = status;
      return _exhaustive;
    }
  }
}

export function canTransitionJobState(
  from: StrategySearchJobStatus,
  to: StrategySearchJobStatus,
): boolean {
  return ALLOWED_TRANSITIONS.some(([a, b]) => a === from && b === to);
}

export function assertJobStateTransition(
  from: StrategySearchJobStatus,
  to: StrategySearchJobStatus,
): void {
  if (!canTransitionJobState(from, to)) {
    throw new StrategySearchJobStateError(
      "INVALID_TRANSITION",
      `invalid strategy-search status transition: ${from} → ${to}`,
      from,
      to,
    );
  }
}

export function isTerminalJobStatus(status: StrategySearchJobStatus): boolean {
  return (
    status === "completed" || status === "cancelled" || status === "failed"
  );
}

export function isRunnableJobStatus(status: StrategySearchJobStatus): boolean {
  return status === "queued" || status === "running";
}

function wrapStoreError(err: unknown): never {
  if (err instanceof StrategySearchPersistenceError) {
    if (err.code === "INVALID_TRANSITION") {
      throw new StrategySearchJobStateError(
        "INVALID_TRANSITION",
        err.message,
      );
    }
    if (err.code === "NOT_FOUND") {
      throw new StrategySearchJobStateError("NOT_FOUND", err.message);
    }
  }
  throw err;
}

export function transitionJobToRunning(
  jobId: string,
  options?: StrategySearchStoreOptions,
): StrategySearchJob {
  try {
    return markSearchJobRunning(jobId, options);
  } catch (err) {
    wrapStoreError(err);
  }
}

export function transitionJobToPauseRequested(
  jobId: string,
  options?: StrategySearchStoreOptions,
): StrategySearchJob {
  try {
    return requestPauseSearchJob(jobId, options);
  } catch (err) {
    wrapStoreError(err);
  }
}

export function transitionJobToPaused(
  jobId: string,
  options?: StrategySearchStoreOptions,
): StrategySearchJob {
  try {
    return markSearchJobPaused(jobId, options);
  } catch (err) {
    wrapStoreError(err);
  }
}

export function transitionJobToQueued(
  jobId: string,
  options?: StrategySearchStoreOptions,
): StrategySearchJob {
  try {
    return resumeSearchJob(jobId, options);
  } catch (err) {
    wrapStoreError(err);
  }
}

export function transitionJobToCancelRequested(
  jobId: string,
  options?: StrategySearchStoreOptions,
): StrategySearchJob {
  try {
    return requestCancelSearchJob(jobId, options);
  } catch (err) {
    wrapStoreError(err);
  }
}

export function transitionJobToCancelled(
  jobId: string,
  options?: StrategySearchStoreOptions,
): StrategySearchJob {
  try {
    return markSearchJobCancelled(jobId, options);
  } catch (err) {
    wrapStoreError(err);
  }
}

export function transitionJobToCompleted(
  jobId: string,
  options?: StrategySearchStoreOptions,
): StrategySearchJob {
  try {
    return markSearchJobCompleted(jobId, options);
  } catch (err) {
    wrapStoreError(err);
  }
}

export function transitionJobToFailed(
  jobId: string,
  failureMessage: string,
  options?: StrategySearchStoreOptions,
): StrategySearchJob {
  try {
    return markSearchJobFailed(jobId, failureMessage, options);
  } catch (err) {
    wrapStoreError(err);
  }
}
