import { learningLogsSeed } from "./seedData";
import { loadTradeLogs, saveTradeLogs } from "./storage/tradeStore";
import type { AiCandidate, LearningLogItem, SignalType, TradeDirection } from "./types";

export function getLearningLogs(limit?: number): LearningLogItem[] {
  const stored = loadTradeLogs(learningLogsSeed);
  const logs = stored.length > 0 ? stored : learningLogsSeed;
  if (typeof limit === "number" && limit > 0) {
    return logs.slice(0, limit);
  }
  return logs;
}

export function getLearningLogsSummary(): { total: number; recentCount: number; lastUpdated: string | null } {
  const logs = getLearningLogs();
  return {
    total: logs.length,
    recentCount: Math.min(logs.length, 5),
    lastUpdated: logs[0]?.time ?? null
  };
}

export function logCandidateSnapshot(candidate: AiCandidate): LearningLogItem {
  const item: LearningLogItem = {
    id: `log-${Date.now()}`,
    time: new Date().toLocaleString("ko-KR", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }),
    symbol: candidate.symbol,
    direction: candidate.direction,
    entryReason: candidate.entryReason ?? candidate.signalReason ?? "후보 스냅샷",
    exitReason: candidate.blockReason ? "진입 차단" : "대기",
    result: candidate.status === "진입 가능" ? "성공" : "실패",
    pnlPct: 0,
    signalType: candidate.signalType,
    blockedReason: candidate.blockReason,
    serviceState: candidate.serviceState
  };
  const logs = saveTradeLogs([item, ...getLearningLogs()].slice(0, 200));
  return logs[0];
}

export function logTradeOutcome(input: {
  symbol: string;
  direction: TradeDirection;
  entryReason: string;
  exitReason: string;
  pnlPct: number;
  signalType: SignalType;
}): LearningLogItem {
  const item: LearningLogItem = {
    id: `log-${Date.now()}`,
    time: new Date().toLocaleString("ko-KR", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }),
    symbol: input.symbol,
    direction: input.direction,
    entryReason: input.entryReason,
    exitReason: input.exitReason,
    result: input.pnlPct >= 0 ? "성공" : "실패",
    pnlPct: input.pnlPct,
    signalType: input.signalType,
    successPattern: input.pnlPct >= 0 ? input.entryReason : undefined,
    failurePattern: input.pnlPct < 0 ? input.exitReason : undefined,
    serviceState: "paper"
  };
  saveTradeLogs([item, ...getLearningLogs()].slice(0, 200));
  return item;
}

export function getCoinWinRates(): Array<{ symbol: string; winRate: number; trades: number }> {
  const bySymbol = new Map<string, { wins: number; total: number }>();
  for (const log of getLearningLogs()) {
    const current = bySymbol.get(log.symbol) ?? { wins: 0, total: 0 };
    current.total += 1;
    if (log.result === "성공") current.wins += 1;
    bySymbol.set(log.symbol, current);
  }
  return Array.from(bySymbol.entries()).map(([symbol, stats]) => ({
    symbol,
    winRate: stats.total > 0 ? Number(((stats.wins / stats.total) * 100).toFixed(1)) : 0,
    trades: stats.total
  }));
}

export function appendLearningEntry(input: {
  symbol: string;
  direction: TradeDirection;
  entryReason: string;
  exitReason: string;
  result: "성공" | "실패";
  pnlPct: number;
  signalType: SignalType;
  mode?: "PAPER" | "LIVE";
}): LearningLogItem {
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
    serviceState: input.mode === "LIVE" ? "live-ready" : "paper"
  };
  saveTradeLogs([item, ...getLearningLogs()].slice(0, 200));
  return item;
}

export function getSignalWinRates(): Array<{ signalType: SignalType; winRate: number; trades: number }> {
  const bySignal = new Map<SignalType, { wins: number; total: number }>();
  for (const log of getLearningLogs()) {
    const current = bySignal.get(log.signalType) ?? { wins: 0, total: 0 };
    current.total += 1;
    if (log.result === "성공") current.wins += 1;
    bySignal.set(log.signalType, current);
  }
  return Array.from(bySignal.entries()).map(([signalType, stats]) => ({
    signalType,
    winRate: stats.total > 0 ? Number(((stats.wins / stats.total) * 100).toFixed(1)) : 0,
    trades: stats.total
  }));
}
