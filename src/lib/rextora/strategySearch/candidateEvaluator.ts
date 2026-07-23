/**
 * Complete single-candidate evaluation orchestration (Phase 4).
 * Order: base → pass → score → cost stress → jitter. No persistence.
 */

import type { OhlcvCandle } from "../data/ohlcvTypes";
import { isLockedSafeHash } from "../strategy/strategyHash";
import {
  StrategySearchAdapterError,
  evaluateCandidateAcrossWindows,
} from "./backtestAdapter";
import {
  evaluateCostStress,
  validateCostStressScenarios,
} from "./costStress";
import {
  StrategySearchEvaluationPolicyError,
  assertHasRequiredEvaluationWindows,
  calculateCandidateScore,
  evaluateCandidatePass,
  validatePassPolicy,
  validateScoreWeights,
} from "./evaluationPolicy";
import {
  StrategySearchJitterError,
  evaluateCandidateJitter,
  validateJitterConfig,
} from "./jitterEvaluator";
import type {
  StrategySearchBacktestCostConfig,
  StrategySearchCandidate,
  StrategySearchCompleteCandidateEvaluation,
  StrategySearchCostStressScenario,
  StrategySearchEvaluationWindowPlan,
  StrategySearchJitterConfig,
  StrategySearchPassPolicy,
  StrategySearchScoreWeights,
} from "./types";

const PROTECTED_STRATEGY_ID = "SAFE_v44_i4060";
const PROTECTED_HASH = "7893ca3f0e30";

export class StrategySearchCompleteEvaluationError extends Error {
  readonly code:
    | "COMPLETE_EVALUATION_FAILED"
    | "PROTECTED_HASH_COLLISION"
    | "INVALID_PASS_POLICY"
    | "INVALID_SCORE_WEIGHTS"
    | "INVALID_STRESS_SCENARIO"
    | "INVALID_JITTER_CONFIG";
  readonly candidateId: string | null;
  readonly cause: unknown;

  constructor(
    code: StrategySearchCompleteEvaluationError["code"],
    message: string,
    context?: { candidateId?: string | null; cause?: unknown },
  ) {
    super(message);
    this.name = "StrategySearchCompleteEvaluationError";
    this.code = code;
    this.candidateId = context?.candidateId ?? null;
    this.cause = context?.cause;
  }
}

export interface EvaluateCompleteCandidateInput {
  candidate: StrategySearchCandidate;
  symbols: string[];
  timeframe: string;
  windows: readonly StrategySearchEvaluationWindowPlan[];
  balance: number;
  baseCostConfig: StrategySearchBacktestCostConfig;
  passPolicy: StrategySearchPassPolicy;
  scoreWeights: StrategySearchScoreWeights;
  costStressScenarios: StrategySearchCostStressScenario[];
  jitterConfig: StrategySearchJitterConfig;
  preloadedCandlesByKey?: Record<string, OhlcvCandle[]>;
}

function assertCandidateIdentity(candidate: StrategySearchCandidate): void {
  if (!candidate || typeof candidate !== "object") {
    throw new StrategySearchCompleteEvaluationError(
      "COMPLETE_EVALUATION_FAILED",
      "candidate must be an object",
    );
  }
  if (
    candidate.candidateId === PROTECTED_STRATEGY_ID ||
    /SAFE_v44_i4060/i.test(candidate.candidateId)
  ) {
    throw new StrategySearchCompleteEvaluationError(
      "PROTECTED_HASH_COLLISION",
      "candidateId must not reference the protected SAFE strategy",
      { candidateId: candidate.candidateId },
    );
  }
  if (
    isLockedSafeHash(candidate.paramsHash) ||
    candidate.paramsHash === PROTECTED_HASH
  ) {
    throw new StrategySearchCompleteEvaluationError(
      "PROTECTED_HASH_COLLISION",
      "candidate paramsHash collides with protected SAFE hash",
      { candidateId: candidate.candidateId },
    );
  }
}

