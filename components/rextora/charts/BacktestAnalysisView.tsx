"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  buildVisualAnalysisModel,
  filterTrades,
  formatDurationMs,
  formatKoreanDateTime,
  formatPct,
  formatUsdt,
  ROLLING_WINDOW,
  type EnrichedTrade,
  type ExitCategoryBucket,
  type HoldingBucket,
  type VisualAnalysisModel,
} from "@/src/lib/rextora/backtest/visualAnalysis";
import { statusChips } from "@/src/lib/rextora/backtest/statusThresholds";
import { CandlestickChart, EquityCurveChart, DrawdownChart, BarChart, DistributionChart } from "@/components/rextora/charts";
import type { LevelLine, ZoneRect } from "@/src/lib/rextora/charts/types";
import { Badge, Button, Card, Metric } from "@/components/ui/primitives";
import { EmptyState } from "@/components/rextora/EmptyState";
import { CHART_THEME } from "@/src/lib/rextora/charts/theme";
import type { BacktestReport } from "@/src/lib/rextora/backtest/backtestTypes";
import type { BacktestTrade } from "@/src/lib/rextora/backtest/backtestEngine";
import type { OhlcvCandle } from "@/src/lib/rextora/data/ohlcvTypes";
import type { MonthlyCoverageRow } from "@/src/lib/rextora/backtest/monthlyCoverage";
import type { TradeEventTrace } from "@/src/lib/rextora/backtest/tradeEventTrace";
import { displayParamsHashLabel, displaySignalReason, displayTimeframeLabel } from "@/src/lib/rextora/displayLabels";
import { computeCostRatios } from "@/src/lib/rextora/backtest/costRatios";
import {
  ACCOUNT_EQUITY_IMPACT_LABEL_KO,
  computeMaxTradeLossStats,
  LEVERAGED_POSITION_PNL_LABEL_KO,
} from "@/src/lib/rextora/backtest/tradeLossSemantics";
import {
  classifyPatternOverlays,
  type PatternOverlayKind,
} from "@/src/lib/rextora/backtest/patternOverlayAvailability";
import type { BacktestEligibilityResult } from "@/src/lib/rextora/backtest/backtestEligibility";
import { SAMPLE_MIN_TRADES } from "@/src/lib/rextora/backtest/statusThresholds";
import {
  DRAWDOWN_BASIS_HELP_KO,
  DRAWDOWN_BASIS_TITLE_KO,
  EQUITY_BASIS_HELP_KO,
  EQUITY_BASIS_SUBTITLE_KO,
  EQUITY_BASIS_TITLE_KO,
} from "@/src/lib/rextora/backtest/equityBasis";
import { tradeFocusTimeRange } from "@/src/lib/rextora/backtest/tradeTime";

type TradeFilter = "all" | "long" | "short" | "win" | "loss" | "stop_loss" | "take_profit";
type TradeSort = "entry_asc" | "entry_desc" | "return_asc" | "return_desc" | "pnl_asc" | "pnl_desc" | "hold_asc" | "hold_desc";
type Tone = "default" | "success" | "danger" | "warning";

const FILTERS: Array<{ id: TradeFilter; label: string }> = [
  { id: "all", label: "전체" }, { id: "long", label: "롱" }, { id: "short", label: "숏" },
  { id: "win", label: "이익 거래" }, { id: "loss", label: "손실 거래" },
  { id: "stop_loss", label: "손절" }, { id: "take_profit", label: "익절" },
];
const SORTS: Array<{ id: TradeSort; label: string }> = [
  { id: "entry_desc", label: "진입 최신순" },
  { id: "entry_asc", label: "진입 오래된순" },
  { id: "return_desc", label: "수익률 높은순" },
  { id: "return_asc", label: "수익률 낮은순" },
  { id: "pnl_desc", label: "순손익 높은순" },
  { id: "pnl_asc", label: "순손익 낮은순" },
  { id: "hold_desc", label: "보유 긴순" },
  { id: "hold_asc", label: "보유 짧은순" },
];
const PAGE_SIZE = 50;
const SECTIONS = [
  { id: "summary", label: "요약" },
  { id: "price", label: "차트" },
  { id: "trades", label: "거래 목록" },
  { id: "monthly", label: "월별 성과" },
  { id: "cost", label: "비용" },
  { id: "equity", label: "자산·낙폭" },
  { id: "timeline", label: "타임라인" },
  { id: "advanced", label: "상세 분석" },
  { id: "validation", label: "검증" },
] as const;
const TRADE_PREVIEW_SIZE = 5;
const TRADE_HEADERS = [
  "거래번호", "코인", "방향", "진입 시간", "진입가", "청산 시간", "청산가", "보유", "수량", "레버리지",
  "순익 USDT", "수익률", "수수료", "슬리피지", "스프레드", "청산 사유",
] as const;

function CompactEmpty({ message, hint }: { message: string; hint?: string }) {
  return <EmptyState message={message} hint={hint} className="!py-6" />;
}

function HelpTitle({ title, help }: { title: string; help: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="mb-2">
      <div className="flex items-center gap-2">
        <h3 className="text-sm font-semibold text-slate-200">{title}</h3>
        <button type="button" className="grid h-8 w-8 place-items-center rounded-md border border-slate-700 text-xs rx-text-muted" aria-label={`${title} 도움말`} data-testid="chart-help" onClick={() => setOpen((v) => !v)}>?</button>
      </div>
      {open && <p className="mt-1 text-xs leading-relaxed rx-text-muted" data-testid="chart-help-panel">{help}</p>}
    </div>
  );
}

function SectionAnchor({ id, children }: { id: string; children: ReactNode }) {
  return <section id={`bt-${id}`} data-section={id} className="scroll-mt-20">{children}</section>;
}

function MetricsGrid({ items, cols = "md:grid-cols-3 lg:grid-cols-5" }: { items: Array<{ label: string; value: ReactNode; tone?: Tone; help?: string }>; cols?: string }) {
  return (
    <div className={`mb-4 grid grid-cols-2 gap-3 ${cols}`}>
      {items.map((m) => <Metric key={m.label} label={m.label} value={m.value} tone={m.tone} help={m.help} />)}
    </div>
  );
}

function FilterButtons<T extends string>({ options, value, onChange }: { options: ReadonlyArray<readonly [T, string]>; value: T; onChange: (v: T) => void }) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map(([id, label]) => (
        <Button key={id} size="sm" variant={value === id ? "primary" : "outline"} onClick={() => onChange(id)}>{label}</Button>
      ))}
    </div>
  );
}

function ShareBar({ label, count, pct, sub, color, testId }: { label: string; count: number; pct: number; sub: string; color: string; testId?: string }) {
  return (
    <div data-testid={testId}>
      <div className="mb-1 flex justify-between text-sm"><span className="text-slate-200">{label}</span><span className="rx-text-muted">{count}건 ({formatPct(pct, 1)})</span></div>
      <div className="mb-1 h-3 overflow-hidden rounded bg-slate-900"><div className="h-full" style={{ width: `${Math.max(2, pct * 100)}%`, background: color }} /></div>
      <div className="text-[11px] rx-text-muted">{sub}</div>
    </div>
  );
}

