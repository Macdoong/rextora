/**
 * Risk operator presentation — labels and current/limit formatting only.
 * No threshold, sizing, or halt-authority changes.
 */

export const RISK_OPERATOR_UNAVAILABLE = "데이터 없음";
export const RISK_RECOVERY_UNKNOWN = "자동 복구 조건 확인 필요";

export type RiskOperatorSemantic =
  | "normal"
  | "warning"
  | "limit_reached"
  | "risk_halted"
  | "emergency_stop";

export type RiskLimitRow = {
  id: string;
  labelKo: string;
  currentLabel: string;
  limitLabel: string;
  combinedLabel: string;
  deltaLabel: string;
  breached: boolean;
  available: boolean;
};

export function riskOperatorStatePresentation(input: {
  riskState?: "정상" | "주의" | "위험" | "자동 중단" | null;
  emergencyStopActive?: boolean;
  limitBreached?: boolean;
}): {
  semantic: RiskOperatorSemantic;
  labelKo: string;
} {
  if (input.emergencyStopActive) {
    return { semantic: "emergency_stop", labelKo: "긴급 정지" };
  }
  if (input.riskState === "자동 중단") {
    return { semantic: "risk_halted", labelKo: "위험 제한으로 자동 중단" };
  }
  if (input.limitBreached || input.riskState === "위험") {
    return { semantic: "limit_reached", labelKo: "한도 도달" };
  }
  if (input.riskState === "주의") {
    return { semantic: "warning", labelKo: "주의" };
  }
  if (input.riskState === "정상") {
    return { semantic: "normal", labelKo: "정상" };
  }
  return { semantic: "warning", labelKo: "주의" };
}

export function riskOperatorFormatRatio(
  current: number | null | undefined,
  limit: number | null | undefined,
  unit: string,
): { currentLabel: string; limitLabel: string; combinedLabel: string; available: boolean } {
  const currentOk = current != null && Number.isFinite(current);
  const limitOk = limit != null && Number.isFinite(limit);
  const currentLabel = currentOk ? `${formatNumber(current)}${unit}` : RISK_OPERATOR_UNAVAILABLE;
  const limitLabel = limitOk ? `${formatNumber(limit)}${unit}` : RISK_OPERATOR_UNAVAILABLE;
  return {
    currentLabel,
    limitLabel,
    combinedLabel: `${currentLabel} / ${limitLabel}`,
    available: currentOk && limitOk,
  };
}

export function riskOperatorDelta(
  current: number | null | undefined,
  limit: number | null | undefined,
): string {
  if (
    current == null ||
    limit == null ||
    !Number.isFinite(current) ||
    !Number.isFinite(limit)
  ) {
    return RISK_OPERATOR_UNAVAILABLE;
  }
  return formatNumber(current - limit);
}

export function riskOperatorLimitRow(input: {
  id: string;
  labelKo: string;
  current?: number | null;
  limit?: number | null;
  unit: string;
  breachedWhen?: (current: number, limit: number) => boolean;
}): RiskLimitRow {
  const formatted = riskOperatorFormatRatio(input.current, input.limit, input.unit);
  const both =
    input.current != null &&
    input.limit != null &&
    Number.isFinite(input.current) &&
    Number.isFinite(input.limit);
  const breached = both
    ? (input.breachedWhen
        ? input.breachedWhen(input.current as number, input.limit as number)
        : Math.abs(input.current as number) >= Math.abs(input.limit as number))
    : false;
  return {
    id: input.id,
    labelKo: input.labelKo,
    currentLabel: formatted.currentLabel,
    limitLabel: formatted.limitLabel,
    combinedLabel: formatted.combinedLabel,
    deltaLabel: riskOperatorDelta(input.current, input.limit),
    breached,
    available: formatted.available,
  };
}

export function riskOperatorRowsFromUnified(input: {
  currentDailyLossPct?: number | null;
  dailyLossLimitPct?: number | null;
  accountDrawdownPct?: number | null;
  accountLossLimitPct?: number | null;
  openPositions?: number | null;
  maxPositions?: number | null;
  currentLeverage?: number | null;
  maxLeverage?: number | null;
  consecutiveLosses?: number | null;
  consecutiveLossLimit?: number | null;
  dailyTrades?: number | null;
  maxDailyTrades?: number | null;
}): RiskLimitRow[] {
  return [
    riskOperatorLimitRow({
      id: "daily_loss",
      labelKo: "일일 손실",
      current: input.currentDailyLossPct,
      limit: input.dailyLossLimitPct,
      unit: "%",
      breachedWhen: (current, limit) => current <= limit,
    }),
    riskOperatorLimitRow({
      id: "drawdown",
      labelKo: "낙폭",
      current: input.accountDrawdownPct,
      limit: input.accountLossLimitPct,
      unit: "%",
      breachedWhen: (current, limit) => Math.abs(current) >= Math.abs(limit),
    }),
    riskOperatorLimitRow({
      id: "positions",
      labelKo: "포지션 수",
      current: input.openPositions,
      limit: input.maxPositions,
      unit: "건",
      breachedWhen: (current, limit) => current >= limit,
    }),
    riskOperatorLimitRow({
      id: "leverage",
      labelKo: "레버리지",
      current: input.currentLeverage,
      limit: input.maxLeverage,
      unit: "배",
      breachedWhen: (current, limit) => current > limit,
    }),
    riskOperatorLimitRow({
      id: "consecutive_losses",
      labelKo: "연속 손실",
      current: input.consecutiveLosses,
      limit: input.consecutiveLossLimit,
      unit: "회",
      breachedWhen: (current, limit) => current >= limit,
    }),
    riskOperatorLimitRow({
      id: "daily_trades",
      labelKo: "일일 거래",
      current: input.dailyTrades,
      limit: input.maxDailyTrades,
      unit: "건",
      breachedWhen: (current, limit) => current >= limit,
    }),
  ];
}

