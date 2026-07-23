/**
 * Canonical visual analysis model for backtest results.
 * All Backtest Analysis charts must consume this adapter — no duplicate aggregations in React.
 */
import type { OhlcvCandle } from "../data/ohlcvTypes";
import type { BacktestReport } from "./backtestTypes";
import type { BacktestTrade } from "./backtestEngine";
import type { CandlePoint, ChartPoint, ChartSeries, TradeMarker } from "../charts/types";
import { CHART_THEME } from "../charts/theme";
import { candlesToPoints } from "../charts/adapters";
import { evaluateStrategyVerdict, type StrategyVerdict } from "./strategyVerdict";
import { resolveTimeframe } from "../data/timeframes";
import {
  buildMonthlyCoverage,
  firstTradeEntryMs,
  lastTradeExitMs,
  type MonthlyCoverageRow,
} from "./monthlyCoverage";

export const ROLLING_WINDOW = 20;
/**
 * Legacy UI sample ceiling (disabled).
 * Price chart uses the full candle series; ChartShell zoom virtualizes drawing.
 */
export const CHART_SAMPLE_LIMIT = Number.POSITIVE_INFINITY;
export const MARKER_DENSITY_THRESHOLD = 80;

export interface EnrichedTrade extends BacktestTrade {
  id: string;
  marginUsdt: number;
  quantity: number;
  grossPnlUsdt: number;
  netPnlUsdt: number;
  feeCostUsdt: number;
  slippageCostUsdt: number;
  spreadCostUsdt: number;
  fundingCostUsdt: number;
  holdMs: number;
  profitable: boolean;
}

export interface MonthlyBucket {
  /** YYYY-MM (UTC) */
  monthKey: string;
  labelKo: string;
  returnPctOfInitial: number;
  netPnlUsdt: number;
  tradeCount: number;
  winRate: number;
  totalCostUsdt: number;
}

export interface HoldingBucket {
  label: string;
  count: number;
  avgReturnPct: number;
  pctOfTrades: number;
  winRate: number;
  avgNetPnlUsdt: number;
  avgTotalCostUsdt: number;
}

export interface ExitCategoryBucket {
  id: string;
  labelKo: string;
  count: number;
  pctOfTrades: number;
  avgReturnPct: number;
  avgNetPnlUsdt: number;
  avgHoldMs: number;
}

export interface TimelineSegment {
  tradeId: string;
  side: "LONG" | "SHORT";
  entryTime: number;
  exitTime: number;
  netPnlUsdt: number;
  profitable: boolean;
  exitReason: string;
}

export interface CostLedger {
  /** Sum of per-trade fee *rate* fractions (legacy display basis) */
  feeRateSum: number;
  slippageRateSum: number;
  spreadRateSum: number;
  fundingRateSum: number;
  feeCostUsdt: number;
  slippageCostUsdt: number;
  spreadCostUsdt: number;
  fundingCostUsdt: number;
  totalCostUsdt: number;
  feeCostPctOfInitialCapital: number;
  slippageCostPctOfInitialCapital: number;
  spreadCostPctOfInitialCapital: number;
  fundingCostPctOfInitialCapital: number;
  totalCostPctOfInitialCapital: number;
  grossPnlBeforeCostsUsdt: number;
  netPnlAfterCostsUsdt: number;
  /** Explicit denominator labels for UI */
  denominatorNoteKo: string;
  reconciled: boolean;
  reconcileDeltaUsdt: number;
}

