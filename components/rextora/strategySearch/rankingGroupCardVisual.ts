/**
 * Presentation-only ranking-card visuals.
 * Does not rank, score, or change CHAMP-A selection.
 */

export type RankingRecommendFlow = "empty" | "none" | "direct" | "filtered";

export type RankingFlowCandidate = {
  paramsHash?: string | null;
  score?: number | null;
  passed?: boolean;
} | null | undefined;

export function sameRankingCandidate(
  left: RankingFlowCandidate,
  right: RankingFlowCandidate,
): boolean {
  if (!left || !right) return false;
  if (left === right) return true;
  return Boolean(left.paramsHash) && left.paramsHash === right.paramsHash;
}

export function resolveRankingRecommendFlow(group: {
  bestCandidate?: RankingFlowCandidate;
  bestPassedCandidate?: RankingFlowCandidate;
}): RankingRecommendFlow {
  const best = group.bestCandidate ?? null;
  const champ = group.bestPassedCandidate ?? null;
  if (!best && !champ) return "empty";
  if (!champ) return "none";
  if (best && sameRankingCandidate(best, champ)) return "direct";
  if (best && champ) return "filtered";
  return "direct";
}

export function rankingGroupSummaryCounts(
  groups: ReadonlyArray<{ bestPassedCandidate?: unknown | null }>,
): {
  groupCount: number;
  recommendableCount: number;
  noneCount: number;
} {
  const groupCount = groups.length;
  const recommendableCount = groups.filter(
    (group) => group.bestPassedCandidate != null,
  ).length;
  return {
    groupCount,
    recommendableCount,
    noneCount: groupCount - recommendableCount,
  };
}

export function isCompactNoRecommendGroup(group: {
  bestPassedCandidate?: unknown | null;
}): boolean {
  return group.bestPassedCandidate == null;
}

export function noRecommendCompactReason(flow: RankingRecommendFlow): string {
  if (flow === "empty") return "이 전략군에 표시할 후보가 없습니다.";
  return "자격 기준을 통과한 후보가 없습니다.";
}

export function formatRankingScore(score: number | null | undefined): string {
  return score != null && Number.isFinite(score) ? score.toFixed(3) : "없음";
}
