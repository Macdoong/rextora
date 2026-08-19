import type { ResearchEvidence, ResearchGap } from "./researchTypes";

export function analyzeResearchGaps(evidence: ResearchEvidence[]): ResearchGap[] {
  const gaps: ResearchGap[] = [];
  const completed = evidence.filter((item) => ["completed", "reviewed", "recommendable"].includes(item.status));
  if (completed.length === 0) {
    gaps.push({ code: "missing_completed_search", summaryKo: "완료된 탐색 증거가 없습니다.", evidenceRefs: [] });
    return gaps;
  }
  const metricRefs = completed.filter((item) => item.metrics).map((item) => item.evidenceId);
  if (metricRefs.length === 0) gaps.push({ code: "missing_metrics", summaryKo: "비교 가능한 저장 지표가 없습니다.", evidenceRefs: completed.map((item) => item.evidenceId) });
  const costMissing = completed.filter((item) => item.metrics?.totalCost == null);
  if (costMissing.length > 0) gaps.push({ code: "missing_cost", summaryKo: "일부 후보는 실제 비용 증거가 없어 수수료 원인을 확정할 수 없습니다.", evidenceRefs: costMissing.map((item) => item.evidenceId) });
  if (!evidence.some((item) => item.kind === "backtest")) gaps.push({ code: "missing_backtest", summaryKo: "저장된 백테스트로 교차 검증되지 않았습니다.", evidenceRefs: metricRefs });
  return gaps;
}

