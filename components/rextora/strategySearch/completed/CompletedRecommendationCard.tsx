"use client";

import type { CompletedDashboardViewModel } from "./completedViewModel";
import { formatRecommendationCustomerName } from "./completedDisplayFormat";
import { CompletedRecommendationVisuals } from "./CompletedRecommendationVisuals";

export function CompletedRecommendationCard(props: {
  model: CompletedDashboardViewModel;
}) {
  const r = props.model.recommendation;
  if (!r) {
    return (
      <section
        className="ss-completed-recommend ss-completed-recommend--empty"
        data-testid="ss-completed-recommendation-empty"
      >
        <h3 className="ss-completed-recommend__title">최종 추천 전략</h3>
        <p className="ss-completed-recommend__empty-copy">
          검증 조건을 통과한 추천 후보가 없습니다. 목표 조건을 조정하거나 탐색
          범위를 넓혀 다시 시도할 수 있습니다.
        </p>
      </section>
    );
  }

  return (
    <section
      className="ss-completed-recommend ss-completed-recommend--enter"
      data-testid="ss-completed-recommendation"
    >
      <div className="ss-completed-recommend__head">
        <h3 className="ss-completed-recommend__title ss-completed-type-section">최종 추천 전략</h3>
        <p className="ss-completed-recommend__hint ss-completed-type-helper">
          검증 조건을 통과한 후보 중 현재 추천 결과입니다.
        </p>
      </div>
      <p
        className="ss-completed-recommend__name ss-completed-type-major"
        data-testid="ss-completed-recommendation-name"
      >
        {formatRecommendationCustomerName({
          readableName: r.readableName,
          symbol: props.model.symbol,
          timeframe: props.model.timeframe,
        })}
      </p>
      <CompletedRecommendationVisuals
        recommendation={r}
        dataStable={props.model.dataStable}
        minScoreEnabled={props.model.minScoreEnabled}
      />
    </section>
  );
}
