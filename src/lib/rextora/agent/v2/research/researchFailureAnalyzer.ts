import type { ResearchEvidence } from "./researchTypes";

export function analyzeResearchFailure(evidence: ResearchEvidence): {
  summaryKo: string;
  causes: string[];
  evidenceRefs: string[];
} {
  const causes = [...evidence.rejectionReasons];
  const metrics = evidence.metrics;
  if (metrics?.totalCost != null && metrics.totalReturn != null && metrics.totalCost > Math.abs(metrics.totalReturn)) {
    causes.push("저장된 비용이 순성과의 절대값보다 큽니다.");
  }
  if (metrics?.mdd != null && Math.abs(metrics.mdd) > 0.25) causes.push("저장된 최대 낙폭이 25%를 초과했습니다.");
  if (metrics?.tradeCount != null && metrics.tradeCount < 10) causes.push("거래 표본이 10회 미만입니다.");
  return {
    summaryKo: causes.length > 0 ? causes.join(" ") : "저장된 증거만으로 실패 원인을 특정할 수 없습니다.",
    causes,
    evidenceRefs: [evidence.evidenceId],
  };
}

