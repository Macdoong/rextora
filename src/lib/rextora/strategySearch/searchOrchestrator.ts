/**
 * Continuous goal-driven orchestration around runSearchJob.
 * Advances verified SafeV44 + Order Block search spaces; never invents families.
 */

import { CONTEXT_FALLBACK_PARAMS } from "../strategy/safeV44Params";
import {
  encodeRunnerCheckpointPayload,
  readRunnerPayloadFromCheckpoint,
  type StrategySearchRunnerCheckpointPayload,
} from "./jobCheckpoint";
import {
  getJobExecutionProfile,
  saveJobExecutionProfile,
} from "./jobExecutionProfile";
import {
  getSearchJob,
  listSearchTrials,
  markSearchJobFailed,
  markSearchJobRunning,
  reopenSearchJobForNextSpace,
  saveSearchJob,
  updateSearchCheckpoint,
  type StrategySearchStoreOptions,
} from "./jobStore";
import {
  applyLeverageModeToParams,
  filterRangesForLeverageMode,
} from "./leverageMode";
import {
  applyPatternOperatorConfigToBaseParams,
  applyPatternOperatorConfigToRanges,
  patternConfigFromPlanFields,
} from "./patternSearchConfig";
import {
  buildCombinationSpec,
  combinationMutationRanges,
  combinationParamsForCandidate,
  isPatternCombinationOperator,
  isPatternCombinationTemplateId,
} from "./patternCombination";
import {
  baseParamsForPatternSpaceId,
  isPatternSearchSpaceId,
  type PatternSearchFamilyId,
} from "./patternSearchSpaces";
import {
  activeElapsedMs,
  advanceToNextSpace,
  allocateCurrentFamilyBudget,
  familyBudgetRemaining,
  getSearchPlan,
  markSpaceCompleted,
  markSpaceExhausted,
  mergeSeenHashes,
  replenishDeadlineBudget,
  saveSearchPlan,
  syncPlanTimingFields,
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
import {
  analyzeCandidateWeaknesses,
  snapshotFromTrial,
} from "./weaknessAnalysis";
import {
  appendResearchGeneration,
  createResearchGenerationId,
  listResearchGenerations,
} from "./researchGeneration";
import {
  applySearchSpaceMutation,
  cloneSearchParameterRanges,
} from "./searchSpaceMutation";
import type {
  StrategySearchJob,
  StrategySearchParameterRange,
} from "./types";
import { classifyRunFailureReason } from "./terminationReason";
import { validateSearchParameterRanges } from "./paramSpace";
import {
  groupForSearchSpaceId,
  reconstructGroupBestFromTrials,
} from "./researchEvaluationIdentity";

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
  // Exclude paused wall-clock so pause/resume does not burn the deadline.
  return activeElapsedMs(plan) >= plan.maxRuntimeMs;
}

function isDeadlineMode(plan: StrategySearchPlan): boolean {
  return plan.maxRuntimeMs != null;
}

/**
 * Soft budget exhausted in deadline mode → replenish another chunk.
 * Returns updated plan, or a terminal completion reason when safety ceiling hits.
 */
function tryReplenishOrStop(
  plan: StrategySearchPlan,
):
  | { kind: "continue"; plan: StrategySearchPlan }
  | { kind: "stop"; plan: StrategySearchPlan; reason: StrategySearchCompletionReason } {
  if (!isDeadlineMode(plan)) {
    return {
      kind: "stop",
      plan: { ...plan, completionReason: "MAX_CANDIDATE_BUDGET" },
      reason: "MAX_CANDIDATE_BUDGET",
    };
  }
  if (runtimeExceeded(plan)) {
    return {
      kind: "stop",
      plan: { ...plan, completionReason: "DEADLINE_REACHED" },
      reason: "DEADLINE_REACHED",
    };
  }
  const replenished = replenishDeadlineBudget(plan);
  if (!replenished) {
    return {
      kind: "stop",
      plan: { ...plan, completionReason: "HARD_SAFETY_LIMIT" },
      reason: "HARD_SAFETY_LIMIT",
    };
  }
  return { kind: "continue", plan: replenished };
}

