"use client";

import { formatCount } from "../formatters";
import { displayJobRecentWorkPresentation } from "../jobDisplayName";
import type { StrategySearchJobSummary } from "../types";

export function GuidedSetupCompactContinuations(props: {
  recentCompletedJob: StrategySearchJobSummary | null;
  resumableCount: number;
  onViewRecentResult: () => void;
  onViewResumableList: () => void;
}) {
  const hasRecent = props.recentCompletedJob != null;
  const hasResumable = props.resumableCount > 0;
  if (!hasRecent && !hasResumable) return null;

  return (
    <aside
      className="ss-guided-compact-continuations"
      data-testid="ss-guided-compact-continuations"
      aria-label="최근 작업"
    >
      <h3 className="ss-guided-compact-continuations__title">최근 작업</h3>
      <ul className="ss-guided-compact-continuations__list">
        {hasRecent ? (
          <li data-testid="ss-guided-compact-recent-completed">
            <span className="ss-guided-compact-continuations__label">
              최근 완료 탐색 1건
            </span>
            {(() => {
              const recent = displayJobRecentWorkPresentation(
                props.recentCompletedJob!,
              );
              return (
                <span
                  className="ss-guided-compact-continuations__meta"
                  title={props.recentCompletedJob!.searchName?.trim() || props.recentCompletedJob!.id}
                  data-testid="ss-guided-compact-recent-title"
                >
                  <span className="ss-guided-compact-continuations__meta-primary">
                    {recent.primary}
                  </span>
                  {recent.metadata ? (
                    <span
                      className="ss-guided-compact-continuations__meta-structured"
                      data-testid="ss-guided-compact-recent-metadata"
                    >
                      {recent.metadata}
                    </span>
                  ) : null}
                </span>
              );
            })()}
            <button
              type="button"
              className="ss-guided-compact-continuations__action"
              data-testid="ss-guided-compact-view-recent-result"
              onClick={props.onViewRecentResult}
            >
              최근 결과 보기
            </button>
          </li>
        ) : null}
        {hasResumable ? (
          <li data-testid="ss-guided-compact-resumable">
            <span className="ss-guided-compact-continuations__label">
              재개 가능한 탐색 {formatCount(props.resumableCount)}건
            </span>
            <button
              type="button"
              className="ss-guided-compact-continuations__action"
              data-testid="ss-guided-compact-view-resumable-list"
              onClick={props.onViewResumableList}
            >
              재개 목록 보기
            </button>
          </li>
        ) : null}
      </ul>
    </aside>
  );
}
