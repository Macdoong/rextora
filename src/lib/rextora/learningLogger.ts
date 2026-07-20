import { learningLogsSeed } from "./seedData";
import { loadTradeLogs, saveTradeLogs } from "./storage/tradeStore";
import { displaySignalReason } from "./displayLabels";
import { filterUserFacingRecords, isTestOnlySymbol, showDebugCandidatesInUi, showTestDataInUi } from "./dataFilters";
import {
  isLearningCandidateLog,
  isLearningReflectionLog,
  isLearningSystemLog,
  isLearningTradeLog
} from "./learningLogCategories";
import type { AiCandidate, LearningLogItem, SignalType, TradeDirection } from "./types";

export { isLearningCandidateLog, isLearningReflectionLog, isLearningSystemLog, isLearningTradeLog } from "./learningLogCategories";

export const CANDIDATE_LOG_DEDUPE_MS = 10 * 60 * 1000;

const candidateLogDedupeState = new Map<string, number>();
let lastCandidateSkipReason: string | null = null;

export function getLastCandidateLogSkipReason(): string | null {
  return lastCandidateSkipReason;
}

export function resetCandidateLogDedupeForTests(): void {
  candidateLogDedupeState.clear();
  lastCandidateSkipReason = null;
}

function resolveCandidateMode(serviceState: LearningLogItem["serviceState"] | undefined, mode?: "PAPER" | "LIVE"): "PAPER" | "LIVE" {
  if (mode) return mode;
  if (serviceState === "live-ready") return "LIVE";
  return "PAPER";
}

export function buildCandidateLogDedupeKey(candidateLog: {
  symbol: string;
  signalType: string;
  candidateStatus?: string;
  holdReason?: string;
  blockedReason?: string;
  serviceState?: LearningLogItem["serviceState"];
  mode?: "PAPER" | "LIVE";
}): string {
  const status = candidateLog.candidateStatus ?? "대기";
  const reason = candidateLog.holdReason ?? candidateLog.blockedReason ?? "";
  const mode = resolveCandidateMode(candidateLog.serviceState, candidateLog.mode);
  return [candidateLog.symbol, candidateLog.signalType, status, reason, mode].join("|");
}

export function shouldStoreCandidateLearningLog(
  candidateLog: {
    symbol: string;
    signalType: string;
    candidateStatus?: string;
    holdReason?: string;
    blockedReason?: string;
    serviceState?: LearningLogItem["serviceState"];
    mode?: "PAPER" | "LIVE";
  },
  ttlMs: number = CANDIDATE_LOG_DEDUPE_MS
): boolean {
  const key = buildCandidateLogDedupeKey(candidateLog);
  const now = Date.now();
  const last = candidateLogDedupeState.get(key);
  if (last !== undefined && now - last < ttlMs) {
    lastCandidateSkipReason = `candidate_log_dedupe_suppressed:${key}`;
    return false;
  }
  candidateLogDedupeState.set(key, now);
  lastCandidateSkipReason = null;
  return true;
}

export function getLearningLogs(limit?: number): LearningLogItem[] {
  const stored = loadTradeLogs(learningLogsSeed);
  const logs = stored.length > 0 ? stored : learningLogsSeed;
  if (typeof limit === "number" && limit > 0) {
    return logs.slice(0, limit);
  }
  return logs;
}

export function getUserFacingLearningLogs(limit?: number): LearningLogItem[] {
  const logs = getLearningLogs(limit);
  return filterUserFacingRecords(logs, (log) => log.symbol);
}

/** Candidate/observation logs are debug-only; the operator view hides them by default. */
export function shouldDisplayDebugCandidateLog(log: LearningLogItem): boolean {
  return isLearningCandidateLog(log) && showDebugCandidatesInUi();
}

export function shouldDisplayOperatorLog(log: LearningLogItem): boolean {
  if (!showTestDataInUi() && isTestOnlySymbol(log.symbol)) return false;
  if (isLearningCandidateLog(log)) return showDebugCandidatesInUi();
  return isLearningTradeLog(log) || isLearningReflectionLog(log) || isLearningSystemLog(log);
}

export function getOperatorLearningLogs(limit?: number): LearningLogItem[] {
  const logs = getLearningLogs().filter(shouldDisplayOperatorLog);
  if (typeof limit === "number" && limit > 0) return logs.slice(0, limit);
  return logs;
}

export function getLearningLogViewModel(limit?: number): {
  logs: LearningLogItem[];
  showDebugCandidates: boolean;
  coinRates: Array<{ symbol: string; winRate: number; trades: number }>;
  signalRates: Array<{ signalType: SignalType; winRate: number; trades: number }>;
} {
  return {
    logs: getOperatorLearningLogs(limit),
    showDebugCandidates: showDebugCandidatesInUi(),
    coinRates: getCoinWinRates(),
    signalRates: getSignalWinRates()
  };
}