export function riskOperatorRecoveryCopy(sourceBacked?: string | null): string {
  const trimmed = sourceBacked?.trim();
  return trimmed || RISK_RECOVERY_UNKNOWN;
}

export type RiskOperatorUtilization = {
  id: string;
  labelKo: string;
  current: number | null;
  limit: number | null;
  remaining: number | null;
  usageRatio: number | null;
  currentLabel: string;
  limitLabel: string;
  combinedLabel: string;
  remainingLabel: string;
  available: boolean;
  breached: boolean;
};

/** Presentation-only |current| / |limit|. Null when either side is missing. */
export function riskOperatorUsageRatio(
  current: number | null | undefined,
  limit: number | null | undefined,
): number | null {
  if (
    current == null ||
    limit == null ||
    !Number.isFinite(current) ||
    !Number.isFinite(limit) ||
    Math.abs(limit) === 0
  ) {
    return null;
  }
  return Math.abs(current) / Math.abs(limit);
}

function remainingCapacity(
  current: number | null | undefined,
  limit: number | null | undefined,
  mode: "signed" | "magnitude",
): number | null {
  if (
    current == null ||
    limit == null ||
    !Number.isFinite(current) ||
    !Number.isFinite(limit)
  ) {
    return null;
  }
  if (mode === "magnitude") {
    return Math.abs(limit) - Math.abs(current);
  }
  return limit - current;
}

export function riskOperatorUtilizationFromUnified(input: {
  currentDailyLossPct?: number | null;
  dailyLossLimitPct?: number | null;
  remainingDailyLossPct?: number | null;
  usagePct?: number | null;
  accountDrawdownPct?: number | null;
  accountLossLimitPct?: number | null;
  openPositions?: number | null;
  maxPositions?: number | null;
  remainingPositionSlots?: number | null;
  currentLeverage?: number | null;
  maxLeverage?: number | null;
  consecutiveLosses?: number | null;
  consecutiveLossLimit?: number | null;
  dailyTrades?: number | null;
  maxDailyTrades?: number | null;
  remainingTrades?: number | null;
}): {
  metrics: RiskOperatorUtilization[];
  closest: RiskOperatorUtilization | null;
} {
  const rows = riskOperatorRowsFromUnified(input);
  const specs: Array<{
    id: string;
    current?: number | null;
    limit?: number | null;
    remaining?: number | null;
    unit: string;
    usageRatio?: number | null;
  }> = [
    {
      id: "daily_loss",
      current: input.currentDailyLossPct,
      limit: input.dailyLossLimitPct,
      remaining: input.remainingDailyLossPct,
      unit: "%",
      usageRatio:
        input.usagePct != null && Number.isFinite(input.usagePct)
          ? Math.max(0, input.usagePct) / 100
          : riskOperatorUsageRatio(
              input.currentDailyLossPct,
              input.dailyLossLimitPct,
            ),
    },
    {
      id: "drawdown",
      current: input.accountDrawdownPct,
      limit: input.accountLossLimitPct,
      remaining: remainingCapacity(
        input.accountDrawdownPct,
        input.accountLossLimitPct,
        "magnitude",
      ),
      unit: "%",
    },
    {
      id: "positions",
      current: input.openPositions,
      limit: input.maxPositions,
      remaining: input.remainingPositionSlots,
      unit: "건",
    },
    {
      id: "leverage",
      current: input.currentLeverage,
      limit: input.maxLeverage,
      remaining: remainingCapacity(
        input.currentLeverage,
        input.maxLeverage,
        "signed",
      ),
      unit: "배",
    },
    {
      id: "consecutive_losses",
      current: input.consecutiveLosses,
      limit: input.consecutiveLossLimit,
      remaining: remainingCapacity(
        input.consecutiveLosses,
        input.consecutiveLossLimit,
        "signed",
      ),
      unit: "회",
    },
    {
      id: "daily_trades",
      current: input.dailyTrades,
      limit: input.maxDailyTrades,
      remaining: input.remainingTrades,
      unit: "건",
    },
  ];

  const metrics: RiskOperatorUtilization[] = rows.map((row) => {
    const spec = specs.find((item) => item.id === row.id);
    const usageRatio =
      spec?.usageRatio ??
      riskOperatorUsageRatio(spec?.current, spec?.limit);
    const remaining =
      spec?.remaining != null && Number.isFinite(spec.remaining)
        ? spec.remaining
        : null;
    return {
      id: row.id,
      labelKo: row.labelKo,
      current: spec?.current ?? null,
      limit: spec?.limit ?? null,
      remaining,
      usageRatio,
      currentLabel: row.currentLabel,
      limitLabel: row.limitLabel,
      combinedLabel: row.combinedLabel,
      remainingLabel:
        remaining == null || spec == null
          ? RISK_OPERATOR_UNAVAILABLE
          : `${formatNumber(remaining)}${spec.unit}`,
      available: row.available,
      breached: row.breached,
    };
  });

  const ranked = metrics
    .filter((metric) => metric.available && metric.usageRatio != null)
    .sort((a, b) => (b.usageRatio ?? 0) - (a.usageRatio ?? 0));

  return { metrics, closest: ranked[0] ?? null };
}

function formatNumber(value: number): string {
  if (Number.isInteger(value)) return String(value);
  return Number(value.toFixed(2)).toString();
}
