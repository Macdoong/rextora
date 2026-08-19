import { analyzeResearchGaps } from "./researchGapAnalyzer";
import type { ResearchEvidence, ResearchRecommendation } from "./researchTypes";

export function recommendNextResearch(evidence: ResearchEvidence[]): ResearchRecommendation {
  const gaps = analyzeResearchGaps(evidence);
  if (gaps.some((gap) => gap.code === "missing_completed_search")) return { kind: "search", summaryKo: "완료된 탐색 증거를 먼저 만들어야 합니다.", evidenceRefs: [], targetEvidenceId: null, expectedReturn: null };
  const candidate = evidence.find((item) => item.kind === "top_result" && item.status === "recommendable" && item.metrics);
  if (candidate && gaps.some((gap) => gap.code === "missing_backtest")) return { kind: "backtest", summaryKo: "추천 자격을 충족한 실제 탐색 결과를 저장 백테스트로 교차 검증하세요.", evidenceRefs: [candidate.evidenceId], targetEvidenceId: candidate.evidenceId, expectedReturn: null };
  return { kind: "insufficient_evidence", summaryKo: "현재 증거만으로 새 실행을 권장하지 않습니다. 누락된 증거를 먼저 확인하세요.", evidenceRefs: gaps.flatMap((gap) => gap.evidenceRefs), targetEvidenceId: null, expectedReturn: null };
}

