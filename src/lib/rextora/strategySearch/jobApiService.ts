/**
 * Strategy Search API service — thin orchestration over Phase 1–5 modules.
 * Route handlers must call this; they must not run the search loop themselves.
 */

import fs from "node:fs";
import path from "node:path";
import {
  readRunnerPayloadFromCheckpoint,
} from "./jobCheckpoint";
import {
  StrategySearchApiValidationError,
  validateCreateSearchJobBody,
} from "./jobApiValidation";
import {
  getJobExecutionProfile,
  saveJobExecutionProfile,
} from "./jobExecutionProfile";
import {
  StrategySearchExecutionRegistryError,
  isSearchJobExecutionActive,
  startSearchJobExecution,
  type SearchJobExecutionDeps,
} from "./jobExecutionRegistry";
import {
  StrategySearchPersistenceError,
  createSearchJob,
  getSearchJob,
  getSearchTrial,
  listSearchJobs,
  listSearchTrials,
  type StrategySearchStoreOptions,
} from "./jobStore";
import {
  activeElapsedMs,
  computeExpectedCompletionAtMs,
  createEmptySearchPlan,
  getSearchPlan,
  markPlanPaused,
  markPlanResumed,
  saveSearchPlan,
} from "./searchPlan";
import { resolveTerminationReason } from "./terminationReason";
import { deriveCanonicalCounters } from "./jobStatistics";
import { SAFETY_BUDGET_CEILING } from "./searchPlan";
import { buildSymbolSelectionEvidence } from "./symbolSelection";
import { classifyEngineError } from "./engineErrorClassification";
import { recoverMissingJobRecord } from "./jobRecordRecovery";
import { resolveSpacesForDepth } from "./operatorProfiles";
import {
  getSearchSpaceById,
  rangesForSpace,
  resolveSelectedSearchSpaces,
} from "./searchSpaces";
import { listStrategies } from "../strategy/strategyStore";
import { buildReadableStrategyIdentity } from "./readableStrategyName";
import {
  STRATEGY_SEARCH_HISTORY_VISIBLE_DEFAULT,
  compareJobsNewestFirst,
  manualDeleteBlockMessageKo,
  runHistoryRetentionAfterCreate,
  type ManualDeleteBlockReason,
} from "./historyRetention";
import {
  executeResearchJobDeletion,
  ResearchJobDeletionError,
} from "./deletionSafety";
import {
  isJobArchived,
  listArchivedResearchJobs,
  listVisibleResearchJobs,
  restoreArchivedResearchJob,
} from "./jobArchive";
import {
  StrategySearchJobRunnerError,
  requestSearchJobPause,
  resumeSearchJobForRun,
} from "./jobRunner";
import {
  StrategySearchJobStateError,
  transitionJobToQueued,
} from "./jobState";
import { requestCancelWithFinalization } from "./cancellationLifecycle";
import {
  getResearchTop10,
  rankChangeLabelShort,
} from "./researchTop10";
import { buildPersistedSearchSummary } from "./persistedSearchSummary";
import { combinationLabelKo } from "./patternCombination";
import type {
  StrategySearchBestCandidateReference,
  StrategySearchJob,
  StrategySearchTrial,
} from "./types";

export type StrategySearchApiErrorCode =
  | "INVALID_REQUEST"
  | "JOB_NOT_FOUND"
  | "INVALID_STATE"
  | "JOB_ALREADY_RUNNING"
  | "CORRUPT_CHECKPOINT"
  | "UNSUPPORTED_CHECKPOINT_VERSION"
  | "PROTECTED_STRATEGY_VIOLATION"
  | "INTERNAL_EXECUTION_FAILURE"
  | "MISSING_EXECUTION_PROFILE";

export class StrategySearchApiError extends Error {
  readonly code: StrategySearchApiErrorCode;
  readonly httpStatus: number;
  readonly details: string[];

  constructor(
    code: StrategySearchApiErrorCode,
    message: string,
    httpStatus: number,
    details: string[] = [],
  ) {
    super(message);
    this.name = "StrategySearchApiError";
    this.code = code;
    this.httpStatus = httpStatus;
    this.details = details;
  }
}

export interface StrategySearchJobSummary {
  id: string;
  status: StrategySearchJob["status"];
  createdAt: string;
  updatedAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  /** Flat active elapsed for Dashboard/Research (null for legacy). */
  elapsedMs?: number | null;
  /** Remaining active duration vs maxRuntimeMs (null for legacy). */
  remainingMs?: number | null;
  maxRuntimeMs?: number | null;
  campaignStartedAtMs?: number | null;
  pausedAtMs?: number | null;
  accumulatedPauseMs?: number | null;
  resumedAtMs?: number | null;
  expectedCompletionAtMs?: number | null;
  maxIterations: number | null;
  completedIterations: number;
  nextIteration: number;
  progressRatio: number | null;
  statistics: {
    generated: number;
    evaluated: number;
    passed: number;
    failed: number;
    stressPassed: number;
    jitterPassed: number;
    duplicates: number;
    errors: number;
    bestScore: number | null;
    averageScore: number | null;
    elapsedMs: number;
    remainingEstimateMs: number | null;
  } | null;
  bestScore: number | null;
  bestCandidateHash: string | null;
  bestPassedCandidateHash: string | null;
  failureMessage: string | null;
  /** Canonical termination reason — never blank when status=failed. */
  terminationReason?: string | null;
  executionActive: boolean;
  searchVersion: string;
  symbols: string[];
  timeframe: string;
  seed: number;
  /** True when job completed because the parameter space was exhausted. */
  searchSpaceExhausted: boolean;
  /** Operator-facing search name (from strategyTemplateId). */
  searchName: string;
  /** Additive operator/plan fields (null/omitted for legacy jobs). */
  depthProfile?: string | null;
  qualificationProfile?: string | null;
  qualifiedTarget?: number | null;
  qualifiedCount?: number | null;
  uniqueEvaluatedCount?: number | null;
  duplicateSkippedCount?: number | null;
  exhaustedSpaceCount?: number | null;
  completionReason?: string | null;
  candidateBudget?: number | null;
  promotionWarnings?: number | null;
  /** Current search family label (operator-facing). */
  currentSearchFamily?: string | null;
  /** Full combination label when multi-pattern plan is active. */
  currentCombinationLabel?: string | null;
  /** Selected combination families for running header honesty. */
  patternCombinationFamilies?: string[] | null;
  /** Combination operator when multi-pattern. */
  patternCombinationOperator?: string | null;
  /** 1-based stage index / total for progression UI. */
  searchStageIndex?: number | null;
  searchStageTotal?: number | null;
  /** Ordered family progression for the campaign. */
  searchProgression?: Array<{
    id: string;
    labelKo: string;
    status: string;
    budgetAllocated?: number | null;
    budgetSpent?: number | null;
    uniqueEvaluated?: number | null;
  }> | null;
  /** Best verified return from best-passed trial, when available. */
  bestReturn?: number | null;
  currentBestSummary?: string | null;
  /** Global candidates remaining. */
  remainingBudget?: number | null;
  /** Global candidates used. */
  candidateBudgetUsed?: number | null;
  /** Overall research progress 0–100. */
  overallProgressPct?: number | null;
  /** Current family improvement label (same as active space). */
  currentImprovementStage?: string | null;
  /** Active family remaining budget. */
  familyBudgetRemaining?: number | null;
  /**
   * Applied search-space mutation summary from plan.lastMutation (null if none/advisory-only).
   * Only present when mutations were actually applied to ranges.
   */
  lastMutation?: {
    appliedAt: string;
    weaknessCategories: string[];
    mutationCount: number;
    firstChange: {
      key: string;
      field: "min" | "max" | "step" | "defaultValue";
      from: number;
      to: number;
      reason: string;
    } | null;
  } | null;
  /** Canonical counter breakdown (errors ⊆ failed). */
  counters?: {
    evaluated: number;
    qualified: number;
    rejected: number;
    evaluationErrors: number;
    invariantOk: boolean;
    equation: string;
  } | null;
  /** Soft operator budget at create time (before deadline replenish). */
  initialCandidateBudget?: number | null;
  /** Hard safety ceiling — never a normal completion target. */
  resourceSafetyCeiling?: number | null;
  /** Presentation outcome; persisted status may remain failed. */
  outcomePresentation?:
    | "running"
    | "completed"
    | "user_stopped"
    | "cancelled"
    | "partial_completed"
    | "failed"
    | null;
  candidatesPreserved?: boolean;
  preservedCandidateCount?: number | null;
  retryable?: boolean;
  failedStage?: string | null;
  lastSuccessfulStage?: string | null;
  terminationDetail?: string | null;
  symbolSelection?: {
    mode: "recommended" | "manual";
    selectedSymbol: string;
    reasonKo: string;
    liquidityStatus: string;
    volatilityStatus: string;
    dataAvailability: string;
    excludedAlternatives: Array<{ symbol: string; reasonKo: string }>;
  } | null;
  currentBestRisk?: {
    netReturn: number | null;
    maxDrawdown: number | null;
    tradeCount: number | null;
    totalCost: number | null;
    profitFactor: number | null;
    robustnessStatus: string;
    overfittingRisk: string;
    eligibilityStatus: string;
    recommendable: boolean;
  } | null;
  /** True when job has an active archive sidecar (hidden from default history). */
  isArchived?: boolean;
  /** Live Research Top-10 shortlist (persisted; updated during run). */
  liveTop10?: {
    updatedAt: string;
    finalizedAt: string | null;
    phase: "live" | "final";
    entries: Array<{
      rank: number;
      previousRank: number | null;
      displayAlias: string;
      readableName: string;
      strategyFamily?: string;
      strategyHash: string;
      netReturn: number | null;
      maxDrawdown: number | null;
      tradeCount: number | null;
      profitFactor: number | null;
      winRate: number | null;
      sharpe: number | null;
      patternStack: string;
      confidence: string;
      risk: string;
      miniSeries: number[] | null;
      costStatus: string;
      robustnessStatus: string;
      sampleConfidence: string;
      leverageLabel: string;
      rankReason: string;
      rankChange: string;
      rankChangeShort: string;
      movementReasonKo: string;
      roleBadges: string[];
      eligibilityStatus?: string;
      recommendable?: boolean;
      registrationState?: string;
      overfittingRisk?: string;
      score?: number | null;
      previousNetReturn?: number | null;
      previousMaxDrawdown?: number | null;
      previousTradeCount?: number | null;
      previousScore?: number | null;
    }>;
  } | null;
}

