/**
 * Chart data adapters — map existing metrics/backtest/market payloads to chart series.
 * Does not recompute PnL; consumes Unified Metrics / Trade / Risk outputs.
 */
import type {
  UnifiedMetricsSnapshot,
  UnifiedTradeResult,
} from "../metrics/types";
import type { UnifiedRiskView } from "../metrics/types";
import type { BacktestReport } from "../backtest/backtestTypes";
import type { BacktestTrade } from "../backtest/backtestEngine";
import type { OhlcvCandle } from "../data/ohlcvTypes";
import type {
  CandlePoint,
  ChartPoint,
  ChartSeries,
  DistributionBin,
  HeatmapCell,
  LevelLine,
  MeterValue,
  ScatterPoint,
  TimelineEvent,
  TradeMarker,
} from "./types";
import { CHART_THEME } from "./theme";

export function candlesToPoints(candles: OhlcvCandle[]): CandlePoint[] {
  return candles.map((c) => ({
    time: c.openTime,
    open: c.open,
    high: c.high,
    low: c.low,
    close: c.close,
    volume: c.volume,
  }));
}

export function equityCurveToSeries(
  equity: number[],
  name = "자산",
): ChartSeries {
  return {
    id: "equity",
    name,
    color: CHART_THEME.equity,
    data: equity.map((y, i) => ({ x: i, y, label: String(i) })),
  };
}

export function drawdownFromEquity(equity: number[]): ChartSeries {
  let peak = equity[0] ?? 0;
  const data: ChartPoint[] = equity.map((eq, i) => {
    peak = Math.max(peak, eq);
    const dd = peak > 0 ? ((eq - peak) / peak) * 100 : 0;
    return { x: i, y: dd, label: String(i) };
  });
  return { id: "drawdown", name: "낙폭 %", color: CHART_THEME.drawdown, data };
}

export function tradesToMarkers(
  trades: Array<
    Pick<
      BacktestTrade,
      | "side"
      | "entryBar"
      | "exitBar"
      | "entryPrice"
      | "exitPrice"
      | "exitReason"
      | "stopLoss"
      | "takeProfit"
    >
  >,
  candleTimes?: number[],
): TradeMarker[] {
  const markers: TradeMarker[] = [];
  for (const t of trades) {
    const entryTime = candleTimes?.[t.entryBar] ?? t.entryBar;
    const exitTime = candleTimes?.[t.exitBar] ?? t.exitBar;
    markers.push({
      time: entryTime,
      price: t.entryPrice,
      kind: t.side === "LONG" ? "entry_long" : "entry_short",
      label: t.side === "LONG" ? "롱 진입" : "숏 진입",
    });
    if (t.stopLoss > 0) {
      markers.push({
        time: entryTime,
        price: t.stopLoss,
        kind: "stop_loss",
        label: "손절",
      });
    }
    if (t.takeProfit > 0) {
      markers.push({
        time: entryTime,
        price: t.takeProfit,
        kind: "take_profit",
        label: "익절",
      });
    }
    markers.push({
      time: exitTime,
      price: t.exitPrice,
      kind:
        t.exitReason === "stop_loss"
          ? "stop_loss"
          : t.exitReason === "take_profit"
            ? "take_profit"
            : t.exitReason === "trailing_stop"
              ? "trailing_stop"
              : "exit",
      label:
        t.exitReason === "take_profit"
          ? "익절 청산"
          : t.exitReason === "stop_loss"
            ? "손절 청산"
            : t.exitReason === "trailing_stop"
              ? "트레일링 청산"
              : "청산",
    });
  }
  return markers;
}

export function backtestTradeTimeline(
  trades: BacktestTrade[],
): TimelineEvent[] {
  return trades.map((t) => ({
    time: t.exitBar,
    label: `${t.symbol} ${t.side === "LONG" ? "롱" : "숏"}`,
    tone: t.pnlPct >= 0 ? "up" : "down",
    value: t.pnlPct * 100,
  }));
}

