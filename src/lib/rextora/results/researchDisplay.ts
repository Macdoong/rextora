/**
 * Deterministic Research Results display helpers.
 * Does not alter ranking/eligibility gates — only clarifies presentation.
 */

import { SAMPLE_MIN_TRADES } from "../backtest/statusThresholds";

/** Overfitting trade-signal default (see overfittingEvidence.ts). */
export const SAMPLE_MEDIUM_MIN_TRADES = 10;

/** Eligibility gate default (see eligibility.ts). */
export const SAMPLE_ELIGIBILITY_MIN_TRADES = 5;

export type CostStatusKo =
  | "비용 계산 완료"
  | "비용 스트레스 통과"
  | "비용 검증 대기"
  | "비용 데이터 없음"
  | "비용 계산 불가";

export type SampleConfidenceKo = "표본 충분" | "표본 보통" | "표본 부족";

export type ReviewStageKo =
  | "기본 검토 가능"
  | "최종 추천 가능"
  | "추가 검증 필요";

export type StrategyRoleBadge =
  | "TOP 수익"
  | "TOP 안정"
  | "최종 추천"
  | "백테스트 추천";

/**
 * Stable short discriminator from params hash (not rank/index).
 * Format: letter A–Z + two digits, e.g. A17.
 */
export function buildDisplayDiscriminator(paramsHash: string): string {
  const clean = paramsHash.replace(/[^a-fA-F0-9]/g, "").toLowerCase();
  const hex = (clean + "0000").slice(0, 4);
  const n = Number.parseInt(hex, 16);
  if (!Number.isFinite(n)) return "Z00";
  const letter = String.fromCharCode(65 + (n % 26));
  const num = String(n % 100).padStart(2, "0");
  return `${letter}${num}`;
}

/**
 * Display alias: family · risk style · discriminator.
 * Canonical readableName stays unchanged.
 */
export function buildStrategyDisplayAlias(input: {
  readableName: string;
  paramsHash: string;
}): string {
  const base = input.readableName.trim() || "전략";
  return `${base} · ${buildDisplayDiscriminator(input.paramsHash)}`;
}

export function resolveCostStatus(input: {
  totalCost: number | null | undefined;
  stressPassed: boolean | null | undefined;
}): CostStatusKo {
  const cost = input.totalCost;
  if (cost != null && Number.isFinite(cost)) return "비용 계산 완료";
  if (cost != null && !Number.isFinite(cost)) return "비용 계산 불가";
  // Stress evidence is the recommendation cost gate; absolute totalCost may be absent.
  if (input.stressPassed === true) return "비용 스트레스 통과";
  if (input.stressPassed === false) return "비용 검증 대기";
  return "비용 데이터 없음";
}

/**
 * Sample confidence from verified thresholds:
 * - 충분: SAMPLE_MIN_TRADES (30)
 * - 보통: SAMPLE_MEDIUM_MIN_TRADES (10) inclusive below 30
 * - 부족: below 10 or missing
 */
export function resolveSampleConfidence(
  tradeCount: number | null | undefined,
): {
  level: SampleConfidenceKo;
  detailKo: string;
  minSufficient: number;
  minMedium: number;
} {
  const minSufficient = SAMPLE_MIN_TRADES;
  const minMedium = SAMPLE_MEDIUM_MIN_TRADES;
  if (tradeCount == null || !Number.isFinite(tradeCount)) {
    return {
      level: "표본 부족",
      detailKo: "거래 수 없음 · 추가 기간 백테스트 권장",
      minSufficient,
      minMedium,
    };
  }
  if (tradeCount >= minSufficient) {
    return {
      level: "표본 충분",
      detailKo: `거래 ${tradeCount}회 · 기준 ${minSufficient}회 이상`,
      minSufficient,
      minMedium,
    };
  }
  if (tradeCount >= minMedium) {
    return {
      level: "표본 보통",
      detailKo: `거래 ${tradeCount}회 · 충분 기준 ${minSufficient}회`,
      minSufficient,
      minMedium,
    };
  }
  return {
    level: "표본 부족",
    detailKo: `거래 ${tradeCount}회 · 추가 기간 백테스트 권장`,
    minSufficient,
    minMedium,
  };
}

/**
 * Clarify review stage labels without changing recommendable membership.
 * Eligible + full stability → 최종 추천 가능
 * Eligible but stress failed → 기본 검토 가능 (stability still shown separately)
 * Not eligible → 추가 검증 필요
 */
export function resolveReviewStage(input: {
  recommendable: boolean;
  stressPassed: boolean | null | undefined;
  jitterPassed: boolean | null | undefined;
}): ReviewStageKo {
  if (!input.recommendable) return "추가 검증 필요";
  if (input.stressPassed === false) return "기본 검토 가능";
  if (input.stressPassed === true) return "최종 추천 가능";
  // Stress unknown but still recommendable under current gate → basic review
  return "기본 검토 가능";
}

export const REVIEW_STAGE_TOOLTIP: Record<ReviewStageKo, string> = {
  "기본 검토 가능":
    "기본 수익·낙폭 조건을 통과했지만 안정성 검증이 추가로 필요할 수 있습니다.",
  "최종 추천 가능":
    "합격·비용 스트레스·과거 데이터 편중 증거를 충족한 후보입니다.",
  "추가 검증 필요":
    "최종 추천 자격이 부족합니다. 거래 안정성·표본·낙폭을 재확인하세요.",
};

export function strategyIdentityKey(input: {
  registeredStrategyId?: string | null;
  paramsHash: string;
  sourceResearchJobId: string;
  iteration: number;
}): string {
  if (input.registeredStrategyId) return `id:${input.registeredStrategyId}`;
  return `trial:${input.sourceResearchJobId}:${input.paramsHash}:${input.iteration}`;
}