function activeSpaceRanges(
  plan: StrategySearchPlan,
  jobRanges: StrategySearchParameterRange[],
): StrategySearchParameterRange[] {
  let ranges: StrategySearchParameterRange[];
  if (
    plan.mutatedParameterRanges != null &&
    plan.mutatedParameterRanges.length > 0
  ) {
    ranges = plan.mutatedParameterRanges;
  } else {
    const spaceState = plan.spaces[plan.currentSpaceIndex];
    if (!spaceState) ranges = jobRanges;
    else {
      const spaceDef = getSearchSpaceById(spaceState.id);
      ranges = spaceDef ? rangesForSpace(spaceDef) : jobRanges;
    }
  }
  if (!plan.patternCombinationSpec || plan.patternCombinationSpec.blocks.length < 2) {
    return ranges;
  }
  const blockRanges = combinationMutationRanges(plan.patternCombinationSpec);
  const blockKeys = new Set(blockRanges.map((range) => range.key));
  return [...ranges.filter((range) => !blockKeys.has(range.key)), ...blockRanges];
}

function resolveStageBaseParams(plan: StrategySearchPlan) {
  const space = plan.spaces[plan.currentSpaceIndex];
  const patternConfig = patternConfigFromPlanFields(plan);
  const comboFamilies = (
    plan.patternCombinationSpec?.blocks.map((block) => block.family) ??
    plan.patternCombinationFamilies ??
    []
  ).filter(
    isPatternSearchSpaceId,
  ) as PatternSearchFamilyId[];
  if (comboFamilies.length > 1) {
    const templateId = isPatternCombinationTemplateId(
      plan.patternCombinationTemplate,
    )
      ? plan.patternCombinationTemplate
      : "confluence";
    const operator = isPatternCombinationOperator(
      plan.patternCombinationOperator,
    )
      ? plan.patternCombinationOperator
      : "and";
    const spec =
      plan.patternCombinationSpec ??
      buildCombinationSpec({
        templateId,
        families: comboFamilies,
        operator,
        invalidationMode:
          plan.patternCombinationInvalidationMode === "all" ? "all" : "any",
      });
    const entryFamily =
      spec.blocks.find((b) => b.role === "entry_zone")?.family ??
      comboFamilies[0]!;
    const base = baseParamsForPatternSpaceId(entryFamily) ?? {};
    const withPattern = applyPatternOperatorConfigToBaseParams(
      { ...base, ...combinationParamsForCandidate(spec) },
      patternConfig,
    );
    return applyLeverageModeToParams(withPattern, plan);
  }
  if (space && isPatternSearchSpaceId(space.id)) {
    const base = baseParamsForPatternSpaceId(space.id) ?? {};
    const withPattern = applyPatternOperatorConfigToBaseParams(
      base,
      patternConfig,
    );
    return applyLeverageModeToParams(withPattern, plan);
  }
  return applyLeverageModeToParams(CONTEXT_FALLBACK_PARAMS, plan);
}

class StageConfigurationInvalidError extends Error {
  readonly completionReason = "CONFIGURATION_INVALID" as const;

  constructor(message: string) {
    super(message);
    this.name = "StageConfigurationInvalidError";
  }
}

function failClosedInvalidStageRanges(
  jobId: string,
  plan: StrategySearchPlan,
  message: string,
  store?: StrategySearchStoreOptions,
): never {
  saveSearchPlan(
    jobId,
    { ...plan, completionReason: "CONFIGURATION_INVALID" },
    store,
  );
  const current = getSearchJob(jobId, store);
  if (current?.status === "queued") {
    markSearchJobRunning(jobId, store);
  }
  const latest = getSearchJob(jobId, store);
  if (latest?.status === "running") {
    markSearchJobFailed(jobId, message, store);
  }
  throw new StageConfigurationInvalidError(message);
}