export interface StrategySearchJobDetail extends StrategySearchJobSummary {
  config: {
    searchVersion: string;
    strategyTemplateId: string;
    symbols: string[];
    timeframe: string;
    dataVersion: string;
    seed: number;
    generatorType: StrategySearchJob["config"]["generatorType"];
    maxIterations: number | null;
    parameterRangeKeys: string[];
    evaluationWindowIds: string[];
  };
  checkpoint: {
    completedIterations: number;
    nextIteration: number;
    bestCandidate: StrategySearchBestCandidateReference | null;
    bestPassedCandidate: StrategySearchBestCandidateReference | null;
    updatedAt: string;
    hasRunnerPayload: boolean;
  };
  appliedSearchSummary?: ReturnType<typeof buildPersistedSearchSummary>;
}

export interface StrategySearchBestResultResponse {
  bestCandidate: StrategySearchBestCandidateReference | null;
  bestPassedCandidate: StrategySearchBestCandidateReference | null;
  bestTrial: StrategySearchTrial | null;
  bestPassedTrial: StrategySearchTrial | null;
  gateNotes: {
    bestCandidatePassedFinal: boolean | null;
    bestPassedCandidatePassedFinal: boolean | null;
    /** Trial.passed is final PASS (base ∧ stress ∧ jitter). */
    finalPassMeaning: string;
  };
}

const DEFAULT_TRIAL_LIMIT = 50;
const MAX_TRIAL_LIMIT = 200;

/** Test-only default store root so route handlers can use temp dirs. */
let defaultStoreOptionsForTests: StrategySearchStoreOptions | null = null;

export function setStrategySearchApiStoreOptionsForTests(
  options: StrategySearchStoreOptions | null,
): void {
  defaultStoreOptionsForTests = options;
}

function resolveStore(
  options?: StrategySearchStoreOptions,
): StrategySearchStoreOptions | undefined {
  return options ?? defaultStoreOptionsForTests ?? undefined;
}

function mapCaught(err: unknown): never {
  if (err instanceof StrategySearchApiError) throw err;
  if (err instanceof StrategySearchApiValidationError) {
    throw new StrategySearchApiError(
      err.code === "INVALID_REQUEST" ? "INVALID_REQUEST" : "INVALID_REQUEST",
      err.message,
      400,
      err.details,
    );
  }
  if (err instanceof StrategySearchExecutionRegistryError) {
    if (err.code === "ALREADY_RUNNING" || err.code === "ALREADY_OWNED") {
      throw new StrategySearchApiError(
        "JOB_ALREADY_RUNNING",
        err.message,
        409,
      );
    }
    if (err.code === "NOT_FOUND") {
      throw new StrategySearchApiError("JOB_NOT_FOUND", err.message, 404);
    }
    if (err.code === "MISSING_PROFILE") {
      throw new StrategySearchApiError(
        "MISSING_EXECUTION_PROFILE",
        err.message,
        500,
      );
    }
    throw new StrategySearchApiError("INVALID_STATE", err.message, 409);
  }
  if (err instanceof StrategySearchJobStateError) {
    throw new StrategySearchApiError("INVALID_STATE", err.message, 409);
  }
  if (err instanceof StrategySearchJobRunnerError) {
    if (err.code === "CORRUPT_CHECKPOINT") {
      throw new StrategySearchApiError("CORRUPT_CHECKPOINT", err.message, 409);
    }
    if (err.code === "NOT_FOUND") {
      throw new StrategySearchApiError("JOB_NOT_FOUND", err.message, 404);
    }
    if (err.code === "INVALID_STATE") {
      throw new StrategySearchApiError("INVALID_STATE", err.message, 409);
    }
    throw new StrategySearchApiError(
      "INTERNAL_EXECUTION_FAILURE",
      err.message,
      500,
    );
  }
  if (err instanceof StrategySearchPersistenceError) {
    if (err.code === "NOT_FOUND") {
      throw new StrategySearchApiError("JOB_NOT_FOUND", err.message, 404);
    }
    if (err.code === "INVALID_TRANSITION") {
      throw new StrategySearchApiError("INVALID_STATE", err.message, 409);
    }
    if (err.code === "CORRUPTED") {
      throw new StrategySearchApiError("CORRUPT_CHECKPOINT", err.message, 409);
    }
  }
  throw new StrategySearchApiError(
    "INTERNAL_EXECUTION_FAILURE",
    err instanceof Error ? err.message : "strategy-search API failure",
    500,
  );
}

