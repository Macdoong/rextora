export interface ChartPoint {
  x: number;
  y: number;
  label?: string;
}

export interface ChartSeries {
  id: string;
  name: string;
  color?: string;
  data: ChartPoint[];
}

export interface CandlePoint {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
}

export type TradeMarkerKind =
  | "entry_long"
  | "entry_short"
  | "exit"
  | "stop_loss"
  | "take_profit"
  | "liquidation"
  | "trailing_stop"
  | "partial_exit"
  | "current";

export interface TradeMarker {
  time: number;
  price: number;
  kind: TradeMarkerKind;
  label?: string;
}

export interface LevelLine {
  price: number;
  color: string;
  label: string;
  dashed?: boolean;
  /** When set, draws a diagonal from `price` (left) to `endPrice` (right). */
  endPrice?: number;
}

export interface TimelineEvent {
  time: number;
  label: string;
  tone?: "up" | "down" | "neutral" | "warn";
  value?: number;
}

export interface HeatmapCell {
  row: string;
  col: string;
  value: number;
}

export interface ScatterPoint {
  x: number;
  y: number;
  label: string;
  size?: number;
  color?: string;
}

export interface MeterValue {
  label: string;
  value: number; // 0–100
  tone?: "up" | "down" | "neutral" | "warn";
}

export interface DistributionBin {
  label: string;
  value: number;
  tone?: "up" | "down" | "neutral";
}

export type ChartType =
  | "candlestick"
  | "equity"
  | "balance"
  | "drawdown"
  | "daily_pnl"
  | "monthly_pnl"
  | "trade_timeline"
  | "win_loss"
  | "trade_duration"
  | "rolling_win_rate"
  | "rolling_profit_factor"
  | "fee_history"
  | "funding_history"
  | "position_exposure"
  | "volume"
  | "signal_timeline"
  | "market_structure"
  | "strategy_comparison";
