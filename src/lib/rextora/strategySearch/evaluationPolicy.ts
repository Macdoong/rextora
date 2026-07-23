/**
 * PASS policy and deterministic scoring for strategy search (Phase 4).
 * Uses only Phase 3 StrategySearchWindowMetrics — no invented ratios.
 */

import type {
  StrategySearchCandidateEvaluation,
  StrategySearchPassIssue,
  StrategySearchPassPolicy,
  StrategySearchPassResult,
  StrategySearchScoreBreakdown,
  StrategySearchScoreResult,
  StrategySearchScoreWeights,
  StrategySearchThresholdRule,
  StrategySearchWindowEvaluation,
  StrategySearchWindowMetrics,
} from "./types";

export class StrategySearchEvaluationPolicyError extends Error {
  readonly code:
    | "INVALID_PASS_POLICY"
    | "MISSING_REQUIRED_METRIC"
    | "INVALID_SCORE_WEIGHTS";
  readonly candidateId: string | null;
  readonly symbol: string | null;
  readonly windowId: string | null;

  constructor(
    code: StrategySearchEvaluationPolicyError["code"],
    message: string,
    context?: {
      candidateId?: string | null;
      symbol?: string | null;
      windowId?: string | null;
    },
  ) {
    super(message);
    this.name = "StrategySearchEvaluationPolicyError";
    this.code = code;
    this.candidateId = context?.candidateId ?? null;
    this.symbol = context?.symbol ?? null;
    this.windowId = context?.windowId ?? null;
  }
}

export interface EvaluateCandidatePassInput {
  evaluation: StrategySearchCandidateEvaluation;
  policy: StrategySearchPassPolicy;
}

export interface CalculateCandidateScoreInput {
  evaluation: StrategySearchCandidateEvaluation;
  weights: StrategySearchScoreWeights;
}

const THRESHOLD_KEYS: Array<keyof StrategySearchThresholdRule> = [
  "minTotalReturn",
  "maxMdd",
  "minTradeCount",
  "minWinRate",
  "minProfitFactor",
  "maxNegativeMonths",
  "minEndingBalance",
  "minMonthlyReturn",
  "maxMonthlyReturnDispersion",
];

function isFiniteNumber(n: unknown): n is number {
  return typeof n === "number" && Number.isFinite(n);
}

function clamp(n: number, lo: number, hi: number): number {
  if (n < lo) return lo;
  if (n > hi) return hi;
  return n;
}

/** Population standard deviation; 0 for fewer than 2 values. */
export function populationStdev(values: number[]): number {
  if (values.length < 2) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  let sumSq = 0;
  for (const v of values) {
    const d = v - mean;
    sumSq += d * d;
  }
  return Math.sqrt(sumSq / values.length);
}

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function freezeWeights(
  weights: StrategySearchScoreWeights,
): StrategySearchScoreWeights {
  return Object.freeze({
    returnWeight: weights.returnWeight,
    mddWeight: weights.mddWeight,
    profitFactorWeight: weights.profitFactorWeight,
    winRateWeight: weights.winRateWeight,
    tradeAdequacyWeight: weights.tradeAdequacyWeight,
    negativeMonthWeight: weights.negativeMonthWeight,
    consistencyWeight: weights.consistencyWeight,
    ...(weights.tradeAdequacyReference != null
      ? { tradeAdequacyReference: weights.tradeAdequacyReference }
      : {}),
  });
}

export function validatePassPolicy(policy: StrategySearchPassPolicy): void {
  if (!policy || typeof policy !== "object" || !policy.thresholds) {
    throw new StrategySearchEvaluationPolicyError(
      "INVALID_PASS_POLICY",
      "pass policy must include thresholds",
    );
  }
  const t = policy.thresholds;
  for (const key of THRESHOLD_KEYS) {
    const value = t[key];
    if (value == null) continue;
    if (typeof value !== "number" || !Number.isFinite(value)) {
      throw new StrategySearchEvaluationPolicyError(
        "INVALID_PASS_POLICY",
        `threshold ${key} must be a finite number or null`,
      );
    }
  }
}

function requireMetric(
  metrics: StrategySearchWindowMetrics,
  key: keyof StrategySearchWindowMetrics,
  ctx: { candidateId: string; symbol: string; windowId: string },
): number {
  const value = metrics[key];
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new StrategySearchEvaluationPolicyError(
      "MISSING_REQUIRED_METRIC",
      `missing required metric: ${String(key)}`,
      ctx,
    );
  }
  return value;
}

function issue(
  code: string,
  symbol: string,
  windowId: string,
  metric: string,
  actual: number | string | boolean | null,
  expected: number | string | boolean | null,
  message: string,
): StrategySearchPassIssue {
  return { code, symbol, windowId, metric, actual, expected, message };
}

