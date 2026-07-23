/**
 * Parameter jitter robustness evaluation for strategy search (Phase 4).
 * Reuses Phase 2 local candidate generation + Phase 3 adapter; no nested cost stress.
 */

import type { OhlcvCandle } from "../data/ohlcvTypes";
import { evaluateCandidateAcrossWindows } from "./backtestAdapter";
import {
  generateLocalCandidate,
  generateUniqueCandidate,
  StrategySearchGenerationError,
} from "./candidateGenerator";
import {
  calculateCandidateScore,
  evaluateCandidatePass,
} from "./evaluationPolicy";
import { createSeededRandom } from "./random";
import { validateSearchParameterRanges } from "./paramSpace";
import type {
  StrategySearchBacktestCostConfig,
  StrategySearchCandidate,
  StrategySearchCandidateEvaluation,
  StrategySearchEvaluationWindowPlan,
  StrategySearchJitterConfig,
  StrategySearchJitterResult,
  StrategySearchJitterSampleResult,
  StrategySearchPassPolicy,
  StrategySearchScoreResult,
  StrategySearchScoreWeights,
} from "./types";

export class StrategySearchJitterError extends Error {
  readonly code:
    | "INVALID_JITTER_CONFIG"
    | "JITTER_DUPLICATE_EXHAUSTED"
    | "JITTER_EVALUATION_FAILED"
    | "PROTECTED_HASH_COLLISION";
  readonly candidateId: string | null;
  readonly sampleIndex: number | null;
  readonly cause: unknown;

  constructor(
    code: StrategySearchJitterError["code"],
    message: string,
    context?: {
      candidateId?: string | null;
      sampleIndex?: number | null;
      cause?: unknown;
    },
  ) {
    super(message);
    this.name = "StrategySearchJitterError";
    this.code = code;
    this.candidateId = context?.candidateId ?? null;
    this.sampleIndex = context?.sampleIndex ?? null;
    this.cause = context?.cause;
  }
}

export interface GenerateJitterCandidateInput {
  parentCandidate: StrategySearchCandidate;
  config: StrategySearchJitterConfig;
  sampleIndex: number;
  random: ReturnType<typeof createSeededRandom>;
  existingHashes: Set<string>;
  maxUniqueAttempts: number;
}

export interface EvaluateCandidateJitterInput {
  parentCandidate: StrategySearchCandidate;
  baseEvaluation: StrategySearchCandidateEvaluation;
  baseScore: StrategySearchScoreResult;
  symbols: string[];
  timeframe: string;
  windows: readonly StrategySearchEvaluationWindowPlan[];
  balance: number;
  baseCostConfig: StrategySearchBacktestCostConfig;
  passPolicy: StrategySearchPassPolicy;
  scoreWeights: StrategySearchScoreWeights;
  config: StrategySearchJitterConfig;
  preloadedCandlesByKey?: Record<string, OhlcvCandle[]>;
}

const PROTECTED_HASH = "7893ca3f0e30";
const JITTER_ITERATION_BASE = 900_000_000;

/**
 * Explicit base-score-zero drop rule:
 * - base === 0 and sample >= 0 → drop 0
 * - base === 0 and sample < 0 → drop 1
 * - otherwise → max(0, (base - sample) / |base|)
 */
export function calculateScoreDropRatio(
  baseScore: number,
  sampleScore: number,
): number {
  if (!Number.isFinite(baseScore) || !Number.isFinite(sampleScore)) {
    throw new StrategySearchJitterError(
      "JITTER_EVALUATION_FAILED",
      "score drop requires finite scores",
    );
  }
  if (baseScore === 0) {
    return sampleScore >= 0 ? 0 : 1;
  }
  return Math.max(0, (baseScore - sampleScore) / Math.abs(baseScore));
}