export function monthlyHeatmap(report: BacktestReport): HeatmapCell[] {
  return report.monthlyReturns.map((m) => ({
    row: report.symbol,
    col: m.labelKo ?? m.month,
    value: m.returnPct * 100,
  }));
}

export function winLossDistribution(
  trades: Array<{ pnlPct: number }>,
): DistributionBin[] {
  const wins = trades.filter((t) => t.pnlPct > 0).length;
  const losses = trades.filter((t) => t.pnlPct < 0).length;
  const flats = trades.filter((t) => t.pnlPct === 0).length;
  return [
    { label: "이익", value: wins, tone: "up" },
    { label: "손실", value: losses, tone: "down" },
    { label: "보합", value: flats, tone: "neutral" },
  ];
}

export function durationDistribution(
  trades: Array<{ holdBars?: number }>,
): DistributionBin[] {
  const buckets = [
    { label: "1-2", min: 1, max: 2 },
    { label: "3-5", min: 3, max: 5 },
    { label: "6-10", min: 6, max: 10 },
    { label: "11+", min: 11, max: 1e9 },
  ];
  return buckets.map((b) => ({
    label: b.label,
    value: trades.filter((t) => {
      const h = t.holdBars ?? 0;
      return h >= b.min && h <= b.max;
    }).length,
    tone: "neutral" as const,
  }));
}

export function feeHistorySeries(
  trades: Array<{ feePct: number; exitBar: number }>,
): ChartSeries {
  let cum = 0;
  return {
    id: "fees",
    name: "수수료 %",
    color: CHART_THEME.fee,
    data: trades.map((t) => {
      cum += t.feePct * 100;
      return { x: t.exitBar, y: cum };
    }),
  };
}

export function rollingWinRate(
  trades: Array<{ pnlPct: number }>,
  window = 10,
): ChartSeries {
  const data: ChartPoint[] = [];
  for (let i = 0; i < trades.length; i += 1) {
    const slice = trades.slice(Math.max(0, i - window + 1), i + 1);
    const wins = slice.filter((t) => t.pnlPct > 0).length;
    data.push({ x: i, y: slice.length ? (wins / slice.length) * 100 : 0 });
  }
  return { id: "rolling_wr", name: "이동 승률 %", color: CHART_THEME.up, data };
}

export function rollingProfitFactor(
  trades: Array<{ pnlPct: number }>,
  window = 10,
): ChartSeries {
  const data: ChartPoint[] = [];
  for (let i = 0; i < trades.length; i += 1) {
    const slice = trades.slice(Math.max(0, i - window + 1), i + 1);
    const grossWin = slice
      .filter((t) => t.pnlPct > 0)
      .reduce((s, t) => s + t.pnlPct, 0);
    const grossLoss = Math.abs(
      slice.filter((t) => t.pnlPct < 0).reduce((s, t) => s + t.pnlPct, 0),
    );
    data.push({
      x: i,
      y: grossLoss > 0 ? grossWin / grossLoss : grossWin > 0 ? 5 : 0,
    });
  }
  return {
    id: "rolling_pf",
    name: "이동 손익비",
    color: CHART_THEME.accent,
    data,
  };
}

export function metricsToEquitySpark(
  metrics: UnifiedMetricsSnapshot,
): ChartSeries {
  // Build from recent trades cumulative realized — no new calc beyond summing stored values
  let cum = metrics.accountEquity - metrics.todayRealizedPnlUsdt;
  const data: ChartPoint[] = [{ x: 0, y: cum }];
  metrics.recentTrades
    .slice()
    .reverse()
    .forEach((t, i) => {
      cum += t.realizedUsdt;
      data.push({ x: i + 1, y: cum });
    });
  if (data.length === 1) data.push({ x: 1, y: metrics.accountEquity });
  return { id: "equity", name: "자산", color: CHART_THEME.equity, data };
}