export interface VisualAnalysisModel {
  report: BacktestReport;
  trades: EnrichedTrade[];
  priceCandles: CandlePoint[];
  sampledPriceCandles: CandlePoint[];
  chartSamplingApplied: boolean;
  tradeMarkers: TradeMarker[];
  equityPoints: ChartPoint[];
  drawdownPoints: ChartPoint[];
  equitySeries: ChartSeries;
  drawdownSeries: ChartSeries;
  monthlyReturns: MonthlyBucket[];
  winLossSummary: {
    wins: number;
    losses: number;
    flats: number;
    winPct: number;
    lossPct: number;
  };
  holdingTimeBuckets: HoldingBucket[];
  exitCategoryBuckets: ExitCategoryBucket[];
  cumulativeCostPoints: {
    fees: ChartPoint[];
    slippage: ChartPoint[];
    spread: ChartPoint[];
    funding: ChartPoint[];
    total: ChartPoint[];
  };
  rollingWinRatePoints: ChartPoint[];
  rollingProfitFactorPoints: ChartPoint[];
  tradeTimelineGroups: {
    long: TimelineSegment[];
    short: TimelineSegment[];
  };
  timelineSummary: {
    total: number;
    longCount: number;
    shortCount: number;
    avgHoldMs: number;
    medianHoldMs: number;
    maxHoldMs: number;
    maxConcurrent: number;
    tradesPerDay: number;
  };
  costs: CostLedger;
  verdict: StrategyVerdict;
  monthlySummary: {
    profitableMonths: number;
    losingMonths: number;
    bestMonth: MonthlyBucket | null;
    worstMonth: MonthlyBucket | null;
    avgMonthlyReturnPct: number;
    stdMonthlyReturnPct: number;
    consecutiveLosingMonths: number;
  };
  /** One row per calendar month in the verified candle/request range. */
  monthlyCoverage: MonthlyCoverageRow[];
  ledgerRange: {
    firstEntryMs: number | null;
    lastExitMs: number | null;
    firstCandleMs: number | null;
    lastCandleMs: number | null;
    tradeCount: number;
  };
  intervalMs: number;
}

