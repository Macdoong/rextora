/**
 * Strategy-search job execution engine (Phase 5).
 *
 * Flow per iteration:
 *   generate → evaluate → store trial → update stats/best → checkpoint → continue
 *
 * Reuses Phase 1–4 modules; does not duplicate evaluation formulas.
 */

import type { OhlcvCandle } from "../data/ohlcvTypes";
import type { SafeV44Params } from "../strategy/strategyTypes";
import { CONTEXT_FALLBACK_PARAMS } from "../strategy/safeV44Params";
import { isPatternCandidateParams } from "./patternSearchSpaces";
import {
  getJobExecutionProfile,
  resolveProfileEventSequenceCostModel,
} from "./jobExecutionProfile";
import type { EventSequenceCostModel } from "../strategy/eventSequenceCostModel";
import { resolveEventSequenceCostModel } from "../strategy/eventSequenceCostModel";
import {
  evaluateCompleteCandidate,
  type EvaluateCompleteCandidateInput,
} from "./candidateEvaluator";
import {
  StrategySearchGenerationError,
  generateUniqueCandidate,
} from "./candidateGenerator";
import {
  buildRepeatedGenerationErrorFingerprint,
  classifyEngineError,
  isInvalidParameterRangesError,
  isRecoverableGenerationError,
} from "./engineErrorClassification";
import { StrategySearchJitterError } from "./jitterEvaluator";
import { createStrategySearchCandidateId } from "./searchId";
import {
  buildPersistedCheckpoint,
  createInitialRunnerPayload,
  readRunnerPayloadFromCheckpoint,
  StrategySearchCheckpointError,
  type StrategySearchRunnerCheckpointPayload,
} from "./jobCheckpoint";
import {
  getSearchJob,
  getSearchTrial,
  saveSearchTrial,
  StrategySearchPersistenceError,
  updateSearchCheckpoint,
  type StrategySearchStoreOptions,
} from "./jobStore";
import {
  getSearchPlan,
  markPlanPaused,
  saveSearchPlan,
} from "./searchPlan";
import { refreshLiveResearchTop10 } from "./researchResultsSummary";
import { finalizeResearchTop10 } from "./researchTop10";
import {
  createEmptyJobStatistics,
  recordDuplicate,
  recordElapsed,
  recordError,
  recordEvaluation,
  recordGenerated,
  type RecordEvaluationStatsInput,
  type StrategySearchJobStatistics,
} from "./jobStatistics";
import {
  applyGroupChampA,
  classifyPersistedTrial,
  cloneBestByCompatibilityGroup,
  reconstructGroupBestFromReferenced,
  stampResearchEvaluation,
} from "./researchEvaluationIdentity";
import {
  StrategySearchJobStateError,
  isTerminalJobStatus,
  transitionJobToCancelRequested,
  transitionJobToCancelled,
  transitionJobToCancelling,
  transitionJobToCompleted,
  transitionJobToFailed,
  transitionJobToPauseRequested,
  transitionJobCooperativelyPaused,
  transitionJobToQueued,
  transitionJobToRunning,
} from "./jobState";
import {
  createSeededRandom,
  restoreSeededRandom,
  type SeededRandom,
} from "./random";
import type {
  StrategySearchBacktestCostConfig,
  StrategySearchBestCandidateReference,
  StrategySearchCandidate,
  StrategySearchCompleteCandidateEvaluation,
  StrategySearchCostStressScenario,
  StrategySearchEvaluationWindowPlan,
  StrategySearchJob,
  StrategySearchJitterConfig,
  StrategySearchParameterValue,
  StrategySearchPassPolicy,
  StrategySearchScoreWeights,
  StrategySearchTrial,
} from "./types";

export class StrategySearchJobRunnerError extends Error {
  readonly code:
    | "FATAL"
    | "INVALID_STATE"
    | "CORRUPT_CHECKPOINT"
    | "NOT_FOUND"
    | "CANCELLED"
    | "PAUSED";
  readonly cause: unknown;

  constructor(
    code: StrategySearchJobRunnerError["code"],
    message: string,
    cause?: unknown,
  ) {
    super(message);
    this.name = "StrategySearchJobRunnerError";
    this.code = code;
    this.cause = cause;
  }
}

