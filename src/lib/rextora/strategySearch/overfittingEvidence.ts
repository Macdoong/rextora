/**
 * Evidence-based overfitting risk levels for Research / Results.
 * Never fabricates a probability percentage.
 */

export type OverfittingRiskLevel = "low" | "medium" | "high" | "unavailable";

export interface OverfittingEvidence {
  overfittingRisk: OverfittingRiskLevel;
  riskLevelKo: string;
  evidence: string[];
  reasons: string[];
  recommendedNextTest: string;
}

function levelKo(level: OverfittingRiskLevel): string {
  switch (level) {
    case "low":
      return "낮음";
    case "medium":
      return "보통";
    case "high":
      return "높음";
    default:
      return "계산 불가";
  }
}

export interface OverfittingEvidenceInput {
  /** Jitter / parameter stability check ran and passed. */
  jitterPassed?: boolean | null;
  jitterEnabled?: boolean | null;
  /** Cost stress scenarios evaluated. */
  stressPassed?: boolean | null;
  stressEnabled?: boolean | null;
  /** Trade sample adequacy. */
  tradeCount?: number | null;
  minTradeCount?: number | null;
  /** Monthly concentration flags from weakness analysis. */
  monthlyConcentration?: boolean | null;
  /** Regime / period sensitivity flags. */
  periodSensitive?: boolean | null;
  /** Explicit weakness categories already computed. */
  weaknessCategories?: string[] | null;
}

/**
 * Derive overfitting risk from verified evaluation signals only.
 * Missing signals → unavailable (not a fabricated low risk).
 */
export function evaluateOverfittingEvidence(
  input: OverfittingEvidenceInput,
): OverfittingEvidence {
  const evidence: string[] = [];
  const reasons: string[] = [];
  const weaknesses = input.weaknessCategories ?? [];

  const hasJitterSignal =
    input.jitterEnabled === true && input.jitterPassed != null;
  const hasStressSignal =
    input.stressEnabled === true && input.stressPassed != null;
  const hasTradeSignal =
    input.tradeCount != null && Number.isFinite(input.tradeCount);

  if (!hasJitterSignal && !hasStressSignal && weaknesses.length === 0) {
    return {
      overfittingRisk: "unavailable",
      riskLevelKo: levelKo("unavailable"),
      evidence: [],
      reasons: ["강건성·지터·스트레스 증거가 부족합니다."],
      recommendedNextTest: "다른 기간으로 백테스트를 실행하세요.",
    };
  }

  let score = 0;
  if (hasJitterSignal) {
    evidence.push(
      input.jitterPassed
        ? "파라미터 지터 검증 통과"
        : "파라미터 지터 검증 실패",
    );
    if (!input.jitterPassed) {
      score += 2;
      reasons.push("파라미터 구간에 성과가 민감합니다.");
    }
  }
  if (hasStressSignal) {
    evidence.push(
      input.stressPassed ? "비용 스트레스 통과" : "비용 스트레스 실패",
    );
    if (!input.stressPassed) {
      score += 1;
      reasons.push("수수료·슬리피지 스트레스에 취약합니다.");
    }
  }
  if (hasTradeSignal) {
    const min = input.minTradeCount ?? 10;
    evidence.push(`거래 수 ${input.tradeCount}회 (기준 ${min})`);
    if ((input.tradeCount as number) < min) {
      score += 1;
      reasons.push("거래 표본이 부족합니다.");
    }
  }
  if (input.monthlyConcentration || weaknesses.includes("monthly_concentration")) {
    score += 2;
    reasons.push("특정 월에 수익이 집중됐습니다.");
    evidence.push("월별 수익 집중");
  }
  if (input.periodSensitive || weaknesses.includes("period_sensitive")) {
    score += 1;
    reasons.push("기간 변경에 성과가 민감할 수 있습니다.");
    evidence.push("기간 민감도 신호");
  }
  if (weaknesses.includes("unstable_parameters") || weaknesses.includes("jitter_failed")) {
    score += 2;
    reasons.push("불안정한 파라미터 신호가 있습니다.");
  }

  const level: OverfittingRiskLevel =
    score >= 3 ? "high" : score >= 1 ? "medium" : "low";

  return {
    overfittingRisk: level,
    riskLevelKo: levelKo(level),
    evidence,
    reasons:
      reasons.length > 0
        ? reasons
        : ["현재 증거 범위에서 뚜렷한 과적합 신호는 없습니다."],
    recommendedNextTest:
      level === "high"
        ? "다른 기간으로 백테스트가 필요합니다."
        : level === "medium"
          ? "추가 기간·비용 스트레스 백테스트를 권장합니다."
          : "모의매매 전 별도 기간 백테스트로 재확인하세요.",
  };
}

/** Final recommendation requires a computed (non-unavailable) overfitting assessment. */
export function hasRequiredRobustnessEvidence(input: {
  overfitting: OverfittingEvidence;
  requireJitterOrStress?: boolean;
}): boolean {
  if (input.overfitting.overfittingRisk === "unavailable") return false;
  if (input.overfitting.overfittingRisk === "high") return false;
  return true;
}