function requireJob(
  jobId: string,
  options?: StrategySearchStoreOptions,
): StrategySearchJob {
  try {
    let job = getSearchJob(jobId, options);
    if (!job) {
      // Recover missing job.json when plan/execution/trials/index remain.
      // Never deletes trials. Restores as paused (no silent auto-resume).
      try {
        const recovery = recoverMissingJobRecord(jobId, options);
        if (recovery.recovered) {
          job = getSearchJob(jobId, options);
        }
      } catch {
        /* recovery best-effort; fall through to NOT_FOUND */
      }
    }
    if (!job) {
      throw new StrategySearchApiError(
        "JOB_NOT_FOUND",
        `strategy-search job not found: ${jobId}`,
        404,
      );
    }
    return job;
  } catch (err) {
    if (err instanceof StrategySearchApiError) throw err;
    if (
      err instanceof StrategySearchPersistenceError &&
      err.code === "INVALID_IDENTIFIER"
    ) {
      throw new StrategySearchApiError("JOB_NOT_FOUND", err.message, 404);
    }
    throw err;
  }
}

/**
 * Primary research progress is deadline/time based:
 * activeElapsedMs / requestedActiveDurationMs (paused time excluded).
 * Candidate budget must never drive this ratio.
 */
function progressRatio(
  job: StrategySearchJob,
  options?: StrategySearchStoreOptions,
): number | null {
  const plan = getSearchPlan(job.id, options);
  if (plan?.maxRuntimeMs != null && plan.maxRuntimeMs > 0) {
    if (job.status === "completed") return 1;
    const terminal =
      job.status === "cancelled" ||
      job.status === "failed";
    const elapsed = terminal
      ? Math.max(0, plan.elapsedMs ?? 0)
      : plan.campaignStartedAtMs != null
        ? activeElapsedMs(plan)
        : Math.max(0, plan.elapsedMs ?? 0);
    return Math.min(1, Math.max(0, elapsed / plan.maxRuntimeMs));
  }
  return null;
}

