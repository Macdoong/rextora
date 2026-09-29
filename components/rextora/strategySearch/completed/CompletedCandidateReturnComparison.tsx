"use client";

import type { CompletedDashboardViewModel } from "./completedViewModel";
import {
  formatCompositeScore,
  formatSignedReturnPct,
} from "./completedDisplayFormat";
import { formatMddAbsPct } from "../formatters";
import { useCompletedMotion } from "./useCompletedMotion";

export function CompletedCandidateReturnComparison(props: {
  model: CompletedDashboardViewModel;
}) {
  const animate = useCompletedMotion() && props.model.dataStable;
  const candidates = props.model.compareCandidates.filter(
    (c) => c.netReturn != null,
  );
  if (candidates.length === 0) return null;

  const maxAbs = Math.max(
    ...candidates.map((c) => Math.abs(c.netReturn ?? 0)),
    0.01,
  );
  const commonContext = props.model.compareCommonStrategyContext;

  return (
    <section
      className="ss-completed-return-rank ss-completed-return-rank--enter"
      data-testid="ss-completed-return-comparison"
      aria-label="상위 후보 종합 비교"
    >
      <h3 className="ss-completed-return-rank__title">상위 후보 종합 비교</h3>
      <p className="ss-completed-return-rank__disclaimer">
        후보 순위는 수익률만이 아니라 낙폭·거래수·검증 결과·종합 평가를 함께
        반영합니다.
      </p>
      {commonContext ? (
        <div
          className="ss-completed-return-rank__common"
          data-testid="ss-completed-compare-common-context"
        >
          <span className="ss-completed-return-rank__common-label">공통 전략</span>
          <p>{commonContext}</p>
        </div>
      ) : (
        <p className="ss-completed-return-rank__scope">
          동일 순위 그룹 내 후보만 비교합니다.
        </p>
      )}
      <ol className="ss-completed-return-rank__list" data-testid="ss-completed-return-bars">
        {candidates.map((row, index) => {
          const ret = row.netReturn ?? 0;
          const width = `${Math.min(100, (Math.abs(ret) / maxAbs) * 100)}%`;
          const negative = ret < 0;
          return (
            <li
              key={row.id}
              className="ss-completed-return-rank__row ss-completed-return-rank__row--v2"
              data-testid={`ss-completed-return-row-${row.rank}`}
              data-net-return={row.netReturn ?? undefined}
              style={{ animationDelay: `${index * 70}ms` }}
            >
              <div className="ss-completed-return-rank__row-head">
                <span className="ss-completed-return-rank__rank">{row.rank}</span>
                <span className="ss-completed-return-rank__label">
                  {row.displayPrimary}
                </span>
                {row.isRecommended ? (
                  <span
                    className="ss-completed-return-rank__badge"
                    data-testid="ss-completed-return-recommend-badge"
                  >
                    추천
                  </span>
                ) : null}
              </div>
              <dl className="ss-completed-return-rank__metric-grid">
                <div>
                  <dt>수익률</dt>
                  <dd>{formatSignedReturnPct(row.netReturn)}</dd>
                </div>
                <div>
                  <dt>최대 낙폭</dt>
                  <dd>
                    {row.maxDrawdown != null
                      ? formatMddAbsPct(row.maxDrawdown)
                      : "—"}
                  </dd>
                </div>
                <div>
                  <dt>거래수</dt>
                  <dd>{row.tradeCount ?? "—"}회</dd>
                </div>
                <div>
                  <dt>종합 평가</dt>
                  <dd>{formatCompositeScore(row.score)}</dd>
                </div>
              </dl>
              <div
                className="ss-completed-return-rank__track"
                aria-hidden="true"
                data-testid="ss-completed-return-bar"
              >
                <div
                  className={
                    "ss-completed-return-rank__fill" +
                    (negative ? " ss-completed-return-rank__fill--neg" : "") +
                    (animate ? " ss-completed-return-rank__fill--animate" : "")
                  }
                  style={
                    {
                      width: animate ? undefined : width,
                      ["--ss-bar-target" as string]: width,
                    } as React.CSSProperties
                  }
                  data-bar-width={width}
                />
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
