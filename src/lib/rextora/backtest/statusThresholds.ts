/**
 * Deterministic status-chip thresholds for backtest result summary.
 * All cutoffs live here so UI and tests share one source of truth.
 */

export type ProfitChip = "Profitable" | "Losing";
export type DrawdownChip = "Low drawdown" | "Medium drawdown" | "High drawdown";
export type CostBurdenChip = "Low cost" | "Medium cost" | "High cost";
export type SampleChip = "Sufficient sample" | "Insufficient sample";

/** Absolute net return: ≥ 0 → Profitable */
export const PROFIT_THRESHOLD = 0;

/** Max drawdown (fraction of equity peak): <10% low, <25% medium, else high */
export const MDD_LOW = 0.1;
export const MDD_MEDIUM = 0.25;

/**
 * Total trading cost as fraction of initial capital:
 * <2% low, <5% medium, else high
 */
export const COST_LOW = 0.02;
export const COST_MEDIUM = 0.05;

/** Minimum closed trades for a “sufficient” sample */
export const SAMPLE_MIN_TRADES = 30;

export function profitChip(totalReturn: number): ProfitChip {
  return totalReturn >= PROFIT_THRESHOLD ? "Profitable" : "Losing";
}

export function drawdownChip(mdd: number): DrawdownChip {
  if (mdd < MDD_LOW) return "Low drawdown";
  if (mdd < MDD_MEDIUM) return "Medium drawdown";
  return "High drawdown";
}

export function costBurdenChip(totalCostPctOfInitial: number): CostBurdenChip {
  if (totalCostPctOfInitial < COST_LOW) return "Low cost";
  if (totalCostPctOfInitial < COST_MEDIUM) return "Medium cost";
  return "High cost";
}

export function sampleChip(tradeCount: number): SampleChip {
  return tradeCount >= SAMPLE_MIN_TRADES
    ? "Sufficient sample"
    : "Insufficient sample";
}

export function statusChips(input: {
  totalReturn: number;
  mdd: number;
  totalCostPctOfInitial: number;
  tradeCount: number;
}): Array<{ id: string; labelKo: string; tone: "success" | "warning" | "danger" | "muted" }> {
  const profit = profitChip(input.totalReturn);
  const dd = drawdownChip(input.mdd);
  const cost = costBurdenChip(input.totalCostPctOfInitial);
  const sample = sampleChip(input.tradeCount);

  return [
    {
      id: "profit",
      labelKo: profit === "Profitable" ? "수익" : "손실",
      tone: profit === "Profitable" ? "success" : "danger",
    },
    {
      id: "mdd",
      labelKo:
        dd === "Low drawdown"
          ? "낮은 낙폭"
          : dd === "Medium drawdown"
            ? "중간 낙폭"
            : "높은 낙폭",
      tone:
        dd === "Low drawdown"
          ? "success"
          : dd === "Medium drawdown"
            ? "warning"
            : "danger",
    },
    {
      id: "cost",
      labelKo:
        cost === "Low cost"
          ? "낮은 비용"
          : cost === "Medium cost"
            ? "중간 비용"
            : "높은 비용",
      tone:
        cost === "Low cost"
          ? "success"
          : cost === "Medium cost"
            ? "warning"
            : "danger",
    },
    {
      id: "sample",
      labelKo:
        sample === "Sufficient sample" ? "표본 충분" : "표본 부족",
      tone: sample === "Sufficient sample" ? "success" : "warning",
    },
  ];
}
