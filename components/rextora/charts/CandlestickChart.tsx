"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ChartShell,
  type ChartRenderContext,
  type ChartTooltipPayload,
  type ChartTooltipRow,
} from "./ChartShell";
import { CHART_THEME } from "@/src/lib/rextora/charts/theme";
import {
  createLinearScale,
  formatAxisNumber,
  niceDomain,
  ticks,
} from "@/src/lib/rextora/charts/scales";
import {
  formatDurationMs,
  formatKoreanDateTime,
  formatPct,
  formatUsdt,
} from "@/src/lib/rextora/backtest/visualAnalysis";
import {
  BODY_FILL_RATIO,
  BODY_STROKE_PX,
  MARKER_BASE_RADIUS,
  MARKER_OFFSET_PX,
  MARKER_OPACITY,
  MARKER_SELECTED_RADIUS,
  MIN_CANDLE_BODY_HEIGHT_PX,
  MIN_CANDLE_BODY_PX,
  PRICE_DOMAIN_PAD,
  VOLUME_FRACTION,
  computeCandleGeometry,
  snapPx,
} from "@/src/lib/rextora/backtest/candleSpacing";
import type {
  CandlePoint,
  LevelLine,
  TradeMarker,
} from "@/src/lib/rextora/charts/types";

type MarkerGroup = "entry" | "take_profit" | "stop_loss" | "max_hold" | "other";

function markerGroup(kind: TradeMarker["kind"], meta?: Record<string, unknown>): MarkerGroup {
  if (kind === "entry_long" || kind === "entry_short") return "entry";
  if (kind === "take_profit") return "take_profit";
  if (kind === "stop_loss") return "stop_loss";
  if (kind === "partial_exit" || meta?.exitReason === "max_hold") return "max_hold";
  return "other";
}

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
      return CHART_THEME.maxHold;
    case "current":
      return CHART_THEME.accentAlt;
    default:
      return CHART_THEME.exit;
  }
}

type Shape =
  | "triangle-up"
  | "triangle-down"
  | "diamond"
  | "square"
  | "hex"
  | "circle"
  | "check";

/** Entry ▲ · Exit ▼ · Stop ■ · Take Profit ● */
function markerShape(kind: TradeMarker["kind"], meta?: Record<string, unknown>): Shape {
  if (kind === "entry_long") return "triangle-up";
  if (kind === "entry_short") return "triangle-up";
  if (kind === "stop_loss") return "square";
  if (kind === "take_profit") return "circle";
  if (kind === "trailing_stop") return "hex";
  if (kind === "partial_exit" || meta?.exitReason === "max_hold") return "circle";
  if (kind === "exit") return "triangle-down";
  if (meta?.pnlPct != null && Number(meta.pnlPct) >= 0) return "triangle-down";
  return "triangle-down";
}

const GROUP_LABELS: Array<{ id: MarkerGroup; label: string }> = [
  { id: "entry", label: "진입" },
  { id: "take_profit", label: "익절" },
  { id: "stop_loss", label: "손절" },
  { id: "max_hold", label: "시간 청산" },
  { id: "other", label: "기타 청산" },
];

/** Compact pad — candles fill most of the vertical chart area. */
const CANDLE_PAD = { top: 4, right: 8, bottom: 16, left: 52 };