export function validateJitterConfig(config: StrategySearchJitterConfig): void {
  if (!config || typeof config !== "object") {
    throw new StrategySearchJitterError(
      "INVALID_JITTER_CONFIG",
      "jitter config must be an object",
    );
  }
  if (typeof config.enabled !== "boolean") {
    throw new StrategySearchJitterError(
      "INVALID_JITTER_CONFIG",
      "enabled must be a boolean",
    );
  }
  if (!config.enabled) return;

  if (!Number.isInteger(config.sampleCount) || config.sampleCount < 1) {
    throw new StrategySearchJitterError(
      "INVALID_JITTER_CONFIG",
      "sampleCount must be a positive integer when enabled",
    );
  }
  if (
    typeof config.mutationScale !== "number" ||
    !Number.isFinite(config.mutationScale) ||
    config.mutationScale <= 0 ||
    config.mutationScale > 1
  ) {
    throw new StrategySearchJitterError(
      "INVALID_JITTER_CONFIG",
      "mutationScale must be in (0, 1]",
    );
  }
  if (
    typeof config.seed !== "number" ||
    !Number.isFinite(config.seed) ||
    !Number.isInteger(config.seed)
  ) {
    throw new StrategySearchJitterError(
      "INVALID_JITTER_CONFIG",
      "seed must be a finite integer",
    );
  }
  if (
    typeof config.minimumPassRate !== "number" ||
    !Number.isFinite(config.minimumPassRate) ||
    config.minimumPassRate < 0 ||
    config.minimumPassRate > 1
  ) {
    throw new StrategySearchJitterError(
      "INVALID_JITTER_CONFIG",
      "minimumPassRate must be in [0, 1]",
    );
  }
  if (
    typeof config.maximumScoreDropRatio !== "number" ||
    !Number.isFinite(config.maximumScoreDropRatio) ||
    config.maximumScoreDropRatio < 0
  ) {
    throw new StrategySearchJitterError(
      "INVALID_JITTER_CONFIG",
      "maximumScoreDropRatio must be >= 0",
    );
  }
  const ranges = validateSearchParameterRanges(config.parameterRanges);
  if (!ranges.ok) {
    throw new StrategySearchJitterError(
      "INVALID_JITTER_CONFIG",
      `parameterRanges invalid: ${ranges.issues[0]?.message ?? "unknown"}`,
    );
  }
}

/**
 * Deterministic sample iteration id — never collides with normal low iterations.
 */
export function jitterSampleIteration(sampleIndex: number): number {
  if (!Number.isInteger(sampleIndex) || sampleIndex < 0) {
    throw new StrategySearchJitterError(
      "INVALID_JITTER_CONFIG",
      "sampleIndex must be a non-negative integer",
      { sampleIndex },
    );
  }
  return JITTER_ITERATION_BASE + sampleIndex;
}

export function generateJitterCandidate(
  input: GenerateJitterCandidateInput,
): StrategySearchCandidate {
  validateJitterConfig({ ...input.config, enabled: true });
  const iteration = jitterSampleIteration(input.sampleIndex);

  try {
    return generateUniqueCandidate({
      mode: "local",
      existingHashes: input.existingHashes,
      maxAttempts: input.maxUniqueAttempts,
      localInput: {
        jobId: input.parentCandidate.jobId,
        iteration,
        parameterRanges: input.config.parameterRanges,
        random: input.random,
        parentCandidate: input.parentCandidate,
        mutationScale: input.config.mutationScale,
        searchVersion: "jitter-v4",
      },
    });
  } catch (err) {
    if (
      err instanceof StrategySearchGenerationError &&
      err.code === "DUPLICATE_EXHAUSTED"
    ) {
      throw new StrategySearchJitterError(
        "JITTER_DUPLICATE_EXHAUSTED",
        `unable to generate unique jitter sample ${input.sampleIndex}`,
        {
          candidateId: input.parentCandidate.candidateId,
          sampleIndex: input.sampleIndex,
          cause: err,
        },
      );
    }
    if (
      err instanceof StrategySearchGenerationError &&
      err.code === "PROTECTED_HASH_COLLISION"
    ) {
      throw new StrategySearchJitterError(
        "PROTECTED_HASH_COLLISION",
        "jitter sample collided with protected SAFE hash",
        {
          candidateId: input.parentCandidate.candidateId,
          sampleIndex: input.sampleIndex,
          cause: err,
        },
      );
    }
    throw new StrategySearchJitterError(
      "JITTER_EVALUATION_FAILED",
      err instanceof Error ? err.message : "jitter candidate generation failed",
      {
        candidateId: input.parentCandidate.candidateId,
        sampleIndex: input.sampleIndex,
        cause: err,
      },
    );
  }
}

function emptyDisabledResult(baseScore: number): StrategySearchJitterResult {
  return {
    enabled: false,
    jitterPassed: true,
    sampleCount: 0,
    passedSampleCount: 0,
    failedSampleCount: 0,
    passRate: 1,
    averageScore: null,
    minimumScore: null,
    maximumScore: null,
    averageScoreDropRatio: null,
    maximumObservedScoreDropRatio: null,
    baseScore,
    samples: [],
  };
}

