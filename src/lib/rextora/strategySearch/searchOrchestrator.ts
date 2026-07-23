/**
 * Continuous goal-driven orchestration around runSearchJob.
 * Advances verified SafeV44 search spaces; never invents families.
 */

import {
  encodeRunnerCheckpointPayload,
  readRunnerPayloadFromCheckpoint,
  type StrategySearchRunnerCheckpointPayload,
} from "./jobCheckpoint";
import {
  getJobExecutionProfile,
} from "./jobExecutionProfile";
import {
  getSearchJob,
  listSearchTrials,
  reopenSearchJobForNextSpace,
  saveSearchJob,
  updateSearchCheckpoint,
  type StrategySearchStoreOptions,
} from "./jobStore";
import {
  advanceToNextSpace,
  allocateCurrentFamilyBudget,
  familyBudgetRemaining,
  getSearchPlan,
  markSpaceCompleted,
  markSpaceExhausted,
  mergeSeenHashes,
  saveSearchPlan,
  updateCurrentFamilySpent,
  type StrategySearchCompletionReason,
  type StrategySearchPlan,
} from "./searchPlan";
import { rangesForSpace, getSearchSpaceById } from "./searchSpaces";
import {
  runSearchJob,
  type RunSearchJobInput,
  type RunSearchJobResult,
} from "./jobRunner";

export interface OrchestratedSearchResult {
  jobId: string;
  finalStopReason: StrategySearchCompletionReason;
  plan: StrategySearchPlan | null;
  lastRun: RunSearchJobResult | null;
}

function remainingBudget(plan: StrategySearchPlan): number {
  return Math.max(0, plan.candidateBudget - plan.candidateBudgetUsed);
}

function runtimeExceeded(plan: StrategySearchPlan): boolean {
  if (plan.maxRuntimeMs == null || plan.campaignStartedAtMs == null) {
    return false;
  }
  return Date.now() - plan.campaignStartedAtMs >= plan.maxRuntimeMs;
}

function applyStageConfig(
  jobId: string,
  plan: StrategySearchPlan,
  store?: StrategySearchStoreOptions,
): void {
  const job = getSearchJob(jobId, store);
  if (!job) return;
  const spaceState = plan.spaces[plan.currentSpaceIndex];
  if (!spaceState) return;
  const spaceDef = getSearchSpaceById(spaceState.id);
  const ranges = spaceDef
    ? rangesForSpace(spaceDef)
    : job.config.parameterRanges;
  const remGlobal = remainingBudget(plan);
  const remFamily = familyBudgetRemaining(plan);
  const rem = Math.min(remGlobal, remFamily);
  const batch = Math.min(plan.stageBatchSize, Math.max(1, rem));
  const completed = job.checkpoint.completedIterations;
  // Raise the ceiling so the runner can continue from completedIterations.
  const maxIterations = completed + batch;

  const nextJob = {
    ...job,
    config: {
      ...job.config,
      parameterRanges: ranges,
      maxIterations,
    },
    finishedAt: null,
    failureMessage: null,
  };
  saveSearchJob(nextJob, store);

  const payload = readRunnerPayloadFromCheckpoint(job.checkpoint);
  const seeded: StrategySearchRunnerCheckpointPayload = payload
    ? {
        ...payload,
        seenHashes: [
          ...new Set([...plan.globalSeenHashes, ...payload.seenHashes]),
        ],
        stopReason: undefined,
        jobStatus: "queued",
      }
    : {
        version: 1,
        prng: {
          algorithm: "mulberry32",
          seed: job.config.seed,
          state: job.config.seed >>> 0,
        },
        statistics: {
          generated: 0,
          evaluated: 0,
          passed: 0,
          failed: 0,
          stressPassed: 0,
          jitterPassed: 0,
          duplicates: 0,
          errors: 0,
          bestScore: null,
          averageScore: null,
          scoreSum: 0,
          elapsedMs: 0,
          remainingEstimateMs: null,
        },
        seenHashes: [...plan.globalSeenHashes],
        lastParentCandidateId: null,
        lastParentParamsHash: null,
        jobStatus: "queued",
      };

  updateSearchCheckpoint(
    jobId,
    {
      ...job.checkpoint,
      randomState: encodeRunnerCheckpointPayload(seeded),
      updatedAt: new Date().toISOString(),
    },
    store,
  );
}