export function applyStageConfig(
  jobId: string,
  plan: StrategySearchPlan,
  store?: StrategySearchStoreOptions,
): StrategySearchJob | undefined {
  const job = getSearchJob(jobId, store);
  if (!job) return undefined;
  const spaceState = plan.spaces[plan.currentSpaceIndex];
  if (!spaceState) return undefined;
  const ranges = filterRangesForLeverageMode(
    activeSpaceRanges(plan, job.config.parameterRanges),
    plan,
  );
  const patternConfig = patternConfigFromPlanFields(plan);
  const stageRanges =
    spaceState && isPatternSearchSpaceId(spaceState.id)
      ? applyPatternOperatorConfigToRanges(ranges, patternConfig)
      : ranges;
  const rangeCheck = validateSearchParameterRanges(stageRanges);
  const invertedNumeric = rangeCheck.issues.some(
    (issue) =>
      issue.code === "MIN_GT_MAX" ||
      issue.code === "NON_FINITE_BOUNDS" ||
      issue.code === "NAN_BOUNDS",
  );
  if (invertedNumeric) {
    const first =
      rangeCheck.issues.find(
        (issue) =>
          issue.code === "MIN_GT_MAX" ||
          issue.code === "NON_FINITE_BOUNDS" ||
          issue.code === "NAN_BOUNDS",
      ) ?? rangeCheck.issues[0];
    failClosedInvalidStageRanges(
      jobId,
      plan,
      `invalid parameterRanges: ${first?.message ?? "min must be <= max"}`,
      store,
    );
  }
  const remGlobal = remainingBudget(plan);
  const remFamily = familyBudgetRemaining(plan);
  const rem = Math.min(remGlobal, remFamily);
  const batch = Math.min(plan.stageBatchSize, Math.max(1, rem));
  const completed = job.checkpoint.completedIterations;
  // Raise the ceiling so the runner can continue from completedIterations.
  const maxIterations = completed + batch;

  const ownedStageRanges = cloneSearchParameterRanges(stageRanges);
  const nextJob = {
    ...job,
    config: {
      ...job.config,
      parameterRanges: ownedStageRanges,
      maxIterations,
    },
    finishedAt: null,
    failureMessage: null,
  };
  saveSearchJob(nextJob, store);

  const profile = getJobExecutionProfile(jobId, store);
  if (profile?.jitterConfig?.enabled) {
    saveJobExecutionProfile(
      jobId,
      {
        ...profile,
        jitterConfig: {
          ...profile.jitterConfig,
          parameterRanges: cloneSearchParameterRanges(ownedStageRanges),
        },
      },
      store,
    );
  }

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
  return nextJob;
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
  };
  if (plan.campaignStartedAtMs != null) {
    next = syncPlanTimingFields(next);
  } else {
    next = {
      ...next,
      elapsedMs: next.elapsedMs + result.statistics.elapsedMs,
    };
  }
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
 * Also records a ResearchGeneration with weakness analysis for the leaving space.
 */
function handoffToNextFamily(
  plan: StrategySearchPlan,
  mode: "exhausted" | "completed",
  jobId?: string,
  store?: StrategySearchStoreOptions,
): StrategySearchPlan | null {
  let working = plan;
  const leaving = working.spaces[working.currentSpaceIndex];
  let leavingAdjustment = working.lastMutation;
  if (jobId && leaving) {
    try {
      working = recordGenerationForSpace(jobId, working, leaving, store);
      leavingAdjustment = working.lastMutation;
    } catch {
      /* non-fatal — generation sidecar must not abort campaign */
    }
  }
  let next =
    mode === "exhausted"
      ? markSpaceExhausted(working)
      : markSpaceCompleted(working);
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
  // Re-apply weakness mutations against the next family's base ranges so
  // overlapping keys carry forward; non-overlapping keys stay at catalog defaults.
  if (leavingAdjustment && next.spaces[next.currentSpaceIndex]) {
    const nextSpace = next.spaces[next.currentSpaceIndex]!;
    const nextDef = getSearchSpaceById(nextSpace.id);
    const job = jobId ? getSearchJob(jobId, store) : null;
    const base = nextDef
      ? rangesForSpace(nextDef)
      : (job?.config.parameterRanges ?? []);
    const { ranges, record } = applySearchSpaceMutation(
      base,
      null,
      leavingAdjustment.weaknessCategories,
    );
    next = {
      ...next,
      mutatedParameterRanges: ranges,
      lastMutation: record,
    };
  } else {
    next = {
      ...next,
      mutatedParameterRanges: null,
      lastMutation: null,
    };
  }
  return next;
}

