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
import { Badge, Button, Card, Metric } from "@/components/ui/primitives";
import { EmptyState } from "@/components/rextora/EmptyState";
import { CHART_THEME } from "@/src/lib/rextora/charts/theme";
import type { BacktestReport } from "@/src/lib/rextora/backtest/backtestTypes";
import type { BacktestTrade } from "@/src/lib/rextora/backtest/backtestEngine";
import type { OhlcvCandle } from "@/src/lib/rextora/data/ohlcvTypes";
import type { MonthlyCoverageRow } from "@/src/lib/rextora/backtest/monthlyCoverage";
import { displayParamsHashLabel, displaySignalReason, displayTimeframeLabel } from "@/src/lib/rextora/displayLabels";

type TradeFilter = "all" | "long" | "short" | "win" | "loss" | "stop_loss" | "take_profit";
type Tone = "default" | "success" | "danger" | "warning";

const FILTERS: Array<{ id: TradeFilter; label: string }> = [
  { id: "all", label: "전체" }, { id: "long", label: "롱" }, { id: "short", label: "숏" },
  { id: "win", label: "이익 거래" }, { id: "loss", label: "손실 거래" },
  { id: "stop_loss", label: "손절" }, { id: "take_profit", label: "익절" },
];
const PAGE_SIZE = 50;
const SECTIONS = [
  { id: "summary", label: "요약" }, { id: "price", label: "가격 차트" }, { id: "equity", label: "자산과 낙폭" },
  { id: "timeline", label: "거래 타임라인" }, { id: "monthly", label: "월별 성과" }, { id: "distribution", label: "거래 분포" },
  { id: "cost", label: "비용 분석" }, { id: "trades", label: "거래 목록" }, { id: "validation", label: "검증 결과" },
] as const;
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
  return <section id={`bt-${id}`} data-section={id} className="scroll-mt-16">{children}</section>;
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
}: {
  report: BacktestReport; trades: BacktestTrade[]; equityCurve: number[]; candles: OhlcvCandle[];
  chartSamplingApplied?: boolean; processedCandleCount?: number;
}) {
  const model = useMemo(() => buildVisualAnalysisModel({ report, trades, equityCurve, candles }), [report, trades, equityCurve, candles]);
  const processed = processedCandleCount ?? report.processedCandleCount ?? report.candleCount;
  const hasProcessedCandles = processed > 0 && model.priceCandles.length > 0;
  const hasTrades = model.trades.length > 0;
  const [tradeFilter, setTradeFilter] = useState<TradeFilter>("all");
  const [selectedTradeId, setSelectedTradeId] = useState<string | null>(null);
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
  const rowRefs = useRef<Map<string, HTMLElement>>(new Map());
  const rootRef = useRef<HTMLDivElement>(null);

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
    return list;
  }, [model.trades, tradeFilter, search]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount - 1);
  const pageRows = filtered.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE);

  useEffect(() => {
    if (!selectedTradeId) return;
    rowRefs.current.get(selectedTradeId)?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [selectedTradeId]);

  const markers = useMemo(() => {
    const ids = new Set(filtered.map((t) => t.id));
    return model.tradeMarkers.filter((m) => !m.tradeId || ids.has(m.tradeId));
  }, [model.tradeMarkers, filtered]);

  const selectTrade = useCallback((id: string | null) => {
    setSelectedTradeId(id);
    if (id) { setDrawerTrade(model.trades.find((x) => x.id === id) ?? null); setTechOpen(false); }
    else setDrawerTrade(null);
  }, [model.trades]);

  const scrollToSection = (id: string) => {
    document.getElementById(`bt-${id}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
    setActiveSection(id);
  };

  const navigateTrade = (dir: -1 | 1) => {
    if (!drawerTrade) return;
    const idx = model.trades.findIndex((t) => t.id === drawerTrade.id);
    const next = model.trades[idx + dir];
    if (next) selectTrade(next.id);
  };

  const chips = statusChips({ totalReturn: report.totalReturn, mdd: report.mdd, totalCostPctOfInitial: model.costs.totalCostPctOfInitialCapital, tradeCount: report.tradeCount });
  const netProfit = report.endingBalance - report.startingBalance;
  const dataSourceLabel = report.dataSource === "binance" ? "Binance Futures 과거 데이터" : "테스트용 합성 데이터";
  const samplingNote = samplingFromApi || model.chartSamplingApplied ? "차트 표시용 샘플링 적용 (지표·거래 계산은 전체 캔들 기준)" : null;
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

  return (
    <div className="space-y-4 overflow-x-hidden" data-testid="backtest-analysis" ref={rootRef}>
      <nav className="sticky top-0 z-30 -mx-1 overflow-x-auto border-b border-slate-800 bg-slate-950/95 px-1 py-2 backdrop-blur" data-testid="analysis-section-nav" aria-label="분석 섹션">
        <div className="flex min-w-max gap-1">
          {SECTIONS.map((s) => (
            <button key={s.id} type="button" className={`min-h-11 whitespace-nowrap rounded-md px-3 py-1.5 text-xs sm:min-h-0 ${activeSection === s.id ? "bg-sky-600 text-white" : "bg-slate-900 rx-text-muted hover:text-slate-200"}`} onClick={() => scrollToSection(s.id)} aria-current={activeSection === s.id ? "true" : undefined}>{s.label}</button>
          ))}
        </div>
      </nav>

      {report.zeroTradeDiagnostics && report.tradeCount === 0 && (
        <Card title="무거운 진단" data-testid="backtest-zero-trade"><p className="text-sm text-slate-300">{report.zeroTradeDiagnostics.explanationKo}</p></Card>
      )}

      <SectionAnchor id="summary">
        <Card title="결과 요약" data-testid="backtest-summary">
          <div className="mb-3 flex flex-wrap gap-3 text-xs rx-text-muted">
            <span>데이터 출처: {dataSourceLabel}</span>
            <span>실제 캔들: {report.actualFirstCandleTime ? formatKoreanDateTime(new Date(report.actualFirstCandleTime).getTime()) : "-"} ~ {report.actualLastCandleTime ? formatKoreanDateTime(new Date(report.actualLastCandleTime).getTime()) : "-"}</span>
            <span>처리 캔들: {processed.toLocaleString("ko-KR")}</span>
            {samplingNote && <span data-testid="chart-sampling-note">{samplingNote}</span>}
          </div>
          <div className="mb-3 flex flex-wrap gap-2" data-testid="status-chips">{chips.map((c) => <Badge key={c.id} tone={c.tone}>{c.labelKo}</Badge>)}</div>
          <HelpTitle title="핵심 성과" help="최종 자산·순손익·수익률·최대 낙폭은 시작 자본 대비 결과입니다. 전략 판정은 고정 임계값으로만 산출됩니다." />
          <MetricsGrid items={[
            { label: "최종 자산", value: formatUsdt(report.endingBalance) },
            { label: "순손익", value: formatUsdt(netProfit), tone: netProfit >= 0 ? "success" : "danger" },
            { label: "총수익률", value: formatPct(report.totalReturn), tone: report.totalReturn >= 0 ? "success" : "danger" },
            { label: "최대 낙폭", value: formatPct(report.mdd), tone: "danger" },
            { label: "전략 판정", value: model.verdict.primary, help: model.verdict.summaryKo },
          ]} />
          <div className="mb-4 rounded-lg border border-amber-500/30 bg-amber-950/20 p-4" data-testid="backtest-verdict">
            <p className="text-base font-medium text-slate-100">{model.verdict.summaryKo}</p>
            <div className="mt-2 flex flex-wrap gap-2">{model.verdict.labels.map((l) => <Badge key={l}>{l}</Badge>)}</div>
          </div>
          <HelpTitle title="거래 품질" help="승률은 이익 거래 비율, 손익비는 총이익÷총손실입니다. 1보다 크면 이익이 손실보다 큽니다." />
          <MetricsGrid cols="md:grid-cols-3 lg:grid-cols-6" items={[
            { label: "거래 수", value: report.tradeCount },
            { label: "승률", value: formatPct(report.winRate, 1) },
            { label: "평균 거래", value: formatPct(report.averageTrade) },
            { label: "손익비", value: report.profitFactor.toFixed(2) },
            { label: "최대 수익", value: formatPct(model.trades.reduce((m, t) => Math.max(m, t.pnlPct), 0)), tone: "success" },
            { label: "최대 손실", value: formatPct(model.trades.reduce((m, t) => Math.min(m, t.pnlPct), 0)), tone: "danger" },
          ]} />
          <HelpTitle title="비용 영향" help={model.costs.denominatorNoteKo} />
          <MetricsGrid items={[
            { label: "총 거래비용", value: formatUsdt(model.costs.totalCostUsdt), help: formatPct(model.costs.totalCostPctOfInitialCapital) },
            { label: "수수료", value: formatUsdt(model.costs.feeCostUsdt), help: formatPct(model.costs.feeCostPctOfInitialCapital) },
            { label: "슬리피지", value: formatUsdt(model.costs.slippageCostUsdt) },
            { label: "스프레드", value: formatUsdt(model.costs.spreadCostUsdt) },
            { label: "펀딩비", value: formatUsdt(model.costs.fundingCostUsdt) },
          ]} />
        </Card>
      </SectionAnchor>

      <SectionAnchor id="price">
        {hasProcessedCandles ? (
          <div data-testid="backtest-price-chart">
            <div className="mb-2 flex flex-wrap gap-2">{FILTERS.map((f) => <Button key={f.id} size="sm" variant={tradeFilter === f.id ? "primary" : "outline"} onClick={() => { setTradeFilter(f.id); setPage(0); }}>{f.label}</Button>)}</div>
            <p className="mb-2 text-[11px] rx-text-muted">마커 표시/숨김과 표시 형태를 조절하세요. 십자선은 마우스와 터치 빈 공간에서 가장 가까운 봉에 고정됩니다.</p>
            <CandlestickChart title={`${report.symbol} · ${tfLabel}`} help="실제 OHLCV입니다. 일반 휠은 페이지 스크롤만 합니다. Ctrl+휠로 확대/축소합니다." candles={model.sampledPriceCandles} markers={markers} height={600} showVolume selectedTradeId={selectedTradeId} onSelectTrade={selectTrade} symbolLabel={report.symbol} timeframeLabel={tfLabel} strategyName={report.strategyName} />
          </div>
        ) : <CompactEmpty message="처리된 캔들이 없어 가격 차트를 표시하지 않습니다." />}
      </SectionAnchor>

      <SectionAnchor id="equity">
        {hasProcessedCandles ? (
          <div className="grid gap-4 xl:grid-cols-2">
            <EquityCurveChart title="자산 곡선" help="세로축은 USDT 자산입니다." series={model.equitySeries} height={320} unit="usdt" syncCrosshairX={syncX} onCrosshairX={setSyncX} />
            <DrawdownChart title="낙폭" help="최고점 대비 하락률(%)입니다." series={model.drawdownSeries} height={320} syncCrosshairX={syncX} onCrosshairX={setSyncX} />
          </div>
        ) : <CompactEmpty message="자산·낙폭 차트를 표시할 결과가 없습니다." />}
      </SectionAnchor>

      <SectionAnchor id="timeline">
        <Card title="거래 타임라인" data-testid="backtest-timeline">
          <HelpTitle title="롱·숏 보유 구간" help="막대는 진입~청산 구간입니다. 전체 기간 축은 캔들 범위를 사용합니다." />
          <MonthlyCoveragePanel rows={model.monthlyCoverage} lastExitMs={model.ledgerRange.lastExitMs} candleEndMs={model.ledgerRange.lastCandleMs} />
          {hasTrades ? (
            <>
              <MetricsGrid cols="sm:grid-cols-4 lg:grid-cols-7" items={[
                { label: "총 거래", value: model.timelineSummary.total },
                { label: "롱", value: model.timelineSummary.longCount },
                { label: "숏", value: model.timelineSummary.shortCount },
                { label: "평균 보유", value: formatDurationMs(model.timelineSummary.avgHoldMs) },
                { label: "중앙 보유", value: formatDurationMs(model.timelineSummary.medianHoldMs) },
                { label: "최장 보유", value: formatDurationMs(model.timelineSummary.maxHoldMs) },
                { label: "일평균 거래", value: model.timelineSummary.tradesPerDay.toFixed(1) },
              ]} />
              <div className="mb-3"><FilterButtons options={[["all", "전체 기간"], ["7d", "7일"], ["30d", "30일"]]} value={timelineRange} onChange={setTimelineRange} /></div>
              <TimelineLanes long={model.tradeTimelineGroups.long} short={model.tradeTimelineGroups.short} selectedId={selectedTradeId} onSelect={selectTrade} range={timelineRange} sideFilter={timelineSide} resultFilter={timelineResult} domainStartMs={model.ledgerRange.firstCandleMs ?? model.ledgerRange.firstEntryMs} domainEndMs={model.ledgerRange.lastCandleMs ?? model.ledgerRange.lastExitMs} />
              <div className="mt-2 space-y-2">
                <FilterButtons options={[["all", "전체"], ["long", "롱만"], ["short", "숏만"]]} value={timelineSide} onChange={setTimelineSide} />
                <FilterButtons options={[["all", "전체 결과"], ["win", "이익 거래"], ["loss", "손실 거래"]]} value={timelineResult} onChange={setTimelineResult} />
              </div>
            </>
          ) : <CompactEmpty message="표시할 거래 구간이 없습니다." />}
        </Card>
      </SectionAnchor>

      {hasTrades ? (
        <>
          <SectionAnchor id="monthly">
            <Card title="월별 성과" data-testid="backtest-monthly">
              <HelpTitle title="달력 월 집계" help="UTC 달력 월 기준으로 청산 시각을 묶어 시작 자본 대비 수익률을 계산합니다." />
              <MetricsGrid cols="sm:grid-cols-3 lg:grid-cols-7" items={[
                { label: "수익 월", value: model.monthlySummary.profitableMonths }, { label: "손실 월", value: model.monthlySummary.losingMonths },
                { label: "최고 월", value: model.monthlySummary.bestMonth?.labelKo ?? "-", help: formatPct(model.monthlySummary.bestMonth?.returnPctOfInitial ?? 0) },
                { label: "최저 월", value: model.monthlySummary.worstMonth?.labelKo ?? "-", help: formatPct(model.monthlySummary.worstMonth?.returnPctOfInitial ?? 0) },
                { label: "월평균 수익률", value: formatPct(model.monthlySummary.avgMonthlyReturnPct) },
                { label: "월별 표준편차", value: formatPct(model.monthlySummary.stdMonthlyReturnPct) },
                { label: "연속 손실 월", value: model.monthlySummary.consecutiveLosingMonths },
              ]} />
              <BarChart title="월별 수익률" series={monthlySeries} height={300} diverging />
              <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {model.monthlyReturns.map((m) => (
                  <div key={m.monthKey} data-testid="monthly-label" className={`rounded-lg border p-3 ${m.returnPctOfInitial >= 0 ? "border-emerald-900/50 bg-emerald-950/20" : "border-rose-900/50 bg-rose-950/20"}`}>
                    <div className="font-medium text-slate-100">{m.labelKo}</div>
                    <div className={`text-lg ${m.returnPctOfInitial >= 0 ? "text-emerald-300" : "text-rose-300"}`}>{formatPct(m.returnPctOfInitial)}</div>
                    <div className="mt-1 space-y-0.5 text-xs rx-text-muted">
                      <div>순손익 {formatUsdt(m.netPnlUsdt)}</div>
                      <div>거래 {m.tradeCount} · 승률 {formatPct(m.winRate, 1)}</div>
                      <div>비용 {formatUsdt(m.totalCostUsdt)}</div>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          </SectionAnchor>

          <SectionAnchor id="distribution">
            <div className="grid gap-4 xl:grid-cols-2" data-testid="backtest-distribution">
              <Card title="손익·청산 분포">
                <HelpTitle title="거래 결과 분류" help="이익·손실·보합은 손익률 기준, 손절·익절·시간 청산은 청산 사유 기준입니다." />
                <div className="space-y-3">{model.exitCategoryBuckets.map((b) => <ExitBucketRow key={b.id} b={b} />)}</div>
                <div className="mt-4">
                  <DistributionChart title="이익 / 손실 / 보합" height={300} bins={[
                    { label: `이익 (${model.winLossSummary.wins})`, value: model.winLossSummary.wins, tone: "up" },
                    { label: `손실 (${model.winLossSummary.losses})`, value: model.winLossSummary.losses, tone: "down" },
                    { label: `보합 (${model.winLossSummary.flats})`, value: model.winLossSummary.flats, tone: "neutral" },
                  ]} />
                </div>
              </Card>
              <Card title="보유 시간 분석">
                <HelpTitle title="보유 기간 버킷" help="진입~청산 소요시간을 한국어 구간으로 묶습니다." />
                <div className="space-y-3">{model.holdingTimeBuckets.map((b) => <HoldBucketRow key={b.label} b={b} best={bestHold?.label} costly={costliestHold?.label} />)}</div>
                {bestHold && <p className="mt-3 text-sm text-slate-300">분석: 평균 수익률이 가장 높은 보유 구간은 {bestHold.label}({formatPct(bestHold.avgReturnPct)})이며, 평균 비용이 가장 큰 구간은 {costliestHold?.label}({formatUsdt(costliestHold?.avgTotalCostUsdt ?? 0)})입니다.</p>}
              </Card>
            </div>
          </SectionAnchor>

          <SectionAnchor id="cost">
            <Card title="비용 분석" data-testid="backtest-cost-analysis">
              <MetricsGrid cols="md:grid-cols-5" items={[
                { label: "수수료", value: formatUsdt(model.costs.feeCostUsdt), help: `${formatPct(model.costs.feeCostPctOfInitialCapital)} (시작자본)` },
                { label: "슬리피지", value: formatUsdt(model.costs.slippageCostUsdt), help: `${formatPct(model.costs.slippageCostPctOfInitialCapital)} (시작자본)` },
                { label: "스프레드", value: formatUsdt(model.costs.spreadCostUsdt), help: `${formatPct(model.costs.spreadCostPctOfInitialCapital)} (시작자본)` },
                { label: "펀딩비", value: formatUsdt(model.costs.fundingCostUsdt), help: `${formatPct(model.costs.fundingCostPctOfInitialCapital)} (시작자본)` },
                { label: "총 비용", value: formatUsdt(model.costs.totalCostUsdt), help: `${formatPct(model.costs.totalCostPctOfInitialCapital)} (시작자본)` },
              ]} />
              <HelpTitle title="비용 구성" help="총 거래비용 USDT 내부 구성 비율입니다." />
              <div className="mb-2 flex h-4 overflow-hidden rounded">{costParts.map((p) => <div key={p.label} style={{ width: `${(p.v / costSum) * 100}%`, background: p.c }} title={`${p.label} ${formatUsdt(p.v)}`} />)}</div>
              <div className="mb-4 flex flex-wrap gap-3 text-xs rx-text-muted">{costParts.map((p) => <span key={p.label}>{p.label} {((p.v / costSum) * 100).toFixed(1)}%</span>)}</div>
              <MetricsGrid cols="md:grid-cols-4" items={[
                { label: "비용 전 손익", value: formatUsdt(model.costs.grossPnlBeforeCostsUsdt) },
                { label: "총 비용", value: formatUsdt(model.costs.totalCostUsdt) },
                { label: "비용 후 순손익", value: formatUsdt(model.costs.netPnlAfterCostsUsdt), tone: model.costs.netPnlAfterCostsUsdt >= 0 ? "success" : "danger" },
                { label: "원장 일치", value: model.costs.reconciled ? "일치" : "확인 필요", tone: model.costs.reconciled ? "success" : "warning" },
              ]} />
              {costDominates && <div className="mb-4 rounded-lg border border-amber-600/50 bg-amber-950/30 p-3 text-sm text-amber-100" data-testid="cost-warning">총 거래비용({formatUsdt(model.costs.totalCostUsdt)})이 순손익 절댓값보다 큽니다. (투자 권유가 아닙니다.)</div>}
              <HelpTitle title="누적 비용 (USDT)" help="거래 순서대로 USDT 비용을 누적합니다." />
              <div className="mb-2 flex flex-wrap gap-2">
                {([["fees", "수수료"], ["slippage", "슬리피지"], ["spread", "스프레드"], ["funding", "펀딩비"], ["total", "총비용만"]] as const).map(([key, label]) => (
                  <label key={key} className="flex items-center gap-1 text-xs rx-text-muted"><input type="checkbox" checked={costToggles[key]} onChange={() => setCostToggles((s) => ({ ...s, [key]: !s[key] }))} />{label}</label>
                ))}
              </div>
              <EquityCurveChart title="누적 비용" series={costSeries} height={300} unit="usdt" area={false} />
            </Card>
          </SectionAnchor>

          <div className="grid gap-4 lg:grid-cols-2">
            <EquityCurveChart title={`롤링 승률 (최근 ${ROLLING_WINDOW}거래)`} series={{ id: "rw", name: "승률 %", color: CHART_THEME.up, data: model.rollingWinRatePoints }} height={280} unit="percent" area={false} />
            <EquityCurveChart title={`롤링 손익비 (최근 ${ROLLING_WINDOW}거래)`} series={{ id: "rpf", name: "손익비", color: CHART_THEME.accent, data: model.rollingProfitFactorPoints }} height={280} unit="raw" area={false} />
          </div>
        </>
      ) : <CompactEmpty message="거래 기반 분석 차트를 표시하지 않습니다." />}

      <SectionAnchor id="trades">
        {hasTrades && (
          <Card title="거래 목록" data-testid="backtest-trade-list">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <input className="min-h-11 rounded border border-slate-700 bg-slate-950 px-3 py-2 text-sm" placeholder="거래번호 또는 심볼 검색" value={search} onChange={(e) => { setSearch(e.target.value); setPage(0); }} />
              <span className="text-xs rx-text-muted">{filtered.length}건 · {safePage + 1}/{pageCount} 페이지</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1100px] text-left text-sm">
                <thead className="sticky top-0 bg-slate-950 rx-text-muted"><tr>{TRADE_HEADERS.map((h) => <th key={h} className="whitespace-nowrap px-2 py-2 font-medium">{h}</th>)}</tr></thead>
                <tbody>{pageRows.map((t) => <TradeTableRow key={t.id} t={t} selected={selectedTradeId === t.id} onSelect={() => selectTrade(t.id)} rowRef={(el) => { if (el) rowRefs.current.set(t.id, el); }} />)}</tbody>
              </table>
            </div>
            <div className="mt-3 flex gap-2">
              <Button size="sm" variant="outline" disabled={safePage === 0} onClick={() => setPage((p) => Math.max(0, p - 1))}>이전</Button>
              <Button size="sm" variant="outline" disabled={safePage >= pageCount - 1} onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}>다음</Button>
            </div>
          </Card>
        )}
      </SectionAnchor>

      {drawerTrade && <TradeDetailDrawer trade={drawerTrade} candles={model.sampledPriceCandles} techOpen={techOpen} setTechOpen={setTechOpen} onPrev={() => navigateTrade(-1)} onNext={() => navigateTrade(1)} onFocusChart={() => scrollToSection("price")} onClose={() => { setDrawerTrade(null); setSelectedTradeId(null); }} onCopyId={() => { void navigator.clipboard?.writeText(drawerTrade.id); }} />}

      <SectionAnchor id="validation">
        <Card title="검증 상태" data-testid="backtest-validation"><ValidationGrid report={report} processed={processed} /></Card>
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

function TradeDetailDrawer({ trade, candles, techOpen, setTechOpen, onPrev, onNext, onFocusChart, onClose, onCopyId }: {
  trade: EnrichedTrade; candles: Array<{ time: number; open: number; high: number; low: number; close: number }>;
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
        <ol className="space-y-2 border-l border-slate-700 pl-3 text-sm rx-text-secondary">
          <li>신호 · {trade.signalType}</li>
          <li>진입 · {formatKoreanDateTime(trade.entryTime)}</li>
          <li>보유 · {formatDurationMs(trade.holdMs)}</li>
          <li>청산 · {displaySignalReason(trade.exitReason)} · {formatKoreanDateTime(trade.exitTime)}</li>
          <li>최종 · {formatUsdt(trade.netPnlUsdt)} ({formatPct(trade.pnlPct)})</li>
        </ol>
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

function ValidationGrid({ report, processed }: { report: BacktestReport; processed: number }) {
  const cards = [
    { group: "전략", items: [
      { title: "파라미터 해시 검증", ok: report.validation.paramsHashVerified, value: report.validation.paramsHashVerified ? "검증됨" : "확인 필요", explain: "보호 전략 파라미터 해시가 저장된 값과 일치하는지 확인합니다." },
      { title: "SAFE 해시", ok: report.strategyHash?.startsWith("7893ca3f0e30") ?? false, value: report.strategyHash, explain: "전략 식별 해시입니다." },
    ]},
    { group: "데이터", items: [
      { title: "데이터 출처", ok: report.dataSource === "binance", value: report.dataSource === "binance" ? "Binance Futures" : "synthetic-test", explain: "운영 백테스트는 Binance 과거 데이터를 사용합니다." },
      { title: "요청 기간", ok: true, value: `${report.requestedFrom?.slice(0, 10) ?? report.fromDate ?? "-"} ~ ${report.requestedTo?.slice(0, 10) ?? report.toDate ?? "-"}`, explain: "요청한 조회 기간입니다." },
      { title: "실제 캔들 범위", ok: Boolean(report.actualFirstCandleTime), value: `${report.actualFirstCandleTime?.slice(0, 16) ?? "-"} ~ ${report.actualLastCandleTime?.slice(0, 16) ?? "-"}`, explain: "실제로 로드된 첫·마지막 캔들 시각입니다." },
      { title: "처리 캔들 수", ok: processed > 0, value: processed.toLocaleString("ko-KR"), explain: "엔진이 처리한 캔들 개수입니다.", fail: "기간·심볼·타임프레임을 확인하세요." },
      { title: "타임프레임", ok: Boolean(report.timeframe), value: displayTimeframeLabel(report.timeframe), explain: "요청·처리 타임프레임입니다." },
    ]},
    { group: "비용", items: [
      { title: "수수료 적용", ok: report.validation.feesApplied, value: report.validation.feesApplied ? "적용" : "미적용", explain: "수수료가 시뮬레이션에 반영되었는지입니다." },
      { title: "슬리피지 적용", ok: report.validation.slippageApplied, value: report.validation.slippageApplied ? "적용" : "미적용", explain: "슬리피지 반영 여부입니다." },
      { title: "스프레드 적용", ok: true, value: report.validation.spreadApplied ? "적용" : "미적용(설정)", explain: "스프레드 옵션 적용 여부입니다." },
      { title: "펀딩비 적용", ok: true, value: report.validation.fundingApplied ? "적용" : "미적용(설정)", explain: "펀딩비 옵션 적용 여부입니다." },
    ]},
    { group: "안전", items: [
      { title: "실주문 차단", ok: report.validation.noRealOrders === true, value: "주문 없음", explain: "백테스트는 실주문을 생성하지 않습니다." },
      { title: displayParamsHashLabel(), ok: report.validation.paramsHashVerified, value: report.strategyHash?.slice(0, 12) ?? "-", explain: "파라미터 해시 검증 결과입니다." },
    ]},
  ];
  return (
    <div className="space-y-4">{cards.map((g) => (
      <div key={g.group}>
        <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide rx-text-muted">{g.group} 검증</h4>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{g.items.map((item) => (
          <div key={item.title} className="rounded-lg border border-slate-800 bg-slate-950/50 p-3" data-testid={`validation-card-${item.title}`}>
            <div className="mb-1 flex items-center gap-2">
              <span aria-hidden className={`text-sm ${item.ok ? "text-emerald-400" : "text-amber-400"}`}>{item.ok ? "✓" : "!"}</span>
              <span className="text-sm font-medium text-slate-200">{item.title}</span>
              <Badge tone={item.ok ? "success" : "warning"}>{item.ok ? "통과" : "확인"}</Badge>
            </div>
            <div className="truncate text-xs text-slate-300">{item.value}</div>
            <p className="mt-1 text-[11px] rx-text-muted">{item.explain}</p>
            {!item.ok && "fail" in item && item.fail && <p className="mt-1 text-[11px] text-amber-300">{item.fail}</p>}
          </div>
        ))}</div>
      </div>
    ))}</div>
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

