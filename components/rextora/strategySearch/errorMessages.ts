import type { StrategySearchApiErrorCode } from "./types";

const MESSAGES: Record<string, string> = {
  INVALID_REQUEST: "요청 설정이 올바르지 않습니다. 입력값을 확인하세요.",
  JOB_NOT_FOUND: "탐색 작업을 찾을 수 없습니다.",
  INVALID_STATE: "현재 작업 상태에서는 이 동작을 수행할 수 없습니다.",
  JOB_ALREADY_RUNNING: "이미 실행 중인 작업입니다. 중복 실행은 허용되지 않습니다.",
  CORRUPT_CHECKPOINT: "체크포인트가 손상되어 작업을 이어갈 수 없습니다.",
  UNSUPPORTED_CHECKPOINT_VERSION: "지원하지 않는 체크포인트 버전입니다.",
  PROTECTED_STRATEGY_VIOLATION: "보호된 전략에 대한 쓰기 시도가 차단되었습니다.",
  MISSING_EXECUTION_PROFILE: "실행 프로필이 없어 작업을 시작할 수 없습니다.",
  INTERNAL_EXECUTION_FAILURE: "내부 실행 오류가 발생했습니다.",
};

export function mapStrategySearchErrorCode(
  code: string | undefined,
  fallbackMessage?: string,
): string {
  if (code && MESSAGES[code]) return MESSAGES[code];
  if (fallbackMessage && fallbackMessage.trim()) return fallbackMessage;
  return MESSAGES.INTERNAL_EXECUTION_FAILURE;
}

export function formatErrorDetails(
  code: string | undefined,
  details: string[] | undefined,
): string | null {
  const parts: string[] = [];
  if (code) parts.push(`코드: ${code}`);
  if (details && details.length > 0) {
    parts.push(...details.slice(0, 8));
  }
  return parts.length > 0 ? parts.join(" · ") : null;
}

export type { StrategySearchApiErrorCode };
