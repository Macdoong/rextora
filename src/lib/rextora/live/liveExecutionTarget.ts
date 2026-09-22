/**
 * Canonical Live execution target resolver and fail-closed dispatch.
 *
 * Authority is getLiveActiveStrategy() — not URL selection, not SAFE fallback.
 * SAFE is valid only when it is the explicit liveActive strategy.
 */

import { getLiveActiveStrategy, getStrategyById } from "../strategy/strategyStore";
import { validateEventSequence } from "../strategy/definition/eventSequence";
import { isRetiredSafeId } from "../strategy/retiredSafeBaseline";
import type { StoredStrategyV1 } from "../strategy/definition/bridge";

export type LiveExecutionKind = "safe_params" | "event_sequence";

export const LIVE_TARGET_NO_SELECTION = "NO_LIVE_EXECUTION_TARGET";
export const LIVE_TARGET_UNKNOWN = "UNKNOWN_LIVE_EXECUTION_TARGET";
export const LIVE_TARGET_UNSUPPORTED = "UNSUPPORTED_LIVE_EXECUTION_KIND";
export const LIVE_TARGET_NO_SAFE_FALLBACK = "CUSTOM_LIVE_TARGET_NO_SAFE_FALLBACK";

export const LIVE_TARGET_REASON_NO_SELECTION =
  "실전 실행 대상 전략이 지정되지 않았습니다.";
export const LIVE_TARGET_REASON_UNKNOWN = "알 수 없는 실전 실행 대상입니다.";
export const LIVE_TARGET_REASON_UNSUPPORTED =
  "이 전략은 실전 실행 경로가 없습니다.";
export const LIVE_TARGET_REASON_NO_SAFE_FALLBACK =
  "지정된 전략을 SAFE로 대체할 수 없습니다.";

export type ResolvedLiveExecutionTarget = {
  ok: true;
  strategyId: string;
  paramsHash: string;
  strategyHash: string | null;
  symbol: string | null;
  executionKind: LiveExecutionKind;
  isProtectedSafe: boolean;
};

export type LiveExecutionTargetFailure = {
  ok: false;
  code:
    | typeof LIVE_TARGET_NO_SELECTION
    | typeof LIVE_TARGET_UNKNOWN
    | typeof LIVE_TARGET_UNSUPPORTED
    | typeof LIVE_TARGET_NO_SAFE_FALLBACK;
  message: string;
};

export type LiveExecutionTargetResult =
  | ResolvedLiveExecutionTarget
  | LiveExecutionTargetFailure;

function fail(
  code: LiveExecutionTargetFailure["code"],
  message: string,
): LiveExecutionTargetFailure {
  return { ok: false, code, message };
}

function declaredSymbol(strategy: StoredStrategyV1): string | null {
  const symbols = strategy.symbols?.map((s) => s.trim().toUpperCase()).filter(Boolean);
  if (!symbols || symbols.length === 0) return null;
  return symbols[0] ?? null;
}

export function resolveLiveExecutionKind(
  strategy: StoredStrategyV1,
): LiveExecutionKind | null {
  const seq = strategy.definition?.eventSequence;
  if (isRetiredSafeId(strategy.id)) return null;
  if (seq && validateEventSequence(seq).ok) return "event_sequence";
  return null;
}

export function resolveLiveExecutionTargetFromStrategy(
  strategy: StoredStrategyV1,
): LiveExecutionTargetResult {
  const paramsHash = strategy.paramsHash?.trim();
  if (!paramsHash) {
    return fail(LIVE_TARGET_UNKNOWN, LIVE_TARGET_REASON_UNKNOWN);
  }
  if (isRetiredSafeId(strategy.id)) {
    return fail(LIVE_TARGET_NO_SELECTION, LIVE_TARGET_REASON_NO_SELECTION);
  }
  const kind = resolveLiveExecutionKind(strategy);
  if (!kind) {
    return fail(LIVE_TARGET_UNSUPPORTED, LIVE_TARGET_REASON_UNSUPPORTED);
  }
  if (kind === "safe_params") {
    return fail(LIVE_TARGET_NO_SAFE_FALLBACK, LIVE_TARGET_REASON_NO_SAFE_FALLBACK);
  }
  return {
    ok: true,
    strategyId: strategy.id,
    paramsHash,
    strategyHash: strategy.strategyHash?.trim() || null,
    symbol: declaredSymbol(strategy),
    executionKind: kind,
    isProtectedSafe: false,
  };
}

export function resolveLiveExecutionTargetById(
  strategyId: string,
): LiveExecutionTargetResult {
  const id = strategyId.trim();
  if (!id) return fail(LIVE_TARGET_NO_SELECTION, LIVE_TARGET_REASON_NO_SELECTION);
  const strategy = getStrategyById(id) as StoredStrategyV1 | undefined;
  if (!strategy) return fail(LIVE_TARGET_UNKNOWN, LIVE_TARGET_REASON_UNKNOWN);
  return resolveLiveExecutionTargetFromStrategy(strategy);
}

/**
 * Canonical Live execution target. No silent SAFE fallback.
 */
export function resolveLiveExecutionTarget(): LiveExecutionTargetResult {
  const active = getLiveActiveStrategy() as StoredStrategyV1 | undefined;
  if (!active) return fail(LIVE_TARGET_NO_SELECTION, LIVE_TARGET_REASON_NO_SELECTION);
  return resolveLiveExecutionTargetFromStrategy(active);
}

export type LiveExecutionDispatchRoute = "safe_params" | "event_sequence" | "blocked";

export function liveExecutionDispatchRoute(
  target: LiveExecutionTargetResult,
): LiveExecutionDispatchRoute {
  if (!target.ok) return "blocked";
  if (target.executionKind === "safe_params" && target.isProtectedSafe) {
    return "safe_params";
  }
  if (target.executionKind === "event_sequence" && !target.isProtectedSafe) {
    return "event_sequence";
  }
  return "blocked";
}

export function dispatchLiveExecution<T>(
  target: LiveExecutionTargetResult,
  handlers: {
    runSafe: () => T;
    runEventSequence: () => T;
    failClosed: (reason: LiveExecutionTargetFailure) => T;
  },
): T {
  const route = liveExecutionDispatchRoute(target);
  if (route === "safe_params") return handlers.runSafe();
  if (route === "event_sequence") return handlers.runEventSequence();
  if (!target.ok) return handlers.failClosed(target);
  return handlers.failClosed({
    ok: false,
    code: LIVE_TARGET_NO_SAFE_FALLBACK,
    message: LIVE_TARGET_REASON_NO_SAFE_FALLBACK,
  });
}
