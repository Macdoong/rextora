import { getRextoraSettings } from "./settings/settingsService";
import { appendLearningEntry } from "./learningLogger";
import {
  createEmptyPatternStats,
  loadLearningProfile,
  saveLearningProfile
} from "./learningStore";
import type {
  LearningAdjustment,
  LearningAdjustmentInput,
  LearningProfile,
  LearningSummary,
  PatternStats,
  TradeOutcomeRecord,
  TradeResult
} from "./learningTypes";
import type { LearningLogItem, SignalType } from "./types";

function aiScoreBucket(score: number): string {
  if (score >= 80) return "80+";
  if (score >= 70) return "70-79";
  if (score >= 60) return "60-69";
  return "below-60";
}

function leverageBucket(leverage: number): string {
  if (leverage <= 1) return "1x";
  if (leverage <= 2) return "2x";
  return "3x+";
}

function winRate(stats: PatternStats): number {
  if (stats.trades === 0) return 0;
  return (stats.wins / stats.trades) * 100;
}

function applyTradeToStats(stats: PatternStats, trade: TradeOutcomeRecord): PatternStats {
  const next = { ...stats };
  next.trades += 1;
  const pnl = trade.realizedPnlPct ?? 0;
  next.totalPnlPct += pnl;
  next.avgPnlPct = next.trades > 0 ? Number((next.totalPnlPct / next.trades).toFixed(2)) : 0;

  if (trade.result === "win") next.wins += 1;
  else if (trade.result === "loss") next.losses += 1;
  else if (trade.result === "flat") next.flats += 1;

  if (trade.exitReason === "take_profit") next.tpHits += 1;
  if (trade.exitReason === "stop_loss") next.slHits += 1;

  return next;
}

function bumpMapStats(
  map: Record<string, PatternStats>,
  key: string,
  trade: TradeOutcomeRecord
): Record<string, PatternStats> {
  const current = map[key] ?? createEmptyPatternStats();
  return { ...map, [key]: applyTradeToStats(current, trade) };
}

export function updateLearningProfileFromTrade(trade: TradeOutcomeRecord): LearningProfile {
  if (trade.result === "unknown") {
    return loadLearningProfile();
  }

  const profile = loadLearningProfile();
  const hourKey = String(new Date(trade.timestamp).getHours());
  const signalKey = String(trade.signalType);
  const sideKey = trade.side;
  const symbolKey = trade.symbol;
  const scoreKey = aiScoreBucket(trade.aiScore);
  const levKey = leverageBucket(trade.leverage);

  const consecutiveBefore = profile.global.consecutiveLosses;
  profile.global = {
    ...applyTradeToStats(profile.global, trade),
    consecutiveLosses: consecutiveBefore
  };
  if (trade.result === "loss") {
    profile.global.consecutiveLosses += 1;
  } else if (trade.result === "win") {
    profile.global.consecutiveLosses = 0;
  }

  profile.bySymbol = bumpMapStats(profile.bySymbol, symbolKey, trade);
  profile.bySide = bumpMapStats(profile.bySide, sideKey, trade);
  profile.byHour = bumpMapStats(profile.byHour, hourKey, trade);
  profile.bySignal = bumpMapStats(profile.bySignal, signalKey, trade);
  profile.byAiScoreBucket = bumpMapStats(profile.byAiScoreBucket, scoreKey, trade);
  profile.byLeverage = bumpMapStats(profile.byLeverage, levKey, trade);

  if (trade.mode === "LIVE") {
    profile.live = applyTradeToStats(profile.live, trade);
  } else {
    profile.paper = applyTradeToStats(profile.paper, trade);
  }

  return saveLearningProfile(profile);
}

function patternPenalty(stats: PatternStats, minSamples: number): { delta: number; reject: boolean; reason: string } {
  if (stats.trades < minSamples) {
    return { delta: 0, reject: false, reason: "" };
  }
  const rate = winRate(stats);
  if (stats.trades >= minSamples && rate <= 25 && stats.losses >= 3) {
    return { delta: -6, reject: true, reason: "반복 손실 패턴으로 진입 제외" };
  }
  if (rate <= 35) {
    return { delta: -4, reject: false, reason: "약한 패턴 — 점수 하향" };
  }
  if (rate >= 60 && stats.trades >= minSamples) {
    return { delta: 2, reject: false, reason: "양호한 패턴 — 점수 소폭 상향" };
  }
  return { delta: 0, reject: false, reason: "" };
}

