/**
 * Backtest market-data coverage (MODEL C).
 * Thin wrapper around generic historicalDataCoverage.
 * Boundary correctness is the pass/fail authority.
 * coverageRatio is metadata only.
 */

import {
  calculateHistoricalDataCoverage,
  type HistoricalDataCoverage,
  type HistoricalDataCoverageFailureReason,
} from "../data/historicalDataCoverage";

export const BACKTEST_DATA_COVERAGE_INSUFFICIENT =
  "BACKTEST_DATA_COVERAGE_INSUFFICIENT";

export const COVERAGE_BLOCKER_TITLE_KO = "백테스트 데이터 범위 부족";

export const COVERAGE_UI = {
  blockerTitleKo: COVERAGE_BLOCKER_TITLE_KO,
  requestedPeriodKo: "요청 기간",
  actualPeriodKo: "실제 데이터 기간",
  candleCountKo: "캔들 수",
  coverageKo: "coverage",
  expectedBarsKo: "기대 캔들",
  actualBarsKo: "실제 캔들",
} as const;

export type BacktestDataCoverageFailureReason =
  HistoricalDataCoverageFailureReason;

export type BacktestDataCoverage = HistoricalDataCoverage;

export function calculateBacktestDataCoverage(input: {
  timeframe: string;
  requestedStartMs: number;
  requestedEndMs: number;
  candles: ReadonlyArray<{ openTime: number }>;
}): BacktestDataCoverage {
  return calculateHistoricalDataCoverage(input);
}

export function formatCoveragePercent(ratio: number): string {
  if (!Number.isFinite(ratio)) return "-";
  return `${(ratio * 100).toFixed(1)}%`;
}

export function formatCoverageBlockerDetail(
  coverage: BacktestDataCoverage,
): string {
  return [
    `${COVERAGE_UI.requestedPeriodKo}: ${coverage.requestedStart} ~ ${coverage.requestedEnd}`,
    `${COVERAGE_UI.actualPeriodKo}: ${coverage.actualStart ?? "-"} ~ ${coverage.actualEnd ?? "-"}`,
    `${COVERAGE_UI.expectedBarsKo}: ${coverage.expectedCandleCount.toLocaleString("ko-KR")}`,
    `${COVERAGE_UI.actualBarsKo}: ${coverage.actualCandleCount.toLocaleString("ko-KR")}`,
    `${COVERAGE_UI.coverageKo}: ${formatCoveragePercent(coverage.coverageRatio)}`,
    `사유: ${coverage.failureReasons.join(", ") || "-"}`,
  ].join("\n");
}

export function isBacktestDataCoverageErrorCode(
  code: string | null | undefined,
): boolean {
  return code === BACKTEST_DATA_COVERAGE_INSUFFICIENT;
}
