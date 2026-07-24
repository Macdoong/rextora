import type { BacktestTrade } from "./backtestEngine";
import type {
  BacktestCostBreakdown,
  BacktestReport,
  BacktestZeroTradeDiagnostics,
  MonthlyReturnRow,
} from "./backtestTypes";
import { buildTradeEventTraces } from "./tradeEventTrace";

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
  const fundingTotal = trades.reduce(
    (sum, trade) => sum + (trade.fundingPct || 0),
    0,
  );
  const spreadTotal = trades.reduce(
    (sum, trade) => sum + (trade.spreadPct || 0),
    0,
  );

  const feeCostUsdt = trades.reduce((s, t) => s + (t.feeCostUsdt ?? 0), 0);
  const slippageCostUsdt = trades.reduce(
    (s, t) => s + (t.slippageCostUsdt ?? 0),
    0,
  );
  const spreadCostUsdt = trades.reduce((s, t) => s + (t.spreadCostUsdt ?? 0), 0);
  const fundingCostUsdt = trades.reduce(
    (s, t) => s + (t.fundingCostUsdt ?? 0),
    0,
  );
  const totalCostUsdt =
    feeCostUsdt + slippageCostUsdt + spreadCostUsdt + fundingCostUsdt;
  const grossPnLBeforeCosts = trades.reduce(
    (s, t) => s + (t.grossPnlUsdt ?? 0),
    0,
  );
  const netPnLAfterCosts = trades.reduce((s, t) => s + (t.netPnlUsdt ?? 0), 0);
  const pctCap = (u: number) =>
    startingBalance > 0 ? Number((u / startingBalance).toFixed(6)) : 0;

  const costs: BacktestCostBreakdown = {
    fees: Number(feeTotal.toFixed(6)),
    slippage: Number(slippageTotal.toFixed(6)),
    funding: Number(fundingTotal.toFixed(6)),
    spread: Number(spreadTotal.toFixed(6)),
    totalTradingCost: Number(
      (feeTotal + slippageTotal + fundingTotal + spreadTotal).toFixed(6),
    ),
    feeCostUsdt: Number(feeCostUsdt.toFixed(4)),
    feeCostPctOfInitialCapital: pctCap(feeCostUsdt),
    slippageCostUsdt: Number(slippageCostUsdt.toFixed(4)),
    slippageCostPctOfInitialCapital: pctCap(slippageCostUsdt),
    spreadCostUsdt: Number(spreadCostUsdt.toFixed(4)),
    spreadCostPctOfInitialCapital: pctCap(spreadCostUsdt),
    fundingCostUsdt: Number(fundingCostUsdt.toFixed(4)),
    fundingCostPctOfInitialCapital: pctCap(fundingCostUsdt),
    totalCostUsdt: Number(totalCostUsdt.toFixed(4)),
    totalCostPctOfInitialCapital: pctCap(totalCostUsdt),
    grossPnLBeforeCosts: Number(grossPnLBeforeCosts.toFixed(4)),
    netPnLAfterCosts: Number(netPnLAfterCosts.toFixed(4)),
    rateSumNoteKo:
      "fees/slippage/spread/funding 필드는 거래별 비용률(소수) 합계입니다. USDT·자본대비 %는 feeCostUsdt 등을 사용하세요.",
  };
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
    fundingTotal: Number(fundingTotal.toFixed(6)),
    spreadTotal: Number(spreadTotal.toFixed(6)),
    costs,
  };
}