export interface RunSearchJobInput {
  jobId: string;
  storeOptions?: StrategySearchStoreOptions;
  windows: readonly StrategySearchEvaluationWindowPlan[];
  balance: number;
  baseCostConfig: StrategySearchBacktestCostConfig;
  passPolicy: StrategySearchPassPolicy;
  scoreWeights: StrategySearchScoreWeights;
  costStressScenarios: StrategySearchCostStressScenario[];
  jitterConfig: StrategySearchJitterConfig;
  baseParams?: Record<string, StrategySearchParameterValue> | SafeV44Params;
  preloadedCandlesByKey?: Record<string, OhlcvCandle[]>;
  /**
   * Explicit Pattern Event-Sequence cost model for this run.
   * When omitted, resolved from the persisted job execution profile
   * (missing field → event_sequence_ledger_v0).
   */
  eventSequenceCostModel?: EventSequenceCostModel | null;
  /** Injectable for tests — defaults to evaluateCompleteCandidate. */
  evaluate?: (
    input: EvaluateCompleteCandidateInput,
  ) => Promise<StrategySearchCompleteCandidateEvaluation>;
  maxCheckpointRetries?: number;
  /** When true, stop cooperatively after the current iteration if pause was requested. */
  honorPause?: boolean;
}

export interface RunSearchJobResult {
  job: StrategySearchJob;
  statistics: StrategySearchJobStatistics;
  iterationsCompletedThisRun: number;
  stopReason:
    | "completed"
    | "cancelled"
    | "paused"
    | "failed"
    | "max_iterations"
    | "search_space_exhausted";
}

function freezeLiveTop10OnTerminal(
  jobId: string,
  store?: StrategySearchStoreOptions,
): void {
  try {
    finalizeResearchTop10(jobId, store);
  } catch {
    /* non-fatal — live snapshot remains usable */
  }
}

function cloneBest(
  ref: StrategySearchBestCandidateReference | null,
): StrategySearchBestCandidateReference | null {
  return ref ? { ...ref } : null;
}

function persistSearchTrialSafe(
  trial: StrategySearchTrial,
  store?: StrategySearchStoreOptions,
): "saved" | "conflict" {
  try {
    saveSearchTrial(trial, store);
    return "saved";
  } catch (err) {
    if (
      err instanceof StrategySearchPersistenceError &&
      err.code === "TRIAL_CONFLICT"
    ) {
      return "conflict";
    }
    throw err;
  }
}

async function persistCheckpointWithRetry(
  jobId: string,
  checkpoint: Parameters<typeof updateSearchCheckpoint>[1],
  options: StrategySearchStoreOptions | undefined,
  maxRetries: number,
): Promise<StrategySearchJob> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    try {
      return updateSearchCheckpoint(jobId, checkpoint, options);
    } catch (err) {
      lastError = err;
      // Recoverable write failures — retry. Other errors are fatal.
      const code =
        err && typeof err === "object" && "code" in err
          ? String((err as { code: unknown }).code)
          : "";
      if (code !== "WRITE_FAILED" || attempt === maxRetries) break;
    }
  }
  throw new StrategySearchJobRunnerError(
    "FATAL",
    "checkpoint write failed after retries",
    lastError,
  );
}

function recordEvaluationCompat(
  stats: StrategySearchJobStatistics,
  input: RecordEvaluationStatsInput,
  frozenBestScore: number | null,
): StrategySearchJobStatistics {
  return { ...recordEvaluation(stats, input), bestScore: frozenBestScore };
}

function trialFromEvaluation(input: {
  job: StrategySearchJob;
  iteration: number;
  candidate: StrategySearchCandidate;
  evaluation: StrategySearchCompleteCandidateEvaluation | null;
  failureReasons: Array<{ code: string; message: string }>;
  durationMs: number;
  costConfig: StrategySearchBacktestCostConfig;
  windows: readonly StrategySearchEvaluationWindowPlan[];
  evaluationBalance: number;
  passPolicy: StrategySearchPassPolicy;
  scoreWeights: StrategySearchScoreWeights;
  costStressScenarios: StrategySearchCostStressScenario[];
  jitterConfig: StrategySearchJitterConfig;
  eventSequenceCostModel?: EventSequenceCostModel | null;
}): StrategySearchTrial {
  const ev = input.evaluation;
  const pattern = isPatternCandidateParams(input.candidate.params);
  const stamped = stampResearchEvaluation({
    params: input.candidate.params,
    paramsHash: input.candidate.paramsHash,
    cost: input.costConfig,
    symbols: input.job.config.symbols,
    timeframe: input.job.config.timeframe,
    windows: input.windows.map((window) => ({
      id: window.id,
      fromOpenTime: window.requestedFrom,
      toOpenTime: window.requestedTo,
      requiredForPass: window.requiredForPass,
    })),
    dataVersion: input.job.config.dataVersion,
    evaluationBalance: input.evaluationBalance,
    passPolicy: input.passPolicy,
    scoreWeights: input.scoreWeights,
    costStressScenarios: input.costStressScenarios,
    jitterConfig: input.jitterConfig,
    ...(pattern
      ? {
          engineCostModel: resolveEventSequenceCostModel(
            input.eventSequenceCostModel,
          ),
        }
      : {}),
  });
  return {
    jobId: input.job.id,
    iteration: input.iteration,
    candidateId: input.candidate.candidateId,
    params: { ...input.candidate.params },
    paramsHash: input.candidate.paramsHash,
    generatorType: input.candidate.generatorType,
    parentCandidateIds: [...input.candidate.parentCandidateIds],
    score: ev?.baseScore.finalScore ?? null,
    passed: ev?.finalPassed ?? false,
    failureReasons: input.failureReasons.map((f) => ({ ...f })),
    windowResults: (ev?.baseEvaluation.windows ?? []).map((w) => ({
      windowId: w.window.id,
      symbol: w.symbol,
      totalReturn: w.metrics.totalReturn,
      mdd: w.metrics.mdd,
      trades: w.metrics.trades,
      winRate: w.metrics.winRate,
      profitFactor: w.metrics.profitFactor,
      ...(typeof w.metrics.averageTrade === "number"
        ? { averageTrade: w.metrics.averageTrade }
        : {}),
    })),
    costStressResults: (ev?.costStressResults ?? []).map((r) => ({
      scenarioId: r.scenario.id,
      passed: r.passed,
      score: r.score.finalScore,
      requiredForPass: r.scenario.requiredForPass,
    })),
    jitterResults: (ev?.jitterResult.samples ?? []).map((s) => ({
      sampleIndex: s.sampleIndex,
      paramsHash: s.paramsHash,
      passed: s.pass.passed,
      score: s.score.finalScore,
    })),
    durationMs: input.durationMs,
    createdAt: new Date().toISOString(),
    researchEvaluationIdentity: stamped.researchEvaluationIdentity as
      | Record<string, unknown>
      | null,
    researchEvaluationHash: stamped.researchEvaluationHash,
    engineCostModel: stamped.classification.engineCostModel,
    rankingCompatibilityGroup: stamped.classification.rankingCompatibilityGroup,
    rankingEligible: stamped.classification.rankingEligible,
    promotionEligible: stamped.classification.promotionEligible,
  };
}

