"use client";

import { useMemo, useState } from "react";
import { CHART_THEME } from "@/src/lib/rextora/charts/theme";
import {
  computeScatterDomain,
  projectScatterPoint,
  toScatterPoint,
  type ScatterMetricPoint,
} from "@/src/lib/rextora/backtest/scatterDomain";
import { formatPct, formatUsdt } from "@/src/lib/rextora/backtest/visualAnalysis";

export interface ScatterRowInput {
  symbol: string;
  mdd: number | null;
  totalReturn: number | null;
  tradeCount: number | null;
  winRate: number | null;
  profitFactor: number | null;
  totalCost: number | null;
}

export function ReturnDrawdownScatter({
  rows,
  selectedSymbol,
  onSelectSymbol,
}: {
  rows: ScatterRowInput[];
  selectedSymbol: string;
  onSelectSymbol: (symbol: string) => void;
}) {
  const [hover, setHover] = useState<string | null>(null);

  const points = useMemo(() => {
    const out: ScatterMetricPoint[] = [];
    for (const r of rows) {
      const p = toScatterPoint(r);
      if (p) out.push(p);
    }
    return out;
  }, [rows]);

  const domain = useMemo(() => computeScatterDomain(points), [points]);

  const plot = useMemo(
    () => ({ left: 56, top: 24, width: 420, height: 280 }),
    [],
  );
  const svgW = 520;
  const svgH = 360;

  const projections = useMemo(() => {
    return points.map((p) => {
      const proj = projectScatterPoint(p, domain, plot);
      return { p, proj };
    });
  }, [points, domain, plot]);

  // Collision-aware: show label only for selected/hovered, or if few points
  const showAllLabels = points.length <= 4;

  const xZero =
    domain.minY < 0 && domain.maxY > 0
      ? plot.top +
        plot.height -
        ((0 - domain.minY) / (domain.maxY - domain.minY)) * plot.height
      : null;

  const tip = points.find((p) => p.symbol === (hover ?? selectedSymbol));

  return (
    <div
      className="relative w-full"
      data-testid="return-drawdown-scatter"
      data-point-count={points.length}
      data-domain-min-x={domain.minX.toFixed(4)}
      data-domain-max-x={domain.maxX.toFixed(4)}
      data-domain-min-y={domain.minY.toFixed(4)}
      data-domain-max-y={domain.maxY.toFixed(4)}
    >
      <p className="rx-text-muted mb-2 text-xs">
        X축은 최대낙폭의 절댓값(|MDD|)입니다. 오른쪽으로 갈수록 낙폭이 큽니다.
      </p>
      <svg
        viewBox={`0 0 ${svgW} ${svgH}`}
        className="h-[360px] w-full max-w-full"
        role="img"
        aria-label="수익률 대 낙폭 산점도"
      >
        {/* Plot frame */}
        <rect
          x={plot.left}
          y={plot.top}
          width={plot.width}
          height={plot.height}
          fill="rgba(15,23,42,0.35)"
          stroke="#334155"
        />
        {/* Grid */}
        {[0.25, 0.5, 0.75].map((f) => (
          <g key={f}>
            <line
              x1={plot.left}
              x2={plot.left + plot.width}
              y1={plot.top + plot.height * f}
              y2={plot.top + plot.height * f}
              stroke="#1e293b"
            />
            <line
              x1={plot.left + plot.width * f}
              x2={plot.left + plot.width * f}
              y1={plot.top}
              y2={plot.top + plot.height}
              stroke="#1e293b"
            />
          </g>
        ))}
        {xZero != null && (
          <line
            x1={plot.left}
            x2={plot.left + plot.width}
            y1={xZero}
            y2={xZero}
            stroke="#64748b"
            strokeDasharray="4 3"
            data-testid="scatter-zero-return"
          />
        )}
        <text
          x={plot.left + plot.width / 2}
          y={svgH - 12}
          fill={CHART_THEME.axisLabel}
          fontSize={12}
          textAnchor="middle"
          data-testid="scatter-x-label"
        >
          {domain.xLabelKo}
        </text>
        <text
          x={16}
          y={plot.top + plot.height / 2}
          fill={CHART_THEME.axisLabel}
          fontSize={12}
          textAnchor="middle"
          transform={`rotate(-90 16 ${plot.top + plot.height / 2})`}
          data-testid="scatter-y-label"
        >
          {domain.yLabelKo}
        </text>
        {/* Axis ticks */}
        <text
          x={plot.left}
          y={plot.top + plot.height + 16}
          fill={CHART_THEME.axisLabel}
          fontSize={10}
        >
          {domain.minX.toFixed(1)}
        </text>
        <text
          x={plot.left + plot.width}
          y={plot.top + plot.height + 16}
          fill={CHART_THEME.axisLabel}
          fontSize={10}
          textAnchor="end"
        >
          {domain.maxX.toFixed(1)}
        </text>
        <text
          x={plot.left - 6}
          y={plot.top + 4}
          fill={CHART_THEME.axisLabel}
          fontSize={10}
          textAnchor="end"
        >
          {domain.maxY.toFixed(1)}
        </text>
        <text
          x={plot.left - 6}
          y={plot.top + plot.height}
          fill={CHART_THEME.axisLabel}
          fontSize={10}
          textAnchor="end"
        >
          {domain.minY.toFixed(1)}
        </text>

        {projections.map(({ p, proj }) => {
          if (!proj) return null;
          const active = p.symbol === selectedSymbol;
          const hovered = p.symbol === hover;
          const showLabel = showAllLabels || active || hovered;
          return (
            <g
              key={p.symbol}
              className="cursor-pointer"
              data-testid={`scatter-point-${p.symbol}`}
              data-x={p.drawdownPct}
              data-y={p.returnPct}
              onClick={() => onSelectSymbol(p.symbol)}
              onMouseEnter={() => setHover(p.symbol)}
              onMouseLeave={() => setHover(null)}
            >
              <circle
                cx={proj.cx}
                cy={proj.cy}
                r={16}
                fill="transparent"
                data-testid="scatter-hit-target"
              />
              <circle
                cx={proj.cx}
                cy={proj.cy}
                r={active || hovered ? 8 : 6}
                fill={p.returnPct >= 0 ? CHART_THEME.up : CHART_THEME.down}
                stroke={active ? "#fff" : hovered ? "#e2e8f0" : "#0f172a"}
                strokeWidth={active ? 2.5 : 1.5}
              />
              {showLabel && (
                <text
                  x={proj.cx + 10}
                  y={proj.cy - 8}
                  fill={CHART_THEME.legendText}
                  fontSize={11}
                  fontWeight={600}
                >
                  {p.symbol.replace("USDT", "")}
                </text>
              )}
            </g>
          );
        })}
      </svg>

      {tip && (
        <div
          className="mt-2 rounded-lg border border-slate-600 bg-slate-950/90 px-3 py-2 text-xs leading-relaxed rx-text-secondary"
          data-testid="scatter-tooltip"
        >
          <div className="rx-text-primary font-semibold">{tip.symbol}</div>
          <div>순수익률 {formatPct(tip.returnPct / 100)}</div>
          <div>최대낙폭 크기 {tip.drawdownPct.toFixed(2)}%</div>
          {tip.tradeCount != null && <div>거래 {tip.tradeCount}</div>}
          {tip.winRate != null && (
            <div>승률 {formatPct(tip.winRate, 1)}</div>
          )}
          {tip.profitFactor != null && (
            <div>손익비 {tip.profitFactor.toFixed(2)}</div>
          )}
          {tip.totalCost != null && (
            <div>총비용 {formatUsdt(tip.totalCost)}</div>
          )}
        </div>
      )}
    </div>
  );
}