function summarizeJob(
  job: StrategySearchJob,
  options?: StrategySearchStoreOptions,
): StrategySearchJobSummary {
  let statistics: StrategySearchJobSummary["statistics"] = null;
  let searchSpaceExhausted = false;
  try {
    const payload = readRunnerPayloadFromCheckpoint(job.checkpoint);
    if (payload) {
      statistics = {
        generated: payload.statistics.generated,
        evaluated: payload.statistics.evaluated,
        passed: payload.statistics.passed,
        failed: payload.statistics.failed,
        stressPassed: payload.statistics.stressPassed,
        jitterPassed: payload.statistics.jitterPassed,
        duplicates: payload.statistics.duplicates,
        errors: payload.statistics.errors,
        bestScore: payload.statistics.bestScore,
        averageScore: payload.statistics.averageScore,
        elapsedMs: payload.statistics.elapsedMs,
        remainingEstimateMs: payload.statistics.remainingEstimateMs,
      };
      searchSpaceExhausted =
        job.status === "completed" &&
        payload.stopReason === "search_space_exhausted";
    }
  } catch {
    statistics = null;
  }

  const plan = getSearchPlan(job.id, options);
  if (plan?.completionReason === "SEARCH_SPACE_EXHAUSTED") {
    searchSpaceExhausted = job.status === "completed";
  }

  const activeSpace = plan?.spaces[plan.currentSpaceIndex] ?? null;
  let bestReturn: number | null = null;
  let currentBestSummary: string | null = null;
  const bestRef =
    job.checkpoint.bestPassedCandidate ?? job.checkpoint.bestCandidate;
  if (bestRef) {
    try {
      const trial = getSearchTrial(job.id, bestRef.iteration, options);
      const primary = trial?.windowResults?.[0];
      if (primary && typeof primary.totalReturn === "number") {
        bestReturn = primary.totalReturn as number;
      }
      if (trial?.params && Object.keys(trial.params).length > 0) {
        currentBestSummary = buildReadableStrategyIdentity(
          trial.params,
          trial.paramsHash,
          {
            includeSuffix: false,
            comboAware: true,
            symbol: job.config.symbols[0] ?? "BTCUSDT",
            timeframe: job.config.timeframe,
          },
        ).readableName;
      }
    } catch {
      /* legacy / missing trial */
    }
  }

  const terminal =
    job.status === "completed" ||
    job.status === "cancelled" ||
    job.status === "failed";
  const planActiveElapsed =
    plan?.campaignStartedAtMs != null ? activeElapsedMs(plan) : null;
  // Terminal jobs freeze on persisted plan.elapsedMs (same clock as progressRatio).
  const elapsedMs = terminal
    ? (plan?.elapsedMs ?? statistics?.elapsedMs ?? null)
    : plan?.campaignStartedAtMs != null
      ? planActiveElapsed
      : (plan?.elapsedMs ?? statistics?.elapsedMs ?? null);
  const remainingMs = terminal
    ? 0
    : plan?.maxRuntimeMs != null && elapsedMs != null
      ? Math.max(0, plan.maxRuntimeMs - elapsedMs)
      : (statistics?.remainingEstimateMs ?? null);
  const expectedCompletionAtMs = terminal
    ? null
    : (plan?.expectedCompletionAtMs ??
      (plan != null ? computeExpectedCompletionAtMs(plan) : null));

  return {
    id: job.id,
    status: job.status,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
    startedAt: job.startedAt,
    finishedAt: job.finishedAt,
    /** Flat timing for Dashboard / Research (canonical deadline fields). */
    elapsedMs,
    remainingMs,
    maxRuntimeMs: plan?.maxRuntimeMs ?? null,
    campaignStartedAtMs: plan?.campaignStartedAtMs ?? null,
    pausedAtMs: plan?.pausedAtMs ?? null,
    accumulatedPauseMs: plan?.accumulatedPauseMs ?? null,
    resumedAtMs: plan?.resumedAtMs ?? null,
    expectedCompletionAtMs: expectedCompletionAtMs ?? null,
    maxIterations: job.config.maxIterations,
    completedIterations: job.checkpoint.completedIterations,
    nextIteration: job.checkpoint.nextIteration,
    progressRatio: progressRatio(job, options),
    statistics,
    bestScore: job.checkpoint.bestCandidate?.score ?? null,
    bestCandidateHash: job.checkpoint.bestCandidate?.paramsHash ?? null,
    bestPassedCandidateHash:
      job.checkpoint.bestPassedCandidate?.paramsHash ?? null,
    failureMessage: job.failureMessage,
    terminationReason: resolveTerminationReason({
      status: job.status,
      completionReason: plan?.completionReason ?? null,
      failureMessage: job.failureMessage,
    }),
    executionActive: isSearchJobExecutionActive(job.id),
    searchVersion: job.config.searchVersion,
    symbols: [...job.config.symbols],
    timeframe: job.config.timeframe,
    seed: job.config.seed,
    searchSpaceExhausted,
    searchName: plan?.searchName ?? job.config.strategyTemplateId,
    depthProfile: plan?.depthProfile ?? null,
    qualificationProfile: plan?.qualificationProfile ?? null,
    qualifiedTarget: plan?.qualifiedTarget ?? null,
    // Never fall back to statistics.passed — that is total PASS trials, not target-qualified.
    qualifiedCount: plan?.qualifiedHashes.length ?? 0,
    uniqueEvaluatedCount:
      plan?.uniqueEvaluatedCount ?? statistics?.evaluated ?? null,
    duplicateSkippedCount:
      plan?.duplicateSkippedCount ?? statistics?.duplicates ?? null,
    exhaustedSpaceCount: plan?.exhaustedSpaceCount ?? null,
    completionReason: plan?.completionReason ?? null,
    candidateBudget: plan?.candidateBudget ?? job.config.maxIterations,
    promotionWarnings:
      plan?.promotions.filter((p) => p.status === "failed").length ?? null,
    currentSearchFamily: (() => {
      const comboFamilies =
        plan?.patternCombinationSpec?.blocks.map((b) => b.family) ??
        plan?.patternCombinationFamilies ??
        null;
      if (comboFamilies && comboFamilies.length > 1) {
        const spec =
          plan?.patternCombinationSpec ??
          (plan
            ? {
                version: 1 as const,
                templateId: "confluence" as const,
                operator: (plan.patternCombinationOperator ?? "and") as
                  | "and"
                  | "or"
                  | "sequence"
                  | "weighted_score"
                  | "priority",
                failurePolicy: "any" as const,
                invalidationMode: "any" as const,
                blocks: comboFamilies.map((family, order) => ({
                  id: `${family}_${order}`,
                  family: family as
                    | "order_block"
                    | "fvg"
                    | "trendline"
                    | "support_resistance"
                    | "supply_demand",
                  role: (order === 0 ? "entry_zone" : "trend_filter") as
                    | "entry_zone"
                    | "trend_filter",
                  order,
                  required: true,
                  weight: 1,
                  priority: order,
                  params: {},
                })),
              }
            : null);
        if (spec) {
          try {
            return combinationLabelKo(spec);
          } catch {
            return comboFamilies.join(" + ");
          }
        }
        return comboFamilies.join(" + ");
      }
      return activeSpace?.labelKo ?? null;
    })(),
    currentCombinationLabel: (() => {
      const comboFamilies =
        plan?.patternCombinationSpec?.blocks.map((b) => b.family) ??
        plan?.patternCombinationFamilies ??
        null;
      if (!comboFamilies || comboFamilies.length < 2) return null;
      if (plan?.patternCombinationSpec) {
        try {
          return combinationLabelKo(plan.patternCombinationSpec);
        } catch {
          return comboFamilies.join(" + ");
        }
      }
      return comboFamilies.join(" + ");
    })(),
    patternCombinationFamilies:
      plan?.patternCombinationSpec?.blocks.map((b) => b.family) ??
      plan?.patternCombinationFamilies ??
      null,
    patternCombinationOperator: plan?.patternCombinationOperator ?? null,
    searchStageIndex: plan ? plan.currentSpaceIndex + 1 : null,
    searchStageTotal: plan?.spaces.length ?? null,
    searchProgression: plan
      ? plan.spaces.map((s) => ({
          id: s.id,
          labelKo: s.labelKo,
          status: s.status,
          budgetAllocated: s.budgetAllocated ?? null,
          budgetSpent: s.budgetSpent ?? s.uniqueEvaluated ?? null,
          uniqueEvaluated: s.uniqueEvaluated ?? null,
        }))
      : null,
    bestReturn,
    currentBestSummary,
    remainingBudget: plan
      ? Math.max(0, plan.candidateBudget - plan.candidateBudgetUsed)
      : null,
    candidateBudgetUsed: plan?.candidateBudgetUsed ?? null,
    // Time-based progress for deadline jobs; never present budget as completion %.
    overallProgressPct: (() => {
      if (job.status === "completed") return 100;
      if (plan?.maxRuntimeMs != null && plan.maxRuntimeMs > 0) {
        const elapsed = elapsedMs ?? 0;
        return Math.min(
          100,
          Math.round((elapsed / plan.maxRuntimeMs) * 100),
        );
      }
      return null;
    })(),
    currentImprovementStage: activeSpace?.labelKo ?? null,
    familyBudgetRemaining: plan
      ? Math.max(
          0,
          (activeSpace?.budgetAllocated ?? 0) -
            (activeSpace?.budgetSpent ?? activeSpace?.uniqueEvaluated ?? 0),
        )
      : null,
    lastMutation: (() => {
      const mut = plan?.lastMutation;
      if (!mut || !Array.isArray(mut.mutations) || mut.mutations.length === 0) {
        return null;
      }
      const first = mut.mutations[0]!;
      return {
        appliedAt: mut.appliedAt,
        weaknessCategories: [...(mut.weaknessCategories ?? [])],
        mutationCount: mut.mutations.length,
        firstChange: {
          key: first.key,
          field: first.field,
          from: first.from,
          to: first.to,
          reason: first.reason,
        },
      };
    })(),
    counters: statistics
      ? deriveCanonicalCounters(statistics)
      : null,
    initialCandidateBudget: plan?.initialCandidateBudget ?? null,
    resourceSafetyCeiling: SAFETY_BUDGET_CEILING,
    outcomePresentation: (() => {
      if (
        job.status === "running" ||
        job.status === "pause_requested" ||
        job.status === "queued"
      ) {
        return "running";
      }
      if (job.status === "paused") return "user_stopped";
      if (job.status === "cancelled" || job.status === "cancel_requested") {
        return "cancelled";
      }
      if (job.status === "completed") return "completed";
      if (job.status === "failed") {
        const preserved = plan?.qualifiedHashes.length ?? statistics?.passed ?? 0;
        return preserved > 0 ? "partial_completed" : "failed";
      }
      return null;
    })(),
    candidatesPreserved:
      job.status === "failed" &&
      (plan?.qualifiedHashes.length ?? statistics?.passed ?? 0) > 0,
    preservedCandidateCount:
      plan?.qualifiedHashes.length ?? statistics?.passed ?? 0,
    retryable: (() => {
      if (job.status === "paused") return true;
      if (job.status !== "failed") return false;
      const msg = (job.failureMessage ?? "").toLowerCase();
      // Proven recoverable generation failures (OUT_OF_RANGE after mutation).
      if (
        msg.includes("candidate validation failed") ||
        msg.includes("out_of_range") ||
        msg.includes("validation_failed")
      ) {
        return true;
      }
      const classified = classifyEngineError(
        new Error(job.failureMessage ?? "engine error"),
        "candidate_generation",
      );
      return classified.retryable && classified.class !== "fatal_engine_error";
    })(),
    failedStage: (() => {
      if (job.status !== "failed" || !plan) return null;
      const active = plan.spaces[plan.currentSpaceIndex];
      return active?.labelKo ?? active?.id ?? null;
    })(),
    lastSuccessfulStage: (() => {
      if (!plan) return null;
      const done = [...plan.spaces]
        .reverse()
        .find((s) => s.status === "completed" || s.status === "exhausted");
      return done?.labelKo ?? done?.id ?? null;
    })(),
    terminationDetail: job.failureMessage,
    symbolSelection: plan?.symbolSelection ?? null,
    currentBestRisk: (() => {
      if (!bestRef) {
        return {
          netReturn: null,
          maxDrawdown: null,
          tradeCount: null,
          totalCost: null,
          profitFactor: null,
          robustnessStatus: "검증 대기",
          overfittingRisk: "검증 대기",
          eligibilityStatus: "추천 불가",
          recommendable: false,
        };
      }
      try {
        const trial = getSearchTrial(job.id, bestRef.iteration, options);
        const primary = trial?.windowResults?.[0] as
          | {
              totalReturn?: number;
              mdd?: number;
              trades?: number;
              profitFactor?: number;
              totalCost?: number;
            }
          | undefined;
        const stressOk =
          (trial?.costStressResults?.length ?? 0) > 0 &&
          (trial?.costStressResults ?? []).every((r) => r.passed);
        const jitterOk =
          (trial?.jitterResults?.length ?? 0) === 0
            ? null
            : (trial?.jitterResults ?? []).every((r) => r.passed);
        const hasRisk =
          primary != null &&
          typeof primary.mdd === "number" &&
          typeof primary.trades === "number";
        const recommendable = bestRef.passed === true && hasRisk && stressOk;
        return {
          netReturn:
            typeof primary?.totalReturn === "number" ? primary.totalReturn : null,
          maxDrawdown: typeof primary?.mdd === "number" ? primary.mdd : null,
          tradeCount: typeof primary?.trades === "number" ? primary.trades : null,
          totalCost:
            typeof primary?.totalCost === "number" ? primary.totalCost : null,
          profitFactor:
            typeof primary?.profitFactor === "number"
              ? primary.profitFactor
              : null,
          robustnessStatus: !hasRisk
            ? "검증 대기"
            : stressOk
              ? "거래 안정성 통과"
              : "거래 안정성 미통과",
          overfittingRisk:
            jitterOk == null
              ? "검증 대기"
              : jitterOk
                ? "낮음"
                : "높음",
          eligibilityStatus: recommendable ? "검토 가능" : "추천 불가",
          recommendable,
        };
      } catch {
        return {
          netReturn: bestReturn,
          maxDrawdown: null,
          tradeCount: null,
          totalCost: null,
          profitFactor: null,
          robustnessStatus: "검증 대기",
          overfittingRisk: "검증 대기",
          eligibilityStatus: "추천 불가",
          recommendable: false,
        };
      }
    })(),
    liveTop10: (() => {
      const snap = getResearchTop10(job.id, options);
      if (!snap) return null;
      // Hard jobId boundary: never surface another Research Job's shortlist.
      if (snap.jobId && snap.jobId !== job.id) return null;
      const mapEntry = (e: (typeof snap.entries)[number]) => {
        if (
          e.sourceResearchJobId &&
          e.sourceResearchJobId !== job.id
        ) {
          return null;
        }
        const changeRow = snap.rankChanges.find(
          (c) => c.strategyHash === e.strategyHash,
        );
        const change = changeRow?.change ?? "순위 유지";
        const prev =
          snap.previousEntries?.find((p) => p.strategyHash === e.strategyHash) ??
          null;
        return {
          rank: e.rank,
          previousRank: changeRow?.previousRank ?? prev?.rank ?? null,
          displayAlias: e.displayAlias,
          readableName: e.readableName,
          strategyFamily: e.strategyFamily,
          strategyHash: e.strategyHash,
          netReturn: e.netReturn,
          maxDrawdown: e.maxDrawdown,
          tradeCount: e.tradeCount,
          profitFactor: e.profitFactor,
          winRate: e.winRate ?? null,
          sharpe: e.sharpe ?? null,
          patternStack: e.patternStack ?? e.strategyFamily ?? "—",
          confidence: e.confidence ?? e.sampleConfidence,
          risk: e.risk ?? e.overfittingRisk,
          miniSeries: Array.isArray(e.miniSeries)
            ? e.miniSeries.slice(0, 30)
            : null,
          score: e.score ?? null,
          previousNetReturn: prev?.netReturn ?? null,
          previousMaxDrawdown: prev?.maxDrawdown ?? null,
          previousTradeCount: prev?.tradeCount ?? null,
          previousScore: prev?.score ?? null,
          costStatus: e.costStatus,
          robustnessStatus: e.robustnessStatus,
          sampleConfidence: e.sampleConfidence,
          leverageLabel: e.leverageLabel ?? "—",
          rankReason: e.rankReason,
          rankChange: change,
          rankChangeShort: rankChangeLabelShort(change),
          movementReasonKo:
            e.movementReasonKo ||
            changeRow?.movementReasonKo ||
            "",
          roleBadges: [...e.roleBadges],
          eligibilityStatus: e.eligibilityStatus,
          recommendable: e.recommendable,
          registrationState: e.registrationState,
          overfittingRisk: e.overfittingRisk,
        };
      };
      const entries = snap.entries
        .map(mapEntry)
        .filter((e): e is NonNullable<typeof e> => e != null);
      const finalEntries = (snap.finalEntries ?? [])
        .map(mapEntry)
        .filter((e): e is NonNullable<typeof e> => e != null);
      return {
        updatedAt: snap.updatedAt,
        finalizedAt: snap.finalizedAt ?? null,
        phase: snap.phase ?? (snap.finalizedAt ? "final" : "live"),
        entries,
        finalEntries,
        finalVsLive: (snap.finalVsLive ?? []).map((d) => ({
          strategyHash: d.strategyHash,
          liveRank: d.liveRank,
          finalRank: d.finalRank,
          exclusionReasonKo: d.exclusionReasonKo,
        })),
      };
    })(),
  };
}