export function CandlestickChart({
  title = "가격 차트",
  help,
  candles,
  markers = [],
  levels = [],
  height = 600,
  showVolume = true,
  selectedTradeId,
  onSelectTrade,
  showMarkerLabels = false,
  symbolLabel,
  timeframeLabel,
  strategyName,
}: {
  title?: string;
  help?: string;
  candles: CandlePoint[];
  markers?: TradeMarker[];
  levels?: LevelLine[];
  height?: number;
  showVolume?: boolean;
  selectedTradeId?: string | null;
  onSelectTrade?: (tradeId: string | null) => void;
  showMarkerLabels?: boolean;
  symbolLabel?: string;
  timeframeLabel?: string;
  strategyName?: string;
}) {
  const empty = candles.length === 0;
  const [groups, setGroups] = useState<Record<MarkerGroup, boolean>>({
    entry: true,
    take_profit: true,
    stop_loss: true,
    max_hold: true,
    other: true,
  });
  const [readout, setReadout] = useState<string>("");

  const filteredMarkers = useMemo(
    () => markers.filter((m) => groups[markerGroup(m.kind, m.meta)]),
    [markers, groups],
  );

  const seriesKey = useMemo(() => {
    if (!candles.length) return "empty";
    return `${candles.length}:${candles[0].time}:${candles[candles.length - 1].time}`;
  }, [candles]);

  return (
    <div data-testid="candlestick-chart-root">
      <div className="mb-2 flex flex-wrap gap-2" data-testid="marker-group-toggles">
        {GROUP_LABELS.map((g) => (
          <label
            key={g.id}
            className="flex min-h-11 items-center gap-1.5 rounded border border-slate-700 px-2 text-xs rx-text-secondary sm:min-h-0"
          >
            <input
              type="checkbox"
              checked={groups[g.id]}
              onChange={() =>
                setGroups((s) => ({ ...s, [g.id]: !s[g.id] }))
              }
            />
            {g.label}
          </label>
        ))}
      </div>
      <p className="mb-2 text-xs rx-text-muted" data-testid="marker-legend">
        ▲진입 · ▼청산 · ■손절 · ●익절 · 선택/호버 시 진입–청산 연결
      </p>
      <ChartShell
        key={seriesKey}
        title={title}
        help={
          help ??
          "일반 휠=페이지 스크롤 · Ctrl+휠=확대 · 차트 탐색=드래그 이동. 십자선은 플롯 어디든 표시되며 가장 가까운 봉에 고정됩니다."
        }
        height={height}
        empty={empty}
        dataPointCount={candles.length}
        preferRecentWindow
        seriesKey={seriesKey}
        pad={CANDLE_PAD}
        readout={readout || undefined}
        legend={[
          { label: "상승 봉", color: CHART_THEME.up },
          { label: "하락 봉", color: CHART_THEME.down },
          { label: "롱 진입", color: CHART_THEME.entryLong },
          { label: "숏 진입", color: CHART_THEME.entryShort },
          { label: "손절", color: CHART_THEME.stopLoss },
          { label: "익절", color: CHART_THEME.takeProfit },
        ]}
      >
        {(ctx) => (
          <CandlePlot
            ctx={ctx}
            candles={candles}
            markers={filteredMarkers}
            levels={levels}
            showVolume={showVolume}
            selectedTradeId={selectedTradeId}
            onSelectTrade={onSelectTrade}
            showMarkerLabels={showMarkerLabels}
            symbolLabel={symbolLabel}
            timeframeLabel={timeframeLabel}
            strategyName={strategyName}
            onReadout={setReadout}
          />
        )}
      </ChartShell>
    </div>
  );
}

function nearestIndex(times: number[], t: number): number {
  if (!times.length) return 0;
  let lo = 0;
  let hi = times.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (times[mid] < t) lo = mid + 1;
    else hi = mid;
  }
  if (lo > 0) {
    const a = times[lo - 1];
    const b = times[lo];
    if (Math.abs(a - t) <= Math.abs(b - t)) return lo - 1;
  }
  return lo;
}

