/** Shared dark theme for every Rextora chart. */

export const CHART_THEME = {
  background: "transparent",
  surface: "#0f172a",
  grid: "#1e293b",
  axis: "#64748b",
  axisLabel: "#94a3b8",
  crosshair: "#94a3b8",
  tooltipBg: "#020617",
  tooltipBorder: "#334155",
  tooltipText: "#e2e8f0",
  legendText: "#cbd5e1",
  up: "#34d399",
  down: "#f87171",
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
  entryLong: "#34d399",
  entryShort: "#f87171",
  exit: "#e2e8f0",
  stopLoss: "#ef4444",
  takeProfit: "#34d399",
  liquidation: "#fb923c",
  trailing: "#c084fc",
  position: "#38bdf8",
  support: "#22d3ee",
  resistance: "#fb7185",
  fontFamily: "ui-sans-serif, system-ui, sans-serif",
  fontSize: 11
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
