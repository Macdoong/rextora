"use client";

import type { CompletedDashboardViewModel } from "./completedViewModel";
import {
  formatEvaluationRangeKo,
  formatTimeframeCustomerKo,
} from "./completedDisplayFormat";

export function CompletedAnalysisContextCard(props: {
  model: CompletedDashboardViewModel;
}) {
  const ctx = props.model.analysisContext;
  if (!ctx) return null;
  const range = formatEvaluationRangeKo(
    ctx.evaluationStartUtc,
    ctx.evaluationEndUtc,
  );
  const completionLabel =
    ctx.completionReasonLabelKo ??
    props.model.completionReasonLabel ??
    "—";

  return (
    <section
      className="ss-completed-analysis-context ss-completed-analysis-context--enter"
      data-testid="ss-completed-analysis-context"
      aria-label="분석 조건"
    >
      <h3 className="ss-completed-analysis-context__title">분석 조건</h3>
      <dl className="ss-completed-analysis-context__grid">
        <div>
          <dt>분석 대상</dt>
          <dd data-testid="ss-analysis-symbol">{ctx.symbol}</dd>
        </div>
        <div>
          <dt>시간봉</dt>
          <dd data-testid="ss-analysis-timeframe">
            {formatTimeframeCustomerKo(ctx.timeframe)}
          </dd>
        </div>
        <div>
          <dt>검증 기간</dt>
          <dd data-testid="ss-analysis-date-range">{range ?? "—"}</dd>
        </div>
        <div>
          <dt>탐색 방식</dt>
          <dd>{ctx.searchApproachKo ?? "—"}</dd>
        </div>
        <div>
          <dt>종료 이유</dt>
          <dd data-testid="ss-analysis-completion-reason">{completionLabel}</dd>
        </div>
      </dl>
    </section>
  );
}
