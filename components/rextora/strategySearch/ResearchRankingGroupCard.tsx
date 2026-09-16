"use client";

import {
  GROUP_SAFE,
  groupLocalShortlistRanks,
  groupRecommendationLabel,
  groupShortlistTitle,
  isCanonicalGroupRecommendation,
  rankingGroupLabel,
  rankingGroupTechnicalId,
  topCandidatesForGroup,
  type ResearchRankingGroupView,
} from "@/src/lib/rextora/researchRankingReadModel";
import { ResearchEvaluationEvidence } from "./ResearchEvaluationEvidence";

function scoreText(score: number | null | undefined): string {
  return score != null && Number.isFinite(score) ? score.toFixed(3) : "없음";
}

export function ResearchRankingGroupCard(props: {
  group: ResearchRankingGroupView;
}) {
  const group = props.group;
  const champ = group.bestPassedCandidate;
  const recommendLabel = groupRecommendationLabel(group);
  const shortlist = topCandidatesForGroup(
    [group],
    group.rankingCompatibilityGroup,
  );
  return (
    <article
      className="min-w-0 rounded-xl border border-slate-700/80 bg-slate-950/40 p-4"
      data-testid={`research-ranking-group-${group.rankingCompatibilityGroup}`}
      data-ranking-group={group.rankingCompatibilityGroup}
    >
      <header className="space-y-1">
        <h3 className="text-sm font-semibold text-slate-100">
          {rankingGroupLabel(group.rankingCompatibilityGroup)}
        </h3>
        <p className="text-xs text-slate-500">
          {rankingGroupTechnicalId(group.engineCostModel)}
        </p>
        <p
          className="text-sm text-emerald-200"
          data-testid={`research-group-recommend-${group.rankingCompatibilityGroup}`}
        >
          {recommendLabel}
        </p>
      </header>
      <div className="mt-3 space-y-2 text-sm">
        <p>
          최종 추천{" "}
          {champ
            ? `${champ.paramsHash} · ${scoreText(champ.score)} · ${
                champ.passed ? "PASS" : "미통과"
              }`
            : "없음"}
        </p>
        <p>
          최고 점수 후보{" "}
          {group.bestCandidate
            ? `${group.bestCandidate.paramsHash} · ${scoreText(group.bestCandidate.score)}`
            : "없음"}
        </p>
      </div>
      <div
        className="mt-3 min-w-0"
        data-testid={`research-group-top-${group.rankingCompatibilityGroup}`}
      >
        <p className="text-xs font-medium text-slate-400">
          {groupShortlistTitle(group.rankingCompatibilityGroup)}
        </p>
        {shortlist.length === 0 ? (
          <p
            className="mt-1 text-xs text-slate-500"
            data-testid={`research-group-shortlist-empty-${group.rankingCompatibilityGroup}`}
          >
            숏리스트 없음
          </p>
        ) : (
          <ol className="mt-1 min-w-0 space-y-1 text-xs text-slate-300">
            {groupLocalShortlistRanks(shortlist).map(({ rank, candidate }) => (
              <li
                key={`${candidate.iteration}-${candidate.paramsHash}`}
                className="min-w-0 break-all"
                data-group-rank={rank}
                data-canonical-recommend={
                  isCanonicalGroupRecommendation(group, candidate.paramsHash)
                    ? "true"
                    : "false"
                }
              >
                {rank}. {candidate.paramsHash} · {scoreText(candidate.score)} ·{" "}
                {candidate.passed ? "PASS" : "FAIL"}
                {isCanonicalGroupRecommendation(group, candidate.paramsHash)
                  ? " · 최종 추천"
                  : ""}
              </li>
            ))}
          </ol>
        )}
      </div>
      <div className="mt-3">
        <ResearchEvaluationEvidence
          researchEvaluationHash={champ?.researchEvaluationHash}
          engineCostModel={group.engineCostModel}
          rankingCompatibilityGroup={group.rankingCompatibilityGroup}
          identityVersion="research_evaluation_identity_v1"
          provenanceStatus={champ?.provenanceStatus ?? null}
        />
      </div>
      <p className="mt-2 text-[11px] text-slate-500">
        {group.rankingCompatibilityGroup === GROUP_SAFE
          ? "SAFE 그룹 점수만 이 카드에서 비교합니다."
          : "패턴 그룹 점수만 이 카드에서 비교합니다."}
      </p>
    </article>
  );
}