function CandlePlot({
  ctx,
  candles,
  markers,
  levels,
  showVolume,
  selectedTradeId,
  onSelectTrade,
  showMarkerLabels,
  symbolLabel,
  timeframeLabel,
  strategyName,
  onReadout,
}: {
  ctx: ChartRenderContext;
  candles: CandlePoint[];
  markers: TradeMarker[];
  levels: LevelLine[];
  showVolume: boolean;
  selectedTradeId?: string | null;
  onSelectTrade?: (tradeId: string | null) => void;
  showMarkerLabels: boolean;
  symbolLabel?: string;
  timeframeLabel?: string;
  strategyName?: string;
  onReadout: (text: string) => void;
}) {
  const { pad, plotW, plotH, zoom, setTooltip, crosshair } = ctx;
  const start = Math.floor(zoom.start * candles.length);
  const end = Math.max(start + 1, Math.ceil(zoom.end * candles.length));
  const view = candles.slice(start, end);

  const showLabels = showMarkerLabels;
  const [hoveredTradeId, setHoveredTradeId] = useState<string | null>(null);

  // Price domain from OHLC only — markers must never expand chart height
  const lows = view.length ? view.map((c) => c.low) : [0];
  const highs = view.length ? view.map((c) => c.high) : [1];
  const yDom = niceDomain(Math.min(...lows), Math.max(...highs), PRICE_DOMAIN_PAD);
  const volH = showVolume ? plotH * VOLUME_FRACTION : 0;
  const candleH = plotH - volH - 2;
  const xScale = createLinearScale(
    [0, Math.max(1, view.length - 1)],
    [pad.left, pad.left + plotW],
  );
  const yScale = createLinearScale(yDom, [pad.top + candleH, pad.top]);
  const maxVol = Math.max(...view.map((c) => c.volume ?? 0), 1);

  const geom = computeCandleGeometry(plotW, view.length);
  // Whole-pixel body width for crisp 1px edges while zooming
  const candleW = Math.max(1, snapPx(geom.bodyWidth));
  const wickW = Math.max(1, snapPx(geom.wickWidth));

  const yTicks = ticks(yDom, 5);
  const viewTimes = view.map((c) => c.time);

  let snapIdx = Math.max(0, view.length - 1);
  if (crosshair && view.length) {
    const frac = (crosshair.x - pad.left) / Math.max(1, plotW);
    snapIdx = Math.round(clamp01(frac) * Math.max(0, view.length - 1));
    snapIdx = Math.max(0, Math.min(view.length - 1, snapIdx));
  }
  const snap = view[snapIdx];
  const prev = view[snapIdx - 1];
  const snapX = view.length ? xScale(snapIdx) : pad.left;
  const cursorPrice =
    crosshair && view.length
      ? yDom[0] +
        ((pad.top + candleH - crosshair.y) / Math.max(1, candleH)) *
          (yDom[1] - yDom[0])
      : (snap?.close ?? 0);

  useEffect(() => {
    if (!crosshair || !snap) {
      onReadout("");
      return;
    }
    const times = view.map((c) => c.time);
    const candleEvents = markers.filter(
      (m) => nearestIndex(times, m.time) === snapIdx,
    );
    const ids = new Set<string>();
    for (const m of candleEvents) {
      if (m.tradeId) ids.add(m.tradeId);
    }
    const chg =
      prev != null && prev.close
        ? ((snap.close - prev.close) / prev.close) * 100
        : null;
    const entry = candleEvents.find((m) => m.meta?.phase === "entry");
    const exit = candleEvents.find((m) => m.meta?.phase === "exit");
    const tradeMeta = exit?.meta ?? entry?.meta;
    onReadout(
      [
        symbolLabel ?? "",
        timeframeLabel ?? "",
        formatKoreanDateTime(snap.time),
        `시 ${formatAxisNumber(snap.open)}`,
        `고 ${formatAxisNumber(snap.high)}`,
        `저 ${formatAxisNumber(snap.low)}`,
        `종 ${formatAxisNumber(snap.close)}`,
        snap.volume != null
          ? `거래량 ${snap.volume.toLocaleString("ko-KR")}`
          : "",
        chg != null ? `수익률 ${chg >= 0 ? "+" : ""}${chg.toFixed(2)}%` : "",
        ids.size > 0 ? `거래 ${ids.size}` : "",
        entry ? `진입 ${formatAxisNumber(entry.price)}` : "",
        exit ? `청산 ${formatAxisNumber(exit.price)}` : "",
        tradeMeta?.netPnlUsdt != null
          ? `PnL ${formatUsdt(Number(tradeMeta.netPnlUsdt))}`
          : "",
        tradeMeta?.holdMs != null
          ? `보유 ${formatDurationMs(Number(tradeMeta.holdMs))}`
          : "",
        strategyName ? `전략 ${strategyName}` : "",
      ]
        .filter(Boolean)
        .join("  ·  "),
    );
  }, [
    crosshair,
    snap,
    prev,
    symbolLabel,
    timeframeLabel,
    onReadout,
    markers,
    view,
    snapIdx,
    strategyName,
  ]);

  if (!view.length) return null;

  const visibleMarkers = markers.filter((m) => {
    if (m.time < view[0].time || m.time > view[view.length - 1].time) {
      return false;
    }
    return true;
  });

  // Cluster only when clearly zoomed out — expand as candle width grows
  const clusterMode =
    view.length > 220 && visibleMarkers.length > 50 && candleW < MIN_CANDLE_BODY_PX + 0.5;
  const clusters = clusterMode
    ? clusterMarkers(visibleMarkers, view, xScale, yScale)
    : null;

  // Virtualize: thin markers when dense; always keep selected + hovered
  const density =
    !clusterMode && visibleMarkers.length > 80 && candleW < 7
      ? Math.ceil(visibleMarkers.length / 50)
      : 1;

  const linkTradeId = hoveredTradeId ?? selectedTradeId ?? null;

  function buildHoverTooltip(
    c: CandlePoint,
    idx: number,
  ): ChartTooltipPayload {
    const chg =
      idx > 0 && view[idx - 1]?.close
        ? ((c.close - view[idx - 1].close) / view[idx - 1].close) * 100
        : null;
    const candleEvents = markers.filter(
      (m) => nearestIndex(viewTimes, m.time) === idx,
    );
    const entry = candleEvents.find((m) => m.meta?.phase === "entry");
    const exit = candleEvents.find((m) => m.meta?.phase === "exit");
    const meta = exit?.meta ?? entry?.meta;
    const up = c.close >= c.open;
    const rows: ChartTooltipRow[] = [
      {
        label: "시가",
        value: c.open.toLocaleString("ko-KR"),
        swatch: CHART_THEME.up,
        tone: "up",
      },
      {
        label: "고가",
        value: c.high.toLocaleString("ko-KR"),
        swatch: CHART_THEME.danger,
        tone: "down",
      },
      {
        label: "저가",
        value: c.low.toLocaleString("ko-KR"),
        swatch: CHART_THEME.accentAlt,
        tone: "accent",
      },
      {
        label: "종가",
        value: c.close.toLocaleString("ko-KR"),
        swatch: up ? CHART_THEME.up : CHART_THEME.down,
        tone: up ? "up" : "down",
      },
    ];
    if (c.volume != null) {
      rows.push({
        label: "거래량",
        value: c.volume.toLocaleString("ko-KR"),
        tone: "muted",
      });
    }
    if (chg != null) {
      rows.push({
        label: "등락률",
        value: `${chg >= 0 ? "+" : ""}${chg.toFixed(2)}%`,
        tone: chg >= 0 ? "up" : "down",
      });
    }
    if (meta?.netPnlUsdt != null) {
      const pnl = Number(meta.netPnlUsdt);
      rows.push({
        label: "손익",
        value: formatUsdt(pnl),
        tone: pnl >= 0 ? "up" : "down",
      });
    }
    if (entry) {
      rows.push({
        label: "진입",
        value: Number(entry.price).toLocaleString("ko-KR"),
        tone: "muted",
      });
    }
    if (exit) {
      rows.push({
        label: "청산",
        value: Number(exit.price).toLocaleString("ko-KR"),
        tone: "muted",
      });
    }
    if (meta?.holdMs != null) {
      rows.push({
        label: "보유시간",
        value: formatDurationMs(Number(meta.holdMs)),
        tone: "muted",
      });
    }
    return {
      x: 0,
      y: 0,
      header: formatKoreanDateTime(c.time),
      rows,
      footer: strategyName
        ? `전략  ${strategyName}`
        : undefined,
    };
  }

  function markerKindLabel(kind: TradeMarker["kind"], meta?: Record<string, unknown>): {
    text: string;
    border: string;
  } {
    if (kind === "entry_long") return { text: "Long", border: CHART_THEME.entryLong };
    if (kind === "entry_short") return { text: "Short", border: CHART_THEME.entryShort };
    if (kind === "take_profit") return { text: "TP", border: CHART_THEME.takeProfit };
    if (kind === "stop_loss") return { text: "SL", border: CHART_THEME.stopLoss };
    if (kind === "exit") {
      const pnl = meta?.pnlPct != null ? Number(meta.pnlPct) : null;
      return {
        text: "Exit",
        border: pnl != null && pnl >= 0 ? CHART_THEME.exitWin : CHART_THEME.exitLoss,
      };
    }
    if (meta?.exitReason === "max_hold" || kind === "partial_exit") {
      return { text: "Hold", border: CHART_THEME.maxHold };
    }
    return { text: "Exit", border: CHART_THEME.exit };
  }

  return (
    <g data-candle-fill={BODY_FILL_RATIO} data-candle-body={candleW.toFixed(2)}>
      {yTicks.map((t) => (
        <g key={t}>
          <line
            x1={pad.left}
            x2={pad.left + plotW}
            y1={yScale(t)}
            y2={yScale(t)}
            stroke={CHART_THEME.grid}
            strokeWidth={1}
          />
          <text
            x={pad.left - 6}
            y={yScale(t) + 3}
            textAnchor="end"
            fill={CHART_THEME.axisLabel}
            fontSize={11}
          >
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
        </g>
      ))}

      {/* Volume first (under candles), exact same body width + pixel snap */}
      {showVolume &&
        view.map((c, i) => {
          const x = snapPx(xScale(i));
          const up = c.close >= c.open;
          const half = candleW / 2;
          const volBarH = Math.max(1, snapPx((volH * (c.volume ?? 0)) / maxVol));
          const volTop = snapPx(
            pad.top + candleH + 4 + volH * (1 - (c.volume ?? 0) / maxVol),
          );
          return (
            <rect
              key={`vol-${c.time}`}
              x={snapPx(x - half)}
              y={volTop}
              width={candleW}
              height={volBarH}
              fill={up ? CHART_THEME.up : CHART_THEME.down}
              opacity={0.32}
              data-testid="volume-bar"
              shapeRendering="crispEdges"
            />
          );
        })}

      {view.map((c, i) => {
        const x = snapPx(xScale(i));
        const up = c.close >= c.open;
        const color = up ? CHART_THEME.up : CHART_THEME.down;
        const yHigh = snapPx(yScale(c.high));
        const yLow = snapPx(yScale(c.low));
        const yOpen = snapPx(yScale(c.open));
        const yClose = snapPx(yScale(c.close));
        const bodyTop = Math.min(yOpen, yClose);
        const rawH = Math.abs(yClose - yOpen);
        // TradingView-like minimum body for doji / near-doji (whole px)
        const bodyH = Math.max(MIN_CANDLE_BODY_HEIGHT_PX, snapPx(rawH) || rawH);
        const bodyY =
          rawH < MIN_CANDLE_BODY_HEIGHT_PX
            ? snapPx((yOpen + yClose) / 2 - bodyH / 2)
            : bodyTop;
        const bodyX = snapPx(x - candleW / 2);
        return (
          <g key={c.time} data-testid="candle-body-group">
            <line
              x1={x}
              x2={x}
              y1={yHigh}
              y2={yLow}
              stroke={color}
              strokeWidth={wickW}
              strokeLinecap="butt"
              vectorEffect="non-scaling-stroke"
              shapeRendering="crispEdges"
            />
            <rect
              x={bodyX}
              y={bodyY}
              width={candleW}
              height={bodyH}
              fill={color}
              stroke="none"
              rx={0}
              ry={0}
              data-testid="candle-body"
              shapeRendering="crispEdges"
            />
            {/* 1px crisp edge overlay — no blur / no rounded corners */}
            <rect
              x={bodyX}
              y={bodyY}
              width={candleW}
              height={bodyH}
              fill="none"
              stroke={color}
              strokeWidth={BODY_STROKE_PX}
              rx={0}
              ry={0}
              shapeRendering="crispEdges"
              pointerEvents="none"
            />
          </g>
        );
      })}

      {/* Full-plot hit area — TradingView-style OHLC anywhere */}
      <rect
        x={pad.left}
        y={pad.top}
        width={plotW}
        height={candleH}
        fill="transparent"
        data-testid="candle-plot-hit"
        onMouseMove={() => {
          if (!snap) return;
          const tip = buildHoverTooltip(snap, snapIdx);
          setTooltip({
            ...tip,
            x: snapX,
            y: yScale(snap.close),
          });
        }}
        onMouseLeave={() => setTooltip(null)}
      />

      {/* Snap highlight */}
      {crosshair && snap && (
        <g pointerEvents="none" data-testid="candle-snap">
          <line
            x1={snapX}
            x2={snapX}
            y1={pad.top}
            y2={pad.top + candleH + (showVolume ? volH : 0)}
            stroke={CHART_THEME.accentAlt}
            strokeWidth={1}
            opacity={0.45}
          />
          <rect
            x={pad.left - 52}
            y={yScale(cursorPrice) - 9}
            width={50}
            height={18}
            rx={3}
            fill="#0f172a"
            stroke={CHART_THEME.accentAlt}
          />
          <text
            x={pad.left - 6}
            y={yScale(cursorPrice) + 4}
            textAnchor="end"
            fill={CHART_THEME.axisLabel}
            fontSize={10}
            data-testid="crosshair-price-label"
          >
            {formatAxisNumber(cursorPrice)}
          </text>
          <rect
            x={snapX - 54}
            y={ctx.height - 18}
            width={108}
            height={16}
            rx={3}
            fill="#0f172a"
            stroke={CHART_THEME.accentAlt}
          />
          <text
            x={snapX}
            y={ctx.height - 6}
            textAnchor="middle"
            fill={CHART_THEME.axisLabel}
            fontSize={10}
            data-testid="crosshair-time-label"
          >
            {formatKoreanDateTime(snap.time)}
          </text>
        </g>
      )}

      {/* Selected or hovered trade connection only */}
      {linkTradeId &&
        (() => {
          const pair = visibleMarkers.filter((m) => m.tradeId === linkTradeId);
          if (pair.length < 2) return null;
          const pts = pair.map((m) => {
            const i = nearestIndex(viewTimes, m.time);
            const cndl = view[i];
            const phase = m.meta?.phase === "exit" ? "exit" : "entry";
            let y = yScale(m.price);
            if (cndl) {
              if (phase === "entry") {
                y = yScale(cndl.low) + MARKER_OFFSET_PX;
              } else {
                y = yScale(cndl.high) - MARKER_OFFSET_PX;
              }
            }
            return { x: xScale(i), y };
          });
          const isHover = hoveredTradeId === linkTradeId && selectedTradeId !== linkTradeId;
          return (
            <line
              x1={pts[0].x}
              y1={pts[0].y}
              x2={pts[pts.length - 1].x}
              y2={pts[pts.length - 1].y}
              stroke="#38bdf8"
              strokeWidth={isHover ? 1.25 : 1.5}
              strokeDasharray="3 3"
              opacity={isHover ? 0.55 : 0.7}
              pointerEvents="none"
              data-testid="trade-connection"
            />
          );
        })()}

      {clusters
        ? clusters.map((c) => (
            <g
              key={`cluster-${c.x}-${c.y}`}
              className="cursor-pointer"
              data-testid="marker-cluster"
              onClick={() => onSelectTrade?.(c.tradeIds[0] ?? null)}
              opacity={MARKER_OPACITY}
            >
              <circle
                cx={c.x}
                cy={c.y}
                r={Math.min(10, Math.max(7, candleW * 0.9))}
                fill="#1e293b"
                stroke={CHART_THEME.accentAlt}
                strokeWidth={1.25}
              />
              <text
                x={c.x}
                y={c.y + 3.5}
                textAnchor="middle"
                fill={CHART_THEME.legendText}
                fontSize={10}
                fontWeight={700}
                fontFamily={CHART_THEME.fontFamily}
              >
                {c.count}
              </text>
            </g>
          ))
        : visibleMarkers.map((m, idx) => {
            const selected = Boolean(m.tradeId && m.tradeId === selectedTradeId);
            const hovered = Boolean(m.tradeId && m.tradeId === hoveredTradeId);
            if (
              !selected &&
              !hovered &&
              density > 1 &&
              idx % density !== 0
            ) {
              return null;
            }
            const xi = nearestIndex(viewTimes, m.time);
            const x = xScale(xi);
            const cndl = view[xi];
            const phase = m.meta?.phase === "exit" ? "exit" : "entry";
            const meta = m.meta ?? {};
            const side = meta.side === "SHORT" ? "SHORT" : "LONG";
            // Never cover candle body — offset above high / below low
            let y = yScale(m.price);
            if (phase === "entry") {
              y =
                side === "SHORT"
                  ? Math.min(
                      yScale(cndl.high) - MARKER_OFFSET_PX,
                      yScale(m.price) - 4,
                    )
                  : Math.max(
                      yScale(cndl.low) + MARKER_OFFSET_PX,
                      yScale(m.price) + 4,
                    );
            } else if (side === "LONG") {
              y = Math.min(
                yScale(cndl.high) - MARKER_OFFSET_PX,
                yScale(m.price) - 2,
              );
            } else {
              y = Math.max(
                yScale(cndl.low) + MARKER_OFFSET_PX,
                yScale(m.price) + 2,
              );
            }
            // Clamp into candle pane (not volume)
            y = Math.max(pad.top + 4, Math.min(pad.top + candleH - 4, y));

            const color = markerColor(m.kind);
            const shape = markerShape(m.kind, m.meta);
            const r = selected || hovered ? MARKER_SELECTED_RADIUS : MARKER_BASE_RADIUS;
            // Keep hit targets large even when glyph shrinks
            const hitR = Math.max(28, r + 14);
            const sideKo = side === "SHORT" ? "숏" : "롱";
            const phaseKo = phase === "exit" ? "청산" : "진입";
            const kindLbl = markerKindLabel(m.kind, m.meta);
            const showKindCard = !clusterMode && (showLabels || selected || hovered || candleW >= 8);
            const labelY = phase === "entry" ? y + r + 14 : y - r - 14;

            return (
              <g
                key={`${m.kind}-${m.tradeId ?? idx}-${m.time}`}
                className="cursor-pointer"
                data-testid="trade-marker"
                data-marker-kind={m.kind}
                opacity={selected || hovered ? 1 : MARKER_OPACITY}
                style={{ transition: "opacity 120ms ease-out" }}
                onClick={(e) => {
                  e.stopPropagation();
                  onSelectTrade?.(m.tradeId ?? null);
                }}
                onMouseEnter={() => {
                  if (m.tradeId) setHoveredTradeId(m.tradeId);
                  const pnl =
                    meta.netPnlUsdt != null ? Number(meta.netPnlUsdt) : null;
                  const rows: ChartTooltipRow[] = [
                    {
                      label: "구분",
                      value: `${sideKo} · ${phaseKo}`,
                      swatch: color,
                    },
                    {
                      label: "가격",
                      value: Number(m.price).toLocaleString("ko-KR"),
                    },
                  ];
                  if (meta.exitReason) {
                    rows.push({
                      label: "사유",
                      value: String(meta.exitReason),
                      tone: "muted",
                    });
                  }
                  if (meta.holdMs != null) {
                    rows.push({
                      label: "보유시간",
                      value: formatDurationMs(Number(meta.holdMs)),
                      tone: "muted",
                    });
                  }
                  if (pnl != null) {
                    rows.push({
                      label: "손익",
                      value: formatUsdt(pnl),
                      tone: pnl >= 0 ? "up" : "down",
                    });
                  }
                  if (meta.pnlPct != null) {
                    rows.push({
                      label: "수익률",
                      value: formatPct(Number(meta.pnlPct)),
                      tone: Number(meta.pnlPct) >= 0 ? "up" : "down",
                    });
                  }
                  setTooltip({
                    x,
                    y,
                    header: formatKoreanDateTime(m.time),
                    rows,
                    footer: [
                      m.tradeId ? `거래  ${m.tradeId}` : null,
                      strategyName ? `전략  ${strategyName}` : null,
                    ]
                      .filter(Boolean)
                      .join("  ·  ") || undefined,
                  });
                }}
                onMouseLeave={() => {
                  setHoveredTradeId(null);
                  setTooltip(null);
                }}
              >
                <circle
                  cx={x}
                  cy={y}
                  r={hitR}
                  fill="transparent"
                  data-testid="marker-hit-target"
                />
                <MarkerGlyph
                  shape={shape}
                  x={x}
                  y={y}
                  r={r}
                  color={color}
                  selected={selected || hovered}
                />
                {showKindCard && (
                  <MarkerLabelCard
                    x={x}
                    y={labelY}
                    text={kindLbl.text}
                    border={kindLbl.border}
                  />
                )}
                {(showLabels || selected) && m.tradeId && (
                  <text
                    x={x + r + 6}
                    y={y + 4}
                    fill={color}
                    fontSize={10}
                    fontWeight={600}
                    data-testid="marker-trade-id-label"
                  >
                    {m.tradeId}
                  </text>
                )}
              </g>
            );
          })}

      <text
        x={pad.left}
        y={ctx.height - 4}
        fill={CHART_THEME.axisLabel}
        fontSize={11}
      >
        {formatKoreanDateTime(view[0].time)}
      </text>
      <text
        x={pad.left + plotW}
        y={ctx.height - 4}
        textAnchor="end"
        fill={CHART_THEME.axisLabel}
        fontSize={11}
      >
        {formatKoreanDateTime(view[view.length - 1].time)}
      </text>
    </g>
  );
}

