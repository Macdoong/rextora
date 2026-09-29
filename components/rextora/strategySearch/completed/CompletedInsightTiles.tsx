"use client";

import type { CompletedDashboardViewModel } from "./completedViewModel";
import { formatMddAbsPct } from "../formatters";
import { formatSignedReturnPct } from "./completedDisplayFormat";
import { usePresentationEnter } from "./usePresentationEnter";

export function CompletedInsightTiles(props: {
  model: CompletedDashboardViewModel;
}) {
  const entered = usePresentationEnter(900, props.model.dataStable);
  const r = props.model.recommendation;

  return (
    <section
      className={
        "ss-completed-insight-tiles ss-completed-insight-tiles--bright" +
        (entered ? " ss-completed-insight-tiles--entered" : "")
      }
      data-testid="ss-completed-ai-briefing"
      aria-label="AI 연구원 인사이트"
    >
      <header className="ss-completed-insight-tiles__head">
        <span className="ss-completed-insight-tiles__head-icon" aria-hidden="true">
          ◈
        </span>
        <h3 className="ss-completed-type-section">AI 연구원 인사이트</h3>
      </header>
      <div className="ss-completed-insight-tiles__grid">
        {r ? (
          <>
            <article
              className="ss-completed-insight-tiles__tile ss-completed-insight-tiles__tile--reason"
              data-testid="ss-insight-reason"
            >
              <span className="ss-completed-insight-tiles__accent" aria-hidden="true" />
              <h4 className="ss-completed-type-card-title">추천 이유</h4>
              <p className="ss-completed-type-body">✓ 검증 기준 통과</p>
              <p className="ss-completed-type-body">✓ 최종 추천 후보</p>
            </article>
            <article
              className="ss-completed-insight-tiles__tile ss-completed-insight-tiles__tile--perf"
              data-testid="ss-insight-performance"
            >
              <span className="ss-completed-insight-tiles__accent" aria-hidden="true" />
              <h4 className="ss-completed-type-card-title">성과</h4>
              <p className="ss-completed-type-metric" data-testid="ss-briefing-chip-return">
                {formatSignedReturnPct(r.netReturn)}
              </p>
            </article>
            <article
              className="ss-completed-insight-tiles__tile ss-completed-insight-tiles__tile--risk"
              data-testid="ss-insight-risk"
            >
              <span className="ss-completed-insight-tiles__accent" aria-hidden="true" />
              <h4 className="ss-completed-type-card-title">핵심 위험</h4>
              <p className="ss-completed-type-body">
                최대 낙폭{" "}
                {r.maxDrawdown != null ? formatMddAbsPct(r.maxDrawdown) : "—"}
              </p>
            </article>
            <article
              className="ss-completed-insight-tiles__tile ss-completed-insight-tiles__tile--caution"
              data-testid="ss-insight-caution"
            >
              <span className="ss-completed-insight-tiles__accent" aria-hidden="true" />
              <h4 className="ss-completed-type-card-title">주의</h4>
              <p className="ss-completed-type-body">과거 검증 결과</p>
              <p className="ss-completed-type-body">미래 성과 보장 아님</p>
            </article>
          </>
        ) : (
          <article className="ss-completed-insight-tiles__tile ss-completed-insight-tiles__tile--empty">
            <p className="ss-completed-type-body">추천 후보가 없어 인사이트가 제한적입니다.</p>
          </article>
        )}
      </div>
    </section>
  );
}
