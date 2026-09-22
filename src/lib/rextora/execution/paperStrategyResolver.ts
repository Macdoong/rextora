/**
 * Paper strategy resolution — executes ONLY an explicit selected strategy.
 * Paused/ready/pending sessions never execute.
 * paperActive registry is fallback only when no current session exists.
 * Missing strategy fails closed. Retired SAFE is never used.
 */

import {
  getLiveActiveStrategy,
  getPaperActiveStrategy,
  getStrategyById,
} from "../strategy/strategyStore";
import {
  storedToDefinition,
  type StoredStrategyV1,
} from "../strategy/definition/bridge";
import { computeStrategyHash } from "../strategy/strategyHash";
import {
  getCurrentPaperSession,
  getExecutablePaperSession,
} from "../paper/paperSessionStore";
import {
  isRetiredSafeId,
  NO_PAPER_STRATEGY,
} from "../strategy/retiredSafeBaseline";

export interface ResolvedPaperStrategy {
  strategy: StoredStrategyV1;
  strategyId: string;
  paramsHash: string;
  strategyHash: string;
  name: string;
  sessionId: string | null;
  sessionStatus: string | null;
  /** Always false. Retired SAFE is never executable. */
  isProtectedSafe: false;
  executionKind: "safe_params" | "condition_builder" | "event_sequence";
  exchangeCalled: false;
}

/**
 * Resolve the strategy that paper trading must execute.
 * Executable session (status=active) wins. Paused sessions block execution
 * (return null via throw from scan loop callers that check session first).
 */
export function resolvePaperExecutionStrategy(): ResolvedPaperStrategy {
  const executable = getExecutablePaperSession();
  const current = getCurrentPaperSession();

  // Paused / ready / pending: do not fall back to registry — block execution.
  if (current && current.status !== "active") {
    throw new Error(
      `paper session ${current.id} is ${current.status} — execution blocked`,
    );
  }

  const fromSession =
    executable?.strategyId && !isRetiredSafeId(executable.strategyId)
      ? getStrategyById(executable.strategyId)
      : null;
  const strategy = (fromSession ?? getPaperActiveStrategy()) as StoredStrategyV1 | null;
  if (!strategy || isRetiredSafeId(strategy.id)) {
    throw new Error(NO_PAPER_STRATEGY);
  }
  const isProtectedSafe = false as const;
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
    paramsHash: executable?.paramsHash || strategy.paramsHash,
    strategyHash:
      executable?.strategyHash ??
      strategy.strategyHash ??
      computeStrategyHash(storedToDefinition(strategy)),
    name:
      executable?.displayAliasSnapshot ??
      executable?.strategyName ??
      strategy.displayAlias ??
      strategy.displayName ??
      strategy.name,
    sessionId: executable?.id ?? null,
    sessionStatus: executable?.status ?? null,
    isProtectedSafe,
    executionKind,
    exchangeCalled: false,
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
  if (isRetiredSafeId(selected.id)) {
    throw new Error("live dry-run strategy not found");
  }
  const strategy = selected as StoredStrategyV1;
  const isProtectedSafe = false as const;
  return {
    strategy,
    strategyId: strategy.id,
    paramsHash: strategy.paramsHash,
    strategyHash:
      strategy.strategyHash ?? computeStrategyHash(storedToDefinition(strategy)),
    name: strategy.displayAlias ?? strategy.displayName ?? strategy.name,
    sessionId: null,
    sessionStatus: null,
    isProtectedSafe,
    executionKind: strategy.definition?.eventSequence
      ? "event_sequence"
      : strategy.strategyType === "condition_builder"
        ? "condition_builder"
        : "safe_params",
    exchangeCalled: false,
  };
}

/** Fail closed when no explicit executable strategy remains. */
export function assertPaperStrategyIntegrity(
  resolved: ResolvedPaperStrategy,
): void {
  if (!resolved.strategyId || isRetiredSafeId(resolved.strategyId)) {
    throw new Error(NO_PAPER_STRATEGY);
  }
}
