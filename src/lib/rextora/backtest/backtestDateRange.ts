/**
 * Shared backtest period presets and date validation.
 * Client (BacktestReviewWorkbench) and server (/api/rextora/backtest/run)
 * must apply identical rules.
 */

export type BacktestDayPreset = {
  id: string;
  label: string;
  /** Calendar-day lookback; null means whole available dataset. */
  days: number | null;
};

/** Compact presets for the default Backtest review workbench. */
export const BACKTEST_PERIOD_PRESETS: readonly BacktestDayPreset[] = [
  { id: "1m", label: "최근 1개월", days: 30 },
  { id: "3m", label: "최근 3개월", days: 90 },
  { id: "6m", label: "최근 6개월", days: 180 },
  { id: "1y", label: "최근 1년", days: 365 },
  { id: "all", label: "전체 기간", days: null },
] as const;

export function toDateInput(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function calendarDateUtcFromMs(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

export function todayCalendarUtc(nowMs = Date.now()): string {
  return calendarDateUtcFromMs(nowMs);
}

/** True only when the YYYY-MM-DD calendar day is after today (UTC). */
export function isFutureCalendarDate(
  endDateYmd: string,
  nowMs = Date.now(),
): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(endDateYmd)) return true;
  return endDateYmd > todayCalendarUtc(nowMs);
}

export function isFutureCalendarDateFromOpenTime(
  toOpenTime: number,
  nowMs = Date.now(),
): boolean {
  if (!Number.isFinite(toOpenTime)) return true;
  return isFutureCalendarDate(calendarDateUtcFromMs(toOpenTime), nowMs);
}

export function parseDateStart(value: string): number | null {
  if (!value) return null;
  const t = Date.parse(`${value}T00:00:00.000Z`);
  return Number.isFinite(t) ? t : null;
}

/**
 * Raw end-of-day UTC for a calendar date (may be "in the future" vs wall clock
 * when the date is today). Prefer resolveEffectiveEndOpenTime for execution.
 */
export function parseDateEndRaw(value: string): number | null {
  if (!value) return null;
  const t = Date.parse(`${value}T23:59:59.999Z`);
  return Number.isFinite(t) ? t : null;
}

/**
 * Effective end open-time for a selected calendar end date.
 * Today is never rejected: clamp to min(now, latest candle, end-of-day).
 * Future calendar dates are rejected.
 */
export function resolveEffectiveEndOpenTime(
  endDateYmd: string,
  nowMs = Date.now(),
  latestCandleOpenTime?: number | null,
):
  | { ok: true; endOpenTime: number }
  | { ok: false; error: string; code: "FUTURE_DATA_BLOCKED" | "INVALID_DATE" } {
  if (!endDateYmd || !/^\d{4}-\d{2}-\d{2}$/.test(endDateYmd)) {
    return {
      ok: false,
      error: "종료일이 올바르지 않습니다.",
      code: "INVALID_DATE",
    };
  }
  if (isFutureCalendarDate(endDateYmd, nowMs)) {
    return {
      ok: false,
      error: "미래 구간으로 백테스트를 실행할 수 없습니다.",
      code: "FUTURE_DATA_BLOCKED",
    };
  }
  const endOfDay = parseDateEndRaw(endDateYmd);
  if (endOfDay == null) {
    return {
      ok: false,
      error: "종료일이 올바르지 않습니다.",
      code: "INVALID_DATE",
    };
  }
  let endOpenTime = Math.min(endOfDay, nowMs);
  if (
    latestCandleOpenTime != null &&
    Number.isFinite(latestCandleOpenTime) &&
    latestCandleOpenTime > 0
  ) {
    endOpenTime = Math.min(endOpenTime, latestCandleOpenTime);
  }
  return { ok: true, endOpenTime };
}

/**
 * Same calendar rule when the client/server already has a millisecond timestamp.
 * Rejects only when the calendar day of toOpenTime is after today;
 * otherwise clamps to min(requested, now, optional latest candle) without
 * expanding an earlier intra-day timestamp to end-of-day.
 */
export function resolveEffectiveEndFromOpenTime(
  toOpenTime: number,
  nowMs = Date.now(),
  latestCandleOpenTime?: number | null,
):
  | { ok: true; endOpenTime: number }
  | { ok: false; error: string; code: "FUTURE_DATA_BLOCKED" | "INVALID_DATE" } {
  if (!Number.isFinite(toOpenTime) || toOpenTime <= 0) {
    return {
      ok: false,
      error: "종료일이 올바르지 않습니다.",
      code: "INVALID_DATE",
    };
  }
  if (isFutureCalendarDateFromOpenTime(toOpenTime, nowMs)) {
    return {
      ok: false,
      error: "미래 구간으로 백테스트를 실행할 수 없습니다.",
      code: "FUTURE_DATA_BLOCKED",
    };
  }
  let endOpenTime = Math.min(toOpenTime, nowMs);
  if (
    latestCandleOpenTime != null &&
    Number.isFinite(latestCandleOpenTime) &&
    latestCandleOpenTime > 0
  ) {
    endOpenTime = Math.min(endOpenTime, latestCandleOpenTime);
  }
  return { ok: true, endOpenTime };
}

export function computeDayPresetRange(
  days: number,
  nowMs = Date.now(),
  bounds?: {
    fromOpenTime?: number | null;
    toOpenTime?: number | null;
  } | null,
): { fromDate: string; toDate: string } {
  const latest =
    bounds?.toOpenTime != null && Number.isFinite(bounds.toOpenTime)
      ? Math.min(nowMs, bounds.toOpenTime)
      : nowMs;
  const earliest =
    bounds?.fromOpenTime != null && Number.isFinite(bounds.fromOpenTime)
      ? bounds.fromOpenTime
      : null;
  let fromMs = latest - days * 86_400_000;
  if (earliest != null) fromMs = Math.max(fromMs, earliest);
  if (fromMs > latest) fromMs = latest;
  return {
    fromDate: toDateInput(new Date(fromMs)),
    toDate: toDateInput(new Date(latest)),
  };
}

export type AvailableCandleDateRange = {
  fromDate: string;
  toDate: string;
  fromOpenTime: number;
  toOpenTime: number;
  symbol: string;
  timeframe: string;
};

/**
 * Validate from/to calendar dates for user backtest run (shared client/server).
 */
export function validateBacktestCalendarRange(
  fromDate: string,
  toDate: string,
  nowMs = Date.now(),
  latestCandleOpenTime?: number | null,
):
  | {
      ok: true;
      fromOpenTime: number;
      toOpenTime: number;
    }
  | { ok: false; error: string; code: string } {
  const fromOpenTime = parseDateStart(fromDate);
  if (fromOpenTime == null) {
    return {
      ok: false,
      error: "시작일과 종료일을 모두 입력하세요.",
      code: "INVALID_DATE_RANGE",
    };
  }
  const end = resolveEffectiveEndOpenTime(
    toDate,
    nowMs,
    latestCandleOpenTime,
  );
  if (!end.ok) {
    return end;
  }
  if (fromOpenTime >= end.endOpenTime) {
    return {
      ok: false,
      error: "시작일은 종료일보다 이전이어야 합니다.",
      code: "INVALID_DATE_RANGE",
    };
  }
  return {
    ok: true,
    fromOpenTime,
    toOpenTime: end.endOpenTime,
  };
}
