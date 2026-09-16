/**
 * Generic historical market-data coverage (P3-A4).
 * No React, Backtest UI, Research UI, or lifecycle dependencies.
 */

import {
  expectedBarCount,
  inspectCandleSpacing,
  resolveTimeframe,
} from "./timeframes";

export type HistoricalDataCoverageFailureReason =
  | "EMPTY_CANDLES"
  | "START_BOUNDARY_MISSING"
  | "END_BOUNDARY_MISSING"
  | "DUPLICATE_TIMESTAMPS"
  | "OFF_GRID_TIMESTAMPS"
  | "INTERNAL_MISSING_BARS"
  | "SPACING_INVALID";

export interface HistoricalDataCoverage {
  requestedStart: string;
  requestedEnd: string;
  actualStart: string | null;
  actualEnd: string | null;
  timeframe: string;
  expectedCandleCount: number;
  actualCandleCount: number;
  uniqueCandleCount: number;
  duplicateCount: number;
  missingBarCount: number;
  coverageRatio: number;
  startBoundaryCovered: boolean;
  endBoundaryCovered: boolean;
  gridAligned: boolean;
  spacingValid: boolean;
  sufficient: boolean;
  failureReasons: HistoricalDataCoverageFailureReason[];
}

export const DATA_COVERAGE_INSUFFICIENT = "DATA_COVERAGE_INSUFFICIENT";

export class HistoricalDataCoverageError extends Error {
  readonly code: typeof DATA_COVERAGE_INSUFFICIENT = DATA_COVERAGE_INSUFFICIENT;
  readonly sourceReason: HistoricalDataCoverageFailureReason;
  readonly failureReasons: HistoricalDataCoverageFailureReason[];
  readonly coverage: HistoricalDataCoverage;

  constructor(input: {
    coverage: HistoricalDataCoverage;
    userMessage?: string;
  }) {
    const sourceReason = pickPrimaryCoverageReason(input.coverage.failureReasons);
    super(
      input.userMessage ??
        "요청한 기간의 시장 데이터가 부족하거나 캔들 간격이 올바르지 않습니다.",
    );
    this.name = "HistoricalDataCoverageError";
    this.sourceReason = sourceReason;
    this.failureReasons = [...input.coverage.failureReasons];
    this.coverage = input.coverage;
  }
}

const REASON_PRIORITY: HistoricalDataCoverageFailureReason[] = [
  "EMPTY_CANDLES",
  "OFF_GRID_TIMESTAMPS",
  "INTERNAL_MISSING_BARS",
  "DUPLICATE_TIMESTAMPS",
  "SPACING_INVALID",
  "START_BOUNDARY_MISSING",
  "END_BOUNDARY_MISSING",
];

export function pickPrimaryCoverageReason(
  reasons: readonly HistoricalDataCoverageFailureReason[],
): HistoricalDataCoverageFailureReason {
  for (const code of REASON_PRIORITY) {
    if (reasons.includes(code)) return code;
  }
  return "END_BOUNDARY_MISSING";
}

export function calculateHistoricalDataCoverage(input: {
  timeframe: string;
  requestedStartMs: number;
  requestedEndMs: number;
  candles: ReadonlyArray<{ openTime: number }>;
}): HistoricalDataCoverage {
  const spec = resolveTimeframe(input.timeframe);
  const intervalMs = spec.intervalMs;
  const boundaryTol = Math.floor(intervalMs * 0.05);
  const expectedCandleCount = expectedBarCount(
    input.requestedStartMs,
    input.requestedEndMs,
    intervalMs,
  );
  const lastExpectedOpen =
    expectedCandleCount > 0
      ? input.requestedStartMs + (expectedCandleCount - 1) * intervalMs
      : input.requestedStartMs;

  const openTimes = input.candles.map((c) => c.openTime);
  const unique = new Set(openTimes);
  const uniqueCandleCount = unique.size;
  const actualCandleCount = openTimes.length;
  const duplicateCount = actualCandleCount - uniqueCandleCount;
  const missingBarCount = Math.max(0, expectedCandleCount - uniqueCandleCount);
  const coverageRatio =
    expectedCandleCount > 0 ? uniqueCandleCount / expectedCandleCount : 0;

  const first = openTimes.length ? openTimes[0]! : null;
  const last = openTimes.length ? openTimes[openTimes.length - 1]! : null;

  const startBoundaryCovered =
    first != null &&
    first >= input.requestedStartMs - boundaryTol &&
    first <= input.requestedStartMs + boundaryTol;

  const endBoundaryCovered =
    last != null &&
    last >= lastExpectedOpen - boundaryTol &&
    last <= input.requestedEndMs + boundaryTol;

  const spacing = inspectCandleSpacing(openTimes, intervalMs);
  const spacingValid = spacing.ok;
  const gridAligned =
    openTimes.length === 0 ||
    openTimes.every(
      (t) => Number.isFinite(t) && t % intervalMs === 0,
    );

  const failureReasons: HistoricalDataCoverageFailureReason[] = [];
  if (actualCandleCount === 0) failureReasons.push("EMPTY_CANDLES");
  if (!startBoundaryCovered) failureReasons.push("START_BOUNDARY_MISSING");
  if (!endBoundaryCovered) failureReasons.push("END_BOUNDARY_MISSING");
  if (duplicateCount > 0) failureReasons.push("DUPLICATE_TIMESTAMPS");
  if (!spacing.ok && spacing.code === "OFF_GRID") {
    failureReasons.push("OFF_GRID_TIMESTAMPS");
  } else if (!spacing.ok && spacing.code === "INTERNAL_MISSING_BARS") {
    failureReasons.push("INTERNAL_MISSING_BARS");
  } else if (!spacing.ok && spacing.code === "DUPLICATE_OR_ORDER") {
    if (duplicateCount === 0) failureReasons.push("SPACING_INVALID");
  }

  const sufficient =
    actualCandleCount > 0 &&
    startBoundaryCovered &&
    endBoundaryCovered &&
    duplicateCount === 0 &&
    spacingValid;

  return {
    requestedStart: new Date(input.requestedStartMs).toISOString(),
    requestedEnd: new Date(input.requestedEndMs).toISOString(),
    actualStart: first != null ? new Date(first).toISOString() : null,
    actualEnd: last != null ? new Date(last).toISOString() : null,
    timeframe: spec.id,
    expectedCandleCount,
    actualCandleCount,
    uniqueCandleCount,
    duplicateCount,
    missingBarCount,
    coverageRatio,
    startBoundaryCovered,
    endBoundaryCovered,
    gridAligned,
    spacingValid,
    sufficient,
    failureReasons,
  };
}

export function assertHistoricalDataCoverage(input: {
  timeframe: string;
  requestedStartMs: number;
  requestedEndMs: number;
  candles: ReadonlyArray<{ openTime: number }>;
}): HistoricalDataCoverage {
  const coverage = calculateHistoricalDataCoverage(input);
  if (!coverage.sufficient) {
    throw new HistoricalDataCoverageError({ coverage });
  }
  return coverage;
}