export async function evaluateCandidateJitter(
  input: EvaluateCandidateJitterInput,
): Promise<StrategySearchJitterResult> {
  validateJitterConfig(input.config);

  if (!input.config.enabled) {
    return emptyDisabledResult(input.baseScore.finalScore);
  }

  if (
    input.parentCandidate.paramsHash === PROTECTED_HASH ||
    /SAFE_v44_i4060/i.test(input.parentCandidate.candidateId)
  ) {
    throw new StrategySearchJitterError(
      "PROTECTED_HASH_COLLISION",
      "parent candidate must not use protected SAFE identity",
      { candidateId: input.parentCandidate.candidateId },
    );
  }

  const random = createSeededRandom(input.config.seed);
  const existingHashes = new Set<string>([input.parentCandidate.paramsHash]);
  const samples: StrategySearchJitterSampleResult[] = [];
  const maxUniqueAttempts = Math.max(64, input.config.sampleCount * 16);

  for (let sampleIndex = 0; sampleIndex < input.config.sampleCount; sampleIndex += 1) {
    const jitterCandidate = generateJitterCandidate({
      parentCandidate: input.parentCandidate,
      config: input.config,
      sampleIndex,
      random,
      existingHashes,
      maxUniqueAttempts,
    });
    existingHashes.add(jitterCandidate.paramsHash);

    try {
      const evaluation = await evaluateCandidateAcrossWindows({
        candidate: jitterCandidate,
        symbols: input.symbols,
        timeframe: input.timeframe,
        windows: input.windows,
        balance: input.balance,
        costConfig: input.baseCostConfig,
        preloadedCandlesByKey: input.preloadedCandlesByKey,
      });
      const pass = evaluateCandidatePass({
        evaluation,
        policy: input.passPolicy,
      });
      const score = calculateCandidateScore({
        evaluation,
        weights: input.scoreWeights,
      });
      const scoreDropRatio = calculateScoreDropRatio(
        input.baseScore.finalScore,
        score.finalScore,
      );
      const required = evaluation.windows.filter((w) => w.window.requiredForPass);
      const meanTotalReturn =
        required.length === 0
          ? 0
          : required.reduce((s, w) => s + w.metrics.totalReturn, 0) /
            required.length;
      const meanMdd =
        required.length === 0
          ? 0
          : required.reduce((s, w) => s + w.metrics.mdd, 0) / required.length;

      samples.push({
        sampleIndex,
        candidateId: jitterCandidate.candidateId,
        paramsHash: jitterCandidate.paramsHash,
        pass,
        score,
        scoreDropRatio,
        evaluationSummary: {
          windowCount: evaluation.windows.length,
          symbolCount: evaluation.symbols.length,
          meanTotalReturn,
          meanMdd,
          durationMs: evaluation.durationMs,
        },
      });
    } catch (err) {
      if (err instanceof StrategySearchJitterError) throw err;
      throw new StrategySearchJitterError(
        "JITTER_EVALUATION_FAILED",
        err instanceof Error ? err.message : "jitter evaluation failed",
        {
          candidateId: input.parentCandidate.candidateId,
          sampleIndex,
          cause: err,
        },
      );
    }
  }

  const passedSampleCount = samples.filter((s) => s.pass.passed).length;
  const failedSampleCount = samples.length - passedSampleCount;
  const scores = samples.map((s) => s.score.finalScore);
  const drops = samples.map((s) => s.scoreDropRatio);
  const passRate = samples.length === 0 ? 0 : passedSampleCount / samples.length;
  const averageScore =
    scores.length === 0
      ? null
      : scores.reduce((a, b) => a + b, 0) / scores.length;
  const minimumScore = scores.length === 0 ? null : Math.min(...scores);
  const maximumScore = scores.length === 0 ? null : Math.max(...scores);
  const averageScoreDropRatio =
    drops.length === 0
      ? null
      : drops.reduce((a, b) => a + b, 0) / drops.length;
  const maximumObservedScoreDropRatio =
    drops.length === 0 ? null : Math.max(...drops);

  const jitterPassed =
    passRate >= input.config.minimumPassRate &&
    (maximumObservedScoreDropRatio ?? 0) <= input.config.maximumScoreDropRatio;

  return {
    enabled: true,
    jitterPassed,
    sampleCount: samples.length,
    passedSampleCount,
    failedSampleCount,
    passRate,
    averageScore,
    minimumScore,
    maximumScore,
    averageScoreDropRatio,
    maximumObservedScoreDropRatio,
    baseScore: input.baseScore.finalScore,
    samples,
  };
}
