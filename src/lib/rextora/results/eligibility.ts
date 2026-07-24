/**
 * Eligibility gates for Results highlight cards (최고 안정 / 최종 추천).
 */

import {
  evaluateOverfittingEvidence,
  hasRequiredRobustnessEvidence,
  type OverfittingEvidence,
  type OverfittingEvidenceInput,
} from "../strategySearch/overfittingEvidence";

export type HighlightEligibilityBlocker =
  | "no_backtest"
  | "invalid_metrics"
  | "insufficient_trades"
  | "not_passed"
  | "non_finite_return"
  | "non_finite_mdd"
  | "zero_evidence"
  | "mdd_exceeded"
  | "missing_cost_evidence"
  | "missing_robustness"
  | "high_overfitting"
  | "identity_incomplete";

export interface HighlightEligibilityInput {
  hasBacktest: boolean;
  totalReturn: number | null | undefined;
  mdd: number | null | undefined;
  tradeCount: number | null | undefined;
  passed: boolean | null | undefined;
  minTrades?: number;
  maxMddAbs?: number;
  hasCostEvidence?: boolean;
  strategyId?: string | null;
  strategyHash?: string | null;
  overfittingInput?: OverfittingEvidenceInput | null;
}

export interface HighlightEligibilityResult {
  eligible: boolean;
  blockers: HighlightEligibilityBlocker[];
  messageKo: string | null;
  overfitting: OverfittingEvidence | null;
}

const BLOCKER_KO: Record<HighlightEligibilityBlocker, string> = {
  no_backtest: "완료된 백테스트가 없습니다",
  invalid_metrics: "유효한 성과 지표가 없습니다",
  insufficient_trades: "최소 거래 수 미달",
  not_passed: "PASS 자격 미충족",
  non_finite_return: "순수익이 유효하지 않습니다",
  non_finite_mdd: "최대 낙폭이 유효하지 않습니다",
  zero_evidence: "검증 증거가 없습니다",
  mdd_exceeded: "최대 낙폭 한도 초과",
  missing_cost_evidence: "비용 증거 없음",
  missing_robustness: "강건성·과적합 증거 없음",
  high_overfitting: "과적합 위험 높음",
  identity_incomplete: "전략 ID/해시 불완전",
};

export function evaluateHighlightEligibility(
  input: HighlightEligibilityInput,
): HighlightEligibilityResult {
  const minTrades = input.minTrades ?? 5;
  const maxMddAbs = input.maxMddAbs ?? 0.25;
  const blockers: HighlightEligibilityBlocker[] = [];

  if (!input.hasBacktest) blockers.push("no_backtest");

  const ret = input.totalReturn;
  const mdd = input.mdd;
  const trades = input.tradeCount;

  if (ret == null || !Number.isFinite(ret)) blockers.push("non_finite_return");
  if (mdd == null || !Number.isFinite(mdd)) blockers.push("non_finite_mdd");
  if (trades == null || !Number.isFinite(trades)) {
    blockers.push("invalid_metrics");
  } else if (trades < minTrades) {
    blockers.push("insufficient_trades");
  }
  if (input.passed !== true) blockers.push("not_passed");
  if (
    (trades === 0 || trades == null) &&
    (ret == null || ret === 0) &&
    (mdd == null || mdd === 0)
  ) {
    blockers.push("zero_evidence");
  }
  if (mdd != null && Number.isFinite(mdd) && Math.abs(mdd) > maxMddAbs) {
    blockers.push("mdd_exceeded");
  }
  if (input.hasCostEvidence === false) {
    blockers.push("missing_cost_evidence");
  }
  if (
    input.strategyId !== undefined ||
    input.strategyHash !== undefined
  ) {
    if (!input.strategyId || !input.strategyHash) {
      blockers.push("identity_incomplete");
    }
  }

  let overfitting: OverfittingEvidence | null = null;
  if (input.overfittingInput != null) {
    overfitting = evaluateOverfittingEvidence(input.overfittingInput);
    if (overfitting.overfittingRisk === "unavailable") {
      blockers.push("missing_robustness");
    } else if (overfitting.overfittingRisk === "high") {
      blockers.push("high_overfitting");
    } else if (!hasRequiredRobustnessEvidence({ overfitting })) {
      blockers.push("missing_robustness");
    }
  }

  const unique = [...new Set(blockers)];
  if (unique.length === 0) {
    return { eligible: true, blockers: [], messageKo: null, overfitting };
  }
  return {
    eligible: false,
    blockers: unique,
    messageKo: unique.map((b) => BLOCKER_KO[b]).join(" · "),
    overfitting,
  };
}

export function metricStatusKo(input: {
  hasBacktest: boolean;
  backtestFailed?: boolean;
  totalReturn: number | null | undefined;
  tradeCount: number | null | undefined;
  passed: boolean | null | undefined;
}): string {
  if (!input.hasBacktest) return "백테스트 필요";
  if (input.backtestFailed) return "백테스트 실패";
  if (input.totalReturn == null && input.tradeCount == null) return "데이터 없음";
  if (input.passed == null) return "검증 대기";
  if (
    (input.totalReturn != null && !Number.isFinite(input.totalReturn)) ||
    (input.tradeCount != null && !Number.isFinite(input.tradeCount))
  ) {
    return "계산 불가";
  }
  return input.passed ? "PASS" : "미통과";
}
