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
    /** When > 0 on failed jobs, present as partial completion (compat; status stays failed). */
    preservedCandidateCount?: number | null;
  },
): string {
  if (status === "running" || status === "pause_requested") {
    return "연구 중";
  }
  if (status === "cancel_requested") {
    return opts?.executionActive ? "중지 요청 중" : "결과 정리 중";
  }
  if (status === "cancelling") return "결과 정리 중";
  if (status === "paused") return "일시정지";
  if (status === "queued") {
    return opts?.executionActive ? "준비 중" : "준비";
  }
  if (status === "cancelled") return "사용자 중지";
  if (status === "failed") {
    if ((opts?.preservedCandidateCount ?? 0) > 0) return "부분 완료";
    return "실패";
  }
  if (status === "completed") {
    if (isEarlyFinishReason(opts?.completionReason)) return "조기 완료";
    return "완료";
  }
  return status;
}

/**
 * History list status values — operator-facing Korean labels.
 * Raw status codes belong in technical details only.
 */
export function historyStatusLabelKo(
  status: StrategySearchJobStatus,
  opts?: {
    completionReason?: StrategySearchCompletionReason | null;
  },
): string {
  if (status === "running" || status === "pause_requested" || status === "queued") {
    return "연구 중";
  }
  if (status === "paused") return "일시정지";
  if (status === "cancel_requested") return "중지 요청 중";
  if (status === "cancelling") return "결과 정리 중";
  if (status === "cancelled") return "사용자 중지";
  if (status === "failed") return "실패";
  if (status === "completed") {
    if (isEarlyFinishReason(opts?.completionReason)) return "조기 종료";
    return "정상 완료";
  }
  return status;
}

/** Verified per-trial evaluation pipeline stages (operator Korean). */
export const EVALUATION_PIPELINE_STAGES = [
  { id: "market_data", labelKo: "시장 데이터 준비" },
  { id: "strategy_generation", labelKo: "전략 생성" },
  { id: "base_backtest", labelKo: "기본 백테스트" },
  { id: "qualification_gate", labelKo: "조건 탈락 판정" },
  { id: "cost_stress", labelKo: "비용 검증" },
  { id: "trade_stability", labelKo: "안정성 검증" },
  { id: "overfitting", labelKo: "과거 데이터 편중 검사" },
  { id: "weakness_analysis", labelKo: "약점 분석" },
  { id: "search_improvement", labelKo: "탐색 범위 개선" },
  { id: "clustering", labelKo: "유사 전략 정리" },
  { id: "top10_selection", labelKo: "TOP 10 선정" },
  { id: "persistence", labelKo: "결과 저장" },
] as const;

const ENGINE_STAGE_TO_PIPELINE: Record<string, string> = {
  market_data: "market_data",
  data: "market_data",
  candidate_generation: "strategy_generation",
  strategy_generation: "strategy_generation",
  candidate_invalid: "strategy_generation",
  generation: "strategy_generation",
  evaluation: "base_backtest",
  backtest: "base_backtest",
  backtest_failed: "base_backtest",
  orchestrator: "base_backtest",
  qualification: "qualification_gate",
  qualification_gate: "qualification_gate",
  pass_policy: "qualification_gate",
  rejected: "qualification_gate",
  cost_stress: "cost_stress",
  robustness: "trade_stability",
  jitter: "trade_stability",
  trade_stability: "trade_stability",
  overfitting: "overfitting",
  weakness: "weakness_analysis",
  weakness_analysis: "weakness_analysis",
  mutation: "search_improvement",
  search_improvement: "search_improvement",
  search_space: "search_improvement",
  clustering: "clustering",
  recommendation: "top10_selection",
  top10: "top10_selection",
  top10_selection: "top10_selection",
  persistence: "persistence",
  worker: "persistence",
};

export function mapEngineStageToPipelineId(
  stage: string | null | undefined,
): string | null {
  if (!stage) return null;
  const key = stage.trim().toLowerCase();
  if (ENGINE_STAGE_TO_PIPELINE[key]) return ENGINE_STAGE_TO_PIPELINE[key]!;
  for (const [pattern, id] of Object.entries(ENGINE_STAGE_TO_PIPELINE)) {
    if (key.includes(pattern)) return id;
  }
  return null;
}

export function evaluationPipelineStageLabelKo(
  stageId: string,
): string | null {
  return EVALUATION_PIPELINE_STAGES.find((s) => s.id === stageId)?.labelKo ?? null;
}

export function resolveCurrentStageLabelKo(input: {
  currentSearchFamily?: string | null;
  currentImprovementStage?: string | null;
  searchProgression?: Array<{
    id: string;
    labelKo: string;
    status: string;
  }> | null;
  failedStage?: string | null;
  status: StrategySearchJobStatus | string;
}): string {
  const active = input.searchProgression?.find((s) => s.status === "active");
  if (active?.labelKo) return active.labelKo;
  if (input.currentSearchFamily) return input.currentSearchFamily;
  if (input.currentImprovementStage) return input.currentImprovementStage;
  if (input.failedStage) return input.failedStage;
  if (input.status === "queued") return "시장 데이터 준비";
  if (
    input.status === "running" ||
    input.status === "pause_requested" ||
    input.status === "cancel_requested"
  ) {
    return "전략 생성";
  }
  if (input.status === "paused") return "일시정지";
  if (input.status === "completed") return "정상 완료";
  if (input.status === "cancelled") return "사용자 중지";
  if (input.status === "failed") return "실패";
  return "—";
}

export function formatErrorStatusKo(
  evaluationErrors: number | null | undefined,
): string {
  const n = evaluationErrors ?? 0;
  if (n <= 0) return "정상";
  return `오류 ${formatCount(n)}건`;
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
    if (input.jobStatus === "failed") {
      // Active stage at failure time is the failed stage — never mark completed.
      return "failed";
    }
    if (input.jobStatus === "completed" || input.jobStatus === "cancelled") {
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
