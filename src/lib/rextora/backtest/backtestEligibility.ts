/**
 * Canonical Backtest Run eligibility for Paper / Live handoff gates.
 * Thresholds are documented here — unrelated live risk settings are not mutated.
 */

import { VERDICT_THRESHOLDS } from "./strategyVerdict";
import { SAMPLE_MIN_TRADES } from "./statusThresholds";
import { isExecutionPriceSlippageV1 } from "./executionSlippage";
import {
  COST_ASSUMPTIONS_VERSION,
  isCostStressSnapshotComplete,
  isRecognizedFeeModel,
  isRecognizedFundingModel,
  isRecognizedSpreadModel,
  isValidCostRate,
  type CostAssumptionsV1,
  type ResolvedScenarioCostAssumptions,
} from "./costAssumptions";
import type { BacktestReport } from "./backtestTypes";

/** Absolute max drawdown fraction (0.25 = 25%) for backtest eligibility. */
export const BACKTEST_MAX_ALLOWED_MDD_ABS = VERDICT_THRESHOLDS.severeMdd;

/** Total cost / gross profit at or above this → critical cost warning. */
export const BACKTEST_COST_OF_GROSS_CRITICAL = 0.5;

export type BacktestEligibilityReasonCode =
  | "maximum_drawdown_exceeded"
  | "insufficient_trade_sample"
  | "excessive_cost_ratio"
  | "unstable_monthly_performance"
  | "invalid_metric"
  | "robustness_missing"
  | "backtest_incomplete"
  | "legacy_slippage_model"
  | "missing_cost_assumptions"
  | "unsupported_cost_assumptions_version"
  | "invalid_cost_rate"
  | "unrecognized_fee_model"
  | "unrecognized_funding_model"
  | "unrecognized_spread_model"
  | "missing_stress_cost_assumptions";

export interface BacktestEligibilityReason {
  code: BacktestEligibilityReasonCode;
  labelKo: string;
  observedValue: number | null;
  requiredThreshold: number | null;
}

export interface BacktestEligibilityInput {
  status?: string | null;
  totalReturn: number | null | undefined;
  mdd: number | null | undefined;
  tradeCount: number | null | undefined;
  winRate?: number | null;
  profitFactor?: number | null;
  /** Total cost as fraction of initial capital. */
  totalCostPctOfInitialCapital?: number | null;
  /** totalCostUsdt / grossPnLBeforeCosts when gross > 0. */
  totalCostPctOfGrossProfit?: number | null;
  negativeMonths?: number | null;
  monthlyReturnCount?: number | null;
  /** Override; defaults to BACKTEST_MAX_ALLOWED_MDD_ABS. */
  maxAllowedMddAbs?: number | null;
  minTrades?: number | null;
  hasCostStress?: boolean | null;
  /** Absent / legacy_v0 cannot newly advance to Paper/Live. */
  slippageModelVersion?: string | null;
  costAssumptions?: CostAssumptionsV1 | null;
  primaryCostAssumptions?: ResolvedScenarioCostAssumptions | null;
  costStress?: BacktestReport["costStress"] | null;
  grossPnLBeforeCosts?: number | null;
  totalEconomicFrictionUsdt?: number | null;
  totalDeductedCostUsdt?: number | null;
}

export interface BacktestEligibilityResult {
  eligible: boolean;
  verdictCode: BacktestEligibilityReasonCode | "eligible";
  verdictLabel: string;
  reasons: BacktestEligibilityReason[];
  observedValue: number | null;
  requiredThreshold: number | null;
  maxAllowedMddAbs: number;
  sampleAdequate: boolean;
  strongestPointKo: string;
  primaryRiskKo: string;
  recommendedNextActionKo: string;
}

