/**
 * Customer-safe Strategy Search live activity telemetry.
 * Source-backed events only. No params, hashes, candidate IDs, or engine internals.
 * This module is filesystem-free so the running UI can reuse copy/sanitize helpers.
 */

export const SEARCH_ACTIVITY_BUFFER_SIZE = 12 as const;
export const SEARCH_ACTIVITY_FEED_LIMIT = 8 as const;

export const CUSTOMER_FAILURE_REASON_CODES = [
  "MIN_TOTAL_RETURN",
  "MIN_TRADE_COUNT",
  "MIN_WIN_RATE",
  "MIN_PROFIT_FACTOR",
  "MIN_ENDING_BALANCE",
  "MAX_NEGATIVE_MONTHS",
  "MAX_MDD",
  "MIN_MONTHLY_RETURN",
  "MAX_MONTHLY_RETURN_DISPERSION",
] as const;

export type StrategySearchCustomerFailureReasonCode =
  (typeof CUSTOMER_FAILURE_REASON_CODES)[number];

const CUSTOMER_FAILURE_REASON_SET = new Set<string>(
  CUSTOMER_FAILURE_REASON_CODES,
);

export interface CustomerCandidateMetrics {
  netReturn?: number;
  mdd?: number;
  tradeCount?: number;
  winRate?: number;
  profitFactor?: number;
  score?: number;
}

export type StrategySearchActivityEvent =
  | {
      type: "family_started";
      at: string;
      familyLabel: string;
    }
  | {
      type: "family_completed";
      at: string;
      familyLabel: string;
    }
  | {
      type: "candidate_evaluated";
      at: string;
      familyLabel?: string;
      evaluatedCount: number;
      metrics?: CustomerCandidateMetrics;
    }
  | {
      type: "candidate_rejected";
      at: string;
      familyLabel?: string;
      evaluatedCount: number;
      reasonCodes?: StrategySearchCustomerFailureReasonCode[];
      metrics?: CustomerCandidateMetrics;
    }
  | {
      type: "candidate_gate_passed";
      at: string;
      familyLabel?: string;
      evaluatedCount: number;
      metrics?: CustomerCandidateMetrics;
    }
  | {
      type: "campaign_qualified";
      at: string;
      qualifiedCount: number;
    }
  | {
      type: "top10_refreshed";
      at: string;
    };

const ACTIVITY_EVENT_TYPES = new Set<StrategySearchActivityEvent["type"]>([
  "family_started",
  "family_completed",
  "candidate_evaluated",
  "candidate_rejected",
  "candidate_gate_passed",
  "campaign_qualified",
  "top10_refreshed",
]);

const FORBIDDEN_ACTIVITY_KEYS = [
  "params",
  "paramsHash",
  "strategyHash",
  "candidateId",
  "clusterId",
  "fingerprints",
  "seenHashes",
  "randomState",
  "prng",
  "ownerUserId",
  "pid",
  "lease",
] as const;

export function isCustomerFailureReasonCode(
  value: unknown,
): value is StrategySearchCustomerFailureReasonCode {
  return typeof value === "string" && CUSTOMER_FAILURE_REASON_SET.has(value);
}

export function mapCustomerFailureReasonCodes(
  issues: ReadonlyArray<{ code?: string | null } | null | undefined>,
): StrategySearchCustomerFailureReasonCode[] {
  const seen = new Set<StrategySearchCustomerFailureReasonCode>();
  const out: StrategySearchCustomerFailureReasonCode[] = [];
  for (const issue of issues) {
    const code = issue?.code;
    if (!isCustomerFailureReasonCode(code) || seen.has(code)) continue;
    seen.add(code);
    out.push(code);
  }
  return out;
}