function detailJob(
  job: StrategySearchJob,
  options?: StrategySearchStoreOptions,
): StrategySearchJobDetail {
  const summary = summarizeJob(job, options);
  let hasRunnerPayload = false;
  try {
    hasRunnerPayload = readRunnerPayloadFromCheckpoint(job.checkpoint) != null;
  } catch {
    hasRunnerPayload = false;
  }
  return {
    ...summary,
    config: {
      searchVersion: job.config.searchVersion,
      strategyTemplateId: job.config.strategyTemplateId,
      symbols: [...job.config.symbols],
      timeframe: job.config.timeframe,
      dataVersion: job.config.dataVersion,
      seed: job.config.seed,
      generatorType: job.config.generatorType,
      maxIterations: job.config.maxIterations,
      parameterRangeKeys: job.config.parameterRanges.map((r) => r.key),
      evaluationWindowIds: job.config.evaluationWindows.map((w) => w.id),
    },
    checkpoint: {
      completedIterations: job.checkpoint.completedIterations,
      nextIteration: job.checkpoint.nextIteration,
      bestCandidate: job.checkpoint.bestCandidate
        ? { ...job.checkpoint.bestCandidate }
        : null,
      bestPassedCandidate: job.checkpoint.bestPassedCandidate
        ? { ...job.checkpoint.bestPassedCandidate }
        : null,
      updatedAt: job.checkpoint.updatedAt,
      hasRunnerPayload,
    },
    appliedSearchSummary: buildPersistedSearchSummary(job.id, options),
  };
}