/**
 * Record a research generation for the active space, apply search-space
 * mutation from weakness analysis, and return the plan with mutated ranges.
 */
function recordGenerationForSpace(
  jobId: string,
  plan: StrategySearchPlan,
  space: StrategySearchPlan["spaces"][number],
  store?: StrategySearchStoreOptions,
): StrategySearchPlan {
  const existing = listResearchGenerations(jobId, store);
  const generationNumber = existing.length + 1;
  const trials = listSearchTrials(jobId, store);
  const leavingGroup = groupForSearchSpaceId(space.id);
  const groupBest = reconstructGroupBestFromTrials(trials);
  const groupRow = leavingGroup
    ? groupBest.find((row) => row.rankingCompatibilityGroup === leavingGroup)
    : null;
  const bestRef = groupRow?.bestPassedCandidate ?? null;
  const bestTrial = bestRef
    ? trials.find((t) => t.iteration === bestRef.iteration) ??
      trials.find((t) => t.paramsHash === bestRef.paramsHash) ??
      null
    : null;
  const bestHash = bestTrial?.paramsHash ?? null;
  const nextSpace = plan.spaces[plan.currentSpaceIndex + 1];
  const analysis = analyzeCandidateWeaknesses(
    bestTrial
      ? snapshotFromTrial({
          paramsHash: bestTrial.paramsHash,
          passed: bestTrial.passed,
          score: bestTrial.score,
          windowResults: bestTrial.windowResults as Array<
            Record<string, unknown>
          >,
          costStressResults: bestTrial.costStressResults as Array<
            Record<string, unknown>
          >,
          jitterResults: bestTrial.jitterResults as Array<
            Record<string, unknown>
          >,
        })
      : null,
    { nextFamilyLabelKo: nextSpace?.labelKo ?? null },
  );
  const job = getSearchJob(jobId, store);
  const currentRanges = activeSpaceRanges(
    plan,
    job?.config.parameterRanges ?? [],
  );
  const weaknessCategories = [
    ...analysis.findings.filter((f) => f.available).map((f) => f.category),
    ...analysis.adjustment.actions.map((a) => a.type),
  ];
  const { ranges: mutatedRanges, record: mutationRecord } =
    applySearchSpaceMutation(
      currentRanges,
      analysis.adjustment,
      weaknessCategories,
    );

  appendResearchGeneration(
    {
      version: 1,
      id: createResearchGenerationId(jobId, generationNumber),
      jobId,
      generationNumber,
      parentGenerationId: existing[existing.length - 1]?.id ?? null,
      spaceId: space.id,
      spaceLabelKo: space.labelKo,
      searchSpaceConfig: {
        spaceId: space.id,
        labelKo: space.labelKo,
        uniqueEvaluated: space.uniqueEvaluated,
        budgetAllocated: space.budgetAllocated ?? null,
        budgetSpent: space.budgetSpent ?? null,
      },
      weaknessAnalysis: analysis,
      adjustmentPlan: analysis.adjustment,
      mutatedParameterRanges: mutatedRanges,
      searchSpaceMutation: mutationRecord,
      candidateHashes: [...plan.globalSeenHashes],
      bestCandidateHash: bestHash,
      qualifiedHashes: [...plan.qualifiedHashes],
      seed: job?.config.seed ?? null,
      engineVersion: job?.config.searchVersion ?? "1",
      dataVersion: job?.config.dataVersion ?? "unknown",
      feeVersion: "v1",
      slippageVersion: "v1",
      startedAt: new Date(plan.campaignStartedAtMs ?? Date.now()).toISOString(),
      endedAt: new Date().toISOString(),
    },
    store,
  );

  return {
    ...plan,
    mutatedParameterRanges: mutatedRanges,
    lastMutation: mutationRecord,
  };
}