function syncPlanAfterRun(
  plan: StrategySearchPlan,
  result: RunSearchJobResult,
): StrategySearchPlan {
  const payload = readRunnerPayloadFromCheckpoint(result.job.checkpoint);
  const hashes = payload?.seenHashes ?? [];
  let next = mergeSeenHashes(plan, hashes);
  const dupDelta = Math.max(
    0,
    (payload?.statistics.duplicates ?? 0) - plan.duplicateSkippedCount,
  );
  next = {
    ...next,
    duplicateSkippedCount: plan.duplicateSkippedCount + dupDelta,
    elapsedMs:
      plan.campaignStartedAtMs != null
        ? Date.now() - plan.campaignStartedAtMs
        : next.elapsedMs + result.statistics.elapsedMs,
  };
  const space = next.spaces[next.currentSpaceIndex];
  if (space) {
    const delta = Math.max(
      0,
      next.globalSeenHashes.length - plan.globalSeenHashes.length,
    );
    const spent = (space.budgetSpent ?? space.uniqueEvaluated ?? 0) + delta;
    next = updateCurrentFamilySpent(next, spent);
  }
  return next;
}

/**
 * Advance to the next family, carrying unused global budget forward.
 * Returns null when no further family remains.
 */
function handoffToNextFamily(
  plan: StrategySearchPlan,
  mode: "exhausted" | "completed",
): StrategySearchPlan | null {
  let next =
    mode === "exhausted" ? markSpaceExhausted(plan) : markSpaceCompleted(plan);
  const before = next.currentSpaceIndex;
  next = advanceToNextSpace(next);
  if (
    next.completionReason === "SEARCH_SPACE_EXHAUSTED" ||
    next.currentSpaceIndex === before
  ) {
    return null;
  }
  // Fresh allocation for the newly active family from remaining global budget.
  next = allocateCurrentFamilyBudget(next);
  return next;
}

/**
 * Record Final PASS candidates as search-qualified only.
 * Does NOT write to Strategy Management — registration is explicit/user-driven.
 */
function recordQualifiedPasses(
  jobId: string,
  plan: StrategySearchPlan,
  store?: StrategySearchStoreOptions,
): StrategySearchPlan {
  const trials = listSearchTrials(jobId, store).filter((t) => t.passed);
  const qualified = new Set(nextQualified(plan, trials));
  return {
    ...plan,
    qualifiedHashes: [...qualified],
  };
}

function nextQualified(
  plan: StrategySearchPlan,
  trials: Array<{ paramsHash: string; score: number | null }>,
): string[] {
  const qualified = new Set(plan.qualifiedHashes);
  for (const trial of trials) {
    if (qualified.has(trial.paramsHash)) continue;
    if (trial.paramsHash.startsWith("duplicate_exhausted_")) continue;
    if (
      plan.minScore != null &&
      (trial.score == null || trial.score < plan.minScore)
    ) {
      continue;
    }
    qualified.add(trial.paramsHash);
  }
  return [...qualified];
}

/**
 * @deprecated Auto-promotion removed. Kept name for callers that previously
 * promoted — now only records qualification hashes (no Strategy Management write).
 */
function promoteNewPasses(
  jobId: string,
  plan: StrategySearchPlan,
  store?: StrategySearchStoreOptions,
): StrategySearchPlan {
  return recordQualifiedPasses(jobId, plan, store);
}

/**
 * Run continuous search for a job that has a plan.
 * Jobs without a plan fall back to a single runSearchJob (legacy).
 */
