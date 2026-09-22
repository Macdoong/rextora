"use client";

import { useState } from "react";
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
import { StrategyHelpTooltip } from "./visual/StrategyHelpTooltip";
import {
  formatRankingScore,
  isCompactNoRecommendGroup,
  noRecommendCompactReason,
  resolveRankingRecommendFlow,
} from "./rankingGroupCardVisual";

function passLabel(
  passed: boolean | undefined,
  operatorFacing: boolean,
): string {
  if (passed === true) return operatorFacing ? "통과" : "PASS";
  if (passed === false) return operatorFacing ? "미통과" : "FAIL";
  return "없음";
}

export function ResearchRankingGroupCard(props: {
  group: ResearchRankingGroupView;
  operatorFacing?: boolean;
}) {
  const group = props.group;
  const operatorFacing = props.operatorFacing === true;
  const champ = group.bestPassedCandidate;
  const best = group.bestCandidate;
  const recommendLabel = groupRecommendationLabel(group);
  const flow = resolveRankingRecommendFlow(group);
  const compactDefault = isCompactNoRecommendGroup(group);
  const [detailsOpen, setDetailsOpen] = useState(!compactDefault);
  const shortlist = topCandidatesForGroup(
    [group],
    group.rankingCompatibilityGroup,
  );
  const heading =
    operatorFacing && group.rankingCompatibilityGroup === GROUP_SAFE
      ? "통합 기술 전략"
      : rankingGroupLabel(group.rankingCompatibilityGroup);
  const intraGroupNote =
    group.rankingCompatibilityGroup === GROUP_SAFE
      ? operatorFacing
        ? "이 카드의 점수는 통합 기술 전략 안에서만 비교합니다."
        : "SAFE 그룹 점수만 이 카드에서 비교합니다."
      : "패턴 그룹 점수만 이 카드에서 비교합니다.";

  return (
    <article
      className={
        "ss-ranking-group-card min-w-0 rounded-xl border border-slate-700/80 bg-slate-950/40 p-4" +
        (compactDefault && !detailsOpen ? " ss-rank-compact" : "")
      }
      data-testid={`research-ranking-group-${group.rankingCompatibilityGroup}`}
      data-ranking-group={group.rankingCompatibilityGroup}
      data-has-recommend={champ ? "true" : "false"}
      data-recommend-flow={flow}
      data-compact={compactDefault && !detailsOpen ? "true" : "false"}
    >
      {compactDefault ? (
        <button
          type="button"
          className="ss-rank-compact__toggle"
          data-testid={`research-group-compact-${group.rankingCompatibilityGroup}`}
          aria-expanded={detailsOpen}
          onClick={() => setDetailsOpen((open) => !open)}
        >
          <span className="ss-rank-card__glyph" aria-hidden="true" data-group-glyph={group.rankingCompatibilityGroup} />
          <strong>{heading}</strong>
          <span
            className="ss-rank-status"
            data-testid={`research-group-recommend-${group.rankingCompatibilityGroup}`}
          >
            {recommendLabel}
          </span>
          <span className="ss-rank-compact__reason">{noRecommendCompactReason(flow)}</span>
          <span className="ss-rank-compact__affordance">
            {detailsOpen ? "접기 ▴" : "자세히 보기 ▾"}
          </span>
        </button>
      ) : (
      <header className="ss-rank-card__head">
        <span className="ss-rank-card__glyph" aria-hidden="true" data-group-glyph={group.rankingCompatibilityGroup} />
        <h3 className="text-sm font-semibold text-slate-100">{heading}</h3>
        {operatorFacing ? null : (
          <p className="text-xs text-slate-500">
            {rankingGroupTechnicalId(group.engineCostModel)}
          </p>
        )}
        <p
          className="ss-rank-status text-sm text-emerald-200"
          data-testid={`research-group-recommend-${group.rankingCompatibilityGroup}`}
        >
          {recommendLabel}
        </p>
      </header>
      )}

      {detailsOpen ? (
      <>
      <ol
        className="ss-rank-flow"
        data-testid={`research-group-flow-${group.rankingCompatibilityGroup}`}
        data-flow={flow}
      >
        {flow === "empty" ? (
          <li className="ss-rank-flow__empty" data-flow-step="empty">
            이 전략군에 표시할 후보가 없습니다.
          </li>
        ) : (
          <>
            <li className="ss-rank-flow__node" data-flow-step="raw-best">
              <span className="ss-rank-flow__label">최고 점수 후보</span>
              <strong className="ss-rank-flow__score">
                {formatRankingScore(best?.score)}
              </strong>
              <em
                className={
                  best?.passed
                    ? "ss-rank-pill ss-rank-pill--pass"
                    : "ss-rank-pill ss-rank-pill--fail"
                }
              >
                {best ? passLabel(best.passed, operatorFacing) : "없음"}
              </em>
            </li>
            <li
              className="ss-rank-flow__gate"
              data-flow-step="qualify"
              aria-hidden="true"
            >
              <span className="ss-rank-flow__line" />
              <span>
                {flow === "direct"
                  ? "자격 통과"
                  : flow === "none"
                    ? "자격 검증"
                    : "자격 검증"}
              </span>
            </li>
            <li className="ss-rank-flow__node" data-flow-step="recommend">
              <span className="ss-rank-flow__label">
                {champ ? "최종 추천" : "추천 없음"}
              </span>
              <strong className="ss-rank-flow__score">
                {formatRankingScore(champ?.score)}
              </strong>
              <em
                className={
                  champ
                    ? "ss-rank-pill ss-rank-pill--pass"
                    : "ss-rank-pill ss-rank-pill--none"
                }
              >
                {champ ? passLabel(champ.passed, operatorFacing) : "없음"}
              </em>
            </li>
          </>
        )}
      </ol>

      <div className="ss-rank-scores" data-score-scope="intra-group">
        <p
          data-testid={`research-group-final-recommend-score-${group.rankingCompatibilityGroup}`}
        >
          최종 추천{" "}
          {champ
            ? operatorFacing
              ? `${formatRankingScore(champ.score)} · ${
                  champ.passed ? "통과" : "미통과"
                }`
              : `${champ.paramsHash} · ${formatRankingScore(champ.score)} · ${
                  champ.passed ? "PASS" : "미통과"
                }`
            : "없음"}
        </p>
        <p
          data-testid={`research-group-best-score-${group.rankingCompatibilityGroup}`}
        >
          최고 점수 후보{" "}
          {best
            ? operatorFacing
              ? `${formatRankingScore(best.score)} · ${
                  best.passed ? "통과" : "미통과"
                }`
              : `${best.paramsHash} · ${formatRankingScore(best.score)}`
            : "없음"}
        </p>
      </div>

      <p className="ss-rank-card__note">
        {intraGroupNote}
        <StrategyHelpTooltip
          label="추천 규칙"
          content="최고 점수가 더 높아도 자격 미충족이면 추천되지 않습니다."
        />
      </p>

      <details
        className="ss-rank-details"
        data-testid={`research-group-top-${group.rankingCompatibilityGroup}`}
      >
        <summary>
          {operatorFacing && group.rankingCompatibilityGroup === GROUP_SAFE
            ? "추천 후보"
            : groupShortlistTitle(group.rankingCompatibilityGroup)}
        </summary>
        {shortlist.length === 0 ? (
          <p
            className="mt-1 text-xs text-slate-500"
            data-testid={`research-group-shortlist-empty-${group.rankingCompatibilityGroup}`}
          >
            숏리스트 없음
            {operatorFacing
              ? " · 이 화면은 그룹 대표만 표시합니다. 후보 목록은 결과에서 확인합니다."
              : ""}
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
                {rank}.{" "}
                {operatorFacing
                  ? `${formatRankingScore(candidate.score)} · ${
                      candidate.passed ? "통과" : "미통과"
                    }`
                  : `${candidate.paramsHash} · ${formatRankingScore(
                      candidate.score,
                    )} · ${candidate.passed ? "PASS" : "FAIL"}`}
                {isCanonicalGroupRecommendation(group, candidate.paramsHash)
                  ? " · 최종 추천"
                  : ""}
              </li>
            ))}
          </ol>
        )}
      </details>
      {operatorFacing ? null : (
        <div className="mt-3">
          <ResearchEvaluationEvidence
            researchEvaluationHash={champ?.researchEvaluationHash}
            engineCostModel={group.engineCostModel}
            rankingCompatibilityGroup={group.rankingCompatibilityGroup}
            identityVersion="research_evaluation_identity_v1"
            provenanceStatus={champ?.provenanceStatus ?? null}
          />
        </div>
      )}
      </>
      ) : null}
    </article>
  );
}
