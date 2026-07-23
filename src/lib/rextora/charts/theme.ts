/** Shared dark theme for every Rextora chart. */

export const CHART_THEME = {
  background: "transparent",
  surface: "#0f172a",
  grid: "#1e293b",
  axis: "#7dd3fc",
  axisLabel: "#d4deeb",
  crosshair: "#e2e8f0",
  tooltipBg: "#0b1220",
  tooltipBorder: "#475569",
  tooltipText: "#f1f5fb",
  legendText: "#e8eef7",
  /** Bull / bear — ~12% softer than saturated green-700/red-700; still terminal, not pastel */
  up: "#1f914f",
  down: "#c43c3c",
  accent: "#a78bfa",
  accentAlt: "#38bdf8",
  warning: "#fbbf24",
  danger: "#ef4444",
  live: "#f97316",
  paper: "#34d399",
  equity: "#38bdf8",
  drawdown: "#f87171",
  volume: "#64748b",
  fee: "#a78bfa",
  funding: "#fbbf24",
  entryLong: "#1f914f",
  entryShort: "#c43c3c",
  exit: "#e2e8f0",
  exitWin: "#34d399",
  exitLoss: "#f87171",
  /** SL — orange/red for contrast on dark charts */
  stopLoss: "#f97316",
  /** TP — bright green */
  takeProfit: "#34d399",
  liquidation: "#fb923c",
  trailing: "#c084fc",
  maxHold: "#fbbf24",
  position: "#38bdf8",
  support: "#22d3ee",
  resistance: "#fb7185",
  fontFamily: "ui-sans-serif, system-ui, sans-serif",
  fontSize: 12
} as const;

export type ChartTheme = typeof CHART_THEME;

export const SERIES_PALETTE = [
  CHART_THEME.equity,
  CHART_THEME.accent,
  CHART_THEME.up,
  CHART_THEME.warning,
  CHART_THEME.live,
  CHART_THEME.accentAlt
] as const;
