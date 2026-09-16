/**
 * P3-A3 read-only diagnosis: candle-spacing predicate + Research coverage gap.
 * Does not mutate production data or start Research jobs.
 */

import { validateCandleSpacing, expectedBarCount } from "./timeframes";
import { calculateBacktestDataCoverage } from "../backtest/backtestDataCoverage";

export const INTERVAL_15M_MS = 900_000;
export const SPACING_TOLERANCE_15M_MS = Math.floor(INTERVAL_15M_MS * 0.05);

/** Exact predicate copied from timeframes.ts::validateCandleSpacing (proven). */
export const CANDLE_SPACING_FORMULA =
  "reject iff any openTime % intervalMs !== 0 (OFF_GRID) OR delta<=0 (DUPLICATE_OR_ORDER) OR (delta>intervalMs && delta%intervalMs===0) (INTERNAL_MISSING_BARS) OR delta!==intervalMs (OFF_GRID); exact adjacency only, no ±5% tolerance.";

export const RESEARCH_DATA_PIPELINE = [
  "src/lib/rextora/strategySearch/jobExecutionRegistry.ts::resolveCandles",
  "src/lib/rextora/data/historicalCandleLoader.ts::loadHistoricalCandles",
  "src/lib/rextora/strategySearch/backtestAdapter.ts::resolveCandles",
  "src/lib/rextora/strategySearch/backtestAdapter.ts::validateCandles",
  "src/lib/rextora/strategySearch/backtestAdapter.ts::runCandidateWindowEvaluation",
  "src/lib/rextora/backtest/backtestEngine.ts::runSafeV44Backtest",
  "src/lib/rextora/strategySearch/candidateEvaluator.ts",
  "src/lib/rextora/strategySearch/jobRunner.ts::trialFromEvaluation",
].join(" → ");

export const SPACING_DELTAS_15M = [
  0, 1, 1000, 44999, 45000, 45001, 855000, 899999, 900000, 900001, 945000,
  1_799_999, 1_800_000, 1_800_001, 2_700_000, 3_600_000,
] as const;

export type SpacingDeltaRow = {
  deltaMs: number;
  accepted: boolean;
  reason: string | null;
  remainder: number;
  alignedTo15mGrid: boolean;
  missingBarsIfOnGrid: number | null;
};

export function evaluateSpacingDelta(
  deltaMs: number,
  intervalMs = INTERVAL_15M_MS,
): SpacingDeltaRow {
  const t0 = Date.UTC(2024, 0, 1);
  const reason = validateCandleSpacing([t0, t0 + deltaMs], intervalMs);
  const rem = ((deltaMs % intervalMs) + intervalMs) % intervalMs;
  const aligned =
    deltaMs > 0 && rem === 0 && Number.isInteger(deltaMs / intervalMs);
  return {
    deltaMs,
    accepted: reason == null,
    reason,
    remainder: rem,
    alignedTo15mGrid: aligned,
    missingBarsIfOnGrid: aligned ? deltaMs / intervalMs - 1 : null,
  };
}

export function buildSpacingDeltaMatrix(): SpacingDeltaRow[] {
  return SPACING_DELTAS_15M.map((d) => evaluateSpacingDelta(d));
}

export function countMissingBarsIntendedFromComment(): {
  commentClaims: number;
  predicateUpperBound: number | null;
  testsProveAtLeast: number;
  documentedHardCap: "NOT_DOCUMENTED";
} {
  return {
    commentClaims: 1,
    predicateUpperBound: null,
    testsProveAtLeast: 1,
    documentedHardCap: "NOT_DOCUMENTED",
  };
}

export function isOpenTimeGridAligned(
  openTime: number,
  intervalMs = INTERVAL_15M_MS,
): boolean {
  return openTime % intervalMs === 0;
}

export function reproducePathological1ms(): {
  validatorAccepted: boolean;
  reason: string | null;
} {
  const t0 = Date.UTC(2024, 0, 1);
  const reason = validateCandleSpacing([t0, t0 + 1], INTERVAL_15M_MS);
  return { validatorAccepted: reason == null, reason };
}

export function backtestCoverageVs1msInternals(kind: "tail_short" | "full_span") {
  const from = Date.UTC(2024, 0, 1);
  const to = from + INTERVAL_15M_MS;
  if (kind === "tail_short") {
    return calculateBacktestDataCoverage({
      timeframe: "15m",
      requestedStartMs: from,
      requestedEndMs: to,
      candles: [{ openTime: from }, { openTime: from + 1 }],
    });
  }
  return calculateBacktestDataCoverage({
    timeframe: "15m",
    requestedStartMs: from,
    requestedEndMs: to,
    candles: [
      { openTime: from },
      { openTime: from + 1 },
      { openTime: to },
    ],
  });
}

export const RECOMMENDED_SPACING_MODEL = "MODEL_B" as const;
export const RECOMMENDED_COVERAGE_REUSE_MODEL = "MODEL_C" as const;

export const RESEARCH_COVERAGE_FAILURE_CLASSIFICATION =
  "DATA_COVERAGE_INSUFFICIENT_JOB_SCOPE";

export function getSyntheticCapStatus() {
  return {
    path: "src/lib/rextora/data/ohlcvTypes.ts::generateSyntheticCandlesForRange",
    cap: 20_000,
    productionReachable: false,
    reason:
      "API POST /api/rextora/backtest/run hardcodes dataMode: binance; synthetic-test is runner-only for unit tests",
    recommendation: "SEPARATE_DEBT" as const,
  };
}