export function createStrategySearchJobApi(
  body: unknown,
  options?: StrategySearchStoreOptions,
): StrategySearchJobDetail {
  try {
    const store = resolveStore(options);
    const validated = validateCreateSearchJobBody(body);
    let config = validated.config;
    if (validated.operatorPlan) {
      const depthSpaces = resolveSpacesForDepth(validated.operatorPlan.depthProfile);
      let effectiveSpaces = resolveSelectedSearchSpaces(
        validated.operatorPlan.selectedSpaceIds,
        depthSpaces.map((s) => s.id),
      );
      // Combined-pattern jobs search the entry-zone family once; combination
      // identity is injected into every candidate via the plan.
      const comboFamilies =
        (validated.operatorPlan.patternCombinationSpec?.blocks.map(
          (block) => block.family,
        ) ??
          validated.operatorPlan.patternCombinationFamilies)?.filter(
          (f): f is string => typeof f === "string" && f.length > 0,
        ) ?? [];
      if (comboFamilies.length > 1) {
        const entryId = comboFamilies[0]!;
        const entrySpace = getSearchSpaceById(entryId);
        if (entrySpace) {
          effectiveSpaces = [entrySpace];
        }
      }
      const first = effectiveSpaces[0];
      if (first) {
        const spaceDef = getSearchSpaceById(first.id);
        if (spaceDef) {
          config = {
            ...config,
            parameterRanges: rangesForSpace(spaceDef),
            maxIterations: Math.min(
              validated.operatorPlan.stageBatchSize,
              validated.operatorPlan.candidateBudget,
            ),
          };
        }
      }
    }
    const job = createSearchJob(config, store);
    // Jitter ranges must match the search space. The UI/API create body uses a
    // SafeV44 placeholder (ema_fast); leaving it causes every pattern candidate
    // to fail jitter with UNKNOWN_PARAMETER and zero qualification.
    const execution = {
      ...validated.execution,
      jitterConfig: {
        ...validated.execution.jitterConfig,
        parameterRanges: config.parameterRanges.map((r) => ({ ...r })),
      },
    };
    saveJobExecutionProfile(job.id, execution, store);
    if (validated.operatorPlan) {
      const depthSpaces = resolveSpacesForDepth(validated.operatorPlan.depthProfile);
      let effectiveSpaces = resolveSelectedSearchSpaces(
        validated.operatorPlan.selectedSpaceIds,
        depthSpaces.map((s) => s.id),
      );
      const comboFamilies =
        (validated.operatorPlan.patternCombinationSpec?.blocks.map(
          (block) => block.family,
        ) ??
          validated.operatorPlan.patternCombinationFamilies)?.filter(
          (f): f is string => typeof f === "string" && f.length > 0,
        ) ?? [];
      if (comboFamilies.length > 1) {
        const entryId = comboFamilies[0]!;
        const entrySpace = getSearchSpaceById(entryId);
        if (entrySpace) {
          effectiveSpaces = [entrySpace];
        }
      }
      const selectedSymbol = config.symbols[0] ?? "BTCUSDT";
      const marketMode =
        (body as { marketMode?: string } | null)?.marketMode === "manual"
          ? "manual"
          : "recommended";
      saveSearchPlan(
        job.id,
        createEmptySearchPlan({
          searchName: validated.operatorPlan.searchName,
          depthProfile: validated.operatorPlan.depthProfile,
          qualificationProfile: validated.operatorPlan.qualificationProfile,
          qualifiedTarget: validated.operatorPlan.qualifiedTarget,
          stopWhenQualifiedTarget:
            validated.operatorPlan.stopWhenQualifiedTarget === true,
          candidateBudget: validated.operatorPlan.candidateBudget,
          stageBatchSize: validated.operatorPlan.stageBatchSize,
          maxRuntimeMs: validated.operatorPlan.maxRuntimeMs,
          spaces: effectiveSpaces.map((s) => ({ id: s.id, labelKo: s.labelKo })),
          minScore: validated.operatorPlan.minScore,
          symbolSelection: buildSymbolSelectionEvidence({
            mode: marketMode,
            selectedSymbol,
          }),
          errorWarningRate: validated.operatorPlan.errorWarningRate,
          errorAutoPauseRate: validated.operatorPlan.errorAutoPauseRate,
          repeatedSignatureThreshold:
            validated.operatorPlan.repeatedSignatureThreshold,
          leverageMode: validated.operatorPlan.leverageMode,
          leverageFixed: validated.operatorPlan.leverageFixed,
          leverageMin: validated.operatorPlan.leverageMin,
          leverageMax: validated.operatorPlan.leverageMax,
          adaptiveLeverageEnabled:
            validated.operatorPlan.adaptiveLeverageEnabled,
          patternConfigLevel: validated.operatorPlan.patternConfigLevel,
          patternDirection: validated.operatorPlan.patternDirection,
          patternRetestMode: validated.operatorPlan.patternRetestMode,
          patternConfirmStrength: validated.operatorPlan.patternConfirmStrength,
          patternConfirmClose: validated.operatorPlan.patternConfirmClose,
          patternConfirmationMode:
            validated.operatorPlan.patternConfirmationMode,
          patternConfirmationCandleCount:
            validated.operatorPlan.patternConfirmationCandleCount,
          patternConfirmationWindow:
            validated.operatorPlan.patternConfirmationWindow,
          patternExpiryBars: validated.operatorPlan.patternExpiryBars,
          patternRiskStyle: validated.operatorPlan.patternRiskStyle,
          patternStrength: validated.operatorPlan.patternStrength,
          patternSrSensitivity: validated.operatorPlan.patternSrSensitivity,
          patternCombinationTemplate:
            validated.operatorPlan.patternCombinationTemplate,
          patternCombinationOperator:
            validated.operatorPlan.patternCombinationOperator,
          patternCombinationInvalidationMode:
            validated.operatorPlan.patternCombinationInvalidationMode,
          patternCombinationFamilies:
            validated.operatorPlan.patternCombinationFamilies,
          patternCombinationSpec:
            validated.operatorPlan.patternCombinationSpec,
        }),
        store,
      );
    }
    // Retention runs only after the new job is fully persisted.
    // Cleanup failures are non-fatal and never roll back this create.
    runHistoryRetentionAfterCreate(store);
    // Canonical create contract: return only after job + plan read-back succeed.
    const readBack = getSearchJob(job.id, store);
    if (!readBack) {
      throw new StrategySearchApiError(
        "INTERNAL_EXECUTION_FAILURE",
        `strategy-search create read-back failed for job ${job.id}`,
        500,
      );
    }
    if (validated.operatorPlan) {
      const planReadBack = getSearchPlan(job.id, store);
      if (!planReadBack) {
        throw new StrategySearchApiError(
          "INTERNAL_EXECUTION_FAILURE",
          `strategy-search plan read-back failed for job ${job.id}`,
          500,
        );
      }
    }
    return detailJob(readBack, store);
  } catch (err) {
    mapCaught(err);
  }
}

export function listStrategySearchJobsApi(
  options?: StrategySearchStoreOptions & {
    /** Default: newest 20. Pass a larger value only for pagination. */
    limit?: number | null;
    offset?: number | null;
    /** When false (default), archived jobs are hidden from history lists. */
    includeArchived?: boolean;
    /** When true, only archived (non-restored) jobs are returned. */
    archivedOnly?: boolean;
  },
): StrategySearchJobSummary[] {
  const offsetRaw = options?.offset;
  const limitRaw = options?.limit;
  // Strip pagination keys so resolveStore can fall back to test rootDir.
  const store = resolveStore(
    options?.rootDir != null ? { rootDir: options.rootDir } : undefined,
  );
  const offset = Math.max(
    0,
    offsetRaw == null || !Number.isFinite(offsetRaw)
      ? 0
      : Math.trunc(offsetRaw),
  );
  const limit = Math.max(
    1,
    Math.min(
      100,
      limitRaw == null || !Number.isFinite(limitRaw)
        ? STRATEGY_SEARCH_HISTORY_VISIBLE_DEFAULT
        : Math.trunc(limitRaw),
    ),
  );

  let sourceJobs: StrategySearchJob[];
  if (options?.archivedOnly) {
    const archivedIds = new Set(
      listArchivedResearchJobs(store).map((r) => r.jobId),
    );
    sourceJobs = listSearchJobs(store).filter((j) => archivedIds.has(j.id));
  } else if (options?.includeArchived) {
    sourceJobs = listSearchJobs(store);
  } else {
    sourceJobs = listVisibleResearchJobs(store);
  }

  return sourceJobs
    .slice()
    .sort(compareJobsNewestFirst)
    .slice(offset, offset + limit)
    .map((job) => ({
      ...summarizeJob(job, store),
      isArchived: isJobArchived(job.id, store),
    }));
}

