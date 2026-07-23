/**
 * Cost-stress evaluation for strategy search (Phase 4 / 4.1 / 4.2).
 * Each scenario multiplies the original base fee/slippage rates independently.
 * cost_guard_k ownership: candidate.params.cost_guard_k * scenario.costGuardKMultiplier
 * via stress-only adapter path (never public base cost config).
 */

import type { OhlcvCandle } from "../data/ohlcvTypes";
import { evaluateCandidateAcrossWindowsForStress } from "./backtestAdapter";
import {
  calculateCandidateScore,
  evaluateCandidatePass,
} from "./evaluationPolicy";
import type {
  StrategySearchBacktestCostConfig,
  StrategySearchCandidate,
  StrategySearchCostStressResult,
  StrategySearchCostStressScenario,
  StrategySearchEvaluationWindowPlan,
  StrategySearchPassPolicy,
  StrategySearchScoreWeights,
  StrategySearchStressRuntimeCostConfig,
} from "./types";

export class StrategySearchCostStressError extends Error {
  readonly code: "INVALID_STRESS_SCENARIO" | "COST_STRESS_FAILED";
  readonly candidateId: string | null;
  readonly scenarioId: string | null;
  readonly cause: unknown;

  constructor(
    code: StrategySearchCostStressError["code"],
    message: string,
    context?: {
      candidateId?: string | null;
      scenarioId?: string | null;
      cause?: unknown;
    },
  ) {
    super(message);
    this.name = "StrategySearchCostStressError";
    this.code = code;
    this.candidateId = context?.candidateId ?? null;
    this.scenarioId = context?.scenarioId ?? null;
    this.cause = context?.cause;
  }
}

export interface EvaluateCostStressInput {
  candidate: StrategySearchCandidate;
  symbols: string[];
  timeframe: string;
  windows: readonly StrategySearchEvaluationWindowPlan[];
  balance: number;
  baseCostConfig: StrategySearchBacktestCostConfig;
  scenarios: StrategySearchCostStressScenario[];
  passPolicy: StrategySearchPassPolicy;
  scoreWeights: StrategySearchScoreWeights;
  preloadedCandlesByKey?: Record<string, OhlcvCandle[]>;
}

function isFiniteNumber(n: unknown): n is number {
  return typeof n === "number" && Number.isFinite(n);
}

function resolveCandidateCostGuardK(
  candidate: StrategySearchCandidate,
  scenarioId?: string | null,
): number {
  const raw = candidate.params.cost_guard_k;
  if (typeof raw !== "number" || !Number.isFinite(raw) || raw <= 0) {
    throw new StrategySearchCostStressError(
      "INVALID_STRESS_SCENARIO",
      "candidate.params.cost_guard_k must be a finite number > 0",
      { candidateId: candidate.candidateId, scenarioId: scenarioId ?? null },
    );
  }
  return raw;
}

export function validateCostStressScenarios(
  scenarios: StrategySearchCostStressScenario[],
): void {
  if (!Array.isArray(scenarios)) {
    throw new StrategySearchCostStressError(
      "INVALID_STRESS_SCENARIO",
      "scenarios must be an array",
    );
  }
  const seen = new Set<string>();
  for (const scenario of scenarios) {
    if (!scenario || typeof scenario !== "object") {
      throw new StrategySearchCostStressError(
        "INVALID_STRESS_SCENARIO",
        "each scenario must be an object",
      );
    }
    if (typeof scenario.id !== "string" || scenario.id.trim() === "") {
      throw new StrategySearchCostStressError(
        "INVALID_STRESS_SCENARIO",
        "scenario id must be a non-empty string",
        { scenarioId: scenario.id ?? null },
      );
    }
    if (seen.has(scenario.id)) {
      throw new StrategySearchCostStressError(
        "INVALID_STRESS_SCENARIO",
        `duplicate scenario id: ${scenario.id}`,
        { scenarioId: scenario.id },
      );
    }
    seen.add(scenario.id);
    if (typeof scenario.label !== "string") {
      throw new StrategySearchCostStressError(
        "INVALID_STRESS_SCENARIO",
        "scenario label must be a string",
        { scenarioId: scenario.id },
      );
    }
    if (typeof scenario.requiredForPass !== "boolean") {
      throw new StrategySearchCostStressError(
        "INVALID_STRESS_SCENARIO",
        "scenario requiredForPass must be a boolean",
        { scenarioId: scenario.id },
      );
    }
    const nonNegative: Array<[string, number]> = [
      ["feeMultiplier", scenario.feeMultiplier],
      ["slippageMultiplier", scenario.slippageMultiplier],
      ["fundingMultiplier", scenario.fundingMultiplier],
      ["spreadMultiplier", scenario.spreadMultiplier],
    ];
    for (const [name, value] of nonNegative) {
      if (!isFiniteNumber(value)) {
        throw new StrategySearchCostStressError(
          "INVALID_STRESS_SCENARIO",
          `${name} must be a finite number`,
          { scenarioId: scenario.id },
        );
      }
      if (value < 0) {
        throw new StrategySearchCostStressError(
          "INVALID_STRESS_SCENARIO",
          `${name} must be >= 0`,
          { scenarioId: scenario.id },
        );
      }
    }
    if (!isFiniteNumber(scenario.costGuardKMultiplier)) {
      throw new StrategySearchCostStressError(
        "INVALID_STRESS_SCENARIO",
        "costGuardKMultiplier must be a finite number",
        { scenarioId: scenario.id },
      );
    }
    if (scenario.costGuardKMultiplier <= 0) {
      throw new StrategySearchCostStressError(
        "INVALID_STRESS_SCENARIO",
        "costGuardKMultiplier must be > 0",
        { scenarioId: scenario.id },
      );
    }
  }
}