export function formatCustomerFailureReasonKo(
  code: StrategySearchCustomerFailureReasonCode,
): string {
  switch (code) {
    case "MIN_TOTAL_RETURN":
      return "최소 수익률 조건 미통과";
    case "MIN_TRADE_COUNT":
      return "최소 거래 수 조건 미통과";
    case "MIN_WIN_RATE":
      return "최소 승률 조건 미통과";
    case "MIN_PROFIT_FACTOR":
      return "수익성 조건 미통과";
    case "MIN_ENDING_BALANCE":
      return "최종 자산 조건 미통과";
    case "MAX_NEGATIVE_MONTHS":
      return "손실 월 허용 조건 미통과";
    case "MAX_MDD":
      return "최대낙폭 조건 미통과";
    case "MIN_MONTHLY_RETURN":
      return "월별 수익률 조건 미통과";
    case "MAX_MONTHLY_RETURN_DISPERSION":
      return "월별 수익률 편차 조건 미통과";
  }
}

export function formatActivityEventLineKo(
  event: StrategySearchActivityEvent,
): string {
  switch (event.type) {
    case "family_started":
      return `${event.familyLabel} 전략군 분석 시작`;
    case "family_completed":
      return `${event.familyLabel} 전략군 분석 완료`;
    case "candidate_evaluated":
      return `후보 전략 ${event.evaluatedCount}번째 평가 완료`;
    case "candidate_rejected": {
      const first = event.reasonCodes?.[0];
      return first
        ? formatCustomerFailureReasonKo(first)
        : "적격 조건 미통과";
    }
    case "candidate_gate_passed":
      return "평가 통과 후보 추가";
    case "campaign_qualified":
      return `최종 적격 후보 ${event.qualifiedCount}개`;
    case "top10_refreshed":
      return "상위 후보 목록 갱신";
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === "object" && !Array.isArray(value);
}

function finiteNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function sanitizeFamilyLabel(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function sanitizeIso(value: unknown): string | undefined {
  if (typeof value !== "string" || value.trim() === "") return undefined;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? value : undefined;
}

export function sanitizeCustomerMetrics(
  value: unknown,
): CustomerCandidateMetrics | undefined {
  if (!isObject(value)) return undefined;
  const metrics: CustomerCandidateMetrics = {};
  const netReturn = finiteNumber(value.netReturn);
  const mdd = finiteNumber(value.mdd);
  const tradeCount = finiteNumber(value.tradeCount);
  const winRate = finiteNumber(value.winRate);
  const profitFactor = finiteNumber(value.profitFactor);
  const score = finiteNumber(value.score);
  if (netReturn != null) metrics.netReturn = netReturn;
  if (mdd != null) metrics.mdd = mdd;
  if (tradeCount != null) metrics.tradeCount = tradeCount;
  if (winRate != null) metrics.winRate = winRate;
  if (profitFactor != null) metrics.profitFactor = profitFactor;
  if (score != null) metrics.score = score;
  return Object.keys(metrics).length > 0 ? metrics : undefined;
}

export function customerMetricsFromEvaluation(input: {
  totalReturn?: number | null;
  mdd?: number | null;
  trades?: number | null;
  winRate?: number | null;
  profitFactor?: number | null;
  score?: number | null;
}): CustomerCandidateMetrics | undefined {
  return sanitizeCustomerMetrics({
    netReturn: input.totalReturn,
    mdd: input.mdd,
    tradeCount: input.trades,
    winRate: input.winRate,
    profitFactor: input.profitFactor,
    score: input.score,
  });
}

export function sanitizeCustomerActivityEvent(
  value: unknown,
): StrategySearchActivityEvent | null {
  if (!isObject(value)) return null;
  for (const key of FORBIDDEN_ACTIVITY_KEYS) {
    if (key in value) {
      /* drop internals by reconstructing a safe object below */
    }
  }
  const type = value.type;
  const at = sanitizeIso(value.at);
  if (typeof type !== "string" || !ACTIVITY_EVENT_TYPES.has(type as never) || !at) {
    return null;
  }
  if (type === "family_started" || type === "family_completed") {
    const familyLabel = sanitizeFamilyLabel(value.familyLabel);
    if (!familyLabel) return null;
    return { type, at, familyLabel };
  }
  if (type === "campaign_qualified") {
    const qualifiedCount = finiteNumber(value.qualifiedCount);
    if (qualifiedCount == null || qualifiedCount < 0) return null;
    return { type, at, qualifiedCount: Math.trunc(qualifiedCount) };
  }
  if (type === "top10_refreshed") {
    return { type, at };
  }
  const evaluatedCount = finiteNumber(value.evaluatedCount);
  if (evaluatedCount == null || evaluatedCount < 0) return null;
  const familyLabel = sanitizeFamilyLabel(value.familyLabel);
  const metrics = sanitizeCustomerMetrics(value.metrics);
  if (type === "candidate_rejected") {
    const reasonCodes = Array.isArray(value.reasonCodes)
      ? mapCustomerFailureReasonCodes(
          value.reasonCodes.map((code) => ({
            code: typeof code === "string" ? code : null,
          })),
        )
      : [];
    return {
      type,
      at,
      evaluatedCount: Math.trunc(evaluatedCount),
      ...(familyLabel ? { familyLabel } : {}),
      ...(reasonCodes.length > 0 ? { reasonCodes } : {}),
      ...(metrics ? { metrics } : {}),
    };
  }
  if (type === "candidate_evaluated" || type === "candidate_gate_passed") {
    return {
      type,
      at,
      evaluatedCount: Math.trunc(evaluatedCount),
      ...(familyLabel ? { familyLabel } : {}),
      ...(metrics ? { metrics } : {}),
    };
  }
  return null;
}

export function sanitizeRecentActivityEvents(
  value: unknown,
): StrategySearchActivityEvent[] {
  if (!Array.isArray(value)) return [];
  const out: StrategySearchActivityEvent[] = [];
  for (const item of value) {
    const event = sanitizeCustomerActivityEvent(item);
    if (event) out.push(event);
  }
  return out.length <= SEARCH_ACTIVITY_BUFFER_SIZE
    ? out
    : out.slice(out.length - SEARCH_ACTIVITY_BUFFER_SIZE);
}

export function appendSearchActivityEvent(
  events: readonly StrategySearchActivityEvent[],
  nextEvent: StrategySearchActivityEvent,
  maxSize: number = SEARCH_ACTIVITY_BUFFER_SIZE,
): StrategySearchActivityEvent[] {
  const sanitized = sanitizeCustomerActivityEvent(nextEvent);
  if (!sanitized) return [...events];
  const limit = Number.isInteger(maxSize) && maxSize > 0 ? maxSize : SEARCH_ACTIVITY_BUFFER_SIZE;
  const next = [...events, sanitized];
  if (next.length <= limit) return next;
  return next.slice(next.length - limit);
}

export function appendSearchActivityEvents(
  events: readonly StrategySearchActivityEvent[],
  incoming: readonly StrategySearchActivityEvent[],
  maxSize: number = SEARCH_ACTIVITY_BUFFER_SIZE,
): StrategySearchActivityEvent[] {
  let next = [...events];
  for (const event of incoming) {
    next = appendSearchActivityEvent(next, event, maxSize);
  }
  return next;
}

export function familyHandoffActivityEvents(input: {
  leavingLabel: string;
  nextLabel?: string | null;
  completedAt: string;
  startedAt?: string;
}): StrategySearchActivityEvent[] {
  const events: StrategySearchActivityEvent[] = [
    {
      type: "family_completed",
      at: input.completedAt,
      familyLabel: input.leavingLabel,
    },
  ];
  if (input.nextLabel && input.nextLabel.trim()) {
    events.push({
      type: "family_started",
      at: input.startedAt ?? input.completedAt,
      familyLabel: input.nextLabel,
    });
  }
  return events;
}
