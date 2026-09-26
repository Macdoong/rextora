"use client";

import { formatPct } from "../formatters";
import type { CompletedRecommendationView } from "./completedViewModel";

export function CompletedRecommendationCard(props: {
  recommendation: CompletedRecommendationView | null;
}) {
  if (!props.recommendation) {
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

  const r = props.recommendation;
  return (
    <section
      className="ss-completed-recommend ss-completed-recommend--enter"
      data-testid="ss-completed-recommendation"
    >
      <div className="ss-completed-recommend__head">
        <h3 className="ss-completed-recommend__title">최종 추천 전략</h3>
        <p className="ss-completed-recommend__hint">
          검증 조건을 통과한 후보 중 현재 추천 결과입니다.
        </p>
      </div>
      <p className="ss-completed-recommend__name">{r.readableName}</p>
      {r.strategyFamily ? (
        <p className="ss-completed-recommend__family">{r.strategyFamily}</p>
      ) : null}
      <dl className="ss-completed-recommend__metrics">
        <div>
          <dt>수익률</dt>
          <dd data-testid="ss-completed-rec-return">
            {r.netReturn != null ? formatPct(r.netReturn) : "—"}
          </dd>
        </div>
        <div>
          <dt>최대 낙폭</dt>
          <dd data-testid="ss-completed-rec-mdd">
            {r.maxDrawdown != null ? formatPct(r.maxDrawdown) : "—"}
          </dd>
        </div>
        <div>
          <dt>거래수</dt>
          <dd>{r.tradeCount ?? "—"}</dd>
        </div>
        <div>
          <dt>승률</dt>
          <dd>{r.winRate != null ? formatPct(r.winRate) : "—"}</dd>
        </div>
        <div>
          <dt>점수</dt>
          <dd>{r.score != null ? r.score.toFixed(3) : "—"}</dd>
        </div>
      </dl>
    </section>
  );
}