/** Rounded dark label card with colored border (Long / Short / TP / SL). */
function MarkerLabelCard({
  x,
  y,
  text,
  border,
}: {
  x: number;
  y: number;
  text: string;
  border: string;
}) {
  const w = Math.max(28, text.length * 7.2 + 10);
  const h = 16;
  return (
    <g data-testid="marker-kind-label" pointerEvents="none">
      <rect
        x={x - w / 2}
        y={y - h / 2}
        width={w}
        height={h}
        rx={4}
        ry={4}
        fill="#0b1220"
        stroke={border}
        strokeWidth={1.5}
        opacity={0.95}
      />
      <text
        x={x}
        y={y + 4}
        textAnchor="middle"
        fill="#f1f5fb"
        fontSize={10}
        fontWeight={700}
        fontFamily={CHART_THEME.fontFamily}
      >
        {text}
      </text>
    </g>
  );
}

function MarkerGlyph({
  shape,
  x,
  y,
  r,
  color,
  selected,
}: {
  shape: Shape;
  x: number;
  y: number;
  r: number;
  color: string;
  selected: boolean;
}) {
  const stroke = selected ? "#ffffff" : "#020617";
  const sw = selected ? 2.25 : 1.75;
  if (shape === "triangle-up") {
    return (
      <polygon
        points={`${x},${y - r} ${x - r * 0.95},${y + r * 0.8} ${x + r * 0.95},${y + r * 0.8}`}
        fill={color}
        stroke={stroke}
        strokeWidth={sw}
        strokeLinejoin="miter"
      />
    );
  }
  if (shape === "triangle-down") {
    return (
      <polygon
        points={`${x},${y + r} ${x - r * 0.95},${y - r * 0.8} ${x + r * 0.95},${y - r * 0.8}`}
        fill={color}
        stroke={stroke}
        strokeWidth={sw}
        strokeLinejoin="miter"
      />
    );
  }
  if (shape === "diamond") {
    return (
      <polygon
        points={`${x},${y - r} ${x + r},${y} ${x},${y + r} ${x - r},${y}`}
        fill={color}
        stroke={stroke}
        strokeWidth={sw}
      />
    );
  }
  if (shape === "square") {
    const s = r * 1.6;
    return (
      <rect
        x={x - s / 2}
        y={y - s / 2}
        width={s}
        height={s}
        fill={color}
        stroke={stroke}
        strokeWidth={sw}
        rx={0}
        ry={0}
      />
    );
  }
  if (shape === "hex") {
    return (
      <polygon
        points={`${x},${y - r} ${x + r * 0.87},${y - r / 2} ${x + r * 0.87},${y + r / 2} ${x},${y + r} ${x - r * 0.87},${y + r / 2} ${x - r * 0.87},${y - r / 2}`}
        fill={color}
        stroke={stroke}
        strokeWidth={sw}
      />
    );
  }
  if (shape === "check") {
    return (
      <g>
        <circle cx={x} cy={y} r={r} fill={color} stroke={stroke} strokeWidth={sw} />
        <polyline
          points={`${x - r * 0.45},${y} ${x - r * 0.1},${y + r * 0.4} ${x + r * 0.5},${y - r * 0.35}`}
          fill="none"
          stroke="#020617"
          strokeWidth={2}
        />
      </g>
    );
  }
  // circle — take profit ●
  return (
    <g>
      <circle cx={x} cy={y} r={r * 0.9} fill={color} stroke={stroke} strokeWidth={sw} />
      <circle cx={x} cy={y} r={r * 0.3} fill="#020617" opacity={0.5} />
    </g>
  );
}

function clusterMarkers(
  markers: TradeMarker[],
  view: CandlePoint[],
  xScale: (v: number) => number,
  yScale: (v: number) => number,
) {
  const buckets = new Map<
    string,
    { x: number; y: number; count: number; tradeIds: string[] }
  >();
  const times = view.map((c) => c.time);
  for (const m of markers) {
    const xi = nearestIndex(times, m.time);
    const bx = Math.round(xScale(xi) / 32);
    const by = Math.round(yScale(m.price) / 32);
    const key = `${bx}:${by}`;
    const cur = buckets.get(key) ?? {
      x: xScale(xi),
      y: yScale(m.price),
      count: 0,
      tradeIds: [],
    };
    cur.count += 1;
    if (m.tradeId) cur.tradeIds.push(m.tradeId);
    buckets.set(key, cur);
  }
  return [...buckets.values()].filter((b) => b.count >= 2);
}

function clamp01(v: number) {
  return Math.max(0, Math.min(1, v));
}
