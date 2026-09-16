"use client";

import { Fragment, useCallback, useEffect, useState, Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Badge, Button } from "@/components/ui/primitives";
import { V3Card } from "@/components/rextora/v3/V3Card";
import { PaperVisualAnalytics } from "@/components/rextora/v3/PaperVisualAnalytics";
import { TradingChartsPanel } from "@/components/rextora/charts/TradingChartsPanel";
import type { UnifiedMetricsSnapshot } from "@/src/lib/rextora/metrics/types";
import type { UnifiedRiskView } from "@/src/lib/rextora/metrics/types";
import { EmptyState } from "@/components/rextora/EmptyState";
import { DemoDataBadge } from "@/components/rextora/DemoDataBadge";
import { AgentContextStrip } from "@/components/rextora/agent/AgentContextStrip";
import { formatDataSourceMeta } from "@/src/lib/rextora/displayLabels";
import { isDemoStrategyRecord } from "@/src/lib/rextora/firstRun/demoIdentity";
import {
  executionProvenanceStatusOperatorLabel,
  type PaperEventSequenceCostModelStatus,
} from "@/src/lib/rextora/paper/paperEventSequenceCostLabels";
import {
  paperOperatorCostModelLabel,
  paperOperatorExecutionKind,
  paperOperatorFormatCandleTime,
  paperOperatorFormatTime,
  paperOperatorLiveLabel,
  paperOperatorOhlcAudit,
  paperOperatorPositionOwnership,
  paperOperatorSelectDisplaySession,
  paperOperatorSessionCapitalUsdt,
  paperOperatorStatusLabel,
  paperOperatorStatusNextStep,
  paperOperatorStopReasonLabel,
  paperOperatorTradeBelongsToSession,
  paperOperatorLeverageAuthority,
  paperOperatorChartEmptyCopy,
  paperOperatorStatusTone,
  paperOperatorSignedFinancialTone,
  paperOperatorSignedFinancialText,
  paperOperatorCloseReasonPresentation,
  paperOperatorSidePresentation,
  paperOperatorTradeRealizedPnl,
  paperOperatorLoadedTradesComplete,
  paperOperatorHoldTimeText,
} from "@/src/lib/rextora/paper/paperOperatorPresentation";
import { useSetOperatorPageContext } from "@/components/rextora/shell/OperatorPageContext";

type Metrics = UnifiedMetricsSnapshot;

type PaperStrategy = {
  id: string;
  name: string;
  paramsHash: string;
  strategyHash?: string | null;
  displayAlias?: string | null;
  displayName?: string | null;
  executionProvenanceStatus?: "stamped" | "reconstructed" | null;
  symbols?: string[] | null;
  hasEventSequenceDefinition?: boolean;
  definitionMetadata?: Record<string, unknown> | null;
  strategyParams?: Record<string, unknown> | null;
  sizingLabel?: string | null;
  stopAuthority?: string | null;
  targetAuthority?: string | null;
  maxHoldLabel?: string | null;
};

type PaperSession = {
  id: string;
  sessionId?: string;
  strategyId: string;
  strategyHash: string;
  paramsHash?: string;
  strategyName: string;
  displayAliasSnapshot?: string | null;
  displayNameSnapshot?: string | null;
  sourceParamsHash?: string | null;
  sourceResearchJobId?: string | null;
  sourceTrialIteration?: number | null;
  backtestRunId?: string | null;
  backtestResultId?: string | null;
  status:
    | "pending_approval"
    | "ready"
    | "active"
    | "paused"
    | "risk_halted"
    | "stopped"
    | "failed";
  mode?: "paper";
  exchangeCalled?: false;
  virtualBalance: number;
  realizedPnl: number;
  unrealizedPnl: number;
  tradeCount: number;
  signalCount: number;
  heartbeatAt?: string | null;
  updatedAt?: string;
  startedAt?: string | null;
  stoppedAt?: string | null;
  lastError?: string | null;
  stopReason?: string | null;
  symbol?: string | null;
  timeframe?: string | null;
  eventSequenceCostModel?: string | null;
  eventSequenceCostModelStatus?: PaperEventSequenceCostModelStatus | null;
};

type CanonicalPaperStatus =
  | "idle"
  | "starting"
  | "pending_approval"
  | "ready"
  | "active"
  | "paused"
  | "risk_halted"
  | "stopping"
  | "stopped"
  | "error";

const PAPER_STATUS_LABEL: Record<CanonicalPaperStatus, string> = {
  idle: paperOperatorStatusLabel("idle"),
  starting: paperOperatorStatusLabel("starting"),
  pending_approval: paperOperatorStatusLabel("pending_approval"),
  ready: paperOperatorStatusLabel("ready"),
  active: paperOperatorStatusLabel("active"),
  paused: paperOperatorStatusLabel("paused"),
  risk_halted: paperOperatorStatusLabel("risk_halted"),
  stopping: paperOperatorStatusLabel("stopping"),
  stopped: paperOperatorStatusLabel("stopped"),
  error: paperOperatorStatusLabel("error"),
};

const PAPER_TRADE_TABLE_COLUMNS = [
  { label: "시각", align: "left" },
  { label: "심볼", align: "left" },
  { label: "방향", align: "left" },
  { label: "진입", align: "right" },
  { label: "청산", align: "right" },
  { label: "종료 사유", align: "left" },
  { label: "손익", align: "right" },
  { label: "보유시간", align: "left" },
] as const;

