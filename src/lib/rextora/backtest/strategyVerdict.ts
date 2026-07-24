/**
 * Deterministic strategy verdict labels from verified backtest metrics.
 * No AI — thresholds only.
 */

export type VerdictLabel =
  | "비용 부담 매우 높음"
  | "손실 전략"
  | "승률 낮음"
  | "부적격 - 최대 허용 낙폭 초과"
  | "낙폭 주의"
  | "표본 부족"
  | "추가 검증 필요"
  | "비용 대비 성과 양호"
  | "안정적 후보";

export interface VerdictInput {
  totalReturn: number;
  mdd: number;
  winRate: number;
  tradeCount: number;
  /** Total trading cost as fraction of initial capital (0.1 = 10%) */
  totalCostPctOfInitialCapital: number;
  profitFactor: number;
}

export interface StrategyVerdict {
  labels: VerdictLabel[];
  primary: VerdictLabel;
  summaryKo: string;
  usable: "usable_candidate" | "risky" | "cost_dominated" | "insufficient_sample" | "unprofitable";
}

export const VERDICT_THRESHOLDS = {
  minTrades: 30,
  highCostPctOfCapital: 0.15,
  veryHighCostPctOfCapital: 0.4,
  lowWinRate: 0.35,
  cautionMdd: 0.1,
  severeMdd: 0.2,
  goodProfitFactor: 1.2,
} as const;

export function evaluateStrategyVerdict(input: VerdictInput): StrategyVerdict {
  const labels: VerdictLabel[] = [];

  if (input.tradeCount < VERDICT_THRESHOLDS.minTrades) {
    labels.push("표본 부족");
  }
  if (input.totalCostPctOfInitialCapital >= VERDICT_THRESHOLDS.veryHighCostPctOfCapital) {
    labels.push("비용 부담 매우 높음");
  }
  if (input.totalReturn < 0) {
    labels.push("손실 전략");
  }
  if (input.winRate < VERDICT_THRESHOLDS.lowWinRate && input.tradeCount >= 10) {
    labels.push("승률 낮음");
  }
  if (Math.abs(input.mdd) >= VERDICT_THRESHOLDS.severeMdd) {
    labels.push("부적격 - 최대 허용 낙폭 초과");
  } else if (Math.abs(input.mdd) >= VERDICT_THRESHOLDS.cautionMdd) {
    labels.push("낙폭 주의");
  }
  if (
    input.totalReturn > 0 &&
    input.profitFactor >= VERDICT_THRESHOLDS.goodProfitFactor &&
    input.totalCostPctOfInitialCapital < VERDICT_THRESHOLDS.highCostPctOfCapital &&
    Math.abs(input.mdd) < VERDICT_THRESHOLDS.cautionMdd &&
    input.tradeCount >= VERDICT_THRESHOLDS.minTrades
  ) {
    labels.push("비용 대비 성과 양호");
    labels.push("안정적 후보");
  }
  if (labels.length === 0) {
    labels.push("추가 검증 필요");
  }

  let usable: StrategyVerdict["usable"] = "risky";
  if (labels.includes("부적격 - 최대 허용 낙폭 초과")) usable = "risky";
  else if (labels.includes("표본 부족")) usable = "insufficient_sample";
  else if (labels.includes("비용 부담 매우 높음")) usable = "cost_dominated";
  else if (labels.includes("손실 전략")) usable = "unprofitable";
  else if (labels.includes("안정적 후보")) usable = "usable_candidate";
  else usable = "risky";

  const primary =
    labels.find((l) => l === "부적격 - 최대 허용 낙폭 초과") ?? labels[0];
  const summaryKo =
    labels.includes("부적격 - 최대 허용 낙폭 초과")
      ? "최대 낙폭이 허용 한도를 초과했습니다. 모의·실전 등록이 차단됩니다."
      : usable === "cost_dominated"
        ? "거래비용이 성과를 크게 잠식합니다. 수수료·스프레드 설정을 재검토하세요."
        : usable === "unprofitable"
          ? "순수익률이 음수입니다. 진입 조건·기간을 추가로 검증하세요."
          : usable === "insufficient_sample"
            ? "거래 표본이 부족합니다. 더 긴 기간으로 재실행하세요."
            : usable === "usable_candidate"
              ? "수익·비용·낙폭 균형이 양호한 후보입니다. 추가 구간 검증을 권장합니다."
              : "일부 지표에 주의가 필요합니다. 월별 안정성과 비용을 함께 확인하세요.";

  return { labels, primary, summaryKo, usable };
}
