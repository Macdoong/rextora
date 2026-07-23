"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  Expand,
  HelpCircle,
  Maximize2,
  Minimize2,
  Move,
  RotateCcw,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { CHART_THEME } from "@/src/lib/rextora/charts/theme";
import { clamp } from "@/src/lib/rextora/charts/scales";
import { defaultVisibleCandleTarget } from "@/src/lib/rextora/backtest/candleSpacing";

export interface ChartShellProps {
  title?: string;
  help?: string;
  height?: number;
  className?: string;
  legend?: Array<{ label: string; color: string }>;
  children: (ctx: ChartRenderContext) => ReactNode;
  interactive?: boolean;
  empty?: boolean;
  emptyLabel?: string;
  toolbar?: boolean;
  onExploreChange?: (active: boolean) => void;
  syncCrosshairX?: number | null;
  onCrosshairX?: (xFraction: number | null) => void;
  /** Allow parent to force height (e.g. fullscreen) */
  fullscreenCapable?: boolean;
  /**
   * When set, opens a recent readable window instead of full history.
   * Target ~55–75 visible candles on desktop (TradingView-like density).
   */
  dataPointCount?: number;
  preferRecentWindow?: boolean;
  /** Persistent readout above the plot (e.g. OHLC strip) */
  readout?: ReactNode;
  /**
   * When this identity changes (new run / symbol / timeframe),
   * zoom resets to the default readable window.
   */
  seriesKey?: string;
  /** Optional pad override (candlestick uses tighter vertical margins). */
  pad?: Partial<{ top: number; right: number; bottom: number; left: number }>;
}

/** Trading-terminal tooltip row (label / value with optional swatch). */
export type ChartTooltipRow = {
  label: string;
  value: string;
  swatch?: string;
  tone?: "up" | "down" | "muted" | "accent";
};

export type ChartTooltipPayload = {
  x: number;
  y: number;
  /** Legacy plain lines — still rendered when rows are absent. */
  lines?: string[];
  header?: string;
  rows?: ChartTooltipRow[];
  footer?: string;
};

export interface ChartRenderContext {
  width: number;
  height: number;
  pad: { top: number; right: number; bottom: number; left: number };
  plotW: number;
  plotH: number;
  zoom: { start: number; end: number };
  crosshair: { x: number; y: number } | null;
  explore: boolean;
  setTooltip: (tip: ChartTooltipPayload | null) => void;
  setZoom: (z: { start: number; end: number }) => void;
}

const DEFAULT_PAD = { top: 12, right: 12, bottom: 24, left: 52 };

