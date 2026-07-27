/**
 * Paper strategy resolution — executes the active Paper session strategy when
 * one exists; otherwise the paperActive registry strategy.
 * SAFE is used only when it is the selected paper strategy (or fallback when none other is active).
 */

import {
  getLiveActiveStrategy,
  getPaperActiveStrategy,
  getStrategyById,
} from "../strategy/strategyStore";
import {
  EXPECTED_SAFE_PARAMS_HASH,
  SAFE_STRATEGY_ID,
} from "../strategy/strategyTypes";
import {
  storedToDefinition,
  type StoredStrategyV1,
} from "../strategy/definition/bridge";
import { computeStrategyHash } from "../strategy/strategyHash";
import { getActivePaperSession } from "../paper/paperSessionStore";

export interface ResolvedPaperStrategy {
  strategy: StoredStrategyV1;
  strategyId: string;
  paramsHash: string;
  strategyHash: string;
  name: string;
  /** True only when the resolved strategy is the protected SAFE original. */
  isProtectedSafe: boolean;
  executionKind: "safe_params" | "condition_builder" | "event_sequence";
}

/**
 * Resolve the strategy that paper trading must execute.
 * Active/paused session identity wins over a stale paperActive registry flag.
 * Never substitutes SAFE when another strategy owns the session or paperActive.
 */
export function resolvePaperExecutionStrategy(): ResolvedPaperStrategy {
  const activeSession = getActivePaperSession();
  const fromSession = activeSession?.strategyId
    ? getStrategyById(activeSession.strategyId)
    : null;
  const strategy = (fromSession ?? getPaperActiveStrategy()) as StoredStrategyV1;
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
    strategyHash:
      activeSession?.strategyHash ??
      strategy.strategyHash ??
      computeStrategyHash(storedToDefinition(strategy)),
    name:
      activeSession?.displayAliasSnapshot ??
      activeSession?.strategyName ??
      strategy.displayAlias ??
      strategy.displayName ??
      strategy.name,
    isProtectedSafe,
    executionKind,
  };
}

export function resolveLiveDryRunExecutionStrategy(
  strategyId?: string | null,
): ResolvedPaperStrategy {
  const selected = strategyId?.trim()
    ? getStrategyById(strategyId.trim())
    : getLiveActiveStrategy();
  if (!selected) {
    throw new Error("live dry-run strategy not found");
  }
  const strategy = selected as StoredStrategyV1;
  const isProtectedSafe = strategy.id === SAFE_STRATEGY_ID;
  return {
    strategy,
    strategyId: strategy.id,
    paramsHash: strategy.paramsHash,
    strategyHash:
      strategy.strategyHash ?? computeStrategyHash(storedToDefinition(strategy)),
    name: strategy.displayAlias ?? strategy.displayName ?? strategy.name,
    isProtectedSafe,
    executionKind: strategy.definition?.eventSequence
      ? "event_sequence"
      : strategy.strategyType === "condition_builder"
        ? "condition_builder"
        : "safe_params",
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
