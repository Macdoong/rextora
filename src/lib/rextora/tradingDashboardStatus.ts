import { rankCandidates } from "./aiRanker";
import { getAccountState } from "./accountStateStore";
import { getMarketDataSnapshot } from "./marketDataStore";
import { getOpenPositions } from "./positionManager";
import { evaluateLiveSafetyGate } from "./liveSafetyGate";
import { getServerTpSlReadiness, isServerTpSlManagerReady } from "./serverTpSlReadiness";
import { getServerTpSlState } from "./serverTpSlManager";
import { getRextoraSettings } from "./settings/settingsService";
import { getRuntimeState } from "./runtimeState";
import { summarizeExecutionQueue, getLastExecutionQueueResult, computeCandidateQueueDisplays, buildExecutionQueue } from "./executionQueue";
import { convertAiCandidatesToExecutionCandidates } from "./aiExecutionBridge";
import { buildLearningSummary } from "./learningEngine";
import { getUserFacingLearningLogs, getSignalWinRates, isLearningTradeLog } from "./learningLogger";
import { getAuditLogs } from "./storage/auditStore";
import { displayAuditActionLabel, displayAuditResultLabel, displayPositionProtectionStatus, displaySignalReason, type PositionProtectionLabel } from "./displayLabels";
import { filterUserFacingRecords } from "./dataFilters";
import { getLastSafeSignals } from "./execution/safePaperLoop";
import { loadSafeV44Strategy } from "./strategy/safeV44Strategy";
import { getLatestAiTradeReportSummary, listAiTradeReports } from "./report/aiTradeReport";
import type { BinanceDiagnosticsReport } from "./binanceDiagnosticsTypes";
import type { LearningSummary } from "./learningTypes";
import type { Position } from "./types";

export interface DashboardCandidateRow {
  rank: number;
  symbol: string;
  direction: string;
  aiScore: number;
  learningScoreDelta: number;
  finalScore: number;
  leverage: number;
  leverageLabel: string;
  riskLevel: string;
  status: string;
  rejectReason?: string;
  costPass: boolean;
  queueStatus: "큐 가능" | "보류" | "제외";
  queueReason?: string;
  runtimeStatusLabel: "진입 가능" | "보류" | "대기" | "제외";
}

export interface DashboardPositionRow {
  symbol: string;
  side: string;
  quantity: number;
  entryPrice: number;
  currentPrice: number;
  stopLoss: number;
  takeProfit: number;
  unrealizedPnl: number;
  pnlPct: number;
  holdTimeLabel: string;
  modeLabel: "모의 거래" | "실전 거래";
  protectionLabel: PositionProtectionLabel;
}

export type { PositionProtectionLabel } from "./displayLabels";

export interface DashboardOpportunityRow {
  symbol: string;
  direction: string;
  strategyLabel: string;
  score: number;
  judgment: "진입 가능" | "관찰" | "제외";
  reason: string;
}

export interface DashboardRecentTradeRow {
  time: string;
  symbol: string;
  direction: string;
  entryPrice: number | null;
  exitPrice: number | null;
  resultLabel: "익절" | "손절" | "수동청산" | "보합" | "실패";
  pnlPct: number | null;
  exitReasonLabel: string;
  modeLabel: "모의 거래" | "실전 거래";
}

export interface DashboardTodayStats {
  realizedPnlPct: number;
  trades: number;
  winRate: number;
}

export interface DashboardLearningView {
  totalTrades: number;
  winRate: number;
  avgPnlPct: number;
  bestStrategy: string;
  worstStrategy: string;
  recentAdjustment: string | null;
}

export interface DashboardExecutionLogRow {
  time: string;
  action: string;
  result: string;
  message: string;
}