export function metricsDailyPnl(metrics: UnifiedMetricsSnapshot): ChartSeries {
  const byDay = new Map<string, number>();
  for (const t of metrics.recentTrades) {
    const day = new Date(t.timestamp).toLocaleDateString("ko-KR");
    byDay.set(day, (byDay.get(day) ?? 0) + t.realizedUsdt);
  }
  const entries = [...byDay.entries()];
  return {
    id: "daily_pnl",
    name: "일별 손익",
    color: CHART_THEME.accent,
    data: entries.map(([label, y], i) => ({ x: i, y, label })),
  };
}

export function metricsFeeFunding(metrics: UnifiedMetricsSnapshot): {
  fees: ChartSeries;
  funding: ChartSeries;
} {
  let feeCum = 0;
  let fundCum = 0;
  const fees: ChartPoint[] = [];
  const funding: ChartPoint[] = [];
  metrics.recentTrades
    .slice()
    .reverse()
    .forEach((t, i) => {
      feeCum += t.fee;
      fundCum += t.funding;
      fees.push({ x: i, y: feeCum });
      funding.push({ x: i, y: fundCum });
    });
  return {
    fees: { id: "fees", name: "수수료", color: CHART_THEME.fee, data: fees },
    funding: {
      id: "funding",
      name: "펀딩비",
      color: CHART_THEME.funding,
      data: funding,
    },
  };
}

export function unifiedTradesToTimeline(
  trades: UnifiedTradeResult[],
): TimelineEvent[] {
  return trades.map((t) => ({
    time: Date.parse(t.timestamp),
    label: `${t.symbol} ${t.side === "LONG" ? "롱" : "숏"}`,
    tone: t.netPnl >= 0 ? "up" : "down",
    value: t.netPct,
  }));
}

export function positionLevels(input: {
  entry: number;
  current: number;
  stopLoss?: number;
  takeProfit?: number;
  liquidation?: number;
  trailing?: number;
  side: "LONG" | "SHORT";
}): { markers: TradeMarker[]; levels: LevelLine[] } {
  const now = Date.now();
  const markers: TradeMarker[] = [
    {
      time: now - 1,
      price: input.entry,
      kind: input.side === "LONG" ? "entry_long" : "entry_short",
      label: "진입",
    },
    { time: now, price: input.current, kind: "current", label: "현재가" },
  ];
  const levels: LevelLine[] = [
    { price: input.entry, color: CHART_THEME.position, label: "진입" },
    {
      price: input.current,
      color: CHART_THEME.accentAlt,
      label: "현재가",
      dashed: true,
    },
  ];
  if (input.stopLoss && input.stopLoss > 0) {
    levels.push({
      price: input.stopLoss,
      color: CHART_THEME.stopLoss,
      label: "손절",
    });
  }
  if (input.takeProfit && input.takeProfit > 0) {
    levels.push({
      price: input.takeProfit,
      color: CHART_THEME.takeProfit,
      label: "익절",
    });
  }
  if (input.liquidation && input.liquidation > 0) {
    levels.push({
      price: input.liquidation,
      color: CHART_THEME.liquidation,
      label: "청산가",
      dashed: true,
    });
  }
  if (input.trailing && input.trailing > 0) {
    levels.push({
      price: input.trailing,
      color: CHART_THEME.trailing,
      label: "트레일링",
      dashed: true,
    });
  }
  return { markers, levels };
}