function paperFinitePrice(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function paperTradeRowClass(
  focused: boolean,
  selected: boolean,
  pnlTone: string,
): string {
  return [
    focused ? "is-focused" : "",
    selected ? "is-selected" : "",
    `is-pnl-${pnlTone}`,
  ]
    .filter(Boolean)
    .join(" ");
}

function paperPriceLevels(input: {
  entry?: unknown;
  stop?: unknown;
  target?: unknown;
  current?: unknown;
}): Array<{ key: "entry" | "stop" | "target" | "current"; label: string; value: number; pct: number }> {
  const items: Array<{
    key: "entry" | "stop" | "target" | "current";
    label: string;
    value: number;
  }> = [];
  const entry = paperFinitePrice(input.entry);
  const stop = paperFinitePrice(input.stop);
  const target = paperFinitePrice(input.target);
  const current = paperFinitePrice(input.current);
  if (entry != null) items.push({ key: "entry", label: "진입", value: entry });
  if (stop != null) items.push({ key: "stop", label: "손절", value: stop });
  if (target != null) items.push({ key: "target", label: "익절", value: target });
  if (current != null) items.push({ key: "current", label: "현재", value: current });
  if (items.length < 2) return [];
  const min = Math.min(...items.map((item) => item.value));
  const max = Math.max(...items.map((item) => item.value));
  const span = max - min || 1;
  return items.map((item) => ({
    ...item,
    pct: ((item.value - min) / span) * 100,
  }));
}

export default function PaperTradingPage() {
  return (
    <Suspense
      fallback={
        <div className="space-y-4 p-4 text-sm text-slate-400" data-testid="paper-trading-suspense">
          모의 매매 화면을 준비합니다…
        </div>
      }
    >
      <PaperTradingPageInner />
    </Suspense>
  );
}

function PaperTradingPageInner() {
  const searchParams = useSearchParams();
  const deepLinkStrategyId = searchParams.get("strategyId");
  const isDemoDeepLink = searchParams.get("demo") === "1";
  const [status, setStatus] = useState<Record<string, unknown> | null>(null);
  const [message, setMessage] = useState("");
  const [strategy, setStrategy] = useState<PaperStrategy | null>(null);
  const [sessions, setSessions] = useState<PaperSession[]>([]);
  const [currentSession, setCurrentSession] = useState<PaperSession | null>(
    null,
  );
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(
    null,
  );
  const [tradeScope, setTradeScope] = useState<"session" | "all">("session");
  const [hoveredTradeIndex, setHoveredTradeIndex] = useState<number | null>(
    null,
  );
  const [selectedTradeIndex, setSelectedTradeIndex] = useState<number | null>(
    null,
  );
  const [liveTradingEnabled, setLiveTradingEnabled] = useState(false);
  const [allowLiveTrading, setAllowLiveTrading] = useState(false);
  const [riskView, setRiskView] = useState<UnifiedRiskView | null>(null);
  const [origin, setOrigin] = useState("");
  const [sessionBusy, setSessionBusy] = useState(false);
  const [identityLoading, setIdentityLoading] = useState(true);
  const [identityError, setIdentityError] = useState<string | null>(null);
  const [pendingPhase, setPendingPhase] = useState<
    "starting" | "stopping" | null
  >(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const [dash, strategies, bot, sessionRes, settingsRes] = await Promise.all([
        fetch("/api/rextora/trading/dashboard").then((r) => r.json()),
        fetch("/api/rextora/strategies").then((r) => r.json()),
        fetch("/api/rextora/bot/status").then((r) => r.json()),
        fetch("/api/rextora/paper/session").then((r) => r.json()),
        fetch("/api/rextora/settings").then((r) => r.json()),
      ]);
      setStatus(dash.data?.status ?? dash.status ?? null);
      if (dash.meta)
        setOrigin(
          formatDataSourceMeta(
            dash.meta.source,
            dash.meta.cached,
            dash.meta.durationMs,
          ),
        );
      setRiskView(bot.data?.riskView ?? null);
      const list = (strategies.data ?? []) as Array<{
        id: string;
        name: string;
        paramsHash: string;
        strategyHash?: string | null;
        displayAlias?: string | null;
        displayName?: string | null;
        paperActive?: boolean;
        symbols?: string[] | null;
        strategyType?: string | null;
        definition?: {
          eventSequence?: unknown;
          risk?: { maxHoldBars?: number };
          positionSizing?: { baseBalancePct?: number };
          metadata?: Record<string, unknown> | null;
        } | null;
        params?: Record<string, unknown> | null;
        executionProvenance?: {
          provenanceStatus?: "stamped" | "reconstructed";
        } | null;
      }>;
      const listedSessions = (sessionRes.data?.sessions ?? []) as PaperSession[];
      const currentSessionRecord = (sessionRes.data?.active ??
        null) as PaperSession | null;
      setSessions(listedSessions);
      setCurrentSession(currentSessionRecord);
      const displaySession =
        (selectedSessionId
          ? listedSessions.find((item) => item.id === selectedSessionId)
          : null) ??
        paperOperatorSelectDisplaySession({
          current: currentSessionRecord,
          sessions: listedSessions,
        });
      const settingsRoot = settingsRes.data ?? {};
      const trading = (settingsRoot.settings ?? settingsRoot).trading as
        | { liveTradingEnabled?: boolean; allowLiveTrading?: boolean }
        | undefined;
      setLiveTradingEnabled(trading?.liveTradingEnabled === true);
      setAllowLiveTrading(trading?.allowLiveTrading === true);

      // Canonical identity: current/displayed session wins over registry paperActive.
      const fromSession = displaySession?.strategyId
        ? list.find((s) => s.id === displaySession.strategyId)
        : null;
      const fromDeepLink = deepLinkStrategyId
        ? list.find((s) => s.id === deepLinkStrategyId)
        : null;
      const paperRegistered = list.find((s) => s.paperActive);
      const canonical = fromSession ?? fromDeepLink ?? paperRegistered ?? null;
      if (canonical || displaySession) {
        const params = canonical?.params ?? {};
        const sizingPct = canonical?.definition?.positionSizing?.baseBalancePct;
        const maxHold =
          canonical?.definition?.risk?.maxHoldBars ??
          (typeof params.max_hold_bars === "number" ? params.max_hold_bars : null);
        const slAtr = typeof params.sl_atr_mult === "number" ? params.sl_atr_mult : null;
        const tpAtr = typeof params.tp_atr_mult === "number" ? params.tp_atr_mult : null;
        setStrategy({
          id: displaySession?.strategyId ?? canonical!.id,
          name:
            displaySession?.displayAliasSnapshot ??
            displaySession?.strategyName ??
            canonical?.displayAlias ??
            canonical?.displayName ??
            canonical?.name ??
            "모의 전략",
          paramsHash: canonical?.paramsHash ?? "",
          strategyHash:
            displaySession?.strategyHash ?? canonical?.strategyHash ?? null,
          displayAlias:
            displaySession?.displayAliasSnapshot ??
            canonical?.displayAlias ??
            null,
          displayName:
            displaySession?.displayNameSnapshot ??
            canonical?.displayName ??
            null,
          executionProvenanceStatus:
            canonical?.executionProvenance?.provenanceStatus ?? null,
          symbols: canonical?.symbols ?? (displaySession?.symbol ? [displaySession.symbol] : null),
          hasEventSequenceDefinition: Boolean(canonical?.definition?.eventSequence),
          definitionMetadata: canonical?.definition?.metadata ?? null,
          strategyParams: canonical?.params ?? null,
          sizingLabel:
            typeof sizingPct === "number"
              ? `잔고 ${Number((sizingPct * 100).toFixed(2))}%`
              : null,
          stopAuthority: slAtr != null ? `ATR × ${slAtr}` : null,
          targetAuthority: tpAtr != null ? `ATR × ${tpAtr}` : null,
          maxHoldLabel: maxHold != null ? `${maxHold}봉` : null,
        });
      } else {
        setStrategy(null);
      }
      setIdentityError(null);
      setLoadError(null);
    } catch (e) {
      setIdentityError(
        e instanceof Error ? e.message : "모의매매 데이터를 불러오지 못했습니다.",
      );
      setLoadError("모의매매 상태를 불러오지 못했습니다.");
    } finally {
      setIdentityLoading(false);
      setPendingPhase(null);
    }
  }, [deepLinkStrategyId, selectedSessionId]);

  useEffect(() => {
    const timer = setTimeout(() => {
      void refresh();
    }, 0);
    const t = setInterval(() => void refresh(), 8000);
    return () => {
      clearTimeout(timer);
      clearInterval(t);
    };
  }, [refresh]);

  const session =
    (selectedSessionId
      ? sessions.find((item) => item.id === selectedSessionId)
      : null) ??
    paperOperatorSelectDisplaySession({
      current: currentSession,
      sessions,
    });

  const canonicalStatus: CanonicalPaperStatus = (() => {
    if (loadError && !session) return "error";
    if (pendingPhase === "starting") return "starting";
    if (pendingPhase === "stopping") return "stopping";
    if (!session) return "idle";
    if (session.status === "pending_approval") return "pending_approval";
    if (session.status === "ready") return "ready";
    if (session.status === "active") return "active";
    if (session.status === "paused") return "paused";
    if (session.status === "risk_halted") return "risk_halted";
    if (session.status === "stopped") return "stopped";
    if (session.status === "failed") return "error";
    return "error";
  })();

  async function startPaper() {
    if (!strategy?.id) {
      setMessage("활성 모의 전략이 없습니다. 탐색 결과에서 등록하세요.");
      return;
    }
    setSessionBusy(true);
    setPendingPhase("starting");
    try {
      // Explicit approve+start via canonical service (never URL auto-start).
      const res = await fetch("/api/rextora/paper/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          strategyId: strategy.id,
          approve: true,
          idempotencyKey: `paper-start-${strategy.id}-${Date.now()}`,
        }),
      });
      const json = await res.json();
      if (!json.ok) {
        setMessage(json.error ?? "세션 시작 실패");
        return;
      }
      const started = json.data?.session;
      setMessage(
        started
          ? `모의매매 시작 · 세션 ${started.id} · 전략 ${started.strategyId} · 시뮬레이션 전용`
          : "모의매매가 시작되었습니다.",
      );
      setSelectedSessionId(null);
      await refresh();
    } finally {
      setSessionBusy(false);
      setPendingPhase(null);
    }
  }

  async function sessionAction(action: "pause" | "resume" | "stop") {
    if (!session?.id) {
      setMessage("활성 세션이 없습니다.");
      return;
    }
    setSessionBusy(true);
    if (action === "stop") setPendingPhase("stopping");
    try {
      const res = await fetch(
        `/api/rextora/paper/session/${encodeURIComponent(session.id)}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action,
            strategyId: session.strategyId,
          }),
        },
      );
      const json = await res.json();
      setMessage(
        json.ok
          ? `세션 ${action}: ${json.data?.session?.status ?? ""}`
          : (json.error ?? "세션 작업 실패"),
      );
      await refresh();
    } finally {
      setSessionBusy(false);
      setPendingPhase(null);
    }
  }

  const s = status as {
    modeLabel?: string;
    botStatusLabel?: string;
    todayStats?: {
      realizedPnlPct: number;
      trades: number;
      realizedPnlUsdt?: number;
      unrealizedPnlUsdt?: number;
      feeUsdt?: number;
      fundingUsdt?: number;
      slippageUsdt?: number;
      accountEquity?: number;
      accountReturnPct?: number;
    };
    metrics?: Metrics;
    operations?: { watchedSymbolCount: number; openPositionCount: number };
    positions?: Array<Record<string, unknown>>;
    paperPositions?: Array<Record<string, unknown>>;
    recentTrades?: Array<Record<string, unknown>>;
    activeStrategy?: { name: string; paramsHash: string };
  } | null;

  const m = s?.metrics;
  const ts = s?.todayStats;
  const hasPaperSession = Boolean(session);
  const paperExecutorActive = canonicalStatus === "active";
  const sessionMetricsAvailable = Boolean(session);
  const sessionCapital = session
    ? paperOperatorSessionCapitalUsdt({
        virtualBalance: session.virtualBalance,
        realizedPnl: session.realizedPnl,
      })
    : null;
  const executionKind = paperOperatorExecutionKind({
    strategyId: strategy?.id ?? session?.strategyId,
    hasEventSequenceDefinition: strategy?.hasEventSequenceDefinition,
    eventSequenceCostModel: session?.eventSequenceCostModel,
  });
  const costPresentation = paperOperatorCostModelLabel({
    costModel: session?.eventSequenceCostModel,
    costModelStatus: session?.eventSequenceCostModelStatus,
  });
  const chartEmptyCopy = paperOperatorChartEmptyCopy({
    status: session?.status ?? (hasPaperSession ? null : "idle"),
    startedAt: session?.startedAt,
    tradeCount: session?.tradeCount ?? 0,
    sessionPresent: hasPaperSession,
  });
  useSetOperatorPageContext(
    hasPaperSession || strategy
      ? {
          source: "paper",
          strategyId: strategy?.id ?? session?.strategyId ?? null,
          strategyLabel:
            strategy?.displayName ??
            session?.displayNameSnapshot ??
            strategy?.id ??
            session?.strategyId ??
            null,
          paperSessionId: session?.id ?? null,
          paperSessionStatus: session?.status ?? null,
          symbol:
            session?.symbol ??
            strategy?.symbols?.[0] ??
            null,
          timeframe: session?.timeframe ?? null,
          researchJobId: session?.sourceResearchJobId ?? null,
        }
      : {
          source: "paper",
          strategyId: null,
          strategyLabel: null,
          paperSessionId: null,
          paperSessionStatus: "idle",
          symbol: null,
          timeframe: null,
          researchJobId: null,
        },
  );
  const livePresentation = paperOperatorLiveLabel({
    liveTradingEnabled,
    allowLiveTrading,
  });
  const stopReasonPresentation = paperOperatorStopReasonLabel(session?.stopReason);
  const paperPositions = (s?.paperPositions ?? s?.positions ?? []) as Array<
    Record<string, unknown>
  >;
  const openPaperPositions = paperPositions.filter(
    (p) => Number(p.quantity) > 0 && String(p.side) !== "Flat" && String(p.side) !== "FLAT",
  );
  const openLeverageRaw = openPaperPositions[0]?.leverage;
  const leverageAuthority = paperOperatorLeverageAuthority({
    definitionMetadata: strategy?.definitionMetadata,
    strategyParams: strategy?.strategyParams,
    openPositionLeverage:
      openLeverageRaw != null && Number.isFinite(Number(openLeverageRaw))
        ? Number(openLeverageRaw)
        : null,
    strategyName: strategy?.displayAlias ?? strategy?.name,
  });
  const allTrades = (s?.recentTrades ?? []) as Array<Record<string, unknown>>;
  const scopedTrades = session
    ? allTrades.filter((t) => {
        const scope = paperOperatorTradeBelongsToSession({
          tradeStrategyId:
            typeof t.strategyId === "string" ? t.strategyId : null,
          tradePaperSessionId:
            typeof t.paperSessionId === "string" ? t.paperSessionId : null,
          tradeMode: typeof t.mode === "string" ? t.mode : "PAPER",
          sessionId: session.id,
          sessionStrategyId: session.strategyId,
        });
        return tradeScope === "all" ? true : scope !== "global";
      })
    : allTrades;
  const strategyLabel =
    strategy?.displayAlias ??
    strategy?.displayName ??
    strategy?.name ??
    "등록된 모의 전략 없음";
  const viewingHistorical =
    Boolean(session) &&
    (canonicalStatus === "stopped" ||
      canonicalStatus === "error" ||
      (currentSession?.id != null &&
        session?.id != null &&
        session.id !== currentSession.id &&
        canonicalStatus !== "active" &&
        canonicalStatus !== "paused" &&
        canonicalStatus !== "risk_halted"));
  const sessionKind = viewingHistorical ? "stopped" : canonicalStatus;
  const primaryPosition = openPaperPositions[0] ?? null;
  const levelSource =
    primaryPosition ??
    paperPositions.find((p) => paperFinitePrice(p.entryPrice) != null) ??
    null;
  const priceLevels = paperPriceLevels({
    entry: levelSource?.entryPrice,
    stop: levelSource?.stopLoss,
    target: levelSource?.takeProfit,
    current: levelSource?.currentPrice,
  });
  const realizedTone = session
    ? paperOperatorSignedFinancialTone(session.realizedPnl)
    : "zero";
  const statusTone = paperOperatorStatusTone(canonicalStatus);
  const sessionScopedTrades = session
    ? allTrades.filter((t) => {
        const scope = paperOperatorTradeBelongsToSession({
          tradeStrategyId:
            typeof t.strategyId === "string" ? t.strategyId : null,
          tradePaperSessionId:
            typeof t.paperSessionId === "string" ? t.paperSessionId : null,
          tradeMode: typeof t.mode === "string" ? t.mode : "PAPER",
          sessionId: session.id,
          sessionStrategyId: session.strategyId,
        });
        return scope !== "global";
      })
    : [];
  const displayedTrades = scopedTrades.slice(0, 20);
  const analyticsComplete =
    tradeScope === "all"
      ? paperOperatorLoadedTradesComplete(allTrades.length)
      : Boolean(
          session && sessionScopedTrades.length === session.tradeCount,
        );
  const focusedTradeIndex = hoveredTradeIndex ?? selectedTradeIndex;
  const focusedChronoIndex =
    focusedTradeIndex == null || displayedTrades.length === 0
      ? null
      : displayedTrades.length - 1 - focusedTradeIndex;
  const barsHeld =
    primaryPosition?.barsHeld != null &&
    Number.isFinite(Number(primaryPosition.barsHeld))
      ? Number(primaryPosition.barsHeld)
      : null;
  const maxHoldBars =
    primaryPosition?.maxHoldBars != null &&
    Number.isFinite(Number(primaryPosition.maxHoldBars))
      ? Number(primaryPosition.maxHoldBars)
      : null;

  return (
    <div
      className="rextora-page v3 v3-paper"
      data-testid="paper-trading-page"
      data-session-kind={sessionKind}
    >
      <div className="v3-pp-pagehead">
        <header>
          <h1 className="rextora-page-title">모의매매</h1>
          <p>
            포지션과 손절·익절·보유 상태를 중심으로 봅니다. 가상 자금으로
            전략을 시험하며 실제 주문은 전송되지 않습니다.
          </p>
        </header>
        <p className="v3-pp-asof" data-testid="paper-live-inactive">
          {livePresentation.label}
        </p>
      </div>
      <AgentContextStrip pageLabelKo="모의매매" />

      <div className="v3-pp-workbench">
        {isDemoDeepLink || (strategy && isDemoStrategyRecord(strategy)) ? (
          <div className="v3-pp-banner" data-testid="paper-demo-deep-link">
            <DemoDataBadge />
            <p>
              데모 딥링크입니다. 세션은 자동 시작되지 않으며, 시작하려면 아래
              「모의매매 시작」을 직접 승인해야 합니다.
            </p>
            {!session ? (
              <Badge tone="info" data-testid="paper-demo-no-session">
                세션 대기 · 자동 시작 없음
              </Badge>
            ) : null}
          </div>
        ) : null}

        {identityLoading ? (
          <div className="v3-pp-loading" data-testid="paper-strategy-loading">
            전략·세션 정보를 확인하는 중…
          </div>
        ) : identityError ? (
          <div
            className="v3-pp-alert"
            data-testid="paper-strategy-error"
            role="alert"
          >
            {identityError}
          </div>
        ) : null}

        <section
          className="v3-pp-exec"
          data-testid="paper-control-bar"
        >
          <div className="v3-pp-exec-identity" data-testid="paper-active-strategy">
            <span>전략</span>
            <b data-testid="paper-strategy-name">{strategyLabel}</b>
            <p className="v3-pp-next" data-testid="paper-execution-kind">
              실행 유형 {executionKind.label}
            </p>
            <p className="v3-pp-next" data-testid="paper-session-symbols">
              거래 심볼{" "}
              {(strategy?.symbols && strategy.symbols.length > 0
                ? strategy.symbols.join(", ")
                : session?.symbol) ?? "확인 필요"}
            </p>
          </div>
          {sessions.length > 0 ? (
            <select
              data-testid="paper-session-select"
              aria-label="모의매매 세션"
              value={session?.id ?? ""}
              onChange={(event) => {
                const next = event.target.value;
                setSelectedSessionId(next || null);
              }}
            >
              {sessions.map((item) => {
                const label = paperOperatorStatusLabel(
                  item.status === "failed" ? "error" : item.status,
                );
                const kind =
                  item.status === "active"
                    ? "실행 중"
                    : item.status === "paused" || item.status === "risk_halted"
                      ? "일시정지"
                      : "기록";
                return (
                  <option key={item.id} value={item.id}>
                    {item.displayAliasSnapshot ?? item.strategyName} · {kind} ·{" "}
                    {label}
                  </option>
                );
              })}
            </select>
          ) : null}
          <div className="v3-pp-sticky-actions">
            {canonicalStatus === "idle" ||
            canonicalStatus === "ready" ||
            canonicalStatus === "pending_approval" ||
            canonicalStatus === "stopped" ? (
              <>
                <Button
                  tone="success"
                  loading={sessionBusy}
                  data-testid="paper-start"
                  disabled={identityLoading || !strategy?.id}
                  onClick={() => void startPaper()}
                >
                  {canonicalStatus === "stopped" ? "새 세션 시작" : "모의매매 시작"}
                </Button>
                {!identityLoading && !strategy?.id ? (
                  <p
                    className="w-full text-sm"
                    data-testid="paper-start-disabled-reason"
                  >
                    시작 불가: 모의매매에 연결된 등록 전략이 없습니다. 탐색 결과에서
                    전략을 등록한 뒤 「모의매매 등록」을 실행하세요.
                  </p>
                ) : null}
              </>
            ) : null}
            {canonicalStatus === "starting" ? (
              <Button tone="muted" disabled data-testid="paper-starting">
                시작 중…
              </Button>
            ) : null}
            {canonicalStatus === "active" ? (
              <>
                <Button
                  tone="warning"
                  loading={sessionBusy}
                  data-testid="paper-session-pause"
                  onClick={() => void sessionAction("pause")}
                >
                  일시정지
                </Button>
                <Button
                  tone="danger"
                  loading={sessionBusy}
                  data-testid="paper-session-stop"
                  onClick={() => void sessionAction("stop")}
                >
                  종료
                </Button>
              </>
            ) : null}
            {canonicalStatus === "paused" ||
            canonicalStatus === "risk_halted" ? (
              <>
                {canonicalStatus === "risk_halted" ? (
                  <p
                    className="mb-2 w-full text-sm"
                    data-testid="paper-risk-halt-control-reason"
                  >
                    {session?.lastError ?? "리스크 한도 위반"} · 자동 재개 없음
                  </p>
                ) : null}
                <Button
                  tone="success"
                  loading={sessionBusy}
                  data-testid="paper-session-resume"
                  onClick={() => void sessionAction("resume")}
                >
                  재개
                </Button>
                <Button
                  tone="danger"
                  loading={sessionBusy}
                  data-testid="paper-session-stop"
                  onClick={() => void sessionAction("stop")}
                >
                  종료
                </Button>
              </>
            ) : null}
            {canonicalStatus === "stopping" ? (
              <Button tone="muted" disabled data-testid="paper-stopping">
                종료 중…
              </Button>
            ) : null}
            {canonicalStatus === "stopped" ? (
              <Link href="/results" data-testid="paper-view-results">
                결과 보기
              </Link>
            ) : null}
            {canonicalStatus === "error" ? (
              <Button
                tone="warning"
                data-testid="paper-retry"
                onClick={() => void refresh()}
              >
                안전 재시도
              </Button>
            ) : null}
          </div>
        </section>

        <section
          className="v3-pp-statusbar"
          data-session-kind={sessionKind}
          data-testid="paper-canonical-status"
        >
          <div className="v3-pp-status-main">
            <span>현재 세션</span>
            <b>
              <span
                className={`v3-pp-chip is-${statusTone}`}
                data-testid="paper-session-state-chip"
              >
                {PAPER_STATUS_LABEL[canonicalStatus]}
              </span>
              {session ? ` · 거래 ${session.tradeCount}건` : ""}
              {viewingHistorical ? " · 기록 보기" : ""}
            </b>
            <p className="v3-pp-next" data-testid="paper-status-next-step">
              {paperOperatorStatusNextStep(canonicalStatus)}
            </p>
          </div>
          <div className="v3-pp-status-cell">
            <span>자본</span>
            <b>
              {session
                ? `${(sessionCapital ?? 0).toFixed(2)} USDT`
                : "세션 없음"}
            </b>
          </div>
          <div className="v3-pp-status-cell">
            <span>손익</span>
            <b className={`is-${realizedTone}`}>
              {session
                ? paperOperatorSignedFinancialText(
                    session.realizedPnl,
                    " USDT",
                  )
                : "세션 없음"}
            </b>
          </div>
          <div className="v3-pp-status-cell">
            <span>포지션</span>
            <b>{openPaperPositions.length}</b>
          </div>
          <div className="v3-pp-status-cell">
            <span>실제 주문</span>
            <b className="bad">차단</b>
          </div>
        </section>

        {canonicalStatus === "pending_approval" ? (
          <p className="v3-pp-soft" data-testid="paper-approval-pending-copy">
            승인 후 모의매매를 시작할 수 있습니다.
          </p>
        ) : null}
        {canonicalStatus === "risk_halted" ? (
          <p className="v3-pp-soft" data-testid="paper-risk-halt-reason">
            {paperOperatorStatusNextStep("risk_halted")}{" "}
            {session?.lastError ?? session?.stopReason ?? "리스크 한도 위반"}
          </p>
        ) : null}

        {canonicalStatus === "idle" ||
        canonicalStatus === "ready" ||
        canonicalStatus === "pending_approval" ? (
          <ul className="v3-pp-conditions" data-testid="paper-start-conditions">
            <li>전략 선택: {strategy?.id ? "완료" : "필요"}</li>
            <li>
              비용 모델:{" "}
              {costPresentation.unresolved ? "확인 필요" : costPresentation.label}
            </li>
            <li>
              운영자 승인:{" "}
              {canonicalStatus === "pending_approval"
                ? "승인 후 모의매매를 시작할 수 있습니다."
                : "시작 버튼으로 승인합니다."}
            </li>
            <li>세션 자본: {strategy?.id ? "10,000 USDT 기본" : "확인 필요"}</li>
            <li>실전 매매: {livePresentation.label}</li>
          </ul>
        ) : null}
        {message ? <p className="v3-pp-next">{message}</p> : null}

        <div
          className={
            openPaperPositions.length > 0
              ? "v3-pp-grid has-open-position"
              : "v3-pp-grid is-empty-position"
          }
        >
          <V3Card
            className={
              openPaperPositions.length > 0 ? "v3-pp-s8" : "v3-pp-s8 is-empty"
            }
            title="포지션 모니터"
            meta={openPaperPositions.length > 0 ? "청산 조건 우선" : "열린 포지션 없음"}
            data-testid="paper-positions-card"
          >
            {openPaperPositions.length > 0 ? (
              <div className="grid min-w-0 gap-3">
                {openPaperPositions.map((p, i) => {
                  const ownership = paperOperatorPositionOwnership({
                    paperSessionId:
                      typeof p.paperSessionId === "string" ? p.paperSessionId : null,
                    paperStrategyId:
                      typeof p.paperStrategyId === "string" ? p.paperStrategyId : null,
                    sessionId: session?.id,
                    strategyId: session?.strategyId ?? strategy?.id,
                  });
                  const audit = paperOperatorOhlcAudit(
                    (p.lastProcessedFinalizedCandle as
                      | {
                          openTime: number;
                          closeTime?: number;
                          open: number;
                          high: number;
                          low: number;
                          close: number;
                        }
                      | undefined) ?? null,
                  );
                  const hold =
                    barsHeld != null && maxHoldBars != null
                      ? `${barsHeld} / ${maxHoldBars}`
                      : strategy?.maxHoldLabel ?? "확인 필요";
                  return (
                    <div
                      key={`${String(p.symbol)}-${i}`}
                      className="min-w-0"
                      data-testid="paper-open-position"
                    >
                      <p>
                        <strong>
                          {String(p.symbol)} · {String(p.side)}
                        </strong>
                      </p>
                      <div className="v3-pp-metrics" style={{ marginTop: 10 }}>
                        <div className="v3-pp-metric">
                          <span>진입가</span>
                          <b>{String(p.entryPrice)}</b>
                        </div>
                        <div className="v3-pp-metric">
                          <span>손절가</span>
                          <b className="bad">{String(p.stopLoss)}</b>
                        </div>
                        <div className="v3-pp-metric">
                          <span>익절가</span>
                          <b className="ok">{String(p.takeProfit)}</b>
                        </div>
                        <div className="v3-pp-metric">
                          <span>보유 봉</span>
                          <b>{hold}</b>
                        </div>
                      </div>
                      <p className="v3-pp-next" style={{ marginTop: 10 }}>
                        현재 {String(p.currentPrice)}
                        {p.unrealizedPnl != null
                          ? ` · 미실현 ${String(p.unrealizedPnl)} USDT`
                          : ""}
                        {p.holdTimeLabel != null && String(p.holdTimeLabel) !== "-"
                          ? ` · 보유 ${String(p.holdTimeLabel)}`
                          : ""}
                        {p.leverage != null
                          ? ` · 레버리지 ${String(p.leverage)}x`
                          : " · 레버리지 확인 필요"}
                      </p>
                      {i === 0 && priceLevels.length > 0 ? (
                        <div data-testid="paper-price-levels">
                          <div className="v3-pp-levels" aria-hidden>
                            <div className="v3-pp-levels-track" />
                            {priceLevels.map((level) => (
                              <div
                                key={level.key}
                                className={`v3-pp-level is-${level.key}`}
                                style={{ left: `${level.pct}%` }}
                              >
                                <span>{level.label}</span>
                                <b>{String(level.value)}</b>
                              </div>
                            ))}
                          </div>
                          <p className="v3-pp-levels-note">
                            세션 청산 구조 · 저장된 진입·손절·익절·현재가
                          </p>
                        </div>
                      ) : null}
                      <p
                        className="v3-pp-next"
                        data-testid="paper-position-ownership"
                      >
                        {ownership.label}
                      </p>
                      <details className="v3-pp-disc" style={{ marginTop: 10 }}>
                        <summary>거래 판단 근거</summary>
                        {audit.available && audit.candle ? (
                          <p className="mt-1" data-testid="paper-ohlc-audit">
                            {paperOperatorFormatCandleTime(audit.candle.openTime)} · O{" "}
                            {audit.candle.open} · H {audit.candle.high} · L{" "}
                            {audit.candle.low} · C {audit.candle.close}
                          </p>
                        ) : (
                          <p className="mt-1" data-testid="paper-ohlc-legacy">
                            {audit.label}
                          </p>
                        )}
                      </details>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="v3-pp-empty-position">
                {!hasPaperSession ? (
                  <div className="v3-pp-empty" data-testid="paper-idle-status">
                    <p>현재 실행 중인 모의매매가 없습니다.</p>
                    <p>
                      등록된 전략을 확인한 뒤 아래에서 모의매매를 시작하세요. 실제
                      주문은 전송되지 않습니다.
                    </p>
                    {!strategy?.id ? (
                      <Link
                        href="/results"
                        className="mt-4 inline-flex items-center rounded-lg border px-3 py-2 text-sm font-semibold"
                      >
                        탐색 결과에서 전략 등록
                      </Link>
                    ) : null}
                  </div>
                ) : null}
                <EmptyState
                  className="v3-pp-position-empty"
                  message="열린 모의 포지션이 없습니다. 모의 매매를 시작하면 진입 조건을 통과한 포지션이 여기에 표시됩니다."
                  hint={hasPaperSession ? chartEmptyCopy.hint : undefined}
                />
                {paperPositions.some(
                  (p) => String(p.paperLifecycleModel) === "event_sequence_paper_v1",
                ) ? (
                  <details className="v3-pp-disc" style={{ marginTop: 12 }}>
                    <summary>거래 판단 근거 · 종료된 기록</summary>
                    {paperPositions
                      .filter(
                        (p) =>
                          String(p.paperLifecycleModel) === "event_sequence_paper_v1",
                      )
                      .map((p, i) => {
                        const ownership = paperOperatorPositionOwnership({
                          paperSessionId:
                            typeof p.paperSessionId === "string"
                              ? p.paperSessionId
                              : null,
                          paperStrategyId:
                            typeof p.paperStrategyId === "string"
                              ? p.paperStrategyId
                              : null,
                          sessionId: session?.id,
                          strategyId: session?.strategyId ?? strategy?.id,
                        });
                        const audit = paperOperatorOhlcAudit(
                          (p.lastProcessedFinalizedCandle as
                            | {
                                openTime: number;
                                closeTime?: number;
                                open: number;
                                high: number;
                                low: number;
                                close: number;
                              }
                            | undefined) ?? null,
                        );
                        return (
                          <div key={`closed-${i}`} className="mt-2">
                            <p data-testid="paper-closed-ownership">
                              {ownership.label}
                            </p>
                            {audit.available && audit.candle ? (
                              <p data-testid="paper-ohlc-audit">
                                {paperOperatorFormatCandleTime(audit.candle.openTime)}{" "}
                                · O {audit.candle.open} · H {audit.candle.high} · L{" "}
                                {audit.candle.low} · C {audit.candle.close}
                              </p>
                            ) : (
                              <p data-testid="paper-ohlc-legacy">{audit.label}</p>
                            )}
                          </div>
                        );
                      })}
                  </details>
                ) : null}
              </div>
            )}
          </V3Card>

          <V3Card
            className={
              openPaperPositions.length > 0
                ? "v3-pp-s4"
                : "v3-pp-s4 is-session-summary"
            }
            title="세션"
            meta={viewingHistorical ? "기록" : "현재 선택"}
          >
            {hasPaperSession && session ? (
              <div
                className={
                  openPaperPositions.length > 0
                    ? "v3-pp-stack"
                    : "v3-pp-session-summary"
                }
                data-testid="paper-session-metrics"
              >
                <div className="v3-pp-metric is-secondary">
                  <span>전략</span>
                  <b>{strategyLabel}</b>
                </div>
                <div className="v3-pp-metric is-state">
                  <span>상태</span>
                  <b>
                    <span
                      className={`v3-pp-chip is-${statusTone}`}
                      data-testid="paper-session-state"
                    >
                      {PAPER_STATUS_LABEL[canonicalStatus]}
                    </span>
                  </b>
                </div>
                {canonicalStatus === "stopped" ? (
                  <div className="v3-pp-metric is-secondary">
                    <span>종료 이유</span>
                    <b data-testid="paper-stop-reason">
                      {stopReasonPresentation.label}
                      {stopReasonPresentation.raw ? (
                        <span className="v3-pp-mono">
                          {" "}
                          {stopReasonPresentation.raw}
                        </span>
                      ) : null}
                    </b>
                  </div>
                ) : null}
                <div className="v3-pp-metric is-capital">
                  <span>시작 자본</span>
                  <b>{`${session.virtualBalance.toFixed(2)} USDT`}</b>
                </div>
                <div className="v3-pp-metric is-capital">
                  <span>현재 자본</span>
                  <b>{`${(sessionCapital ?? 0).toFixed(2)} USDT`}</b>
                </div>
                <div className={`v3-pp-metric is-pnl is-${realizedTone}`}>
                  <span>실현 손익</span>
                  <b className={`is-${realizedTone}`}>
                    {paperOperatorSignedFinancialText(
                      session.realizedPnl,
                      " USDT",
                    )}
                  </b>
                </div>
                <div className="v3-pp-metric is-count">
                  <span>완료 거래</span>
                  <b>{String(session.tradeCount)}</b>
                </div>
                {!sessionMetricsAvailable ? (
                  <p data-testid="paper-session-metrics-unavailable">
                    승인 후 모의매매를 시작할 수 있습니다.
                  </p>
                ) : null}
              </div>
            ) : (
              <div className="v3-pp-empty">
                <p>선택된 세션이 없습니다.</p>
              </div>
            )}
          </V3Card>

          {hasPaperSession && session ? (
            <PaperVisualAnalytics
              scope={tradeScope}
              scopeComplete={analyticsComplete}
              startCapital={session.virtualBalance}
              currentCapital={sessionCapital}
              realizedPnl={session.realizedPnl}
              focusedChronoIndex={focusedChronoIndex}
              onFocusChronoIndex={(chrono) => {
                if (chrono == null) {
                  setHoveredTradeIndex(null);
                  return;
                }
                setHoveredTradeIndex(displayedTrades.length - 1 - chrono);
              }}
              trades={displayedTrades.map((t) => ({
                time: String(t.time ?? ""),
                symbol: String(t.symbol ?? ""),
                direction: String(t.direction ?? ""),
                exitReason: String(t.exitReasonLabel ?? ""),
                netPnl: paperOperatorTradeRealizedPnl(t),
                pnlPct:
                  t.pnlPct != null && Number.isFinite(Number(t.pnlPct))
                    ? Number(t.pnlPct)
                    : null,
              }))}
            />
          ) : null}

          <V3Card
            className="v3-pp-full"
            title="거래"
            headerAction={
              <div className="v3-pp-tabs">
                <Button
                  tone={tradeScope === "session" ? "success" : "muted"}
                  className={tradeScope === "session" ? "is-active" : undefined}
                  data-testid="paper-trades-session-filter"
                  onClick={() => {
                    setTradeScope("session");
                    setHoveredTradeIndex(null);
                    setSelectedTradeIndex(null);
                  }}
                >
                  세션 거래
                </Button>
                <Button
                  tone={tradeScope === "all" ? "success" : "muted"}
                  className={tradeScope === "all" ? "is-active" : undefined}
                  data-testid="paper-trades-global-filter"
                  onClick={() => {
                    setTradeScope("all");
                    setHoveredTradeIndex(null);
                    setSelectedTradeIndex(null);
                  }}
                >
                  전체 거래
                </Button>
              </div>
            }
            data-testid="paper-trades-card"
          >
            {displayedTrades.length > 0 ? (
              <div
                className="v3-pp-table-wrap"
                onMouseLeave={() => setHoveredTradeIndex(null)}
              >
                <table className="v3-pp-table">
                  <thead>
                    <tr>
                      {PAPER_TRADE_TABLE_COLUMNS.map((column) => (
                        <th
                          key={column.label}
                          className={column.align === "right" ? "right" : undefined}
                        >
                          {column.label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {displayedTrades.map((t, i) => {
                      const scope = session
                        ? paperOperatorTradeBelongsToSession({
                            tradeStrategyId:
                              typeof t.strategyId === "string" ? t.strategyId : null,
                            tradePaperSessionId:
                              typeof t.paperSessionId === "string"
                                ? t.paperSessionId
                                : null,
                            tradeMode: typeof t.mode === "string" ? t.mode : "PAPER",
                            sessionId: session.id,
                            sessionStrategyId: session.strategyId,
                          })
                        : "unscoped";
                      const scopeLabel =
                        scope === "session"
                          ? "현재 세션"
                          : scope === "unscoped"
                            ? "이전 버전 기록 — 소유정보 없음"
                            : "전체 모의매매 기록";
                      const closeReason = paperOperatorCloseReasonPresentation(
                        typeof t.exitReasonLabel === "string"
                          ? t.exitReasonLabel
                          : null,
                      );
                      const side = paperOperatorSidePresentation(
                        typeof t.direction === "string" ? t.direction : null,
                      );
                      const pnl = paperOperatorTradeRealizedPnl(t);
                      const pnlTone = paperOperatorSignedFinancialTone(pnl);
                      const pnlPct =
                        t.pnlPct != null && Number.isFinite(Number(t.pnlPct))
                          ? Number(t.pnlPct)
                          : null;
                      const holdLabel = paperOperatorHoldTimeText({
                        holdingTimeLabel:
                          typeof t.holdingTimeLabel === "string"
                            ? t.holdingTimeLabel
                            : null,
                        holdingTimeMs:
                          t.holdingTimeMs != null &&
                          Number.isFinite(Number(t.holdingTimeMs))
                            ? Number(t.holdingTimeMs)
                            : null,
                        openedAt:
                          typeof t.openedAt === "string" ? t.openedAt : null,
                        closedAt:
                          typeof t.timestamp === "string"
                            ? t.timestamp
                            : null,
                      });
                      const isFocused = focusedTradeIndex === i;
                      const isSelected = selectedTradeIndex === i;
                      const entryText =
                        t.entryPrice != null ? String(t.entryPrice) : "확인 필요";
                      const exitText =
                        t.exitPrice != null ? String(t.exitPrice) : "확인 필요";
                      const pnlText = paperOperatorSignedFinancialText(pnl, " USDT");
                      const pnlPctText =
                        pnlPct != null
                          ? ` (${paperOperatorSignedFinancialText(pnlPct, "%")})`
                          : "";
                      const holdText = holdLabel ?? "확인 필요";
                      const sessionIdText =
                        typeof t.paperSessionId === "string"
                          ? t.paperSessionId
                          : "확인 필요";
                      const strategyIdText =
                        typeof t.strategyId === "string" ? t.strategyId : "확인 필요";
                      const modeText =
                        typeof t.modeLabel === "string"
                          ? t.modeLabel
                          : typeof t.mode === "string"
                            ? t.mode
                            : "확인 필요";
                      return (
                        <Fragment key={i}>
                          <tr
                            data-testid="paper-trade-row"
                            className={paperTradeRowClass(isFocused, isSelected, pnlTone)}
                            onMouseEnter={() => setHoveredTradeIndex(i)}
                            onClick={() =>
                              setSelectedTradeIndex((current) =>
                                current === i ? null : i,
                              )
                            }
                          >
                            <td data-label="시각">{String(t.time)}</td>
                            <td data-label="심볼">{String(t.symbol)}</td>
                            <td data-label="방향">
                              <span className={`v3-pp-chip is-${side.tone}`}>
                                {side.label}
                              </span>
                            </td>
                            <td className="right" data-label="진입">
                              {entryText}
                            </td>
                            <td className="right" data-label="청산">
                              {exitText}
                            </td>
                            <td data-label="종료 사유">
                              <span
                                className={`v3-pp-chip is-${closeReason.tone}`}
                                data-testid="paper-close-reason"
                              >
                                {closeReason.label}
                              </span>
                            </td>
                            <td
                              className={`right v3-pp-pnl is-${pnlTone}`}
                              data-label="손익"
                              data-testid="paper-trade-pnl"
                            >
                              {pnlText}
                              {pnlPctText}
                            </td>
                            <td data-label="보유시간">
                              <span className="v3-pp-hold">{holdText}</span>
                              <button
                                type="button"
                                className={`v3-pp-detail-toggle${isSelected ? " is-open" : ""}`}
                                aria-expanded={isSelected}
                                data-testid="paper-trade-detail-toggle"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  setSelectedTradeIndex((current) =>
                                    current === i ? null : i,
                                  );
                                }}
                              >
                                거래 상세
                              </button>
                            </td>
                          </tr>
                          {isSelected ? (
                            <tr
                              className="v3-pp-detail-row"
                              data-testid="paper-trade-detail-row"
                            >
                              <td colSpan={PAPER_TRADE_TABLE_COLUMNS.length}>
                                <div className="v3-pp-trade-detail v3-screen-in">
                                  <div className="v3-pp-detail-panels">
                                    <section className="v3-pp-detail-section">
                                      <h4>거래 정보</h4>
                                      <dl className="v3-pp-info-grid">
                                        <div>
                                          <dt>시각</dt>
                                          <dd>{String(t.time)}</dd>
                                        </div>
                                        <div>
                                          <dt>심볼</dt>
                                          <dd>{String(t.symbol)}</dd>
                                        </div>
                                        <div>
                                          <dt>방향</dt>
                                          <dd>{side.label}</dd>
                                        </div>
                                        <div>
                                          <dt>진입</dt>
                                          <dd>{entryText}</dd>
                                        </div>
                                        <div>
                                          <dt>청산</dt>
                                          <dd>{exitText}</dd>
                                        </div>
                                        <div>
                                          <dt>종료 사유</dt>
                                          <dd>{closeReason.label}</dd>
                                        </div>
                                        <div>
                                          <dt>손익</dt>
                                          <dd className={`v3-pp-pnl is-${pnlTone}`}>
                                            {pnlText}
                                            {pnlPctText}
                                          </dd>
                                        </div>
                                        <div>
                                          <dt>보유시간</dt>
                                          <dd>{holdText}</dd>
                                        </div>
                                      </dl>
                                    </section>
                                    <section className="v3-pp-detail-section is-dev">
                                      <h4>개발자 정보</h4>
                                      <dl className="v3-pp-info-grid is-dev">
                                        <div>
                                          <dt>소유</dt>
                                          <dd>{scopeLabel}</dd>
                                        </div>
                                        <div>
                                          <dt>세션</dt>
                                          <dd className="v3-pp-mono">{sessionIdText}</dd>
                                        </div>
                                        <div>
                                          <dt>전략</dt>
                                          <dd className="v3-pp-mono">{strategyIdText}</dd>
                                        </div>
                                        <div>
                                          <dt>청산 사유 원본</dt>
                                          <dd className="v3-pp-mono">
                                            {closeReason.raw ?? "확인 필요"}
                                          </dd>
                                        </div>
                                        <div>
                                          <dt>모드</dt>
                                          <dd>{modeText}</dd>
                                        </div>
                                      </dl>
                                    </section>
                                  </div>
                                </div>
                              </td>
                            </tr>
                          ) : null}
                        </Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <EmptyState message="완료된 모의 거래가 0건입니다." />
            )}
          </V3Card>

          {paperExecutorActive ? (
            <div className="v3-pp-full">
              <TradingChartsPanel
                mode="PAPER"
                sessionActive={paperExecutorActive}
                idleCopy={undefined}
                metrics={(s?.metrics as Metrics) ?? null}
                riskView={riskView}
                symbol={
                  typeof s?.positions?.[0]?.symbol === "string"
                    ? String(s.positions[0].symbol)
                    : typeof primaryPosition?.symbol === "string"
                      ? String(primaryPosition.symbol)
                      : undefined
                }
              />
            </div>
          ) : null}

          <section className="v3-pp-full v3-pp-disc" data-testid="paper-feedback-actions">
            <details>
              <summary>수명주기 · 종료 이유 · 소유 · 감사</summary>
              <div className="v3-pp-audit-layout">
                <section className="v3-pp-audit-group">
                  <h4>세션 설정</h4>
                  <dl className="v3-pp-info-grid" data-testid="paper-execution-summary">
                    <div>
                      <dt>레버리지</dt>
                      <dd data-testid="paper-leverage-authority">
                        {leverageAuthority.label}
                        {leverageAuthority.appliedLabel
                          ? ` · ${leverageAuthority.appliedLabel}`
                          : ""}
                      </dd>
                    </div>
                    <div>
                      <dt>포지션 크기</dt>
                      <dd data-testid="paper-sizing-authority">
                        {strategy?.sizingLabel ?? "확인 필요"}
                      </dd>
                    </div>
                    <div>
                      <dt>손절</dt>
                      <dd data-testid="paper-stop-authority">
                        {strategy?.stopAuthority ?? "확인 필요"}
                      </dd>
                    </div>
                    <div>
                      <dt>익절</dt>
                      <dd data-testid="paper-target-authority">
                        {strategy?.targetAuthority ?? "확인 필요"}
                      </dd>
                    </div>
                    <div>
                      <dt>최대 보유</dt>
                      <dd data-testid="paper-max-hold-authority">
                        {strategy?.maxHoldLabel ?? "확인 필요"}
                      </dd>
                    </div>
                    <div>
                      <dt>비용 계산</dt>
                      <dd data-testid="paper-cost-model-human">
                        {costPresentation.label}
                      </dd>
                    </div>
                  </dl>
                  {session?.eventSequenceCostModelStatus &&
                  session.eventSequenceCostModelStatus !== "not_applicable" ? (
                    <p data-testid="paper-event-sequence-cost-model">
                      {costPresentation.label}
                      {costPresentation.raw ? (
                        <>
                          {" "}
                          <span
                            className="v3-pp-mono"
                            data-testid="paper-event-sequence-cost-model-id"
                          >
                            {costPresentation.raw}
                          </span>
                        </>
                      ) : null}
                    </p>
                  ) : null}
                </section>

                <section className="v3-pp-audit-group">
                  <h4>수명주기 / 종료</h4>
                  <dl className="v3-pp-info-grid" data-testid="paper-session-times">
                    <div>
                      <dt>시작</dt>
                      <dd data-testid="paper-started-at">
                        {paperOperatorFormatTime(session?.startedAt)}
                      </dd>
                    </div>
                    <div>
                      <dt>종료</dt>
                      <dd data-testid="paper-stopped-at">
                        {paperOperatorFormatTime(session?.stoppedAt)}
                      </dd>
                    </div>
                    <div>
                      <dt>수명주기</dt>
                      <dd>{PAPER_STATUS_LABEL[canonicalStatus]}</dd>
                    </div>
                    {session?.stopReason ? (
                      <div>
                        <dt>종료 이유</dt>
                        <dd>
                          {stopReasonPresentation.label}
                          {stopReasonPresentation.raw ? (
                            <span className="v3-pp-mono">
                              {" "}
                              {stopReasonPresentation.raw}
                            </span>
                          ) : null}
                        </dd>
                      </div>
                    ) : null}
                    {s?.positions?.some(
                      (p) =>
                        (p as { paperLifecycleModel?: string }).paperLifecycleModel ===
                        "event_sequence_paper_v1",
                    ) ? (
                      <div>
                        <dt>청산 모델</dt>
                        <dd data-testid="paper-event-sequence-lifecycle">
                          패턴 청산 · 이벤트 시퀀스
                        </dd>
                      </div>
                    ) : null}
                    {strategy?.executionProvenanceStatus ? (
                      <div>
                        <dt>실행 증빙</dt>
                        <dd data-testid="paper-execution-provenance-status">
                          {executionProvenanceStatusOperatorLabel(
                            strategy.executionProvenanceStatus,
                          )}
                        </dd>
                      </div>
                    ) : session?.eventSequenceCostModelStatus === "unresolved" ? (
                      <div>
                        <dt>실행 증빙</dt>
                        <dd data-testid="paper-execution-provenance-status">
                          {executionProvenanceStatusOperatorLabel("unresolved")}
                        </dd>
                      </div>
                    ) : null}
                    {session?.backtestResultId ? (
                      <div>
                        <dt>연결 Backtest</dt>
                        <dd className="v3-pp-mono" data-testid="paper-linked-run">
                          {session.backtestResultId}
                        </dd>
                      </div>
                    ) : null}
                  </dl>
                </section>

                <section className="v3-pp-audit-group is-dev">
                  <h4>기술 / 감사</h4>
                  <dl className="v3-pp-info-grid is-dev">
                    <div>
                      <dt>전략 ID</dt>
                      <dd className="v3-pp-mono" data-testid="paper-strategy-id">
                        {strategy?.id ?? "미등록"}
                      </dd>
                    </div>
                    {strategy?.paramsHash ? (
                      <div>
                        <dt>paramsHash</dt>
                        <dd className="v3-pp-mono" data-testid="paper-params-hash">
                          {strategy.paramsHash.slice(0, 12)}
                        </dd>
                      </div>
                    ) : null}
                    {strategy?.strategyHash ? (
                      <div>
                        <dt>strategyHash</dt>
                        <dd className="v3-pp-mono" data-testid="paper-strategy-hash">
                          {strategy.strategyHash.slice(0, 12)}
                        </dd>
                      </div>
                    ) : null}
                    <div data-testid="paper-status-source">
                      <dt>기술 상태</dt>
                      <dd>
                        상태 원본: {session?.status ?? "none"} → UI: {canonicalStatus}
                        {session?.id ? (
                          <span className="v3-pp-mono"> 세션 {session.id}</span>
                        ) : null}
                      </dd>
                    </div>
                    {session ? (
                      <>
                        <div>
                          <dt>모의 거래 수</dt>
                          <dd>{session.tradeCount}</dd>
                        </div>
                        <div>
                          <dt>모의 신호 수</dt>
                          <dd>{session.signalCount}</dd>
                        </div>
                        <div data-testid="paper-backtest-comparison">
                          <dt>세션 식별</dt>
                          <dd>
                            <span
                              className="v3-pp-mono"
                              data-testid="paper-feedback-strategy-hash"
                            >
                              {session.strategyHash.slice(0, 12)}
                            </span>
                            {" · "}
                            <span
                              className="v3-pp-mono"
                              data-testid="paper-feedback-params-hash"
                            >
                              {strategy?.paramsHash
                                ? strategy.paramsHash.slice(0, 12)
                                : "—"}
                            </span>
                            {" · "}
                            <span
                              className="v3-pp-mono"
                              data-testid="paper-feedback-strategy-id"
                            >
                              {session.strategyId}
                            </span>
                          </dd>
                        </div>
                      </>
                    ) : (
                      <div>
                        <dt>성과 요약</dt>
                        <dd>모의매매를 시작하면 여기에 성과 요약이 표시됩니다.</dd>
                      </div>
                    )}
                  </dl>
                  <div
                    className="v3-pp-audit-ref"
                    data-testid="paper-global-reference-metrics"
                  >
                    <h5>전체 운영 참고 (현재 Paper 세션 성과 아님)</h5>
                    <p>감시 코인 (전체) {s?.operations?.watchedSymbolCount ?? 0}</p>
                    <p>
                      오늘 실현 (전체){" "}
                      {m?.todayRealizedPnlUsdt ?? ts?.realizedPnlUsdt ?? 0} USDT
                    </p>
                    <p>
                      오늘 미실현 (전체){" "}
                      {m?.todayUnrealizedPnlUsdt ?? ts?.unrealizedPnlUsdt ?? 0} USDT
                    </p>
                    <p>오늘 거래 (전체) {ts?.trades ?? m?.todayTradeCount ?? 0}</p>
                  </div>
                  {origin ? <p>{origin} · 모의 거래 데이터</p> : null}
                </section>
              </div>
              <div className="v3-pp-audit-notes">
                <p>
                  모의 매매는 실전과 달리 실제 자금·주문이 없습니다. 승격은 자동이
                  아니며, 결과가 안정적일 때만 실전 검토를 권장합니다.
                </p>
                <p>
                  등록된 전략만 자동으로 실행됩니다. 수동으로 가상 롱/숏을 넣는
                  기능은 없습니다.
                </p>
                <div className="v3-pp-links">
                  <Link
                    href="/strategy-search?researchBasis=paper"
                    data-testid="paper-feedback-research"
                    className="rextora-btn-text inline-flex items-center justify-center rounded-lg border px-3 py-2 text-sm font-semibold"
                  >
                    결과로 재탐색
                  </Link>
                  <Link
                    href="/backtest"
                    data-testid="paper-feedback-backtest"
                    className="rextora-btn-text inline-flex items-center justify-center rounded-lg border px-3 py-2 text-sm font-semibold"
                  >
                    백테스트 비교
                  </Link>
                </div>
              </div>
            </details>
          </section>
        </div>
      </div>
    </div>
  );
}
