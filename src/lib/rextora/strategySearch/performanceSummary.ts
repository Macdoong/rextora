/**
 * Verified performance summary from trial / window metrics.
 * Never fabricates sharpe or other unmapped metrics.
 */

export interface VerifiedPerformanceSummary {
  trades: number | null;
  totalReturn: number | null;
  mdd: number | null;
  winRate: number | null;
  profitFactor: number | null;
  averageTrade: number | null;
  /** Always null until BacktestReport exposes sharpe into search metrics. */
  sharpe: number | null;
  score: number | null;
  monthlyReturns: Array<{ month: string; returnPct: number }> | null;
}

function numOrNull(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

export function performanceSummaryFromWindowResults(
  windowResults: Array<Record<string, unknown>> | null | undefined,
  score: number | null | undefined,
): VerifiedPerformanceSummary {
  const primary = windowResults?.[0] ?? null;
  if (!primary) {
    return {
      trades: null,
      totalReturn: null,
      mdd: null,
      winRate: null,
      profitFactor: null,
      averageTrade: null,
      sharpe: null,
      score: numOrNull(score),
      monthlyReturns: null,
    };
  }
  const monthlyRaw = primary.monthlyReturns;
  let monthlyReturns: VerifiedPerformanceSummary["monthlyReturns"] = null;
  if (Array.isArray(monthlyRaw)) {
    monthlyReturns = monthlyRaw
      .filter(
        (r): r is { month: string; returnPct: number } =>
          r != null &&
          typeof r === "object" &&
          typeof (r as { month?: unknown }).month === "string" &&
          typeof (r as { returnPct?: unknown }).returnPct === "number",
      )
      .map((r) => ({ month: r.month, returnPct: r.returnPct }));
  }
  return {
    trades: numOrNull(primary.trades),
    totalReturn: numOrNull(primary.totalReturn),
    mdd: numOrNull(primary.mdd),
    winRate: numOrNull(primary.winRate),
    profitFactor: numOrNull(primary.profitFactor),
    averageTrade: numOrNull(primary.averageTrade),
    sharpe: null,
    score: numOrNull(score),
    monthlyReturns,
  };
}

/** Prefer omitting the field in UI; do not spam unavailable copy. */
export function formatMetricOrUnavailable(
  value: number | null | undefined,
  format: (n: number) => string,
): string | null {
  if (value == null || !Number.isFinite(value)) return null;
  return format(value);
}