export async function runOrchestratedSearchJob(
  input: RunSearchJobInput,
): Promise<OrchestratedSearchResult> {
  const store = input.storeOptions;
  const jobId = input.jobId;
  let plan = getSearchPlan(jobId, store);
  let lastRun: RunSearchJobResult | null = null;

  if (!plan) {
    lastRun = await runSearchJob(input);
    return {
      jobId,
      finalStopReason:
        lastRun.stopReason === "search_space_exhausted"
          ? "SEARCH_SPACE_EXHAUSTED"
          : lastRun.stopReason === "cancelled"
            ? "USER_CANCELLED"
            : lastRun.stopReason === "max_iterations"
              ? "MAX_ITERATIONS"
              : lastRun.stopReason === "paused"
                ? "PAUSED"
                : null,
      plan: null,
      lastRun,
    };
  }

  if (plan.campaignStartedAtMs == null) {
    plan = {
      ...plan,
      campaignStartedAtMs: Date.now(),
    };
    saveSearchPlan(jobId, plan, store);
  }

  // Fair-share family allocation so EMA cannot consume the whole global budget.
  plan = allocateCurrentFamilyBudget(plan);
  saveSearchPlan(jobId, plan, store);

  // Ensure current stage config is applied before first/next run.
  applyStageConfig(jobId, plan, store);

  for (;;) {
    if (runtimeExceeded(plan)) {
      plan = { ...plan, completionReason: "MAX_RUNTIME" };
      saveSearchPlan(jobId, plan, store);
      return {
        jobId,
        finalStopReason: "MAX_RUNTIME",
        plan,
        lastRun,
      };
    }
    if (remainingBudget(plan) <= 0) {
      plan = { ...plan, completionReason: "MAX_CANDIDATE_BUDGET" };
      saveSearchPlan(jobId, plan, store);
      return {
        jobId,
        finalStopReason: "MAX_CANDIDATE_BUDGET",
        plan,
        lastRun,
      };
    }
    if (familyBudgetRemaining(plan) <= 0) {
      const handed = handoffToNextFamily(plan, "completed");
      if (!handed) {
        plan = { ...plan, completionReason: "SEARCH_SPACE_EXHAUSTED" };
        saveSearchPlan(jobId, plan, store);
        return {
          jobId,
          finalStopReason: "SEARCH_SPACE_EXHAUSTED",
          plan,
          lastRun,
        };
      }
      plan = handed;
      saveSearchPlan(jobId, plan, store);
      reopenSearchJobForNextSpace(jobId, store);
      applyStageConfig(jobId, plan, store);
      continue;
    }
    if (plan.qualifiedHashes.length >= plan.qualifiedTarget) {
      plan = { ...plan, completionReason: "QUALIFIED_TARGET_REACHED" };
      saveSearchPlan(jobId, plan, store);
      return {
        jobId,
        finalStopReason: "QUALIFIED_TARGET_REACHED",
        plan,
        lastRun,
      };
    }

    const profile = getJobExecutionProfile(jobId, store);
    if (!profile) {
      plan = { ...plan, completionReason: "FATAL_ERROR" };
      saveSearchPlan(jobId, plan, store);
      return {
        jobId,
        finalStopReason: "FATAL_ERROR",
        plan,
        lastRun,
      };
    }

    lastRun = await runSearchJob({
      ...input,
      // Fresh windows each stage; caller already built them
    });

    plan = syncPlanAfterRun(plan, lastRun);
    plan = promoteNewPasses(jobId, plan, store);
    saveSearchPlan(jobId, plan, store);

    if (lastRun.stopReason === "cancelled") {
      plan = { ...plan, completionReason: "USER_CANCELLED" };
      saveSearchPlan(jobId, plan, store);
      return {
        jobId,
        finalStopReason: "USER_CANCELLED",
        plan,
        lastRun,
      };
    }
    if (lastRun.stopReason === "paused") {
      plan = { ...plan, completionReason: "PAUSED" };
      saveSearchPlan(jobId, plan, store);
      return { jobId, finalStopReason: "PAUSED", plan, lastRun };
    }
    if (lastRun.stopReason === "failed") {
      plan = { ...plan, completionReason: "FATAL_ERROR" };
      saveSearchPlan(jobId, plan, store);
      return {
        jobId,
        finalStopReason: "FATAL_ERROR",
        plan,
        lastRun,
      };
    }

    if (plan.qualifiedHashes.length >= plan.qualifiedTarget) {
      plan = { ...plan, completionReason: "QUALIFIED_TARGET_REACHED" };
      saveSearchPlan(jobId, plan, store);
      return {
        jobId,
        finalStopReason: "QUALIFIED_TARGET_REACHED",
        plan,
        lastRun,
      };
    }

    if (remainingBudget(plan) <= 0) {
      plan = { ...plan, completionReason: "MAX_CANDIDATE_BUDGET" };
      saveSearchPlan(jobId, plan, store);
      return {
        jobId,
        finalStopReason: "MAX_CANDIDATE_BUDGET",
        plan,
        lastRun,
      };
    }

    if (lastRun.stopReason === "search_space_exhausted") {
      const handed = handoffToNextFamily(plan, "exhausted");
      if (!handed) {
        plan = { ...plan, completionReason: "SEARCH_SPACE_EXHAUSTED" };
        saveSearchPlan(jobId, plan, store);
        return {
          jobId,
          finalStopReason: "SEARCH_SPACE_EXHAUSTED",
          plan,
          lastRun,
        };
      }
      plan = handed;
      saveSearchPlan(jobId, plan, store);
      reopenSearchJobForNextSpace(jobId, store);
      applyStageConfig(jobId, plan, store);
      continue;
    }

    if (lastRun.stopReason === "max_iterations") {
      // Family budget spent → hand remaining global budget to next family.
      if (familyBudgetRemaining(plan) <= 0) {
        const handed = handoffToNextFamily(plan, "completed");
        if (!handed) {
          if (remainingBudget(plan) <= 0) {
            plan = { ...plan, completionReason: "MAX_CANDIDATE_BUDGET" };
            saveSearchPlan(jobId, plan, store);
            return {
              jobId,
              finalStopReason: "MAX_CANDIDATE_BUDGET",
              plan,
              lastRun,
            };
          }
          plan = { ...plan, completionReason: "SEARCH_SPACE_EXHAUSTED" };
          saveSearchPlan(jobId, plan, store);
          return {
            jobId,
            finalStopReason: "SEARCH_SPACE_EXHAUSTED",
            plan,
            lastRun,
          };
        }
        plan = handed;
        saveSearchPlan(jobId, plan, store);
        reopenSearchJobForNextSpace(jobId, store);
        applyStageConfig(jobId, plan, store);
        continue;
      }
      // Continue same family with remaining family budget.
      if (remainingBudget(plan) > 0) {
        reopenSearchJobForNextSpace(jobId, store);
        applyStageConfig(jobId, plan, store);
        continue;
      }
      plan = { ...plan, completionReason: "MAX_CANDIDATE_BUDGET" };
      saveSearchPlan(jobId, plan, store);
      return {
        jobId,
        finalStopReason: "MAX_CANDIDATE_BUDGET",
        plan,
        lastRun,
      };
    }

    // Unknown / completed without classified reason
    plan = {
      ...plan,
      completionReason: plan.completionReason ?? "MAX_ITERATIONS",
    };
    saveSearchPlan(jobId, plan, store);
    return {
      jobId,
      finalStopReason: plan.completionReason,
      plan,
      lastRun,
    };
  }
}

/**
 * Re-sync qualified hashes from persisted Final PASS trials.
 * Does not write to Strategy Management. Manual registration uses promote API.
 */
export function retryFailedPromotions(
  jobId: string,
  store?: StrategySearchStoreOptions,
): StrategySearchPlan | null {
  const plan = getSearchPlan(jobId, store);
  if (!plan) return null;
  const next = recordQualifiedPasses(jobId, plan, store);
  saveSearchPlan(jobId, next, store);
  return next;
}
