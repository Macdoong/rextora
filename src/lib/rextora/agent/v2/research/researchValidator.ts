import type { ResearchEvidence, ResearchRecommendation } from "./researchTypes";

export function validateResearchRecommendation(
  recommendation: ResearchRecommendation,
  evidence: ResearchEvidence[],
): { ok: boolean; issues: string[] } {
  const ids = new Set(evidence.map((item) => item.evidenceId));
  const issues: string[] = [];
  if (recommendation.evidenceRefs.some((ref) => !ids.has(ref))) issues.push("UNKNOWN_EVIDENCE_REFERENCE");
  if (recommendation.expectedReturn !== null) issues.push("EXPECTED_RETURN_NOT_ALLOWED");
  if (recommendation.kind === "backtest" && !recommendation.targetEvidenceId) issues.push("BACKTEST_TARGET_REQUIRED");
  if (recommendation.targetEvidenceId && !ids.has(recommendation.targetEvidenceId)) issues.push("UNKNOWN_TARGET_EVIDENCE");
  return { ok: issues.length === 0, issues };
}

