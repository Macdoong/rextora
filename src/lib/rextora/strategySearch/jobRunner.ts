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
import {
  evaluateCompleteCandidate,
  type EvaluateCompleteCandidateInput,
} from "./candidateEvaluator";
import {
  StrategySearchGenerationError,
  generateUniqueCandidate,
} from "./candidateGenerator";
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
  updateSearchCheckpoint,
  type StrategySearchStoreOptions,
} from "./jobStore";
import {
  createEmptyJobStatistics,
  isBetterScore,
  recordDuplicate,
  recordElapsed,
  recordError,
  recordEvaluation,
  recordGenerated,
  type StrategySearchJobStatistics,
} from "./jobStatistics";
import {
  StrategySearchJobStateError,
  isTerminalJobStatus,
  transitionJobToCancelRequested,
  transitionJobToCancelled,
  transitionJobToCompleted,
  transitionJobToFailed,
  transitionJobToPauseRequested,
  transitionJobToPaused,
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

function cloneBest(
  ref: StrategySearchBestCandidateReference | null,
): StrategySearchBestCandidateReference | null {
  return ref ? { ...ref } : null;
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

function trialFromEvaluation(input: {
  jobId: string;
  iteration: number;
  candidate: StrategySearchCandidate;
  evaluation: StrategySearchCompleteCandidateEvaluation | null;
  failureReasons: Array<{ code: string; message: string }>;
  durationMs: number;
}): StrategySearchTrial {
  const ev = input.evaluation;
  return {
    jobId: input.jobId,
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
  if (job.status === "cancel_requested") {
    job = transitionJobToCancelled(job.id, store);
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
  let bestCandidate = cloneBest(job.checkpoint.bestCandidate);
  let bestPassedCandidate = cloneBest(job.checkpoint.bestPassedCandidate);
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

      if (job.status === "cancel_requested") {
        job = transitionJobToCancelled(job.id, store);
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
          }),
          store,
          maxCheckpointRetries,
        );
        job = transitionJobToPaused(job.id, store);
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
          }),
          store,
          maxCheckpointRetries,
        );
        job = transitionJobToCompleted(job.id, store);
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
        seenHashes.add(existingTrial.paramsHash);
        // Stats were not checkpointed for this trial yet when completed === iteration.
        if (completed === iteration) {
          statistics = recordGenerated(statistics);
          statistics = recordEvaluation(statistics, {
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
                f.code === "EVALUATION_ERROR" || f.code === "EVALUATION_FAILED",
            ),
          });
        }
        if (
          isBetterScore(bestCandidate?.score ?? null, existingTrial.score)
        ) {
          bestCandidate = {
            candidateId: existingTrial.candidateId,
            iteration: existingTrial.iteration,
            paramsHash: existingTrial.paramsHash,
            score: existingTrial.score,
            passed: existingTrial.passed,
          };
        }
        if (
          existingTrial.passed &&
          isBetterScore(
            bestPassedCandidate?.score ?? null,
            existingTrial.score,
          )
        ) {
          bestPassedCandidate = {
            candidateId: existingTrial.candidateId,
            iteration: existingTrial.iteration,
            paramsHash: existingTrial.paramsHash,
            score: existingTrial.score,
            passed: true,
          };
        }
        lastParent = {
          candidateId: existingTrial.candidateId,
          jobId: job.id,
          iteration: existingTrial.iteration,
          generatorType: existingTrial.generatorType,
          parentCandidateIds: [...existingTrial.parentCandidateIds],
          params: {
            ...(existingTrial.params as Record<string, StrategySearchParameterValue>),
          },
          paramsHash: existingTrial.paramsHash,
          createdAt: existingTrial.createdAt,
        };
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
            }),
            store,
            maxCheckpointRetries,
          );
          job = transitionJobToCompleted(job.id, store);
          return {
            job,
            statistics,
            iterationsCompletedThisRun: iterationsThisRun,
            stopReason: "search_space_exhausted",
          };
        }
        throw new StrategySearchJobRunnerError(
          "FATAL",
          err instanceof Error ? err.message : "candidate generation failed",
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
        });
        statistics = recordEvaluation(statistics, {
          score: evaluation.baseScore.finalScore,
          passed: evaluation.finalPassed,
          stressPassed: evaluation.costStressPassed,
          jitterPassed: evaluation.jitterResult.enabled
            ? evaluation.jitterResult.jitterPassed
            : null,
        });
        if (!evaluation.finalPassed) {
          failureReasons.push({
            code: "EVALUATION_FAILED_GATES",
            message: "candidate did not pass complete evaluation gates",
          });
        }
      } catch (err) {
        // Recoverable evaluation failure
        statistics = recordError(statistics);
        statistics = recordEvaluation(statistics, {
          score: null,
          passed: false,
          stressPassed: false,
          jitterPassed: false,
          evaluationFailed: true,
        });
        failureReasons.push({
          code:
            err && typeof err === "object" && "code" in err
              ? String((err as { code: unknown }).code)
              : "EVALUATION_ERROR",
          message: err instanceof Error ? err.message : "evaluation failed",
        });
      }

      const durationMs = Date.now() - iterStarted;
      const trial = trialFromEvaluation({
        jobId: job.id,
        iteration,
        candidate,
        evaluation,
        failureReasons,
        durationMs,
      });
      saveSearchTrial(trial, store);

      // Best candidate updates (never overwrite with worse)
      const ref: StrategySearchBestCandidateReference = {
        candidateId: candidate.candidateId,
        iteration,
        paramsHash: candidate.paramsHash,
        score: trial.score,
        passed: trial.passed,
      };
      if (isBetterScore(bestCandidate?.score ?? null, ref.score)) {
        bestCandidate = { ...ref };
      }
      if (
        trial.passed &&
        isBetterScore(bestPassedCandidate?.score ?? null, ref.score)
      ) {
        bestPassedCandidate = { ...ref, passed: true };
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
      };

      job = await persistCheckpointWithRetry(
        job.id,
        buildPersistedCheckpoint({
          completedIterations: completed,
          nextIteration: iteration,
          payload,
          bestCandidate,
          bestPassedCandidate,
        }),
        store,
        maxCheckpointRetries,
      );
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
