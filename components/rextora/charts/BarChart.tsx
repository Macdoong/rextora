"use client";

import { ChartShell, type ChartRenderContext } from "./ChartShell";
import { CHART_THEME } from "@/src/lib/rextora/charts/theme";
import {
  createLinearScale,
  formatAxisNumber,
  niceDomain,
  ticks,
} from "@/src/lib/rextora/charts/scales";
import type {
  ChartSeries,
  DistributionBin,
  HeatmapCell,
  ScatterPoint,
  TimelineEvent,
} from "@/src/lib/rextora/charts/types";

export function BarChart({
  title,
  series,
  height = 200,
  diverging = false,
}: {
  title: string;
  series: ChartSeries;
  height?: number;
  diverging?: boolean;
}) {
  return (
    <ChartShell
      title={title}
      height={height}
      empty={series.data.length === 0}
      legend={[
        { label: series.name, color: series.color ?? CHART_THEME.accent },
      ]}
    >
      {(ctx) => <Bars ctx={ctx} series={series} diverging={diverging} />}
    </ChartShell>
  );
}

function Bars({
  ctx,
  series,
  diverging,
}: {
  ctx: ChartRenderContext;
  series: ChartSeries;
  diverging: boolean;
}) {
  const { pad, plotW, plotH, setTooltip } = ctx;
  const data = series.data;
  if (!data.length) return null;
  const ys = data.map((d) => d.y);
  const yDom = diverging
    ? niceDomain(Math.min(0, ...ys), Math.max(0, ...ys))
    : niceDomain(0, Math.max(...ys, 0));
  const xScale = createLinearScale(
    [0, data.length],
    [pad.left, pad.left + plotW],
  );
  const yScale = createLinearScale(yDom, [pad.top + plotH, pad.top]);
  const zero = yScale(0);
  const barW = Math.max(2, (plotW / data.length) * 0.7);
  const color = series.color ?? CHART_THEME.accent;

  return (
    <g>
      {ticks(yDom, 4).map((t) => (
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
      {data.map((d, i) => {
        const x = xScale(i + 0.5);
        const y = yScale(d.y);
        const top = Math.min(y, zero);
        const h = Math.max(1, Math.abs(y - zero));
        const fill =
          d.color ??
          (diverging ? (d.y >= 0 ? CHART_THEME.up : CHART_THEME.down) : color);
        return (
          <rect
            key={i}
            x={x - barW / 2}
            y={top}
            width={barW}
            height={h}
            fill={fill}
            rx={1}
            onMouseEnter={() =>
              setTooltip({
                x,
                y: top,
                lines: d.tooltipLines ?? [
                  d.label ?? String(i),
                  formatAxisNumber(d.y),
                ],
              })
            }
            onMouseLeave={() => setTooltip(null)}
          />
        );
      })}
    </g>
  );
}

export function DistributionChart({
  title,
  bins,
  height = 180,
}: {
  title: string;
  bins: DistributionBin[];
  height?: number;
}) {
  const series: ChartSeries = {
    id: "dist",
    name: title,
    data: bins.map((b, i) => ({ x: i, y: b.value, label: b.label })),
  };
  return <BarChart title={title} series={series} height={height} />;
}

export function TimelineChart({
  title = "타임라인",
  events,
  height = 160,
  showLabels = false,
}: {
  title?: string;
  events: TimelineEvent[];
  height?: number;
  showLabels?: boolean;
}) {
  return (
    <ChartShell
      title={title}
      height={height}
      empty={events.length === 0}
      emptyLabel="표시할 신호가 없습니다"
    >
      {(ctx) => {
        const { pad, plotW, plotH, setTooltip } = ctx;
        if (!events.length) return null;
        const times = events.map((e) => e.time);
        const xDom = niceDomain(Math.min(...times), Math.max(...times), 0.02);
        const xScale = createLinearScale(xDom, [pad.left, pad.left + plotW]);
        const mid = pad.top + plotH / 2;
        return (
          <g>
            <line
              x1={pad.left}
              x2={pad.left + plotW}
              y1={mid}
              y2={mid}
              stroke={CHART_THEME.grid}
            />
            {events.map((e, i) => {
              const x = xScale(e.time);
              const color =
                e.tone === "up"
                  ? CHART_THEME.up
                  : e.tone === "down"
                    ? CHART_THEME.down
                    : e.tone === "warn"
                      ? CHART_THEME.warning
                      : CHART_THEME.accent;
              const shortLabel =
                e.label.length > 18 ? `${e.label.slice(0, 16)}…` : e.label;
              return (
                <g
                  key={i}
                  onMouseEnter={() =>
                    setTooltip({
                      x,
                      y: mid - 20,
                      lines: [
                        e.label,
                        e.value != null ? formatAxisNumber(e.value) : "",
                      ],
                    })
                  }
                  onMouseLeave={() => setTooltip(null)}
                >
                  <circle cx={x} cy={mid} r={5} fill={color} />
                  <line
                    x1={x}
                    x2={x}
                    y1={mid - 14}
                    y2={mid + 14}
                    stroke={color}
                    opacity={0.4}
                  />
                  {showLabels && (
                    <text
                      x={x}
                      y={mid - 18}
                      fill={CHART_THEME.axisLabel}
                      fontSize={9}
                      textAnchor="middle"
                      opacity={0.9}
                    >
                      {shortLabel}
                    </text>
                  )}
                </g>
              );
            })}
          </g>
        );
      }}
    </ChartShell>
  );
}

export function HeatmapChart({
  title = "월별 수익률",
  cells,
  height = 160,
}: {
  title?: string;
  cells: HeatmapCell[];
  height?: number;
}) {
  return (
    <ChartShell
      title={title}
      height={height}
      empty={cells.length === 0}
      interactive={false}
    >
      {(ctx) => {
        const cols = [...new Set(cells.map((c) => c.col))];
        const rows = [...new Set(cells.map((c) => c.row))];
        const { pad, plotW, plotH, setTooltip } = ctx;
        const cellW = plotW / Math.max(1, cols.length);
        const cellH = plotH / Math.max(1, rows.length);
        const maxAbs = Math.max(...cells.map((c) => Math.abs(c.value)), 1);
        return (
          <g>
            {cells.map((c) => {
              const ci = cols.indexOf(c.col);
              const ri = rows.indexOf(c.row);
              const x = pad.left + ci * cellW;
              const y = pad.top + ri * cellH;
              const intensity = Math.abs(c.value) / maxAbs;
              const fill =
                c.value >= 0
                  ? `rgba(52,211,153,${0.15 + intensity * 0.75})`
                  : `rgba(248,113,113,${0.15 + intensity * 0.75})`;
              return (
                <rect
                  key={`${c.row}-${c.col}`}
                  x={x + 1}
                  y={y + 1}
                  width={Math.max(1, cellW - 2)}
                  height={Math.max(1, cellH - 2)}
                  fill={fill}
                  rx={2}
                  onMouseEnter={() =>
                    setTooltip({
                      x: x + cellW / 2,
                      y,
                      lines: [c.col, `${c.value.toFixed(2)}%`],
                    })
                  }
                  onMouseLeave={() => setTooltip(null)}
                />
              );
            })}
            {cols.map((col, i) => (
              <text
                key={col}
                x={pad.left + i * cellW + cellW / 2}
                y={ctx.height - 8}
                textAnchor="middle"
                fill={CHART_THEME.axisLabel}
                fontSize={9}
              >
                {col}
              </text>
            ))}
          </g>
        );
      }}
    </ChartShell>
  );
}

export function ScatterChart({
  title = "위험 대비 수익",
  points,
  height = 240,
  xLabel = "위험 (최대 낙폭 %)",
  yLabel = "수익률 %",
}: {
  title?: string;
  points: ScatterPoint[];
  height?: number;
  xLabel?: string;
  yLabel?: string;
}) {
  return (
    <ChartShell title={title} height={height} empty={points.length === 0}>
      {(ctx) => {
        const { pad, plotW, plotH, setTooltip } = ctx;
        if (!points.length) return null;
        const xDom = niceDomain(
          Math.min(...points.map((p) => p.x)),
          Math.max(...points.map((p) => p.x)),
        );
        const yDom = niceDomain(
          Math.min(...points.map((p) => p.y)),
          Math.max(...points.map((p) => p.y)),
        );
        const xScale = createLinearScale(xDom, [pad.left, pad.left + plotW]);
        const yScale = createLinearScale(yDom, [pad.top + plotH, pad.top]);
        return (
          <g>
            {ticks(yDom, 4).map((t) => (
              <line
                key={t}
                x1={pad.left}
                x2={pad.left + plotW}
                y1={yScale(t)}
                y2={yScale(t)}
                stroke={CHART_THEME.grid}
              />
            ))}
            {points.map((p) => (
              <circle
                key={p.label}
                cx={xScale(p.x)}
                cy={yScale(p.y)}
                r={p.size ?? 8}
                fill={p.color ?? CHART_THEME.accent}
                opacity={0.85}
                onMouseEnter={() =>
                  setTooltip({
                    x: xScale(p.x),
                    y: yScale(p.y),
                    lines: [
                      p.label,
                      `${xLabel}: ${p.x.toFixed(2)}`,
                      `${yLabel}: ${p.y.toFixed(2)}`,
                    ],
                  })
                }
                onMouseLeave={() => setTooltip(null)}
              />
            ))}
            <text
              x={pad.left + plotW / 2}
              y={ctx.height - 4}
              textAnchor="middle"
              fill={CHART_THEME.axisLabel}
              fontSize={10}
            >
              {xLabel}
            </text>
          </g>
        );
      }}
    </ChartShell>
  );
}
