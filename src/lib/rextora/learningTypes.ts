import type { SignalType, TradingMode } from "./types";
import type { ExecutionSideLabel } from "./executionCandidateTypes";

export type TradeResult = "win" | "loss" | "flat" | "unknown";
export type TradeExitReason =
  | "take_profit"
  | "stop_loss"
  | "manual"
  | "error"
  | "unknown";

export interface PatternStats {
  trades: number;
  wins: number;
  losses: number;
  flats: number;
  tpHits: number;
  slHits: number;
  totalPnlPct: number;
  avgPnlPct: number;
}

export interface LearningProfile {
  version: number;
  updatedAt: string;
  global: PatternStats & { consecutiveLosses: number };
  bySymbol: Record<string, PatternStats>;
  bySide: Record<string, PatternStats>;
  byHour: Record<string, PatternStats>;
  bySignal: Record<string, PatternStats>;
  byAiScoreBucket: Record<string, PatternStats>;
  byLeverage: Record<string, PatternStats>;
  byCostBucket: Record<string, PatternStats>;
  paper: PatternStats;
  live: PatternStats;
  recentAdjustments: Array<{
    at: string;
    symbol: string;
    side: ExecutionSideLabel;
    scoreDelta: number;
    leverageMultiplier: number;
    reason: string;
  }>;
}

export interface LearningAdjustment {
  scoreDelta: number;
  leverageMultiplier: number;
  reject: boolean;
  reason: string;
  confidence: number;
}

export interface LearningAdjustmentInput {
  symbol: string;
  side: ExecutionSideLabel;
  signalType: string;
  aiScore: number;
  costPass: boolean;
  hour?: number;
}

export interface TradeOutcomeRecord {
  mode: TradingMode;
  symbol: string;
  side: ExecutionSideLabel;
  signalType: SignalType | string;
  aiScore: number;
  finalScore: number;
  leverage: number;
  entryPrice: number;
  exitPrice?: number;
  realizedPnl?: number;
  realizedPnlPct?: number;
  result: TradeResult;
  exitReason: TradeExitReason;
  timestamp: string;
}

export interface LearningSummary {
  todayTrades: number;
  winRate: number;
  tpRate: number;
  slRate: number;
  consecutiveLosses: number;
  learningStatus: string;
  recentAdjustment: string | null;
  totalTrades: number;
  avgPnlPct: number;
}
