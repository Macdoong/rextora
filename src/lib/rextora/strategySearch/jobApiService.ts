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
  createEmptySearchPlan,
  getSearchPlan,
  saveSearchPlan,
} from "./searchPlan";
import { resolveSpacesForDepth } from "./operatorProfiles";
import { getSearchSpaceById, rangesForSpace } from "./searchSpaces";
import { listStrategies } from "../strategy/strategyStore";
import { buildReadableStrategyIdentity } from "./readableStrategyName";
import {
  STRATEGY_SEARCH_HISTORY_VISIBLE_DEFAULT,
  compareJobsNewestFirst,
  deleteSearchJobIfAllowed,
  manualDeleteBlockMessageKo,
  runHistoryRetentionAfterCreate,
  type ManualDeleteBlockReason,
} from "./historyRetention";
import {
  StrategySearchJobRunnerError,
  requestSearchJobCancel,
  requestSearchJobPause,
  resumeSearchJobForRun,
} from "./jobRunner";
import {
  StrategySearchJobStateError,
} from "./jobState";
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
  /** Short label for current best strategy when known. */
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
    if (err.code === "ALREADY_RUNNING") {
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
    const job = getSearchJob(jobId, options);
    if (!job) {
      throw new StrategySearchApiError(
        "JOB_NOT_FOUND",
        `strategy-search job not found: ${jobId}`,
        404,
      );
    }
    return job;
  } catch (err) {
    if (
      err instanceof StrategySearchPersistenceError &&
      err.code === "INVALID_IDENTIFIER"
    ) {
      throw new StrategySearchApiError("JOB_NOT_FOUND", err.message, 404);
    }
    throw err;
  }
}

function progressRatio(job: StrategySearchJob): number | null {
  const max = job.config.maxIterations;
  if (max == null || max <= 0) return null;
  return Math.min(1, job.checkpoint.completedIterations / max);
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
          { includeSuffix: false },
        ).readableName;
      }
    } catch {
      /* legacy / missing trial */
    }
  }

  return {
    id: job.id,
    status: job.status,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
    startedAt: job.startedAt,
    finishedAt: job.finishedAt,
    maxIterations: job.config.maxIterations,
    completedIterations: job.checkpoint.completedIterations,
    nextIteration: job.checkpoint.nextIteration,
    progressRatio: progressRatio(job),
    statistics,
    bestScore: job.checkpoint.bestCandidate?.score ?? null,
    bestCandidateHash: job.checkpoint.bestCandidate?.paramsHash ?? null,
    bestPassedCandidateHash:
      job.checkpoint.bestPassedCandidate?.paramsHash ?? null,
    failureMessage: job.failureMessage,
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
    qualifiedCount: plan?.qualifiedHashes.length ?? statistics?.passed ?? null,
    uniqueEvaluatedCount:
      plan?.uniqueEvaluatedCount ?? statistics?.evaluated ?? null,
    duplicateSkippedCount:
      plan?.duplicateSkippedCount ?? statistics?.duplicates ?? null,
    exhaustedSpaceCount: plan?.exhaustedSpaceCount ?? null,
    completionReason: plan?.completionReason ?? null,
    candidateBudget: plan?.candidateBudget ?? job.config.maxIterations,
    promotionWarnings:
      plan?.promotions.filter((p) => p.status === "failed").length ?? null,
    currentSearchFamily: activeSpace?.labelKo ?? null,
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
    overallProgressPct: plan
      ? Math.min(
          100,
          Math.round(
            (plan.candidateBudgetUsed / Math.max(1, plan.candidateBudget)) *
              100,
          ),
        )
      : null,
    currentImprovementStage: activeSpace?.labelKo ?? null,
    familyBudgetRemaining: plan
      ? Math.max(
          0,
          (activeSpace?.budgetAllocated ?? 0) -
            (activeSpace?.budgetSpent ?? activeSpace?.uniqueEvaluated ?? 0),
        )
      : null,
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
      const spaces = resolveSpacesForDepth(validated.operatorPlan.depthProfile);
      const first = spaces[0];
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
    saveJobExecutionProfile(job.id, validated.execution, store);
    if (validated.operatorPlan) {
      const spaces = resolveSpacesForDepth(validated.operatorPlan.depthProfile);
      saveSearchPlan(
        job.id,
        createEmptySearchPlan({
          searchName: validated.operatorPlan.searchName,
          depthProfile: validated.operatorPlan.depthProfile,
          qualificationProfile: validated.operatorPlan.qualificationProfile,
          qualifiedTarget: validated.operatorPlan.qualifiedTarget,
          candidateBudget: validated.operatorPlan.candidateBudget,
          stageBatchSize: validated.operatorPlan.stageBatchSize,
          maxRuntimeMs: validated.operatorPlan.maxRuntimeMs,
          spaces: spaces.map((s) => ({ id: s.id, labelKo: s.labelKo })),
          minScore: validated.operatorPlan.minScore,
        }),
        store,
      );
    }
    // Retention runs only after the new job is fully persisted.
    // Cleanup failures are non-fatal and never roll back this create.
    runHistoryRetentionAfterCreate(store);
    return detailJob(job, store);
  } catch (err) {
    mapCaught(err);
  }
}

export function listStrategySearchJobsApi(
  options?: StrategySearchStoreOptions & {
    /** Default: newest 20. Pass a larger value only for pagination. */
    limit?: number | null;
    offset?: number | null;
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
  return listSearchJobs(store)
    .slice()
    .sort(compareJobsNewestFirst)
    .slice(offset, offset + limit)
    .map((job) => summarizeJob(job, store));
}

export function deleteStrategySearchJobApi(
  jobId: string,
  options?: StrategySearchStoreOptions,
): { deleted: true; jobId: string } {
  try {
    const store = resolveStore(options);
    return deleteSearchJobIfAllowed(jobId, store);
  } catch (err) {
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
    if (job.status !== "paused") {
      throw new StrategySearchApiError(
        "INVALID_STATE",
        `cannot resume strategy-search job in status: ${job.status}`,
        409,
      );
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
    if (job.status === "cancel_requested") {
      return detailJob(job, store);
    }
    requestSearchJobCancel(jobId, store);
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
