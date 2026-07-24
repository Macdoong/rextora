/**
 * Verified-metric recommendation labels for Results cards.
 * Does not fabricate unavailable metrics.
 */

export type StrategyRecommendationCode =
  | "review_backtest"
  | "improve_search"
  | "paper_candidate"
  | "live_candidate"
  | "discard"
  | "protected_safe";

export interface StrategyRecommendation {
  code: StrategyRecommendationCode;
  labelKo: string;
}

export function recommendStrategyAction(input: {
  totalReturn: number | null;
  mdd: number | null;
  tradeCount: number | null;
  passed: boolean | null;
  paperActive: boolean;
  liveActive: boolean;
  isSafe: boolean;
}): StrategyRecommendation {
  if (input.isSafe) {
    return { code: "protected_safe", labelKo: "SAFE 기준 (보호)" };
  }
  if (input.liveActive) {
    return { code: "live_candidate", labelKo: "실전매매 후보 검토 가능" };
  }
  if (input.paperActive) {
    return { code: "paper_candidate", labelKo: "모의매매 후보 적합" };
  }
  if (input.passed === true) {
    const mddOk = input.mdd == null || Math.abs(input.mdd) <= 0.25;
    const tradesOk = input.tradeCount == null || input.tradeCount >= 5;
    if (mddOk && tradesOk && (input.totalReturn ?? 0) > 0) {
      return { code: "paper_candidate", labelKo: "모의매매 후보 적합" };
    }
    return { code: "review_backtest", labelKo: "백테스트 상세 검토 권장" };
  }
  if (input.tradeCount != null && input.tradeCount < 3) {
    return { code: "improve_search", labelKo: "추가 개선 탐색 권장" };
  }
  if (
    input.totalReturn != null &&
    input.totalReturn < -0.1 &&
    input.mdd != null &&
    Math.abs(input.mdd) > 0.3
  ) {
    return { code: "discard", labelKo: "폐기 권장" };
  }
  if (input.totalReturn == null && input.mdd == null) {
    return { code: "review_backtest", labelKo: "백테스트 상세 검토 권장" };
  }
  return { code: "improve_search", labelKo: "추가 개선 탐색 권장" };
}