const REASON_LABEL: Record<BacktestEligibilityReasonCode, string> = {
  maximum_drawdown_exceeded: "부적격 - 최대 허용 낙폭 초과",
  insufficient_trade_sample: "부적격 - 거래 표본 부족",
  excessive_cost_ratio: "부적격 - 비용 비율 과다",
  unstable_monthly_performance: "부적격 - 월별 성과 불안정",
  invalid_metric: "부적격 - 지표 무효",
  robustness_missing: "경고 - 비용 스트레스 검증 없음",
  backtest_incomplete: "부적격 - 백테스트 미완료",
  legacy_slippage_model: "부적격 - 레거시 슬리피지 모델 (재백테스트 필요)",
  missing_cost_assumptions: "부적격 - 비용 가정 미기록 (재백테스트 필요)",
  unsupported_cost_assumptions_version: "부적격 - 지원하지 않는 비용 가정 버전",
  invalid_cost_rate: "부적격 - 비용 요율이 유효하지 않음",
  unrecognized_fee_model: "부적격 - 알 수 없는 수수료 모델",
  unrecognized_funding_model: "부적격 - 알 수 없는 펀딩 모델",
  unrecognized_spread_model: "부적격 - 알 수 없는 스프레드 모델",
  missing_stress_cost_assumptions: "부적격 - 스트레스 비용 가정 미기록",
};

function pushUnique(
  reasons: BacktestEligibilityReason[],
  code: BacktestEligibilityReasonCode,
): void {
  if (reasons.some((r) => r.code === code)) return;
  reasons.push({
    code,
    labelKo: REASON_LABEL[code],
    observedValue: null,
    requiredThreshold: null,
  });
}

function usesEconomicFrictionRatio(input: BacktestEligibilityInput): boolean {
  const friction = input.totalEconomicFrictionUsdt;
  const gross = input.grossPnLBeforeCosts;
  if (
    friction == null ||
    gross == null ||
    !Number.isFinite(friction) ||
    !Number.isFinite(gross) ||
    gross <= 0
  ) {
    return false;
  }
  return (
    input.costAssumptions?.version === COST_ASSUMPTIONS_VERSION ||
    isExecutionPriceSlippageV1(input.slippageModelVersion)
  );
}

export function resolveEligibilityCostRatio(
  input: BacktestEligibilityInput,
): number | null {
  if (usesEconomicFrictionRatio(input)) {
    return (input.totalEconomicFrictionUsdt as number) /
      (input.grossPnLBeforeCosts as number);
  }
  const fallback = input.totalCostPctOfGrossProfit;
  if (fallback == null || !Number.isFinite(fallback)) return null;
  return fallback;
}

function collectProvenanceReasons(
  input: BacktestEligibilityInput,
  reasons: BacktestEligibilityReason[],
): void {
  const assumptions = input.costAssumptions;
  if (assumptions == null) {
    pushUnique(reasons, "missing_cost_assumptions");
    return;
  }
  if (assumptions.version !== COST_ASSUMPTIONS_VERSION) {
    pushUnique(reasons, "unsupported_cost_assumptions_version");
  }
  if (
    assumptions.slippage.modelVersion &&
    !isExecutionPriceSlippageV1(assumptions.slippage.modelVersion)
  ) {
    pushUnique(reasons, "legacy_slippage_model");
  }
  const rates = [
    assumptions.fee.configuredRate,
    assumptions.fee.effectiveRate,
    assumptions.slippage.configuredRate,
    assumptions.slippage.effectiveRate,
    assumptions.funding.configuredRate,
    assumptions.funding.effectiveRate,
    assumptions.spread.configuredRate,
    assumptions.spread.effectiveRate,
  ];
  if (!rates.every(isValidCostRate)) {
    pushUnique(reasons, "invalid_cost_rate");
  }
  if (!isRecognizedFeeModel(assumptions.fee.model)) {
    pushUnique(reasons, "unrecognized_fee_model");
  }
  if (!isRecognizedFundingModel(assumptions.funding.model)) {
    pushUnique(reasons, "unrecognized_funding_model");
  }
  if (!isRecognizedSpreadModel(assumptions.spread.model)) {
    pushUnique(reasons, "unrecognized_spread_model");
  }
  if (input.primaryCostAssumptions == null) {
    pushUnique(reasons, "missing_cost_assumptions");
  }
  const stress = input.costStress;
  if (Array.isArray(stress) && stress.length > 0) {
    const incomplete = stress.some((row) => !isCostStressSnapshotComplete(row));
    if (incomplete) {
      pushUnique(reasons, "missing_stress_cost_assumptions");
    }
  }
}

