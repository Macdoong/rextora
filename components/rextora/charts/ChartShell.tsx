"use client";

import { useCallback, useMemo, useRef, useState, type ReactNode } from "react";
import { CHART_THEME } from "@/src/lib/rextora/charts/theme";
import { clamp } from "@/src/lib/rextora/charts/scales";

export interface ChartShellProps {
  title?: string;
  height?: number;
  className?: string;
  legend?: Array<{ label: string; color: string }>;
  children: (ctx: ChartRenderContext) => ReactNode;
  /** Enable wheel zoom + drag pan on x domain fraction [0,1] */
  interactive?: boolean;
  empty?: boolean;
  emptyLabel?: string;
}

export interface ChartRenderContext {
  width: number;
  height: number;
  pad: { top: number; right: number; bottom: number; left: number };
  plotW: number;
  plotH: number;
  zoom: { start: number; end: number };
  crosshair: { x: number; y: number } | null;
  setTooltip: (tip: { x: number; y: number; lines: string[] } | null) => void;
}

const PAD = { top: 16, right: 16, bottom: 28, left: 48 };

export function ChartShell({
  title,
  height = 240,
  className = "",
  legend,
  children,
  interactive = true,
  empty = false,
  emptyLabel = "데이터 없음"
}: ChartShellProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(640);
  const [zoom, setZoom] = useState({ start: 0, end: 1 });
  const [crosshair, setCrosshair] = useState<{ x: number; y: number } | null>(null);
  const [tooltip, setTooltip] = useState<{ x: number; y: number; lines: string[] } | null>(null);
  const drag = useRef<{ x: number; start: number; end: number } | null>(null);

  const measure = useCallback(() => {
    if (!wrapRef.current) return;
    setWidth(Math.max(280, wrapRef.current.clientWidth));
  }, []);

  // ResizeObserver via ref callback pattern on mount
  const setRef = useCallback(
    (node: HTMLDivElement | null) => {
      (wrapRef as React.MutableRefObject<HTMLDivElement | null>).current = node;
      if (!node) return;
      measure();
      const ro = new ResizeObserver(() => measure());
      ro.observe(node);
      (node as HTMLDivElement & { __ro?: ResizeObserver }).__ro = ro;
    },
    [measure]
  );

  const plotW = width - PAD.left - PAD.right;
  const plotH = height - PAD.top - PAD.bottom;

  const ctx = useMemo<ChartRenderContext>(
    () => ({
      width,
      height,
      pad: PAD,
      plotW,
      plotH,
      zoom,
      crosshair,
      setTooltip
    }),
    [width, height, plotW, plotH, zoom, crosshair]
  );

  function onWheel(e: React.WheelEvent) {
    if (!interactive) return;
    e.preventDefault();
    const rect = wrapRef.current?.getBoundingClientRect();
    if (!rect) return;
    const px = (e.clientX - rect.left - PAD.left) / plotW;
    const center = zoom.start + clamp(px, 0, 1) * (zoom.end - zoom.start);
    const span = zoom.end - zoom.start;
    const next = clamp(span * (e.deltaY > 0 ? 1.15 : 0.85), 0.05, 1);
    let start = center - next / 2;
    let end = center + next / 2;
    if (start < 0) {
      end -= start;
      start = 0;
    }
    if (end > 1) {
      start -= end - 1;
      end = 1;
    }
    setZoom({ start: clamp(start, 0, 1), end: clamp(end, 0, 1) });
  }

  function onPointerDown(e: React.PointerEvent) {
    if (!interactive) return;
    drag.current = { x: e.clientX, start: zoom.start, end: zoom.end };
    (e.target as Element).setPointerCapture?.(e.pointerId);
  }

  function onPointerMove(e: React.PointerEvent) {
    const rect = wrapRef.current?.getBoundingClientRect();
    if (rect) {
      setCrosshair({ x: e.clientX - rect.left, y: e.clientY - rect.top });
    }
    if (!drag.current || !interactive) return;
    const dx = (e.clientX - drag.current.x) / plotW;
    const span = drag.current.end - drag.current.start;
    let start = drag.current.start - dx * span;
    let end = drag.current.end - dx * span;
    if (start < 0) {
      end -= start;
      start = 0;
    }
    if (end > 1) {
      start -= end - 1;
      end = 1;
    }
    setZoom({ start: clamp(start, 0, 1), end: clamp(end, 0, 1) });
  }

  function onPointerUp() {
    drag.current = null;
  }

  return (
    <div className={`rounded-lg border border-slate-800 bg-slate-950/40 p-3 ${className}`} data-chart-shell>
      {(title || legend) && (
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          {title && <h3 className="text-sm font-semibold text-slate-200">{title}</h3>}
          {legend && (
            <div className="flex flex-wrap gap-3">
              {legend.map((l) => (
                <span key={l.label} className="flex items-center gap-1.5 text-[11px] text-slate-400">
                  <span className="inline-block h-2 w-2 rounded-full" style={{ background: l.color }} />
                  {l.label}
                </span>
              ))}
            </div>
          )}
        </div>
      )}
      <div
        ref={setRef}
        className="relative w-full touch-none select-none"
        style={{ height }}
        onWheel={onWheel}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={() => {
          setCrosshair(null);
          setTooltip(null);
        }}
      >
        {empty ? (
          <div className="flex h-full items-center justify-center text-sm text-slate-500">{emptyLabel}</div>
        ) : (
          <svg width={width} height={height} className="overflow-visible">
            <rect x={0} y={0} width={width} height={height} fill={CHART_THEME.background} />
            {children(ctx)}
            {crosshair && interactive && (
              <g pointerEvents="none">
                <line
                  x1={crosshair.x}
                  x2={crosshair.x}
                  y1={PAD.top}
                  y2={height - PAD.bottom}
                  stroke={CHART_THEME.crosshair}
                  strokeDasharray="3 3"
                  opacity={0.5}
                />
                <line
                  x1={PAD.left}
                  x2={width - PAD.right}
                  y1={crosshair.y}
                  y2={crosshair.y}
                  stroke={CHART_THEME.crosshair}
                  strokeDasharray="3 3"
                  opacity={0.5}
                />
              </g>
            )}
          </svg>
        )}
        {tooltip && !empty && (
          <div
            className="pointer-events-none absolute z-10 rounded border px-2 py-1 text-[11px] shadow"
            style={{
              left: Math.min(tooltip.x + 12, width - 140),
              top: Math.max(8, tooltip.y - 40),
              background: CHART_THEME.tooltipBg,
              borderColor: CHART_THEME.tooltipBorder,
              color: CHART_THEME.tooltipText
            }}
          >
            {tooltip.lines.map((line) => (
              <div key={line}>{line}</div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