export function logSystemEvent(input: {
  eventType: "자동매매 시작" | "자동매매 중지" | "긴급 중지" | "오류" | "실전 거래 차단";
  message: string;
  mode?: "PAPER" | "LIVE";
}): LearningLogItem {
  const item: LearningLogItem = {
    id: `log-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    time: new Date().toLocaleString("ko-KR", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }),
    symbol: "SYSTEM",
    direction: "롱",
    entryReason: input.message,
    exitReason: "",
    result: "대기",
    pnlPct: null,
    signalType: "weak_signal",
    eventCategory: "시스템 이벤트",
    eventType: input.eventType,
    serviceState: input.mode === "LIVE" ? "live-ready" : "paper"
  };
  saveTradeLogs([item, ...getLearningLogs()].slice(0, 200));
  return item;
}

export function getLearningLogsSummary(): { total: number; recentCount: number; lastUpdated: string | null } {
  const logs = getUserFacingLearningLogs();
  return {
    total: logs.length,
    recentCount: Math.min(logs.length, 5),
    lastUpdated: logs[0]?.time ?? null
  };
}

export function logCandidateSnapshot(
  candidate: AiCandidate,
  meta?: {
    candidateStatus?: "대기" | "보류" | "제외";
    holdReason?: string;
    aiScore?: number;
    finalScore?: number;
    mode?: "PAPER" | "LIVE";
  }
): LearningLogItem | null {
  const blocked = Boolean(candidate.blockReason);
  const status = meta?.candidateStatus ?? (blocked ? "제외" : "대기");
  const item: LearningLogItem = {
    id: `log-${Date.now()}`,
    time: new Date().toLocaleString("ko-KR", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }),
    symbol: candidate.symbol,
    direction: candidate.direction,
    entryReason: candidate.entryReason ?? displaySignalReason(candidate.signalReason ?? candidate.signalType ?? "unknown"),
    exitReason: "",
    result: "대기",
    pnlPct: null,
    signalType: candidate.signalType,
    eventCategory: "후보 기록",
    eventType: blocked ? "후보 제외" : "후보 감지",
    candidateStatus: status,
    holdReason: meta?.holdReason ?? candidate.blockReason,
    aiScore: meta?.aiScore ?? candidate.aiScore,
    finalScore: meta?.finalScore ?? candidate.finalScore,
    blockedReason: candidate.blockReason,
    serviceState: candidate.serviceState
  };

  if (
    !shouldStoreCandidateLearningLog({
      symbol: item.symbol,
      signalType: item.signalType,
      candidateStatus: item.candidateStatus,
      holdReason: item.holdReason,
      blockedReason: item.blockedReason,
      serviceState: item.serviceState,
      mode: meta?.mode
    })
  ) {
    return null;
  }

  const logs = saveTradeLogs([item, ...getLearningLogs()].slice(0, 200));
  return logs[0];
}

export function logLearningReflection(input: {
  symbol: string;
  direction: TradeDirection;
  summary: string;
  scoreDelta?: number;
  leverageAdjustment?: number;
  reason: string;
  eventType?: string;
}): LearningLogItem {
  const item: LearningLogItem = {
    id: `log-${Date.now()}`,
    time: new Date().toLocaleString("ko-KR", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }),
    symbol: input.symbol,
    direction: input.direction,
    entryReason: input.summary,
    exitReason: "",
    result: "대기",
    pnlPct: null,
    signalType: "weak_signal",
    eventCategory: "학습 반영",
    eventType: input.eventType ?? "학습 보정 반영",
    learningSummary: input.summary,
    scoreDelta: input.scoreDelta,
    leverageAdjustment: input.leverageAdjustment,
    learningReason: input.reason,
    serviceState: "paper"
  };
  saveTradeLogs([item, ...getLearningLogs()].slice(0, 200));
  return item;
}

function resolveTradeResult(pnlPct: number, exitReason: string): LearningLogItem["result"] {
  if (exitReason === "take_profit" || pnlPct > 0) return "성공";
  if (exitReason === "stop_loss" || exitReason === "error" || pnlPct < 0) return "실패";
  if (pnlPct === 0) return "보합";
  return pnlPct > 0 ? "성공" : "실패";
}

export function logTradeOutcome(input: {
  symbol: string;
  direction: TradeDirection;
  entryReason: string;
  exitReason: string;
  pnlPct: number;
  signalType: SignalType;
  leverage?: number;
  entryPrice?: number;
  exitPrice?: number;
}): LearningLogItem {
  const result = resolveTradeResult(input.pnlPct, input.exitReason);
  const item: LearningLogItem = {
    id: `log-${Date.now()}`,
    time: new Date().toLocaleString("ko-KR", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }),
    symbol: input.symbol,
    direction: input.direction,
    entryReason: input.entryReason,
    exitReason: input.exitReason,
    result,
    pnlPct: input.pnlPct,
    signalType: input.signalType,
    eventCategory: "거래 기록",
    eventType: "모의 진입",
    leverage: input.leverage,
    entryPrice: input.entryPrice,
    exitPrice: input.exitPrice,
    successPattern: result === "성공" ? input.entryReason : undefined,
    failurePattern: result === "실패" ? input.exitReason : undefined,
    serviceState: "paper"
  };
  saveTradeLogs([item, ...getLearningLogs()].slice(0, 200));
  return item;
}

function aggregateWinRates(
  logs: LearningLogItem[],
  keyFn: (log: LearningLogItem) => string
): Array<{ key: string; winRate: number; trades: number }> {
  const byKey = new Map<string, { wins: number; total: number }>();
  for (const log of logs) {
    if (!isLearningTradeLog(log)) continue;
    if (!showTestDataInUi() && isTestOnlySymbol(log.symbol)) continue;
    const key = keyFn(log);
    const current = byKey.get(key) ?? { wins: 0, total: 0 };
    current.total += 1;
    if (log.result === "성공") current.wins += 1;
    byKey.set(key, current);
  }
  return Array.from(byKey.entries()).map(([key, stats]) => ({
    key,
    winRate: stats.total > 0 ? Number(((stats.wins / stats.total) * 100).toFixed(1)) : 0,
    trades: stats.total
  }));
}

export function getCoinWinRates(): Array<{ symbol: string; winRate: number; trades: number }> {
  return aggregateWinRates(getLearningLogs(), (log) => log.symbol)
    .map(({ key, winRate, trades }) => ({ symbol: key, winRate, trades }))
    .filter((row) => showTestDataInUi() || !isTestOnlySymbol(row.symbol));
}

export function appendLearningEntry(input: {
  symbol: string;
  direction: TradeDirection;
  entryReason: string;
  exitReason: string;
  result: LearningLogItem["result"];
  pnlPct: number | null;
  signalType: SignalType;
  mode?: "PAPER" | "LIVE";
  eventCategory?: LearningLogItem["eventCategory"];
  eventType?: string;
  leverage?: number;
  entryPrice?: number;
  exitPrice?: number;
  aiScore?: number;
  finalScore?: number;
  candidateStatus?: LearningLogItem["candidateStatus"];
  holdReason?: string;
  scoreDelta?: number;
  leverageAdjustment?: number;
  learningSummary?: string;
  learningReason?: string;
}): LearningLogItem | null {
  const eventCategory = input.eventCategory ?? "거래 기록";
  const item: LearningLogItem = {
    id: `log-${Date.now()}`,
    time: new Date().toLocaleString("ko-KR", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }),
    symbol: input.symbol,
    direction: input.direction,
    entryReason: input.entryReason,
    exitReason: input.exitReason,
    result: input.result,
    pnlPct: input.pnlPct,
    signalType: input.signalType,
    eventCategory,
    eventType: input.eventType,
    leverage: input.leverage,
    entryPrice: input.entryPrice,
    exitPrice: input.exitPrice,
    aiScore: input.aiScore,
    finalScore: input.finalScore,
    candidateStatus: input.candidateStatus,
    holdReason: input.holdReason,
    scoreDelta: input.scoreDelta,
    leverageAdjustment: input.leverageAdjustment,
    learningSummary: input.learningSummary,
    learningReason: input.learningReason,
    serviceState: input.mode === "LIVE" ? "live-ready" : "paper"
  };

  if (eventCategory === "후보 기록") {
    if (
      !shouldStoreCandidateLearningLog({
        symbol: item.symbol,
        signalType: item.signalType,
        candidateStatus: item.candidateStatus,
        holdReason: item.holdReason,
        blockedReason: item.blockedReason,
        serviceState: item.serviceState,
        mode: input.mode
      })
    ) {
      return null;
    }
  }

  saveTradeLogs([item, ...getLearningLogs()].slice(0, 200));
  return item;
}

export function getSignalWinRates(): Array<{ signalType: SignalType; winRate: number; trades: number }> {
  return aggregateWinRates(getLearningLogs(), (log) => log.signalType).map(({ key, winRate, trades }) => ({
    signalType: key as SignalType,
    winRate,
    trades
  }));
}