export interface TradingDashboardStatus {
  modeLabel: "모의 거래" | "실전 거래";
  botStatusLabel: "대기 중" | "실행 중" | "중지됨" | "오류";
  canStartPaper: boolean;
  canStartLive: boolean;
  liveBlockReason: string | null;
  liveAllowed: boolean;
  serverTpSlLabel: "준비됨" | "보호 중" | "오류";
  candidateLabel: "진입 가능" | "보류" | "대기" | "제외";
  safetyLabel: "정상" | "차단" | "오류";
  todayStats: DashboardTodayStats;
  initialSeed: number | "확인 불가";
  opportunities: DashboardOpportunityRow[];
  recentTrades: DashboardRecentTradeRow[];
  activeStrategy: {
    name: string;
    paramsHash: string;
    sourceStatus: string;
  };
  aiReportSummary: string | null;
  aiReports: Array<{ id: string; symbol: string; summary: string; createdAt: string }>;

  learningView: DashboardLearningView;
  lastUpdatedAt: string;
  operations: {
    watchedSymbolCount: number;
    eligibleCandidateCount: number;
    openPositionCount: number;
    queueStatusLabel: string;
  };
  topCandidates: DashboardCandidateRow[];
  selectedCandidate: DashboardCandidateRow | null;
  positions: DashboardPositionRow[];
  position: DashboardPositionRow | null;
  queueSummary: {
    received: number;
    queued: number;
    executing: number;
    executed: number;
    skipped: number;
    failed: number;
    summaryMessage: string;
    recentItems: Array<{
      symbol: string;
      sideLabel: string;
      status: string;
      reason?: string;
      leverage?: number;
      riskLevel?: string;
    }>;
  };
  learningSummary: LearningSummary;
  recentExecutionLogs: DashboardExecutionLogRow[];
}

function mapCandidateStatus(status: string, costPass: boolean): "진입 가능" | "보류" | "대기" | "제외" {
  if (status === "보류") return "보류";
  if (status === "진입 가능" && costPass) return "진입 가능";
  if (status === "대기") return "대기";
  return "제외";
}

function mapBotStatus(runtime: ReturnType<typeof getRuntimeState>): TradingDashboardStatus["botStatusLabel"] {
  if (runtime.emergencyStopped || runtime.state === "오류") return runtime.state === "오류" ? "오류" : "중지됨";
  if (runtime.running) return "실행 중";
  if (runtime.state === "대기") return "대기 중";
  return "중지됨";
}

function mapTpSlLabel(): TradingDashboardStatus["serverTpSlLabel"] {
  const state = getServerTpSlState();
  const readiness = getServerTpSlReadiness();
  if (state.active && state.verified) return "보호 중";
  if (readiness.managerReady || isServerTpSlManagerReady()) return "준비됨";
  if (state.failedCount > 0) return "오류";
  return readiness.settingEnabled ? "준비됨" : "오류";
}

function toCandidateRow(
  candidate: ReturnType<typeof convertAiCandidatesToExecutionCandidates>[number],
  rank: number,
  queueDisplay: ReturnType<typeof computeCandidateQueueDisplays> extends Map<string, infer V> ? V : never
): DashboardCandidateRow {
  return {
    rank,
    symbol: candidate.symbol,
    direction: candidate.sideLabel,
    aiScore: candidate.aiScore,
    learningScoreDelta: candidate.learningScoreDelta,
    finalScore: candidate.finalScore,
    leverage: candidate.leverage,
    leverageLabel: candidate.leverageLabel,
    riskLevel: candidate.riskLevel,
    status: queueDisplay.runtimeStatusLabel,
    rejectReason: queueDisplay.queueReason ?? candidate.rejectReason,
    costPass: candidate.costPass,
    queueStatus: queueDisplay.queueStatus,
    queueReason: queueDisplay.queueReason,
    runtimeStatusLabel: queueDisplay.runtimeStatusLabel
  };
}

function computePositionPnlPct(side: string, entryPrice: number, currentPrice: number): number {
  if (entryPrice <= 0) return 0;
  const raw = side === "Short" || side === "SHORT" || side === "숏"
    ? ((entryPrice - currentPrice) / entryPrice) * 100
    : ((currentPrice - entryPrice) / entryPrice) * 100;
  return Number(raw.toFixed(2));
}

