/**
 * Paper strategy resolution — executes the paperActive strategy, not hard-coded SAFE.
 * SAFE is used only when it is the active paper strategy (or fallback when none other is active).
 */

import { getPaperActiveStrategy } from "../strategy/strategyStore";
import {
  EXPECTED_SAFE_PARAMS_HASH,
  SAFE_STRATEGY_ID,
} from "../strategy/strategyTypes";
import type { StoredStrategyV1 } from "../strategy/definition/bridge";

export interface ResolvedPaperStrategy {
  strategy: StoredStrategyV1;
  strategyId: string;
  paramsHash: string;
  name: string;
  /** True only when the resolved strategy is the protected SAFE original. */
  isProtectedSafe: boolean;
  executionKind: "safe_params" | "condition_builder" | "event_sequence";
}

/**
 * Resolve the strategy that paper trading must execute.
 * Never substitutes SAFE when another strategy is paperActive.
 */
export function resolvePaperExecutionStrategy(): ResolvedPaperStrategy {
  const strategy = getPaperActiveStrategy() as StoredStrategyV1;
  const isProtectedSafe = strategy.id === SAFE_STRATEGY_ID;
  let executionKind: ResolvedPaperStrategy["executionKind"] = "safe_params";
  if (strategy.strategyType === "condition_builder") {
    executionKind = "condition_builder";
  }
  if (strategy.definition?.eventSequence) {
    executionKind = "event_sequence";
  }
  return {
    strategy,
    strategyId: strategy.id,
    paramsHash: strategy.paramsHash,
    name: strategy.name,
    isProtectedSafe,
    executionKind,
  };
}

/** Fail closed if protected SAFE hash is wrong. */
export function assertPaperStrategyIntegrity(
  resolved: ResolvedPaperStrategy,
): void {
  if (
    resolved.isProtectedSafe &&
    resolved.paramsHash !== EXPECTED_SAFE_PARAMS_HASH
  ) {
    throw new Error("SAFE params_hash mismatch — refusing paper scan");
  }
}