export function deleteStrategySearchJobApi(
  jobId: string,
  options?: StrategySearchStoreOptions,
): { deleted: true; jobId: string } {
  try {
    const store = resolveStore(options);
    return executeResearchJobDeletion(jobId, store);
  } catch (err) {
    if (err instanceof ResearchJobDeletionError) {
      throw new StrategySearchApiError(
        err.code === "protected" ? "INVALID_STATE" : "INVALID_STATE",
        err.message,
        409,
        err.preview.reasonsKo,
      );
    }
    const code = (err as { code?: ManualDeleteBlockReason }).code;
    if (code) {
      throw new StrategySearchApiError(
        code === "not_found" ? "JOB_NOT_FOUND" : "INVALID_STATE",
        manualDeleteBlockMessageKo(code),
        code === "not_found" ? 404 : 409,
      );
    }
    mapCaught(err);
  }
}

export function restoreStrategySearchJobApi(
  jobId: string,
  options?: StrategySearchStoreOptions,
): { restored: true; jobId: string } {
  try {
    const store = resolveStore(options);
    if (!isJobArchived(jobId, store)) {
      throw new StrategySearchApiError(
        "INVALID_STATE",
        "보관된 작업이 아닙니다.",
        409,
      );
    }
    restoreArchivedResearchJob(jobId, store);
    return { restored: true, jobId };
  } catch (err) {
    if (err instanceof StrategySearchApiError) throw err;
    if (err instanceof Error && err.message.includes("not found")) {
      throw new StrategySearchApiError("JOB_NOT_FOUND", err.message, 404);
    }
    mapCaught(err);
  }
}

export function getStrategySearchJobApi(
  jobId: string,
  options?: StrategySearchStoreOptions,
): StrategySearchJobDetail {
  try {
    const store = resolveStore(options);
    return detailJob(requireJob(jobId, store), store);
  } catch (err) {
    mapCaught(err);
  }
}

export function startStrategySearchJobApi(
  jobId: string,
  deps: SearchJobExecutionDeps = {},
): StrategySearchJobDetail {
  try {
    const store = resolveStore(deps.storeOptions);
    const merged: SearchJobExecutionDeps = { ...deps, storeOptions: store };
    const job = requireJob(jobId, store);
    if (isSearchJobExecutionActive(jobId)) {
      throw new StrategySearchApiError(
        "JOB_ALREADY_RUNNING",
        `strategy-search job already running: ${jobId}`,
        409,
      );
    }
    if (job.status !== "queued" && job.status !== "running") {
      throw new StrategySearchApiError(
        "INVALID_STATE",
        `cannot start strategy-search job in status: ${job.status}`,
        409,
      );
    }
    if (!getJobExecutionProfile(jobId, store)) {
      throw new StrategySearchApiError(
        "MISSING_EXECUTION_PROFILE",
        `execution profile missing for job: ${jobId}`,
        500,
      );
    }
    startSearchJobExecution(jobId, merged);
    const latest = requireJob(jobId, store);
    return detailJob(latest, store);
  } catch (err) {
    mapCaught(err);
  }
}

export function pauseStrategySearchJobApi(
  jobId: string,
  options?: StrategySearchStoreOptions,
): StrategySearchJobDetail {
  try {
    const store = resolveStore(options);
    const job = requireJob(jobId, store);
    if (job.status !== "running" && job.status !== "pause_requested") {
      throw new StrategySearchApiError(
        "INVALID_STATE",
        `cannot pause strategy-search job in status: ${job.status}`,
        409,
      );
    }
    requestSearchJobPause(jobId, store);
    const plan = getSearchPlan(jobId, store);
    if (plan) {
      saveSearchPlan(jobId, markPlanPaused(plan), store);
    }
    return detailJob(requireJob(jobId, store), store);
  } catch (err) {
    mapCaught(err);
  }
}

export function resumeStrategySearchJobApi(
  jobId: string,
  deps: SearchJobExecutionDeps = {},
): StrategySearchJobDetail {
  try {
    const store = resolveStore(deps.storeOptions);
    const merged: SearchJobExecutionDeps = { ...deps, storeOptions: store };
    const job = requireJob(jobId, store);
    if (isSearchJobExecutionActive(jobId)) {
      throw new StrategySearchApiError(
        "JOB_ALREADY_RUNNING",
        `strategy-search job already running: ${jobId}`,
        409,
      );
    }
    if (job.status !== "paused" && job.status !== "failed") {
      throw new StrategySearchApiError(
        "INVALID_STATE",
        `cannot resume strategy-search job in status: ${job.status}`,
        409,
      );
    }
    if (job.status === "failed") {
      const detail = detailJob(job, store);
      if (!detail.retryable) {
        throw new StrategySearchApiError(
          "INVALID_STATE",
          "이 실패는 안전하게 재시도할 수 없습니다.",
          409,
        );
      }
      // Clear failure and reopen as queued; preserve trials/checkpoint.
      transitionJobToQueued(jobId, store);
      const planFailed = getSearchPlan(jobId, store);
      if (planFailed) {
        saveSearchPlan(
          jobId,
          {
            ...markPlanResumed({ ...planFailed, completionReason: null }),
            // Drop collapsed mutated ranges so retry uses a healthy domain.
            mutatedParameterRanges: null,
            lastMutation: null,
          },
          store,
        );
      }
      startSearchJobExecution(jobId, merged);
      return detailJob(requireJob(jobId, store), store);
    }
    const plan = getSearchPlan(jobId, store);
    if (plan) {
      saveSearchPlan(jobId, markPlanResumed(plan), store);
    }
    resumeSearchJobForRun(jobId, store);
    startSearchJobExecution(jobId, merged);
    return detailJob(requireJob(jobId, store), store);
  } catch (err) {
    mapCaught(err);
  }
}

export function cancelStrategySearchJobApi(
  jobId: string,
  options?: StrategySearchStoreOptions,
): StrategySearchJobDetail {
  try {
    const store = resolveStore(options);
    const job = requireJob(jobId, store);
    if (
      job.status === "completed" ||
      job.status === "cancelled" ||
      job.status === "failed"
    ) {
      throw new StrategySearchApiError(
        "INVALID_STATE",
        `cannot cancel strategy-search job in terminal status: ${job.status}`,
        409,
      );
    }
    // Cooperative cancel + immediate finalize when no active worker owns the job.
    // Prevents paused/orphaned jobs from sticking in cancel_requested forever.
    requestCancelWithFinalization(jobId, store);
    return detailJob(requireJob(jobId, store), store);
  } catch (err) {
    mapCaught(err);
  }
}

