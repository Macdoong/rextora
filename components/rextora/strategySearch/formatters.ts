import type { StrategySearchJobStatus } from "./types";

export type StrategySearchCompletionReason =
  | "QUALIFIED_TARGET_REACHED"
  | "MAX_CANDIDATE_BUDGET"
  | "MAX_RUNTIME"
  | "DEADLINE_REACHED"
  | "HARD_SAFETY_LIMIT"
  | "SEARCH_SPACE_EXHAUSTED"
  | "USER_CANCELLED"
  | "FATAL_ERROR"
  | "MAX_ITERATIONS"
  | "PAUSED"
  | "CONFIGURATION_INVALID"
  | "DATA_UNAVAILABLE"
  | "RECOVERY_FAILED"
  | "RESOURCE_SAFETY_LIMIT"
  | "USER_STOPPED"
  | "ENGINE_ERROR"
  | null
  | string;

export function isEarlyFinishReason(
  reason: StrategySearchCompletionReason | null | undefined,
): boolean {
  return reason === "QUALIFIED_TARGET_REACHED";
}

/** Why research stopped — shown separately from research status. */
export function completionReasonLabelKo(
  reason: StrategySearchCompletionReason | null | undefined,
): string | null {
  if (reason == null || reason === "") return null;
  switch (reason) {
    case "QUALIFIED_TARGET_REACHED":
      return "합격 목표 달성";
    case "MAX_CANDIDATE_BUDGET":
    case "MAX_ITERATIONS":
      return "자원 안전 한도 소진";
    case "DEADLINE_REACHED":
    case "MAX_RUNTIME":
      return "연구 시간 종료";
    case "HARD_SAFETY_LIMIT":
    case "RESOURCE_SAFETY_LIMIT":
      return "자원 안전 한도 도달";
    case "SEARCH_SPACE_EXHAUSTED":
      return "연구 범위 소진";
    case "USER_CANCELLED":
    case "USER_STOPPED":
      return "사용자가 중지함";
    case "CONFIGURATION_INVALID":
      return "탐색 설정 오류";
    case "DATA_UNAVAILABLE":
      return "시장 데이터 없음";
    case "RECOVERY_FAILED":
      return "복구 실패";
    case "FATAL_ERROR":
    case "ENGINE_ERROR":
      return "엔진 오류";
    case "PAUSED":
      return "일시정지";
    default:
      return null;
  }
}

