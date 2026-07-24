"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Badge, Button, Card, Metric } from "@/components/ui/primitives";
import type { StoredStrategy } from "@/src/lib/rextora/strategy/strategyTypes";
import { SAFE_STRATEGY_ID } from "@/src/lib/rextora/strategy/strategyTypes";
import type {
  BacktestReport,
  SavedBacktestResult,
} from "@/src/lib/rextora/backtest/backtestTypes";
import type { BacktestTrade } from "@/src/lib/rextora/backtest/backtestEngine";
import { BacktestAnalysisView } from "@/components/rextora/charts/BacktestAnalysisView";
import type { OhlcvCandle } from "@/src/lib/rextora/data/ohlcvTypes";
import {
  displayParamsHashLabel,
  displayTimeframeLabel,
} from "@/src/lib/rextora/displayLabels";
import { EmptyState } from "@/components/rextora/EmptyState";
import {
  BACKTEST_PERIOD_PRESETS,
  computeDayPresetRange,
  toDateInput,
  validateBacktestCalendarRange,
} from "@/src/lib/rextora/backtest/backtestDateRange";
import {
  evaluateBacktestEligibility,
  eligibilityBlocksPaperLive,
} from "@/src/lib/rextora/backtest/backtestEligibility";
import { computeCostRatios } from "@/src/lib/rextora/backtest/costRatios";
import {
  formatSavedRunOptionLabel,
  backtestStatusLabelKo,
  dataVersionLabelKo,
} from "@/src/lib/rextora/backtest/savedRunLabels";
import {
  configuredBacktestSymbols,
  resolveStrategySymbolCompatibility,
} from "@/src/lib/rextora/backtest/strategySymbolCompatibility";
import type { StoredStrategyV1 } from "@/src/lib/rextora/strategy/definition/bridge";
import type { AvailableCandleDateRange } from "@/src/lib/rextora/backtest/backtestDateRange";

function sourceTypeLabelKo(source: string | null | undefined): string {
  if (source === "user_backtest_run") return "사용자 실행";
  if (source === "research_evaluation") return "탐색 평가";
  return source ?? "사용자 실행";
}

function metricOrUnavailable(
  value: number | null | undefined,
  format: (v: number) => string,
): string {
  if (value == null || !Number.isFinite(value)) return "데이터 없음";
  return format(value);
}

function syncBacktestStrategyUrl(
  nextStrategyId: string,
  nextSymbol?: string | null,
  options?: { clearRunId?: boolean },
) {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  if (nextStrategyId) {
    url.searchParams.set("strategyId", nextStrategyId);
  } else {
    url.searchParams.delete("strategyId");
  }
  if (nextSymbol) {
    url.searchParams.set("symbol", nextSymbol.toUpperCase());
  } else {
    url.searchParams.delete("symbol");
  }
  if (options?.clearRunId) {
    url.searchParams.delete("runId");
  }
  const next = `${url.pathname}${url.search}${url.hash}`;
  window.history.replaceState(window.history.state, "", next);
}

/**
 * Default Backtest workbench: select discovered strategy → choose period →
 * execute a persisted user Backtest Run. Expert cost/AST controls stay on
 * /backtest?expert=1.
 */
