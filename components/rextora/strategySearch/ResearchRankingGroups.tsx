"use client";

import {
  GROUP_PATTERN,
  GROUP_PATTERN_CANONICAL,
  GROUP_SAFE,
  hasAuthoritativeRankingGroups,
  rankingGroupLabel,
  type ResearchRankingAuthoritySource,
  type ResearchRankingGroupView,
  type ResearchUnknownLegacyView,
} from "@/src/lib/rextora/researchRankingReadModel";
import { ResearchRankingGroupCard } from "./ResearchRankingGroupCard";

function asGroup(
  group: {
    rankingCompatibilityGroup?: string;
    engineCostModel?: string;
    rankingEligible?: boolean;
    bestCandidate?: ResearchRankingGroupView["bestCandidate"];
    bestPassedCandidate?: ResearchRankingGroupView["bestPassedCandidate"];
    topCandidates?: ResearchRankingGroupView["topCandidates"];
  } | null | undefined,
): ResearchRankingGroupView | null {
  if (
    !group ||
    (group.rankingCompatibilityGroup !== GROUP_SAFE &&
      group.rankingCompatibilityGroup !== GROUP_PATTERN_CANONICAL &&
      group.rankingCompatibilityGroup !== GROUP_PATTERN) ||
    group.rankingEligible !== true
  ) {
    return null;
  }
  return {
    rankingCompatibilityGroup: group.rankingCompatibilityGroup,
    engineCostModel:
      group.engineCostModel === GROUP_PATTERN_CANONICAL ||
      group.engineCostModel === GROUP_PATTERN ||
      group.engineCostModel === GROUP_SAFE
        ? group.engineCostModel
        : group.rankingCompatibilityGroup,
    rankingEligible: true,
    bestCandidate: group.bestCandidate ?? null,
    bestPassedCandidate: group.bestPassedCandidate ?? null,
    topCandidates: group.topCandidates ?? [],
  };
}

export function ResearchRankingGroups(props: {
  source: ResearchRankingAuthoritySource;
  unknownLegacy?: ResearchUnknownLegacyView | null;
}) {
  const authoritative = hasAuthoritativeRankingGroups(props.source);
  if (!authoritative) {
    return (
      <section
        className="min-w-0 rounded-xl border border-amber-500/30 bg-amber-500/5 p-4"
        data-testid="research-ranking-legacy-fallback"
      >
        <h3 className="text-sm font-semibold text-amber-100">기존 평가 형식</h3>
        <p className="mt-1 text-sm text-slate-300">
          이 기록은 그룹 순위 데이터가 없어 과거 호환 형식으로만 표시합니다.
          브라우저에서 SAFE/패턴 그룹을 새로 만들지 않습니다.
        </p>
        <p className="mt-2 text-xs text-slate-400">
          최고 점수 {props.source.bestScore ?? "없음"} · 후보{" "}
          {props.source.bestCandidateHash ?? "없음"}
        </p>
      </section>
    );
  }

  const groups = (props.source.rankingGroups ?? [])
    .map(asGroup)
    .filter((row): row is ResearchRankingGroupView => row != null);

  return (
    <section className="min-w-0 space-y-3" data-testid="research-ranking-groups">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {groups.map((group) => (
          <ResearchRankingGroupCard
            key={group.rankingCompatibilityGroup}
            group={group}
          />
        ))}
      </div>
      <p
        className="text-xs text-slate-500"
        data-testid="research-no-global-champion"
      >
        SAFE와 패턴 점수는 서로 비교하지 않습니다. 그룹을 한데 모아 순위를
        만들지 않습니다.
      </p>
      {props.unknownLegacy && props.unknownLegacy.count > 0 ? (
        <aside
          className="min-w-0 overflow-hidden rounded-xl border border-slate-700 p-4"
          data-testid="research-unknown-legacy"
        >
          <h3 className="text-sm font-semibold text-slate-200">
            {rankingGroupLabel("unknown_legacy")}
          </h3>
          <p className="mt-1 text-sm text-slate-400">
            평가 모델을 복원할 수 없는 기존 기록 {props.unknownLegacy.count}건.
            현재 순위에 포함되지 않으며 신규 승격 대상이 아닙니다.
          </p>
        </aside>
      ) : null}
    </section>
  );
}
