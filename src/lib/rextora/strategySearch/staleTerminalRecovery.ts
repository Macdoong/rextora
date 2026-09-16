import {
  finalizeNormalSearchCompletion,
  isNormalSearchCompletionReason,
  isSearchJobExecutionActive,
} from "./jobExecutionRegistry";
import { isJobExecutionOwnedOnDisk } from "./jobExecutionOwnership";
import {
  getSearchJob,
  listSearchJobs,
  type StrategySearchStoreOptions,
} from "./jobStore";
import { getSearchPlan, type StrategySearchPlan } from "./searchPlan";
import type { StrategySearchJob } from "./types";

export interface StaleTerminalRecoveryCandidate {
  jobId: string;
  completionReason: NonNullable<StrategySearchPlan["completionReason"]>;
  currentStatus: "running";
  wouldTransitionTo: "completed";
}

export interface StaleTerminalRecoveryResult {
  dryRun: boolean;
  scanned: number;
  candidates: StaleTerminalRecoveryCandidate[];
  completed: string[];
}

export interface VerifiedTerminalStaleEvidence {
  status: StrategySearchJob["status"];
  completionReason: StrategySearchPlan["completionReason"];
  executionActive: boolean;
  ownershipActive: boolean;
  cancelRequestedAt: string | null;
  pausedAtMs: number | null;
}

/** Pure, narrow eligibility rule for historical terminal-state recovery. */
export function isVerifiedTerminalStaleEvidence(
  evidence: VerifiedTerminalStaleEvidence,
): boolean {
  return (
    evidence.status === "running" &&
    isNormalSearchCompletionReason(evidence.completionReason) &&
    !evidence.executionActive &&
    !evidence.ownershipActive &&
    evidence.cancelRequestedAt == null &&
    evidence.pausedAtMs == null
  );
}

export function inspectStaleTerminalRecoveryCandidate(
  job: StrategySearchJob,
  store?: StrategySearchStoreOptions,
): StaleTerminalRecoveryCandidate | null {
  let plan: StrategySearchPlan | null;
  try {
    plan = getSearchPlan(job.id, store);
  } catch {
    // Malformed/corrupt index rows are never safe terminal-recovery candidates.
    return null;
  }
  const completionReason = plan?.completionReason ?? null;
  if (
    !isVerifiedTerminalStaleEvidence({
      status: job.status,
      completionReason,
      executionActive: isSearchJobExecutionActive(job.id),
      ownershipActive: isJobExecutionOwnedOnDisk(job.id, store),
      cancelRequestedAt: job.cancelRequestedAt ?? null,
      pausedAtMs: plan?.pausedAtMs ?? null,
    }) ||
    completionReason == null
  ) {
    return null;
  }
  return {
    jobId: job.id,
    completionReason,
    currentStatus: "running",
    wouldTransitionTo: "completed",
  };
}

/**
 * Scan for proven terminal-stale jobs. Dry-run is strictly read-only; apply
 * mode is intended for an explicitly selected isolated/admin recovery action.
 */
export function recoverStaleTerminalSearchJobs(
  options: StrategySearchStoreOptions & { dryRun: boolean },
): StaleTerminalRecoveryResult {
  const jobs = listSearchJobs(options);
  const candidates = jobs.flatMap((job) => {
    const candidate = inspectStaleTerminalRecoveryCandidate(job, options);
    return candidate ? [candidate] : [];
  });
  const completed: string[] = [];

  if (!options.dryRun) {
    for (const candidate of candidates) {
      const current = getSearchJob(candidate.jobId, options);
      if (!current) continue;
      const stillEligible = inspectStaleTerminalRecoveryCandidate(
        current,
        options,
      );
      if (!stillEligible) continue;
      const finalized = finalizeNormalSearchCompletion(
        candidate.jobId,
        candidate.completionReason,
        options,
      );
      if (finalized?.status === "completed") completed.push(candidate.jobId);
    }
  }

  return {
    dryRun: options.dryRun,
    scanned: jobs.length,
    candidates,
    completed,
  };
}