function formatHoldTime(openedAt?: string): string {
  if (!openedAt) return "-";
  const started = Date.parse(openedAt);
  if (!Number.isFinite(started)) return "-";
  const minutes = Math.max(0, Math.floor((Date.now() - started) / 60_000));
  if (minutes < 60) return `${minutes}분`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}시간 ${minutes % 60}분`;
  return `${Math.floor(hours / 24)}일 ${hours % 24}시간`;
}

function mapPaperPosition(position: Position): DashboardPositionRow {
  return {
    symbol: position.symbol,
    side: position.side === "Long" ? "롱" : position.side === "Short" ? "숏" : position.side,
    quantity: position.quantity,
    entryPrice: position.entryPrice,
    currentPrice: position.currentPrice,
    stopLoss: position.stopLoss,
    takeProfit: position.takeProfit,
    unrealizedPnl: position.unrealizedPnl,
    pnlPct: computePositionPnlPct(position.side, position.entryPrice, position.currentPrice),
    holdTimeLabel: formatHoldTime(position.openedAt),
    modeLabel: "모의 거래",
    protectionLabel: displayPositionProtectionStatus({
      mode: "PAPER",
      stopLoss: position.stopLoss,
      takeProfit: position.takeProfit
    })
  };
}

function mapLivePosition(
  position: ReturnType<typeof getAccountState>["positions"][number],
  tpSlState: ReturnType<typeof getServerTpSlState>
): DashboardPositionRow {
  return {
    symbol: position.symbol,
    side: position.side === "LONG" ? "롱" : position.side === "SHORT" ? "숏" : position.side,
    quantity: position.quantity,
    entryPrice: position.entryPrice,
    currentPrice: position.markPrice,
    stopLoss: 0,
    takeProfit: 0,
    unrealizedPnl: position.unrealizedPnl,
    pnlPct: computePositionPnlPct(position.side, position.entryPrice, position.markPrice),
    holdTimeLabel: "-",
    modeLabel: "실전 거래",
    protectionLabel: displayPositionProtectionStatus({
      mode: "LIVE",
      serverProtected: tpSlState.active && tpSlState.verified && tpSlState.symbol === position.symbol,
      serverError: tpSlState.failedCount > 0 && tpSlState.symbol === position.symbol
    })
  };
}

function mapRecentTradeResult(log: { exitReason: string; result: string }): DashboardRecentTradeRow["resultLabel"] {
  if (log.exitReason.includes("익절")) return "익절";
  if (log.exitReason.includes("손절")) return "손절";
  if (log.exitReason.includes("수동")) return "수동청산";
  if (log.exitReason.includes("오류") || log.result === "실패") return log.result === "보합" ? "보합" : "실패";
  if (log.result === "보합") return "보합";
  if (log.result === "성공") return "익절";
  return "보합";
}

function buildRecentTrades(limit = 10): DashboardRecentTradeRow[] {
  return getUserFacingLearningLogs()
    .filter(isLearningTradeLog)
    .slice(0, limit)
    .map((log) => ({
      time: log.time,
      symbol: log.symbol,
      direction: log.direction,
      entryPrice: log.entryPrice ?? null,
      exitPrice: log.exitPrice ?? null,
      resultLabel: mapRecentTradeResult(log),
      pnlPct: log.pnlPct,
      exitReasonLabel: log.exitReason || "-",
      modeLabel: log.serviceState === "live-ready" ? "실전 거래" : "모의 거래"
    }));
}

function buildTodayStats(): DashboardTodayStats {
  const todayPrefix = new Date().toLocaleString("ko-KR", { month: "2-digit", day: "2-digit" });
  const todayTrades = getUserFacingLearningLogs()
    .filter(isLearningTradeLog)
    .filter((log) => log.time.startsWith(todayPrefix));
  const wins = todayTrades.filter((log) => log.result === "성공").length;
  const realized = todayTrades.reduce((sum, log) => sum + (log.pnlPct ?? 0), 0);
  return {
    realizedPnlPct: Number(realized.toFixed(2)),
    trades: todayTrades.length,
    winRate: todayTrades.length > 0 ? Number(((wins / todayTrades.length) * 100).toFixed(1)) : 0
  };
}

function buildLearningView(learningSummary: LearningSummary): DashboardLearningView {
  const signalRates = getSignalWinRates().filter((row) => row.trades > 0);
  const best = signalRates.length > 0 ? signalRates.reduce((a, b) => (b.winRate > a.winRate ? b : a)) : null;
  const worst = signalRates.length > 0 ? signalRates.reduce((a, b) => (b.winRate < a.winRate ? b : a)) : null;
  return {
    totalTrades: learningSummary.totalTrades,
    winRate: learningSummary.winRate,
    avgPnlPct: learningSummary.avgPnlPct,
    bestStrategy: best ? displaySignalReason(best.signalType) : "-",
    worstStrategy: worst ? displaySignalReason(worst.signalType) : "-",
    recentAdjustment: learningSummary.recentAdjustment
  };
}

function buildRecentExecutionLogs(limit = 10): DashboardExecutionLogRow[] {
  return getAuditLogs(limit).map((entry) => ({
    time: new Date(entry.timestamp).toLocaleString("ko-KR", {
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit"
    }),
    action: displayAuditActionLabel(entry.type),
    result: displayAuditResultLabel(entry.type, entry.message),
    message: entry.message
  }));
}

function countExecutingFromQueue(): number {
  const raw = getLastExecutionQueueResult();
  if (!raw) return 0;
  return raw.items.filter((item) => item.status === "실행 중").length;
}

export function buildTradingDashboardStatus(diagnostics?: BinanceDiagnosticsReport | null): TradingDashboardStatus {
  const settings = getRextoraSettings();
  const runtime = getRuntimeState();
  const liveAllowed = settings.trading.allowLiveTrading || settings.trading.liveTradingEnabled;
  const modeLabel = runtime.mode === "LIVE" ? "실전 거래" : "모의 거래";
  const ranked = rankCandidates(10);
  const executionCandidates = convertAiCandidatesToExecutionCandidates(ranked);
  const queueMode = runtime.mode === "LIVE" ? "LIVE" : "PAPER";
  buildExecutionQueue(executionCandidates, queueMode);
  const queueDisplays = computeCandidateQueueDisplays(executionCandidates, queueMode);
  const topCandidates = filterUserFacingRecords(
    executionCandidates.map((candidate, index) =>
      toCandidateRow(candidate, index + 1, queueDisplays.get(`${candidate.symbol}:${candidate.side}`) ?? {
        queueStatus: "제외",
        runtimeStatusLabel: "제외",
        queueReason: candidate.rejectReason ?? "진입 조건 미통과"
      })
    ),
    (row) => row.symbol
  );
  const executionTop = topCandidates[0] ?? null;
  const top = ranked[0];

  const liveGate = evaluateLiveSafetyGate({
    fatalOnly: true,
    mode: "LIVE",
    operatorLiveStartRequested: true,
    diagnostics: diagnostics ?? undefined,
    candidate: top
  });

  const marketSnapshot = getMarketDataSnapshot();
  const tpSlState = getServerTpSlState();
  const queueBase = summarizeExecutionQueue(getLastExecutionQueueResult());
  const executing = countExecutingFromQueue();
  const learningSummary = buildLearningSummary();

  const livePositions = getAccountState()
    .positions.filter((p) => p.side !== "FLAT" && p.quantity > 0)
    .map((p) => mapLivePosition(p, tpSlState));
  const paperPositions = getOpenPositions()
    .filter((p) => p.quantity > 0 && p.side !== "Flat")
    .map(mapPaperPosition);
  const positions = runtime.mode === "LIVE" ? livePositions : paperPositions.length > 0 ? paperPositions : livePositions;

  const eligibleCount = topCandidates.filter((c) => c.queueStatus === "큐 가능").length;
  const queueStatusLabel =
    queueBase.received > 0
      ? `수신 ${queueBase.received} · 대기 ${queueBase.queued} · 실행 ${executing} · 완료 ${queueBase.executed}`
      : "대기 중";

  const opportunities: DashboardOpportunityRow[] = (() => {
    const safeSignals = getLastSafeSignals(20);
    if (safeSignals.length > 0) {
      return safeSignals.map((row) => ({
        symbol: row.symbol,
        direction: row.signal.side === "LONG" ? "롱" : row.signal.side === "SHORT" ? "숏" : "-",
        strategyLabel: "SAFE_v44_i4060",
        score: row.signal.score,
        judgment:
          row.status === "진입" || row.signal.passed
            ? "진입 가능"
            : row.status === "차단"
              ? "제외"
              : "관찰",
        reason: row.reason
      }));
    }
    return topCandidates.map((row) => ({
      symbol: row.symbol,
      direction: row.direction,
      strategyLabel: displaySignalReason(
        executionCandidates.find((candidate) => candidate.symbol === row.symbol)?.source.signal ?? "unknown"
      ),
      score: row.finalScore,
      judgment:
        row.runtimeStatusLabel === "진입 가능"
          ? "진입 가능"
          : row.runtimeStatusLabel === "제외"
            ? "제외"
            : "관찰",
      reason: row.queueReason ?? row.rejectReason ?? "-"
    }));
  })();

  const strategyMeta = loadSafeV44Strategy({ throwOnHashMismatch: false });
  const aiReports = listAiTradeReports(5).map((r) => ({
    id: r.id,
    symbol: r.symbol,
    summary: r.summary,
    createdAt: r.createdAt
  }));

  const safetyLabel: TradingDashboardStatus["safetyLabel"] = runtime.emergencyStopped
    ? "차단"
    : runtime.state === "오류"
      ? "오류"
      : "정상";

  const state = getAccountState();

  return {
    modeLabel,
    botStatusLabel: mapBotStatus(runtime),
    canStartPaper: !runtime.running || runtime.mode !== "PAPER",
    canStartLive: liveAllowed && liveGate.passed,
    liveBlockReason: liveGate.passed ? null : liveGate.blockedReasons[0] ?? null,
    liveAllowed,
    serverTpSlLabel: mapTpSlLabel(),
    candidateLabel: executionTop ? executionTop.runtimeStatusLabel : "제외",
    safetyLabel,
    todayStats: buildTodayStats(),
    initialSeed: state.initialSeedUsdt ?? "확인 불가",
    opportunities,
    recentTrades: buildRecentTrades(10),
    activeStrategy: {
      name: strategyMeta.name,
      paramsHash: strategyMeta.paramsHash,
      sourceStatus: strategyMeta.sourceStatus
    },
    aiReportSummary: getLatestAiTradeReportSummary(),
    aiReports,
    learningView: buildLearningView(learningSummary),
    lastUpdatedAt: new Date().toISOString(),
    operations: {
      watchedSymbolCount: marketSnapshot.coins.length || settings.market.watchedSymbolCount,
      eligibleCandidateCount: eligibleCount,
      openPositionCount: positions.length,
      queueStatusLabel
    },
    topCandidates,
    selectedCandidate: executionTop,
    positions,
    position: positions[0] ?? null,

    queueSummary: {
      ...queueBase,
      executing,
      recentItems: filterUserFacingRecords(queueBase.recentItems ?? [], (item) => item.symbol)
    },
    learningSummary,
    recentExecutionLogs: buildRecentExecutionLogs(10)
  };
}

/** Operator dashboard view model: same shape as the dashboard status. */
export const getTradingDashboardViewModel = buildTradingDashboardStatus;
