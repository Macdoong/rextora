import type { BacktestTrade } from "./backtestEngine";
import type { BacktestReport, MonthlyReturnRow } from "./backtestTypes";

export type { BacktestReport, MonthlyReturnRow };

export function aggregateBacktestMetrics(input: {
  startingBalance: number;
  endingBalance: number;
  equityCurve: number[];
  trades: BacktestTrade[];
}) {
  const { startingBalance, endingBalance, equityCurve, trades } = input;
  const totalReturn =
    startingBalance > 0
      ? (endingBalance - startingBalance) / startingBalance
      : 0;
  let peak = startingBalance;
  let mdd = 0;
  for (const eq of equityCurve) {
    peak = Math.max(peak, eq);
    if (peak > 0) mdd = Math.min(mdd, (eq - peak) / peak);
  }
  const wins = trades.filter((t) => t.pnlPct > 0);
  const losses = trades.filter((t) => t.pnlPct < 0);
  const winRate = trades.length ? wins.length / trades.length : 0;
  const averageTrade = trades.length
    ? trades.reduce((sum, trade) => sum + trade.pnlPct, 0) / trades.length
    : 0;
  const grossWin = wins.reduce((sum, trade) => sum + trade.pnlPct, 0);
  const grossLoss = Math.abs(
    losses.reduce((sum, trade) => sum + trade.pnlPct, 0),
  );
  const profitFactor =
    grossLoss > 0 ? grossWin / grossLoss : grossWin > 0 ? 99 : 0;
  let maxConsecutiveLosses = 0;
  let streak = 0;
  for (const trade of trades) {
    if (trade.pnlPct < 0) {
      streak += 1;
      maxConsecutiveLosses = Math.max(maxConsecutiveLosses, streak);
    } else {
      streak = 0;
    }
  }
  const feeTotal = trades.reduce((sum, trade) => sum + (trade.feePct || 0), 0);
  const slippageTotal = trades.reduce(
    (sum, trade) => sum + (trade.slippagePct || 0),
    0,
  );
  return {
    totalReturn: Number(totalReturn.toFixed(6)),
    mdd: Number(mdd.toFixed(6)),
    tradeCount: trades.length,
    winRate: Number(winRate.toFixed(4)),
    averageTrade: Number(averageTrade.toFixed(6)),
    profitFactor: Number(profitFactor.toFixed(4)),
    maxConsecutiveLosses,
    feeImpact: Number(
      (trades.length ? feeTotal / trades.length : 0).toFixed(6),
    ),
    feeTotal: Number(feeTotal.toFixed(6)),
    slippageTotal: Number(slippageTotal.toFixed(6)),
  };
}

export function buildBacktestReport(input: {
  symbol: string;
  symbols?: string[];
  paramsHash: string;
  strategyName: string;
  strategyId: string;
  sourceStatus: string;
  timeframe: string;
  fromDate?: string | null;
  toDate?: string | null;
  candleCount: number;
  startingBalance: number;
  endingBalance: number;
  equityCurve: number[];
  trades: BacktestTrade[];
  feesApplied?: boolean;
  slippageApplied?: boolean;
  fundingApplied?: boolean;
  paramsHashVerified?: boolean;
  costStress?: BacktestReport["costStress"];
}): BacktestReport {
  const { startingBalance, endingBalance, trades } = input;
  const metrics = aggregateBacktestMetrics(input);

  const byMonth = new Map<
    string,
    {
      returnPct: number;
      trades: number;
      fees: number;
      peak: number;
      trough: number;
    }
  >();
  for (const t of trades) {
    const month = `T${String(Math.floor(t.exitBar / 20) + 1).padStart(2, "0")}`;
    const cur = byMonth.get(month) ?? {
      returnPct: 0,
      trades: 0,
      fees: 0,
      peak: 0,
      trough: 0,
    };
    cur.returnPct += t.pnlPct;
    cur.trades += 1;
    cur.fees += t.feePct || 0;
    cur.trough = Math.min(cur.trough, t.pnlPct);
    byMonth.set(month, cur);
  }
  const monthlyReturns: MonthlyReturnRow[] = [...byMonth.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, row]) => ({
      month,
      returnPct: row.returnPct,
      trades: row.trades,
      mdd: row.trough,
      fees: row.fees,
    }));

  return {
    strategyName: input.strategyName,
    strategyHash: input.paramsHash,
    strategyId: input.strategyId,
    sourceStatus: input.sourceStatus,
    symbol: input.symbol,
    symbols: input.symbols ?? [input.symbol],
    timeframe: input.timeframe,
    fromDate: input.fromDate ?? null,
    toDate: input.toDate ?? null,
    candleCount: input.candleCount,
    ...metrics,
    monthlyReturns,
    negativeMonths: monthlyReturns.filter((m) => m.returnPct < 0).length,
    startingBalance,
    endingBalance: Number(endingBalance.toFixed(4)),
    costStress: input.costStress,
    validation: {
      paramsHashVerified: input.paramsHashVerified ?? true,
      feesApplied: input.feesApplied ?? true,
      slippageApplied: input.slippageApplied ?? true,
      fundingApplied: input.fundingApplied ?? false,
      noRealOrders: true,
    },
  };
}
