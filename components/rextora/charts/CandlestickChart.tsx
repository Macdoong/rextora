"use client";

import { ChartShell, type ChartRenderContext } from "./ChartShell";
import { CHART_THEME } from "@/src/lib/rextora/charts/theme";
import { createLinearScale, formatAxisNumber, formatTimeLabel, niceDomain, ticks } from "@/src/lib/rextora/charts/scales";
import type { CandlePoint, LevelLine, TradeMarker } from "@/src/lib/rextora/charts/types";

function markerColor(kind: TradeMarker["kind"]): string {
  switch (kind) {
    case "entry_long":
      return CHART_THEME.entryLong;
    case "entry_short":
      return CHART_THEME.entryShort;
    case "stop_loss":
      return CHART_THEME.stopLoss;
    case "take_profit":
      return CHART_THEME.takeProfit;
    case "liquidation":
      return CHART_THEME.liquidation;
    case "trailing_stop":
      return CHART_THEME.trailing;
    case "partial_exit":
      return CHART_THEME.warning;
    case "current":
      return CHART_THEME.accentAlt;
    default:
      return CHART_THEME.exit;
  }
}

export function CandlestickChart({
  title = "Candlestick",
  candles,
  markers = [],
  levels = [],
  height = 320,
  showVolume = true
}: {
  title?: string;
  candles: CandlePoint[];
  markers?: TradeMarker[];
  levels?: LevelLine[];
  height?: number;
  showVolume?: boolean;
}) {
  const empty = candles.length === 0;

  return (
    <ChartShell
      title={title}
      height={height}
      empty={empty}
      legend={[
        { label: "Up", color: CHART_THEME.up },
        { label: "Down", color: CHART_THEME.down }
      ]}
    >
      {(ctx) => <CandlePlot ctx={ctx} candles={candles} markers={markers} levels={levels} showVolume={showVolume} />}
    </ChartShell>
  );
}

function CandlePlot({
  ctx,
  candles,
  markers,
  levels,
  showVolume
}: {
  ctx: ChartRenderContext;
  candles: CandlePoint[];
  markers: TradeMarker[];
  levels: LevelLine[];
  showVolume: boolean;
}) {
  const { pad, plotW, plotH, zoom, setTooltip } = ctx;
  const start = Math.floor(zoom.start * candles.length);
  const end = Math.max(start + 1, Math.ceil(zoom.end * candles.length));
  const view = candles.slice(start, end);
  if (!view.length) return null;

  const lows = view.map((c) => c.low);
  const highs = view.map((c) => c.high);
  const yDom = niceDomain(Math.min(...lows), Math.max(...highs));
  const volH = showVolume ? plotH * 0.18 : 0;
  const candleH = plotH - volH - 4;
  const xScale = createLinearScale([0, view.length - 1 || 1], [pad.left, pad.left + plotW]);
  const yScale = createLinearScale(yDom, [pad.top + candleH, pad.top]);
  const maxVol = Math.max(...view.map((c) => c.volume ?? 0), 1);
  const candleW = Math.max(2, (plotW / view.length) * 0.7);

  const yTicks = ticks(yDom, 5);

  return (
    <g>
      {yTicks.map((t) => (
        <g key={t}>
          <line x1={pad.left} x2={pad.left + plotW} y1={yScale(t)} y2={yScale(t)} stroke={CHART_THEME.grid} strokeWidth={1} />
          <text x={pad.left - 6} y={yScale(t) + 3} textAnchor="end" fill={CHART_THEME.axisLabel} fontSize={10}>
            {formatAxisNumber(t)}
          </text>
        </g>
      ))}

      {levels.map((lv) => (
        <g key={lv.label + lv.price + (lv.endPrice ?? "")}>
          <line
            x1={pad.left}
            x2={pad.left + plotW}
            y1={yScale(lv.price)}
            y2={yScale(lv.endPrice ?? lv.price)}
            stroke={lv.color}
            strokeWidth={1}
            strokeDasharray={lv.dashed ? "4 3" : undefined}
            opacity={0.85}
          />
          <text x={pad.left + plotW - 4} y={yScale(lv.endPrice ?? lv.price) - 3} textAnchor="end" fill={lv.color} fontSize={9}>
            {lv.label}
          </text>
        </g>
      ))}

      {view.map((c, i) => {
        const x = xScale(i);
        const up = c.close >= c.open;
        const color = up ? CHART_THEME.up : CHART_THEME.down;
        const yHigh = yScale(c.high);
        const yLow = yScale(c.low);
        const yOpen = yScale(c.open);
        const yClose = yScale(c.close);
        const bodyTop = Math.min(yOpen, yClose);
        const bodyH = Math.max(1, Math.abs(yClose - yOpen));
        return (
          <g
            key={c.time}
            onMouseEnter={() =>
              setTooltip({
                x,
                y: bodyTop,
                lines: [
                  formatTimeLabel(c.time),
                  `O ${c.open.toFixed(4)}`,
                  `H ${c.high.toFixed(4)}`,
                  `L ${c.low.toFixed(4)}`,
                  `C ${c.close.toFixed(4)}`
                ]
              })
            }
            onMouseLeave={() => setTooltip(null)}
          >
            <line x1={x} x2={x} y1={yHigh} y2={yLow} stroke={color} strokeWidth={1} />
            <rect x={x - candleW / 2} y={bodyTop} width={candleW} height={bodyH} fill={color} rx={1} />
            {showVolume && (
              <rect
                x={x - candleW / 2}
                y={pad.top + candleH + 4 + volH * (1 - (c.volume ?? 0) / maxVol)}
                width={candleW}
                height={Math.max(1, (volH * (c.volume ?? 0)) / maxVol)}
                fill={CHART_THEME.volume}
                opacity={0.55}
              />
            )}
          </g>
        );
      })}

      {markers.map((m, idx) => {
        const i = view.findIndex((c) => c.time >= m.time);
        const xi = i >= 0 ? i : view.length - 1;
        if (m.time < view[0].time || m.time > view[view.length - 1].time) {
          // allow bar-index based markers
          if (m.time < start || m.time >= end) return null;
        }
        const useBarIndex = m.time < 1e10;
        const x = useBarIndex ? xScale(Math.max(0, Math.min(view.length - 1, m.time - start))) : xScale(Math.max(0, xi));
        const y = yScale(m.price);
        const color = markerColor(m.kind);
        return (
          <g key={`${m.kind}-${idx}-${m.time}`}>
            <circle cx={x} cy={y} r={4} fill={color} stroke="#0f172a" strokeWidth={1} />
            {m.label && (
              <text x={x + 6} y={y - 4} fill={color} fontSize={9}>
                {m.label}
              </text>
            )}
          </g>
        );
      })}

      <text x={pad.left} y={ctx.height - 8} fill={CHART_THEME.axisLabel} fontSize={10}>
        {formatTimeLabel(view[0].time)}
      </text>
      <text x={pad.left + plotW} y={ctx.height - 8} textAnchor="end" fill={CHART_THEME.axisLabel} fontSize={10}>
        {formatTimeLabel(view[view.length - 1].time)}
      </text>
    </g>
  );
}