export function calculateLearningAdjustment(input: LearningAdjustmentInput): LearningAdjustment {
  const settings = getRextoraSettings();
  const learning = settings.learning;

  const neutral: LearningAdjustment = {
    scoreDelta: 0,
    leverageMultiplier: 1,
    reject: false,
    reason: "학습 데이터 부족 — 중립 보정",
    confidence: 0
  };

  if (!learning.enabled) {
    return { ...neutral, reason: "학습 엔진 비활성" };
  }

  if (!input.costPass) {
    return { ...neutral, reason: "비용 미통과 — 학습 보정 미적용" };
  }

  const profile = loadLearningProfile();
  const minSamples = learning.minSamplesForAdjustment ?? 10;
  const maxDelta = learning.maxScoreDelta ?? 8;

  if (profile.global.trades < minSamples) {
    return neutral;
  }

  const symbolStats = profile.bySymbol[input.symbol] ?? createEmptyPatternStats();
  const sideStats = profile.bySide[input.side] ?? createEmptyPatternStats();
  const signalStats = profile.bySignal[input.signalType] ?? createEmptyPatternStats();
  const hourStats = profile.byHour[String(input.hour ?? new Date().getHours())] ?? createEmptyPatternStats();

  const penalties = [
    patternPenalty(symbolStats, minSamples),
    patternPenalty(sideStats, Math.max(5, minSamples - 2)),
    patternPenalty(signalStats, minSamples),
    patternPenalty(hourStats, minSamples)
  ];

  let scoreDelta = 0;
  let leverageMultiplier = 1;
  let reject = false;
  const reasons: string[] = [];
  const confidence = Math.min(1, profile.global.trades / (minSamples * 3));

  for (const p of penalties) {
    if (p.reject && learning.badPatternAutoRejectEnabled) {
      reject = true;
      reasons.push(p.reason);
    }
    if (p.delta < 0) {
      scoreDelta += p.delta;
      leverageMultiplier = Math.min(leverageMultiplier, 0.85);
      if (p.reason) reasons.push(p.reason);
    } else if (p.delta > 0 && learning.scoreAdjustmentEnabled) {
      scoreDelta += p.delta;
      if (p.reason) reasons.push(p.reason);
    }
  }

  if (profile.global.consecutiveLosses >= 3) {
    scoreDelta -= 2;
    leverageMultiplier = Math.min(leverageMultiplier, 0.75);
    reasons.push(`최근 연속 손실 ${profile.global.consecutiveLosses}회`);
  } else if (profile.global.consecutiveLosses >= 2) {
    scoreDelta -= 1;
    leverageMultiplier = Math.min(leverageMultiplier, 0.9);
    reasons.push("최근 손실 연속 감지");
  }

  if (!learning.scoreAdjustmentEnabled) scoreDelta = 0;
  if (!learning.leverageAdjustmentEnabled) leverageMultiplier = 1;

  scoreDelta = Math.max(-maxDelta, Math.min(maxDelta, scoreDelta));
  leverageMultiplier = Math.min(1, Math.max(0.5, leverageMultiplier));

  const reason = reasons.length > 0 ? reasons.join(" · ") : neutral.reason;

  const adjustment: LearningAdjustment = {
    scoreDelta,
    leverageMultiplier,
    reject,
    reason,
    confidence: Number(confidence.toFixed(2))
  };

  if (Math.abs(scoreDelta) > 0 || leverageMultiplier < 1 || reject) {
    profile.recentAdjustments = [
      {
        at: new Date().toISOString(),
        symbol: input.symbol,
        side: input.side,
        scoreDelta,
        leverageMultiplier,
        reason
      },
      ...profile.recentAdjustments
    ].slice(0, 20);
    saveLearningProfile(profile);
  }

  return adjustment;
}

export function buildLearningSummary(): LearningSummary {
  const profile = loadLearningProfile();
  const global = profile.global;
  const winRatePct = global.trades > 0 ? Number(((global.wins / global.trades) * 100).toFixed(1)) : 0;
  const tpRate = global.trades > 0 ? Number(((global.tpHits / global.trades) * 100).toFixed(1)) : 0;
  const slRate = global.trades > 0 ? Number(((global.slHits / global.trades) * 100).toFixed(1)) : 0;

  let learningStatus = "데이터 수집 중";
  if (global.trades >= 10) learningStatus = "학습 보정 활성";
  if (global.trades >= 30) learningStatus = "학습 프로필 안정";
  if (global.consecutiveLosses >= 3) learningStatus = "보수 모드 (연속 손실)";

  const recent = profile.recentAdjustments[0];

  return {
    todayTrades: global.trades,
    winRate: winRatePct,
    tpRate,
    slRate,
    consecutiveLosses: global.consecutiveLosses,
    learningStatus,
    recentAdjustment: recent ? `${recent.symbol} ${recent.side} · ${recent.reason}` : null,
    totalTrades: global.trades,
    avgPnlPct: global.avgPnlPct
  };
}

function mapResultToLearning(result: TradeResult, pnlPct: number): LearningLogItem["result"] {
  if (result === "win" && pnlPct > 0) return "성공";
  if (result === "loss" || pnlPct < 0) return "실패";
  if (result === "flat" || pnlPct === 0) return "보합";
  return pnlPct > 0 ? "성공" : "실패";
}

function mapExitReasonKorean(exitReason: TradeOutcomeRecord["exitReason"]): string {
  switch (exitReason) {
    case "take_profit":
      return "익절";
    case "stop_loss":
      return "손절";
    case "manual":
      return "수동 청산";
    case "error":
      return "오류";
    default:
      return "미확정";
  }
}

export function recordTradeOutcome(trade: TradeOutcomeRecord): void {
  if (trade.result !== "unknown") {
    updateLearningProfileFromTrade(trade);
  }

  appendLearningEntry({
    symbol: trade.symbol,
    direction: trade.side,
    entryReason: `AI ${trade.aiScore.toFixed(1)} · 최종 ${trade.finalScore.toFixed(1)} · ${trade.leverage}배`,
    exitReason: mapExitReasonKorean(trade.exitReason),
    result: mapResultToLearning(trade.result, trade.realizedPnlPct ?? 0),
    pnlPct: trade.realizedPnlPct ?? 0,
    signalType: trade.signalType as SignalType,
    mode: trade.mode === "LIVE" ? "LIVE" : "PAPER",
    eventCategory: "거래 기록",
    eventType: trade.mode === "LIVE" ? "실전 진입" : "모의 진입",
    leverage: trade.leverage,
    entryPrice: trade.entryPrice,
    exitPrice: trade.exitPrice
  });
}

export function getRecentWinRate(): number {
  const profile = loadLearningProfile();
  return winRate(profile.global);
}

export function getConsecutiveLosses(): number {
  return loadLearningProfile().global.consecutiveLosses;
}
