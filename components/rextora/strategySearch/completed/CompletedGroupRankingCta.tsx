"use client";

import { useState } from "react";
import type { CompletedDashboardViewModel } from "./completedViewModel";
import { ResearchRankingGroups } from "../ResearchRankingGroups";
import type { StrategySearchJobDetail } from "../types";

export function CompletedGroupRankingCta(props: {
  model: CompletedDashboardViewModel;
  job: StrategySearchJobDetail;
}) {
  const [open, setOpen] = useState(false);
  const summary = props.model.groupRankingSummary;
  if (!props.model.groupAware || !summary) return null;

  return (
    <section
      className="ss-completed-group-cta"
      data-testid="ss-completed-group-ranking-cta"
    >
      <div className="ss-completed-group-cta__card">
        <div className="ss-completed-group-cta__head">
          <span className="ss-completed-group-cta__icon" aria-hidden="true">
            ◫
          </span>
          <div>
            <h3 className="ss-completed-group-cta__title ss-completed-type-section">
              상세 분석 결과
            </h3>
            <p className="ss-completed-group-cta__copy ss-completed-type-helper">
              전략 유형별 후보와 추천 상태를 확인합니다.
            </p>
          </div>
        </div>
        <ul
          className="ss-completed-group-cta__stats"
          data-testid="ss-completed-detail-summary-stats"
        >
          <li>
            <strong className="ss-completed-type-metric">{summary.totalGroups}</strong>
            <span className="ss-completed-type-caption">순위 그룹</span>
          </li>
          <li>
            <strong className="ss-completed-type-metric">
              {summary.withRecommendation}
            </strong>
            <span className="ss-completed-type-caption">추천 가능</span>
          </li>
          <li>
            <strong className="ss-completed-type-metric">
              {summary.withoutRecommendation}
            </strong>
            <span className="ss-completed-type-caption">추천 없음</span>
          </li>
        </ul>
        <button
          type="button"
          className={
            "ss-completed-group-cta__button" +
            (open ? " ss-completed-group-cta__button--open" : "")
          }
          data-testid="ss-completed-group-ranking-open"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
        >
          <span>{open ? "그룹별 순위 접기" : "그룹별 순위 보기"}</span>
          <span
            className="ss-completed-group-cta__chevron"
            aria-hidden="true"
          />
        </button>
      </div>
      {open ? (
        <div
          className="ss-completed-group-cta__panel ss-completed-group-cta__panel--open"
          data-testid="ss-completed-ranking-disclosure"
        >
          <ResearchRankingGroups
            source={props.job}
            unknownLegacy={props.job.unknownLegacy}
            operatorFacing
            completedDashboardVariant
          />
        </div>
      ) : null}
    </section>
  );
}
