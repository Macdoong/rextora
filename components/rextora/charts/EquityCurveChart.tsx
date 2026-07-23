"use client";

import { ChartShell, type ChartRenderContext } from "./ChartShell";
import { CHART_THEME } from "@/src/lib/rextora/charts/theme";
import {
  createLinearScale,
  formatAxisNumber,
  niceDomain,
  ticks,
} from "@/src/lib/rextora/charts/scales";
import {
  formatKoreanDateTime,
  formatUsdt,
} from "@/src/lib/rextora/backtest/visualAnalysis";
import type { ChartSeries } from "@/src/lib/rextora/charts/types";

export function EquityCurveChart({
  title = "자산 곡선",
  help,
  series,
  height = 220,
  area = true,
  unit = "usdt",
  onCrosshairX,
  syncCrosshairX,
}: {
  title?: string;
  help?: string;
  series: ChartSeries | ChartSeries[];
  height?: number;
  area?: boolean;
  unit?: "usdt" | "percent" | "raw";
  onCrosshairX?: (xFraction: number | null) => void;
  syncCrosshairX?: number | null;
}) {
  const list = Array.isArray(series) ? series : [series];
  const empty = list.every((s) => s.data.length === 0);
  return (
    <ChartShell
      title={title}
      help={help}
      height={height}
      empty={empty}
      legend={list.map((s) => ({
        label: s.name,
        color: s.color ?? CHART_THEME.equity,
      }))}
      onCrosshairX={onCrosshairX}
      syncCrosshairX={syncCrosshairX}
    >
      {(ctx) => <LinePlot ctx={ctx} series={list} area={area} unit={unit} />}
    </ChartShell>
  );
}

export function DrawdownChart({
  title = "낙폭",
  help,
  series,
  height = 180,
  onCrosshairX,
  syncCrosshairX,
}: {
  title?: string;
  help?: string;
  series: ChartSeries;
  height?: number;
  onCrosshairX?: (xFraction: number | null) => void;
  syncCrosshairX?: number | null;
}) {
  return (
    <EquityCurveChart
      title={title}
      help={help}
      series={series}
      height={height}
      area
      unit="percent"
      onCrosshairX={onCrosshairX}
      syncCrosshairX={syncCrosshairX}
    />
  );
}

export function BalanceCurveChart(props: {
  series: ChartSeries;
  height?: number;
}) {
  return (
    <EquityCurveChart
      title="잔고 곡선"
      series={props.series}
      height={props.height}
      area
    />
  );
}

function formatY(unit: "usdt" | "percent" | "raw", y: number): string {
  if (unit === "usdt") return formatUsdt(y);
  if (unit === "percent") return `${y.toFixed(2)}%`;
  return formatAxisNumber(y);
}

function LinePlot({
  ctx,
  series,
  area,
  unit,
}: {
  ctx: ChartRenderContext;
  series: ChartSeries[];
  area: boolean;
  unit: "usdt" | "percent" | "raw";
}) {
  const { pad, plotW, plotH, zoom, setTooltip, crosshair } = ctx;
  const all = series.flatMap((s) => s.data);
  if (!all.length) return null;
  const xMin = Math.min(...all.map((p) => p.x));
  const xMax = Math.max(...all.map((p) => p.x));
  const xSpan = xMax - xMin || 1;
  const viewStart = xMin + zoom.start * xSpan;
  const viewEnd = xMin + zoom.end * xSpan;

  const visible = series.map((s) => ({
    ...s,
    data: s.data.filter((p) => p.x >= viewStart && p.x <= viewEnd),
  }));
  const ys = visible.flatMap((s) => s.data.map((p) => p.y));
  if (!ys.length) return null;
  const yDom = niceDomain(Math.min(...ys), Math.max(...ys));
  const xScale = createLinearScale(
    [viewStart, viewEnd],
    [pad.left, pad.left + plotW],
  );
  const yScale = createLinearScale(yDom, [pad.top + plotH, pad.top]);

  // Snap tooltip to nearest point via crosshair x
  let snap: { sName: string; p: { x: number; y: number; label?: string } } | null =
    null;
  if (crosshair) {
    const xVal = xScale.invert(crosshair.x);
    for (const s of visible) {
      if (!s.data.length) continue;
      const nearest = s.data.reduce((a, b) =>
        Math.abs(a.x - xVal) < Math.abs(b.x - xVal) ? a : b,
      );
      if (
        !snap ||
        Math.abs(nearest.x - xVal) < Math.abs(snap.p.x - xVal)
      ) {
        snap = { sName: s.name, p: nearest };
      }
    }
  }

  return (
    <g>
      {ticks(yDom, 5).map((t) => (
        <g key={t}>
          <line
            x1={pad.left}
            x2={pad.left + plotW}
            y1={yScale(t)}
            y2={yScale(t)}
            stroke={CHART_THEME.grid}
          />
          <text
            x={pad.left - 6}
            y={yScale(t) + 3}
            textAnchor="end"
            fill={CHART_THEME.axisLabel}
            fontSize={10}
          >
            {unit === "percent" ? `${t.toFixed(1)}%` : formatAxisNumber(t)}
          </text>
        </g>
      ))}
      {visible.map((s) => {
        if (s.data.length === 0) return null;
        const color = s.color ?? CHART_THEME.equity;
        if (s.data.length === 1) {
          const point = s.data[0];
          return (
            <circle
              key={s.id}
              cx={xScale(point.x)}
              cy={yScale(point.y)}
              r={4}
              fill={color}
            />
          );
        }
        const d = s.data
          .map((p, i) => `${i === 0 ? "M" : "L"}${xScale(p.x)},${yScale(p.y)}`)
          .join(" ");
        const areaPath = `${d} L${xScale(s.data[s.data.length - 1].x)},${pad.top + plotH} L${xScale(s.data[0].x)},${pad.top + plotH} Z`;
        return (
          <g key={s.id}>
            {area && <path d={areaPath} fill={color} opacity={0.12} />}
            <path d={d} fill="none" stroke={color} strokeWidth={2} />
          </g>
        );
      })}
      {/* Invisible hit area for reliable tooltip */}
      <rect
        x={pad.left}
        y={pad.top}
        width={plotW}
        height={plotH}
        fill="transparent"
        onMouseMove={() => {
          if (!snap) return;
          setTooltip({
            x: xScale(snap.p.x),
            y: yScale(snap.p.y),
            lines: [
              snap.p.x > 1e11
                ? formatKoreanDateTime(snap.p.x)
                : snap.p.label ?? `구간 ${snap.p.x}`,
              `${snap.sName}: ${formatY(unit, snap.p.y)}`,
            ],
          });
        }}
        onMouseLeave={() => setTooltip(null)}
      />
      {snap && (
        <circle
          cx={xScale(snap.p.x)}
          cy={yScale(snap.p.y)}
          r={4}
          fill={CHART_THEME.accentAlt}
          stroke="#fff"
          strokeWidth={1}
          pointerEvents="none"
        />
      )}
    </g>
  );
}