function calendarMonthKey(ms: number): string {
  const d = new Date(ms);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

function calendarMonthLabelKo(key: string): string {
  const [y, m] = key.split("-");
  return `${y}년 ${Number(m)}월`;
}

/** Calendar-month aggregation — not trade-index buckets. */
export function buildCalendarMonthlyReturns(
  trades: BacktestTrade[],
  startingBalance: number,
): MonthlyReturnRow[] {
  const byMonth = new Map<
    string,
    {
      netPnlUsdt: number;
      trades: number;
      wins: number;
      feesRate: number;
      costUsdt: number;
      trough: number;
    }
  >();
  for (const t of trades) {
    const ts = t.exitTime ?? t.entryTime;
    if (ts == null) continue;
    const month = calendarMonthKey(ts);
    const cur = byMonth.get(month) ?? {
      netPnlUsdt: 0,
      trades: 0,
      wins: 0,
      feesRate: 0,
      costUsdt: 0,
      trough: 0,
    };
    const net = t.netPnlUsdt ?? 0;
    cur.netPnlUsdt += net;
    cur.trades += 1;
    if (t.pnlPct > 0) cur.wins += 1;
    cur.feesRate += t.feePct || 0;
    cur.costUsdt +=
      (t.feeCostUsdt ?? 0) +
      (t.slippageCostUsdt ?? 0) +
      (t.spreadCostUsdt ?? 0) +
      (t.fundingCostUsdt ?? 0);
    cur.trough = Math.min(cur.trough, t.pnlPct);
    byMonth.set(month, cur);
  }
  return [...byMonth.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, row]) => ({
      month,
      labelKo: calendarMonthLabelKo(month),
      returnPct:
        startingBalance > 0 ? row.netPnlUsdt / startingBalance : 0,
      trades: row.trades,
      mdd: row.trough,
      fees: row.feesRate,
      netPnlUsdt: Number(row.netPnlUsdt.toFixed(4)),
      winRate: row.trades ? row.wins / row.trades : 0,
      totalCostUsdt: Number(row.costUsdt.toFixed(4)),
    }));
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
  requestedFrom?: string | null;
  requestedTo?: string | null;
  actualFirstCandleTime?: string | null;
  actualLastCandleTime?: string | null;
  candleCount: number;
  processedCandleCount?: number;
  dataSource?: "binance" | "synthetic-test";
  startingBalance: number;
  endingBalance: number;
  equityCurve: number[];
  trades: BacktestTrade[];
  feesApplied?: boolean;
  slippageApplied?: boolean;
  fundingApplied?: boolean;
  spreadApplied?: boolean;
  paramsHashVerified?: boolean;
  costStress?: BacktestReport["costStress"];
  zeroTradeDiagnostics?: BacktestZeroTradeDiagnostics | null;
  rejectedSetups?: BacktestReport["rejectedSetups"];
}): BacktestReport {
  const { startingBalance, endingBalance, trades } = input;
  const metrics = aggregateBacktestMetrics(input);
  const monthlyReturns = buildCalendarMonthlyReturns(trades, startingBalance);

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
    requestedFrom: input.requestedFrom ?? null,
    requestedTo: input.requestedTo ?? null,
    actualFirstCandleTime: input.actualFirstCandleTime ?? null,
    actualLastCandleTime: input.actualLastCandleTime ?? null,
    candleCount: input.candleCount,
    processedCandleCount: input.processedCandleCount ?? input.candleCount,
    dataSource: input.dataSource ?? "binance",
    ...metrics,
    monthlyReturns,
    negativeMonths: monthlyReturns.filter((m) => m.returnPct < 0).length,
    startingBalance,
    endingBalance: Number(endingBalance.toFixed(4)),
    costStress: input.costStress,
    zeroTradeDiagnostics: input.zeroTradeDiagnostics ?? null,
    tradeEventTraces: buildTradeEventTraces(
      trades as Array<BacktestTrade & Record<string, unknown>>,
      { symbol: input.symbol, timeframe: input.timeframe },
    ),
    rejectedSetups: input.rejectedSetups ?? undefined,
    validation: {
      paramsHashVerified: input.paramsHashVerified ?? true,
      feesApplied: input.feesApplied ?? true,
      slippageApplied: input.slippageApplied ?? true,
      fundingApplied: input.fundingApplied ?? false,
      spreadApplied: input.spreadApplied ?? false,
      noRealOrders: true,
    },
  };
}
