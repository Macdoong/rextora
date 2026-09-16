/**
 * Research current-period end-boundary resolver.
 *
 * Official presets encode "today" as YYYY-MM-DD, then parseDateEnd expands
 * that to 23:59:59.999Z — a future timestamp when the job is created earlier
 * the same UTC day. Coverage then fails END_BOUNDARY_MISSING.
 *
 * Current-period ends are clamped to the earliest of:
 *   requested end, latest finalized available data, finalized clock boundary.
 *
 * Explicit historical ends (UTC calendar day before today) are preserved.
 * Future calendar days are not clamped — coverage stays fail-closed.
 *
 * Reuses candleTime finalization. Does not fetch, score, or rewrite jobs.
 */

import {
  candleCloseTime,
  isCandleFinalized,
} from "./candleTime";
import { isSupportedTimeframe, resolveTimeframe } from "./timeframes";

export const RESEARCH_DEFAULT_INTERVAL_MS = 900_000;

export interface ResolveResearchEffectiveEndInput {
  requestedEndMs: number;
  latestFinalizedAvailableMs?: number | null;
  nowMs: number;
  intervalMs?: number;
  timeframe?: string;
  /** When omitted, inferred from same UTC calendar day as nowMs. */
  isCurrentPeriodPreset?: boolean;
}

export interface ResolveResearchEffectiveEndResult {
  effectiveEndMs: number;
  clamped: boolean;
  currentPeriod: boolean;
  clockBoundaryMs: number | null;
  reason:
    | "current_period_clamped"
    | "current_period_unchanged"
    | "explicit_historical";
}

export function utcCalendarDay(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

export function isSameUtcCalendarDay(aMs: number, bMs: number): boolean {
  if (!Number.isFinite(aMs) || !Number.isFinite(bMs)) return false;
  return utcCalendarDay(aMs) === utcCalendarDay(bMs);
}

/** True when the requested end falls on the same UTC day as now. */
export function isCurrentPeriodEnd(
  requestedEndMs: number,
  nowMs: number,
): boolean {
  return isSameUtcCalendarDay(requestedEndMs, nowMs);
}

export function resolveResearchIntervalMs(input: {
  intervalMs?: number;
  timeframe?: string;
}): number {
  if (
    typeof input.intervalMs === "number" &&
    Number.isFinite(input.intervalMs) &&
    input.intervalMs > 0
  ) {
    return input.intervalMs;
  }
  if (typeof input.timeframe === "string" && isSupportedTimeframe(input.timeframe)) {
    return resolveTimeframe(input.timeframe).intervalMs;
  }
  return RESEARCH_DEFAULT_INTERVAL_MS;
}

/**
 * Close time of the latest candle that is finalized at nowMs.
 * A forming bar's future close is never used.
 */
export function latestFinalizedClockBoundaryMs(
  nowMs: number,
  intervalMs: number,
): number {
  if (
    !Number.isFinite(nowMs) ||
    !Number.isFinite(intervalMs) ||
    intervalMs <= 0
  ) {
    return nowMs;
  }
  const currentOpen = Math.floor(nowMs / intervalMs) * intervalMs;
  const current = { openTime: currentOpen };
  if (isCandleFinalized(current, nowMs, intervalMs)) {
    return candleCloseTime(current, intervalMs);
  }
  const previousOpen = currentOpen - intervalMs;
  return candleCloseTime({ openTime: previousOpen }, intervalMs);
}

export function resolveResearchEffectiveEnd(
  input: ResolveResearchEffectiveEndInput,
): ResolveResearchEffectiveEndResult {
  const requestedEndMs = input.requestedEndMs;
  const nowMs = input.nowMs;
  const intervalMs = resolveResearchIntervalMs(input);

  if (!Number.isFinite(requestedEndMs) || !Number.isFinite(nowMs)) {
    return {
      effectiveEndMs: requestedEndMs,
      clamped: false,
      currentPeriod: false,
      clockBoundaryMs: null,
      reason: "explicit_historical",
    };
  }

  const currentPeriod =
    input.isCurrentPeriodPreset === true
      ? true
      : input.isCurrentPeriodPreset === false
        ? false
        : isCurrentPeriodEnd(requestedEndMs, nowMs);

  if (!currentPeriod) {
    return {
      effectiveEndMs: requestedEndMs,
      clamped: false,
      currentPeriod: false,
      clockBoundaryMs: null,
      reason: "explicit_historical",
    };
  }

  const clockBoundaryMs = latestFinalizedClockBoundaryMs(nowMs, intervalMs);
  const caps = [requestedEndMs, clockBoundaryMs];
  const available = input.latestFinalizedAvailableMs;
  if (typeof available === "number" && Number.isFinite(available)) {
    caps.push(available);
  }
  const effectiveEndMs = Math.min(...caps);
  const clamped = effectiveEndMs < requestedEndMs;
  return {
    effectiveEndMs,
    clamped,
    currentPeriod: true,
    clockBoundaryMs,
    reason: clamped ? "current_period_clamped" : "current_period_unchanged",
  };
}
