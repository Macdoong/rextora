/**
 * Paper-trading feedback for follow-up Strategy Search.
 * Uses only verified available metrics — marks unavailable fields explicitly.
 */

import {
  buildPaperBacktestComparison,
  type PaperBacktestComparison,
  type PaperFeedbackCode,
} from "../paper/paperBacktestComparison";

export const PAPER_FEEDBACK_VERSION = 1 as const;

export interface PaperFeedback {
  version: typeof PAPER_FEEDBACK_VERSION;
  strategyId: string;
  strategyName: string;
  createdAt: string;
  backtestWindow: {
    from: string | null;
    to: string | null;
    available: boolean;
  };
  paperMetrics: {
    realizedPnl: number | null;
    unrealizedPnl: number | null;
    tradeCount: number | null;
    available: boolean;
  };
  deviations: Array<{
    key: string;
    labelKo: string;
    available: boolean;
    noteKo: string;
    measured?: number | null;
    expected?: number | null;
  }>;
  comparison: PaperBacktestComparison | null;
  feedbackCodes: PaperFeedbackCode[];
  identifiedWeaknessesKo: string[];
  recommendedAdjustmentsKo: string[];
}

export function buildPaperFeedback(input: {
  strategyId: string;
  strategyName: string;
  strategyHash?: string;
  paperSessionId?: string | null;
  backtestResultId?: string | null;
  paperRealizedPnl?: number | null;
  paperUnrealizedPnl?: number | null;
  paperTradeCount?: number | null;
  paperSignalCount?: number | null;
  paperReturnPct?: number | null;
  paperMdd?: number | null;
  paperFeeUsdt?: number | null;
  paperSlippageUsdt?: number | null;
  paperWinRate?: number | null;
  backtestFrom?: string | null;
  backtestTo?: string | null;
  expectedTrades?: number | null;
  expectedSignalCount?: number | null;
  expectedReturnPct?: number | null;
  expectedMdd?: number | null;
  expectedFeeUsdt?: number | null;
  expectedSlippageUsdt?: number | null;
  expectedWinRate?: number | null;
}): PaperFeedback {
  const paperAvailable =
    input.paperRealizedPnl != null ||
    input.paperUnrealizedPnl != null ||
    input.paperTradeCount != null;

  const comparison = buildPaperBacktestComparison({
    strategyId: input.strategyId,
    strategyHash: input.strategyHash ?? "",
    paperSessionId: input.paperSessionId,
    backtestResultId: input.backtestResultId,
    expectedSignalCount: input.expectedSignalCount,
    actualSignalCount: input.paperSignalCount,
    expectedTrades: input.expectedTrades,
    actualTrades: input.paperTradeCount,
    expectedReturnPct: input.expectedReturnPct,
    actualReturnPct: input.paperReturnPct,
    expectedWinRate: input.expectedWinRate,
    actualWinRate: input.paperWinRate,
    expectedMdd: input.expectedMdd,
    actualMdd: input.paperMdd,
    expectedFeeUsdt: input.expectedFeeUsdt,
    actualFeeUsdt: input.paperFeeUsdt,
    expectedSlippageUsdt: input.expectedSlippageUsdt,
    actualSlippageUsdt: input.paperSlippageUsdt,
  });

  const weaknesses: string[] = [...comparison.notesKo];
  const adjustments: string[] = [];
  if (!paperAvailable) {
    weaknesses.push("모의 매매 성과 데이터가 아직 충분하지 않습니다.");
    adjustments.push("모의 매매를 더 운영한 뒤 재탐색하세요.");
  } else {
    if ((input.paperRealizedPnl ?? 0) < 0) {
      weaknesses.push("모의 매매 실현 손익이 음수입니다.");
      adjustments.push("낙폭·비용 민감 구간을 강화한 재탐색을 권장합니다.");
    }
    if (comparison.feedbackCodes.includes("paper_trade_count_low")) {
      adjustments.push("진입 확인을 완화한 재탐색을 권장합니다.");
    }
    if (comparison.feedbackCodes.includes("paper_trade_count_high")) {
      adjustments.push("확인 엄격도·쿨다운을 강화한 재탐색을 권장합니다.");
    }
    if (comparison.feedbackCodes.includes("paper_drawdown_high")) {
      adjustments.push("추세 필터·손절 범위를 강화한 재탐색을 권장합니다.");
    }
  }

  const deviations = [
    {
      key: "trade_count",
      labelKo: "거래 수 편차",
      available:
        comparison.expectedTrades != null && comparison.actualTrades != null,
      noteKo:
        comparison.expectedTrades != null && comparison.actualTrades != null
          ? `기대 ${comparison.expectedTrades} · 실제 ${comparison.actualTrades}`
          : "백테스트 기대 거래 수 또는 모의 거래 수가 없습니다.",
      measured: comparison.actualTrades,
      expected: comparison.expectedTrades,
    },
    {
      key: "signal_count",
      labelKo: "신호 수 편차",
      available:
        comparison.expectedSignalCount != null &&
        comparison.actualSignalCount != null,
      noteKo:
        comparison.missedSignals != null
          ? `누락 신호 ${comparison.missedSignals}`
          : "신호 비교 데이터가 없습니다.",
      measured: comparison.actualSignalCount,
      expected: comparison.expectedSignalCount,
    },
    {
      key: "return_difference",
      labelKo: "수익률 편차",
      available: comparison.returnDifference != null,
      noteKo:
        comparison.returnDifference != null
          ? `모의−백테스트 ${comparison.returnDifference.toFixed(4)}`
          : "수익률 비교 데이터가 없습니다.",
      measured: input.paperReturnPct ?? null,
      expected: input.expectedReturnPct ?? null,
    },
    {
      key: "drawdown_difference",
      labelKo: "낙폭 편차",
      available: comparison.drawdownDifference != null,
      noteKo:
        comparison.drawdownDifference != null
          ? `모의 MDD − 백테스트 MDD ${comparison.drawdownDifference.toFixed(4)}`
          : "낙폭 비교 데이터가 없습니다.",
      measured: input.paperMdd ?? null,
      expected: input.expectedMdd ?? null,
    },
    {
      key: "fee_difference",
      labelKo: "수수료 편차",
      available: comparison.feeDifference != null,
      noteKo:
        comparison.feeDifference != null
          ? `수수료 차이 ${comparison.feeDifference.toFixed(4)} USDT`
          : "수수료 비교 데이터가 없습니다.",
      measured: input.paperFeeUsdt ?? null,
      expected: input.expectedFeeUsdt ?? null,
    },
    {
      key: "slippage_difference",
      labelKo: "슬리피지 편차",
      available: comparison.slippageDifference != null,
      noteKo:
        comparison.slippageDifference != null
          ? `슬리피지 차이 ${comparison.slippageDifference.toFixed(4)} USDT`
          : "슬리피지 비교 데이터가 없습니다.",
      measured: input.paperSlippageUsdt ?? null,
      expected: input.expectedSlippageUsdt ?? null,
    },
  ];

  return {
    version: PAPER_FEEDBACK_VERSION,
    strategyId: input.strategyId,
    strategyName: input.strategyName,
    createdAt: new Date().toISOString(),
    backtestWindow: {
      from: input.backtestFrom ?? null,
      to: input.backtestTo ?? null,
      available: Boolean(input.backtestFrom || input.backtestTo),
    },
    paperMetrics: {
      realizedPnl: input.paperRealizedPnl ?? null,
      unrealizedPnl: input.paperUnrealizedPnl ?? null,
      tradeCount: input.paperTradeCount ?? null,
      available: paperAvailable,
    },
    deviations,
    comparison,
    feedbackCodes: comparison.feedbackCodes,
    identifiedWeaknessesKo: weaknesses,
    recommendedAdjustmentsKo: adjustments,
  };
}