function generateNextCandidate(input: {
  job: StrategySearchJob;
  iteration: number;
  random: SeededRandom;
  seenHashes: Set<string>;
  baseParams: Record<string, StrategySearchParameterValue> | SafeV44Params;
  lastParent: StrategySearchCandidate | null;
}): StrategySearchCandidate {
  const { job, iteration, random, seenHashes, baseParams } = input;
  const ranges = job.config.parameterRanges;
  const searchVersion = job.config.searchVersion;
  // Local generation requires a parent; first iteration (or missing parent) uses random.
  if (job.config.generatorType === "local" && input.lastParent) {
    return generateUniqueCandidate({
      mode: "local",
      existingHashes: seenHashes,
      maxAttempts: 64,
      localInput: {
        jobId: job.id,
        iteration,
        parameterRanges: ranges,
        random,
        parentCandidate: input.lastParent,
        mutationScale: 0.25,
        searchVersion,
      },
    });
  }

  return generateUniqueCandidate({
    mode: "random",
    existingHashes: seenHashes,
    maxAttempts: 64,
    randomInput: {
      jobId: job.id,
      iteration,
      parameterRanges: ranges,
      random,
      baseParams,
      searchVersion,
    },
  });
}

/**
 * Run (or resume) a search job until max iterations, pause, cancel, or fatal error.
 */