/**
 * Record Final PASS candidates as search-qualified only.
 * Does NOT write to Strategy Management ??registration is explicit/user-driven.
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

export function nextQualified(
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
 * promoted ??now only records qualification hashes (no Strategy Management write).
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

  try {
    return await runOrchestratedSearchJobInner(input, plan, lastRun);
  } catch (err) {
    if (err instanceof StageConfigurationInvalidError) {
      return {
        jobId,
        finalStopReason: "CONFIGURATION_INVALID",
        plan: getSearchPlan(jobId, store),
        lastRun,
      };
    }
    throw err;
  }
}

async function runOrchestratedSearchJobInner(
  input: RunSearchJobInput,
  initialPlan: StrategySearchPlan | null,
  initialLastRun: RunSearchJobResult | null,
): Promise<OrchestratedSearchResult> {
  const store = input.storeOptions;
  const jobId = input.jobId;
  let plan = initialPlan;
  let lastRun: RunSearchJobResult | null = initialLastRun;

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
    const now = Date.now();
    plan = syncPlanTimingFields(
      {
        ...plan,
        campaignStartedAtMs: now,
      },
      now,
    );
    saveSearchPlan(jobId, plan, store);
  }

  // Fair-share family allocation so EMA cannot consume the whole global budget.
  plan = allocateCurrentFamilyBudget(plan);
  saveSearchPlan(jobId, plan, store);

  // Ensure current stage config is applied before first/next run.
  applyStageConfig(jobId, plan, store);

  for (;;) {
    const live = getSearchJob(jobId, store);
    if (live?.status === "queued") {
      markSearchJobRunning(jobId, store);
    }
    if (runtimeExceeded(plan)) {
      const reason: StrategySearchCompletionReason = isDeadlineMode(plan)
        ? "DEADLINE_REACHED"
        : "MAX_RUNTIME";
      plan = { ...plan, completionReason: reason };
      saveSearchPlan(jobId, plan, store);
      return {
        jobId,
        finalStopReason: reason,
        plan,
        lastRun,
      };
    }
    if (remainingBudget(plan) <= 0) {
      const outcome = tryReplenishOrStop(plan);
      if (outcome.kind === "stop") {
        plan = outcome.plan;
        saveSearchPlan(jobId, plan, store);
        return {
          jobId,
          finalStopReason: outcome.reason,
          plan,
          lastRun,
        };
      }
      plan = outcome.plan;
      saveSearchPlan(jobId, plan, store);
      applyStageConfig(jobId, plan, store);
      continue;
    }
    if (familyBudgetRemaining(plan) <= 0) {
      const handed = handoffToNextFamily(plan, "completed", jobId, store);
      if (!handed) {
        // No more families — in deadline mode replenish and stay / stop on safety.
        if (isDeadlineMode(plan) && !runtimeExceeded(plan)) {
          const outcome = tryReplenishOrStop(plan);
          if (outcome.kind === "continue") {
            // Re-activate last family with replenished budget rather than ending early.
            const spaces = outcome.plan.spaces.map((s, i) =>
              i === outcome.plan.currentSpaceIndex
                ? { ...s, status: "active" as const }
                : s,
            );
            plan = { ...outcome.plan, spaces, completionReason: null };
            saveSearchPlan(jobId, plan, store);
            reopenSearchJobForNextSpace(jobId, store);
            applyStageConfig(jobId, plan, store);
            continue;
          }
          plan = outcome.plan;
          saveSearchPlan(jobId, plan, store);
          return {
            jobId,
            finalStopReason: outcome.reason,
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
    if (plan.qualifiedHashes.length >= plan.qualifiedTarget) {
      if (plan.stopWhenQualifiedTarget === true) {
        plan = { ...plan, completionReason: "QUALIFIED_TARGET_REACHED" };
        saveSearchPlan(jobId, plan, store);
        return {
          jobId,
          finalStopReason: "QUALIFIED_TARGET_REACHED",
          plan,
          lastRun,
        };
      }
      // Soft milestone: continue until runtime / budget / cancel.
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
      baseParams: resolveStageBaseParams(plan),
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
      const failureHint = lastRun.job.failureMessage ?? null;
      const reason = classifyRunFailureReason(failureHint);
      plan = { ...plan, completionReason: reason };
      saveSearchPlan(jobId, plan, store);
      return {
        jobId,
        finalStopReason: reason,
        plan,
        lastRun,
      };
    }

    if (plan.qualifiedHashes.length >= plan.qualifiedTarget) {
      if (plan.stopWhenQualifiedTarget === true) {
        plan = { ...plan, completionReason: "QUALIFIED_TARGET_REACHED" };
        saveSearchPlan(jobId, plan, store);
        return {
          jobId,
          finalStopReason: "QUALIFIED_TARGET_REACHED",
          plan,
          lastRun,
        };
      }
    }

    if (remainingBudget(plan) <= 0) {
      const outcome = tryReplenishOrStop(plan);
      if (outcome.kind === "stop") {
        plan = outcome.plan;
        saveSearchPlan(jobId, plan, store);
        return {
          jobId,
          finalStopReason: outcome.reason,
          plan,
          lastRun,
        };
      }
      plan = outcome.plan;
      saveSearchPlan(jobId, plan, store);
      // Fall through to continue same/next stage with replenished budget.
    }

    if (lastRun.stopReason === "search_space_exhausted") {
      const handed = handoffToNextFamily(plan, "exhausted", jobId, store);
      if (!handed) {
        if (isDeadlineMode(plan) && !runtimeExceeded(plan)) {
          const outcome = tryReplenishOrStop({
            ...plan,
            // Ensure replenish can add room even if budget appears full.
            candidateBudget: Math.max(
              plan.candidateBudget,
              plan.candidateBudgetUsed,
            ),
          });
          if (outcome.kind === "continue") {
            const spaces = outcome.plan.spaces.map((s, i) =>
              i === outcome.plan.currentSpaceIndex
                ? { ...s, status: "active" as const }
                : s,
            );
            plan = { ...outcome.plan, spaces, completionReason: null };
            saveSearchPlan(jobId, plan, store);
            reopenSearchJobForNextSpace(jobId, store);
            applyStageConfig(jobId, plan, store);
            continue;
          }
          plan = outcome.plan;
          saveSearchPlan(jobId, plan, store);
          return {
            jobId,
            finalStopReason: outcome.reason,
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

    if (lastRun.stopReason === "max_iterations") {
      // Family budget spent — hand remaining global budget to next family.
      if (familyBudgetRemaining(plan) <= 0) {
        const handed = handoffToNextFamily(plan, "completed", jobId, store);
        if (!handed) {
          if (remainingBudget(plan) <= 0) {
            const outcome = tryReplenishOrStop(plan);
            if (outcome.kind === "continue") {
              const spaces = outcome.plan.spaces.map((s, i) =>
                i === outcome.plan.currentSpaceIndex
                  ? { ...s, status: "active" as const }
                  : s,
              );
              plan = { ...outcome.plan, spaces, completionReason: null };
              saveSearchPlan(jobId, plan, store);
              reopenSearchJobForNextSpace(jobId, store);
              applyStageConfig(jobId, plan, store);
              continue;
            }
            plan = outcome.plan;
            saveSearchPlan(jobId, plan, store);
            return {
              jobId,
              finalStopReason: outcome.reason,
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
      // Continue same family with remaining family budget — mutate ranges first.
      if (remainingBudget(plan) > 0 || isDeadlineMode(plan)) {
        if (remainingBudget(plan) <= 0) {
          const outcome = tryReplenishOrStop(plan);
          if (outcome.kind === "stop") {
            plan = outcome.plan;
            saveSearchPlan(jobId, plan, store);
            return {
              jobId,
              finalStopReason: outcome.reason,
              plan,
              lastRun,
            };
          }
          plan = outcome.plan;
        }
        const space = plan.spaces[plan.currentSpaceIndex];
        if (space) {
          try {
            plan = recordGenerationForSpace(jobId, plan, space, store);
          } catch {
            /* non-fatal */
          }
        }
        saveSearchPlan(jobId, plan, store);
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