export function marketStructureLevels(candles: CandlePoint[]): LevelLine[] {
  if (candles.length < 20) return [];
  const slice = candles.slice(-60);
  const highs = slice.map((c) => c.high);
  const lows = slice.map((c) => c.low);
  const resistance = Math.max(...highs);
  const support = Math.min(...lows);
  const levels: LevelLine[] = [
    {
      price: resistance,
      color: CHART_THEME.resistance,
      label: "저항",
      dashed: true,
    },
    { price: support, color: CHART_THEME.support, label: "지지", dashed: true },
  ];

  // Trend line from first to last close in window (price structure only — not a trade signal)
  const first = slice[0].close;
  const last = slice[slice.length - 1].close;
  levels.push({
    price: first,
    endPrice: last,
    color: CHART_THEME.accentAlt,
    label: "추세선",
    dashed: true,
  });

  // Fair Value Gap: 3-candle imbalance (structure from OHLC, no invented fills)
  for (let i = slice.length - 4; i >= 2; i -= 1) {
    const a = slice[i - 2];
    const c = slice[i];
    if (a.high < c.low) {
      const mid = (a.high + c.low) / 2;
      levels.push({
        price: mid,
        color: CHART_THEME.up,
        label: "FVG↑",
        dashed: true,
      });
      break;
    }
    if (a.low > c.high) {
      const mid = (a.low + c.high) / 2;
      levels.push({
        price: mid,
        color: CHART_THEME.down,
        label: "FVG↓",
        dashed: true,
      });
      break;
    }
  }

  // Order block: last opposite candle before a strong impulse near the end of the window
  for (let i = slice.length - 3; i >= 5; i -= 1) {
    const c = slice[i];
    const next = slice[i + 1];
    const body = Math.abs(c.close - c.open);
    const impulse = Math.abs(next.close - next.open);
    if (impulse > body * 1.5 && next.close > next.open && c.close < c.open) {
      levels.push({
        price: c.high,
        color: CHART_THEME.entryLong,
        label: "OB↑",
        dashed: true,
      });
      levels.push({
        price: c.low,
        color: CHART_THEME.entryLong,
        label: "OB↑L",
        dashed: true,
      });
      break;
    }
    if (impulse > body * 1.5 && next.close < next.open && c.close > c.open) {
      levels.push({
        price: c.high,
        color: CHART_THEME.entryShort,
        label: "OB↓H",
        dashed: true,
      });
      levels.push({
        price: c.low,
        color: CHART_THEME.entryShort,
        label: "OB↓",
        dashed: true,
      });
      break;
    }
  }

  return levels;
}

export function signalTimeline(
  candidates: Array<{
    symbol: string;
    side?: string;
    signal?: string;
    judgment?: string;
    signalScore?: number;
    reason?: string;
  }>,
): TimelineEvent[] {
  return candidates.map((c, i) => {
    const direction = c.side ? uiLabel(String(c.side)) : "";
    const judgment = c.judgment ? uiLabel(String(c.judgment)) : "";
    const signal = c.signal ? uiLabel(String(c.signal)) : "";
    const reason = c.reason ? uiLabel(String(c.reason)) : "";
    const parts = [c.symbol, direction, signal, judgment].filter(Boolean);
    const scorePart =
      c.signalScore != null ? `점수 ${c.signalScore.toFixed(0)}` : "";
    return {
      time: Date.now() - (candidates.length - i) * 60_000,
      label: [parts.join(" · "), scorePart, reason].filter(Boolean).join(" · "),
      tone:
        c.judgment === "진입 가능"
          ? "up"
          : c.judgment === "제외" || c.judgment === "보류"
            ? "down"
            : "neutral",
      value: c.signalScore,
    };
  });
}

export function tradeReplayOverlay(trade: {
  entryPrice: number;
  exitPrice?: number | null;
  stopLoss?: number;
  takeProfit?: number;
  side: "LONG" | "SHORT";
  netPct?: number | null;
}): { markers: TradeMarker[]; levels: LevelLine[] } {
  const base = positionLevels({
    entry: trade.entryPrice,
    current: trade.exitPrice ?? trade.entryPrice,
    stopLoss: trade.stopLoss,
    takeProfit: trade.takeProfit,
    side: trade.side,
  });
  if (trade.exitPrice != null) {
    base.markers.push({
      time: Date.now(),
      price: trade.exitPrice,
      kind: "exit",
      label: trade.netPct != null ? `청산 ${trade.netPct}%` : "청산",
    });
  }
  return base;
}