function inferFailedReasonFromMessage(
  failureMessage: string | null | undefined,
): string {
  const msg = (failureMessage ?? "").toLowerCase();
  if (!msg.trim()) return "ENGINE_ERROR";
  if (
    msg.includes("invalid parameterranges") ||
    msg.includes("defaultvalue is outside") ||
    msg.includes("parameterranges")
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

/**
 * Prefer plan completionReason; for failed jobs always resolve a non-blank
 * reason from failureMessage when needed.
 */
export function resolveDisplayTerminationReason(input: {
  status: StrategySearchJobStatus | string;
  completionReason?: StrategySearchCompletionReason | null;
  terminationReason?: string | null;
  failureMessage?: string | null;
}): string {
  if (input.terminationReason) {
    return (
      completionReasonLabelKo(input.terminationReason) ??
      input.terminationReason
    );
  }
  if (input.completionReason) {
    return (
      completionReasonLabelKo(input.completionReason) ??
      String(input.completionReason)
    );
  }
  if (input.status === "failed") {
    const inferred = inferFailedReasonFromMessage(input.failureMessage);
    return completionReasonLabelKo(inferred) ?? "엔진 오류";
  }
  if (input.status === "cancelled") return "사용자가 중지함";
  return "—";
}

/**
 * Live / detail research status (not history).
 * Never conflate with budget progress %.
 */
export function researchStatusLabelKo(
  status: StrategySearchJobStatus,
  opts?: {
    completionReason?: StrategySearchCompletionReason | null;
    executionActive?: boolean;
  },
): string {
  if (status === "running" || status === "pause_requested") {
    return "연구 중";
  }
  if (status === "cancel_requested") return "중지 중";
  if (status === "paused") return "일시정지";
  if (status === "queued") {
    return opts?.executionActive ? "준비 중" : "준비";
  }
  if (status === "cancelled") return "중지됨";
  if (status === "failed") return "실패";
  if (status === "completed") {
    if (isEarlyFinishReason(opts?.completionReason)) return "조기 완료";
    return "완료";
  }
  return status;
}

/**
 * History list status values only:
 * 완료 | 조기 종료 | 중지됨 | 실패 | 실행 중
 */
export function historyStatusLabelKo(
  status: StrategySearchJobStatus,
  opts?: {
    completionReason?: StrategySearchCompletionReason | null;
  },
): string {
  if (
    status === "running" ||
    status === "pause_requested" ||
    status === "queued" ||
    status === "paused" ||
    status === "cancel_requested"
  ) {
    return "실행 중";
  }
  if (status === "cancelled") return "중지됨";
  if (status === "failed") return "실패";
  if (status === "completed") {
    if (isEarlyFinishReason(opts?.completionReason)) return "조기 종료";
    return "완료";
  }
  return status;
}

/** @deprecated Prefer researchStatusLabelKo / historyStatusLabelKo */
export function statusLabelKo(
  status: StrategySearchJobStatus,
  opts?: {
    searchSpaceExhausted?: boolean;
    searching?: boolean;
    completionReason?: StrategySearchCompletionReason | null;
  },
): string {
  return researchStatusLabelKo(status, {
    completionReason: opts?.completionReason,
    executionActive: opts?.searching,
  });
}

export type PipelineUiStatus =
  | "completed"
  | "running"
  | "waiting"
  | "skipped"
  | "failed";

export function pipelineStageUiStatus(input: {
  stageStatus: string | undefined;
  jobStatus: StrategySearchJobStatus;
  completionReason?: StrategySearchCompletionReason | null;
  stageIndex: number;
  activeIndex: number;
}): PipelineUiStatus {
  const raw = input.stageStatus;
  if (raw === "failed") return "failed";
  if (raw === "completed" || raw === "exhausted") return "completed";
  if (raw === "active") {
    if (
      input.jobStatus === "completed" ||
      input.jobStatus === "cancelled" ||
      input.jobStatus === "failed"
    ) {
      return "completed";
    }
    return "running";
  }
  // pending / unknown
  const terminal =
    input.jobStatus === "completed" ||
    input.jobStatus === "cancelled" ||
    input.jobStatus === "failed";
  if (terminal) {
    if (
      isEarlyFinishReason(input.completionReason) ||
      input.jobStatus === "cancelled" ||
      input.jobStatus === "failed"
    ) {
      return "skipped";
    }
    // Fully completed campaign: treat leftover pending as completed/skipped
    return "skipped";
  }
  if (input.stageIndex < input.activeIndex) return "completed";
  if (input.stageIndex === input.activeIndex) return "running";
  return "waiting";
}

export function pipelineStageLabelKo(
  ui: PipelineUiStatus,
  opts?: { earlyGoal?: boolean },
): string {
  switch (ui) {
    case "completed":
      return "완료";
    case "running":
      return "진행 중";
    case "waiting":
      return "대기";
    case "failed":
      return "실패";
    case "skipped":
      return opts?.earlyGoal
        ? "건너뜀 (목표 이미 달성)"
        : "건너뜀";
    default:
      return "대기";
  }
}

export function formatMs(ms: number | null | undefined): string | null {
  if (ms == null || !Number.isFinite(ms)) return null;
  if (ms < 1000) return `${Math.round(ms)}ms`;
  const sec = ms / 1000;
  if (sec < 60) return `${sec.toFixed(1)}초`;
  const min = Math.floor(sec / 60);
  const rem = Math.round(sec % 60);
  return `${min}분 ${rem}초`;
}

export function formatScore(score: number | null | undefined): string | null {
  if (score == null || !Number.isFinite(score)) return null;
  return score.toFixed(2);
}

export function formatPct(value: number | null | undefined): string | null {
  if (value == null || !Number.isFinite(value)) return null;
  return `${(value * 100).toFixed(2)}%`;
}

/**
 * Absolute percentage for operator max-loss display (e.g. -0.0281 → "2.81%").
 */
export function formatMddAbsPct(
  value: number | null | undefined,
): string | null {
  if (value == null || !Number.isFinite(value)) return null;
  return `${(Math.abs(value) * 100).toFixed(2)}%`;
}

export function formatOptional(
  value: number | null | undefined,
  format: (n: number) => string,
): string | null {
  if (value == null || !Number.isFinite(value)) return null;
  return format(value);
}

export function formatTimeKo(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleString("ko-KR", { hour12: false });
}

export function formatCount(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "0";
  return String(Math.trunc(n));
}

/** @deprecated — prefer formatOptional / hide missing fields */
export function formatMetricOrUnavailable(
  value: number | null | undefined,
  format: (n: number) => string,
): string {
  return formatOptional(value, format) ?? "—";
}

export function passLabel(passed: boolean | null | undefined): string | null {
  if (passed == null) return null;
  return passed ? "승인" : "미승인";
}