export function evaluateBacktestEligibility(
  input: BacktestEligibilityInput,
): BacktestEligibilityResult {
  const maxMdd = Math.abs(
    input.maxAllowedMddAbs ?? BACKTEST_MAX_ALLOWED_MDD_ABS,
  );
  const minTrades = input.minTrades ?? SAMPLE_MIN_TRADES;
  const reasons: BacktestEligibilityReason[] = [];

  if (input.status && input.status !== "completed") {
    reasons.push({
      code: "backtest_incomplete",
      labelKo: REASON_LABEL.backtest_incomplete,
      observedValue: null,
      requiredThreshold: null,
    });
  }

  if (!isExecutionPriceSlippageV1(input.slippageModelVersion)) {
    pushUnique(reasons, "legacy_slippage_model");
  }

  collectProvenanceReasons(input, reasons);

  const ret = input.totalReturn;
  const mdd = input.mdd;
  const trades = input.tradeCount;

  if (ret == null || !Number.isFinite(ret) || mdd == null || !Number.isFinite(mdd)) {
    reasons.push({
      code: "invalid_metric",
      labelKo: REASON_LABEL.invalid_metric,
      observedValue: null,
      requiredThreshold: null,
    });
  }

  if (trades == null || !Number.isFinite(trades)) {
    reasons.push({
      code: "invalid_metric",
      labelKo: REASON_LABEL.invalid_metric,
      observedValue: null,
      requiredThreshold: null,
    });
  } else if (trades < minTrades) {
    reasons.push({
      code: "insufficient_trade_sample",
      labelKo: REASON_LABEL.insufficient_trade_sample,
      observedValue: trades,
      requiredThreshold: minTrades,
    });
  }

  if (mdd != null && Number.isFinite(mdd) && Math.abs(mdd) > maxMdd) {
    reasons.push({
      code: "maximum_drawdown_exceeded",
      labelKo: REASON_LABEL.maximum_drawdown_exceeded,
      observedValue: mdd,
      requiredThreshold: -maxMdd,
    });
  }

  const costOfGross = resolveEligibilityCostRatio(input);
  if (
    costOfGross != null &&
    Number.isFinite(costOfGross) &&
    costOfGross >= BACKTEST_COST_OF_GROSS_CRITICAL
  ) {
    reasons.push({
      code: "excessive_cost_ratio",
      labelKo: REASON_LABEL.excessive_cost_ratio,
      observedValue: costOfGross,
      requiredThreshold: BACKTEST_COST_OF_GROSS_CRITICAL,
    });
  }

  const monthCount = input.monthlyReturnCount ?? 0;
  const negMonths = input.negativeMonths ?? 0;
  if (monthCount >= 3 && negMonths / monthCount >= 0.67) {
    reasons.push({
      code: "unstable_monthly_performance",
      labelKo: REASON_LABEL.unstable_monthly_performance,
      observedValue: negMonths / monthCount,
      requiredThreshold: 0.67,
    });
  }

  if (input.hasCostStress === false) {
    reasons.push({
      code: "robustness_missing",
      labelKo: REASON_LABEL.robustness_missing,
      observedValue: null,
      requiredThreshold: null,
    });
  }

  // Hard blockers (eligibility false) — robustness_missing is warning-only.
  const blockers = reasons.filter((r) => r.code !== "robustness_missing");
  const primary =
    blockers.find((r) => r.code === "maximum_drawdown_exceeded") ??
    blockers[0] ??
    null;

  const eligible = blockers.length === 0;
  const sampleAdequate =
    trades != null && Number.isFinite(trades) && trades >= minTrades;

  const strongestPointKo = pickStrongestPoint(input);
  const primaryRiskKo = primary
    ? primary.labelKo
    : reasons[0]?.labelKo ?? "주요 위험 없음";
  const recommendedNextActionKo = eligible
    ? "모의매매 등록 후 실시간 괴리를 검증하세요."
    : primary?.code === "maximum_drawdown_exceeded"
      ? "낙폭 한도를 충족하는 기간·설정으로 재백테스트하거나 전략을 재탐색하세요."
      : primary?.code === "insufficient_trade_sample"
        ? "더 긴 기간으로 백테스트를 다시 실행하세요."
    : primary?.code === "excessive_cost_ratio"
      ? "비용 설정을 점검하고 진입 빈도를 줄인 뒤 재검증하세요."
      : primary?.code === "legacy_slippage_model"
        ? "execution_price_v1 슬리피지 모델로 재백테스트한 뒤 Paper/Live로 진행하세요."
        : primary?.code === "missing_cost_assumptions" ||
            primary?.code === "unsupported_cost_assumptions_version" ||
            primary?.code === "missing_stress_cost_assumptions"
          ? "비용 가정이 기록된 최신 백테스트를 다시 실행한 뒤 Paper/Live로 진행하세요."
        : "부적격 사유를 해소한 뒤 Paper/Live로 진행하세요.";

  return {
    eligible,
    verdictCode: eligible ? "eligible" : (primary?.code ?? "invalid_metric"),
    verdictLabel: eligible
      ? "적격 - 백테스트 게이트 통과"
      : (primary?.labelKo ?? "부적격"),
    reasons,
    observedValue: primary?.observedValue ?? mdd ?? null,
    requiredThreshold: primary?.requiredThreshold ?? -maxMdd,
    maxAllowedMddAbs: maxMdd,
    sampleAdequate,
    strongestPointKo,
    primaryRiskKo,
    recommendedNextActionKo,
  };
}