import { uiLabel } from "../displayLabels";

export function coinMeters(coin: {
  change24hPct: number;
  volumeChangePct: number;
  volatility: number;
  aiScore: number;
  quoteVolume: number;
}): MeterValue[] {
  const clamp01 = (v: number) => Math.max(0, Math.min(100, v));
  return [
    {
      label: uiLabel("Trend"),
      value: clamp01(50 + coin.change24hPct * 5),
      tone: coin.change24hPct >= 0 ? "up" : "down",
    },
    {
      label: uiLabel("Momentum"),
      value: clamp01(50 + coin.change24hPct * 4),
      tone: coin.change24hPct >= 0 ? "up" : "down",
    },
    {
      label: uiLabel("Volume"),
      value: clamp01(Math.log10(Math.max(1, coin.quoteVolume)) * 12),
      tone: "neutral",
    },
    {
      label: uiLabel("Volatility"),
      value: clamp01(coin.volatility * 12),
      tone: coin.volatility > 5 ? "warn" : "neutral",
    },
    {
      label: uiLabel("Signal"),
      value: clamp01(coin.aiScore),
      tone: coin.aiScore >= 70 ? "up" : "neutral",
    },
    {
      label: uiLabel("Score"),
      value: clamp01((coin.aiScore + clamp01(50 + coin.change24hPct * 5)) / 2),
      tone: coin.aiScore >= 70 ? "up" : "neutral",
    },
  ];
}

export function strategyScatter(
  rows: Array<{
    name: string;
    totalReturn: number;
    mdd: number;
    trades?: number;
  }>,
): ScatterPoint[] {
  return rows.map((r) => ({
    x: Math.abs(r.mdd) * 100,
    y: r.totalReturn * 100,
    label: r.name,
    size: Math.max(6, Math.min(18, (r.trades ?? 10) / 5)),
  }));
}

export function riskExposureSeries(risk: UnifiedRiskView): ChartSeries {
  return {
    id: "exposure",
    name: "포지션 사용 현황",
    color: CHART_THEME.live,
    data: [
      { x: 0, y: risk.openPositions, label: "사용 중" },
      { x: 1, y: risk.maxPositions, label: "최대" },
    ],
  };
}

export function positionExposureSeries(
  positions: UnifiedMetricsSnapshot["positions"],
  accountEquity: number,
): ChartSeries {
  return {
    id: "position-exposure",
    name: "코인별 노출 비율",
    color: CHART_THEME.position,
    data: positions
      .filter((position) => position.side !== "FLAT" && position.quantity > 0)
      .map((position, index) => {
        const notional = Math.abs(position.currentPrice * position.quantity);
        const margin = position.leverage > 0 ? notional / position.leverage : 0;
        const exposurePct =
          accountEquity > 0 ? (notional / accountEquity) * 100 : 0;
        const marginPct =
          accountEquity > 0 ? (margin / accountEquity) * 100 : 0;
        return {
          x: index,
          y: Number(exposurePct.toFixed(2)),
          label: position.symbol,
          color:
            position.side === "LONG"
              ? CHART_THEME.entryLong
              : CHART_THEME.entryShort,
          tooltipLines: [
            `${position.symbol} · ${position.side === "LONG" ? "롱" : "숏"}`,
            `노출 ${exposurePct.toFixed(2)}%`,
            `증거금 ${marginPct.toFixed(2)}%`,
            `포지션 ${notional.toFixed(2)} USDT`,
          ],
        };
      }),
  };
}

export function volumeSeries(candles: CandlePoint[]): ChartSeries {
  return {
    id: "volume",
    name: "거래량",
    color: CHART_THEME.volume,
    data: candles.map((c, i) => ({
      x: i,
      y: c.volume ?? 0,
      label: String(c.time),
    })),
  };
}
