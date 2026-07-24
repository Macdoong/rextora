/**
 * Canonical Research Job termination reasons (operator + API).
 * Maps legacy completionReason / failureMessage into a never-blank failed reason.
 */

import type { StrategySearchCompletionReason } from "./searchPlan";

export type StrategySearchTerminationReason =
  | "DEADLINE_REACHED"
  | "USER_STOPPED"
  | "USER_CANCELLED"
  | "CONFIGURATION_INVALID"
  | "RESOURCE_SAFETY_LIMIT"
  | "DATA_UNAVAILABLE"
  | "ENGINE_ERROR"
  | "RECOVERY_FAILED"
  | "QUALIFIED_TARGET_REACHED"
  | "SEARCH_SPACE_EXHAUSTED"
  | "PAUSED"
  | "MAX_CANDIDATE_BUDGET"
  | "MAX_ITERATIONS"
  | "MAX_RUNTIME"
  | "HARD_SAFETY_LIMIT"
  | "FATAL_ERROR";

export function terminationReasonLabelKo(
  reason: StrategySearchTerminationReason | string | null | undefined,
): string | null {
  if (reason == null || reason === "") return null;
  switch (reason) {
    case "DEADLINE_REACHED":
    case "MAX_RUNTIME":
      return "연구 시간 종료";
    case "USER_STOPPED":
      return "사용자가 중지함";
    case "USER_CANCELLED":
      return "사용자가 취소함";
    case "CONFIGURATION_INVALID":
      return "탐색 설정 오류";
    case "RESOURCE_SAFETY_LIMIT":
    case "HARD_SAFETY_LIMIT":
      return "자원 안전 한도 도달";
    case "DATA_UNAVAILABLE":
      return "시장 데이터 없음";
    case "ENGINE_ERROR":
    case "FATAL_ERROR":
      return "엔진 오류";
    case "RECOVERY_FAILED":
      return "복구 실패";
    case "QUALIFIED_TARGET_REACHED":
      return "합격 목표 달성";
    case "SEARCH_SPACE_EXHAUSTED":
      return "연구 범위 소진";
    case "MAX_CANDIDATE_BUDGET":
    case "MAX_ITERATIONS":
      return "자원 안전 한도 소진";
    case "PAUSED":
      return "일시정지";
    default:
      return null;
  }
}

/** Map orchestrator completionReason → canonical termination reason. */
export function mapCompletionToTermination(
  reason: StrategySearchCompletionReason | string | null | undefined,
): StrategySearchTerminationReason | null {
  if (reason == null || reason === "") return null;
  if (reason === "HARD_SAFETY_LIMIT") return "RESOURCE_SAFETY_LIMIT";
  if (reason === "MAX_RUNTIME") return "DEADLINE_REACHED";
  if (reason === "FATAL_ERROR") return "ENGINE_ERROR";
  if (reason === "USER_CANCELLED") return "USER_CANCELLED";
  return reason as StrategySearchTerminationReason;
}

/**
 * Infer termination from a failureMessage when plan.completionReason is missing
 * (legacy failed jobs).
 */
export function inferTerminationFromFailureMessage(
  failureMessage: string | null | undefined,
): StrategySearchTerminationReason {
  const msg = (failureMessage ?? "").toLowerCase();
  if (!msg.trim()) return "ENGINE_ERROR";
  if (
    msg.includes("invalid parameterranges") ||
    msg.includes("defaultvalue is outside") ||
    msg.includes("parameterRanges".toLowerCase()) ||
    msg.includes("configuration")
  ) {
    return "CONFIGURATION_INVALID";
  }
  if (msg.includes("candle") || msg.includes("data") || msg.includes("klines")) {
    return "DATA_UNAVAILABLE";
  }
  if (msg.includes("recover") || msg.includes("orphan")) {
    return "RECOVERY_FAILED";
  }
  if (msg.includes("safety") || msg.includes("budget ceiling")) {
    return "RESOURCE_SAFETY_LIMIT";
  }
  return "ENGINE_ERROR";
}

export function resolveTerminationReason(input: {
  status: string;
  completionReason?: StrategySearchCompletionReason | string | null;
  failureMessage?: string | null;
}): StrategySearchTerminationReason | null {
  const fromPlan = mapCompletionToTermination(input.completionReason);
  if (fromPlan) return fromPlan;
  if (input.status === "failed") {
    return inferTerminationFromFailureMessage(input.failureMessage);
  }
  if (input.status === "cancelled") return "USER_CANCELLED";
  return null;
}

export function classifyRunFailureReason(
  failureMessage: string | null | undefined,
): StrategySearchCompletionReason {
  const t = inferTerminationFromFailureMessage(failureMessage);
  if (t === "CONFIGURATION_INVALID") return "CONFIGURATION_INVALID" as StrategySearchCompletionReason;
  if (t === "DATA_UNAVAILABLE") return "DATA_UNAVAILABLE" as StrategySearchCompletionReason;
  if (t === "RESOURCE_SAFETY_LIMIT") return "HARD_SAFETY_LIMIT";
  if (t === "RECOVERY_FAILED") return "RECOVERY_FAILED" as StrategySearchCompletionReason;
  return "FATAL_ERROR";
}
