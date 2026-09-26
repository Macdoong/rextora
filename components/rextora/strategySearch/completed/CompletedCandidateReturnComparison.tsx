"use client";

import { formatPct } from "../formatters";
import type { CompletedDashboardViewModel } from "./completedViewModel";
import { useCompletedMotion } from "./useCompletedMotion";

function formatSignedReturn(value: number | null): string {
  if (value == null || !Number.isFinite(value)) return "—";
  const pct = formatPct(value);
  if (!pct) return "—";
  return value > 0 ? `+${pct}` : pct;
}

export function CompletedCandidateReturnComparison(props: {
  model: CompletedDashboardViewModel;
}) {
  const animate = useCompletedMotion();
  const candidates = props.model.compareCandidates.filter(
    (c) => c.netReturn != null,
  );
  if (candidates.length === 0) return null;

  const maxAbs = Math.max(
    ...candidates.map((c) => Math.abs(c.netReturn ?? 0)),
    0.01,
  );

  return (
    <section
      className="ss-completed-return-rank ss-completed-return-rank--enter"
      data-testid="ss-completed-return-comparison"
      aria-label="상위 후보 수익률 비교"
    >
      <h3 className="ss-completed-return-rank__title">상위 후보 수익률 비교</h3>
      <p className="ss-completed-return-rank__scope">
        동일 순위 그룹 내 후보만 비교합니다.
      </p>
      <p className="ss-completed-return-rank__disclaimer">
        수익률만으로 추천을 결정하지 않습니다. 낙폭·거래수·검증 결과를 함께
        평가합니다.
      </p>
      <ol className="ss-completed-return-rank__list" data-testid="ss-completed-return-bars">
        {candidates.map((row, index) => {
          const ret = row.netReturn ?? 0;
          const width = `${Math.min(100, (Math.abs(ret) / maxAbs) * 100)}%`;
          const negative = ret < 0;
          return (
            <li
              key={row.id}
              className="ss-completed-return-rank__row"
              data-testid={`ss-completed-return-row-${row.rank}`}
              data-net-return={row.netReturn ?? undefined}
              style={{ animationDelay: `${index * 80}ms` }}
            >
              <div className="ss-completed-return-rank__meta">
                <span className="ss-completed-return-rank__rank">{row.rank}</span>
                <span className="ss-completed-return-rank__label">{row.label}</span>
                <span className="ss-completed-return-rank__value">
                  {formatSignedReturn(row.netReturn)}
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
              <div className="ss-completed-return-rank__track">
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