/**
 * Multiply fee/slippage/funding/spread from baseCostConfig.
 * cost_guard_k = candidateCostGuardK * scenario.costGuardKMultiplier → costGuardKOverride.
 * Never derived from baseCostConfig.
 */
export function buildCostStressConfig(
  baseCostConfig: StrategySearchBacktestCostConfig,
  scenario: StrategySearchCostStressScenario,
  candidateCostGuardK: number,
): StrategySearchStressRuntimeCostConfig {
  if (!baseCostConfig || typeof baseCostConfig !== "object") {
    throw new StrategySearchCostStressError(
      "INVALID_STRESS_SCENARIO",
      "baseCostConfig must be an object",
      { scenarioId: scenario?.id ?? null },
    );
  }
  validateCostStressScenarios([scenario]);
  if (
    typeof candidateCostGuardK !== "number" ||
    !Number.isFinite(candidateCostGuardK) ||
    candidateCostGuardK <= 0
  ) {
    throw new StrategySearchCostStressError(
      "INVALID_STRESS_SCENARIO",
      "candidateCostGuardK must be a finite number > 0",
      { scenarioId: scenario.id },
    );
  }
  const effectiveCostGuardK =
    candidateCostGuardK * scenario.costGuardKMultiplier;
  if (!Number.isFinite(effectiveCostGuardK) || effectiveCostGuardK <= 0) {
    throw new StrategySearchCostStressError(
      "INVALID_STRESS_SCENARIO",
      "effective cost_guard_k must be a finite number > 0",
      { scenarioId: scenario.id },
    );
  }
  return {
    feeRate: baseCostConfig.feeRate * scenario.feeMultiplier,
    slippageRate: baseCostConfig.slippageRate * scenario.slippageMultiplier,
    fundingRate: baseCostConfig.fundingRate * scenario.fundingMultiplier,
    applyFunding: baseCostConfig.applyFunding,
    applySpread: baseCostConfig.applySpread,
    spreadRate: baseCostConfig.spreadRate * scenario.spreadMultiplier,
    costGuardKOverride: effectiveCostGuardK,
  };
}

/**
 * Evaluate each scenario from the original base fee rates + candidate cost_guard_k
 * (no cumulative multiply across scenarios).
 */
export async function evaluateCostStress(
  input: EvaluateCostStressInput,
): Promise<StrategySearchCostStressResult[]> {
  validateCostStressScenarios(input.scenarios);
  const candidateCostGuardK = resolveCandidateCostGuardK(input.candidate);
  const baseSnapshot: StrategySearchBacktestCostConfig = {
    feeRate: input.baseCostConfig.feeRate,
    slippageRate: input.baseCostConfig.slippageRate,
    fundingRate: input.baseCostConfig.fundingRate,
    applyFunding: input.baseCostConfig.applyFunding,
    applySpread: input.baseCostConfig.applySpread,
    spreadRate: input.baseCostConfig.spreadRate,
  };
  const results: StrategySearchCostStressResult[] = [];

  for (const scenario of input.scenarios) {
    const costConfig = buildCostStressConfig(
      baseSnapshot,
      scenario,
      candidateCostGuardK,
    );
    if (
      input.baseCostConfig.feeRate !== baseSnapshot.feeRate ||
      input.baseCostConfig.slippageRate !== baseSnapshot.slippageRate ||
      input.baseCostConfig.fundingRate !== baseSnapshot.fundingRate ||
      input.baseCostConfig.spreadRate !== baseSnapshot.spreadRate ||
      input.baseCostConfig.applyFunding !== baseSnapshot.applyFunding ||
      input.baseCostConfig.applySpread !== baseSnapshot.applySpread
    ) {
      throw new StrategySearchCostStressError(
        "COST_STRESS_FAILED",
        "base cost config was mutated during stress evaluation",
        {
          candidateId: input.candidate.candidateId,
          scenarioId: scenario.id,
        },
      );
    }

    try {
      const evaluation = await evaluateCandidateAcrossWindowsForStress({
        candidate: input.candidate,
        symbols: input.symbols,
        timeframe: input.timeframe,
        windows: input.windows,
        balance: input.balance,
        costConfig,
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
      results.push({
        scenario: { ...scenario },
        costConfig,
        evaluation,
        pass,
        score,
        passed: pass.passed,
      });
    } catch (err) {
      if (err instanceof StrategySearchCostStressError) throw err;
      const message = err instanceof Error ? err.message : "cost stress failed";
      throw new StrategySearchCostStressError("COST_STRESS_FAILED", message, {
        candidateId: input.candidate.candidateId,
        scenarioId: scenario.id,
        cause: err,
      });
    }
  }

  return results;
}
