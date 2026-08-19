import type { ResearchEvidence } from "./researchTypes";

export function compareResearchEvidence(left: ResearchEvidence, right: ResearchEvidence): {
  preferredEvidenceId: string | null;
  summaryKo: string;
  evidenceRefs: string[];
} {
  if (!left.metrics || !right.metrics) return { preferredEvidenceId: null, summaryKo: "두 대상 모두 검증된 지표가 있어야 우선순위를 정할 수 있습니다.", evidenceRefs: [left.evidenceId, right.evidenceId] };
  const complete = (item: ResearchEvidence) => item.metrics?.totalReturn != null && item.metrics?.mdd != null && item.metrics?.tradeCount != null;
  if (!complete(left) || !complete(right)) return { preferredEvidenceId: null, summaryKo: "수익·낙폭·거래 수 증거가 모두 있어야 순위를 정할 수 있습니다.", evidenceRefs: [left.evidenceId, right.evidenceId] };
  const leftScore = left.metrics.totalReturn! - Math.abs(left.metrics.mdd!);
  const rightScore = right.metrics.totalReturn! - Math.abs(right.metrics.mdd!);
  const preferred = leftScore === rightScore ? null : leftScore > rightScore ? left.evidenceId : right.evidenceId;
  return {
    preferredEvidenceId: preferred,
    summaryKo: preferred ? "저장된 수익과 낙폭을 함께 비교해 우선 검증 대상을 선택했습니다." : "저장된 핵심 지표가 같아 우선순위를 정하지 않았습니다.",
    evidenceRefs: [left.evidenceId, right.evidenceId],
  };
}