function evaluateWindowThresholds(
  windowEval: StrategySearchWindowEvaluation,
  thresholds: StrategySearchThresholdRule,
  candidateId: string,
): StrategySearchPassIssue[] {
  const issues: StrategySearchPassIssue[] = [];
  const { metrics, symbol, window } = windowEval;
  const windowId = window.id;
  const ctx = { candidateId, symbol, windowId };

  const checkMin = (
    metric: keyof StrategySearchWindowMetrics,
    threshold: number | null | undefined,
    code: string,
  ) => {
    if (threshold == null) return;
    const actual = requireMetric(metrics, metric, ctx);
    if (!(actual >= threshold)) {
      issues.push(
        issue(
          code,
          symbol,
          windowId,
          String(metric),
          actual,
          threshold,
          `${String(metric)} ${actual} < minimum ${threshold}`,
        ),
      );
    }
  };

  const checkMax = (
    metric: keyof StrategySearchWindowMetrics,
    threshold: number | null | undefined,
    code: string,
  ) => {
    if (threshold == null) return;
    const actual = requireMetric(metrics, metric, ctx);
    if (!(actual <= threshold)) {
      issues.push(
        issue(
          code,
          symbol,
          windowId,
          String(metric),
          actual,
          threshold,
          `${String(metric)} ${actual} > maximum ${threshold}`,
        ),
      );
    }
  };

  checkMin("totalReturn", thresholds.minTotalReturn, "MIN_TOTAL_RETURN");
  checkMin("trades", thresholds.minTradeCount, "MIN_TRADE_COUNT");
  checkMin("winRate", thresholds.minWinRate, "MIN_WIN_RATE");
  checkMin("profitFactor", thresholds.minProfitFactor, "MIN_PROFIT_FACTOR");
  checkMin("endingBalance", thresholds.minEndingBalance, "MIN_ENDING_BALANCE");
  checkMax(
    "negativeMonths",
    thresholds.maxNegativeMonths,
    "MAX_NEGATIVE_MONTHS",
  );

  /*
   * Verified MDD convention (backtestReport.aggregateBacktestMetrics):
   * mdd is Math.min over (equity - peak) / peak → non-positive fraction.
   * Pass when metrics.mdd >= policy.maxMdd (less drawdown = larger algebraically).
   */
  if (thresholds.maxMdd != null) {
    const actual = requireMetric(metrics, "mdd", ctx);
    if (!(actual >= thresholds.maxMdd)) {
      issues.push(
        issue(
          "MAX_MDD",
          symbol,
          windowId,
          "mdd",
          actual,
          thresholds.maxMdd,
          `mdd ${actual} is worse than maxMdd ${thresholds.maxMdd}`,
        ),
      );
    }
  }

  if (thresholds.minMonthlyReturn != null) {
    if (!Array.isArray(metrics.monthlyReturns)) {
      throw new StrategySearchEvaluationPolicyError(
        "MISSING_REQUIRED_METRIC",
        "missing required metric: monthlyReturns",
        ctx,
      );
    }
    for (const row of metrics.monthlyReturns) {
      if (!isFiniteNumber(row.returnPct)) {
        throw new StrategySearchEvaluationPolicyError(
          "MISSING_REQUIRED_METRIC",
          "missing monthlyReturns.returnPct",
          ctx,
        );
      }
      if (!(row.returnPct >= thresholds.minMonthlyReturn)) {
        issues.push(
          issue(
            "MIN_MONTHLY_RETURN",
            symbol,
            windowId,
            "monthlyReturns.returnPct",
            row.returnPct,
            thresholds.minMonthlyReturn,
            `month ${row.month} returnPct ${row.returnPct} < ${thresholds.minMonthlyReturn}`,
          ),
        );
      }
    }
  }

  if (thresholds.maxMonthlyReturnDispersion != null) {
    if (!Array.isArray(metrics.monthlyReturns)) {
      throw new StrategySearchEvaluationPolicyError(
        "MISSING_REQUIRED_METRIC",
        "missing required metric: monthlyReturns",
        ctx,
      );
    }
    const returns = metrics.monthlyReturns.map((r) => {
      if (!isFiniteNumber(r.returnPct)) {
        throw new StrategySearchEvaluationPolicyError(
          "MISSING_REQUIRED_METRIC",
          "missing monthlyReturns.returnPct",
          ctx,
        );
      }
      return r.returnPct;
    });
    const dispersion = populationStdev(returns);
    if (!(dispersion <= thresholds.maxMonthlyReturnDispersion)) {
      issues.push(
        issue(
          "MAX_MONTHLY_RETURN_DISPERSION",
          symbol,
          windowId,
          "monthlyReturns.dispersion",
          dispersion,
          thresholds.maxMonthlyReturnDispersion,
          `monthly return dispersion ${dispersion} > ${thresholds.maxMonthlyReturnDispersion}`,
        ),
      );
    }
  }

  return issues;
}