export async function runSearchJob(
  input: RunSearchJobInput,
): Promise<RunSearchJobResult> {
  const store = input.storeOptions;
  const honorPause = input.honorPause !== false;
  const maxCheckpointRetries = input.maxCheckpointRetries ?? 3;
  const evaluate = input.evaluate ?? evaluateCompleteCandidate;
  const baseParams = input.baseParams ?? CONTEXT_FALLBACK_PARAMS;
  const persistedProfile = getJobExecutionProfile(input.jobId, store);
  const eventSequenceCostModel = resolveEventSequenceCostModel(
    input.eventSequenceCostModel ??
      resolveProfileEventSequenceCostModel(persistedProfile),
  );

  let job = getSearchJob(input.jobId, store);
  if (!job) {
    throw new StrategySearchJobRunnerError(
      "NOT_FOUND",
      `strategy-search job not found: ${input.jobId}`,
    );
  }
  if (isTerminalJobStatus(job.status)) {
    throw new StrategySearchJobRunnerError(
      "INVALID_STATE",
      `cannot run job in terminal status: ${job.status}`,
    );
  }

  // Cancel requested before the runner loop starts (e.g. during candle load).
  if (job.status === "cancel_requested" || job.status === "cancelling") {
    if (job.status === "cancel_requested") {
      try {
        transitionJobToCancelling(job.id, store);
      } catch {
        /* race with external finalize — still settle cancelled */
      }
    }
    job = transitionJobToCancelled(job.id, store);
    freezeLiveTop10OnTerminal(job.id, store);
    return {
      job,
      statistics: createEmptyJobStatistics(),
      iterationsCompletedThisRun: 0,
      stopReason: "cancelled",
    };
  }

  // Start: queued → running. If already running, continue (resume mid-flight).
  if (job.status === "queued") {
    job = transitionJobToRunning(job.id, store);
  } else if (job.status === "paused") {
    throw new StrategySearchJobRunnerError(
      "INVALID_STATE",
      "paused job must be resumed to queued before runSearchJob",
    );
  } else if (job.status !== "running") {
    throw new StrategySearchJobRunnerError(
      "INVALID_STATE",
      `cannot run job in status: ${job.status}`,
    );
  }

  let payload: StrategySearchRunnerCheckpointPayload;
  try {
    const existing = readRunnerPayloadFromCheckpoint(job.checkpoint);
    if (existing) {
      payload = existing;
    } else {
      const prng = createSeededRandom(job.config.seed);
      payload = createInitialRunnerPayload({
        prng: prng.getState(),
        jobStatus: "running",
      });
    }
  } catch (err) {
    if (err instanceof StrategySearchCheckpointError) {
      transitionJobToFailed(job.id, err.message, store);
      throw new StrategySearchJobRunnerError(
        "CORRUPT_CHECKPOINT",
        err.message,
        err,
      );
    }
    throw err;
  }

  let random = restoreSeededRandom(payload.prng);
  let statistics = { ...payload.statistics };
  const seenHashes = new Set(payload.seenHashes);
  const repeatedErrorSignatures: Record<string, number> = {
    ...(payload.repeatedErrorSignatures ?? {}),
  };
  payload = {
    ...payload,
    repeatedErrorSignatures: { ...repeatedErrorSignatures },
  };
  const frozenStatsBestScore = statistics.bestScore;
  let bestCandidate = cloneBest(job.checkpoint.bestCandidate);
  let bestPassedCandidate = cloneBest(job.checkpoint.bestPassedCandidate);
  const resumeJobId = job.id;
  let groupBest = job.checkpoint.bestByCompatibilityGroup?.length
    ? cloneBestByCompatibilityGroup(job.checkpoint.bestByCompatibilityGroup)
    : reconstructGroupBestFromReferenced({
        bestCandidate,
        bestPassedCandidate,
        resolveTrial: (ref) => getSearchTrial(resumeJobId, ref.iteration, store),
      });
  let iteration = job.checkpoint.nextIteration;
  let completed = job.checkpoint.completedIterations;
  let lastParent: StrategySearchCandidate | null = null;
  if (payload.lastParentCandidateId && payload.lastParentParamsHash) {
    // Reconstruct parent shell from the latest completed trial when resuming.
    const parentIter = Math.max(0, completed - 1);
    const parentTrial = getSearchTrial(job.id, parentIter, store);
    if (
      parentTrial &&
      parentTrial.candidateId === payload.lastParentCandidateId
    ) {
      lastParent = {
        candidateId: parentTrial.candidateId,
        jobId: job.id,
        iteration: parentTrial.iteration,
        generatorType: parentTrial.generatorType,
        parentCandidateIds: [...parentTrial.parentCandidateIds],
        params: { ...(parentTrial.params as Record<string, StrategySearchParameterValue>) },
        paramsHash: parentTrial.paramsHash,
        createdAt: parentTrial.createdAt,
      };
    }
  }
  let iterationsThisRun = 0;
  let lastLiveTop10Passed = 0;
  const LIVE_TOP10_EVERY_PASSED = 5;
  const startedMs = Date.now() - statistics.elapsedMs;

  const maxIterations = job.config.maxIterations;

  try {
    while (true) {
      // Yield so HTTP pause/cancel handlers on the same Node process can run.
      await new Promise<void>((resolve) => setImmediate(resolve));

      // Cooperative status poll
      const latest = getSearchJob(job.id, store);
      if (!latest) {
        throw new StrategySearchJobRunnerError(
          "FATAL",
          "job disappeared during run",
        );
      }
      job = latest;

      if (job.status === "cancelled") {
        freezeLiveTop10OnTerminal(job.id, store);
        return {
          job,
          statistics,
          iterationsCompletedThisRun: iterationsThisRun,
          stopReason: "cancelled",
        };
      }
      if (job.status === "cancel_requested" || job.status === "cancelling") {
        if (job.status === "cancel_requested") {
          try {
            transitionJobToCancelling(job.id, store);
          } catch {
            /* race with external finalize — still settle cancelled */
          }
        }
        job = transitionJobToCancelled(job.id, store);
        freezeLiveTop10OnTerminal(job.id, store);
        return {
          job,
          statistics,
          iterationsCompletedThisRun: iterationsThisRun,
          stopReason: "cancelled",
        };
      }
      if (honorPause && job.status === "pause_requested") {
        // Persist checkpoint before pausing
        payload = {
          ...payload,
          prng: random.getState(),
          statistics,
          seenHashes: [...seenHashes],
          jobStatus: "paused",
        };
        job = await persistCheckpointWithRetry(
          job.id,
          buildPersistedCheckpoint({
            completedIterations: completed,
            nextIteration: iteration,
            payload,
            bestCandidate,
            bestPassedCandidate,
            bestByCompatibilityGroup: groupBest,
          }),
          store,
          maxCheckpointRetries,
        );
        job = transitionJobCooperativelyPaused(job.id, store);
        return {
          job,
          statistics,
          iterationsCompletedThisRun: iterationsThisRun,
          stopReason: "paused",
        };
      }

      if (maxIterations != null && completed >= maxIterations) {
        payload = {
          ...payload,
          prng: random.getState(),
          statistics: recordElapsed(
            statistics,
            Date.now() - startedMs,
            completed,
            maxIterations,
          ),
          seenHashes: [...seenHashes],
          jobStatus: "completed",
          stopReason: "max_iterations",
        };
        statistics = payload.statistics;
        job = await persistCheckpointWithRetry(
          job.id,
          buildPersistedCheckpoint({
            completedIterations: completed,
            nextIteration: iteration,
            payload,
            bestCandidate,
            bestPassedCandidate,
            bestByCompatibilityGroup: groupBest,
          }),
          store,
          maxCheckpointRetries,
        );
        job = transitionJobToCompleted(job.id, store);
        freezeLiveTop10OnTerminal(job.id, store);
        return {
          job,
          statistics,
          iterationsCompletedThisRun: iterationsThisRun,
          stopReason: "max_iterations",
        };
      }

      // Skip if trial already exists (resume safety — crash after trial, before checkpoint).
      // Re-run generation to advance PRNG deterministically, then verify hash match.
      const existingTrial = getSearchTrial(job.id, iteration, store);
      if (existingTrial) {
        const isInvalidPlaceholder =
          typeof existingTrial.paramsHash === "string" &&
          existingTrial.paramsHash.startsWith("invalid_");
        if (!isInvalidPlaceholder) {
          let replayed: StrategySearchCandidate;
          try {
            replayed = generateNextCandidate({
              job,
              iteration,
              random,
              seenHashes,
              baseParams,
              lastParent,
            });
          } catch (err) {
            throw new StrategySearchJobRunnerError(
              "FATAL",
              "failed to replay candidate generation for existing trial",
              err,
            );
          }
          if (replayed.paramsHash !== existingTrial.paramsHash) {
            throw new StrategySearchJobRunnerError(
              "FATAL",
              `checkpoint/trial mismatch at iteration ${iteration}: expected ${existingTrial.paramsHash}, replayed ${replayed.paramsHash}`,
            );
          }
        }
        seenHashes.add(existingTrial.paramsHash);
        // Stats were not checkpointed for this trial yet when completed === iteration.
        if (completed === iteration) {
          statistics = recordGenerated(statistics);
          statistics = recordEvaluationCompat(
            statistics,
            {
              score: existingTrial.score,
              passed: existingTrial.passed,
              stressPassed:
                existingTrial.costStressResults.length > 0 &&
                existingTrial.costStressResults.every((r) => r.passed),
              jitterPassed:
                existingTrial.jitterResults.length === 0
                  ? null
                  : existingTrial.jitterResults.every((r) => r.passed),
              evaluationFailed: existingTrial.failureReasons.some(
                (f) =>
                  f.code === "EVALUATION_ERROR" ||
                  f.code === "EVALUATION_FAILED",
              ),
            },
            frozenStatsBestScore,
          );
        }
        const existingClass = classifyPersistedTrial(existingTrial);
        if (existingClass.rankingEligible) {
          groupBest = applyGroupChampA(
            groupBest,
            existingClass.rankingCompatibilityGroup,
            {
              candidateId: existingTrial.candidateId,
              iteration: existingTrial.iteration,
              paramsHash: existingTrial.paramsHash,
              score: existingTrial.score,
              passed: existingTrial.passed,
            },
          );
        }
        if (!isInvalidPlaceholder) {
          lastParent = {
            candidateId: existingTrial.candidateId,
            jobId: job.id,
            iteration: existingTrial.iteration,
            generatorType: existingTrial.generatorType,
            parentCandidateIds: [...existingTrial.parentCandidateIds],
            params: {
              ...(existingTrial.params as Record<
                string,
                StrategySearchParameterValue
              >),
            },
            paramsHash: existingTrial.paramsHash,
            createdAt: existingTrial.createdAt,
          };
        }
        completed += 1;
        iteration += 1;
        continue;
      }

      // Generate
      let candidate: StrategySearchCandidate;
      try {
        candidate = generateNextCandidate({
          job,
          iteration,
          random,
          seenHashes,
          baseParams,
          lastParent,
        });
        statistics = recordGenerated(statistics);
        if (seenHashes.has(candidate.paramsHash)) {
          statistics = recordDuplicate(statistics);
        }
        seenHashes.add(candidate.paramsHash);
      } catch (err) {
        if (
          err instanceof StrategySearchGenerationError &&
          err.code === "DUPLICATE_EXHAUSTED"
        ) {
          // Search space exhausted: finish this run once.
          // Do NOT write synthetic duplicate_exhausted trial rows.
          // Do NOT count as execution error.
          statistics = recordElapsed(
            statistics,
            Date.now() - startedMs,
            completed,
            maxIterations,
          );
          payload = {
            ...payload,
            prng: random.getState(),
            statistics,
            seenHashes: [...seenHashes],
            jobStatus: "completed",
            stopReason: "search_space_exhausted",
          };
          job = await persistCheckpointWithRetry(
            job.id,
            buildPersistedCheckpoint({
              completedIterations: completed,
              nextIteration: iteration,
              payload,
              bestCandidate,
              bestPassedCandidate,
              bestByCompatibilityGroup: groupBest,
            }),
            store,
            maxCheckpointRetries,
          );
          job = transitionJobToCompleted(job.id, store);
          freezeLiveTop10OnTerminal(job.id, store);
          return {
            job,
            statistics,
            iterationsCompletedThisRun: iterationsThisRun,
            stopReason: "search_space_exhausted",
          };
        }
        const classified = classifyEngineError(err, "candidate_generation");
        if (isInvalidParameterRangesError(err) || classified.code === "CONFIGURATION_INVALID") {
          const message =
            err instanceof Error
              ? err.message
              : "invalid parameterRanges: min must be <= max";
          statistics = recordElapsed(
            statistics,
            Date.now() - startedMs,
            completed,
            maxIterations,
          );
          payload = {
            ...payload,
            prng: random.getState(),
            statistics,
            seenHashes: [...seenHashes],
            jobStatus: "failed",
            stopReason: "failed",
          };
          job = await persistCheckpointWithRetry(
            job.id,
            buildPersistedCheckpoint({
              completedIterations: completed,
              nextIteration: iteration,
              payload,
              bestCandidate,
              bestPassedCandidate,
              bestByCompatibilityGroup: groupBest,
            }),
            store,
            maxCheckpointRetries,
          );
          const plan = getSearchPlan(job.id, store);
          if (plan) {
            saveSearchPlan(
              job.id,
              { ...plan, completionReason: "CONFIGURATION_INVALID" },
              store,
            );
          }
          job = transitionJobToFailed(job.id, message, store);
          freezeLiveTop10OnTerminal(job.id, store);
          return {
            job,
            statistics,
            iterationsCompletedThisRun: iterationsThisRun,
            stopReason: "failed",
          };
        }
        // Recoverable candidate generation errors must not kill the Research Job.
        if (isRecoverableGenerationError(err) || !classified.fatal) {
          statistics = recordError(statistics);
          statistics = recordEvaluationCompat(
            statistics,
            {
              score: null,
              passed: false,
              stressPassed: false,
              jitterPassed: false,
              evaluationFailed: true,
            },
            frozenStatsBestScore,
          );
          const fingerprint =
            buildRepeatedGenerationErrorFingerprint(classified);
          const nextCount = (repeatedErrorSignatures[fingerprint] ?? 0) + 1;
          repeatedErrorSignatures[fingerprint] = nextCount;
          const placeholderId = createStrategySearchCandidateId(
            job.id,
            iteration,
          );
          const invalidTrial: StrategySearchTrial = {
            jobId: job.id,
            iteration,
            candidateId: placeholderId,
            generatorType: "random",
            parentCandidateIds: lastParent ? [lastParent.candidateId] : [],
            params: {},
            paramsHash: `invalid_${iteration}`,
            createdAt: new Date().toISOString(),
            score: null,
            passed: false,
            windowResults: [],
            costStressResults: [],
            jitterResults: [],
            durationMs: 0,
            failureReasons: [
              {
                code: classified.code,
                message: classified.message,
              },
            ],
          };
          persistSearchTrialSafe(invalidTrial, store);
          completed += 1;
          iteration += 1;
          iterationsThisRun += 1;
          statistics = recordElapsed(
            statistics,
            Date.now() - startedMs,
            completed,
            maxIterations,
          );
          const plan = getSearchPlan(job.id, store);
          const threshold = plan?.repeatedSignatureThreshold ?? 25;
          const hitRepeatedSignature =
            Number.isInteger(threshold) &&
            threshold >= 1 &&
            nextCount >= threshold;
          payload = {
            version: 1,
            prng: random.getState(),
            statistics: { ...statistics },
            seenHashes: [...seenHashes],
            lastParentCandidateId: lastParent?.candidateId ?? null,
            lastParentParamsHash: lastParent?.paramsHash ?? null,
            jobStatus: hitRepeatedSignature ? "paused" : "running",
            repeatedErrorSignatures: { ...repeatedErrorSignatures },
            ...(hitRepeatedSignature
              ? { stopReason: "repeated_signature_auto_pause" as const }
              : {}),
          };
          job = await persistCheckpointWithRetry(
            job.id,
            buildPersistedCheckpoint({
              completedIterations: completed,
              nextIteration: iteration,
              payload,
              bestCandidate,
              bestPassedCandidate,
              bestByCompatibilityGroup: groupBest,
            }),
            store,
            maxCheckpointRetries,
          );
          if (hitRepeatedSignature) {
            job = transitionJobCooperativelyPaused(job.id, store);
            if (plan) {
              saveSearchPlan(job.id, markPlanPaused(plan), store);
            }
            return {
              job,
              statistics,
              iterationsCompletedThisRun: iterationsThisRun,
              stopReason: "paused",
            };
          }
          continue;
        }
        throw new StrategySearchJobRunnerError(
          "FATAL",
          `[${classified.class}/${classified.stage}] ${classified.message}`,
          err,
        );
      }

      // Evaluate
      const iterStarted = Date.now();
      let evaluation: StrategySearchCompleteCandidateEvaluation | null = null;
      const failureReasons: Array<{ code: string; message: string }> = [];
      try {
        evaluation = await evaluate({
          candidate,
          symbols: job.config.symbols,
          timeframe: job.config.timeframe,
          windows: input.windows,
          balance: input.balance,
          baseCostConfig: input.baseCostConfig,
          passPolicy: input.passPolicy,
          scoreWeights: input.scoreWeights,
          costStressScenarios: input.costStressScenarios,
          jitterConfig: input.jitterConfig,
          preloadedCandlesByKey: input.preloadedCandlesByKey,
          eventSequenceCostModel,
        });
        statistics = recordEvaluationCompat(
          statistics,
          {
            score: evaluation.baseScore.finalScore,
            passed: evaluation.finalPassed,
            stressPassed: evaluation.costStressPassed,
            jitterPassed: evaluation.jitterResult.enabled
              ? evaluation.jitterResult.jitterPassed
              : null,
          },
          frozenStatsBestScore,
        );
        if (!evaluation.finalPassed) {
          failureReasons.push({
            code: "EVALUATION_FAILED_GATES",
            message: "candidate did not pass complete evaluation gates",
          });
        }
      } catch (err) {
        const classified = classifyEngineError(err, "evaluation");
        const jitterCode =
          err instanceof StrategySearchJitterError ? err.code : null;
        // Robustness sampling exhaustion / soft robustness failures are
        // qualification-style rejections, not engine calculation errors.
        const robustnessReject =
          jitterCode === "JITTER_DUPLICATE_EXHAUSTED" ||
          classified.class === "robustness_failed";
        if (!robustnessReject) {
          statistics = recordError(statistics);
        }
        statistics = recordEvaluationCompat(
          statistics,
          {
            score: null,
            passed: false,
            stressPassed: false,
            jitterPassed: false,
            evaluationFailed: !robustnessReject,
          },
          frozenStatsBestScore,
        );
        failureReasons.push({
          code:
            jitterCode ??
            (err && typeof err === "object" && "code" in err
              ? String((err as { code: unknown }).code)
              : classified.code),
          message: err instanceof Error ? err.message : "evaluation failed",
        });
      }

      const durationMs = Date.now() - iterStarted;
      const trial = trialFromEvaluation({
        job,
        iteration,
        candidate,
        evaluation,
        failureReasons,
        durationMs,
        costConfig: input.baseCostConfig,
        windows: input.windows,
        evaluationBalance: input.balance,
        passPolicy: input.passPolicy,
        scoreWeights: input.scoreWeights,
        costStressScenarios: input.costStressScenarios,
        jitterConfig: input.jitterConfig,
        eventSequenceCostModel,
      });
      if (persistSearchTrialSafe(trial, store) === "conflict") {
        statistics = recordError(statistics);
        completed += 1;
        iteration += 1;
        iterationsThisRun += 1;
        statistics = recordElapsed(
          statistics,
          Date.now() - startedMs,
          completed,
          maxIterations,
        );
        payload = {
          version: 1,
          prng: random.getState(),
          statistics: { ...statistics },
          seenHashes: [...seenHashes],
          lastParentCandidateId: lastParent?.candidateId ?? null,
          lastParentParamsHash: lastParent?.paramsHash ?? null,
          jobStatus: "running",
          repeatedErrorSignatures: { ...repeatedErrorSignatures },
        };
        job = await persistCheckpointWithRetry(
          job.id,
          buildPersistedCheckpoint({
            completedIterations: completed,
            nextIteration: iteration,
            payload,
            bestCandidate,
            bestPassedCandidate,
            bestByCompatibilityGroup: groupBest,
          }),
          store,
          maxCheckpointRetries,
        );
        continue;
      }

      // Live Top-10: refresh when enough new qualified candidates appear.
      if (
        trial.passed &&
        statistics.passed > 0 &&
        statistics.passed - lastLiveTop10Passed >= LIVE_TOP10_EVERY_PASSED
      ) {
        try {
          refreshLiveResearchTop10(job.id, store);
          lastLiveTop10Passed = statistics.passed;
        } catch {
          /* non-fatal — UI can still show current best */
        }
      }

      // Group-local CHAMP-A only. Global scalars stay historical/display.
      if (
        trial.rankingCompatibilityGroup &&
        trial.rankingCompatibilityGroup !== "unknown_legacy" &&
        trial.rankingEligible !== false
      ) {
        groupBest = applyGroupChampA(groupBest, trial.rankingCompatibilityGroup, {
          candidateId: candidate.candidateId,
          iteration,
          paramsHash: candidate.paramsHash,
          score: trial.score,
          passed: trial.passed,
        });
      }

      lastParent = candidate;
      completed += 1;
      iteration += 1;
      iterationsThisRun += 1;

      statistics = recordElapsed(
        statistics,
        Date.now() - startedMs,
        completed,
        maxIterations,
      );

      payload = {
        version: 1,
        prng: random.getState(),
        statistics: { ...statistics },
        seenHashes: [...seenHashes],
        lastParentCandidateId: candidate.candidateId,
        lastParentParamsHash: candidate.paramsHash,
        jobStatus: "running",
        repeatedErrorSignatures: { ...repeatedErrorSignatures },
      };

      job = await persistCheckpointWithRetry(
        job.id,
        buildPersistedCheckpoint({
          completedIterations: completed,
          nextIteration: iteration,
          payload,
          bestCandidate,
          bestPassedCandidate,
          bestByCompatibilityGroup: groupBest,
        }),
        store,
        maxCheckpointRetries,
      );

      // Configurable error-rate auto-pause (Advanced Settings). Never silent stop.
      const plan = getSearchPlan(job.id, store);
      const autoPauseRate = plan?.errorAutoPauseRate;
      if (
        autoPauseRate != null &&
        Number.isFinite(autoPauseRate) &&
        statistics.evaluated >= 20 &&
        statistics.errors / statistics.evaluated >= autoPauseRate
      ) {
        payload = {
          ...payload,
          prng: random.getState(),
          statistics,
          seenHashes: [...seenHashes],
          jobStatus: "paused",
          stopReason: "error_rate_auto_pause",
        };
        job = await persistCheckpointWithRetry(
          job.id,
          buildPersistedCheckpoint({
            completedIterations: completed,
            nextIteration: iteration,
            payload,
            bestCandidate,
            bestPassedCandidate,
            bestByCompatibilityGroup: groupBest,
          }),
          store,
          maxCheckpointRetries,
        );
        job = transitionJobCooperativelyPaused(job.id, store);
        if (plan) {
          saveSearchPlan(job.id, markPlanPaused(plan), store);
        }
        return {
          job,
          statistics,
          iterationsCompletedThisRun: iterationsThisRun,
          stopReason: "paused",
        };
      }
    }
  } catch (err) {
    if (err instanceof StrategySearchJobRunnerError) {
      if (err.code === "FATAL" || err.code === "CORRUPT_CHECKPOINT") {
        try {
          transitionJobToFailed(input.jobId, err.message, store);
        } catch {
          // ignore secondary failure
        }
      }
      throw err;
    }
    if (
      err instanceof StrategySearchJobStateError ||
      err instanceof StrategySearchCheckpointError
    ) {
      try {
        transitionJobToFailed(input.jobId, err.message, store);
      } catch {
        // ignore
      }
      throw new StrategySearchJobRunnerError("FATAL", err.message, err);
    }
    try {
      transitionJobToFailed(
        input.jobId,
        err instanceof Error ? err.message : "job runner failed",
        store,
      );
    } catch {
      // ignore
    }
    throw new StrategySearchJobRunnerError(
      "FATAL",
      err instanceof Error ? err.message : "job runner failed",
      err,
    );
  }
}

/** Request cooperative pause (running → pause_requested). */
export function requestSearchJobPause(
  jobId: string,
  options?: StrategySearchStoreOptions,
): StrategySearchJob {
  return transitionJobToPauseRequested(jobId, options);
}

/** Request cooperative cancel. */
export function requestSearchJobCancel(
  jobId: string,
  options?: StrategySearchStoreOptions,
): StrategySearchJob {
  return transitionJobToCancelRequested(jobId, options);
}

/** Resume a paused job to queued so runSearchJob can continue. */
export function resumeSearchJobForRun(
  jobId: string,
  options?: StrategySearchStoreOptions,
): StrategySearchJob {
  return transitionJobToQueued(jobId, options);
}
