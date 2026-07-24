/**
 * Machine-readable paper vs linked backtest comparison.
 * Uses only verified numeric inputs — marks unavailable fields explicitly.
 */

export const PAPER_BACKTEST_COMPARISON_VERSION = 1 as const;

export type PaperFeedbackCode =
  | "paper_slippage_high"
  | "paper_fee_high"
  | "signal_miss_rate_high"
  | "entry_delay_high"
  | "live_data_regime_shift"
  | "excessive_rejections"
  | "paper_drawdown_high"
  | "paper_trade_count_low"
  | "paper_trade_count_high"
  | "stop_execution_deviation"
  | "target_execution_deviation"
  | "insufficient_paper_data";

export interface PaperBacktestComparison {
  version: typeof PAPER_BACKTEST_COMPARISON_VERSION;
  strategyId: string;
  strategyHash: string;
  paperSessionId: string | null;
  backtestResultId: string | null;
  expectedSignalCount: number | null;
  actualSignalCount: number | null;
  expectedTrades: number | null;
  actualTrades: number | null;
  missedSignals: number | null;
  returnDifference: number | null;
  winRateDifference: number | null;
  drawdownDifference: number | null;
  feeDifference: number | null;
  slippageDifference: number | null;
  feedbackCodes: PaperFeedbackCode[];
  notesKo: string[];
}

export function buildPaperBacktestComparison(input: {
  strategyId: string;
  strategyHash: string;
  paperSessionId?: string | null;
  backtestResultId?: string | null;
  expectedSignalCount?: number | null;
  actualSignalCount?: number | null;
  expectedTrades?: number | null;
  actualTrades?: number | null;
  expectedReturnPct?: number | null;
  actualReturnPct?: number | null;
  expectedWinRate?: number | null;
  actualWinRate?: number | null;
  expectedMdd?: number | null;
  actualMdd?: number | null;
  expectedFeeUsdt?: number | null;
  actualFeeUsdt?: number | null;
  expectedSlippageUsdt?: number | null;
  actualSlippageUsdt?: number | null;
}): PaperBacktestComparison {
  const codes: PaperFeedbackCode[] = [];
  const notes: string[] = [];

  const expectedTrades = input.expectedTrades ?? null;
  const actualTrades = input.actualTrades ?? null;
  const expectedSignals = input.expectedSignalCount ?? null;
  const actualSignals = input.actualSignalCount ?? null;

  const missedSignals =
    expectedSignals != null && actualSignals != null
      ? Math.max(0, expectedSignals - actualSignals)
      : null;

  const returnDifference =
    input.expectedReturnPct != null && input.actualReturnPct != null
      ? input.actualReturnPct - input.expectedReturnPct
      : null;

  const winRateDifference =
    input.expectedWinRate != null && input.actualWinRate != null
      ? input.actualWinRate - input.expectedWinRate
      : null;

  const drawdownDifference =
    input.expectedMdd != null && input.actualMdd != null
      ? input.actualMdd - input.expectedMdd
      : null;

  const feeDifference =
    input.expectedFeeUsdt != null && input.actualFeeUsdt != null
      ? input.actualFeeUsdt - input.expectedFeeUsdt
      : null;

  const slippageDifference =
    input.expectedSlippageUsdt != null && input.actualSlippageUsdt != null
      ? input.actualSlippageUsdt - input.expectedSlippageUsdt
      : null;

  if (actualTrades == null && actualSignals == null) {
    codes.push("insufficient_paper_data");
    notes.push("모의 매매 비교에 필요한 실측 데이터가 부족합니다.");
  }

  if (
    expectedTrades != null &&
    actualTrades != null &&
    expectedTrades > 0 &&
    actualTrades < expectedTrades * 0.5
  ) {
    codes.push("paper_trade_count_low");
    notes.push("모의 거래 수가 백테스트 기대치보다 현저히 낮습니다.");
  }

  if (
    expectedTrades != null &&
    actualTrades != null &&
    expectedTrades > 0 &&
    actualTrades > expectedTrades * 1.5
  ) {
    codes.push("paper_trade_count_high");
    notes.push("모의 거래 수가 백테스트 기대치보다 현저히 높습니다.");
  }

  if (
    missedSignals != null &&
    expectedSignals != null &&
    expectedSignals > 0 &&
    missedSignals / expectedSignals > 0.3
  ) {
    codes.push("signal_miss_rate_high");
    notes.push("신호 누락률이 높습니다.");
  }

  if (
    drawdownDifference != null &&
    drawdownDifference > 0.05
  ) {
    codes.push("paper_drawdown_high");
    notes.push("모의 낙폭이 백테스트보다 큽니다.");
  }

  if (feeDifference != null && feeDifference > 0) {
    codes.push("paper_fee_high");
    notes.push("모의 수수료가 백테스트 추정치보다 큽니다.");
  }

  if (slippageDifference != null && slippageDifference > 0) {
    codes.push("paper_slippage_high");
    notes.push("모의 슬리피지가 백테스트 추정치보다 큽니다.");
  }

  return {
    version: PAPER_BACKTEST_COMPARISON_VERSION,
    strategyId: input.strategyId,
    strategyHash: input.strategyHash,
    paperSessionId: input.paperSessionId ?? null,
    backtestResultId: input.backtestResultId ?? null,
    expectedSignalCount: expectedSignals,
    actualSignalCount: actualSignals,
    expectedTrades,
    actualTrades,
    missedSignals,
    returnDifference,
    winRateDifference,
    drawdownDifference,
    feeDifference,
    slippageDifference,
    feedbackCodes: codes,
    notesKo: notes,
  };
}