/**
 * Count windows with requiredForPass === true.
 * Throws INVALID_PASS_POLICY when the count is zero.
 */
export function assertHasRequiredEvaluationWindows(
  evaluation: StrategySearchCandidateEvaluation,
): number {
  if (!evaluation || !Array.isArray(evaluation.windows)) {
    throw new StrategySearchEvaluationPolicyError(
      "INVALID_PASS_POLICY",
      "evaluation.windows must be an array",
      { candidateId: evaluation?.candidateId ?? null },
    );
  }
  let requiredWindowCount = 0;
  for (const windowEval of evaluation.windows) {
    if (windowEval.window.requiredForPass === true) {
      requiredWindowCount += 1;
    }
  }
  if (requiredWindowCount === 0) {
    throw new StrategySearchEvaluationPolicyError(
      "INVALID_PASS_POLICY",
      "no required evaluation window exists (requiredForPass === true)",
      { candidateId: evaluation.candidateId },
    );
  }
  return requiredWindowCount;
}

/**
 * Evaluate PASS against required windows only (requiredForPass === true).
 * Optional windows never cause final failure.
 * Zero required windows → INVALID_PASS_POLICY (never passed = true).
 */
export function evaluateCandidatePass(
  input: EvaluateCandidatePassInput,
): StrategySearchPassResult {
  validatePassPolicy(input.policy);
  if (!input.evaluation || !Array.isArray(input.evaluation.windows)) {
    throw new StrategySearchEvaluationPolicyError(
      "INVALID_PASS_POLICY",
      "evaluation.windows must be an array",
      { candidateId: input.evaluation?.candidateId ?? null },
    );
  }

  assertHasRequiredEvaluationWindows(input.evaluation);

  const candidateId = input.evaluation.candidateId;
  const issues: StrategySearchPassIssue[] = [];
  let requiredWindowCount = 0;
  let passedRequiredWindowCount = 0;
  let failedRequiredWindowCount = 0;

  // Preserve symbol/window evaluation order from Phase 3 result.
  for (const windowEval of input.evaluation.windows) {
    if (!windowEval.window.requiredForPass) continue;
    requiredWindowCount += 1;
    const windowIssues = evaluateWindowThresholds(
      windowEval,
      input.policy.thresholds,
      candidateId,
    );
    if (windowIssues.length === 0) {
      passedRequiredWindowCount += 1;
    } else {
      failedRequiredWindowCount += 1;
      issues.push(...windowIssues);
    }
  }

  return {
    passed: failedRequiredWindowCount === 0,
    requiredWindowCount,
    passedRequiredWindowCount,
    failedRequiredWindowCount,
    issues,
  };
}

export function validateScoreWeights(weights: StrategySearchScoreWeights): void {
  if (!weights || typeof weights !== "object") {
    throw new StrategySearchEvaluationPolicyError(
      "INVALID_SCORE_WEIGHTS",
      "score weights must be an object",
    );
  }
  const entries: Array<[string, number | undefined]> = [
    ["returnWeight", weights.returnWeight],
    ["mddWeight", weights.mddWeight],
    ["profitFactorWeight", weights.profitFactorWeight],
    ["winRateWeight", weights.winRateWeight],
    ["tradeAdequacyWeight", weights.tradeAdequacyWeight],
    ["negativeMonthWeight", weights.negativeMonthWeight],
    ["consistencyWeight", weights.consistencyWeight],
  ];
  for (const [name, value] of entries) {
    if (typeof value !== "number" || !Number.isFinite(value)) {
      throw new StrategySearchEvaluationPolicyError(
        "INVALID_SCORE_WEIGHTS",
        `${name} must be a finite number`,
      );
    }
    if (value < 0) {
      throw new StrategySearchEvaluationPolicyError(
        "INVALID_SCORE_WEIGHTS",
        `${name} must be non-negative`,
      );
    }
  }
  if (
    weights.tradeAdequacyReference != null &&
    (!Number.isFinite(weights.tradeAdequacyReference) ||
      weights.tradeAdequacyReference <= 0)
  ) {
    throw new StrategySearchEvaluationPolicyError(
      "INVALID_SCORE_WEIGHTS",
      "tradeAdequacyReference must be a positive finite number when set",
    );
  }
}