function pickStrongestPoint(input: BacktestEligibilityInput): string {
  if (
    input.profitFactor != null &&
    Number.isFinite(input.profitFactor) &&
    input.profitFactor >= VERDICT_THRESHOLDS.goodProfitFactor
  ) {
    return `손익비 ${input.profitFactor.toFixed(2)}`;
  }
  if (
    input.winRate != null &&
    Number.isFinite(input.winRate) &&
    input.winRate >= 0.55
  ) {
    return `승률 ${(input.winRate * 100).toFixed(1)}%`;
  }
  if (
    input.totalReturn != null &&
    Number.isFinite(input.totalReturn) &&
    input.totalReturn > 0
  ) {
    return `순수익률 ${(input.totalReturn * 100).toFixed(2)}%`;
  }
  return "뚜렷한 강점 지표 없음";
}

export function eligibilityBlocksPaperLive(
  result: BacktestEligibilityResult,
): boolean {
  return !result.eligible;
}

export function eligibilityInputFromReport(
  report: BacktestReport,
  status?: string | null,
): BacktestEligibilityInput {
  const gross = report.costs.grossPnLBeforeCosts;
  const totalCost = report.costs.totalCostUsdt;
  return {
    status: status ?? "completed",
    totalReturn: report.totalReturn,
    mdd: report.mdd,
    tradeCount: report.tradeCount,
    winRate: report.winRate,
    profitFactor: report.profitFactor,
    totalCostPctOfInitialCapital: report.costs.totalCostPctOfInitialCapital,
    totalCostPctOfGrossProfit:
      gross != null && Number.isFinite(gross) && gross > 0 && totalCost != null
        ? totalCost / gross
        : null,
    negativeMonths: report.negativeMonths,
    monthlyReturnCount: report.monthlyReturns?.length ?? 0,
    hasCostStress: Array.isArray(report.costStress)
      ? report.costStress.length > 0
      : null,
    slippageModelVersion: report.slippageModelVersion,
    costAssumptions: report.costAssumptions,
    primaryCostAssumptions: report.primaryCostAssumptions,
    costStress: report.costStress,
    grossPnLBeforeCosts: report.costs.grossPnLBeforeCosts,
    totalEconomicFrictionUsdt: report.costs.totalEconomicFrictionUsdt,
    totalDeductedCostUsdt: report.costs.totalDeductedCostUsdt,
  };
}

export const LEGACY_RESULT_VIEW_ALLOWED = true;
export const LEGACY_RESULT_COMPARE_ALLOWED = true;
export const LEGACY_RESULT_DEEP_LINK_ALLOWED = true;
export const LEGACY_NEW_PAPER_ADVANCEMENT_ALLOWED = false;
export const LEGACY_NEW_LIVE_ADVANCEMENT_ALLOWED = false;
export const ACTIVE_SESSION_POLICY = "untouched" as const;
