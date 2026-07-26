/**
 * Serializable job-run statistics (Phase 5).
 * Pure updates — no I/O, no mutation of input objects.
 */

export interface StrategySearchJobStatistics {
  generated: number;
  evaluated: number;
  passed: number;
  failed: number;
  stressPassed: number;
  jitterPassed: number;
  duplicates: number;
  errors: number;
  bestScore: number | null;
  /** Running mean of evaluated scores (null when evaluated === 0). */
  averageScore: number | null;
  /** Sum of scores for averageScore recomputation. */
  scoreSum: number;
  elapsedMs: number;
  /** Estimated remaining ms; null when unknown. */
  remainingEstimateMs: number | null;
}

export function createEmptyJobStatistics(): StrategySearchJobStatistics {
  return {
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
  };
}

function cloneStats(
  stats: StrategySearchJobStatistics,
): StrategySearchJobStatistics {
  return { ...stats };
}

export function recordGenerated(
  stats: StrategySearchJobStatistics,
): StrategySearchJobStatistics {
  const next = cloneStats(stats);
  next.generated += 1;
  return next;
}

export function recordDuplicate(
  stats: StrategySearchJobStatistics,
): StrategySearchJobStatistics {
  const next = cloneStats(stats);
  next.duplicates += 1;
  return next;
}

export function recordError(
  stats: StrategySearchJobStatistics,
): StrategySearchJobStatistics {
  const next = cloneStats(stats);
  next.errors += 1;
  return next;
}

export interface RecordEvaluationStatsInput {
  score: number | null;
  passed: boolean;
  stressPassed: boolean;
  jitterPassed: boolean | null;
  /** When true, count as failed evaluation (recoverable candidate failure). */
  evaluationFailed?: boolean;
}

export function recordEvaluation(
  stats: StrategySearchJobStatistics,
  input: RecordEvaluationStatsInput,
): StrategySearchJobStatistics {
  const next = cloneStats(stats);
  next.evaluated += 1;
  if (input.evaluationFailed) {
    next.failed += 1;
  } else if (input.passed) {
    next.passed += 1;
  } else {
    next.failed += 1;
  }
  if (input.stressPassed) next.stressPassed += 1;
  if (input.jitterPassed === true) next.jitterPassed += 1;

  if (typeof input.score === "number" && Number.isFinite(input.score)) {
    next.scoreSum += input.score;
    next.averageScore = next.scoreSum / next.evaluated;
    if (next.bestScore == null || input.score > next.bestScore) {
      next.bestScore = input.score;
    }
  }
  return next;
}

export function recordElapsed(
  stats: StrategySearchJobStatistics,
  elapsedMs: number,
  completedIterations: number,
  maxIterations: number | null,
): StrategySearchJobStatistics {
  const next = cloneStats(stats);
  next.elapsedMs = Math.max(0, elapsedMs);
  if (
    maxIterations != null &&
    maxIterations > 0 &&
    completedIterations > 0 &&
    completedIterations < maxIterations
  ) {
    const remaining = maxIterations - completedIterations;
    const perIter = next.elapsedMs / completedIterations;
    next.remainingEstimateMs = Math.round(perIter * remaining);
  } else if (maxIterations != null && completedIterations >= maxIterations) {
    next.remainingEstimateMs = 0;
  } else {
    next.remainingEstimateMs = null;
  }
  return next;
}

/**
 * Whether candidateScore should replace the current best.
 * Never overwrites with a worse (lower) score. Null never beats a number.
 */
export function isBetterScore(
  currentBest: number | null,
  candidateScore: number | null,
): boolean {
  if (candidateScore == null || !Number.isFinite(candidateScore)) return false;
  if (currentBest == null || !Number.isFinite(currentBest)) return true;
  return candidateScore > currentBest;
}

/**
 * Canonical UI counters.
 *
 * Invariant:
 *   evaluated = qualified + rejected + evaluationErrors
 *
 * where:
 *   qualified = passed
 *   evaluationErrors = errors  (subset of failed; evaluation exceptions)
 *   rejected = failed - errors (gate failures without thrown errors)
 *
 * `failed` and `errors` must not be shown as independent additive totals.
 */
export interface StrategySearchCanonicalCounters {
  evaluated: number;
  qualified: number;
  rejected: number;
  evaluationErrors: number;
  /** failed = rejected + evaluationErrors (diagnostic) */
  failed: number;
  invariantOk: boolean;
  equation: string;
}

export function deriveCanonicalCounters(
  stats: Pick<
    StrategySearchJobStatistics,
    "evaluated" | "passed" | "failed" | "errors"
  >,
): StrategySearchCanonicalCounters {
  const evaluated = Math.max(0, stats.evaluated);
  const qualified = Math.max(0, stats.passed);
  const failed = Math.max(0, stats.failed);
  const evaluationErrors = Math.min(failed, Math.max(0, stats.errors));
  const rejected = Math.max(0, failed - evaluationErrors);
  const sum = qualified + rejected + evaluationErrors;
  const invariantOk = sum === evaluated;
  return {
    evaluated,
    qualified,
    rejected,
    evaluationErrors,
    failed,
    invariantOk,
    equation:
      "evaluated = qualified + rejected + evaluationErrors (failed = rejected + evaluationErrors)",
  };
}

export function assertCanonicalCounterInvariant(
  stats: Pick<
    StrategySearchJobStatistics,
    "evaluated" | "passed" | "failed" | "errors"
  >,
): void {
  const c = deriveCanonicalCounters(stats);
  if (!c.invariantOk) {
    throw new Error(
      `strategy-search counter invariant violated: evaluated=${c.evaluated} qualified=${c.qualified} rejected=${c.rejected} evaluationErrors=${c.evaluationErrors}`,
    );
  }
}