/**
 * Score formula (required windows only; optional windows ignored):
 *
 * Let R = mean(totalReturn), M = mean(mdd), P = mean(profitFactor),
 * W = mean(winRate), T = mean(trades), N = mean(negativeMonths),
 * C = populationStdev(totalReturn across required windows).
 *
 * Normalized components (clamped):
 *   returnReward          = clamp(R, -1, 2)
 *   mddPenalty            = clamp(abs(M), 0, 2)     // engine MDD ≤ 0
 *   profitFactorReward    = clamp((P - 1) / 2, -1, 2)
 *   winRateReward         = clamp(W, 0, 1)
 *   tradeAdequacy         = clamp(T / tradeRef, 0, 2) - 1   // in [-1, 1]
 *   negativeMonthPenalty  = clamp(N / 12, 0, 2)
 *   consistency           = clamp(C, 0, 2)          // lower dispersion is better
 *
 * finalScore =
 *   + returnWeight        * returnReward
 *   - mddWeight           * mddPenalty
 *   + profitFactorWeight  * profitFactorReward
 *   + winRateWeight       * winRateReward
 *   + tradeAdequacyWeight * tradeAdequacy
 *   - negativeMonthWeight * negativeMonthPenalty
 *   - consistencyWeight   * consistency
 *
 * Does not use candidateId, iteration, wall clock, or filesystem.
 */
export function calculateCandidateScore(
  input: CalculateCandidateScoreInput,
): StrategySearchScoreResult {
  validateScoreWeights(input.weights);
  if (!input.evaluation || !Array.isArray(input.evaluation.windows)) {
    throw new StrategySearchEvaluationPolicyError(
      "INVALID_PASS_POLICY",
      "evaluation.windows must be an array",
      { candidateId: input.evaluation?.candidateId ?? null },
    );
  }

  // Empty required set must not yield a valid-looking score.
  assertHasRequiredEvaluationWindows(input.evaluation);

  const required = input.evaluation.windows.filter(
    (w) => w.window.requiredForPass,
  );
  const returns: number[] = [];
  const mdds: number[] = [];
  const pfs: number[] = [];
  const winRates: number[] = [];
  const trades: number[] = [];
  const negMonths: number[] = [];

  for (const w of required) {
    const ctx = {
      candidateId: input.evaluation.candidateId,
      symbol: w.symbol,
      windowId: w.window.id,
    };
    returns.push(requireMetric(w.metrics, "totalReturn", ctx));
    mdds.push(requireMetric(w.metrics, "mdd", ctx));
    pfs.push(requireMetric(w.metrics, "profitFactor", ctx));
    winRates.push(requireMetric(w.metrics, "winRate", ctx));
    trades.push(requireMetric(w.metrics, "trades", ctx));
    negMonths.push(requireMetric(w.metrics, "negativeMonths", ctx));
  }

  const tradeRef =
    input.weights.tradeAdequacyReference != null &&
    input.weights.tradeAdequacyReference > 0
      ? input.weights.tradeAdequacyReference
      : 20;

  const returnReward = clamp(mean(returns), -1, 2);
  const mddPenalty = clamp(Math.abs(mean(mdds)), 0, 2);
  const profitFactorReward = clamp((mean(pfs) - 1) / 2, -1, 2);
  const winRateReward = clamp(mean(winRates), 0, 1);
  const tradeAdequacy = clamp(mean(trades) / tradeRef, 0, 2) - 1;
  const negativeMonthPenalty = clamp(mean(negMonths) / 12, 0, 2);
  const consistency = clamp(populationStdev(returns), 0, 2);

  const weightedReturn = input.weights.returnWeight * returnReward;
  const weightedMdd = input.weights.mddWeight * mddPenalty;
  const weightedProfitFactor =
    input.weights.profitFactorWeight * profitFactorReward;
  const weightedWinRate = input.weights.winRateWeight * winRateReward;
  const weightedTradeAdequacy =
    input.weights.tradeAdequacyWeight * tradeAdequacy;
  const weightedNegativeMonth =
    input.weights.negativeMonthWeight * negativeMonthPenalty;
  const weightedConsistency = input.weights.consistencyWeight * consistency;

  const finalScore =
    weightedReturn -
    weightedMdd +
    weightedProfitFactor +
    weightedWinRate +
    weightedTradeAdequacy -
    weightedNegativeMonth -
    weightedConsistency;

  if (!Number.isFinite(finalScore)) {
    throw new StrategySearchEvaluationPolicyError(
      "INVALID_SCORE_WEIGHTS",
      "score calculation produced a non-finite result",
      { candidateId: input.evaluation.candidateId },
    );
  }

  const breakdown: StrategySearchScoreBreakdown = {
    returnReward,
    mddPenalty,
    profitFactorReward,
    winRateReward,
    tradeAdequacy,
    negativeMonthPenalty,
    consistency,
    weightedReturn,
    weightedMdd,
    weightedProfitFactor,
    weightedWinRate,
    weightedTradeAdequacy,
    weightedNegativeMonth,
    weightedConsistency,
  };

  return {
    finalScore: Number(finalScore.toFixed(8)),
    breakdown,
    weights: freezeWeights(input.weights),
    requiredWindowCount: required.length,
  };
}