export function BacktestReviewWorkbench() {
  const searchParams = useSearchParams();
  const initialStrategyId = searchParams.get("strategyId");
  const expertQuery = searchParams.get("expert") === "1";
  const initialRunId = searchParams.get("runId");
  const initialSymbol = (searchParams.get("symbol") ?? "").toUpperCase();

  const today = useMemo(() => new Date(), []);
  const defaultFrom = useMemo(() => {
    const d = new Date(today.getTime() - 60 * 86400000);
    return toDateInput(d);
  }, [today]);
  const defaultTo = useMemo(() => toDateInput(today), [today]);

  const [strategies, setStrategies] = useState<StoredStrategy[]>([]);
  const [strategyId, setStrategyId] = useState(initialStrategyId ?? "");
  const [symbol, setSymbol] = useState(initialSymbol || "BTCUSDT");
  const [symbolQuery, setSymbolQuery] = useState("");
  const [providerSymbols, setProviderSymbols] = useState<string[]>(() =>
    configuredBacktestSymbols(),
  );
  const [symbolDataRange, setSymbolDataRange] =
    useState<AvailableCandleDateRange | null>(null);
  const [savedRunSymbolFilter, setSavedRunSymbolFilter] = useState<
    "current" | "all"
  >("current");
  const [fromDate, setFromDate] = useState(defaultFrom);
  const [toDate, setToDate] = useState(defaultTo);
  const [loading, setLoading] = useState(false);
  /** Run-card feedback (validation / loading / success / error). */
  const [runFeedback, setRunFeedback] = useState("");
  /** Paper / Live action feedback (separate from Run card). */
  const [actionMessage, setActionMessage] = useState("");
  const [report, setReport] = useState<BacktestReport | null>(null);
  const [presetBusy, setPresetBusy] = useState(false);
  const [trades, setTrades] = useState<BacktestTrade[]>([]);
  const [equityCurve, setEquityCurve] = useState<number[]>([]);
  const [candles, setCandles] = useState<OhlcvCandle[]>([]);
  const [chartSamplingApplied, setChartSamplingApplied] = useState(false);
  const [processedCandleCount, setProcessedCandleCount] = useState(0);
  const [chartReproWarning, setChartReproWarning] = useState<string | null>(
    null,
  );
  const [chartSource, setChartSource] = useState<
    "persisted" | "legacy_remote_hydrate" | "live_run" | null
  >(null);
  const [actionBusy, setActionBusy] = useState(false);
  const [expertMode, setExpertMode] = useState(false);
  const [safeFallbackNotice, setSafeFallbackNotice] = useState(false);
  const [paperSessionStrategyId, setPaperSessionStrategyId] = useState<
    string | null
  >(null);
  const [savedRuns, setSavedRuns] = useState<SavedBacktestResult[]>([]);
  const [selectedRunId, setSelectedRunId] = useState(initialRunId ?? "");
  const chartHydrateRunIdRef = useRef<string | null>(null);
  const appliedInitialRunRef = useRef(false);
  const [costSummary, setCostSummary] = useState<string>(
    "수수료·슬리피지: 시스템 설정 기본값",
  );
  const [runInFlight, setRunInFlight] = useState(false);
  const runLock = useRef(false);
  const [activeNavSection, setActiveNavSection] = useState("run");
  const [runErrorDetail, setRunErrorDetail] = useState<string | null>(null);
  const [lastDeduped, setLastDeduped] = useState(false);

  const strategy = useMemo(
    () => strategies.find((s) => s.id === strategyId) ?? null,
    [strategies, strategyId],
  );

  const symbolCompat = useMemo(
    () =>
      resolveStrategySymbolCompatibility(
        strategy as StoredStrategyV1 | null,
        providerSymbols,
      ),
    [strategy, providerSymbols],
  );

  const selectableSymbols = useMemo(() => {
    const q = symbolQuery.trim().toUpperCase();
    if (!q) return symbolCompat.allowedSymbols;
    return symbolCompat.allowedSymbols.filter((s) => s.includes(q));
  }, [symbolCompat.allowedSymbols, symbolQuery]);

  const selectedRun = useMemo(
    () => savedRuns.find((r) => r.id === selectedRunId) ?? null,
    [savedRuns, selectedRunId],
  );

  const loadRuns = useCallback(
    async (id: string, sym: string, filter: "current" | "all" = "current") => {
      if (!id) {
        setSavedRuns([]);
        return;
      }
      try {
        const qs = new URLSearchParams({ strategyId: id });
        if (filter === "all") qs.set("allSymbols", "1");
        else if (sym) qs.set("symbol", sym);
        const res = await fetch(
          `/api/rextora/backtest/run?${qs.toString()}`,
          { cache: "no-store" },
        );
        const json = await res.json();
        const list = (
          Array.isArray(json.data) ? json.data : []
        ) as SavedBacktestResult[];
        setSavedRuns(list);
        // Apply deep-link runId once only, and only when it belongs to the
        // current filtered list (prevents prior-symbol results resurfacing).
        if (
          !appliedInitialRunRef.current &&
          initialRunId &&
          list.some((r) => r.id === initialRunId)
        ) {
          appliedInitialRunRef.current = true;
          setSelectedRunId(initialRunId);
        }
      } catch {
        setSavedRuns([]);
      }
    },
    [initialRunId],
  );

  const loadSymbolDataRange = useCallback(
    async (sym: string, timeframe: string) => {
      try {
        const res = await fetch(
          `/api/rextora/backtest/run?dataRange=1&symbol=${encodeURIComponent(sym)}&timeframe=${encodeURIComponent(timeframe)}`,
        );
        const json = await res.json();
        if (json.ok && json.data?.fromOpenTime != null) {
          setSymbolDataRange(json.data as AvailableCandleDateRange);
          return json.data as AvailableCandleDateRange;
        }
        setSymbolDataRange(null);
        return null;
      } catch {
        setSymbolDataRange(null);
        return null;
      }
    },
    [],
  );

  function clearResultState() {
    setSelectedRunId("");
    setReport(null);
    setTrades([]);
    setEquityCurve([]);
    setCandles([]);
    setChartSamplingApplied(false);
    setProcessedCandleCount(0);
    setChartReproWarning(null);
    setChartSource(null);
    setLastDeduped(false);
    chartHydrateRunIdRef.current = null;
  }

  useEffect(() => {
    const timer = setTimeout(() => {
      void Promise.all([
        fetch("/api/rextora/strategies").then((r) => r.json()),
        fetch("/api/rextora/settings").then((r) => r.json()).catch(() => null),
        fetch("/api/rextora/paper/session?active=1")
          .then((r) => r.json())
          .catch(() => null),
      ])
        .then(([j, settingsJson, sessionJson]) => {
          const list = (j.data ?? []) as StoredStrategy[];
          setStrategies(list);
          const uiExpert = Boolean(
            settingsJson?.data?.settings?.ui?.expertMode ??
              settingsJson?.data?.settings?.expertMode,
          );
          setExpertMode(uiExpert);
          const cost = settingsJson?.data?.settings?.cost;
          if (cost) {
            setCostSummary(
              `수수료 ${cost.feeRate ?? cost.takerFee ?? "—"} · 슬리피지 ${cost.slippageRate ?? "—"} (시스템 설정)`,
            );
          }
          const allowed =
            settingsJson?.data?.settings?.market?.allowedSymbols ??
            settingsJson?.data?.settings?.allowedSymbols;
          setProviderSymbols(configuredBacktestSymbols(allowed));
          const session = sessionJson?.data?.active;
          setPaperSessionStrategyId(
            session && session.status === "active"
              ? String(session.strategyId ?? "")
              : null,
          );
          // Priority: URL → React state → localStorage → fallback
          setStrategyId((prev) => {
            if (
              initialStrategyId &&
              list.some((s) => s.id === initialStrategyId)
            ) {
              setSafeFallbackNotice(false);
              return initialStrategyId;
            }
            if (prev && list.some((s) => s.id === prev)) {
              setSafeFallbackNotice(false);
              return prev;
            }
            try {
              const last = window.localStorage.getItem(
                "rextora.lastBacktestStrategyId",
              );
              if (last && list.some((s) => s.id === last)) {
                setSafeFallbackNotice(false);
                return last;
              }
            } catch {
              /* ignore */
            }
            const paper = list.find(
              (s) => s.paperActive && s.id !== SAFE_STRATEGY_ID,
            );
            if (paper) {
              setSafeFallbackNotice(false);
              return paper.id;
            }
            const withBt = list.find(
              (s) => s.lastBacktest && s.id !== SAFE_STRATEGY_ID,
            );
            if (withBt) {
              setSafeFallbackNotice(false);
              return withBt.id;
            }
            const safe = list.find((s) => s.id === SAFE_STRATEGY_ID);
            if (safe && !initialStrategyId) {
              setSafeFallbackNotice(true);
              return safe.id;
            }
            setSafeFallbackNotice(false);
            return "";
          });
        })
        .catch(() => setRunFeedback("전략 목록을 불러오지 못했습니다."));
    }, 0);
    return () => clearTimeout(timer);
  }, [initialStrategyId]);

  useEffect(() => {
    if (!strategyId) return;
    try {
      window.localStorage.setItem("rextora.lastBacktestStrategyId", strategyId);
    } catch {
      /* ignore */
    }
  }, [strategyId]);

  useEffect(() => {
    if (!strategyId || !symbol) return;
    syncBacktestStrategyUrl(strategyId, symbol);
    const tf =
      strategy?.timeframe && strategy.timeframe !== "unknown"
        ? strategy.timeframe
        : "15m";
    const timer = window.setTimeout(() => {
      void loadRuns(strategyId, symbol, savedRunSymbolFilter);
      void loadSymbolDataRange(symbol, tf);
    }, 0);
    return () => clearTimeout(timer);
  }, [
    strategyId,
    symbol,
    savedRunSymbolFilter,
    strategy?.timeframe,
    loadRuns,
    loadSymbolDataRange,
  ]);

  function selectStrategy(nextId: string) {
    setStrategyId(nextId);
    clearResultState();
    setSafeFallbackNotice(false);
    setRunFeedback("");
    setSymbolQuery("");
    const compat = resolveStrategySymbolCompatibility(
      (strategies.find((s) => s.id === nextId) as StoredStrategyV1) ?? null,
      providerSymbols,
    );
    setSymbol((prev) =>
      compat.allowedSymbols.includes(prev) ? prev : compat.defaultSymbol,
    );
  }

  function selectSymbol(nextSymbol: string) {
    const next = nextSymbol.trim().toUpperCase();
    if (!next || next === symbol) return;
    if (!symbolCompat.allowedSymbols.includes(next)) {
      setRunFeedback(
        symbolCompat.reasonKo ??
          `${next}은(는) 이 전략에서 사용할 수 없습니다.`,
      );
      return;
    }
    setSymbol(next);
    setSymbolQuery("");
    clearResultState();
    setRunFeedback(`심볼 변경: ${next}`);
    syncBacktestStrategyUrl(strategyId, next, { clearRunId: true });
  }

  async function applyPeriodPreset(days: number | null) {
    const tf =
      strategy?.timeframe && strategy.timeframe !== "unknown"
        ? strategy.timeframe
        : "15m";
    let bounds = symbolDataRange;
    if (!bounds || bounds.symbol !== symbol) {
      bounds = await loadSymbolDataRange(symbol, tf);
    }
    if (days != null) {
      const range = computeDayPresetRange(days, undefined, bounds);
      setFromDate(range.fromDate);
      setToDate(range.toDate);
      setRunFeedback(
        `기간 프리셋 적용 (${symbol}): ${range.fromDate} → ${range.toDate}`,
      );
      return;
    }
    setPresetBusy(true);
    setRunFeedback("전체 기간 조회 중…");
    try {
      const range =
        bounds ??
        (await loadSymbolDataRange(symbol, tf));
      if (!range?.fromDate || !range?.toDate) {
        setRunFeedback("전체 기간을 불러오지 못했습니다.");
        return;
      }
      setFromDate(String(range.fromDate));
      setToDate(String(range.toDate));
      setRunFeedback(
        `전체 기간 적용 (${symbol}): ${range.fromDate} → ${range.toDate}`,
      );
    } catch (error) {
      setRunFeedback(
        error instanceof Error
          ? error.message
          : "전체 기간을 불러오지 못했습니다.",
      );
    } finally {
      setPresetBusy(false);
    }
  }

  function applySavedRun(run: SavedBacktestResult) {
    const runSymbol = (
      run.report.symbol ??
      run.config.symbols?.[0] ??
      symbol
    ).toUpperCase();
    if (runSymbol && runSymbol !== symbol) {
      setSymbol(runSymbol);
    }
    setSelectedRunId(run.id);
    setReport(run.report);
    setTrades(run.trades ?? []);
    setEquityCurve([]);
    setCandles([]);
    setChartSamplingApplied(false);
    setProcessedCandleCount(run.report.processedCandleCount ?? 0);
    setChartReproWarning(null);
    setChartSource(null);
    if (run.config.fromOpenTime) {
      setFromDate(toDateInput(new Date(run.config.fromOpenTime)));
    }
    if (run.config.toOpenTime) {
      setToDate(toDateInput(new Date(run.config.toOpenTime)));
    }
    setRunFeedback(
      `저장된 실행 로드: ${run.id} · ${runSymbol} · ${run.report.fromDate ?? "?"} → ${run.report.toDate ?? "?"} · 실행 방식 ${sourceTypeLabelKo(run.sourceType)}`,
    );
    syncBacktestStrategyUrl(strategyId, runSymbol);
    void hydrateChartForSavedRun(run.id);
  }

  async function hydrateChartForSavedRun(runId: string) {
    chartHydrateRunIdRef.current = runId;
    try {
      const res = await fetch(
        `/api/rextora/backtest/run?runId=${encodeURIComponent(runId)}&hydrateChart=1`,
      );
      const json = await res.json();
      if (chartHydrateRunIdRef.current !== runId) return;
      if (!json.data) return;
      const nextCandles = (json.data.chartCandles ?? []) as OhlcvCandle[];
      const nextEquity = (json.data.equityCurve ?? []) as number[];
      if (Array.isArray(nextCandles) && nextCandles.length > 0) {
        setCandles(nextCandles);
      }
      if (Array.isArray(nextEquity) && nextEquity.length > 0) {
        setEquityCurve(nextEquity);
      }
      setChartSamplingApplied(Boolean(json.data.chartSamplingApplied));
      setProcessedCandleCount(
        Number(json.data.processedCandleCount) || nextCandles.length || 0,
      );
      const source =
        json.data.chartSource === "persisted"
          ? ("persisted" as const)
          : ("legacy_remote_hydrate" as const);
      setChartSource(source);
      setChartReproWarning(
        typeof json.data.reproducibilityWarningKo === "string"
          ? json.data.reproducibilityWarningKo
          : source === "legacy_remote_hydrate"
            ? "이 실행에는 저장된 차트 증거가 없어 원격 데이터로 복원했습니다. 캔들·자산곡선이 당시와 완전히 같지 않을 수 있습니다."
            : null,
      );
    } catch {
      setChartReproWarning(
        "차트 데이터를 불러오지 못했습니다. 보고서·거래 목록은 저장된 실행 기준입니다.",
      );
    }
  }

  useEffect(() => {
    if (!selectedRunId || report) return;
    const run = savedRuns.find((r) => r.id === selectedRunId);
    if (!run) return;
    const timer = window.setTimeout(() => {
      applySavedRun(run);
    }, 0);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load once when runs arrive
  }, [selectedRunId, savedRuns]);

  async function runUserBacktest() {
    setRunFeedback("백테스트를 준비하고 있습니다.");
    setRunErrorDetail(null);
    setLastDeduped(false);
    if (!strategyId || !strategy) {
      setRunFeedback("전략을 선택하세요.");
      return;
    }
    if (runLock.current || runInFlight) {
      setRunFeedback("이미 백테스트가 실행 중입니다.");
      return;
    }
    const validated = validateBacktestCalendarRange(fromDate, toDate);
    if (!validated.ok) {
      setRunFeedback("백테스트 실행에 실패했습니다.");
      setRunErrorDetail(validated.error);
      return;
    }

    runLock.current = true;
    setRunInFlight(true);
    setLoading(true);
    setRunFeedback("백테스트 실행 중입니다.");
    setReport(null);
    setTrades([]);
    setEquityCurve([]);
    setCandles([]);
    try {
      const res = await fetch("/api/rextora/backtest/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          strategyId,
          strategyHash: strategy.paramsHash,
          symbols: [symbol],
          timeframe:
            strategy.timeframe && strategy.timeframe !== "unknown"
              ? strategy.timeframe
              : "15m",
          fromOpenTime: validated.fromOpenTime,
          toOpenTime: validated.toOpenTime,
          save: true,
        }),
      });
      const json = await res.json();
      const payload = json.data;
      if (!json.ok || !payload?.report) {
        setRunFeedback("백테스트 실행에 실패했습니다.");
        setRunErrorDetail(json.error ?? json.code ?? null);
        return;
      }
      const first =
        (payload.symbolResults ?? []).find(
          (r: { report?: BacktestReport | null }) => r.report != null,
        ) ?? null;
      const activeReport = (first?.report ?? payload.report) as BacktestReport;
      setReport(activeReport);
      setTrades((first?.trades ?? payload.trades ?? []) as BacktestTrade[]);
      setEquityCurve(first?.equityCurve ?? payload.equityCurve ?? []);
      setCandles(
        (first?.chartCandles ??
          first?.candles ??
          payload.chartCandles ??
          payload.candles ??
          []) as OhlcvCandle[],
      );
      setChartSource("live_run");
      setChartReproWarning(null);
      setChartSamplingApplied(
        Boolean(first?.chartSamplingApplied ?? payload.chartSamplingApplied),
      );
      setProcessedCandleCount(
        first?.processedCandleCount ??
          payload.processedCandleCount ??
          activeReport.processedCandleCount ??
          0,
      );
      const saved = payload.saved as SavedBacktestResult | null;
      if (saved?.id) {
        setSelectedRunId(saved.id);
        setLastDeduped(Boolean(saved.deduplicatedResult));
        setRunFeedback("백테스트가 완료되고 저장되었습니다.");
      } else {
        setRunFeedback("백테스트가 완료되고 저장되었습니다.");
        setLastDeduped(false);
      }
      await loadRuns(strategyId, symbol, savedRunSymbolFilter);
    } catch (error) {
      setRunFeedback("백테스트 실행에 실패했습니다.");
      setRunErrorDetail(
        error instanceof Error ? error.message : "알 수 없는 오류",
      );
    } finally {
      setLoading(false);
      setRunInFlight(false);
      runLock.current = false;
    }
  }

  async function registerPaper() {
    if (!strategyId || strategyId === SAFE_STRATEGY_ID) {
      setActionMessage(
        "SAFE는 모의 활성으로 덮어쓰지 않습니다. 다른 전략을 선택하세요.",
      );
      return;
    }
    if (report) {
      const gate = evaluateBacktestEligibility({
        status: selectedRun?.status ?? "completed",
        totalReturn: report.totalReturn,
        mdd: report.mdd,
        tradeCount: report.tradeCount,
        winRate: report.winRate,
        profitFactor: report.profitFactor,
        totalCostPctOfInitialCapital: report.costs.totalCostPctOfInitialCapital,
        totalCostPctOfGrossProfit: computeCostRatios({
          grossPnLBeforeCosts: report.costs.grossPnLBeforeCosts ?? 0,
          netPnLAfterCosts: report.costs.netPnLAfterCosts ?? 0,
          totalCostUsdt: report.costs.totalCostUsdt ?? 0,
          feeCostUsdt: report.costs.feeCostUsdt ?? 0,
          slippageCostUsdt: report.costs.slippageCostUsdt ?? 0,
        }).totalCostPctOfGrossProfit,
        negativeMonths: report.negativeMonths,
        monthlyReturnCount: report.monthlyReturns?.length ?? 0,
      });
      if (eligibilityBlocksPaperLive(gate)) {
        setActionMessage(gate.verdictLabel);
        return;
      }
    }
    setActionBusy(true);
    setActionMessage("모의매매 등록 중…");
    try {
      const res = await fetch("/api/rextora/strategies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "apply_paper", id: strategyId }),
      });
      const json = await res.json();
      if (json.ok && selectedRunId) {
        const sessionRes = await fetch("/api/rextora/paper/session", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            strategyId,
            backtestResultId: selectedRunId,
            symbol:
              report?.symbol ??
              selectedRun?.report.symbol ??
              symbol,
          }),
        }).catch(() => null);
        const sessionJson = sessionRes ? await sessionRes.json() : null;
        const active = sessionJson?.data?.session ?? sessionJson?.data?.active;
        if (active?.strategyId) {
          setPaperSessionStrategyId(String(active.strategyId));
        } else if (json.ok) {
          setPaperSessionStrategyId(strategyId);
        }
      }
      if (json.ok) {
        const listRes = await fetch("/api/rextora/strategies").then((r) =>
          r.json(),
        );
        if (Array.isArray(listRes.data)) {
          setStrategies(listRes.data as StoredStrategy[]);
        }
      }
      setActionMessage(
        json.ok
          ? `모의매매 등록 · 전략 ${strategyId} · 심볼 ${report?.symbol ?? symbol} · 실행 ${selectedRunId || "없음"}`
          : (json.error ?? "모의매매 등록 실패"),
      );
    } finally {
      setActionBusy(false);
    }
  }

  async function registerLiveCandidate() {
    if (!strategyId) return;
    if (report) {
      const gate = evaluateBacktestEligibility({
        status: selectedRun?.status ?? "completed",
        totalReturn: report.totalReturn,
        mdd: report.mdd,
        tradeCount: report.tradeCount,
        winRate: report.winRate,
        profitFactor: report.profitFactor,
        totalCostPctOfInitialCapital: report.costs.totalCostPctOfInitialCapital,
        totalCostPctOfGrossProfit: computeCostRatios({
          grossPnLBeforeCosts: report.costs.grossPnLBeforeCosts ?? 0,
          netPnLAfterCosts: report.costs.netPnLAfterCosts ?? 0,
          totalCostUsdt: report.costs.totalCostUsdt ?? 0,
          feeCostUsdt: report.costs.feeCostUsdt ?? 0,
          slippageCostUsdt: report.costs.slippageCostUsdt ?? 0,
        }).totalCostPctOfGrossProfit,
        negativeMonths: report.negativeMonths,
        monthlyReturnCount: report.monthlyReturns?.length ?? 0,
      });
      if (eligibilityBlocksPaperLive(gate)) {
        setActionMessage(gate.verdictLabel);
        return;
      }
    }
    setActionBusy(true);
    setActionMessage("실전 후보 등록 중…");
    try {
      const res = await fetch("/api/rextora/strategies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "mark_live_candidate", id: strategyId }),
      });
      const json = await res.json();
      setActionMessage(
        json.ok
          ? `실전 후보 등록 · 전략 ${strategyId} · 심볼 ${report?.symbol ?? symbol} · 실행 ${selectedRunId || "없음"}`
          : (json.error ?? "실전 후보 등록 실패"),
      );
    } finally {
      setActionBusy(false);
    }
  }

  const paperRegistered = Boolean(strategy?.paperActive);
  const paperSessionForStrategy =
    Boolean(strategyId) && paperSessionStrategyId === strategyId;
  const liveCandidate = Boolean(strategy?.liveActive || strategy?.liveEligible);

  const costRatios = useMemo(() => {
    if (!report?.costs) return null;
    return computeCostRatios({
      grossPnLBeforeCosts: report.costs.grossPnLBeforeCosts ?? 0,
      netPnLAfterCosts: report.costs.netPnLAfterCosts ?? 0,
      totalCostUsdt: report.costs.totalCostUsdt ?? 0,
      feeCostUsdt: report.costs.feeCostUsdt ?? 0,
      slippageCostUsdt: report.costs.slippageCostUsdt ?? 0,
    });
  }, [report]);

  const eligibility = useMemo(() => {
    if (!report) return null;
    return evaluateBacktestEligibility({
      status: selectedRun?.status ?? "completed",
      totalReturn: report.totalReturn,
      mdd: report.mdd,
      tradeCount: report.tradeCount,
      winRate: report.winRate,
      profitFactor: report.profitFactor,
      totalCostPctOfInitialCapital: report.costs.totalCostPctOfInitialCapital,
      totalCostPctOfGrossProfit: costRatios?.totalCostPctOfGrossProfit ?? null,
      negativeMonths: report.negativeMonths,
      monthlyReturnCount: report.monthlyReturns?.length ?? 0,
      hasCostStress: Array.isArray(report.costStress)
        ? report.costStress.length > 0
        : null,
    });
  }, [report, selectedRun, costRatios]);

  const handoffBlocked = eligibility
    ? eligibilityBlocksPaperLive(eligibility)
    : false;
  const mddReason =
    eligibility?.reasons.find((r) => r.code === "maximum_drawdown_exceeded") ??
    eligibility?.reasons[0] ??
    null;
  const observedMddPct =
    eligibility?.observedValue != null
      ? Math.abs(eligibility.observedValue * 100).toFixed(2)
      : report?.mdd != null
        ? Math.abs(report.mdd * 100).toFixed(2)
        : null;
  const requiredMddPct =
    eligibility?.maxAllowedMddAbs != null
      ? (eligibility.maxAllowedMddAbs * 100).toFixed(2)
      : eligibility?.requiredThreshold != null
        ? Math.abs(eligibility.requiredThreshold * 100).toFixed(2)
        : "20.00";
  const paperBlockCode = handoffBlocked
    ? (mddReason?.code ?? "backtest_incomplete")
    : null;
  const liveBlockCode = handoffBlocked
    ? (mddReason?.code ?? "backtest_incomplete")
    : !paperRegistered && !paperSessionForStrategy
      ? "paper_required"
      : null;
  const paperBlockedReason = paperBlockCode
    ? (mddReason?.labelKo ??
      eligibility?.verdictLabel ??
      "백테스트 자격 미충족")
    : null;
  const liveBlockedReason = liveBlockCode
    ? liveBlockCode === "paper_required"
      ? "모의매매 등록·검증이 필요합니다."
      : (mddReason?.labelKo ??
        eligibility?.verdictLabel ??
        "백테스트 자격 미충족")
    : null;
  const sharedPromotionBlock =
    Boolean(paperBlockCode) &&
    Boolean(liveBlockCode) &&
    paperBlockCode === liveBlockCode;
  const sharedBlockDetail =
    observedMddPct != null && paperBlockCode === "maximum_drawdown_exceeded"
      ? `최대 낙폭 ${observedMddPct}%가 허용 기준 ${requiredMddPct}%를 초과했습니다.`
      : paperBlockedReason;

  const workbenchSections = [
    { id: "run", label: "실행" },
    { id: "verdict", label: "판정" },
    { id: "price", label: "차트" },
    { id: "trades", label: "거래 목록" },
    { id: "monthly", label: "월별" },
    { id: "cost", label: "비용" },
    { id: "equity", label: "자산·낙폭" },
    { id: "timeline", label: "타임라인" },
    { id: "advanced", label: "상세 분석" },
    { id: "validation", label: "검증" },
  ] as const;

  const navClickLocked = useRef(false);

  const scrollWorkbenchSection = (id: string) => {
    const el = document.getElementById(`bt-${id}`);
    if (!el) return;
    el.setAttribute("data-force-expand", "1");
    el.dispatchEvent(new CustomEvent("bt-force-expand", { bubbles: true }));
    navClickLocked.current = true;
    window.setTimeout(() => {
      navClickLocked.current = false;
    }, 700);
    setActiveNavSection(id);
    el.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  useEffect(() => {
    if (!report) return;
    const ids = workbenchSections.map((s) => s.id);
    const nav = document.querySelector(
      '[data-testid="analysis-section-nav"]',
    ) as HTMLElement | null;

    const pickActive = () => {
      if (navClickLocked.current) return;
      const headerH = Math.max(48, nav?.offsetHeight ?? 56);
      const threshold = headerH + 24;
      const scrollBottomGap =
        document.documentElement.scrollHeight -
        (window.scrollY + window.innerHeight);
      // Last sections often cannot reach the sticky band; pin to the final
      // section when the viewport is at (or near) document end.
      if (scrollBottomGap <= 64) {
        const last = ids[ids.length - 1] ?? "run";
        setActiveNavSection((prev) => (prev === last ? prev : last));
        return;
      }
      let active = ids[0] ?? "run";
      let bestDist = Number.POSITIVE_INFINITY;
      for (const id of ids) {
        const el = document.getElementById(`bt-${id}`);
        if (!el) continue;
        const top = el.getBoundingClientRect().top;
        if (top <= threshold) {
          // Prefer the section nearest the sticky threshold among those that
          // have reached/passed it (stable when several overlap the band).
          const dist = threshold - top;
          if (dist <= bestDist) {
            bestDist = dist;
            active = id;
          }
        }
      }
      setActiveNavSection((prev) => (prev === active ? prev : active));
    };

    const headerH = Math.max(48, nav?.offsetHeight ?? 56);
    const observer = new IntersectionObserver(
      () => {
        pickActive();
      },
      {
        root: null,
        rootMargin: `-${headerH}px 0px -55% 0px`,
        threshold: [0, 0.1, 0.25, 0.5, 1],
      },
    );
    for (const id of ids) {
      const el = document.getElementById(`bt-${id}`);
      if (el) observer.observe(el);
    }
    const onScroll = () => {
      window.requestAnimationFrame(pickActive);
    };
    pickActive();
    window.addEventListener("scroll", onScroll, { passive: true });
    const onExpand = () => {
      window.requestAnimationFrame(pickActive);
    };
    document.addEventListener("bt-force-expand", onExpand);
    return () => {
      observer.disconnect();
      window.removeEventListener("scroll", onScroll);
      document.removeEventListener("bt-force-expand", onExpand);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- section ids are stable
  }, [report, selectedRunId, eligibility?.eligible]);

  const costBurdenPct =
    costRatios?.totalCostPctOfGrossProfit != null
      ? (costRatios.totalCostPctOfGrossProfit * 100).toFixed(1)
      : null;

  return (
    <div className="space-y-4" data-testid="backtest-review-workbench">
      <section id="bt-run" className="scroll-mt-20 space-y-4">
      <Card
        title="백테스트 실행"
        description="탐색으로 확정된 전략의 불변 ID·해시를 유지한 채, 선택한 기간으로 새 백테스트를 실행합니다."
        data-testid="backtest-strategy-context"
      >
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <label className="text-sm text-slate-300">
            전략 선택
            <select
              className="mt-1 w-full rounded border border-slate-700 bg-slate-950 px-3 py-2"
              value={strategyId}
              onChange={(e) => selectStrategy(e.target.value)}
              data-testid="backtest-strategy-select"
            >
              {strategies.length === 0 ? (
                <option value="">전략 없음</option>
              ) : (
                strategies.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))
              )}
            </select>
          </label>
          <div data-testid="backtest-strategy-id">
            <Metric label="전략 ID" value={strategy?.id ?? "—"} />
          </div>
          <div data-testid="backtest-strategy-hash">
            <Metric
              label={displayParamsHashLabel()}
              value={strategy?.paramsHash?.slice(0, 12) ?? "—"}
            />
          </div>
          <Metric
            label="타임프레임"
            value={
              strategy?.timeframe
                ? displayTimeframeLabel(strategy.timeframe)
                : "—"
            }
          />
        </div>

        <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <div data-testid="backtest-symbol-field">
            <label className="block text-sm text-slate-300">
              심볼/시장
              {symbolCompat.selectorDisabled ? (
                <select
                  className="mt-1 w-full rounded border border-slate-700 bg-slate-950 px-3 py-2 opacity-70"
                  value={symbol}
                  disabled
                  data-testid="backtest-symbol-select"
                  aria-disabled="true"
                >
                  <option value={symbol}>{symbol}</option>
                </select>
              ) : (
                <>
                  <input
                    type="search"
                    className="mt-1 w-full rounded border border-slate-700 bg-slate-950 px-3 py-2"
                    placeholder="심볼 검색"
                    value={symbolQuery}
                    onChange={(e) => setSymbolQuery(e.target.value)}
                    data-testid="backtest-symbol-search"
                    aria-label="심볼 검색"
                  />
                  <select
                    className="mt-1 w-full rounded border border-slate-700 bg-slate-950 px-3 py-2"
                    value={symbol}
                    onChange={(e) => selectSymbol(e.target.value)}
                    data-testid="backtest-symbol-select"
                  >
                    {selectableSymbols.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </>
              )}
            </label>
            <p className="mt-1 text-xs rx-text-muted" data-testid="backtest-symbol-help">
              {symbolCompat.selectorDisabled
                ? (symbolCompat.reasonKo ?? `이 전략은 ${symbol} 전용입니다.`)
                : "전략 로직은 유지하고 선택한 시장 데이터로 새 백테스트를 실행합니다."}
            </p>
          </div>
          <label className="text-sm text-slate-300">
            시작일
            <input
              type="date"
              className="mt-1 w-full rounded border border-slate-700 bg-slate-950 px-3 py-2"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              data-testid="backtest-from"
            />
          </label>
          <label className="text-sm text-slate-300">
            종료일
            <input
              type="date"
              className="mt-1 w-full rounded border border-slate-700 bg-slate-950 px-3 py-2"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              data-testid="backtest-to"
            />
          </label>
          <Metric label="비용 프로필" value={costSummary} />
        </div>

        <div
          className="mt-3 flex flex-wrap gap-2"
          data-testid="backtest-date-presets"
        >
          {BACKTEST_PERIOD_PRESETS.map((preset) => (
            <Button
              key={preset.id}
              size="sm"
              variant="outline"
              disabled={presetBusy || loading || runInFlight}
              onClick={() => void applyPeriodPreset(preset.days)}
              data-testid={`backtest-preset-${preset.id}`}
            >
              {preset.label}
            </Button>
          ))}
        </div>

        {safeFallbackNotice ? (
          <p
            className="mt-3 text-sm text-amber-200"
            data-testid="backtest-safe-fallback-note"
          >
            선택된 전략이 없어 보호 기준 전략 SAFE를 표시합니다.
          </p>
        ) : null}

        <div className="mt-3 flex flex-wrap gap-2">
          <Button
            tone="success"
            disabled={!strategyId || loading || runInFlight}
            onClick={() => void runUserBacktest()}
            data-testid="backtest-run"
          >
            {loading || runInFlight ? "실행 중…" : "백테스트 실행"}
          </Button>
          {(expertMode || expertQuery) && (
            <Link
              href="/backtest?expert=1"
              className="inline-flex items-center rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-400"
              data-testid="backtest-expert-manual"
            >
              전문가: 수동 파라미터 백테스트
            </Link>
          )}
        </div>
        <div
          className="mt-2 min-h-[1.25rem] space-y-1 text-sm text-slate-300"
          data-testid="backtest-run-status"
          aria-live="polite"
        >
          <p>
            {runFeedback ||
              (loading || runInFlight ? "백테스트 실행 중입니다." : "")}
          </p>
          {runFeedback.includes("완료되고 저장") && selectedRunId ? (
            <p className="text-xs rx-text-muted" data-testid="backtest-run-id-detail">
              실행 ID: {selectedRunId}
            </p>
          ) : null}
          {lastDeduped && runFeedback.includes("완료되고 저장") ? (
            <p
              className="text-xs text-sky-200/90"
              data-testid="backtest-result-reuse-note"
            >
              동일한 조건의 기존 계산 결과를 사용했습니다. 이번 실행 기록은 새로 저장되었습니다.
            </p>
          ) : null}
          {runErrorDetail ? (
            <details className="text-xs text-rose-200/90" data-testid="backtest-run-error-detail">
              <summary className="cursor-pointer">기술 상세</summary>
              <pre className="mt-1 whitespace-pre-wrap break-all">{runErrorDetail}</pre>
            </details>
          ) : null}
        </div>
        {/* Compatibility alias used by older tests/selectors */}
        <p className="sr-only" data-testid="backtest-message">
          {runFeedback}
        </p>
      </Card>

      <Card title="저장된 백테스트" data-testid="backtest-run-history">
        <div className="mb-3 flex flex-wrap gap-2" data-testid="backtest-run-symbol-filter">
          <Button
            size="sm"
            variant={savedRunSymbolFilter === "current" ? "primary" : "outline"}
            onClick={() => setSavedRunSymbolFilter("current")}
            data-testid="backtest-run-filter-current"
          >
            현재 심볼
          </Button>
          <Button
            size="sm"
            variant={savedRunSymbolFilter === "all" ? "primary" : "outline"}
            onClick={() => setSavedRunSymbolFilter("all")}
            data-testid="backtest-run-filter-all"
          >
            전체 심볼
          </Button>
          <span className="self-center text-xs rx-text-muted">
            {savedRunSymbolFilter === "current"
              ? `현재 선택 심볼만 표시 · ${symbol}`
              : "전체 심볼"}
          </span>
        </div>
        {savedRuns.length === 0 ? (
          <EmptyState
            message="저장된 사용자 백테스트가 없습니다."
            hint="기간을 선택한 뒤 ‘백테스트 실행’을 누르세요. 탐색 시 평가 결과는 별도입니다."
          />
        ) : (
          <label className="block text-sm text-slate-300">
            실행 선택
            <select
              className="mt-1 w-full rounded border border-slate-700 bg-slate-950 px-3 py-2"
              value={selectedRunId}
              onChange={(e) => {
                const run = savedRuns.find((r) => r.id === e.target.value);
                if (run) applySavedRun(run);
              }}
              data-testid="backtest-run-select"
            >
              {savedRuns.map((r) => (
                <option key={r.id} value={r.id}>
                  {formatSavedRunOptionLabel(r, savedRuns)}
                </option>
              ))}
            </select>
          </label>
        )}
        {selectedRun ? (
          <div
            className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3"
            data-testid="backtest-run-technical-detail"
          >
            <Metric label="실행 ID" value={selectedRun.id} />
            <Metric
              label="실행 일시"
              value={
                selectedRun.completedAt
                  ? new Date(selectedRun.completedAt).toLocaleString("ko-KR")
                  : new Date(selectedRun.createdAt).toLocaleString("ko-KR")
              }
            />
            <Metric
              label="실행 방식"
              value={sourceTypeLabelKo(selectedRun.sourceType)}
            />
            <Metric
              label="심볼"
              value={(
                selectedRun.report.symbol ??
                selectedRun.config.symbols?.[0] ??
                "—"
              ).toString()}
            />
            <Metric
              label="결과 재사용 여부"
              value={
                selectedRun.deduplicatedResult
                  ? "예 (기존 계산 결과 사용)"
                  : "아니오"
              }
            />
            <Metric
              label="결과 hash"
              value={selectedRun.resultHash ?? "—"}
            />
            <Metric
              label="백테스트 엔진 버전"
              value={selectedRun.engineVersion ?? "rextora-backtest-1"}
            />
            <Metric
              label="데이터 버전"
              value={dataVersionLabelKo(selectedRun.dataVersion)}
            />
            <Metric
              label="상태"
              value={backtestStatusLabelKo(selectedRun.status)}
            />
          </div>
        ) : null}
        <div className="mt-3">
          <Button
            size="sm"
            variant="outline"
            disabled={!selectedRun}
            onClick={() => selectedRun && applySavedRun(selectedRun)}
            data-testid="backtest-load-saved"
          >
            저장된 실행 불러오기
          </Button>
        </div>
      </Card>
      </section>

      {report ? (
        <nav
          className="sticky top-0 z-30 -mx-1 overflow-x-auto border-b border-slate-800 bg-slate-950/95 px-1 py-2.5 backdrop-blur [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          data-testid="analysis-section-nav"
          aria-label="백테스트 섹션"
          style={{ WebkitOverflowScrolling: "touch" }}
        >
          <div className="flex min-w-max gap-1.5">
            {workbenchSections.map((s) => {
              const active = activeNavSection === s.id;
              return (
                <button
                  key={s.id}
                  type="button"
                  className={`min-h-11 whitespace-nowrap rounded-md px-3.5 py-2 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-400 sm:min-h-10 ${
                    active
                      ? "bg-sky-600/30 font-semibold text-sky-100 ring-1 ring-sky-400/50"
                      : "bg-slate-900 text-slate-400 hover:bg-slate-800 hover:text-slate-200"
                  }`}
                  aria-current={active ? "true" : undefined}
                  data-active={active ? "true" : "false"}
                  onClick={() => scrollWorkbenchSection(s.id)}
                >
                  {s.label}
                </button>
              );
            })}
          </div>
        </nav>
      ) : null}

      {!strategyId ? (
        <EmptyState
          message="전략을 선택하세요"
          hint="탐색 결과에서 전략을 고르거나 위에서 선택하세요."
        />
      ) : loading && !report ? (
        <Card title="실행 중">
          <p className="text-sm text-slate-400">백테스트를 실행합니다…</p>
        </Card>
      ) : report && eligibility ? (
        <>
          <section id="bt-verdict" className="scroll-mt-20" data-testid="backtest-decision-summary">
            <Card title="판정 요약">
              <div className="mb-3 flex flex-wrap gap-2">
                <Badge tone={eligibility.eligible ? "success" : "danger"}>
                  {eligibility.verdictLabel}
                </Badge>
                {selectedRunId ? (
                  <span title={selectedRunId}>
                    <Badge tone="muted">실행 ID {selectedRunId.slice(0, 18)}…</Badge>
                  </span>
                ) : null}
              </div>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <Metric
                  label="최종 판정"
                  value={eligibility.eligible ? "적격" : "부적격"}
                  tone={eligibility.eligible ? "success" : "danger"}
                />
                <Metric
                  label="부적격 이유"
                  value={
                    !eligibility.eligible
                      ? (mddReason?.labelKo ?? eligibility.verdictLabel)
                      : "해당 없음"
                  }
                  tone={!eligibility.eligible ? "danger" : "default"}
                />
                <Metric
                  label="가장 큰 위험"
                  value={eligibility.primaryRiskKo}
                  tone="danger"
                />
                <Metric
                  label="거래 수 신뢰도"
                  value={eligibility.sampleAdequate ? "충분" : "부족"}
                  tone={eligibility.sampleAdequate ? "success" : "warning"}
                  help={`거래 ${report.tradeCount}건`}
                />
                <Metric
                  label="비용 부담"
                  value={costBurdenPct == null ? "—" : `${costBurdenPct}%`}
                  tone={
                    costRatios?.criticalCostOfGross ? "danger" : "warning"
                  }
                  help="총수익 대비 거래비용 비율"
                />
              </div>
              {!eligibility.eligible && observedMddPct != null ? (
                <p
                  className="mt-3 rounded-lg border border-rose-500/50 bg-rose-950/40 px-3 py-2 text-sm font-medium text-rose-100"
                  data-testid="backtest-mdd-fail-reason"
                >
                  최대 낙폭 {observedMddPct}%가 허용 기준 {requiredMddPct}%를
                  초과했습니다.
                </p>
              ) : null}
              {costRatios?.criticalCostOfGross && costBurdenPct != null ? (
                <p
                  className="mt-2 rounded-lg border border-amber-500/40 bg-amber-950/30 px-3 py-2 text-sm text-amber-100"
                  data-testid="decision-cost-warning"
                >
                  거래비용이 총수익의 {costBurdenPct}%를 차지합니다.
                </p>
              ) : null}
              <p
                className="mt-3 text-sm text-slate-200"
                data-testid="backtest-decision-next-action"
              >
                다음 권장 행동: {eligibility.recommendedNextActionKo}
              </p>
            </Card>
          </section>

          <Card title="다음 행동" data-testid="backtest-review-actions">
            {sharedPromotionBlock ? (
              <div
                className="mb-3 space-y-2 rounded-lg border-2 border-rose-500/60 bg-rose-950/50 p-3"
                data-testid="backtest-handoff-block-reason"
              >
                <p className="text-base font-semibold text-rose-100">승격 불가</p>
                <p
                  className="text-sm leading-relaxed text-rose-50"
                  data-testid="backtest-shared-block-detail"
                >
                  {sharedBlockDetail}
                </p>
              </div>
            ) : (
              <>
                {paperBlockedReason ? (
                  <div
                    className="mb-2 rounded-lg border border-rose-500/50 bg-rose-950/40 p-3"
                    data-testid="backtest-paper-block-reason"
                  >
                    <p className="text-sm font-semibold text-rose-100">
                      모의매매 등록 불가
                    </p>
                    <p className="mt-1 text-sm text-rose-50">{paperBlockedReason}</p>
                  </div>
                ) : null}
                {liveBlockedReason && liveBlockCode !== paperBlockCode ? (
                  <div
                    className="mb-2 rounded-lg border border-rose-500/50 bg-rose-950/40 p-3"
                    data-testid="backtest-live-block-reason"
                  >
                    <p className="text-sm font-semibold text-rose-100">
                      실전 후보 등록 불가
                    </p>
                    <p className="mt-1 text-sm text-rose-50">{liveBlockedReason}</p>
                  </div>
                ) : null}
              </>
            )}
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide rx-text-muted">
              주요 단계
            </p>
            <div className="flex flex-wrap gap-2">
              {paperRegistered || paperSessionForStrategy ? (
                <Link
                  href={`/paper-trading?strategyId=${encodeURIComponent(strategyId)}&runId=${encodeURIComponent(selectedRunId || "")}&symbol=${encodeURIComponent(report?.symbol ?? symbol)}`}
                  className="inline-flex items-center rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-1.5 text-sm text-emerald-100"
                  data-testid="backtest-paper-action"
                >
                  {paperSessionForStrategy ? "모의매매 세션 보기" : "모의매매 보기"}
                </Link>
              ) : (
                <Button
                  tone="success"
                  disabled={
                    !strategyId ||
                    actionBusy ||
                    !selectedRunId ||
                    handoffBlocked
                  }
                  onClick={() => void registerPaper()}
                  data-testid="backtest-paper-action"
                  title={paperBlockedReason ?? undefined}
                >
                  {handoffBlocked ? "모의매매 등록 불가" : "모의매매 등록"}
                </Button>
              )}
              {liveCandidate && !handoffBlocked && !liveBlockedReason ? (
                <Link
                  href={`/live-trading?candidate=${encodeURIComponent(strategyId)}&runId=${encodeURIComponent(selectedRunId || "")}&symbol=${encodeURIComponent(report?.symbol ?? symbol)}`}
                  className="inline-flex items-center rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-1.5 text-sm text-amber-100"
                  data-testid="backtest-live-action"
                >
                  실전 후보 보기
                </Link>
              ) : (
                <Button
                  tone="warning"
                  disabled={
                    !strategyId ||
                    actionBusy ||
                    !selectedRunId ||
                    handoffBlocked ||
                    Boolean(liveBlockedReason)
                  }
                  onClick={() => void registerLiveCandidate()}
                  data-testid="backtest-live-action"
                  title={liveBlockedReason ?? undefined}
                >
                  {handoffBlocked || liveBlockedReason
                    ? "실전 후보 등록 불가"
                    : "실전 후보 등록"}
                </Button>
              )}
            </div>
            <p className="mb-2 mt-4 text-xs font-semibold uppercase tracking-wide rx-text-muted">
              기타
            </p>
            <div className="flex flex-wrap gap-2">
              <Link
                href={
                  strategyId
                    ? `/strategy-search?followUp=${encodeURIComponent(strategyId)}`
                    : "/strategy-search"
                }
                className="inline-flex items-center rounded-lg border border-slate-600 px-3 py-1.5 text-sm text-slate-200"
                data-testid="backtest-action-research"
              >
                이 전략으로 재탐색
              </Link>
              <Button
                size="sm"
                variant="outline"
                data-testid="backtest-download"
                onClick={() => {
                  const blob = new Blob(
                    [
                      JSON.stringify(
                        {
                          runId: selectedRunId,
                          strategyId,
                          strategyHash: strategy?.paramsHash ?? null,
                          report,
                          trades,
                        },
                        null,
                        2,
                      ),
                    ],
                    { type: "application/json" },
                  );
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement("a");
                  a.href = url;
                  a.download = `${selectedRunId || strategyId || "backtest"}.json`;
                  a.click();
                  URL.revokeObjectURL(url);
                }}
              >
                결과 다운로드
              </Button>
            </div>
            {actionMessage ? (
              <p
                className="mt-3 text-sm text-slate-300"
                data-testid="backtest-action-message"
              >
                {actionMessage}
              </p>
            ) : null}
          </Card>

          <BacktestAnalysisView
            key={`${selectedRunId || "live"}-${report.symbol}-${symbol}`}
            report={report}
            trades={trades}
            equityCurve={equityCurve}
            candles={candles}
            chartSamplingApplied={chartSamplingApplied}
            processedCandleCount={processedCandleCount}
            backtestRunId={selectedRunId || null}
            strategyType={
              (strategy as { strategyType?: string } | null)?.strategyType ??
              "safe_params"
            }
            eventSequenceFamily={null}
            eligibility={eligibility}
            paperEligible={!handoffBlocked}
            liveEligible={!handoffBlocked && !liveBlockedReason}
            paperBlockReason={paperBlockedReason}
            liveBlockReason={liveBlockedReason}
            chartReproWarning={chartReproWarning}
            chartSource={chartSource}
          />
          {/* Spacer so the final sticky-nav sections can reach the header band. */}
          <div className="h-[45vh]" aria-hidden="true" data-testid="backtest-nav-scroll-spacer" />
        </>
      ) : (
        <EmptyState
          message="아직 선택된 백테스트가 없습니다."
          hint="기간을 설정한 뒤 백테스트 실행을 누르거나, 저장된 실행을 불러오세요."
        />
      )}
    </div>
  );
}