export function formatKoreanDateTime(ms: number | undefined | null): string {
  if (ms == null || !Number.isFinite(ms)) return "-";
  return new Date(ms).toLocaleString("ko-KR", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatUsdt(v: number, digits = 2): string {
  return `${v.toLocaleString("ko-KR", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })} USDT`;
}

export function formatPct(fraction: number, digits = 2): string {
  return `${(fraction * 100).toFixed(digits)}%`;
}

export function formatDurationMs(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return "-";
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 60) return `${minutes}분`;
  const hours = Math.floor(minutes / 60);
  const remMin = minutes % 60;
  if (hours < 24) return remMin ? `${hours}시간 ${remMin}분` : `${hours}시간`;
  const days = Math.floor(hours / 24);
  const remH = hours % 24;
  return remH ? `${days}일 ${remH}시간` : `${days}일`;
}

function monthKeyUtc(ms: number): string {
  const d = new Date(ms);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

function monthLabelKo(key: string): string {
  const [y, m] = key.split("-");
  return `${y}년 ${Number(m)}월`;
}

function enrichTrade(t: BacktestTrade, index: number, intervalMs: number): EnrichedTrade {
  const leverage = t.leverage || 1;
  const margin =
    t.marginUsdt ??
    (t.quantity && t.entryPrice
      ? (t.quantity * t.entryPrice) / leverage
      : 0);
  // Prefer recorded USDT fields; otherwise derive from margin × rate × leverage
  const feePct = t.feePct || 0;
  const slipPct = t.slippagePct || 0;
  const spreadPct = t.spreadPct || 0;
  const fundingPct = t.fundingPct || 0;
  const feeCostUsdt =
    t.feeCostUsdt ?? Number((margin * feePct * leverage).toFixed(6));
  const slippageCostUsdt =
    t.slippageCostUsdt ?? Number((margin * slipPct * leverage).toFixed(6));
  const spreadCostUsdt =
    t.spreadCostUsdt ?? Number((margin * spreadPct * leverage).toFixed(6));
  const fundingCostUsdt =
    t.fundingCostUsdt ?? Number((margin * fundingPct * leverage).toFixed(6));
  const netPnlUsdt =
    t.netPnlUsdt ?? Number((margin * t.pnlPct).toFixed(6));
  const totalCost =
    feeCostUsdt + slippageCostUsdt + spreadCostUsdt + fundingCostUsdt;
  const grossPnlUsdt =
    t.grossPnlUsdt ?? Number((netPnlUsdt + totalCost).toFixed(6));
  const holdMs =
    t.entryTime != null && t.exitTime != null
      ? Math.max(0, t.exitTime - t.entryTime)
      : (t.holdBars ?? 0) * intervalMs;
  const quantity =
    t.quantity ??
    (margin > 0 && t.entryPrice > 0 ? (margin * leverage) / t.entryPrice : 0);

  return {
    ...t,
    id: t.id ?? `T${String(index + 1).padStart(4, "0")}`,
    marginUsdt: Number(margin.toFixed(6)),
    quantity: Number(quantity.toFixed(8)),
    feeCostUsdt,
    slippageCostUsdt,
    spreadCostUsdt,
    fundingCostUsdt,
    grossPnlUsdt,
    netPnlUsdt,
    holdMs,
    profitable: t.pnlPct > 0,
  };
}

export function buildCostLedger(
  trades: EnrichedTrade[],
  startingBalance: number,
  endingBalance: number,
): CostLedger {
  const feeRateSum = trades.reduce((s, t) => s + (t.feePct || 0), 0);
  const slippageRateSum = trades.reduce((s, t) => s + (t.slippagePct || 0), 0);
  const spreadRateSum = trades.reduce((s, t) => s + (t.spreadPct || 0), 0);
  const fundingRateSum = trades.reduce((s, t) => s + (t.fundingPct || 0), 0);
  const feeCostUsdt = trades.reduce((s, t) => s + t.feeCostUsdt, 0);
  const slippageCostUsdt = trades.reduce((s, t) => s + t.slippageCostUsdt, 0);
  const spreadCostUsdt = trades.reduce((s, t) => s + t.spreadCostUsdt, 0);
  const fundingCostUsdt = trades.reduce((s, t) => s + t.fundingCostUsdt, 0);
  const totalCostUsdt =
    feeCostUsdt + slippageCostUsdt + spreadCostUsdt + fundingCostUsdt;
  const grossPnlBeforeCostsUsdt = trades.reduce((s, t) => s + t.grossPnlUsdt, 0);
  const netPnlAfterCostsUsdt = trades.reduce((s, t) => s + t.netPnlUsdt, 0);
  const expectedNet = grossPnlBeforeCostsUsdt - totalCostUsdt;
  const reconcileDeltaUsdt = Number(
    (netPnlAfterCostsUsdt - expectedNet).toFixed(6),
  );
  const capitalDelta = endingBalance - startingBalance;
  // Allow small float error; also allow open-end flatten differences
  const ledgerVsCapital = Math.abs(netPnlAfterCostsUsdt - capitalDelta);
  const reconciled =
    Math.abs(reconcileDeltaUsdt) < 0.05 && ledgerVsCapital < Math.max(1, startingBalance * 0.002);

  const pct = (usdt: number) =>
    startingBalance > 0 ? Number((usdt / startingBalance).toFixed(6)) : 0;

  return {
    feeRateSum: Number(feeRateSum.toFixed(6)),
    slippageRateSum: Number(slippageRateSum.toFixed(6)),
    spreadRateSum: Number(spreadRateSum.toFixed(6)),
    fundingRateSum: Number(fundingRateSum.toFixed(6)),
    feeCostUsdt: Number(feeCostUsdt.toFixed(4)),
    slippageCostUsdt: Number(slippageCostUsdt.toFixed(4)),
    spreadCostUsdt: Number(spreadCostUsdt.toFixed(4)),
    fundingCostUsdt: Number(fundingCostUsdt.toFixed(4)),
    totalCostUsdt: Number(totalCostUsdt.toFixed(4)),
    feeCostPctOfInitialCapital: pct(feeCostUsdt),
    slippageCostPctOfInitialCapital: pct(slippageCostUsdt),
    spreadCostPctOfInitialCapital: pct(spreadCostUsdt),
    fundingCostPctOfInitialCapital: pct(fundingCostUsdt),
    totalCostPctOfInitialCapital: pct(totalCostUsdt),
    grossPnlBeforeCostsUsdt: Number(grossPnlBeforeCostsUsdt.toFixed(4)),
    netPnlAfterCostsUsdt: Number(netPnlAfterCostsUsdt.toFixed(4)),
    denominatorNoteKo:
      "USDT 비용은 각 거래의 증거금×레버리지×비용률로 산출하며, %는 시작 자본 대비입니다. (과거 UI의 비용% 합계는 거래별 비용률 합이며 자본 대비가 아닙니다.)",
    reconciled,
    reconcileDeltaUsdt,
  };
}

export function aggregateCalendarMonthly(
  trades: EnrichedTrade[],
  startingBalance: number,
): MonthlyBucket[] {
  const map = new Map<
    string,
    { net: number; cost: number; wins: number; count: number }
  >();
  for (const t of trades) {
    const ts = t.exitTime ?? t.entryTime;
    if (ts == null) continue;
    const key = monthKeyUtc(ts);
    const cur = map.get(key) ?? { net: 0, cost: 0, wins: 0, count: 0 };
    cur.net += t.netPnlUsdt;
    cur.cost +=
      t.feeCostUsdt + t.slippageCostUsdt + t.spreadCostUsdt + t.fundingCostUsdt;
    cur.count += 1;
    if (t.profitable) cur.wins += 1;
    map.set(key, cur);
  }
  return [...map.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([monthKey, row]) => ({
      monthKey,
      labelKo: monthLabelKo(monthKey),
      returnPctOfInitial:
        startingBalance > 0 ? row.net / startingBalance : 0,
      netPnlUsdt: Number(row.net.toFixed(4)),
      tradeCount: row.count,
      winRate: row.count ? row.wins / row.count : 0,
      totalCostUsdt: Number(row.cost.toFixed(4)),
    }));
}

export function holdingBuckets(
  trades: EnrichedTrade[],
): HoldingBucket[] {
  const defs = [
    { label: "15분 미만", max: 15 * 60_000 },
    { label: "15분–1시간", max: 60 * 60_000 },
    { label: "1–4시간", max: 4 * 60 * 60_000 },
    { label: "4–12시간", max: 12 * 60 * 60_000 },
    { label: "12–24시간", max: 24 * 60 * 60_000 },
    { label: "1일 이상", max: Number.POSITIVE_INFINITY },
  ];
  let prev = 0;
  return defs.map((d) => {
    const subset = trades.filter((t) => t.holdMs >= prev && t.holdMs < d.max);
    prev = d.max;
    const n = subset.length;
    const avgReturnPct = n
      ? subset.reduce((s, t) => s + t.pnlPct, 0) / n
      : 0;
    const wins = subset.filter((t) => t.profitable).length;
    const avgNetPnlUsdt = n
      ? subset.reduce((s, t) => s + t.netPnlUsdt, 0) / n
      : 0;
    const avgTotalCostUsdt = n
      ? subset.reduce(
          (s, t) =>
            s +
            t.feeCostUsdt +
            t.slippageCostUsdt +
            t.spreadCostUsdt +
            t.fundingCostUsdt,
          0,
        ) / n
      : 0;
    return {
      label: d.label,
      count: n,
      avgReturnPct,
      pctOfTrades: trades.length ? n / trades.length : 0,
      winRate: n ? wins / n : 0,
      avgNetPnlUsdt,
      avgTotalCostUsdt,
    };
  });
}

export function exitCategoryBuckets(
  trades: EnrichedTrade[],
): ExitCategoryBucket[] {
  const defs: Array<{
    id: string;
    labelKo: string;
    match: (t: EnrichedTrade) => boolean;
  }> = [
    { id: "win", labelKo: "이익 거래", match: (t) => t.pnlPct > 0 },
    { id: "loss", labelKo: "손실 거래", match: (t) => t.pnlPct < 0 },
    { id: "flat", labelKo: "보합 거래", match: (t) => t.pnlPct === 0 },
    {
      id: "stop_loss",
      labelKo: "손절 청산",
      match: (t) => t.exitReason === "stop_loss",
    },
    {
      id: "take_profit",
      labelKo: "익절 청산",
      match: (t) => t.exitReason === "take_profit",
    },
    {
      id: "max_hold",
      labelKo: "시간 청산",
      match: (t) =>
        t.exitReason === "max_hold" || t.exitReason === "end",
    },
  ];
  return defs.map((d) => {
    const subset = trades.filter(d.match);
    const n = subset.length;
    return {
      id: d.id,
      labelKo: d.labelKo,
      count: n,
      pctOfTrades: trades.length ? n / trades.length : 0,
      avgReturnPct: n
        ? subset.reduce((s, t) => s + t.pnlPct, 0) / n
        : 0,
      avgNetPnlUsdt: n
        ? subset.reduce((s, t) => s + t.netPnlUsdt, 0) / n
        : 0,
      avgHoldMs: n ? subset.reduce((s, t) => s + t.holdMs, 0) / n : 0,
    };
  });
}

function medianMs(values: number[]): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2;
}

function consecutiveLosingMonths(months: MonthlyBucket[]): number {
  let max = 0;
  let cur = 0;
  for (const m of months) {
    if (m.returnPctOfInitial < 0) {
      cur += 1;
      max = Math.max(max, cur);
    } else {
      cur = 0;
    }
  }
  return max;
}

function stdSample(values: number[]): number {
  if (values.length < 2) return 0;
  const mean = values.reduce((s, v) => s + v, 0) / values.length;
  const varSum = values.reduce((s, v) => s + (v - mean) ** 2, 0);
  return Math.sqrt(varSum / (values.length - 1));
}

/**
 * Pass-through: do not reduce OHLC for chart display.
 * Viewport zoom in CandlestickChart draws only the visible window.
 */
function sampleCandles(candles: CandlePoint[]): {
  sampled: CandlePoint[];
  applied: boolean;
} {
  return { sampled: candles, applied: false };
}

function buildMarkers(
  trades: EnrichedTrade[],
  densityReduce: boolean,
): TradeMarker[] {
  const step = densityReduce
    ? Math.max(1, Math.ceil(trades.length / MARKER_DENSITY_THRESHOLD))
    : 1;
  const markers: TradeMarker[] = [];
  for (let i = 0; i < trades.length; i += step) {
    const t = trades[i];
    if (t.entryTime == null) continue;
    markers.push({
      time: t.entryTime,
      price: t.entryPrice,
      kind: t.side === "LONG" ? "entry_long" : "entry_short",
      label: undefined,
      tradeId: t.id,
      meta: {
        side: t.side,
        phase: "entry",
        exitReason: t.exitReason,
        pnlPct: t.pnlPct,
        netPnlUsdt: t.netPnlUsdt,
        feeCostUsdt: t.feeCostUsdt,
        slippageCostUsdt: t.slippageCostUsdt,
        spreadCostUsdt: t.spreadCostUsdt,
        leverage: t.leverage,
        quantity: t.quantity,
        symbol: t.symbol,
        holdMs: t.holdMs,
        totalCostUsdt:
          t.feeCostUsdt +
          t.slippageCostUsdt +
          t.spreadCostUsdt +
          t.fundingCostUsdt,
      },
    });
    if (t.exitTime == null) continue;
    const exitKind =
      t.exitReason === "stop_loss"
        ? "stop_loss"
        : t.exitReason === "take_profit"
          ? "take_profit"
          : t.exitReason === "trailing_stop"
            ? "trailing_stop"
            : t.exitReason === "max_hold"
              ? "partial_exit"
              : "exit";
    markers.push({
      time: t.exitTime,
      price: t.exitPrice,
      kind: exitKind,
      label: undefined,
      tradeId: t.id,
      meta: {
        side: t.side,
        phase: "exit",
        exitReason: t.exitReason,
        pnlPct: t.pnlPct,
        netPnlUsdt: t.netPnlUsdt,
        feeCostUsdt: t.feeCostUsdt,
        slippageCostUsdt: t.slippageCostUsdt,
        spreadCostUsdt: t.spreadCostUsdt,
        leverage: t.leverage,
        quantity: t.quantity,
        symbol: t.symbol,
        holdMs: t.holdMs,
        totalCostUsdt:
          t.feeCostUsdt +
          t.slippageCostUsdt +
          t.spreadCostUsdt +
          t.fundingCostUsdt,
      },
    });
  }
  return markers;
}

function maxConcurrent(segments: TimelineSegment[]): number {
  const events: Array<{ t: number; d: number }> = [];
  for (const s of segments) {
    events.push({ t: s.entryTime, d: 1 });
    events.push({ t: s.exitTime, d: -1 });
  }
  events.sort((a, b) => a.t - b.t || a.d - b.d);
  let cur = 0;
  let max = 0;
  for (const e of events) {
    cur += e.d;
    max = Math.max(max, cur);
  }
  return max;
}

export function buildVisualAnalysisModel(input: {
  report: BacktestReport;
  trades: BacktestTrade[];
  equityCurve: number[];
  candles: OhlcvCandle[];
}): VisualAnalysisModel {
  const { report, equityCurve, candles } = input;
  let intervalMs = 900_000;
  try {
    intervalMs = resolveTimeframe(report.timeframe).intervalMs;
  } catch {
    /* keep default */
  }

  const trades = input.trades.map((t, i) => enrichTrade(t, i, intervalMs));
  const priceCandles = candlesToPoints(candles);
  const { sampled, applied } = sampleCandles(priceCandles);
  const costs = buildCostLedger(
    trades,
    report.startingBalance,
    report.endingBalance,
  );

  // Align equity/drawdown to candle or trade exit times when possible
  const equityTimes: number[] = [];
  if (candles.length && equityCurve.length) {
    // Engine pushes equity on trade close; length may differ from candles.
    // Prefer exit times of trades + start.
    equityTimes.push(candles[0]?.openTime ?? 0);
    for (const t of trades) {
      if (t.exitTime != null) equityTimes.push(t.exitTime);
    }
  }
  const equityPoints: ChartPoint[] = equityCurve.map((y, i) => ({
    x: equityTimes[i] ?? i,
    y,
    label: equityTimes[i] ? formatKoreanDateTime(equityTimes[i]) : String(i),
  }));

  let peak = equityCurve[0] ?? report.startingBalance;
  const drawdownPoints: ChartPoint[] = equityCurve.map((eq, i) => {
    peak = Math.max(peak, eq);
    const dd = peak > 0 ? ((eq - peak) / peak) * 100 : 0;
    return {
      x: equityPoints[i]?.x ?? i,
      y: dd,
      label: equityPoints[i]?.label,
    };
  });

  const monthlyReturns = aggregateCalendarMonthly(trades, report.startingBalance);
  const wins = trades.filter((t) => t.pnlPct > 0).length;
  const losses = trades.filter((t) => t.pnlPct < 0).length;
  const flats = trades.filter((t) => t.pnlPct === 0).length;

  const cum = { fees: 0, slip: 0, spread: 0, fund: 0, total: 0 };
  const cumulativeCostPoints = {
    fees: [] as ChartPoint[],
    slippage: [] as ChartPoint[],
    spread: [] as ChartPoint[],
    funding: [] as ChartPoint[],
    total: [] as ChartPoint[],
  };
  trades.forEach((t, i) => {
    cum.fees += t.feeCostUsdt;
    cum.slip += t.slippageCostUsdt;
    cum.spread += t.spreadCostUsdt;
    cum.fund += t.fundingCostUsdt;
    cum.total +=
      t.feeCostUsdt + t.slippageCostUsdt + t.spreadCostUsdt + t.fundingCostUsdt;
    const x = t.exitTime ?? i;
    cumulativeCostPoints.fees.push({ x, y: cum.fees });
    cumulativeCostPoints.slippage.push({ x, y: cum.slip });
    cumulativeCostPoints.spread.push({ x, y: cum.spread });
    cumulativeCostPoints.funding.push({ x, y: cum.fund });
    cumulativeCostPoints.total.push({ x, y: cum.total });
  });

  const rollingWinRatePoints: ChartPoint[] = [];
  const rollingProfitFactorPoints: ChartPoint[] = [];
  for (let i = 0; i < trades.length; i += 1) {
    const slice = trades.slice(Math.max(0, i - ROLLING_WINDOW + 1), i + 1);
    const w = slice.filter((t) => t.pnlPct > 0).length;
    rollingWinRatePoints.push({
      x: i + 1,
      y: slice.length ? (w / slice.length) * 100 : 0,
    });
    const gw = slice
      .filter((t) => t.pnlPct > 0)
      .reduce((s, t) => s + t.pnlPct, 0);
    const gl = Math.abs(
      slice.filter((t) => t.pnlPct < 0).reduce((s, t) => s + t.pnlPct, 0),
    );
    rollingProfitFactorPoints.push({
      x: i + 1,
      y: gl > 0 ? gw / gl : gw > 0 ? 99 : 0,
    });
  }

  const longSeg: TimelineSegment[] = [];
  const shortSeg: TimelineSegment[] = [];
  for (const t of trades) {
    if (t.entryTime == null || t.exitTime == null) continue;
    const seg: TimelineSegment = {
      tradeId: t.id,
      side: t.side,
      entryTime: t.entryTime,
      exitTime: t.exitTime,
      netPnlUsdt: t.netPnlUsdt,
      profitable: t.profitable,
      exitReason: t.exitReason,
    };
    if (t.side === "LONG") longSeg.push(seg);
    else shortSeg.push(seg);
  }
  const allSeg = [...longSeg, ...shortSeg];
  const holds = trades.map((t) => t.holdMs).filter((h) => h > 0);

  const bestMonth =
    monthlyReturns.length === 0
      ? null
      : monthlyReturns.reduce((a, b) =>
          a.returnPctOfInitial >= b.returnPctOfInitial ? a : b,
        );
  const worstMonth =
    monthlyReturns.length === 0
      ? null
      : monthlyReturns.reduce((a, b) =>
          a.returnPctOfInitial <= b.returnPctOfInitial ? a : b,
        );

  const verdict = evaluateStrategyVerdict({
    totalReturn: report.totalReturn,
    mdd: report.mdd,
    winRate: report.winRate,
    tradeCount: report.tradeCount,
    totalCostPctOfInitialCapital: costs.totalCostPctOfInitialCapital,
    profitFactor: report.profitFactor,
  });

  return {
    report,
    trades,
    priceCandles,
    sampledPriceCandles: sampled,
    chartSamplingApplied: applied,
    tradeMarkers: buildMarkers(trades, trades.length > MARKER_DENSITY_THRESHOLD),
    equityPoints,
    drawdownPoints,
    equitySeries: {
      id: "equity",
      name: "자산 (USDT)",
      color: CHART_THEME.equity,
      data: equityPoints,
    },
    drawdownSeries: {
      id: "drawdown",
      name: "낙폭 (%)",
      color: CHART_THEME.drawdown,
      data: drawdownPoints,
    },
    monthlyReturns,
    winLossSummary: {
      wins,
      losses,
      flats,
      winPct: trades.length ? wins / trades.length : 0,
      lossPct: trades.length ? losses / trades.length : 0,
    },
    holdingTimeBuckets: holdingBuckets(trades),
    exitCategoryBuckets: exitCategoryBuckets(trades),
    cumulativeCostPoints,
    rollingWinRatePoints,
    rollingProfitFactorPoints,
    tradeTimelineGroups: { long: longSeg, short: shortSeg },
    timelineSummary: {
      total: trades.length,
      longCount: longSeg.length,
      shortCount: shortSeg.length,
      avgHoldMs: holds.length
        ? holds.reduce((a, b) => a + b, 0) / holds.length
        : 0,
      medianHoldMs: medianMs(holds),
      maxHoldMs: holds.length ? Math.max(...holds) : 0,
      maxConcurrent: maxConcurrent(allSeg),
      tradesPerDay: (() => {
        if (!trades.length) return 0;
        const times = trades
          .map((t) => t.exitTime ?? t.entryTime)
          .filter((t): t is number => t != null);
        if (times.length < 2) return trades.length;
        const spanMs = Math.max(...times) - Math.min(...times);
        const days = Math.max(1, spanMs / 86_400_000);
        return trades.length / days;
      })(),
    },
    costs,
    verdict,
    monthlySummary: {
      profitableMonths: monthlyReturns.filter((m) => m.returnPctOfInitial > 0)
        .length,
      losingMonths: monthlyReturns.filter((m) => m.returnPctOfInitial < 0)
        .length,
      bestMonth,
      worstMonth,
      avgMonthlyReturnPct: monthlyReturns.length
        ? monthlyReturns.reduce((s, m) => s + m.returnPctOfInitial, 0) /
          monthlyReturns.length
        : 0,
      stdMonthlyReturnPct: stdSample(
        monthlyReturns.map((m) => m.returnPctOfInitial),
      ),
      consecutiveLosingMonths: consecutiveLosingMonths(monthlyReturns),
    },
    monthlyCoverage: buildMonthlyCoverage({
      candles: candles.map((c) => ({ openTime: c.openTime })),
      trades: trades.map((t) => ({
        entryTime: t.entryTime,
        exitTime: t.exitTime,
        side: t.side,
        netPnlUsdt: t.netPnlUsdt,
      })),
      startingBalance: report.startingBalance,
      rangeStartMs: candles[0]?.openTime ?? null,
      rangeEndMs: candles[candles.length - 1]?.openTime ?? null,
    }),
    ledgerRange: {
      firstEntryMs: firstTradeEntryMs(trades),
      lastExitMs: lastTradeExitMs(trades),
      firstCandleMs: candles[0]?.openTime ?? null,
      lastCandleMs: candles[candles.length - 1]?.openTime ?? null,
      tradeCount: trades.length,
    },
    intervalMs,
  };
}

export function filterTrades(
  trades: EnrichedTrade[],
  filter:
    | "all"
    | "long"
    | "short"
    | "win"
    | "loss"
    | "stop_loss"
    | "take_profit",
): EnrichedTrade[] {
  switch (filter) {
    case "long":
      return trades.filter((t) => t.side === "LONG");
    case "short":
      return trades.filter((t) => t.side === "SHORT");
    case "win":
      return trades.filter((t) => t.profitable);
    case "loss":
      return trades.filter((t) => t.pnlPct < 0);
    case "stop_loss":
      return trades.filter((t) => t.exitReason === "stop_loss");
    case "take_profit":
      return trades.filter((t) => t.exitReason === "take_profit");
    default:
      return trades;
  }
}