export function BacktestAnalysisView({
  report, trades, equityCurve, candles, chartSamplingApplied: samplingFromApi = false, processedCandleCount,
  backtestRunId = null,
  strategyType = null,
  eventSequenceFamily = null,
  eligibility = null,
  paperEligible = true,
  liveEligible = true,
  paperBlockReason = null,
  liveBlockReason = null,
  chartReproWarning = null,
  chartSource = null,
}: {
  report: BacktestReport; trades: BacktestTrade[]; equityCurve: number[]; candles: OhlcvCandle[];
  chartSamplingApplied?: boolean; processedCandleCount?: number;
  backtestRunId?: string | null;
  strategyType?: string | null;
  eventSequenceFamily?: string | null;
  eligibility?: BacktestEligibilityResult | null;
  paperEligible?: boolean;
  liveEligible?: boolean;
  paperBlockReason?: string | null;
  liveBlockReason?: string | null;
  chartReproWarning?: string | null;
  chartSource?: "persisted" | "legacy_remote_hydrate" | "live_run" | null;
}) {
  const model = useMemo(() => buildVisualAnalysisModel({ report, trades, equityCurve, candles }), [report, trades, equityCurve, candles]);
  const processed = processedCandleCount ?? report.processedCandleCount ?? report.candleCount;
  const hasProcessedCandles = processed > 0 && model.priceCandles.length > 0;
  const hasTrades = model.trades.length > 0;
  const [tradeFilter, setTradeFilter] = useState<TradeFilter>("all");
  const [tradeSort, setTradeSort] = useState<TradeSort>("entry_desc");
  const [selectedTradeId, setSelectedTradeId] = useState<string | null>(null);
  const [linkStatus, setLinkStatus] = useState<string | null>(null);
  const [tradeListExpanded, setTradeListExpanded] = useState(false);
  const [equityExpanded, setEquityExpanded] = useState(false);
  const [timelineExpanded, setTimelineExpanded] = useState(false);
  const [advancedExpanded, setAdvancedExpanded] = useState(false);
  const [validationDetailsOpen, setValidationDetailsOpen] = useState(false);
  const [extraMetricsOpen, setExtraMetricsOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [costToggles, setCostToggles] = useState({ fees: true, slippage: true, spread: true, funding: true, total: false });
  const [syncX, setSyncX] = useState<number | null>(null);
  const [drawerTrade, setDrawerTrade] = useState<EnrichedTrade | null>(null);
  const [techOpen, setTechOpen] = useState(false);
  const [activeSection, setActiveSection] = useState("summary");
  const [timelineRange, setTimelineRange] = useState<"all" | "7d" | "30d">("all");
  const [timelineSide, setTimelineSide] = useState<"all" | "long" | "short">("all");
  const [timelineResult, setTimelineResult] = useState<"all" | "win" | "loss">("all");
  const [showVolume, setShowVolume] = useState(true);
  const patternAvailability = useMemo(
    () =>
      classifyPatternOverlays({
        strategyType,
        eventSequenceFamily,
        traces: report.tradeEventTraces ?? [],
      }),
    [strategyType, eventSequenceFamily, report.tradeEventTraces],
  );
  const [overlayOpts, setOverlayOpts] = useState({
    entry: true,
    exit: true,
    stop: true,
    target: true,
    sequence: true,
    revisit: true,
    confirmation: true,
    invalidation: true,
    rejected: true,
  });
  const [patternToggleOverride, setPatternToggleOverride] = useState<
    Partial<Record<PatternOverlayKind, boolean>>
  >({});
  const patternToggleOn = useCallback(
    (kind: PatternOverlayKind) => {
      if (patternToggleOverride[kind] != null) return Boolean(patternToggleOverride[kind]);
      return patternAvailability.find((p) => p.kind === kind)?.defaultOn ?? false;
    },
    [patternToggleOverride, patternAvailability],
  );
  const rowRefs = useRef<Map<string, HTMLElement>>(new Map());
  const rootRef = useRef<HTMLDivElement>(null);
  const tracesById = useMemo(() => {
    const map = new Map<string, TradeEventTrace>();
    const list = report.tradeEventTraces ?? [];
    for (const t of list) map.set(t.tradeId, t);
    // Legacy runs: align by index when tradeId mismatches enriched T0001 ids.
    model.trades.forEach((tr, i) => {
      if (!map.has(tr.id) && list[i]) map.set(tr.id, list[i]!);
    });
    return map;
  }, [report.tradeEventTraces, model.trades]);
  const selectedTrace = selectedTradeId
    ? tracesById.get(selectedTradeId) ?? null
    : null;
  const selectedTrade = selectedTradeId
    ? model.trades.find((t) => t.id === selectedTradeId) ?? null
    : null;
  const focusTimeRange = useMemo(
    () => (selectedTrade ? tradeFocusTimeRange(selectedTrade) : null),
    [selectedTrade],
  );

  const costRatios = useMemo(
    () =>
      computeCostRatios({
        grossPnLBeforeCosts: report.costs.grossPnLBeforeCosts ?? 0,
        netPnLAfterCosts: report.costs.netPnLAfterCosts ?? 0,
        totalCostUsdt: report.costs.totalCostUsdt ?? 0,
        feeCostUsdt: report.costs.feeCostUsdt ?? 0,
        slippageCostUsdt: report.costs.slippageCostUsdt ?? 0,
      }),
    [report.costs],
  );
  const maxLossStats = useMemo(
    () => computeMaxTradeLossStats(model.trades, report.startingBalance),
    [model.trades, report.startingBalance],
  );

  const patternZones = useMemo((): ZoneRect[] => {
    const zones: ZoneRect[] = [];
    const pushZone = (trace: TradeEventTrace, color: string) => {
      if (
        trace.zoneHigh == null ||
        trace.zoneLow == null ||
        !Number.isFinite(trace.zoneHigh) ||
        !Number.isFinite(trace.zoneLow)
      ) {
        return;
      }
      const kind = (trace.patternType ?? "") as PatternOverlayKind;
      if (
        (kind === "order_block" ||
          kind === "fvg" ||
          kind === "support_resistance" ||
          kind === "trendline") &&
        !patternToggleOn(kind)
      ) {
        return;
      }
      const fromMs = trace.creationCandleTime
        ? Date.parse(trace.creationCandleTime)
        : trace.entry?.at
          ? Date.parse(trace.entry.at)
          : null;
      const toMs = trace.exit?.at
        ? Date.parse(trace.exit.at)
        : trace.revisitCandleTime
          ? Date.parse(trace.revisitCandleTime)
          : null;
      zones.push({
        high: trace.zoneHigh,
        low: trace.zoneLow,
        color,
        label: `${trace.patternType ?? "영역"}`,
        fromTime: fromMs != null && Number.isFinite(fromMs) ? fromMs : null,
        toTime: toMs != null && Number.isFinite(toMs) ? toMs : null,
        opacity: 0.22,
      });
    };
    if (selectedTrace) {
      pushZone(
        selectedTrace,
        selectedTrace.patternType === "fvg"
          ? "#a78bfa"
          : selectedTrace.patternType === "order_block"
            ? "#38bdf8"
            : "#94a3b8",
      );
    }
    return zones;
  }, [selectedTrace, patternToggleOn]);

  const patternLevels = useMemo((): LevelLine[] => {
    if (!selectedTrace) return [];
    const levels: LevelLine[] = [];
    if (overlayOpts.stop && selectedTrace.stopPrice != null) {
      levels.push({
        price: selectedTrace.stopPrice,
        color: "#f87171",
        label: "손절",
      });
    }
    if (overlayOpts.target && selectedTrace.targetPrice != null) {
      levels.push({
        price: selectedTrace.targetPrice,
        color: "#4ade80",
        label: "익절",
      });
    }
    const anchors = selectedTrace.lineAnchors;
    if (
      patternToggleOn("trendline") &&
      anchors &&
      anchors.length >= 2 &&
      selectedTrace.patternType === "trendline"
    ) {
      levels.push({
        price: anchors[0]!.price,
        endPrice: anchors[anchors.length - 1]!.price,
        color: "#fbbf24",
        label: "추세선",
        dashed: false,
      });
    }
    return levels;
  }, [selectedTrace, overlayOpts, patternToggleOn]);

  useEffect(() => {
    const nodes = rootRef.current?.querySelectorAll("[data-section]");
    if (!nodes?.length) return;
    const observer = new IntersectionObserver((entries) => {
      const visible = entries.filter((e) => e.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio);
      const id = (visible[0]?.target as HTMLElement | undefined)?.dataset.section;
      if (id) setActiveSection(id);
    }, { rootMargin: "-20% 0px -55% 0px", threshold: [0.1, 0.25, 0.5] });
    nodes.forEach((n) => observer.observe(n));
    return () => observer.disconnect();
  }, [hasTrades, hasProcessedCandles, report.symbol]);

  const filtered = useMemo(() => {
    let list = filterTrades(model.trades, tradeFilter);
    const q = search.trim().toUpperCase();
    if (q) list = list.filter((t) => t.id.includes(q) || t.symbol.includes(q));
    const sorted = [...list];
    sorted.sort((a, b) => {
      switch (tradeSort) {
        case "entry_asc":
          return Date.parse(String(a.entryTime ?? 0)) - Date.parse(String(b.entryTime ?? 0));
        case "entry_desc":
          return Date.parse(String(b.entryTime ?? 0)) - Date.parse(String(a.entryTime ?? 0));
        case "return_asc":
          return a.pnlPct - b.pnlPct;
        case "return_desc":
          return b.pnlPct - a.pnlPct;
        case "pnl_asc":
          return a.netPnlUsdt - b.netPnlUsdt;
        case "pnl_desc":
          return b.netPnlUsdt - a.netPnlUsdt;
        case "hold_asc":
          return a.holdMs - b.holdMs;
        case "hold_desc":
          return b.holdMs - a.holdMs;
        default:
          return 0;
      }
    });
    return sorted;
  }, [model.trades, tradeFilter, search, tradeSort]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount - 1);
  const pageRows = filtered.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE);

  useEffect(() => {
    if (!selectedTradeId) return;
    rowRefs.current.get(selectedTradeId)?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [selectedTradeId]);

  const markers = useMemo(() => {
    const ids = new Set(filtered.map((t) => t.id));
    return model.tradeMarkers.filter((m) => {
      if (m.tradeId && !ids.has(m.tradeId)) return false;
      const kind = m.kind;
      if ((kind === "entry_long" || kind === "entry_short") && !overlayOpts.entry) return false;
      if (kind === "exit" && !overlayOpts.exit) return false;
      if ((kind === "stop_loss" || kind === "trailing_stop") && !overlayOpts.stop) return false;
      if (kind === "take_profit" && !overlayOpts.target) return false;
      return true;
    });
  }, [model.tradeMarkers, filtered, overlayOpts]);

  const selectTrade = useCallback((id: string | null, source: "chart" | "list" | "clear" = "list") => {
    setSelectedTradeId(id);
    if (!id) {
      setDrawerTrade(null);
      setLinkStatus(null);
      return;
    }
    const trade = model.trades.find((x) => x.id === id) ?? null;
    setDrawerTrade(trade);
    setTechOpen(false);
    if (source === "chart") {
      setLinkStatus(`차트에서 선택한 거래 ${id}을 표시했습니다.`);
      setActiveSection("trades");
      requestAnimationFrame(() => {
        document.getElementById("bt-trades")?.scrollIntoView({ behavior: "smooth", block: "start" });
        rowRefs.current.get(id)?.scrollIntoView({ behavior: "smooth", block: "nearest" });
      });
    } else {
      setLinkStatus(`거래 ${id} 구간을 차트에 표시했습니다.`);
      setActiveSection("price");
      requestAnimationFrame(() => {
        document.getElementById("bt-price")?.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    }
  }, [model.trades]);

  useEffect(() => {
    const onForce = (ev: Event) => {
      const t = ev.target as HTMLElement | null;
      const id = t?.id?.replace(/^bt-/, "") ?? "";
      if (id === "equity") setEquityExpanded(true);
      if (id === "timeline") setTimelineExpanded(true);
      if (id === "advanced") setAdvancedExpanded(true);
      if (id === "validation") setValidationDetailsOpen(true);
      if (id === "trades") setTradeListExpanded(true);
    };
    const root = rootRef.current;
    root?.addEventListener("bt-force-expand", onForce);
    return () => root?.removeEventListener("bt-force-expand", onForce);
  }, []);

  const scrollToSection = (id: string) => {
    if (id === "equity") setEquityExpanded(true);
    if (id === "timeline") setTimelineExpanded(true);
    if (id === "advanced") setAdvancedExpanded(true);
    if (id === "validation") setValidationDetailsOpen(true);
    if (id === "trades") setTradeListExpanded(true);
    document.getElementById(`bt-${id}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
    setActiveSection(id);
  };

  const navigateTrade = (dir: -1 | 1) => {
    if (!drawerTrade) return;
    const idx = model.trades.findIndex((t) => t.id === drawerTrade.id);
    const next = model.trades[idx + dir];
    if (next) selectTrade(next.id, "list");
  };

  const chips = statusChips({ totalReturn: report.totalReturn, mdd: report.mdd, totalCostPctOfInitial: model.costs.totalCostPctOfInitialCapital, tradeCount: report.tradeCount });
  const netProfit = report.endingBalance - report.startingBalance;
  const dataSourceLabel = report.dataSource === "binance" ? "Binance Futures 과거 데이터" : "테스트용 합성 데이터";
  const samplingNote = samplingFromApi || model.chartSamplingApplied ? "차트 표시용 샘플링 적용 (지표·거래 계산은 전체 캔들 기준)" : null;
  const engineAssumptions = [
    ...(selectedTrace?.assumptionsKo ?? []),
    "완료 봉(OHLC) 기준으로 체결합니다.",
    "동일 봉에서 손절·익절이 모두 닿으면 손절을 우선합니다.",
  ];
  const rejectedSetups = report.rejectedSetups ?? [];
  const rejectedFromTraces = (report.tradeEventTraces ?? []).filter(
    (t) => t.rejectedReasonCode,
  );
  const monthlySeries = { id: "monthly", name: "월별 수익률 %", color: CHART_THEME.equity, data: model.monthlyReturns.map((m, i) => ({ x: i, y: m.returnPctOfInitial * 100, label: m.labelKo, color: m.returnPctOfInitial >= 0 ? CHART_THEME.up : CHART_THEME.down })) };
  const costSeries = useMemo(() => buildCostSeries(model, costToggles), [model, costToggles]);
  const costDominates = model.costs.totalCostUsdt > Math.abs(model.costs.netPnlAfterCostsUsdt) && model.costs.totalCostUsdt > 0;
  const bestHold = model.holdingTimeBuckets.reduce((a, b) => (b.avgReturnPct > a.avgReturnPct ? b : a), model.holdingTimeBuckets[0]);
  const costliestHold = model.holdingTimeBuckets.reduce((a, b) => (b.avgTotalCostUsdt > a.avgTotalCostUsdt ? b : a), model.holdingTimeBuckets[0]);
  const costParts = [
    { label: "수수료", v: model.costs.feeCostUsdt, c: CHART_THEME.accent },
    { label: "슬리피지", v: model.costs.slippageCostUsdt, c: CHART_THEME.warning },
    { label: "스프레드", v: model.costs.spreadCostUsdt, c: CHART_THEME.accent },
    { label: "펀딩비", v: model.costs.fundingCostUsdt, c: CHART_THEME.accentAlt },
  ];
  const costSum = costParts.reduce((s, p) => s + p.v, 0) || 1;
  const tfLabel = displayTimeframeLabel(report.timeframe);

  const worstLossTrade = model.trades.reduce<EnrichedTrade | null>((worst, t) => {
    if (!worst || t.pnlPct < worst.pnlPct) return t;
    return worst;
  }, null);
  const previewTradeRows = (() => {
    if (tradeListExpanded) return pageRows;
    const pick = new Map<string, EnrichedTrade>();
    if (selectedTradeId) {
      const sel = filtered.find((t) => t.id === selectedTradeId);
      if (sel) pick.set(sel.id, sel);
    }
    if (worstLossTrade) pick.set(worstLossTrade.id, worstLossTrade);
    for (const t of filtered) {
      if (pick.size >= TRADE_PREVIEW_SIZE) break;
      pick.set(t.id, t);
    }
    return [...pick.values()];
  })();
  const winCount = model.winLossSummary.wins;
  const lossCount = model.winLossSummary.losses;
  const hasEquity = model.equitySeries.data.length > 1;
  const simpleCostPct =
    costRatios.totalCostPctOfGrossProfit == null
      ? null
      : (costRatios.totalCostPctOfGrossProfit * 100).toFixed(1);
  const costVsNet =
    costRatios.netProfitAfterCosts !== 0
      ? Math.abs(costRatios.totalCostUsdt / costRatios.netProfitAfterCosts)
      : null;

  return (
    <div className="space-y-4 overflow-x-hidden" data-testid="backtest-analysis" ref={rootRef}>
      {report.zeroTradeDiagnostics && report.tradeCount === 0 && (
        <Card title="진단" data-testid="backtest-zero-trade">
          <p className="text-sm text-slate-300">{report.zeroTradeDiagnostics.explanationKo}</p>
        </Card>
      )}

      {chartReproWarning ? (
        <p
          className="rounded-lg border border-amber-500/50 bg-amber-950/40 px-3 py-2 text-sm text-amber-100"
          data-testid="chart-repro-warning"
        >
          {chartReproWarning}
        </p>
      ) : chartSource === "persisted" ? (
        <p className="text-[11px] text-emerald-300/80" data-testid="chart-repro-ok">
          저장된 차트 증거로 복원됨 (외부 API 불필요)
        </p>
      ) : null}

      <SectionAnchor id="summary">
        <Card title="핵심 성과" data-testid="backtest-summary">
          <div className="mb-3 flex flex-wrap gap-3 text-xs rx-text-muted">
            <span>데이터 출처: {dataSourceLabel}</span>
            <span>
              실제 캔들:{" "}
              {report.actualFirstCandleTime
                ? formatKoreanDateTime(new Date(report.actualFirstCandleTime).getTime())
                : "-"}{" "}
              ~{" "}
              {report.actualLastCandleTime
                ? formatKoreanDateTime(new Date(report.actualLastCandleTime).getTime())
                : "-"}
            </span>
            <span>처리 캔들: {processed.toLocaleString("ko-KR")}</span>
            {samplingNote && <span data-testid="chart-sampling-note">{samplingNote}</span>}
          </div>
          <div className="mb-3 flex flex-wrap gap-2" data-testid="status-chips">
            {chips.map((c) => (
              <Badge key={c.id} tone={c.tone}>
                {c.labelKo}
              </Badge>
            ))}
          </div>
          {eligibility && !eligibility.eligible ? (
            <p
              className="mb-3 rounded-lg border border-rose-500/40 bg-rose-950/30 px-3 py-2 text-sm text-rose-100"
              data-testid="summary-mdd-warning"
            >
              {eligibility.verdictLabel}
            </p>
          ) : null}
          {costRatios?.criticalCostOfGross ? (
            <p
              className="mb-3 rounded-lg border border-amber-500/40 bg-amber-950/30 px-3 py-2 text-sm text-amber-100"
              data-testid="summary-cost-warning"
            >
              거래비용이 총수익의 상당 부분을 차지합니다.
            </p>
          ) : null}
          <div data-testid="backtest-primary-metrics">
            <MetricsGrid
              cols="md:grid-cols-3 lg:grid-cols-3"
              items={[
                {
                  label: "순수익률",
                  value: formatPct(report.totalReturn),
                  tone: report.totalReturn >= 0 ? "success" : "danger",
                },
                { label: "최대 낙폭", value: formatPct(report.mdd), tone: "danger" },
                {
                  label: "순손익",
                  value: formatUsdt(netProfit),
                  tone: netProfit >= 0 ? "success" : "danger",
                },
                { label: "거래 수", value: report.tradeCount },
                { label: "승률", value: formatPct(report.winRate, 1) },
                {
                  label: "총거래비용",
                  value: formatUsdt(model.costs.totalCostUsdt),
                },
              ]}
            />
          </div>
          <div
            className="mt-2 rounded-lg border border-slate-800 bg-slate-950/40"
            data-testid="backtest-extra-metrics"
          >
            {!extraMetricsOpen ? (
              <button
                type="button"
                className="w-full px-3 py-2.5 text-left text-sm text-slate-200"
                data-testid="extra-metrics-summary"
                onClick={() => setExtraMetricsOpen(true)}
              >
                추가 성과 지표 · 손익비 {report.profitFactor.toFixed(2)} ·{" "}
                {ACCOUNT_EQUITY_IMPACT_LABEL_KO}{" "}
                {maxLossStats.accountEquityImpactPct == null
                  ? "—"
                  : formatPct(maxLossStats.accountEquityImpactPct)}{" "}
                · 자세히 보기
              </button>
            ) : (
              <div className="space-y-3 p-3">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-sm font-semibold text-slate-100">추가 성과 지표</h3>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setExtraMetricsOpen(false)}
                    data-testid="extra-metrics-collapse"
                  >
                    접기
                  </Button>
                </div>
                <MetricsGrid
                  cols="md:grid-cols-3"
                  items={[
                    { label: "최종 자산", value: formatUsdt(report.endingBalance) },
                    { label: "손익비", value: report.profitFactor.toFixed(2) },
                    {
                      label: ACCOUNT_EQUITY_IMPACT_LABEL_KO,
                      value:
                        maxLossStats.accountEquityImpactPct == null
                          ? "—"
                          : formatPct(maxLossStats.accountEquityImpactPct),
                      tone: "danger",
                    },
                    {
                      label: LEVERAGED_POSITION_PNL_LABEL_KO,
                      value:
                        maxLossStats.leveragedPnlPct == null
                          ? "—"
                          : formatPct(maxLossStats.leveragedPnlPct),
                      tone: "danger",
                      help: "레버리지가 반영된 포지션(증거금) 기준 손익률입니다.",
                    },
                    {
                      label: "적용 레버리지",
                      value:
                        maxLossStats.worstTradeLeverage == null
                          ? "—"
                          : `${maxLossStats.worstTradeLeverage.toFixed(2)}x`,
                    },
                    {
                      label: maxLossStats.labelKo,
                      value:
                        maxLossStats.accountEquityImpactPct == null
                          ? "—"
                          : formatPct(maxLossStats.accountEquityImpactPct),
                      tone: "danger",
                      help: maxLossStats.helpKo,
                    },
                  ]}
                />
                <p
                  className="text-xs rx-text-muted"
                  data-testid="max-loss-equity-impact"
                >
                  {ACCOUNT_EQUITY_IMPACT_LABEL_KO}:{" "}
                  {maxLossStats.accountEquityImpactPct == null
                    ? "—"
                    : formatPct(maxLossStats.accountEquityImpactPct)}
                </p>
              </div>
            )}
          </div>
        </Card>
      </SectionAnchor>

      <SectionAnchor id="price">
        <div data-testid="backtest-price-chart">
          <h2 className="mb-2 text-sm font-semibold text-slate-100">가격 차트</h2>
          <div
            className="mb-3 space-y-4 rounded-xl border border-slate-800 bg-slate-950/40 p-3 sm:p-4"
            data-testid="trade-overlay-toggles"
          >
            <div className="space-y-2">
              <p className="text-sm font-semibold text-slate-200">기본 표시</p>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                <label className="flex min-h-11 min-w-[7rem] items-center gap-2 text-sm text-slate-300">
                  <input
                    type="checkbox"
                    className="h-4 w-4"
                    checked={overlayOpts.entry}
                    onChange={() =>
                      setOverlayOpts((s) => ({
                        ...s,
                        entry: !s.entry,
                        exit: !s.entry,
                      }))
                    }
                  />
                  진입·청산
                </label>
                <label className="flex min-h-11 min-w-[7rem] items-center gap-2 text-sm text-slate-300">
                  <input
                    type="checkbox"
                    className="h-4 w-4"
                    checked={overlayOpts.stop}
                    onChange={() =>
                      setOverlayOpts((s) => ({
                        ...s,
                        stop: !s.stop,
                        target: !s.stop,
                      }))
                    }
                  />
                  손절·익절
                </label>
                <label
                  className="flex min-h-11 min-w-[7rem] items-center gap-2 text-sm text-slate-300"
                  title="거래량"
                >
                  <input
                    type="checkbox"
                    className="h-4 w-4"
                    checked={showVolume}
                    onChange={() => setShowVolume((v) => !v)}
                    data-testid="overlay-toggle-volume"
                  />
                  거래량
                </label>
              </div>
            </div>
            <div className="space-y-2 border-t border-slate-800/80 pt-3">
              <p className="text-sm font-semibold text-slate-200">
                기술 패턴
                <span className="ml-2 text-xs font-normal text-slate-500" data-testid="pattern-group-status">
                  {patternAvailability.every((p) => p.status === "strategy_unused")
                    ? "· 이 전략에서 사용하지 않음"
                    : patternAvailability.every((p) => p.status === "missing_geometry")
                      ? "· 저장된 도형 데이터 없음"
                      : patternAvailability.some((p) => p.status === "available")
                        ? "· 사용 가능"
                        : "· 표시 불가"}
                </span>
              </p>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                {patternAvailability.map((p) => (
                  <label
                    key={p.kind}
                    className={`flex min-h-11 min-w-[7rem] items-center gap-2 text-sm ${
                      p.status === "available"
                        ? "text-slate-300"
                        : "cursor-not-allowed text-slate-600"
                    }`}
                    title={p.reasonKo}
                    aria-disabled={p.status !== "available"}
                    data-testid={`overlay-toggle-${p.kind}`}
                  >
                    <input
                      type="checkbox"
                      className="h-4 w-4 disabled:opacity-40"
                      disabled={p.status !== "available"}
                      checked={patternToggleOn(p.kind)}
                      onChange={() =>
                        setPatternToggleOverride((s) => ({
                          ...s,
                          [p.kind]: !patternToggleOn(p.kind),
                        }))
                      }
                      aria-describedby={`overlay-reason-${p.kind}`}
                    />
                    {p.labelKo}
                    {p.status !== "available" ? (
                      <span
                        id={`overlay-reason-${p.kind}`}
                        className="sr-only"
                      >
                        {p.reasonKo}
                      </span>
                    ) : null}
                  </label>
                ))}
              </div>
            </div>
            <div className="space-y-2 border-t border-slate-800/80 pt-3">
              <p className="text-sm font-semibold text-slate-200">이벤트</p>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                <label className="flex min-h-11 min-w-[7rem] items-center gap-2 text-sm text-slate-300" title="재접촉">
                  <input
                    type="checkbox"
                    className="h-4 w-4"
                    checked={overlayOpts.revisit}
                    onChange={() =>
                      setOverlayOpts((s) => ({ ...s, revisit: !s.revisit }))
                    }
                  />
                  재접촉
                </label>
                <label className="flex min-h-11 min-w-[7rem] items-center gap-2 text-sm text-slate-300">
                  <input
                    type="checkbox"
                    className="h-4 w-4"
                    checked={overlayOpts.confirmation}
                    onChange={() =>
                      setOverlayOpts((s) => ({
                        ...s,
                        confirmation: !s.confirmation,
                      }))
                    }
                  />
                  확인
                </label>
                <label className="flex min-h-11 min-w-[7rem] items-center gap-2 text-sm text-slate-300">
                  <input
                    type="checkbox"
                    className="h-4 w-4"
                    checked={overlayOpts.invalidation}
                    onChange={() =>
                      setOverlayOpts((s) => ({
                        ...s,
                        invalidation: !s.invalidation,
                      }))
                    }
                  />
                  무효화
                </label>
                <label className="flex min-h-11 min-w-[7rem] items-center gap-2 text-sm text-slate-300">
                  <input
                    type="checkbox"
                    className="h-4 w-4"
                    checked={overlayOpts.rejected}
                    onChange={() =>
                      setOverlayOpts((s) => ({ ...s, rejected: !s.rejected }))
                    }
                    data-testid="overlay-toggle-rejected"
                  />
                  거부 셋업
                </label>
              </div>
            </div>
          </div>
          <div className="mb-2">
            <Button size="sm" variant="outline" onClick={() => selectTrade(null, "clear")}>
              선택 해제
            </Button>
          </div>
          {patternAvailability.some((p) => p.status !== "available") ? (
            <p
              className="mb-2 text-[11px] text-slate-500"
              data-testid="overlay-missing-geometry-note"
            >
              {patternAvailability.find((p) => p.status === "missing_geometry")
                ?.reasonKo ??
                patternAvailability.find((p) => p.status === "strategy_unused")
                  ?.reasonKo}
            </p>
          ) : null}
          {linkStatus ? (
            <p
              className="mb-2 rounded border border-sky-700/50 bg-sky-950/40 px-3 py-2 text-sm text-sky-100"
              data-testid="chart-trade-link-status"
              aria-live="polite"
            >
              {linkStatus}
            </p>
          ) : null}
          {hasProcessedCandles ? (
            <CandlestickChart
              title={`${report.symbol} · ${tfLabel}`}
              help="실제 OHLCV입니다. 일반 휠은 페이지 스크롤만 합니다. Ctrl+휠로 확대/축소합니다."
              candles={model.sampledPriceCandles}
              markers={markers}
              levels={patternLevels}
              zones={patternZones}
              height={600}
              showVolume={showVolume}
              selectedTradeId={selectedTradeId}
              onSelectTrade={(id) => selectTrade(id, "chart")}
              focusTimeRange={focusTimeRange}
              symbolLabel={report.symbol}
              timeframeLabel={tfLabel}
              strategyName={report.strategyName}
            />
          ) : (
            <p className="text-sm rx-text-muted" data-testid="price-chart-empty">
              이 실행에는 표시할 가격 캔들이 없습니다.
            </p>
          )}
        </div>
      </SectionAnchor>

      <SectionAnchor id="trades">
        {hasTrades ? (
          <Card title="거래 목록" data-testid="backtest-trade-list">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <input
                className="min-h-11 rounded border border-slate-700 bg-slate-950 px-3 py-2 text-sm"
                placeholder="거래번호 또는 심볼 검색"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(0);
                }}
                data-testid="trade-search"
              />
              <select
                className="min-h-11 rounded border border-slate-700 bg-slate-950 px-2 py-2 text-sm"
                value={tradeSort}
                onChange={(e) => setTradeSort(e.target.value as TradeSort)}
                data-testid="trade-sort"
              >
                {SORTS.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                  </option>
                ))}
              </select>
              <div className="flex flex-wrap gap-1">
                {FILTERS.map((f) => (
                  <Button
                    key={f.id}
                    size="sm"
                    variant={tradeFilter === f.id ? "primary" : "outline"}
                    onClick={() => {
                      setTradeFilter(f.id);
                      setPage(0);
                    }}
                  >
                    {f.label}
                  </Button>
                ))}
              </div>
              <span className="text-xs rx-text-muted">
                {filtered.length}건
                {tradeListExpanded
                  ? ` · ${safePage + 1}/${pageCount} 페이지`
                  : " · 미리보기"}
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1100px] text-left text-sm">
                <thead className="sticky top-0 bg-slate-950 rx-text-muted">
                  <tr>
                    {TRADE_HEADERS.map((h) => (
                      <th key={h} className="whitespace-nowrap px-2 py-2 font-medium">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {previewTradeRows.map((t) => (
                    <TradeTableRow
                      key={t.id}
                      t={t}
                      selected={selectedTradeId === t.id}
                      onSelect={() => selectTrade(t.id, "list")}
                      rowRef={(el) => {
                        if (el) rowRefs.current.set(t.id, el);
                      }}
                    />
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {!tradeListExpanded ? (
                <Button
                  size="sm"
                  variant="outline"
                  data-testid="trade-list-expand"
                  onClick={() => setTradeListExpanded(true)}
                >
                  전체 {filtered.length}개 거래 보기
                </Button>
              ) : (
                <>
                  <Button
                    size="sm"
                    variant="outline"
                    data-testid="trade-list-collapse"
                    onClick={() => setTradeListExpanded(false)}
                  >
                    미리보기로 접기
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={safePage === 0}
                    onClick={() => setPage((p) => Math.max(0, p - 1))}
                  >
                    이전
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={safePage >= pageCount - 1}
                    onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
                  >
                    다음
                  </Button>
                </>
              )}
            </div>
          </Card>
        ) : (
          <p className="text-sm rx-text-muted">표시할 거래가 없습니다.</p>
        )}
      </SectionAnchor>

      {hasTrades ? (
        <SectionAnchor id="monthly">
          <Card title="월별 성과" data-testid="backtest-monthly">
            <HelpTitle
              title="달력 월 집계"
              help="UTC 달력 월 기준으로 청산 시각을 묶어 시작 자본 대비 수익률을 계산합니다."
            />
            <MetricsGrid
              cols="sm:grid-cols-3 lg:grid-cols-7"
              items={[
                { label: "수익 월", value: model.monthlySummary.profitableMonths },
                { label: "손실 월", value: model.monthlySummary.losingMonths },
                {
                  label: "최고 월",
                  value: model.monthlySummary.bestMonth?.labelKo ?? "-",
                  help: formatPct(
                    model.monthlySummary.bestMonth?.returnPctOfInitial ?? 0,
                  ),
                },
                {
                  label: "최저 월",
                  value: model.monthlySummary.worstMonth?.labelKo ?? "-",
                  help: formatPct(
                    model.monthlySummary.worstMonth?.returnPctOfInitial ?? 0,
                  ),
                },
                {
                  label: "월평균 수익률",
                  value: formatPct(model.monthlySummary.avgMonthlyReturnPct),
                },
                {
                  label: "월별 표준편차",
                  value: formatPct(model.monthlySummary.stdMonthlyReturnPct),
                },
                {
                  label: "연속 손실 월",
                  value: model.monthlySummary.consecutiveLosingMonths,
                },
              ]}
            />
            <BarChart title="월별 수익률" series={monthlySeries} height={300} diverging />
          </Card>
        </SectionAnchor>
      ) : null}

      {hasTrades ? (
        <SectionAnchor id="cost">
          <Card title="비용 요약" data-testid="backtest-cost-analysis">
            <MetricsGrid
              cols="md:grid-cols-4"
              items={[
                {
                  label: "비용 전 총이익",
                  value: formatUsdt(costRatios.grossProfitBeforeCosts),
                },
                { label: "총 비용", value: formatUsdt(costRatios.totalCostUsdt) },
                {
                  label: "비용 후 순손익",
                  value: formatUsdt(costRatios.netProfitAfterCosts),
                  tone:
                    costRatios.netProfitAfterCosts >= 0 ? "success" : "danger",
                },
                {
                  label: "원장 일치",
                  value: costRatios.identityHolds ? "일치" : "확인 필요",
                  tone: costRatios.identityHolds ? "success" : "warning",
                  help: `${formatUsdt(costRatios.grossProfitBeforeCosts)} − ${formatUsdt(costRatios.totalCostUsdt)} = ${formatUsdt(costRatios.netProfitAfterCosts)}`,
                },
              ]}
            />
            {costRatios.criticalCostOfGross && simpleCostPct != null ? (
              <div
                className="mb-3 rounded-lg border border-rose-600/50 bg-rose-950/30 p-3 text-sm text-rose-50"
                data-testid="cost-critical-warning"
              >
                <p>거래비용이 총수익의 {simpleCostPct}%를 차지합니다.</p>
                <p className="mt-1">
                  수익 대부분이 수수료와 슬리피지로 줄어들었습니다.
                </p>
                {costVsNet != null && costVsNet > 1 ? (
                  <p className="mt-1 text-rose-100/90">
                    순수익보다 거래비용이 약 {costVsNet.toFixed(1)}배 큽니다.
                  </p>
                ) : null}
              </div>
            ) : null}
            <details className="text-sm text-slate-300">
              <summary className="cursor-pointer rx-text-muted">상세 비용 비율</summary>
              <div className="mt-2">
                <MetricsGrid
                  cols="md:grid-cols-4"
                  items={[
                    {
                      label: "비용/총이익",
                      value:
                        costRatios.totalCostPctOfGrossProfit == null
                          ? "—"
                          : formatPct(costRatios.totalCostPctOfGrossProfit, 1),
                    },
                    {
                      label: "비용/순손익",
                      value:
                        costRatios.totalCostPctOfNetProfit == null
                          ? "—"
                          : formatPct(costRatios.totalCostPctOfNetProfit, 1),
                    },
                    {
                      label: "수수료 비중",
                      value:
                        costRatios.feePctOfTotalCost == null
                          ? "—"
                          : formatPct(costRatios.feePctOfTotalCost, 1),
                    },
                    {
                      label: "슬리피지 비중",
                      value:
                        costRatios.slippagePctOfTotalCost == null
                          ? "—"
                          : formatPct(costRatios.slippagePctOfTotalCost, 1),
                    },
                  ]}
                />
                <div className="mb-2 flex h-4 overflow-hidden rounded">
                  {costParts.map((p) => (
                    <div
                      key={p.label}
                      style={{
                        width: `${(p.v / costSum) * 100}%`,
                        background: p.c,
                      }}
                      title={`${p.label} ${formatUsdt(p.v)}`}
                    />
                  ))}
                </div>
              </div>
            </details>
          </Card>
        </SectionAnchor>
      ) : null}

      <SectionAnchor id="equity">
        <Card title="자산·낙폭" data-testid="backtest-equity-section">
          {!equityExpanded ? (
            <button
              type="button"
              className="w-full text-left text-sm text-slate-200"
              data-testid="equity-collapse-summary"
              onClick={() => setEquityExpanded(true)}
            >
              최대 낙폭 {formatPct(report.mdd)} · {EQUITY_BASIS_SUBTITLE_KO} · 자세히 보기
            </button>
          ) : (
            <>
              <Button
                size="sm"
                variant="outline"
                className="mb-3"
                onClick={() => setEquityExpanded(false)}
              >
                접기
              </Button>
              {hasEquity ? (
                <div className="grid gap-4 xl:grid-cols-2">
                  <EquityCurveChart
                    title={EQUITY_BASIS_TITLE_KO}
                    help={`${EQUITY_BASIS_SUBTITLE_KO}. ${EQUITY_BASIS_HELP_KO}`}
                    series={model.equitySeries}
                    height={320}
                    unit="usdt"
                    syncCrosshairX={syncX}
                    onCrosshairX={setSyncX}
                  />
                  <DrawdownChart
                    title={DRAWDOWN_BASIS_TITLE_KO}
                    help={DRAWDOWN_BASIS_HELP_KO}
                    series={model.drawdownSeries}
                    height={320}
                    syncCrosshairX={syncX}
                    onCrosshairX={setSyncX}
                  />
                </div>
              ) : (
                <p className="text-sm rx-text-muted" data-testid="equity-empty">
                  이 실행에는 자산곡선 데이터가 없습니다.
                </p>
              )}
              <p
                className="mt-2 text-xs rx-text-muted"
                data-testid="equity-basis-note"
                title={EQUITY_BASIS_HELP_KO}
              >
                {EQUITY_BASIS_TITLE_KO} · {EQUITY_BASIS_SUBTITLE_KO}
              </p>
            </>
          )}
        </Card>
      </SectionAnchor>

      <SectionAnchor id="timeline">
        <Card title="거래 타임라인" data-testid="backtest-timeline">
          {!timelineExpanded ? (
            <button
              type="button"
              className="w-full text-left text-sm text-slate-200"
              onClick={() => setTimelineExpanded(true)}
            >
              {hasTrades
                ? `${model.timelineSummary.total}개 거래 · 평균 보유 ${formatDurationMs(model.timelineSummary.avgHoldMs)} · 자세히 보기`
                : "표시할 거래 구간이 없습니다."}
            </button>
          ) : (
            <>
              <Button
                size="sm"
                variant="outline"
                className="mb-3"
                onClick={() => setTimelineExpanded(false)}
              >
                접기
              </Button>
              {hasTrades ? (
                <>
                  <MetricsGrid
                    cols="sm:grid-cols-4 lg:grid-cols-7"
                    items={[
                      { label: "총 거래", value: model.timelineSummary.total },
                      { label: "롱", value: model.timelineSummary.longCount },
                      { label: "숏", value: model.timelineSummary.shortCount },
                      {
                        label: "평균 보유",
                        value: formatDurationMs(model.timelineSummary.avgHoldMs),
                      },
                      {
                        label: "중앙 보유",
                        value: formatDurationMs(
                          model.timelineSummary.medianHoldMs,
                        ),
                      },
                      {
                        label: "최장 보유",
                        value: formatDurationMs(model.timelineSummary.maxHoldMs),
                      },
                      {
                        label: "일평균 거래",
                        value: model.timelineSummary.tradesPerDay.toFixed(1),
                      },
                    ]}
                  />
                  <TimelineLanes
                    long={model.tradeTimelineGroups.long}
                    short={model.tradeTimelineGroups.short}
                    selectedId={selectedTradeId}
                    onSelect={(id) => selectTrade(id, "list")}
                    range={timelineRange}
                    sideFilter={timelineSide}
                    resultFilter={timelineResult}
                    domainStartMs={
                      model.ledgerRange.firstCandleMs ??
                      model.ledgerRange.firstEntryMs
                    }
                    domainEndMs={
                      model.ledgerRange.lastCandleMs ??
                      model.ledgerRange.lastExitMs
                    }
                  />
                </>
              ) : (
                <p className="text-sm rx-text-muted">표시할 거래 구간이 없습니다.</p>
              )}
            </>
          )}
        </Card>
      </SectionAnchor>

      <SectionAnchor id="advanced">
        <Card title="상세 분석" data-testid="backtest-advanced">
          {!advancedExpanded ? (
            <div className="space-y-1 text-sm text-slate-300">
              <p>
                거래 분포 · {report.tradeCount}개 거래 · 이익 {winCount}개 · 손실{" "}
                {lossCount}개
              </p>
              <p>
                보유시간 · 평균{" "}
                {formatDurationMs(model.timelineSummary.avgHoldMs)} · 중앙값{" "}
                {formatDurationMs(model.timelineSummary.medianHoldMs)}
              </p>
              <p className="rx-text-muted">
                롤링 지표 · 일부 구간에서 승률과 손익비가 급격히 악화됐을 수
                있습니다.
              </p>
              <Button
                size="sm"
                variant="outline"
                className="mt-2"
                data-testid="advanced-expand"
                onClick={() => setAdvancedExpanded(true)}
              >
                상세 분석 펼치기
              </Button>
            </div>
          ) : (
            <>
              <Button
                size="sm"
                variant="outline"
                className="mb-3"
                onClick={() => setAdvancedExpanded(false)}
              >
                접기
              </Button>
              {hasTrades ? (
                <div className="grid gap-4 xl:grid-cols-2" data-testid="backtest-distribution">
                  <Card title="손익·청산 분포">
                    <div className="space-y-3">
                      {model.exitCategoryBuckets.map((b) => (
                        <ExitBucketRow key={b.id} b={b} />
                      ))}
                    </div>
                  </Card>
                  <Card title="보유 시간 분석">
                    <div className="space-y-3">
                      {model.holdingTimeBuckets.map((b) => (
                        <HoldBucketRow
                          key={b.label}
                          b={b}
                          best={bestHold?.label}
                          costly={costliestHold?.label}
                        />
                      ))}
                    </div>
                  </Card>
                </div>
              ) : null}
              {hasTrades ? (
                <div className="mt-4 grid gap-4 lg:grid-cols-2">
                  <EquityCurveChart
                    title={`롤링 승률 (최근 ${ROLLING_WINDOW}거래)`}
                    series={{
                      id: "rw",
                      name: "승률 %",
                      color: CHART_THEME.up,
                      data: model.rollingWinRatePoints,
                    }}
                    height={280}
                    unit="percent"
                    area={false}
                  />
                  <EquityCurveChart
                    title={`롤링 손익비 (최근 ${ROLLING_WINDOW}거래)`}
                    series={{
                      id: "rpf",
                      name: "손익비",
                      color: CHART_THEME.accent,
                      data: model.rollingProfitFactorPoints,
                    }}
                    height={280}
                    unit="raw"
                    area={false}
                  />
                </div>
              ) : null}
              <div className="mt-4" data-testid="backtest-engine-assumptions">
                <p className="mb-1 text-sm font-medium text-slate-200">
                  백테스트 엔진 가정
                </p>
                <ul className="list-disc space-y-1 pl-4 text-xs rx-text-muted">
                  {engineAssumptions.map((a) => (
                    <li key={a}>{a}</li>
                  ))}
                </ul>
              </div>
              <p
                className="mt-3 text-sm rx-text-muted"
                data-testid="rejected-setups-empty"
              >
                {rejectedSetups.length === 0 && rejectedFromTraces.length === 0
                  ? strategyType === "safe_params" || !strategyType
                    ? "이 전략은 해당 패턴을 사용하지 않습니다."
                    : "거부된 셋업 없음"
                  : `거부 셋업 ${rejectedSetups.length + rejectedFromTraces.length}건`}
              </p>
            </>
          )}
        </Card>
      </SectionAnchor>

      {drawerTrade && (
        <TradeDetailDrawer
          trade={drawerTrade}
          trace={tracesById.get(drawerTrade.id) ?? null}
          candles={model.sampledPriceCandles}
          techOpen={techOpen}
          setTechOpen={setTechOpen}
          onPrev={() => navigateTrade(-1)}
          onNext={() => navigateTrade(1)}
          onFocusChart={() => scrollToSection("price")}
          onClose={() => {
            setDrawerTrade(null);
            setSelectedTradeId(null);
            setLinkStatus(null);
          }}
          onCopyId={() => {
            void navigator.clipboard?.writeText(drawerTrade.id);
          }}
        />
      )}

      <SectionAnchor id="validation">
        <Card title="검증 결과" data-testid="backtest-validation">
          <ValidationGrid
            report={report}
            processed={processed}
            backtestRunId={backtestRunId}
            eligibility={eligibility}
            sampleMin={SAMPLE_MIN_TRADES}
            paperEligible={paperEligible}
            liveEligible={liveEligible}
            paperBlockReason={paperBlockReason}
            liveBlockReason={liveBlockReason}
            hasTraceGeometry={patternAvailability.some(
              (p) => p.status === "available",
            )}
            hasRejectedTraces={
              rejectedSetups.length > 0 || rejectedFromTraces.length > 0
            }
            detailsOpen={validationDetailsOpen}
            onToggleDetails={() => setValidationDetailsOpen((v) => !v)}
          />
        </Card>
      </SectionAnchor>
    </div>
  );
}

function buildCostSeries(model: VisualAnalysisModel, costToggles: Record<string, boolean>) {
  const n = model.cumulativeCostPoints.total.length;
  const data = [];
  for (let i = 0; i < n; i += 1) {
    let y = 0;
    if (costToggles.total && !(costToggles.fees || costToggles.slippage || costToggles.spread || costToggles.funding)) y = model.cumulativeCostPoints.total[i]?.y ?? 0;
    else {
      if (costToggles.fees) y += model.cumulativeCostPoints.fees[i]?.y ?? 0;
      if (costToggles.slippage) y += model.cumulativeCostPoints.slippage[i]?.y ?? 0;
      if (costToggles.spread) y += model.cumulativeCostPoints.spread[i]?.y ?? 0;
      if (costToggles.funding) y += model.cumulativeCostPoints.funding[i]?.y ?? 0;
      if (costToggles.total) y = model.cumulativeCostPoints.total[i]?.y ?? y;
    }
    data.push({ x: model.cumulativeCostPoints.total[i]?.x ?? i, y });
  }
  return { id: "costs", name: "누적 비용 USDT", color: CHART_THEME.warning, data };
}

function ExitBucketRow({ b }: { b: ExitCategoryBucket }) {
  return (
    <ShareBar testId={`dist-cat-${b.id}`} label={b.labelKo} count={b.count} pct={b.pctOfTrades} color="#0ea5e9"
      sub={`평균 수익 ${formatPct(b.avgReturnPct)} · 평균 손익 ${formatUsdt(b.avgNetPnlUsdt)} · 평균 보유 ${formatDurationMs(b.avgHoldMs)}`} />
  );
}

function HoldBucketRow({ b, best, costly }: { b: HoldingBucket; best?: string; costly?: string }) {
  const highlight = b.label === best ? "border-emerald-700" : b.label === costly ? "border-amber-700" : "border-slate-800";
  return (
    <div className={`rounded border p-2 ${highlight}`} data-testid={`hold-bucket-${b.label}`}>
      <ShareBar label={b.label} count={b.count} pct={b.pctOfTrades} color="#8b5cf6"
        sub={`승률 ${formatPct(b.winRate, 1)} · 평균 수익 ${formatPct(b.avgReturnPct)} · 평균 손익 ${formatUsdt(b.avgNetPnlUsdt)} · 평균 비용 ${formatUsdt(b.avgTotalCostUsdt)}`} />
    </div>
  );
}

function TradeTableRow({ t, selected, onSelect, rowRef }: { t: EnrichedTrade; selected: boolean; onSelect: () => void; rowRef: (el: HTMLTableRowElement | null) => void }) {
  const pnlCls = t.netPnlUsdt >= 0 ? "text-emerald-300" : "text-rose-300";
  return (
    <tr ref={rowRef} className={`cursor-pointer border-t border-slate-900 ${selected ? "bg-sky-950/40" : "hover:bg-slate-900/50"}`} data-testid="trade-row" data-trade-id={t.id} onClick={onSelect}>
      <td className="px-2 py-2 font-mono text-xs">{t.id}</td>
      <td className="px-2 py-2">{t.symbol}</td>
      <td className="px-2 py-2"><Badge tone={t.side === "LONG" ? "success" : "danger"}>{t.side === "LONG" ? "롱" : "숏"}</Badge></td>
      <td className="whitespace-nowrap px-2 py-2 text-xs">{formatKoreanDateTime(t.entryTime)}</td>
      <td className="px-2 py-2">{t.entryPrice.toLocaleString("ko-KR")}</td>
      <td className="whitespace-nowrap px-2 py-2 text-xs">{formatKoreanDateTime(t.exitTime)}</td>
      <td className="px-2 py-2">{t.exitPrice.toLocaleString("ko-KR")}</td>
      <td className="px-2 py-2 text-xs">{formatDurationMs(t.holdMs)}</td>
      <td className="px-2 py-2 text-xs">{t.quantity.toFixed(4)}</td>
      <td className="px-2 py-2">{t.leverage.toFixed(2)}</td>
      <td className={`px-2 py-2 ${pnlCls}`}>{formatUsdt(t.netPnlUsdt)}</td>
      <td className={`px-2 py-2 ${t.pnlPct >= 0 ? "text-emerald-300" : "text-rose-300"}`}>{formatPct(t.pnlPct)}</td>
      <td className="px-2 py-2 text-xs">{formatUsdt(t.feeCostUsdt)}</td>
      <td className="px-2 py-2 text-xs">{formatUsdt(t.slippageCostUsdt)}</td>
      <td className="px-2 py-2 text-xs">{formatUsdt(t.spreadCostUsdt)}</td>
      <td className="px-2 py-2 text-xs">{displaySignalReason(t.exitReason)}</td>
    </tr>
  );
}

function TradeEventTracePanel({ trace }: { trace: TradeEventTrace }) {
  return (
    <div
      className="mt-3 rounded-xl border border-sky-700/40 bg-sky-950/20 p-4"
      data-testid="trade-event-trace"
    >
      <h4 className="mb-2 text-sm font-semibold text-sky-100">거래 이벤트 추적</h4>
      {trace.patternType ? (
        <p className="mb-2 text-xs text-sky-200/90">
          패턴 {trace.patternType}
          {trace.zoneHigh != null && trace.zoneLow != null
            ? ` · 존 ${trace.zoneLow}–${trace.zoneHigh}`
            : ""}
          {trace.penetrationPct != null
            ? ` · 침투 ${(trace.penetrationPct * 100).toFixed(0)}%`
            : ""}
        </p>
      ) : null}
      {trace.zoneHigh == null || trace.zoneLow == null ? (
        <p
          className="mb-2 text-xs text-amber-200/90"
          data-testid="trade-geometry-missing"
        >
          이 거래 기록에는 영역 좌표가 저장되지 않았습니다.
        </p>
      ) : (
        <p className="mb-2 text-xs text-sky-200/80" data-testid="trade-geometry-present">
          영역 좌표가 저장되어 차트에 사각형 존으로 표시됩니다.
        </p>
      )}
      <ol className="mb-3 space-y-1.5 border-l border-sky-800 pl-3 text-sm text-slate-200" data-testid="trade-event-timeline">
        {trace.events.map((e, i) => (
          <li key={`${e.kind}-${i}`}>
            <span className="font-medium text-slate-100">{e.labelKo}</span>
            {e.price != null ? ` @ ${e.price}` : ""}
            {e.at ? ` · ${formatKoreanDateTime(Date.parse(e.at))}` : ""}
            {e.detailKo ? (
              <span className="block text-xs rx-text-muted">{e.detailKo}</span>
            ) : null}
          </li>
        ))}
      </ol>
      <div className="space-y-1 text-xs text-slate-300">
        <p>진입 사유: {trace.whyEnteredKo}</p>
        <p>청산 사유: {trace.whyExitedKo}</p>
        <p>비용: {trace.feeSlippageImpactKo}</p>
        {trace.assumptionsKo.map((a) => (
          <p key={a} className="rx-text-muted">
            {a}
          </p>
        ))}
      </div>
    </div>
  );
}

function TradeDetailDrawer({ trade, trace, candles, techOpen, setTechOpen, onPrev, onNext, onFocusChart, onClose, onCopyId }: {
  trade: EnrichedTrade;
  trace: TradeEventTrace | null;
  candles: Array<{ time: number; open: number; high: number; low: number; close: number }>;
  techOpen: boolean; setTechOpen: (v: boolean | ((p: boolean) => boolean)) => void;
  onPrev: () => void; onNext: () => void; onFocusChart: () => void; onClose: () => void; onCopyId: () => void;
}) {
  const hasSl = trade.stopLoss != null && trade.stopLoss > 0;
  const hasTp = trade.takeProfit != null && trade.takeProfit > 0;
  const waterfall = [
    { label: "총손익", v: trade.grossPnlUsdt }, { label: "수수료", v: -trade.feeCostUsdt }, { label: "슬리피지", v: -trade.slippageCostUsdt },
    { label: "스프레드", v: -trade.spreadCostUsdt }, { label: "펀딩비", v: -trade.fundingCostUsdt }, { label: "순손익", v: trade.netPnlUsdt },
  ];
  const recon = trade.grossPnlUsdt - trade.feeCostUsdt - trade.slippageCostUsdt - trade.spreadCostUsdt - trade.fundingCostUsdt;
  const reconOk = Math.abs(recon - trade.netPnlUsdt) < 0.05;
  const mini = useMemo(() => {
    if (!trade.entryTime || !trade.exitTime || !candles.length) return [];
    const padMs = Math.max(trade.holdMs * 0.5, 60 * 60_000);
    return candles.filter((c) => c.time >= trade.entryTime! - padMs && c.time <= trade.exitTime! + padMs).slice(0, 120);
  }, [candles, trade]);

  return (
    <div className="fixed inset-y-0 right-0 z-40 w-full max-w-xl overflow-y-auto border-l border-slate-800 bg-slate-950 p-4 shadow-xl sm:max-w-lg md:max-w-xl" data-testid="trade-drawer" role="dialog" aria-label="거래 상세">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <h3 className="text-lg font-semibold rx-text-primary">{trade.id}</h3>
        <Badge>{trade.symbol}</Badge>
        <Badge tone={trade.side === "LONG" ? "success" : "danger"}>{trade.side === "LONG" ? "롱" : "숏"}</Badge>
        <Badge tone={trade.profitable ? "success" : "danger"}>{trade.profitable ? "이익" : "손실"}</Badge>
        <Badge>{displaySignalReason(trade.exitReason)}</Badge>
      </div>
      <MetricsGrid cols="grid-cols-3" items={[
        { label: "순손익", value: formatUsdt(trade.netPnlUsdt), tone: trade.netPnlUsdt >= 0 ? "success" : "danger" },
        { label: "수익률", value: formatPct(trade.pnlPct) }, { label: "보유", value: formatDurationMs(trade.holdMs) },
      ]} />
      <div className="mb-4" data-testid="trade-mini-chart">
        <h4 className="mb-2 text-sm font-medium rx-text-primary">미니 차트</h4>
        {mini.length ? <MiniTradeChart candles={mini} trade={trade} hasSl={hasSl} hasTp={hasTp} /> : <p className="rx-text-muted text-xs">표시할 캔들 구간이 없습니다.</p>}
        <div className="mt-1 text-[11px] rx-text-muted">손절: {hasSl ? trade.stopLoss.toLocaleString("ko-KR") : "기록 없음"} · 익절: {hasTp ? trade.takeProfit.toLocaleString("ko-KR") : "기록 없음"}</div>
      </div>
      <div className="mb-4" data-testid="trade-pnl-waterfall">
        <h4 className="mb-2 text-sm font-medium rx-text-primary">손익 분해</h4>
        <div className="space-y-1">{waterfall.map((row) => (
          <div key={row.label} className="flex items-center justify-between text-sm"><span className="rx-text-secondary">{row.label}</span><span className={row.v >= 0 ? "rx-text-positive" : "rx-text-negative"}>{formatUsdt(row.v)}</span></div>
        ))}</div>
        <p className="mt-1 text-[11px] rx-text-muted">장부 합산: {reconOk ? "일치" : "확인 필요"} (Δ {formatUsdt(Math.abs(recon - trade.netPnlUsdt))})</p>
      </div>
      <div className="mb-4 grid grid-cols-2 gap-2" data-testid="trade-position-cards">
        <Metric label="진입가" value={trade.entryPrice.toLocaleString("ko-KR")} />
        <Metric label="청산가" value={trade.exitPrice.toLocaleString("ko-KR")} />
        <Metric label="수량" value={trade.quantity.toFixed(6)} />
        <Metric label="명목가치" value={formatUsdt(trade.entryPrice * trade.quantity)} />
        <Metric label="레버리지" value={String(trade.leverage)} />
        <Metric label="증거금" value={formatUsdt(trade.marginUsdt)} />
      </div>
      <div className="mb-4" data-testid="trade-lifecycle">
        <h4 className="mb-2 text-sm font-medium rx-text-primary">거래 생명주기</h4>
        {trace ? (
          <TradeEventTracePanel trace={trace} />
        ) : (
          <ol className="space-y-2 border-l border-slate-700 pl-3 text-sm rx-text-secondary">
            <li>신호 · {trade.signalType}</li>
            <li>진입 · {formatKoreanDateTime(trade.entryTime)}</li>
            <li>보유 · {formatDurationMs(trade.holdMs)}</li>
            <li>청산 · {displaySignalReason(trade.exitReason)} · {formatKoreanDateTime(trade.exitTime)}</li>
            <li>최종 · {formatUsdt(trade.netPnlUsdt)} ({formatPct(trade.pnlPct)})</li>
          </ol>
        )}
      </div>
      <div className="mb-4 text-sm rx-text-secondary">
        <h4 className="mb-1 font-medium rx-text-primary">전략 설명</h4>
        <div>진입 신호: {trade.signalType}</div>
        <div>청산 사유: {displaySignalReason(trade.exitReason)}</div>
      </div>
      <div className="mb-4">
        <button type="button" className="text-sky-300 underline" onClick={() => setTechOpen((v) => !v)}>기술 세부정보 {techOpen ? "접기" : "펼치기"}</button>
        {techOpen && <div className="mt-1 text-xs rx-text-muted">진입봉 #{trade.entryBar} · 청산봉 #{trade.exitBar} · 보유봉 {trade.holdBars ?? "-"} · ID {trade.id}</div>}
      </div>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="outline" onClick={onPrev}>이전 거래</Button>
        <Button size="sm" variant="outline" onClick={onNext}>다음 거래</Button>
        <Button size="sm" variant="outline" onClick={onFocusChart}>차트 포커스</Button>
        <Button size="sm" variant="outline" onClick={onCopyId}>ID 복사</Button>
        <Button size="sm" variant="outline" onClick={onClose}>닫기</Button>
      </div>
    </div>
  );
}

function MiniTradeChart({ candles, trade, hasSl, hasTp }: { candles: Array<{ time: number; open: number; high: number; low: number; close: number }>; trade: EnrichedTrade; hasSl: boolean; hasTp: boolean }) {
  const w = 420; const h = 160; const pad = { t: 8, r: 8, b: 20, l: 40 };
  const lows = candles.map((c) => c.low); const highs = candles.map((c) => c.high);
  if (hasSl) lows.push(trade.stopLoss); if (hasTp) highs.push(trade.takeProfit);
  const min = Math.min(...lows); const max = Math.max(...highs);
  const x = (i: number) => pad.l + (i / Math.max(1, candles.length - 1)) * (w - pad.l - pad.r);
  const y = (p: number) => pad.t + (1 - (p - min) / (max - min || 1)) * (h - pad.t - pad.b);
  const entryI = candles.findIndex((c) => trade.entryTime != null && c.time >= trade.entryTime);
  const exitI = candles.findIndex((c) => trade.exitTime != null && c.time >= trade.exitTime);
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="h-40 w-full">
      {candles.map((c, i) => {
        const up = c.close >= c.open; const cx = x(i);
        return (<g key={c.time}><line x1={cx} x2={cx} y1={y(c.high)} y2={y(c.low)} stroke={up ? CHART_THEME.up : CHART_THEME.down} /><rect x={cx - 2} y={Math.min(y(c.open), y(c.close))} width={4} height={Math.max(1, Math.abs(y(c.close) - y(c.open)))} fill={up ? CHART_THEME.up : CHART_THEME.down} /></g>);
      })}
      {entryI >= 0 && <circle cx={x(entryI)} cy={y(trade.entryPrice)} r={5} fill={CHART_THEME.entryLong} data-testid="mini-entry-marker" />}
      {exitI >= 0 && <circle cx={x(Math.max(exitI, 0))} cy={y(trade.exitPrice)} r={5} fill={CHART_THEME.exit} data-testid="mini-exit-marker" />}
      {hasSl && <line x1={pad.l} x2={w - pad.r} y1={y(trade.stopLoss)} y2={y(trade.stopLoss)} stroke={CHART_THEME.stopLoss} strokeDasharray="4 3" />}
      {hasTp && <line x1={pad.l} x2={w - pad.r} y1={y(trade.takeProfit)} y2={y(trade.takeProfit)} stroke={CHART_THEME.takeProfit} strokeDasharray="4 3" />}
    </svg>
  );
}

function ValidationGrid({
  report,
  processed,
  backtestRunId,
  eligibility,
  sampleMin,
  paperEligible,
  liveEligible,
  paperBlockReason,
  liveBlockReason,
  hasTraceGeometry,
  hasRejectedTraces,
  detailsOpen = false,
  onToggleDetails,
}: {
  report: BacktestReport;
  processed: number;
  backtestRunId: string | null;
  eligibility: BacktestEligibilityResult | null;
  sampleMin: number;
  paperEligible: boolean;
  liveEligible: boolean;
  paperBlockReason: string | null;
  liveBlockReason: string | null;
  hasTraceGeometry: boolean;
  hasRejectedTraces: boolean;
  detailsOpen?: boolean;
  onToggleDetails?: () => void;
}) {
  type Status = "pass" | "fail" | "warning" | "unavailable";
  type Item = {
    title: string;
    status: Status;
    value: string;
    explain: string;
  };
  const mddOk =
    eligibility != null
      ? !eligibility.reasons.some((r) => r.code === "maximum_drawdown_exceeded")
      : Math.abs(report.mdd) <= 0.2;
  const sampleOk = report.tradeCount >= sampleMin;
  const reqDay = report.requestedTo?.slice(0, 10) ?? null;
  const actDay =
    report.actualLastCandleTime?.slice(0, 10) ?? report.toDate ?? null;
  const futureOk = !reqDay || !actDay || reqDay <= actDay;
  const badge = (s: Status) =>
    s === "pass" ? "통과" : s === "fail" ? "실패" : s === "warning" ? "경고" : "불가";
  const tone = (s: Status): Tone =>
    s === "pass" ? "success" : s === "fail" ? "danger" : s === "warning" ? "warning" : "default";
  const cards: Array<{ group: string; items: Item[] }> = [
    {
      group: "전략",
      items: [
        {
          title: "전략 신원 일치",
          status: report.strategyId && report.strategyHash ? "pass" : "fail",
          value: `${report.strategyId} · ${report.strategyHash?.slice(0, 12) ?? "-"}`,
          explain: "저장된 전략 ID·해시입니다.",
        },
        {
          title: "파라미터 해시 검증",
          status: report.validation.paramsHashVerified ? "pass" : "warning",
          value: report.validation.paramsHashVerified ? "검증됨" : "확인 필요",
          explain: "보호 전략 파라미터 해시가 저장된 값과 일치하는지 확인합니다.",
        },
        {
          title: "SAFE 무결성",
          status:
            report.strategyId === "SAFE_v44_i4060"
              ? report.strategyHash?.startsWith("7893ca3f0e30")
                ? "pass"
                : "fail"
              : "pass",
          value:
            report.strategyId === "SAFE_v44_i4060"
              ? report.strategyHash?.slice(0, 12) ?? "-"
              : "비SAFE 실행(해당 없음)",
          explain: "SAFE 원본 해시 7893ca3f0e30 무결성입니다.",
        },
      ],
    },
    {
      group: "데이터",
      items: [
        {
          title: "백테스트 실행 ID",
          status: backtestRunId ? "pass" : "unavailable",
          value: backtestRunId ?? "데이터 없음",
          explain: "저장된 백테스트 실행 ID입니다. 전략 ID와 별도로 표시됩니다.",
        },
        {
          title: "요청 기간",
          status: report.fromDate || report.requestedFrom ? "pass" : "unavailable",
          value: `${report.requestedFrom?.slice(0, 10) ?? report.fromDate ?? "-"} ~ ${report.requestedTo?.slice(0, 10) ?? report.toDate ?? "-"}`,
          explain: "요청한 조회 기간입니다.",
        },
        {
          title: "실제 캔들 범위",
          status: report.actualFirstCandleTime ? "pass" : "unavailable",
          value: `${report.actualFirstCandleTime?.slice(0, 16) ?? "-"} ~ ${report.actualLastCandleTime?.slice(0, 16) ?? "-"}`,
          explain: "실제로 로드된 첫·마지막 캔들 시각입니다.",
        },
        {
          title: "처리 캔들 수",
          status: processed > 0 ? "pass" : "fail",
          value: processed.toLocaleString("ko-KR"),
          explain: "엔진이 처리한 캔들 개수입니다.",
        },
        {
          title: "타임프레임",
          status: report.timeframe ? "pass" : "unavailable",
          value: displayTimeframeLabel(report.timeframe),
          explain: "요청·처리 타임프레임입니다.",
        },
        {
          title: "미래 데이터 차단",
          status: futureOk ? "pass" : "fail",
          value: futureOk ? "정상" : "미래 구간 의",
          explain: "종료일이 미래 달력이면 실행이 거부됩니다.",
        },
      ],
    },
    {
      group: "비용",
      items: [
        {
          title: "수수료 설정",
          status: report.validation.feesApplied ? "pass" : "warning",
          value: report.validation.feesApplied ? "적용" : "미적용",
          explain: "수수료가 시뮬레이션에 반영되었는지입니다.",
        },
        {
          title: "슬리피지 설정",
          status: report.validation.slippageApplied ? "pass" : "warning",
          value: report.validation.slippageApplied ? "적용" : "미적용",
          explain: "슬리피지 반영 여부입니다.",
        },
        {
          title: "스프레드 설정",
          status: "pass",
          value: report.validation.spreadApplied ? "적용" : "미적용(설정)",
          explain: "스프레드 옵션 적용 여부입니다.",
        },
        {
          title: "펀딩비 설정",
          status: "pass",
          value: report.validation.fundingApplied ? "적용" : "미적용(설정)",
          explain: "펀딩비 옵션 적용 여부입니다.",
        },
        {
          title: "비용 민감도",
          status: report.costStress?.length ? "pass" : "warning",
          value: report.costStress?.length
            ? `${report.costStress.length}개 배수`
            : "미기록",
          explain: "비용 배수 스트레스 결과 존재 여부입니다.",
        },
      ],
    },
    {
      group: "자격",
      items: [
        {
          title: "거래 수 신뢰도",
          status: sampleOk ? "pass" : "fail",
          value: `${report.tradeCount} / 최소 ${sampleMin}`,
          explain: "최소 거래 수 기준입니다.",
        },
        {
          title: "최대 낙폭 한도",
          status: mddOk ? "pass" : "fail",
          value: `${formatPct(report.mdd)} · 한도 ${formatPct(-(eligibility?.maxAllowedMddAbs ?? 0.2))}`,
          explain: "구성된 최대 허용 낙폭과 비교합니다.",
        },
        {
          title: "차트 근거 데이터",
          status: hasTraceGeometry
            ? "pass"
            : report.tradeEventTraces?.length
              ? "warning"
              : "unavailable",
          value: hasTraceGeometry
            ? "패턴 geometry 있음"
            : report.tradeEventTraces?.length
              ? "이벤트 기록만 있음"
              : "없음",
          explain: "차트 패턴 오버레이에 필요한 저장 geometry입니다.",
        },
        {
          title: "거부 셋업 기록",
          status: hasRejectedTraces ? "pass" : "unavailable",
          value: hasRejectedTraces ? "있음" : "없음",
          explain: "이벤트 시퀀스 거부 기록이 저장된 경우만 통과입니다.",
        },
        {
          title: "모의매매 자격",
          status: paperEligible ? "pass" : "fail",
          value: paperEligible ? "가능" : (paperBlockReason ?? "차단"),
          explain: "백테스트 게이트를 통과해야 모의 등록이 가능합니다.",
        },
        {
          title: "실전 후보 자격",
          status: liveEligible ? "pass" : "fail",
          value: liveEligible ? "가능" : (liveBlockReason ?? "차단"),
          explain: "백테스트·모의 게이트를 통과해야 실전 후보 등록이 가능합니다.",
        },
        {
          title: "실주문 차단",
          status: report.validation.noRealOrders === true ? "pass" : "fail",
          value: "주문 없음",
          explain: "백테스트는 실주문을 생성하지 않습니다.",
        },
        {
          title: displayParamsHashLabel(),
          status: report.validation.paramsHashVerified ? "pass" : "warning",
          value: report.strategyHash?.slice(0, 12) ?? "-",
          explain: "파라미터 해시 검증 결과입니다.",
        },
      ],
    },
  ];
  const allItems = cards.flatMap((g) => g.items);
  const counts = {
    pass: allItems.filter((i) => i.status === "pass").length,
    fail: allItems.filter((i) => i.status === "fail").length,
    warning: allItems.filter((i) => i.status === "warning").length,
    unavailable: allItems.filter((i) => i.status === "unavailable").length,
  };
  const primaryFail =
    allItems.find((i) => i.status === "fail")?.title ??
    eligibility?.verdictLabel ??
    null;
  return (
    <div className="space-y-3" data-testid="validation-summary">
      <div className="rounded-lg border border-slate-700 bg-slate-950/60 p-3">
        <p className="text-sm font-medium text-slate-100">
          통과 {counts.pass} · 실패 {counts.fail} · 경고 {counts.warning}
          {counts.unavailable > 0 ? ` · 확인 불가 ${counts.unavailable}` : ""}
        </p>
        {primaryFail ? (
          <p className="mt-1 text-sm text-rose-200">주요 실패: {primaryFail}</p>
        ) : (
          <p className="mt-1 text-sm text-emerald-200">주요 실패 없음</p>
        )}
        <Button
          size="sm"
          variant="outline"
          className="mt-2"
          data-testid="validation-details-toggle"
          onClick={() => onToggleDetails?.()}
        >
          {detailsOpen ? "상세 검증 접기" : "상세 검증 보기"}
        </Button>
      </div>
      {detailsOpen ? (
        <div className="space-y-4" data-testid="validation-details">
          {cards.map((g) => (
            <div key={g.group}>
              <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide rx-text-muted">
                {g.group} 검증
              </h4>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {g.items.map((item) => (
                  <div
                    key={item.title}
                    className="rounded-lg border border-slate-800 bg-slate-950/50 p-3"
                    data-testid={`validation-card-${item.title}`}
                  >
                    <div className="mb-1 flex items-center gap-2">
                      <span className="text-sm font-medium text-slate-200">
                        {item.title}
                      </span>
                      <Badge tone={tone(item.status)}>{badge(item.status)}</Badge>
                    </div>
                    <div className="truncate text-xs text-slate-300">{item.value}</div>
                    <p className="mt-1 text-[11px] rx-text-muted">{item.explain}</p>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function MonthlyCoveragePanel({ rows, lastExitMs, candleEndMs }: { rows: MonthlyCoverageRow[]; lastExitMs: number | null; candleEndMs: number | null }) {
  if (!rows.length) return null;
  const laterEmpty = rows.filter((r) => lastExitMs != null && r.status === "no_trades" && r.candleCount > 0);
  const showGapNotice = lastExitMs != null && candleEndMs != null && candleEndMs > lastExitMs && laterEmpty.length > 0;
  return (
    <div className="mb-4" data-testid="monthly-coverage-panel">
      {showGapNotice && (
        <p className="mb-2 rounded border border-amber-700/50 bg-amber-950/30 px-3 py-2 text-sm rx-text-secondary" data-testid="no-trades-after-notice">
          6월 이후 진입 조건을 충족한 거래가 없습니다.{lastExitMs != null ? ` 마지막 청산: ${formatKoreanDateTime(lastExitMs)}.` : ""} 월별 거래 수는 아래 표에서 확인하세요.
        </p>
      )}
      <div className="overflow-x-auto">
        <table className="rextora-data-table w-full min-w-[640px] text-sm">
          <thead><tr>{["월", "캔들", "거래", "롱", "숏", "순손익", "수익률", "상태"].map((h) => <th key={h}>{h}</th>)}</tr></thead>
          <tbody>{rows.map((r) => (
            <tr key={r.monthKey} data-testid={`coverage-month-${r.monthKey}`}>
              <td className="rx-text-primary font-medium">{r.labelKo}</td>
              <td>{r.candleCount.toLocaleString("ko-KR")}</td><td>{r.tradeCount}</td><td>{r.longCount}</td><td>{r.shortCount}</td>
              <td className={r.netPnlUsdt >= 0 ? "text-emerald-300" : "text-rose-300"}>{formatUsdt(r.netPnlUsdt)}</td>
              <td>{formatPct(r.returnPctOfInitial)}</td>
              <td><Badge tone={r.status === "has_trades" ? "success" : r.status === "no_trades" ? "warning" : "muted"}>{r.statusLabelKo}</Badge></td>
            </tr>
          ))}</tbody>
        </table>
      </div>
    </div>
  );
}

type TimelineSeg = {
  tradeId: string;
  entryTime: number;
  exitTime: number;
  profitable: boolean;
  netPnlUsdt?: number;
};

type TimelineBucket = {
  count: number;
  long: number;
  short: number;
  wins: number;
  pnl: number;
  holdSum: number;
  start: number;
  end: number;
};

function TimelineLanes({
  long,
  short,
  selectedId,
  onSelect,
  range,
  sideFilter = "all",
  resultFilter = "all",
  domainStartMs = null,
  domainEndMs = null,
}: {
  long: TimelineSeg[];
  short: TimelineSeg[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  range: "all" | "7d" | "30d";
  sideFilter?: "all" | "long" | "short";
  resultFilter?: "all" | "win" | "loss";
  domainStartMs?: number | null;
  domainEndMs?: number | null;
}) {
  const [hoverTip, setHoverTip] = useState<string[] | null>(null);
  const [selectedBucket, setSelectedBucket] = useState<number | null>(null);

  const filterSeg = (segs: TimelineSeg[]) =>
    segs.filter(
      (s) =>
        (resultFilter !== "win" || s.profitable) &&
        (resultFilter !== "loss" || !s.profitable),
    );
  const longF = sideFilter === "short" ? [] : filterSeg(long);
  const shortF = sideFilter === "long" ? [] : filterSeg(short);
  const all = [...longF, ...shortF];
  if (!all.length) {
    return (
      <p className="rx-text-muted text-sm" data-testid="timeline-lanes">
        선택한 필터에 해당하는 거래가 없습니다.
      </p>
    );
  }

  const tradeMin = Math.min(...all.map((s) => s.entryTime));
  const tradeMax = Math.max(...all.map((s) => s.exitTime));
  const fullMin =
    range === "all" && domainStartMs != null
      ? Math.min(domainStartMs, tradeMin)
      : tradeMin;
  const fullMax =
    range === "all" && domainEndMs != null
      ? Math.max(domainEndMs, tradeMax)
      : tradeMax;
  const windowMs =
    range === "7d" ? 7 * 86_400_000 : range === "30d" ? 30 * 86_400_000 : null;
  const minT = windowMs ? fullMax - windowMs : fullMin;
  const maxT = fullMax;
  const span = Math.max(1, maxT - minT);
  const width = 960;
  const rowH = 88;
  const chartH = rowH * 2 + 48;

  const inWindow = (segs: TimelineSeg[]) =>
    segs.filter((s) => s.exitTime >= minT && s.entryTime <= maxT);
  const longW = inWindow(longF);
  const shortW = inWindow(shortF);
  const visibleCount = longW.length + shortW.length;

  // Density: weekly when very wide, daily when moderately dense, else individual
  let mode: "individual" | "daily" | "weekly" = "individual";
  if (visibleCount > 80 && span > 14 * 86_400_000) mode = "weekly";
  else if (visibleCount > 60 && span > 5 * 86_400_000) mode = "daily";
  const aggregate = mode !== "individual";
  const bucketMs =
    mode === "weekly"
      ? 7 * 86_400_000
      : mode === "daily"
        ? 86_400_000
        : 0;
  const buckets = aggregate
    ? buildTimelineBuckets(longW, shortW, minT, bucketMs)
    : null;

  const monthMarks: number[] = [];
  {
    const d = new Date(minT);
    d.setUTCDate(1);
    d.setUTCHours(0, 0, 0, 0);
    if (d.getTime() < minT) d.setUTCMonth(d.getUTCMonth() + 1);
    while (d.getTime() <= maxT && monthMarks.length < 24) {
      monthMarks.push(d.getTime());
      d.setUTCMonth(d.getUTCMonth() + 1);
    }
  }

  const modeLabel =
    mode === "weekly" ? "주별 집계" : mode === "daily" ? "일별 집계" : "개별 거래";

  const lane = (label: string, segs: TimelineSeg[], y: number) => (
    <g>
      <text
        x={4}
        y={y + 44}
        fill={CHART_THEME.axisLabel}
        fontSize={12}
        fontWeight={600}
        fontFamily={CHART_THEME.fontFamily}
      >
        {label}
      </text>
      {segs.map((s) => {
        const x1 =
          56 + ((Math.max(s.entryTime, minT) - minT) / span) * (width - 64);
        const x2 =
          56 + ((Math.min(s.exitTime, maxT) - minT) / span) * (width - 64);
        const selected = s.tradeId === selectedId;
        const midY = y + 44;
        const segW = Math.max(8, x2 - x1);
        const hold = Math.max(0, s.exitTime - s.entryTime);
        return (
          <g
            key={s.tradeId}
            className="cursor-pointer"
            data-testid="timeline-segment"
            data-trade-id={s.tradeId}
            data-entry={s.entryTime}
            data-exit={s.exitTime}
            onClick={() => onSelect(s.tradeId)}
            onMouseEnter={() =>
              setHoverTip([
                s.tradeId,
                `${formatKoreanDateTime(s.entryTime)} → ${formatKoreanDateTime(s.exitTime)}`,
                s.profitable ? "이익" : "손실",
                `손익 ${formatUsdt(s.netPnlUsdt ?? 0)}`,
                `보유 ${formatDurationMs(hold)}`,
              ])
            }
            onMouseLeave={() => setHoverTip(null)}
          >
            <rect
              x={x1 - 6}
              y={midY - 18}
              width={segW + 12}
              height={36}
              fill="transparent"
            />
            <rect
              x={x1}
              y={midY - 10}
              width={segW}
              height={20}
              rx={4}
              fill={s.profitable ? CHART_THEME.up : CHART_THEME.down}
              opacity={selected ? 1 : 0.85}
              stroke={selected ? "#fff" : "transparent"}
              strokeWidth={selected ? 2 : 0}
            />
            <circle cx={x1} cy={midY} r={4} fill="#e2e8f0" />
            <rect
              x={x2 - 4}
              y={midY - 4}
              width={8}
              height={8}
              fill="#94a3b8"
            />
          </g>
        );
      })}
    </g>
  );

  const maxBucket = buckets
    ? Math.max(1, ...buckets.map((b) => b.count))
    : 1;

  return (
    <div className="min-h-[320px] overflow-x-auto" data-testid="timeline-lanes">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <Badge
          tone={aggregate ? "warning" : "success"}
          data-testid="timeline-mode-badge"
        >
          {modeLabel}
        </Badge>
        <span className="text-xs rx-text-muted" data-testid="timeline-domain">
          {formatKoreanDateTime(minT)} ~ {formatKoreanDateTime(maxT)} · 거래{" "}
          {visibleCount}건
        </span>
      </div>
      {aggregate && (
        <p
          className="mb-2 text-xs rx-text-muted"
          data-testid="timeline-aggregated"
        >
          집계 막대는 거래 수만 표시합니다. 상세 값은 호버 툴팁에서 확인하세요.
        </p>
      )}
      <div className="relative">
        <svg
          width={width}
          height={chartH}
          className="min-w-full"
          style={{ fontFamily: CHART_THEME.fontFamily }}
        >
          {monthMarks.map((t) => {
            const x = 56 + ((t - minT) / span) * (width - 64);
            return (
              <g key={t}>
                <line
                  x1={x}
                  x2={x}
                  y1={8}
                  y2={rowH * 2 + 4}
                  stroke="#334155"
                  strokeDasharray="3 4"
                />
                <text
                  x={x + 2}
                  y={16}
                  fill={CHART_THEME.axisLabel}
                  fontSize={11}
                  fontFamily={CHART_THEME.fontFamily}
                >
                  {new Date(t).toLocaleDateString("ko-KR", {
                    timeZone: "Asia/Seoul",
                    month: "short",
                  })}
                </text>
              </g>
            );
          })}
          <line
            x1={56}
            x2={width - 8}
            y1={rowH * 2 + 4}
            y2={rowH * 2 + 4}
            stroke="#334155"
          />
          {aggregate && buckets
            ? buckets.map((b) => {
                const x1 = 56 + ((b.start - minT) / span) * (width - 64);
                const x2 = 56 + ((b.end - minT) / span) * (width - 64);
                const barW = Math.max(10, x2 - x1 - 2);
                const h = Math.max(24, (b.count / maxBucket) * 120);
                const winRate = b.count ? b.wins / b.count : 0;
                const netPositive = b.pnl >= 0;
                const selected = selectedBucket === b.start;
                const tip = [
                  `${formatKoreanDateTime(b.start)} ~ ${formatKoreanDateTime(b.end)}`,
                  `거래 ${b.count}건 · 롱 ${b.long} · 숏 ${b.short}`,
                  `승률 ${(winRate * 100).toFixed(0)}%`,
                  `순손익 ${formatUsdt(b.pnl)}`,
                  `평균 손익 ${formatUsdt(b.count ? b.pnl / b.count : 0)}`,
                  `평균 보유 ${formatDurationMs(b.count ? b.holdSum / b.count : 0)}`,
                ];
                return (
                  <g
                    key={b.start}
                    className="cursor-pointer"
                    data-testid="timeline-density-bucket"
                    data-bucket-count={b.count}
                    onClick={() =>
                      setSelectedBucket((cur) =>
                        cur === b.start ? null : b.start,
                      )
                    }
                    onMouseEnter={() => setHoverTip(tip)}
                    onMouseLeave={() => setHoverTip(null)}
                  >
                    <rect
                      x={x1}
                      y={rowH * 2 + 4 - h}
                      width={barW}
                      height={h}
                      rx={4}
                      fill={netPositive ? "#064e3b" : "#7f1d1d"}
                      stroke={selected ? "#fff" : "#334155"}
                      strokeWidth={selected ? 2 : 1}
                    />
                    {/* Single short label only — no multiline permanent stats */}
                    <text
                      x={x1 + barW / 2}
                      y={rowH * 2 + 4 - h - 6}
                      textAnchor="middle"
                      fill={CHART_THEME.legendText}
                      fontSize={11}
                      fontWeight={700}
                      fontFamily={CHART_THEME.fontFamily}
                      data-testid="timeline-bucket-label"
                    >
                      {b.count}
                    </text>
                  </g>
                );
              })
            : (
              <>
                {lane("롱", longW, 0)}
                {lane("숏", shortW, rowH)}
              </>
            )}
          <text
            x={56}
            y={chartH - 8}
            fill={CHART_THEME.axisLabel}
            fontSize={11}
            fontFamily={CHART_THEME.fontFamily}
            data-testid="timeline-axis-start"
          >
            {formatKoreanDateTime(minT)}
          </text>
          <text
            x={width - 8}
            y={chartH - 8}
            textAnchor="end"
            fill={CHART_THEME.axisLabel}
            fontSize={11}
            fontFamily={CHART_THEME.fontFamily}
            data-testid="timeline-axis-end"
          >
            {formatKoreanDateTime(maxT)}
          </text>
        </svg>
        {hoverTip && (
          <div
            className="pointer-events-none absolute left-4 top-8 z-10 max-w-xs rounded border border-slate-600 bg-slate-950 px-3 py-2 text-xs leading-relaxed rx-text-primary shadow-lg"
            data-testid="timeline-hover-tooltip"
          >
            {hoverTip.map((line) => (
              <div key={line}>{line}</div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function buildTimelineBuckets(
  longW: TimelineSeg[],
  shortW: TimelineSeg[],
  minT: number,
  bucketMs: number,
): TimelineBucket[] {
  const map = new Map<number, TimelineBucket>();
  const add = (s: TimelineSeg, side: "long" | "short") => {
    const key = Math.floor((s.entryTime - minT) / bucketMs);
    const cur = map.get(key) ?? {
      count: 0,
      long: 0,
      short: 0,
      wins: 0,
      pnl: 0,
      holdSum: 0,
      start: minT + key * bucketMs,
      end: minT + (key + 1) * bucketMs,
    };
    cur.count += 1;
    if (side === "long") cur.long += 1;
    else cur.short += 1;
    if (s.profitable) cur.wins += 1;
    cur.pnl += s.netPnlUsdt ?? 0;
    cur.holdSum += Math.max(0, s.exitTime - s.entryTime);
    map.set(key, cur);
  };
  for (const s of longW) add(s, "long");
  for (const s of shortW) add(s, "short");
  return [...map.values()];
}