function ToolbarBtn({
  children,
  onClick,
  active = false,
  "data-testid": testId,
  "aria-label": ariaLabel,
}: {
  children: ReactNode;
  onClick: () => void;
  active?: boolean;
  "data-testid"?: string;
  "aria-label": string;
}) {
  return (
    <button
      type="button"
      aria-label={ariaLabel}
      data-testid={testId}
      className={`inline-flex min-h-11 items-center gap-1.5 rounded border px-2.5 py-1.5 text-xs sm:min-h-0 ${
        active
          ? "border-sky-500 text-sky-300"
          : "border-slate-700 rx-text-muted hover:text-[var(--text-primary)]"
      }`}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

export function ChartShell({
  title,
  help,
  height = 240,
  className = "",
  legend,
  children,
  interactive = true,
  empty = false,
  emptyLabel = "데이터 없음",
  toolbar = true,
  onExploreChange,
  syncCrosshairX,
  onCrosshairX,
  fullscreenCapable = true,
  dataPointCount,
  preferRecentWindow = false,
  readout,
  pad: padOverride,
  seriesKey,
}: ChartShellProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(640);
  const [zoom, setZoom] = useState({ start: 0, end: 1 });
  const [zoomInitialized, setZoomInitialized] = useState(false);
  const [crosshair, setCrosshair] = useState<{ x: number; y: number } | null>(
    null,
  );
  const [tooltip, setTooltip] = useState<ChartTooltipPayload | null>(null);
  const [explore, setExplore] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [savedScrollY, setSavedScrollY] = useState(0);
  const drag = useRef<{ x: number; start: number; end: number } | null>(null);
  const zoomAnim = useRef<number | null>(null);
  const lastSeriesKey = useRef(seriesKey);

  const PAD = useMemo(
    () => ({ ...DEFAULT_PAD, ...padOverride }),
    [padOverride],
  );

  const effectiveHeight = fullscreen
    ? Math.max(480, typeof window !== "undefined" ? window.innerHeight - 120 : height)
    : height;

  const measure = useCallback(() => {
    if (!wrapRef.current) return;
    setWidth(Math.max(280, wrapRef.current.clientWidth));
  }, []);

  const setRef = useCallback(
    (node: HTMLDivElement | null) => {
      (wrapRef as React.MutableRefObject<HTMLDivElement | null>).current = node;
      if (!node) return;
      measure();
      const ro = new ResizeObserver(() => measure());
      ro.observe(node);
      (node as HTMLDivElement & { __ro?: ResizeObserver }).__ro = ro;
    },
    [measure],
  );

  useEffect(() => {
    onExploreChange?.(explore);
  }, [explore, onExploreChange]);

  useEffect(() => {
    measure();
  }, [fullscreen, effectiveHeight, measure]);

  useEffect(() => {
    return () => {
      if (zoomAnim.current != null) cancelAnimationFrame(zoomAnim.current);
    };
  }, []);

  // New run / symbol / timeframe — drop stale zoom and re-apply readable default
  useEffect(() => {
    if (seriesKey === lastSeriesKey.current) return;
    lastSeriesKey.current = seriesKey;
    setZoomInitialized(false);
    setZoom({ start: 0, end: 1 });
  }, [seriesKey]);

  // Initialize readable recent window once width + count known (~70–100 candles)
  useEffect(() => {
    if (zoomInitialized || !preferRecentWindow) return;
    if (!dataPointCount || dataPointCount < 2 || width < 100) return;
    const plotWidth = Math.max(200, width - PAD.left - PAD.right);
    const target = defaultVisibleCandleTarget(plotWidth, dataPointCount);
    const next =
      target >= dataPointCount
        ? { start: 0, end: 1 }
        : { start: clamp(1 - target / dataPointCount, 0, 1), end: 1 };
    const id = requestAnimationFrame(() => {
      setZoom(next);
      setZoomInitialized(true);
    });
    return () => cancelAnimationFrame(id);
  }, [preferRecentWindow, dataPointCount, width, zoomInitialized, PAD.left, PAD.right]);

  function resetDefaultZoom() {
    if (preferRecentWindow && dataPointCount && dataPointCount > 2) {
      const plotWidth = Math.max(200, width - PAD.left - PAD.right);
      const target = defaultVisibleCandleTarget(plotWidth, dataPointCount);
      if (target < dataPointCount) {
        const span = target / dataPointCount;
        setZoom({ start: clamp(1 - span, 0, 1), end: 1 });
        return;
      }
    }
    setZoom({ start: 0, end: 1 });
  }

  /** Deepest zoom = 1 candle visible (no artificial span floor). */
  function minZoomSpan(): number {
    const n = dataPointCount ?? 0;
    if (n <= 1) return 1;
    return 1 / n;
  }

  function clampZoomSpan(span: number): number {
    return clamp(span, minZoomSpan(), 1);
  }

  /** Smooth zoom step toward target span (keeps 60fps feel without lag). */
  function animateZoomTo(centerFrac: number, nextSpan: number) {
    if (zoomAnim.current != null) cancelAnimationFrame(zoomAnim.current);
    const from = { ...zoom };
    const span = clampZoomSpan(nextSpan);
    let start = centerFrac - span / 2;
    let end = centerFrac + span / 2;
    if (start < 0) {
      end -= start;
      start = 0;
    }
    if (end > 1) {
      start -= end - 1;
      end = 1;
    }
    const to = {
      start: clamp(start, 0, 1),
      end: clamp(end, 0, 1),
    };
    const t0 = performance.now();
    const dur = 90;
    const step = (now: number) => {
      const t = Math.min(1, (now - t0) / dur);
      const e = t * (2 - t);
      setZoom({
        start: from.start + (to.start - from.start) * e,
        end: from.end + (to.end - from.end) * e,
      });
      if (t < 1) {
        zoomAnim.current = requestAnimationFrame(step);
      } else {
        zoomAnim.current = null;
      }
    };
    zoomAnim.current = requestAnimationFrame(step);
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (fullscreen) {
          setFullscreen(false);
          window.scrollTo(0, savedScrollY);
        } else if (explore) {
          setExplore(false);
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [explore, fullscreen, savedScrollY]);

  // Click outside chart exits explore mode
  useEffect(() => {
    if (!explore) return;
    const onDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) {
        setExplore(false);
      }
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [explore]);

  // Lock body scroll only in fullscreen
  useEffect(() => {
    if (!fullscreen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [fullscreen]);

  const plotW = width - PAD.left - PAD.right;
  const plotH = effectiveHeight - PAD.top - PAD.bottom;

  // Sync crosshair from peer charts without setState-in-effect
  const displayCrosshair = useMemo(() => {
    if (syncCrosshairX != null) {
      return {
        x: PAD.left + syncCrosshairX * plotW,
        y: crosshair?.y ?? effectiveHeight / 2,
      };
    }
    return crosshair;
  }, [syncCrosshairX, plotW, crosshair, effectiveHeight, PAD.left]);

  const ctx = useMemo<ChartRenderContext>(
    () => ({
      width,
      height: effectiveHeight,
      pad: PAD,
      plotW,
      plotH,
      zoom,
      crosshair: displayCrosshair,
      explore,
      setTooltip,
      setZoom,
    }),
    [width, effectiveHeight, plotW, plotH, zoom, displayCrosshair, explore, PAD],
  );

  function applyZoomAround(centerFrac: number, nextSpan: number) {
    const span = clampZoomSpan(nextSpan);
    let start = centerFrac - span / 2;
    let end = centerFrac + span / 2;
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

  /**
   * Wheel: NEVER zoom without Ctrl/Cmd.
   * Regular wheel must scroll the page (no preventDefault).
   * Explore mode only enables drag pan — not wheel zoom.
   * Min span = 1/n candles — zoom to individual bars is allowed.
   */
  function onWheel(e: React.WheelEvent) {
    if (!interactive) return;
    if (!(e.ctrlKey || e.metaKey)) return;
    e.preventDefault();
    e.stopPropagation();
    const rect = wrapRef.current?.getBoundingClientRect();
    if (!rect) return;
    const px = (e.clientX - rect.left - PAD.left) / plotW;
    const center = zoom.start + clamp(px, 0, 1) * (zoom.end - zoom.start);
    const span = zoom.end - zoom.start;
    // Stronger zoom-in factor so deep zoom is reachable in few gestures
    const next = clampZoomSpan(span * (e.deltaY > 0 ? 1.18 : 0.82));
    applyZoomAround(center, next);
  }

  function onPointerDown(e: React.PointerEvent) {
    if (!interactive || !explore) return;
    // Only start pan with primary button
    if (e.button !== 0) return;
    drag.current = { x: e.clientX, start: zoom.start, end: zoom.end };
    (e.target as Element).setPointerCapture?.(e.pointerId);
    e.preventDefault();
  }

  function onPointerMove(e: React.PointerEvent) {
    const rect = wrapRef.current?.getBoundingClientRect();
    if (rect) {
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      setCrosshair({ x, y });
      if (onCrosshairX && plotW > 0) {
        onCrosshairX(clamp((x - PAD.left) / plotW, 0, 1));
      }
    }
    if (!drag.current || !interactive || !explore) return;
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

  const shell = (
    <div
      ref={rootRef}
      className={`rounded-lg border border-slate-800 bg-slate-950/40 p-3 ${className} ${
        fullscreen ? "fixed inset-0 z-[80] m-0 flex flex-col rounded-none p-4" : ""
      }`}
      data-chart-shell
      data-explore={explore ? "true" : "false"}
      data-fullscreen={fullscreen ? "전체화면 종료" : "전체화면"}
      data-testid={fullscreen ? "chart-fullscreen" : "chart-shell"}
    >
      {(title || legend || toolbar) && (
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2">
            {title && (
              <h3 className="text-sm font-semibold rx-text-primary">{title}</h3>
            )}
            {help && (
              <ToolbarBtn
                aria-label="차트 도움말"
                data-testid="chart-help"
                onClick={() => setHelpOpen((v) => !v)}
              >
                <HelpCircle className="h-3.5 w-3.5" aria-hidden />
              </ToolbarBtn>
            )}
            {explore && (
              <span
                className="rounded bg-sky-500/20 px-2 py-0.5 text-[11px] text-sky-300"
                data-testid="chart-explore-active"
              >
                탐색 모드 ON
              </span>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {legend && (
              <div className="flex flex-wrap gap-3">
                {legend.map((l) => (
                  <span
                    key={l.label}
                    className="flex items-center gap-1.5 text-xs rx-text-secondary"
                  >
                    <span
                      className="inline-block h-2.5 w-2.5 rounded-full"
                      style={{ background: l.color }}
                    />
                    {l.label}
                  </span>
                ))}
              </div>
            )}
            {interactive && toolbar && (
              <div className="flex flex-wrap gap-1" data-testid="chart-toolbar">
                <ToolbarBtn
                  aria-label="차트 탐색 모드"
                  data-testid="chart-explore"
                  active={explore}
                  onClick={() => setExplore((v) => !v)}
                >
                  <Move className="h-3.5 w-3.5" aria-hidden />
                  차트 탐색
                </ToolbarBtn>
                <ToolbarBtn
                  aria-label="차트 확대"
                  data-testid="chart-zoom-in"
                  onClick={() => {
                    const span = zoom.end - zoom.start;
                    animateZoomTo(
                      (zoom.start + zoom.end) / 2,
                      clampZoomSpan(span * 0.55),
                    );
                  }}
                >
                  <ZoomIn className="h-3.5 w-3.5" aria-hidden />
                  확대
                </ToolbarBtn>
                <ToolbarBtn
                  aria-label="차트 축소"
                  data-testid="chart-zoom-out"
                  onClick={() => {
                    const span = zoom.end - zoom.start;
                    animateZoomTo(
                      (zoom.start + zoom.end) / 2,
                      clampZoomSpan(span * 1.55),
                    );
                  }}
                >
                  <ZoomOut className="h-3.5 w-3.5" aria-hidden />
                  축소
                </ToolbarBtn>
                <ToolbarBtn
                  aria-label="전체 기간 차트 보기"
                  data-testid="chart-fit-all"
                  onClick={() => setZoom({ start: 0, end: 1 })}
                >
                  <Expand className="h-3.5 w-3.5" aria-hidden />
                  전체 보기
                </ToolbarBtn>
                <ToolbarBtn
                  aria-label="기본 구간으로 복원"
                  data-testid="chart-reset-default"
                  onClick={() => resetDefaultZoom()}
                >
                  <RotateCcw className="h-3.5 w-3.5" aria-hidden />
                  기본 구간
                </ToolbarBtn>
                {fullscreenCapable && (
                  <ToolbarBtn
                    aria-label={fullscreen ? "전체화면 종료" : "전체화면"}
                    data-testid="chart-fullscreen-toggle"
                    onClick={() => {
                      if (!fullscreen) {
                        setSavedScrollY(window.scrollY);
                        setFullscreen(true);
                      } else {
                        setFullscreen(false);
                        window.scrollTo(0, savedScrollY);
                      }
                    }}
                  >
                    {fullscreen ? (
                      <Minimize2 className="h-3.5 w-3.5" aria-hidden />
                    ) : (
                      <Maximize2 className="h-3.5 w-3.5" aria-hidden />
                    )}
                    {fullscreen ? "전체화면 종료" : "전체화면"}
                  </ToolbarBtn>
                )}
              </div>
            )}
          </div>
        </div>
      )}
      {helpOpen && help && (
        <p
          className="mb-2 rounded border border-slate-800 bg-slate-950/80 p-2 text-xs leading-relaxed rx-text-secondary"
          data-testid="chart-help-panel"
        >
          {help}
        </p>
      )}
      {readout && (
        <div
          className="mb-2 rounded border border-slate-700/80 bg-slate-950/70 px-3 py-1.5 font-mono text-[12px] leading-relaxed rx-text-primary"
          data-testid="chart-ohlc-readout"
        >
          {readout}
        </div>
      )}
      {explore && (
        <p className="mb-1 text-xs text-sky-300/90" data-testid="chart-explore-hint">
          탐색 모드: 가로 드래그로 이동 · Ctrl+휠로 확대 · Esc 또는 바깥 클릭으로 종료
        </p>
      )}
      <div
        ref={setRef}
        className={`relative w-full select-none ${
          explore
            ? "cursor-grab touch-none active:cursor-grabbing"
            : "touch-pan-y"
        } ${fullscreen ? "min-h-0 flex-1" : ""}`}
        style={{ height: fullscreen ? "100%" : effectiveHeight }}
        onWheel={onWheel}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onDoubleClick={() => interactive && resetDefaultZoom()}
        onPointerLeave={() => {
          setCrosshair(null);
          setTooltip(null);
          onCrosshairX?.(null);
        }}
        data-testid="chart-plot-area"
      >
        {empty ? (
          <div className="flex h-full items-center justify-center text-sm rx-text-muted">
            {emptyLabel}
          </div>
        ) : (
          <svg
            width={width}
            height={fullscreen ? Math.max(plotH + PAD.top + PAD.bottom, 400) : effectiveHeight}
            className="overflow-visible"
          >
            <rect
              x={0}
              y={0}
              width={width}
              height={
                fullscreen
                  ? Math.max(plotH + PAD.top + PAD.bottom, 400)
                  : effectiveHeight
              }
              fill={CHART_THEME.background}
            />
            {children(ctx)}
            {displayCrosshair && interactive && (
              <g pointerEvents="none" data-testid="chart-crosshair">
                <line
                  x1={displayCrosshair.x}
                  x2={displayCrosshair.x}
                  y1={PAD.top}
                  y2={effectiveHeight - PAD.bottom}
                  stroke={CHART_THEME.crosshair}
                  strokeDasharray="3 3"
                  opacity={0.7}
                />
                <line
                  x1={PAD.left}
                  x2={width - PAD.right}
                  y1={displayCrosshair.y}
                  y2={displayCrosshair.y}
                  stroke={CHART_THEME.crosshair}
                  strokeDasharray="3 3"
                  opacity={0.55}
                />
              </g>
            )}
          </svg>
        )}
        {tooltip && !empty && (
          <div
            className="pointer-events-none absolute z-20 min-w-[228px] max-w-[min(300px,92%)] rounded-md border px-3 py-2.5 shadow-xl"
            style={{
              left: Math.max(
                8,
                Math.min(tooltip.x + 14, width - 240),
              ),
              top: Math.max(8, Math.min(tooltip.y - 8, effectiveHeight - 160)),
              background: CHART_THEME.tooltipBg,
              borderColor: CHART_THEME.tooltipBorder,
              color: CHART_THEME.tooltipText,
              fontVariantNumeric: "tabular-nums",
            }}
            data-testid="chart-tooltip"
          >
            {tooltip.header && (
              <div
                className="mb-2 border-b pb-2 text-[12px] font-semibold tracking-wide"
                style={{ borderColor: "#334155" }}
                data-testid="chart-tooltip-header"
              >
                {tooltip.header}
              </div>
            )}
            {tooltip.rows && tooltip.rows.length > 0 ? (
              <div className="flex flex-col gap-1.5" data-testid="chart-tooltip-rows">
                {tooltip.rows.map((row, i) => {
                  const valueColor =
                    row.tone === "up"
                      ? CHART_THEME.up
                      : row.tone === "down"
                        ? CHART_THEME.down
                        : row.tone === "accent"
                          ? CHART_THEME.accentAlt
                          : row.tone === "muted"
                            ? "#94a3b8"
                            : CHART_THEME.tooltipText;
                  return (
                    <div
                      key={`${row.label}-${i}`}
                      className="flex items-baseline justify-between gap-4 leading-snug"
                    >
                      <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-slate-400">
                        {row.swatch && (
                          <span
                            className="inline-block h-2 w-2 shrink-0 rounded-[2px]"
                            style={{ background: row.swatch }}
                            aria-hidden
                          />
                        )}
                        {row.label}
                      </span>
                      <span
                        className="text-[12px] font-semibold tracking-tight"
                        style={{ color: valueColor }}
                      >
                        {row.value}
                      </span>
                    </div>
                  );
                })}
              </div>
            ) : (
              (tooltip.lines ?? []).map((line) => (
                <div key={line} className="text-[12px] font-medium leading-relaxed">
                  {line}
                </div>
              ))
            )}
            {tooltip.footer && (
              <div
                className="mt-2 border-t pt-2 text-[11px] font-medium text-slate-400"
                style={{ borderColor: "#334155" }}
                data-testid="chart-tooltip-footer"
              >
                {tooltip.footer}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );

  return shell;
}