/**
 * Deterministic complete evaluation gate order:
 * 1) validate candidate and inputs
 * 2) base multi-window backtest
 * 3) verify at least one required window exists
 * 4) base PASS
 * 5) base score
 * 6) cost stress scenarios
 * 7) jitter (when enabled)
 * 8) final decision
 *
 * Zero required windows → INVALID_PASS_POLICY before score/stress/jitter.
 * finalPassed = basePass && costStressPassed && (jitter disabled || jitterPassed)
 * Date.now is used only for operational timestamps / durationMs.
 */
export async function evaluateCompleteCandidate(
  input: EvaluateCompleteCandidateInput,
): Promise<StrategySearchCompleteCandidateEvaluation> {
  const startedAtMs = Date.now();
  const startedAt = new Date(startedAtMs).toISOString();

  try {
    // 1. Validate
    assertCandidateIdentity(input.candidate);
    validatePassPolicy(input.passPolicy);
    validateScoreWeights(input.scoreWeights);
    validateCostStressScenarios(input.costStressScenarios);
    validateJitterConfig(input.jitterConfig);

    // 2. Base evaluation
    const baseEvaluation = await evaluateCandidateAcrossWindows({
      candidate: input.candidate,
      symbols: input.symbols,
      timeframe: input.timeframe,
      windows: input.windows,
      balance: input.balance,
      costConfig: input.baseCostConfig,
      preloadedCandlesByKey: input.preloadedCandlesByKey,
    });

    // 3. Required-window gate (short-circuits score / stress / jitter)
    assertHasRequiredEvaluationWindows(baseEvaluation);

    // 4. Base PASS
    const basePass = evaluateCandidatePass({
      evaluation: baseEvaluation,
      policy: input.passPolicy,
    });

    // 5. Base score
    const baseScore = calculateCandidateScore({
      evaluation: baseEvaluation,
      weights: input.scoreWeights,
    });

    // 6. Cost stress
    const costStressResults = await evaluateCostStress({
      candidate: input.candidate,
      symbols: input.symbols,
      timeframe: input.timeframe,
      windows: input.windows,
      balance: input.balance,
      baseCostConfig: input.baseCostConfig,
      scenarios: input.costStressScenarios,
      passPolicy: input.passPolicy,
      scoreWeights: input.scoreWeights,
      preloadedCandlesByKey: input.preloadedCandlesByKey,
    });

    const costStressPassed = costStressResults.every(
      (r) => !r.scenario.requiredForPass || r.passed,
    );

    // 7. Jitter (optional)
    const jitterResult = await evaluateCandidateJitter({
      parentCandidate: input.candidate,
      baseEvaluation,
      baseScore,
      symbols: input.symbols,
      timeframe: input.timeframe,
      windows: input.windows,
      balance: input.balance,
      baseCostConfig: input.baseCostConfig,
      passPolicy: input.passPolicy,
      scoreWeights: input.scoreWeights,
      config: input.jitterConfig,
      preloadedCandlesByKey: input.preloadedCandlesByKey,
    });

    // 8. Final decision
    const finalPassed =
      basePass.passed &&
      costStressPassed &&
      (!jitterResult.enabled || jitterResult.jitterPassed);

    const completedAtMs = Date.now();
    return {
      candidateId: input.candidate.candidateId,
      paramsHash: input.candidate.paramsHash,
      baseEvaluation,
      basePass,
      baseScore,
      costStressResults,
      costStressPassed,
      jitterResult,
      finalPassed,
      startedAt,
      completedAt: new Date(completedAtMs).toISOString(),
      durationMs: completedAtMs - startedAtMs,
    };
  } catch (err) {
    if (err instanceof StrategySearchCompleteEvaluationError) throw err;
    if (err instanceof StrategySearchAdapterError) throw err;
    if (err instanceof StrategySearchEvaluationPolicyError) throw err;
    if (err instanceof StrategySearchJitterError) throw err;

    throw new StrategySearchCompleteEvaluationError(
      "COMPLETE_EVALUATION_FAILED",
      err instanceof Error ? err.message : "complete evaluation failed",
      {
        candidateId: input.candidate?.candidateId ?? null,
        cause: err,
      },
    );
  }
}
