"use client";

import { ChartShell, type ChartRenderContext } from "./ChartShell";
import { CHART_THEME } from "@/src/lib/rextora/charts/theme";
import {
  createLinearScale,
  formatAxisNumber,
  niceDomain,
  ticks,
} from "@/src/lib/rextora/charts/scales";
import type { ChartSeries } from "@/src/lib/rextora/charts/types";

export function EquityCurveChart({
  title = "자산 곡선",
  series,
  height = 220,
  area = true,
}: {
  title?: string;
  series: ChartSeries | ChartSeries[];
  height?: number;
  area?: boolean;
}) {
  const list = Array.isArray(series) ? series : [series];
  const empty = list.every((s) => s.data.length === 0);
  return (
    <ChartShell
      title={title}
      height={height}
      empty={empty}
      legend={list.map((s) => ({
        label: s.name,
        color: s.color ?? CHART_THEME.equity,
      }))}
    >
      {(ctx) => <LinePlot ctx={ctx} series={list} area={area} />}
    </ChartShell>
  );
}

export function DrawdownChart({
  title = "낙폭",
  series,
  height = 180,
}: {
  title?: string;
  series: ChartSeries;
  height?: number;
}) {
  return (
    <EquityCurveChart title={title} series={series} height={height} area />
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

function LinePlot({
  ctx,
  series,
  area,
}: {
  ctx: ChartRenderContext;
  series: ChartSeries[];
  area: boolean;
}) {
  const { pad, plotW, plotH, zoom, setTooltip } = ctx;
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
            {formatAxisNumber(t)}
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
              onMouseEnter={() =>
                setTooltip({
                  x: xScale(point.x),
                  y: yScale(point.y),
                  lines: [s.name, formatAxisNumber(point.y)],
                })
              }
              onMouseLeave={() => setTooltip(null)}
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
            <path
              d={d}
              fill="none"
              stroke={color}
              strokeWidth={2}
              onMouseMove={(e) => {
                const rect = (
                  e.currentTarget.ownerSVGElement as SVGSVGElement
                ).getBoundingClientRect();
                const x = e.clientX - rect.left;
                const nearest = s.data.reduce((a, b) =>
                  Math.abs(xScale(a.x) - x) < Math.abs(xScale(b.x) - x) ? a : b,
                );
                setTooltip({
                  x,
                  y: yScale(nearest.y),
                  lines: [s.name, formatAxisNumber(nearest.y)],
                });
              }}
              onMouseLeave={() => setTooltip(null)}
            />
          </g>
        );
      })}
    </g>
  );
}
