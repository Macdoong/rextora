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
import type {
  LevelLine,
  LifecycleMarker,
  TimeBoundLineSegment,
  ZoneRect,
} from "@/src/lib/rextora/charts/types";
import { Badge, Button, Card, Metric } from "@/components/ui/primitives";
import { EmptyState } from "@/components/rextora/EmptyState";
import { CHART_THEME } from "@/src/lib/rextora/charts/theme";
import type { BacktestReport } from "@/src/lib/rextora/backtest/backtestTypes";
import type { BacktestTrade } from "@/src/lib/rextora/backtest/backtestEngine";
import type { OhlcvCandle } from "@/src/lib/rextora/data/ohlcvTypes";
import type { MonthlyCoverageRow } from "@/src/lib/rextora/backtest/monthlyCoverage";
import type { TradeEventTrace } from "@/src/lib/rextora/backtest/tradeEventTrace";
import { formatPenetrationKo } from "@/src/lib/rextora/backtest/tradeEventTrace";
import { displayParamsHashLabel, displaySignalReason, displayStrategyHashLabel, displayTimeframeLabel, formatShortHash } from "@/src/lib/rextora/displayLabels";
import { isFutureCalendarDate } from "@/src/lib/rextora/backtest/backtestDateRange";
import {
  COST_ASSUMPTIONS_VERSION,
  formatCostAssumptionsDisclosure,
  formatDecimalRateAsPercentLabel,
} from "@/src/lib/rextora/backtest/costAssumptions";
import {
  COVERAGE_UI,
  formatCoveragePercent,
} from "@/src/lib/rextora/backtest/backtestDataCoverage";
import {
  buildPatternBlockSections,
  buildPatternSummaryGroups,
  buildRejectionTooltipLines,
  combinationOperatorKo,
  formatPatternZoneChartLabel,
  formatRejectionReasonForDisplay,
  LIFECYCLE_LABEL_KO,
  patternBlockRoleKo,
  patternFamilyKo,
  patternBlockStatusKo,
} from "@/src/lib/rextora/backtest/patternExplainability";
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
import { BACKTEST_OPERATOR_SECONDARY_VERDICT_POINTER } from "@/src/lib/rextora/backtest/backtestOperatorPresentation";
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
  "번호", "방향", "진입 시각", "청산 시각", "진입가", "청산가", "레버리지", "순손익", "수익률", "청산 사유",
] as const;

type TimelineStageStatus = "통과" | "미도달" | "기록 없음";

interface TradeTimelineStage {
  key: string;
  label: string;
  time: string | null;
  price: number | null;
  status: TimelineStageStatus;
  explanation: string;
}

function findTraceEvent(trace: TradeEventTrace | null, labelKo: string): TradeEventTrace["events"][number] | null {
  if (!trace) return null;
  return trace.events.find((e) => e.labelKo === labelKo) ?? null;
}

function buildTradeTimelineStages(trade: EnrichedTrade, trace: TradeEventTrace | null): TradeTimelineStage[] {
  const patternEvent = findTraceEvent(trace, "패턴 감지");
  const revisitEvent = findTraceEvent(trace, "리테스트");
  const confirmEvent = findTraceEvent(trace, "확인");
  const creationTime = trace?.creationCandleTime ?? patternEvent?.at ?? null;
  const revisitTime = trace?.revisitCandleTime ?? revisitEvent?.at ?? null;
  const confirmTime = trace?.confirmationCandleTime ?? confirmEvent?.at ?? null;
  const exitReason = trade.exitReason ?? trace?.exitReason ?? "";
  const exitIsStop = exitReason.includes("stop") || exitReason.includes("trailing");
  const exitIsTarget = exitReason.includes("tp") || exitReason.includes("target") || exitReason.includes("take_profit");
  const exitLabel = exitIsStop ? "손절" : exitIsTarget ? "익절" : "청산";
  const hasStop = (trade.stopLoss != null && trade.stopLoss > 0) || trace?.stopPrice != null;
  const hasTarget = (trade.takeProfit != null && trade.takeProfit > 0) || trace?.targetPrice != null;

  return [
    {
      key: "creation",
      label: "패턴 생성",
      time: creationTime,
      price: patternEvent?.price ?? trace?.zoneHigh ?? trace?.zoneLow ?? null,
      status: (creationTime ? "통과" : "기록 없음") as TimelineStageStatus,
      explanation: creationTime
        ? trace?.patternType
          ? `${patternFamilyKo(trace.patternType) ?? trace.patternType} 패턴이 감지되었습니다.`
          : "패턴 생성 시각이 기록되었습니다."
        : "패턴 생성 시각이 기록되지 않았습니다.",
    },
    {
      key: "revisit",
      label: "되돌림",
      time: revisitTime,
      price: revisitEvent?.price ?? null,
      status: (revisitTime ? "통과" : "기록 없음") as TimelineStageStatus,
      explanation: revisitTime
        ? revisitEvent?.detailKo ?? "되돌림(리테스트) 구간이 기록되었습니다."
        : "되돌림 시각이 기록되지 않았습니다.",
    },
    {
      key: "confirmation",
      label: "확인",
      time: confirmTime,
      price: confirmEvent?.price ?? null,
      status: (confirmTime ? "통과" : "기록 없음") as TimelineStageStatus,
      explanation: confirmTime
        ? confirmEvent?.detailKo ?? "확인 조건을 통과했습니다."
        : "확인 시각이 기록되지 않았습니다.",
    },
    {
      key: "entry",
      label: "진입",
      time: trade.entryTime != null ? String(trade.entryTime) : trace?.entry.at ?? null,
      price: trade.entryPrice ?? trace?.entry.price ?? null,
      status: (trade.entryTime != null ? "통과" : "기록 없음") as TimelineStageStatus,
      explanation: trace?.whyEnteredKo ?? (trade.signalType ? `신호: ${trade.signalType}` : "진입 기록"),
    },
    {
      key: "exit",
      label: exitLabel,
      time: trade.exitTime != null ? String(trade.exitTime) : trace?.exit.at ?? null,
      price: trade.exitPrice ?? trace?.exit.price ?? null,
      status: (trade.exitTime != null ? "통과" : "기록 없음") as TimelineStageStatus,
      explanation: trace?.whyExitedKo ?? displaySignalReason(trade.exitReason),
    },
  ].map((stage) => {
    if (stage.key === "exit" && stage.status === "통과" && exitIsTarget && hasStop) {
      return { ...stage, explanation: `${stage.explanation} · 손절가는 미도달` };
    }
    if (stage.key === "exit" && stage.status === "통과" && exitIsStop && hasTarget) {
      return { ...stage, explanation: `${stage.explanation} · 익절가는 미도달` };
    }
    return stage;
  });
}

function timelineStatusTone(status: TimelineStageStatus): Tone {
  if (status === "통과") return "success";
  if (status === "미도달") return "warning";
  return "default";
}

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

const WORKSPACE_TAB_IDS = [
  "price",
  "trades",
  "monthly",
  "cost",
  "equity",
  "timeline",
  "advanced",
  "validation",
] as const;

type WorkspaceTabId = (typeof WORKSPACE_TAB_IDS)[number];

function isWorkspaceTabId(id: string): id is WorkspaceTabId {
  return (WORKSPACE_TAB_IDS as readonly string[]).includes(id);
}