export function listStrategySearchTrialsApi(
  jobId: string,
  query: { limit?: number; offset?: number; passedOnly?: boolean },
  options?: StrategySearchStoreOptions,
): {
  jobId: string;
  total: number;
  limit: number;
  offset: number;
  trials: Array<{
    iteration: number;
    candidateId: string;
    paramsHash: string;
    score: number | null;
    passed: boolean;
    generatorType: StrategySearchTrial["generatorType"];
    durationMs: number;
    failureReasonCodes: string[];
    /** Additive operator fields — never fabricated client-side. */
    readableName?: string | null;
    strategyFamilyLabelKo?: string | null;
    totalReturn?: number | null;
    mdd?: number | null;
    trades?: number | null;
    winRate?: number | null;
    sharpe?: number | null;
    profitFactor?: number | null;
    stressPassed?: boolean | null;
    jitterPassed?: boolean | null;
    jitterEnabled?: boolean | null;
    params?: Record<string, unknown> | null;
    registeredStrategyId?: string | null;
    registrationState?:
      | "not_registered"
      | "registered"
      | "duplicate"
      | null;
  }>;
} {
  try {
    const store = resolveStore(options);
    const job = requireJob(jobId, store);
    const limitRaw = query.limit ?? DEFAULT_TRIAL_LIMIT;
    const offsetRaw = query.offset ?? 0;
    const limit = Math.min(
      MAX_TRIAL_LIMIT,
      Math.max(
        1,
        Number.isFinite(limitRaw) ? Math.floor(limitRaw) : DEFAULT_TRIAL_LIMIT,
      ),
    );
    const offset = Math.max(
      0,
      Number.isFinite(offsetRaw) ? Math.floor(offsetRaw) : 0,
    );

    let trials = listSearchTrials(jobId, store).sort(
      (a, b) => a.iteration - b.iteration,
    );
    if (query.passedOnly) {
      trials = trials.filter((t) => t.passed);
    }
    const total = trials.length;
    const strategies = listStrategies();
    const byHash = new Map(
      strategies.filter((s) => !s.locked).map((s) => [s.paramsHash, s.id]),
    );
    const jitterEnabled = job.config.jitter?.enabled ?? null;
    const page = trials.slice(offset, offset + limit).map((t) => {
      const primary = t.windowResults?.[0] as Record<string, unknown> | undefined;
      const identity =
        t.params && Object.keys(t.params).length > 0
          ? buildReadableStrategyIdentity(t.params, t.paramsHash, {
              includeSuffix: false,
            })
          : null;
      const registeredId = byHash.get(t.paramsHash) ?? null;
      const stressPassed =
        Array.isArray(t.costStressResults) && t.costStressResults.length > 0
          ? t.costStressResults.every(
              (r) => (r as { passed?: boolean }).passed !== false,
            )
          : null;
      const jitterPassed =
        jitterEnabled === false
          ? null
          : Array.isArray(t.jitterResults) && t.jitterResults.length > 0
            ? t.jitterResults.every(
                (r) => (r as { passed?: boolean }).passed !== false,
              )
            : null;
      return {
        iteration: t.iteration,
        candidateId: t.candidateId,
        paramsHash: t.paramsHash,
        score: t.score,
        passed: t.passed,
        generatorType: t.generatorType,
        durationMs: t.durationMs,
        failureReasonCodes: t.failureReasons.map((f) => f.code),
        readableName: identity?.readableName ?? null,
        strategyFamilyLabelKo: identity
          ? identity.readableName.split(" · ")[0] ?? identity.strategyTypeLabelKo
          : null,
        totalReturn:
          typeof primary?.totalReturn === "number"
            ? (primary.totalReturn as number)
            : null,
        mdd: typeof primary?.mdd === "number" ? (primary.mdd as number) : null,
        trades:
          typeof primary?.trades === "number"
            ? (primary.trades as number)
            : null,
        winRate:
          typeof primary?.winRate === "number"
            ? (primary.winRate as number)
            : null,
        sharpe:
          typeof primary?.sharpe === "number"
            ? (primary.sharpe as number)
            : null,
        profitFactor:
          typeof primary?.profitFactor === "number"
            ? (primary.profitFactor as number)
            : null,
        stressPassed,
        jitterPassed,
        jitterEnabled,
        params: t.params ? { ...t.params } : null,
        registeredStrategyId: registeredId,
        registrationState: registeredId
          ? ("registered" as const)
          : ("not_registered" as const),
      };
    });
    return { jobId, total, limit, offset, trials: page };
  } catch (err) {
    mapCaught(err);
  }
}

export function getStrategySearchBestApi(
  jobId: string,
  options?: StrategySearchStoreOptions,
): StrategySearchBestResultResponse {
  try {
    const store = resolveStore(options);
    const job = requireJob(jobId, store);
    const best = job.checkpoint.bestCandidate
      ? { ...job.checkpoint.bestCandidate }
      : null;
    const bestPassed = job.checkpoint.bestPassedCandidate
      ? { ...job.checkpoint.bestPassedCandidate }
      : null;

    const bestTrial =
      best != null ? getSearchTrial(jobId, best.iteration, store) : null;
    const bestPassedTrial =
      bestPassed != null
        ? getSearchTrial(jobId, bestPassed.iteration, store)
        : null;

    return {
      bestCandidate: best,
      bestPassedCandidate: bestPassed,
      bestTrial: bestTrial
        ? {
            ...bestTrial,
            params: { ...bestTrial.params },
            failureReasons: bestTrial.failureReasons.map((f) => ({ ...f })),
            windowResults: bestTrial.windowResults.map((w) => ({ ...w })),
            costStressResults: bestTrial.costStressResults.map((r) => ({
              ...r,
            })),
            jitterResults: bestTrial.jitterResults.map((r) => ({ ...r })),
            parentCandidateIds: [...bestTrial.parentCandidateIds],
          }
        : null,
      bestPassedTrial: bestPassedTrial
        ? {
            ...bestPassedTrial,
            params: { ...bestPassedTrial.params },
            failureReasons: bestPassedTrial.failureReasons.map((f) => ({
              ...f,
            })),
            windowResults: bestPassedTrial.windowResults.map((w) => ({
              ...w,
            })),
            costStressResults: bestPassedTrial.costStressResults.map((r) => ({
              ...r,
            })),
            jitterResults: bestPassedTrial.jitterResults.map((r) => ({
              ...r,
            })),
            parentCandidateIds: [...bestPassedTrial.parentCandidateIds],
          }
        : null,
      gateNotes: {
        bestCandidatePassedFinal: best?.passed ?? null,
        bestPassedCandidatePassedFinal: bestPassed?.passed ?? null,
        finalPassMeaning:
          "trial.passed / bestPassedCandidate means final PASS (base ∧ cost-stress ∧ jitter)",
      },
    };
  } catch (err) {
    mapCaught(err);
  }
}

/** Assert SAFE strategy file bytes for API tests / safeguards. */
export function readProtectedSafeSnapshot(): {
  path: string;
  bytes: Buffer;
  name: string;
  paramsHash: string;
} {
  const safePath = path.join(
    /* turbopackIgnore: true */ process.cwd(),
    "data",
    "strategies",
    "SAFE_v44_i4060.json",
  );
  const bytes = fs.readFileSync(safePath);
  const json = JSON.parse(bytes.toString("utf8")) as {
    name: string;
    params_hash: string;
  };
  return {
    path: safePath,
    bytes,
    name: json.name,
    paramsHash: json.params_hash,
  };
}