function isWorkspaceSectionHidden(
  id: string,
  activeSection?: string,
): boolean {
  if (activeSection == null) return false;
  if (id === "summary") {
    return activeSection !== "overview" && activeSection !== "summary";
  }
  if (!isWorkspaceTabId(id)) return false;
  if (activeSection === "overview") return id !== "equity";
  if (activeSection === "technical" || activeSection === "expert") return true;
  return activeSection !== id;
}

function SectionAnchor({
  id,
  children,
  activeSection,
}: {
  id: string;
  children: ReactNode;
  /** When set, workspace sections are exclusive tabs — only the active one mounts visibly. */
  activeSection?: WorkspaceTabId | string;
}) {
  const exclusive = isWorkspaceTabId(id) || id === "summary";
  const hidden = exclusive && activeSection != null && isWorkspaceSectionHidden(id, activeSection);
  return (
    <section
      id={`bt-${id}`}
      data-section={id}
      data-workspace-tab={exclusive ? "true" : undefined}
      data-tab-active={exclusive ? (hidden ? "false" : "true") : undefined}
      hidden={hidden || undefined}
      aria-hidden={hidden || undefined}
      className={`scroll-mt-20 ${hidden ? "hidden" : ""}`}
    >
      {children}
    </section>
  );
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
  initialSelectedTradeId = null,
  activeSection = "price",
  onSectionChange,
  onSelectedTradeChange,
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
  initialSelectedTradeId?: string | null;
  activeSection?: "overview" | "price" | "trades" | "monthly" | "cost" | "equity" | "timeline" | "advanced" | "validation" | "technical" | "expert" | string;
  onSectionChange?: (section: string) => void;
  onSelectedTradeChange?: (tradeId: string | null) => void;
}) {
  const model = useMemo(() => buildVisualAnalysisModel({ report, trades, equityCurve, candles }), [report, trades, equityCurve, candles]);
  const processed = processedCandleCount ?? report.processedCandleCount ?? report.candleCount;
  const hasProcessedCandles = processed > 0 && model.priceCandles.length > 0;
  const hasTrades = model.trades.length > 0;
  const [tradeFilter, setTradeFilter] = useState<TradeFilter>("all");
  const [tradeSort, setTradeSort] = useState<TradeSort>("entry_desc");
  /** undefined = auto first trade; null = user cleared; string = explicit selection */
  const [selectedTradeOverride, setSelectedTradeOverride] = useState<
    string | null | undefined
  >(() => initialSelectedTradeId ?? undefined);
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
  const [developerMode, setDeveloperMode] = useState(false);
  const [patternSummaryExpanded, setPatternSummaryExpanded] = useState<Set<string>>(
    () => new Set(),
  );
  const [timelineRange, setTimelineRange] = useState<"all" | "7d" | "30d">("all");
  const [timelineSide, setTimelineSide] = useState<"all" | "long" | "short">("all");
  const [timelineResult, setTimelineResult] = useState<"all" | "win" | "loss">("all");
  const [showVolume, setShowVolume] = useState(true);
  const patternAvailability = useMemo(() => {
    const comboKinds = (report.tradeEventTraces ?? [])
      .flatMap((t) => t.patternBlocks ?? [])
      .map((b) => b.family)
      .filter(
        (f): f is string =>
          f === "order_block" ||
          f === "fvg" ||
          f === "trendline" ||
          f === "support_resistance" ||
          f === "supply_demand",
      );
    return classifyPatternOverlays({
      strategyType,
      eventSequenceFamily,
      conditionPatternKinds: [...new Set(comboKinds)],
      traces: report.tradeEventTraces ?? [],
    });
  }, [strategyType, eventSequenceFamily, report.tradeEventTraces]);
  const [overlayOpts, setOverlayOpts] = useState({
    entry: true,
    exit: true,
    stop: true,
    target: true,
    sequence: true,
    revisit: false,
    confirmation: false,
    invalidation: false,
    rejected: false,
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
  // Auto-select first trade so accepted pattern zones are visible on load.
  const selectedTradeId =
    selectedTradeOverride === undefined
      ? (model.trades[0]?.id ?? null)
      : selectedTradeOverride;
  const selectedTrace = selectedTradeId
    ? tracesById.get(selectedTradeId) ?? null
    : null;
  const selectedTrade = selectedTradeId
    ? model.trades.find((t) => t.id === selectedTradeId) ?? null
    : null;
  const focusTimeRange = useMemo(() => {
    if (!selectedTrade) return null;
    const base = tradeFocusTimeRange(selectedTrade);
    if (!base) return null;
    let fromMs = base.fromMs;
    let toMs = base.toMs;
    const extend = (raw: unknown) => {
      if (typeof raw !== "string" && typeof raw !== "number") return;
      const ms =
        typeof raw === "number" ? raw : Date.parse(String(raw));
      if (!Number.isFinite(ms)) return;
      fromMs = Math.min(fromMs, ms);
      toMs = Math.max(toMs, ms);
    };
    if (selectedTrace) {
      extend(selectedTrace.creationCandleTime);
      extend(selectedTrace.revisitCandleTime);
      extend(selectedTrace.confirmationCandleTime);
      for (const block of selectedTrace.patternBlocks ?? []) {
        extend(block.creationTime);
        extend(block.revisitTime);
        extend(block.confirmationTime);
        extend(block.entryTime);
        extend(block.exitTime);
      }
    }
    return { fromMs, toMs };
  }, [selectedTrade, selectedTrace]);

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
    const colorFor = (kind: string) =>
      kind === "fvg"
        ? "#a78bfa"
        : kind === "order_block"
          ? "#38bdf8"
          : kind === "supply_demand"
            ? "#fb923c"
            : kind === "support_resistance"
              ? "#2dd4bf"
              : "#94a3b8";
    const pushZone = (input: {
      patternType?: string | null;
      zoneHigh?: number | null;
      zoneLow?: number | null;
      creationTime?: string | null;
      revisitTime?: string | null;
      exitTime?: string | null;
      invalidationTime?: string | null;
      touchCount?: number | null;
      opacity?: number;
    }) => {
      if (
        input.zoneHigh == null ||
        input.zoneLow == null ||
        !Number.isFinite(input.zoneHigh) ||
        !Number.isFinite(input.zoneLow)
      ) {
        return;
      }
      const kind = (input.patternType ?? "") as PatternOverlayKind;
      if (
        (kind === "order_block" ||
          kind === "fvg" ||
          kind === "support_resistance" ||
          kind === "supply_demand" ||
          kind === "trendline") &&
        !patternToggleOn(kind)
      ) {
        return;
      }
      const fromMs = input.creationTime ? Date.parse(input.creationTime) : null;
      const endCandidates = [
        input.exitTime,
        input.invalidationTime,
        input.revisitTime,
      ]
        .map((v) => (v ? Date.parse(v) : Number.NaN))
        .filter((v) => Number.isFinite(v));
      const toMs = endCandidates.length ? Math.max(...endCandidates) : null;
      zones.push({
        high: input.zoneHigh,
        low: input.zoneLow,
        color: colorFor(kind),
        label: formatPatternZoneChartLabel(input.patternType, input.touchCount),
        fromTime: fromMs != null && Number.isFinite(fromMs) ? fromMs : null,
        toTime: toMs,
        opacity: input.opacity ?? 0.42,
      });
    };
    if (selectedTrace) {
      const blocks = selectedTrace.patternBlocks ?? [];
      let pushed = 0;
      for (const block of blocks) {
        if (block.status !== "detected" || block.family === "trendline") continue;
        pushZone({
          patternType: block.family,
          zoneHigh: block.zoneHigh,
          zoneLow: block.zoneLow,
          creationTime: block.creationTime,
          revisitTime: block.revisitTime,
          exitTime: block.exitTime ?? selectedTrace.exit?.at,
          invalidationTime: block.invalidationTime,
          touchCount: block.touchCount,
          opacity: block.family === "order_block" ? 0.48 : 0.42,
        });
        pushed += 1;
      }
      // Fallback: blocks present but none drawable, or legacy traces.
      if (
        pushed === 0 &&
        selectedTrace.patternType !== "trendline" &&
        selectedTrace.zoneHigh != null &&
        selectedTrace.zoneLow != null
      ) {
        pushZone({
          patternType: selectedTrace.patternType,
          zoneHigh: selectedTrace.zoneHigh,
          zoneLow: selectedTrace.zoneLow,
          creationTime: selectedTrace.creationCandleTime,
          revisitTime: selectedTrace.revisitCandleTime,
          exitTime: selectedTrace.exit?.at,
          invalidationTime: selectedTrace.invalidationCandleTime,
          opacity: 0.48,
        });
      }
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
    return levels;
  }, [selectedTrace, overlayOpts]);

  const patternSegments = useMemo((): TimeBoundLineSegment[] => {
    if (!patternToggleOn("trendline")) return [];
    const sources: Array<{
      blockId: string;
      lineAnchors?: Array<{
        bar: number;
        price: number;
        time?: string | null;
      }> | null;
    }> = selectedTrace
      ? selectedTrace.patternBlocks?.length
        ? selectedTrace.patternBlocks.filter(
            (block) => block.family === "trendline" && block.status === "detected",
          )
        : [
            {
              blockId: "legacy-primary",
              lineAnchors: selectedTrace.lineAnchors,
            },
          ]
      : [];
    if (overlayOpts.rejected) {
      for (const rejection of report.rejectedSetups ?? []) {
        if (rejection.patternType === "trendline" && rejection.lineAnchors?.length) {
          sources.push({
            blockId: "rejected-trendline",
            lineAnchors: rejection.lineAnchors,
          });
        }
      }
    }
    const segments: TimeBoundLineSegment[] = [];
    for (const source of sources) {
      const anchors = source.lineAnchors;
      if (!anchors || anchors.length < 2) continue;
      const from = anchors[0]!;
      const to = anchors[anchors.length - 1]!;
      const fromTime = from.time ? Date.parse(from.time) : Number.NaN;
      const toTime = to.time ? Date.parse(to.time) : Number.NaN;
      if (!Number.isFinite(fromTime) || !Number.isFinite(toTime)) continue;
      segments.push({
        fromTime,
        fromPrice: from.price,
        toTime,
        toPrice: to.price,
        color: "#fbbf24",
        label: `추세선 · ${patternFamilyKo("trendline")}`,
        tooltipLines: [
          `시작 #${from.bar} @ ${from.price}`,
          `종료 #${to.bar} @ ${to.price}`,
        ],
      });
    }
    return segments;
  }, [
    selectedTrace,
    patternToggleOn,
    overlayOpts.rejected,
    report.rejectedSetups,
  ]);

  const lifecycleMarkers = useMemo((): LifecycleMarker[] => {
    const out: LifecycleMarker[] = [];
    const add = (
      kind: LifecycleMarker["kind"],
      at: string | null | undefined,
      price: number | null | undefined,
      label: string,
      tooltipLines: string[],
      blockId?: string,
    ) => {
      if (!at || price == null || !Number.isFinite(price)) return;
      const time = Date.parse(at);
      if (!Number.isFinite(time)) return;
      out.push({ kind, time, price, label, tooltipLines, blockId });
    };
    if (selectedTrace) {
      const blocks = selectedTrace.patternBlocks ?? [];
      for (const block of blocks) {
        const midpoint =
          block.zoneHigh != null && block.zoneLow != null
            ? (block.zoneHigh + block.zoneLow) / 2
            : block.lineAnchors?.[0]?.price ?? null;
        const evidence = [
          block.reasonCode
            ? `사유 ${formatRejectionReasonForDisplay(block.reasonCode, { developerMode }) ?? block.reasonCode}`
            : null,
          block.stage ? `단계 ${block.stage}` : null,
          `필수 ${String(block.required)}`,
          `가중치 ${block.weight}`,
          `우선순위 ${block.priority}`,
        ].filter((v): v is string => Boolean(v));
        if (overlayOpts.sequence) {
          add(
            "creation",
            block.creationTime,
            midpoint,
            LIFECYCLE_LABEL_KO.creation,
            evidence,
            block.blockId,
          );
        }
        if (overlayOpts.revisit) {
          add(
            "revisit",
            block.revisitTime,
            midpoint,
            LIFECYCLE_LABEL_KO.revisit,
            evidence,
            block.blockId,
          );
        }
        if (overlayOpts.confirmation) {
          add(
            "confirmation",
            block.confirmationTime,
            midpoint,
            LIFECYCLE_LABEL_KO.confirmation,
            evidence,
            block.blockId,
          );
        }
        if (overlayOpts.invalidation) {
          add("break", block.breakTime, midpoint, LIFECYCLE_LABEL_KO.break, evidence, block.blockId);
          add(
            "invalidation",
            block.invalidationTime,
            midpoint,
            LIFECYCLE_LABEL_KO.invalidation,
            evidence,
            block.blockId,
          );
        }
      }
    }
    if (overlayOpts.rejected) {
      // Cluster nearby rejections (same ~bucket) to reduce dense marker clutter.
      const CLUSTER_MS = 15 * 60_000;
      const sorted = [...(report.rejectedSetups ?? [])].sort(
        (a, b) => Date.parse(String(a.at ?? 0)) - Date.parse(String(b.at ?? 0)),
      );
      let cluster: typeof sorted = [];
      const flush = () => {
        if (!cluster.length) return;
        const head = cluster[0]!;
        const reason =
          cluster.length === 1
            ? formatRejectionReasonForDisplay(head.reasonCode, { developerMode })
            : `${cluster.length}건 설정 거절`;
        add(
          "rejected",
          head.at,
          head.eventPrice,
          "",
          buildRejectionTooltipLines(
            head.reasonCode,
            [
              reason && cluster.length > 1 ? reason : null,
              head.stage ? `단계 ${head.stage}` : null,
              head.measured != null ? `측정 ${head.measured}` : null,
              head.required != null ? `기준 ${head.required}` : null,
            ],
            { developerMode },
          ),
        );
        cluster = [];
      };
      for (const rejection of sorted) {
        if (!cluster.length) {
          cluster = [rejection];
          continue;
        }
        const prev = Date.parse(String(cluster[0]!.at ?? 0));
        const cur = Date.parse(String(rejection.at ?? 0));
        if (Number.isFinite(prev) && Number.isFinite(cur) && cur - prev <= CLUSTER_MS) {
          cluster.push(rejection);
        } else {
          flush();
          cluster = [rejection];
        }
      }
      flush();
    }
    return out;
  }, [selectedTrace, overlayOpts, report.rejectedSetups, developerMode]);

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
    setSelectedTradeOverride(id);
    onSelectedTradeChange?.(id);
    if (!id) {
      setLinkStatus(null);
      return;
    }
    if (source === "chart") {
      setLinkStatus(`차트에서 선택한 거래 ${id}을 표시했습니다.`);
      onSectionChange?.("trades");
      requestAnimationFrame(() => {
        document.getElementById("bt-trades")?.scrollIntoView({ behavior: "smooth", block: "start" });
        rowRefs.current.get(id)?.scrollIntoView({ behavior: "smooth", block: "nearest" });
      });
    } else {
      setLinkStatus(`거래 ${id} 구간을 차트에 표시했습니다.`);
      onSectionChange?.("price");
      requestAnimationFrame(() => {
        document.getElementById("bt-price")?.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    }
  }, [onSectionChange, onSelectedTradeChange]);

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

  // Selected workspace tab forces content open — no scroll-driven tab mutation.
  const tradesOpen = activeSection === "trades" || tradeListExpanded;
  const equityOpen = activeSection === "equity" || activeSection === "overview" || equityExpanded;
  const timelineOpen = activeSection === "timeline" || timelineExpanded;
  const advancedOpen = activeSection === "advanced" || advancedExpanded;
  const validationOpen =
    activeSection === "validation" || validationDetailsOpen;

  const scrollToSection = (id: "price" | "trades" | "monthly" | "cost" | "equity" | "timeline" | "advanced" | "validation") => {
    if (id === "equity") setEquityExpanded(true);
    if (id === "timeline") setTimelineExpanded(true);
    if (id === "advanced") setAdvancedExpanded(true);
    if (id === "validation") setValidationDetailsOpen(true);
    if (id === "trades") setTradeListExpanded(true);
    onSectionChange?.(id);
  };

  const navigateTrade = (dir: -1 | 1) => {
    if (!selectedTradeId) return;
    const idx = model.trades.findIndex((t) => t.id === selectedTradeId);
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
    formatCostAssumptionsDisclosure(report),
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
    if (tradesOpen) return pageRows;
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
    <div
      className="space-y-4 overflow-x-hidden"
      data-testid="backtest-analysis"
      data-active-section={activeSection}
      ref={rootRef}
    >
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

      <SectionAnchor id="summary" activeSection={activeSection}>
        <Card title="핵심 성과" data-testid="backtest-summary">
          <div className="mb-3 flex flex-wrap gap-3 text-xs rx-text-muted">
            <span>데이터 출처: {dataSourceLabel}</span>
            <span>
              {COVERAGE_UI.requestedPeriodKo}:{" "}
              {report.requestedFrom?.slice(0, 16) ?? report.fromDate ?? "-"} ~{" "}
              {report.requestedTo?.slice(0, 16) ?? report.toDate ?? "-"}
            </span>
            <span>
              {COVERAGE_UI.actualPeriodKo}:{" "}
              {report.actualFirstCandleTime
                ? formatKoreanDateTime(new Date(report.actualFirstCandleTime).getTime())
                : "-"}{" "}
              ~{" "}
              {report.actualLastCandleTime
                ? formatKoreanDateTime(new Date(report.actualLastCandleTime).getTime())
                : "-"}
            </span>
            <span data-testid="backtest-coverage-disclosure">
              {COVERAGE_UI.candleCountKo}: {processed.toLocaleString("ko-KR")}
              {report.dataCoverage
                ? ` / ${report.dataCoverage.expectedCandleCount.toLocaleString("ko-KR")} · ${COVERAGE_UI.coverageKo} ${formatCoveragePercent(report.dataCoverage.coverageRatio)}`
                : ""}
            </span>
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
              {BACKTEST_OPERATOR_SECONDARY_VERDICT_POINTER}
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

      <SectionAnchor id="price" activeSection={activeSection}>
        <div data-testid="backtest-price-chart">
          <h2 className="mb-2 text-sm font-semibold text-slate-100">가격 차트</h2>
          <details
            className="rextora-collapsible mb-3"
            data-testid="trade-overlay-toggles"
          >
            <summary>
              <span>
                <span className="rextora-card-title block">차트 표시 설정</span>
                <span className="rextora-helper mt-0.5 block">
                  진입·청산, 패턴 영역, 거부 셋업 표시를 조정합니다.
                </span>
              </span>
            </summary>
            <div className="rextora-collapsible-body space-y-4">
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
              <p className="text-sm font-semibold text-slate-200">분석</p>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                <label className="flex min-h-11 min-w-[7rem] items-center gap-2 text-sm text-slate-300" title="패턴 감지(생성)">
                  <input
                    type="checkbox"
                    className="h-4 w-4"
                    checked={overlayOpts.sequence}
                    onChange={() =>
                      setOverlayOpts((s) => ({ ...s, sequence: !s.sequence }))
                    }
                    data-testid="overlay-toggle-creation"
                  />
                  패턴 감지
                </label>
                <label className="flex min-h-11 min-w-[7rem] items-center gap-2 text-sm text-slate-300" title="되돌림 확인">
                  <input
                    type="checkbox"
                    className="h-4 w-4"
                    checked={overlayOpts.revisit}
                    onChange={() =>
                      setOverlayOpts((s) => ({ ...s, revisit: !s.revisit }))
                    }
                    data-testid="overlay-toggle-revisit"
                  />
                  되돌림
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
                    data-testid="overlay-toggle-confirmation"
                  />
                  확인
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
                  설정 거절
                </label>
              </div>
            </div>
            <div className="space-y-2 border-t border-slate-800/80 pt-3">
              <p className="text-sm font-semibold text-slate-200">기술</p>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
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
                    data-testid="overlay-toggle-invalidation"
                  />
                  실제 무효화
                </label>
                <label className="flex min-h-11 min-w-[7rem] items-center gap-2 text-sm text-slate-300">
                  <input
                    type="checkbox"
                    className="h-4 w-4"
                    checked={developerMode}
                    onChange={() => setDeveloperMode((v) => !v)}
                    data-testid="overlay-toggle-developer"
                  />
                  원본 코드
                </label>
              </div>
            </div>
            </div>
          </details>
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
              segments={patternSegments}
              lifecycleMarkers={lifecycleMarkers}
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
          <Card title="패턴 요약" data-testid="pattern-summary">
            {!selectedTrace ? (
              <p className="text-sm rx-text-muted">
                거래를 선택하면 저장된 패턴 증거를 표시합니다.
              </p>
            ) : selectedTrace.patternBlocks?.length ? (
              <div className="space-y-2" data-testid="pattern-summary-compact">
                {selectedTrace.patternBlocks.map((block, index) => {
                  const blockKey = `${block.blockId}-${block.stage ?? index}`;
                  const expanded = patternSummaryExpanded.has(blockKey);
                  const groups = expanded ? buildPatternSummaryGroups(block) : [];
                  const hasGeometry =
                    (block.zoneHigh != null && block.zoneLow != null) ||
                    (block.lineAnchors?.length ?? 0) >= 2;
                  const pen =
                    typeof block.measuredValues?.penetrationPct === "number"
                      ? block.measuredValues.penetrationPct
                      : typeof block.measured === "number"
                        ? block.measured
                        : null;
                  const coreHint = [
                    pen != null && Number.isFinite(pen)
                      ? formatPenetrationKo(pen)
                      : null,
                    block.confirmationTime ? "확인 완료" : null,
                    block.entryTime ? "진입 완료" : "대기/거절",
                  ]
                    .filter(Boolean)
                    .join(" · ");
                  const sideKo =
                    selectedTrade?.side === "LONG"
                      ? "롱"
                      : selectedTrade?.side === "SHORT"
                        ? "숏"
                        : "—";
                  return (
                    <div
                      key={blockKey}
                      className="rounded-lg border border-slate-800 bg-slate-950/40 p-3 text-sm text-slate-200"
                      data-testid="pattern-summary-block"
                      data-expanded={expanded ? "1" : "0"}
                    >
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="font-medium text-slate-100">
                            {patternFamilyKo(block.family)} · {sideKo} ·{" "}
                            {patternBlockRoleKo(block.role)} ·{" "}
                            {block.entryTime
                              ? "진입 완료"
                              : patternBlockStatusKo(block.status)}
                          </p>
                          <p className="mt-0.5 text-xs text-slate-400">{coreHint || "핵심 조건 기록 없음"}</p>
                        </div>
                        <Button
                          size="sm"
                          variant="outline"
                          data-testid="pattern-summary-toggle"
                          onClick={() => {
                            setPatternSummaryExpanded((prev) => {
                              const next = new Set(prev);
                              if (next.has(blockKey)) next.delete(blockKey);
                              else next.add(blockKey);
                              try {
                                window.localStorage.setItem(
                                  "rextora.backtest.patternSummaryExpanded",
                                  next.size > 0 ? "1" : "0",
                                );
                              } catch {
                                /* ignore */
                              }
                              return next;
                            });
                          }}
                        >
                          {expanded ? "접기" : "자세히 보기"}
                        </Button>
                      </div>
                      {expanded ? (
                        <div className="mt-3 space-y-3" data-testid="pattern-summary-expanded">
                          {groups.map((group) => (
                            <div key={group.id}>
                              <p className="mb-1 text-xs font-semibold text-sky-300/90">
                                {group.title}
                              </p>
                              <dl className="grid gap-1 sm:grid-cols-2">
                                {group.rows.map((row) => (
                                  <div
                                    key={`${group.id}-${row.label}`}
                                    className="flex justify-between gap-3 border-b border-slate-800/60 py-1"
                                  >
                                    <dt className="text-slate-400">{row.label}</dt>
                                    <dd className="text-right text-slate-100">{row.value}</dd>
                                  </div>
                                ))}
                              </dl>
                            </div>
                          ))}
                          <p data-testid="pattern-summary-geometry" className="text-xs text-slate-500">
                            {hasGeometry
                              ? block.lineAnchors?.length
                                ? `추세선 앵커 ${block.lineAnchors.length}개 확인`
                                : `영역 ${block.zoneLow}–${block.zoneHigh}`
                              : "저장된 도형 없음"}
                          </p>
                          {developerMode ? (
                            <details className="text-xs text-slate-500">
                              <summary className="cursor-pointer">개발자 정보</summary>
                              <pre className="mt-1 overflow-x-auto whitespace-pre-wrap font-mono">
                                {JSON.stringify(
                                  {
                                    blockId: block.blockId,
                                    family: block.family,
                                    role: block.role,
                                    status: block.status,
                                    reasonCode: block.reasonCode,
                                    detectorParams: block.detectorParams,
                                    measuredValues: block.measuredValues,
                                    thresholds: block.thresholds,
                                  },
                                  null,
                                  2,
                                )}
                              </pre>
                            </details>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-sm text-amber-200" data-testid="pattern-summary-legacy">
                레거시 실행: 블록별 검증 증거가 없습니다.{" "}
                {selectedTrace.zoneHigh != null && selectedTrace.zoneLow != null
                  ? "기본 저장 geometry만 확인되었습니다."
                  : "저장된 geometry가 없습니다."}
              </p>
            )}
          </Card>
        </div>
      </SectionAnchor>

      <SectionAnchor id="trades" activeSection={activeSection}>
        {hasTrades ? (
          <Card title="거래 목록" data-testid="backtest-trade-list">
            <div
              className="v3-bt-trade-workspace lg:grid lg:grid-cols-[minmax(0,1.15fr)_minmax(300px,0.85fr)] gap-4"
              data-testid="backtest-trade-workspace"
            >
              <div className="v3-bt-trade-list-col min-w-0">
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
                    {tradesOpen
                      ? ` · ${safePage + 1}/${pageCount} 페이지`
                      : " · 미리보기"}
                  </span>
                </div>
                <div className="hidden overflow-auto md:block v3-bt-trade-table-wrap">
                  <table className="v3-bt-trade-table w-full min-w-[880px] text-left text-sm">
                    <thead>
                      <tr>
                        {TRADE_HEADERS.map((h, i) => (
                          <th
                            key={h}
                            className={`whitespace-nowrap px-3 py-3 font-semibold ${
                              i === 4 || i === 7 ? "v3-bt-col-group" : ""
                            }`}
                          >
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
                <div className="grid gap-2 md:hidden" data-testid="trade-mobile-list">
                  {previewTradeRows.map((trade) => (
                    <button
                      key={`mobile-${trade.id}`}
                      type="button"
                      className={`rounded-xl border p-3 text-left ${
                        selectedTradeId === trade.id
                          ? "border-sky-500 bg-sky-950/30"
                          : "border-slate-700 bg-slate-950/40"
                      }`}
                      onClick={() => selectTrade(trade.id, "list")}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <Badge tone={trade.side === "LONG" ? "success" : "danger"}>
                          {trade.side === "LONG" ? "롱" : "숏"}
                        </Badge>
                        <span className={trade.netPnlUsdt >= 0 ? "text-emerald-300" : "text-rose-300"}>
                          {formatUsdt(trade.netPnlUsdt)}
                        </span>
                      </div>
                      <p className="mt-2 text-sm text-slate-300">
                        {formatKoreanDateTime(trade.entryTime)} · 진입 {trade.entryPrice.toLocaleString("ko-KR")}
                      </p>
                    </button>
                  ))}
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {!tradesOpen ? (
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
              </div>
              <div className="v3-bt-trade-inspector-col min-w-0">
                {selectedTrade ? (
                  <SelectedTradeInspector
                    trade={selectedTrade}
                    trace={selectedTrace}
                    developerMode={developerMode}
                    onClose={() => selectTrade(null, "clear")}
                    onPrev={() => navigateTrade(-1)}
                    onNext={() => navigateTrade(1)}
                    onFocusChart={() => {
                      onSectionChange?.("price");
                      window.requestAnimationFrame(() => scrollToSection("price"));
                    }}
                    onCopyId={() => {
                      void navigator.clipboard?.writeText(selectedTrade.id);
                    }}
                  />
                ) : (
                  <div className="flex min-h-[240px] items-center justify-center rounded-xl border border-dashed border-slate-800 bg-slate-950/40 p-6">
                    <p className="text-sm rx-text-muted">거래를 선택하세요</p>
                  </div>
                )}
              </div>
            </div>
          </Card>
        ) : (
          <p className="text-sm rx-text-muted">표시할 거래가 없습니다.</p>
        )}
      </SectionAnchor>

      {hasTrades ? (
        <SectionAnchor id="monthly" activeSection={activeSection}>
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
            <BarChart
              title="월별 수익률"
              series={monthlySeries}
              height={monthlySeries.data.length <= 3 ? 168 : 260}
              diverging
            />
            {model.monthlyCoverage.length > 0 ? (
              <MonthlyCoveragePanel
                rows={model.monthlyCoverage}
                lastExitMs={model.ledgerRange.lastExitMs}
                candleEndMs={model.ledgerRange.lastCandleMs}
              />
            ) : (
              <div className="mt-3 overflow-x-auto">
                <table className="rextora-data-table w-full min-w-[480px] text-sm">
                  <thead>
                    <tr>
                      {["월", "거래", "순손익", "수익률"].map((h) => (
                        <th key={h}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {model.monthlyReturns.map((m) => (
                      <tr key={m.monthKey}>
                        <td className="rx-text-primary font-medium">{m.labelKo}</td>
                        <td>{m.tradeCount}</td>
                        <td className={m.netPnlUsdt >= 0 ? "text-emerald-300" : "text-rose-300"}>
                          {formatUsdt(m.netPnlUsdt)}
                        </td>
                        <td className={m.returnPctOfInitial >= 0 ? "text-emerald-300" : "text-rose-300"}>
                          {formatPct(m.returnPctOfInitial)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </SectionAnchor>
      ) : null}

      {hasTrades ? (
        <SectionAnchor id="cost" activeSection={activeSection}>
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
            <div className="mb-3 grid grid-cols-2 gap-2 md:grid-cols-4" data-testid="backtest-cost-split">
              {costParts.map((p) => (
                <div key={p.label} className="v3-bt-cost-part">
                  <span>{p.label}</span>
                  <b>{formatUsdt(p.v)}</b>
                </div>
              ))}
            </div>
            <div className="mb-3 flex h-3 overflow-hidden rounded" aria-hidden="true">
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
              </div>
            </details>
          </Card>
        </SectionAnchor>
      ) : null}

      <SectionAnchor id="equity" activeSection={activeSection}>
        <Card title="자산·낙폭" data-testid="backtest-equity-section">
          {!equityOpen ? (
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

      <SectionAnchor id="timeline" activeSection={activeSection}>
        <Card title="거래 타임라인" data-testid="backtest-timeline">
          {!timelineOpen ? (
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

      <SectionAnchor id="advanced" activeSection={activeSection}>
        <Card title="상세 분석" data-testid="backtest-advanced">
          {!advancedOpen ? (
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


      <SectionAnchor id="validation" activeSection={activeSection}>
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
            detailsOpen={validationOpen}
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
    <tr ref={rowRef} className={`v3-bt-trade-row cursor-pointer ${selected ? "is-selected" : ""}`} data-testid="trade-row" data-trade-id={t.id} onClick={onSelect}>
      <td className="px-3 py-3 font-mono text-sm">{t.id}</td>
      <td className="px-3 py-3"><Badge tone={t.side === "LONG" ? "success" : "danger"}>{t.side === "LONG" ? "롱" : "숏"}</Badge></td>
      <td className="whitespace-nowrap px-3 py-3 text-sm">{formatKoreanDateTime(t.entryTime)}</td>
      <td className="whitespace-nowrap px-3 py-3 text-sm">{formatKoreanDateTime(t.exitTime)}</td>
      <td className="v3-bt-col-group px-3 py-3 tabular-nums text-sm">{t.entryPrice.toLocaleString("ko-KR")}</td>
      <td className="px-3 py-3 tabular-nums text-sm">{t.exitPrice.toLocaleString("ko-KR")}</td>
      <td className="px-3 py-3 tabular-nums text-sm">{t.leverage.toFixed(2)}</td>
      <td className={`v3-bt-col-group px-3 py-3 tabular-nums text-sm font-semibold ${pnlCls}`}>{formatUsdt(t.netPnlUsdt)}</td>
      <td className={`px-3 py-3 tabular-nums text-sm font-semibold ${t.pnlPct >= 0 ? "text-emerald-300" : "text-rose-300"}`}>{formatPct(t.pnlPct)}</td>
      <td className="px-3 py-3 text-sm">{displaySignalReason(t.exitReason)}</td>
    </tr>
  );
}

function SelectedTradeInspector({
  trade,
  trace,
  developerMode,
  onPrev,
  onNext,
  onFocusChart,
  onCopyId,
  onClose,
}: {
  trade: EnrichedTrade;
  trace: TradeEventTrace | null;
  developerMode: boolean;
  onPrev: () => void;
  onNext: () => void;
  onFocusChart: () => void;
  onCopyId: () => void;
  onClose: () => void;
}) {
  const hasSl = trade.stopLoss != null && trade.stopLoss > 0;
  const hasTp = trade.takeProfit != null && trade.takeProfit > 0;
  const stopPrice = hasSl ? trade.stopLoss : trace?.stopPrice ?? null;
  const targetPrice = hasTp ? trade.takeProfit : trace?.targetPrice ?? null;
  const blockSections = trace?.patternBlocks?.length
    ? buildPatternBlockSections(trace.patternBlocks, { developerMode })
    : [];
  const timelineStages = buildTradeTimelineStages(trade, trace);
  const invalidationTime = trace?.invalidationCandleTime ?? null;

  return (
    <div
      className="rextora-trade-inspector space-y-4 rounded-xl border border-slate-800 bg-slate-950/95 p-4"
      data-testid="selected-trade-inspector"
    >
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-base font-semibold rx-text-primary">선택 거래</h3>
        <Badge tone={trade.side === "LONG" ? "success" : "danger"}>{trade.side === "LONG" ? "롱" : "숏"}</Badge>
        <Badge tone={trade.profitable ? "success" : "danger"}>{trade.profitable ? "이익" : "손실"}</Badge>
        <button
          type="button"
          className="rextora-icon-button ml-auto lg:hidden"
          onClick={onClose}
          aria-label="거래 상세 닫기"
        >
          ×
        </button>
      </div>

      <div data-testid="trade-inspector-result">
        <h4 className="mb-2 text-sm font-semibold text-slate-200">1. 거래 결과</h4>
        <MetricsGrid
          cols="grid-cols-2"
          items={[
            { label: "순손익", value: formatUsdt(trade.netPnlUsdt), tone: trade.netPnlUsdt >= 0 ? "success" : "danger" },
            { label: "수익률", value: formatPct(trade.pnlPct), tone: trade.pnlPct >= 0 ? "success" : "danger" },
            { label: "보유", value: formatDurationMs(trade.holdMs) },
            { label: "레버리지", value: trade.leverage.toFixed(2) },
          ]}
        />
      </div>

      <div data-testid="trade-inspector-entry">
        <h4 className="mb-2 text-sm font-semibold text-slate-200">2. 진입 근거</h4>
        <dl className="grid grid-cols-2 gap-2 text-sm">
          <div className="rounded border border-slate-800 p-2">
            <dt className="text-xs rx-text-muted">진입 시각</dt>
            <dd className="mt-1 text-slate-100">{formatKoreanDateTime(trade.entryTime)}</dd>
          </div>
          <div className="rounded border border-slate-800 p-2">
            <dt className="text-xs rx-text-muted">진입 가격</dt>
            <dd className="mt-1 text-slate-100">{trade.entryPrice.toLocaleString("ko-KR")}</dd>
          </div>
        </dl>
        <p className="mt-2 text-sm text-slate-300">
          저장된 패턴 조합과 확인 이벤트가 충족된 시점의 엔진 진입 기록입니다.
        </p>
      </div>

      <div data-testid="trade-inspector-pattern">
        <h4 className="mb-2 text-sm font-semibold text-slate-200">3. 패턴 조합</h4>
        {blockSections.length > 0 ? (
          <div className="space-y-2" data-testid="trade-pattern-stack">
            <p className="text-xs rx-text-muted">
              전략 조합 · {combinationOperatorKo(trace?.combinationOperator ?? null)}
            </p>
            {blockSections.map((section) => (
              <div
                key={section.id}
                className="rounded-lg border border-slate-800 bg-slate-950/50 p-3"
                data-testid={`trade-block-${section.role}`}
              >
                <p className="text-sm font-medium text-slate-100">{section.title}</p>
                <ul className="mt-1 list-inside list-disc text-xs text-slate-300">
                  {section.items.map((line) => (
                    <li key={`${section.id}-${line}`}>{line}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        ) : trace?.patternType ? (
          <p className="text-xs text-slate-300">
            패턴 {patternFamilyKo(trace.patternType)}
            {trace.zoneHigh != null && trace.zoneLow != null
              ? ` · 존 ${trace.zoneLow}–${trace.zoneHigh}`
              : ""}
            {trace.penetrationPct != null
              ? ` · ${formatPenetrationKo(trace.penetrationPct)}`
              : ""}
          </p>
        ) : (
          <p className="text-xs rx-text-muted">저장된 패턴 근거가 없습니다.</p>
        )}
      </div>

      <div data-testid="trade-inspector-timeline">
        <h4 className="mb-2 text-sm font-semibold text-slate-200">
          4. 감지 → 리테스트 → 확인 → 진입
        </h4>
        <ol className="space-y-3 border-l-2 border-slate-700 pl-4">
          {timelineStages.map((stage) => (
            <li key={stage.key} className="relative">
              <span className="absolute -left-[1.35rem] top-1 h-2.5 w-2.5 rounded-full bg-slate-600 ring-2 ring-slate-950" />
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-medium text-slate-100">{stage.label}</span>
                <Badge tone={timelineStatusTone(stage.status)}>{stage.status}</Badge>
              </div>
              <div className="mt-0.5 text-xs rx-text-muted">
                {stage.time
                  ? /^\d+$/.test(stage.time)
                    ? formatKoreanDateTime(Number(stage.time))
                    : formatKoreanDateTime(Date.parse(stage.time))
                  : "시각 기록 없음"}
                {stage.price != null ? ` · ${stage.price.toLocaleString("ko-KR")}` : ""}
              </div>
              <p className="mt-0.5 text-xs text-slate-300">{stage.explanation}</p>
            </li>
          ))}
        </ol>
      </div>

      <div data-testid="trade-inspector-risk">
        <h4 className="mb-2 text-sm font-semibold text-slate-200">5. 손절·익절</h4>
        <dl className="grid grid-cols-2 gap-2 text-sm">
          <div className="rounded border border-slate-800 p-2">
            <dt className="text-xs rx-text-muted">손절</dt>
            <dd className="font-medium text-slate-100">
              {stopPrice != null ? stopPrice.toLocaleString("ko-KR") : "기록 없음"}
            </dd>
          </div>
          <div className="rounded border border-slate-800 p-2">
            <dt className="text-xs rx-text-muted">익절</dt>
            <dd className="font-medium text-slate-100">
              {targetPrice != null ? targetPrice.toLocaleString("ko-KR") : "기록 없음"}
            </dd>
          </div>
        </dl>
      </div>

      <div data-testid="trade-inspector-exit">
        <h4 className="mb-2 text-sm font-semibold text-slate-200">6. 청산 사유</h4>
        <p className="text-sm text-slate-100">{displaySignalReason(trade.exitReason)}</p>
        <p className="mt-1 text-xs rx-text-muted">
          {formatKoreanDateTime(trade.exitTime)} · {trade.exitPrice.toLocaleString("ko-KR")}
        </p>
      </div>

      <div data-testid="trade-inspector-cost">
        <h4 className="mb-2 text-sm font-semibold text-slate-200">7. 비용</h4>
        <dl className="grid grid-cols-2 gap-2 text-sm">
          <div className="rounded border border-slate-800 p-2">
            <dt className="text-xs rx-text-muted">수수료</dt>
            <dd className="font-medium text-slate-100">{formatUsdt(trade.feeCostUsdt)}</dd>
          </div>
          <div className="rounded border border-slate-800 p-2">
            <dt className="text-xs rx-text-muted">슬리피지</dt>
            <dd className="font-medium text-slate-100">{formatUsdt(trade.slippageCostUsdt)}</dd>
          </div>
        </dl>
      </div>

      <div data-testid="trade-inspector-risk-management">
        <h4 className="mb-2 text-sm font-semibold text-slate-200">8. 위험 관리</h4>
        <dl className="grid grid-cols-2 gap-2 text-sm">
          <div className="rounded border border-slate-800 p-2">
            <dt className="text-xs rx-text-muted">레버리지</dt>
            <dd className="font-medium text-slate-100">{trade.leverage.toFixed(2)}x</dd>
          </div>
          <div className="rounded border border-slate-800 p-2">
            <dt className="text-xs rx-text-muted">무효화</dt>
            <dd className="font-medium text-slate-100">
              {invalidationTime
                ? formatKoreanDateTime(Date.parse(invalidationTime))
                : "기록 없음"}
            </dd>
          </div>
        </dl>
      </div>

      <details className="rounded-lg border border-slate-800 p-3 text-xs text-slate-400">
        <summary className="cursor-pointer text-sm font-semibold text-slate-200">
          9. 개발자 정보
        </summary>
        <div className="mt-2 space-y-1 break-all font-mono">
          <p>tradeId: {trade.id}</p>
          {trace ? <p>traceId: {trace.tradeId}</p> : null}
          <p>developerMode: {developerMode ? "on" : "off"}</p>
        </div>
      </details>

      <div className="flex flex-wrap gap-2 border-t border-slate-800 pt-3">
        <Button size="sm" variant="outline" onClick={onPrev}>이전 거래</Button>
        <Button size="sm" variant="outline" onClick={onNext}>다음 거래</Button>
        <Button size="sm" variant="outline" onClick={onFocusChart}>차트 포커스</Button>
        <Button size="sm" variant="outline" onClick={onCopyId}>ID 복사</Button>
      </div>
    </div>
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
  const requestedToYmd = report.requestedTo?.slice(0, 10) ?? null;
  const futureDataOk =
    !requestedToYmd || !isFutureCalendarDate(requestedToYmd);
  const coverage = report.dataCoverage;
  const coverageOk = coverage ? coverage.sufficient : null;
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
          title: COVERAGE_UI.requestedPeriodKo,
          status: report.requestedFrom || report.fromDate ? "pass" : "unavailable",
          value: `${report.requestedFrom?.slice(0, 10) ?? report.fromDate ?? "-"} ~ ${report.requestedTo?.slice(0, 10) ?? report.toDate ?? "-"}`,
          explain: "요청한 조회 기간입니다.",
        },
        {
          title: COVERAGE_UI.actualPeriodKo,
          status: report.actualFirstCandleTime ? "pass" : "unavailable",
          value: `${report.actualFirstCandleTime?.slice(0, 16) ?? "-"} ~ ${report.actualLastCandleTime?.slice(0, 16) ?? "-"}`,
          explain: "실제로 로드된 첫·마지막 캔들 시각입니다.",
        },
        {
          title: COVERAGE_UI.candleCountKo,
          status: processed > 0 ? "pass" : "fail",
          value: coverage
            ? `${coverage.actualCandleCount.toLocaleString("ko-KR")} / ${coverage.expectedCandleCount.toLocaleString("ko-KR")}`
            : processed.toLocaleString("ko-KR"),
          explain: "요청 대비 실제 로드된 캔들 개수입니다.",
        },
        {
          title: COVERAGE_UI.coverageKo,
          status:
            coverageOk == null
              ? "unavailable"
              : coverageOk
                ? "pass"
                : "fail",
          value: coverage
            ? formatCoveragePercent(coverage.coverageRatio)
            : "데이터 없음",
          explain: "요청 구간 경계 대비 데이터 커버리지입니다. 비율은 참고 값입니다.",
        },
        {
          title: "타임프레임",
          status: report.timeframe ? "pass" : "unavailable",
          value: displayTimeframeLabel(report.timeframe),
          explain: "요청·처리 타임프레임입니다.",
        },
        {
          title: "미래 데이터 차단",
          status: futureDataOk ? "pass" : "fail",
          value: futureDataOk ? "정상" : "미래 달력 구간",
          explain: "요청 종료일이 오늘 이후 달력이면 실행이 거부됩니다. 실제 캔들이 요청보다 이른 것은 데이터 범위 문제입니다.",
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
        {
          title: "비용 가정 버전",
          status:
            report.costAssumptions?.version === COST_ASSUMPTIONS_VERSION
              ? "pass"
              : "warning",
          value: report.costAssumptions?.version ?? "레거시 (미기록)",
          explain: "이 결과를 만든 비용 모델 버전입니다. 없으면 레거시 결과입니다.",
        },
        {
          title: "수수료 요율",
          status: report.costAssumptions ? "pass" : "unavailable",
          value: report.costAssumptions
            ? `${formatDecimalRateAsPercentLabel(report.primaryCostAssumptions?.feeRate ?? report.costAssumptions.fee.effectiveRate)} · ${report.costAssumptions.fee.model}`
            : "레거시",
          explain: "엔진에 전달된 소수 요율을 퍼센트로 표시합니다.",
        },
        {
          title: "슬리피지 모델",
          status:
            report.slippageModelVersion === "execution_price_v1" ||
            report.costAssumptions?.slippage.modelVersion ===
              "execution_price_v1"
              ? "pass"
              : "warning",
          value:
            report.costAssumptions?.slippage.modelVersion ??
            report.slippageModelVersion ??
            "레거시",
          explain: "체결가 슬리피지 모델 여부입니다.",
        },
        {
          title: "펀딩 / 스프레드",
          status: report.costAssumptions ? "pass" : "unavailable",
          value: report.costAssumptions
            ? `펀딩 ${report.costAssumptions.funding.enabled ? "적용" : "미적용"} ${formatDecimalRateAsPercentLabel(report.costAssumptions.funding.configuredRate)} · 스프레드 ${report.costAssumptions.spread.enabled ? "적용" : "미적용"}`
            : "레거시",
          explain: "설정된 펀딩·스프레드 가정입니다.",
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
          title: displayStrategyHashLabel(),
          status: report.validation.paramsHashVerified ? "pass" : "warning",
          value: formatShortHash(report.strategyHash),
          explain: "실행 시점의 canonical strategyHash 검증 결과입니다.",
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
                {[...g.items]
                  .sort((a, b) => {
                    const rank = (s: Status) =>
                      s === "fail" ? 0 : s === "warning" ? 1 : s === "unavailable" ? 2 : 3;
                    return rank(a.status) - rank(b.status);
                  })
                  .map((item) => (
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
          마지막 청산 이후 캔들이 있는 달에 거래가 없습니다.{lastExitMs != null ? ` 마지막 청산: ${formatKoreanDateTime(lastExitMs)}.` : ""} 월별 거래 수는 아래 표에서 확인하세요.
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
  const tradeSpan = Math.max(1, tradeMax - tradeMin);
  const fitPad = Math.max(tradeSpan * 0.06, 6 * 3_600_000);
  const fullMin = tradeMin - (range === "all" ? fitPad : 0);
  const fullMax = tradeMax + (range === "all" ? fitPad : 0);
  const windowMs =
    range === "7d" ? 7 * 86_400_000 : range === "30d" ? 30 * 86_400_000 : null;
  const minT = windowMs ? fullMax - windowMs : fullMin;
  const maxT = fullMax;
  const span = Math.max(1, maxT - minT);
  const width = 960;
  const rowH = 96;
  const chartH = rowH * 2 + 56;

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
  const dayMs = 86_400_000;
  const axisMarks: { t: number; label: string }[] = [];
  if (span <= 45 * dayMs) {
    const stepDays = span <= 8 * dayMs ? 1 : span <= 21 * dayMs ? 2 : 3;
    const cursor = new Date(minT);
    cursor.setUTCHours(0, 0, 0, 0);
    if (cursor.getTime() <= minT) cursor.setTime(cursor.getTime() + dayMs);
    while (cursor.getTime() < maxT && axisMarks.length < 14) {
      axisMarks.push({
        t: cursor.getTime(),
        label: cursor.toLocaleDateString("ko-KR", {
          timeZone: "Asia/Seoul",
          month: "numeric",
          day: "numeric",
        }),
      });
      cursor.setUTCDate(cursor.getUTCDate() + stepDays);
    }
  } else {
    for (const t of monthMarks) {
      axisMarks.push({
        t,
        label: new Date(t).toLocaleDateString("ko-KR", {
          timeZone: "Asia/Seoul",
          month: "short",
        }),
      });
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
              x={x1 - 8}
              y={midY - 22}
              width={segW + 16}
              height={44}
              fill="transparent"
            />
            <rect
              x={x1}
              y={midY - 14}
              width={segW}
              height={28}
              rx={6}
              fill={s.profitable ? CHART_THEME.up : CHART_THEME.down}
              opacity={selected ? 1 : 0.92}
              stroke={selected ? "#fff" : "transparent"}
              strokeWidth={selected ? 2 : 0}
            />
            <circle cx={x1} cy={midY} r={6} fill="#f8fafc" stroke="#0f172a" strokeWidth={1.5} />
            <rect
              x={x2 - 6}
              y={midY - 6}
              width={12}
              height={12}
              rx={2}
              fill="#e2e8f0"
              stroke="#0f172a"
              strokeWidth={1.5}
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
    <div className="v3-bt-timeline-canvas overflow-x-auto" data-testid="timeline-lanes">
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
          viewBox={`0 0 ${width} ${chartH}`}
          width="100%"
          height={chartH}
          preserveAspectRatio="xMidYMid meet"
          className="block w-full"
          style={{ fontFamily: CHART_THEME.fontFamily }}
        >
          {axisMarks.map((mark) => {
            const x = 56 + ((mark.t - minT) / span) * (width - 64);
            return (
              <g key={mark.t}>
                <line
                  x1={x}
                  x2={x}
                  y1={8}
                  y2={rowH * 2 + 4}
                  stroke="#475569"
                  strokeDasharray="3 4"
                />
                <text
                  x={x + 2}
                  y={16}
                  fill={CHART_THEME.axisLabel}
                  fontSize={11}
                  fontWeight={600}
                  fontFamily={CHART_THEME.fontFamily}
                >
                  {mark.label}
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

