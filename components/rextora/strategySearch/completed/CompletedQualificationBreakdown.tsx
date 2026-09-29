"use client";

import type { CompletedDashboardViewModel } from "./completedViewModel";

export function CompletedQualificationBreakdown(props: {
  model: CompletedDashboardViewModel;
}) {
  const rows = props.model.qualificationCriteria;
  if (rows.length === 0) return null;

  return (
    <section
      className="ss-completed-qual-breakdown"
      data-testid="ss-completed-qual-breakdown"
      aria-label="검증 기준 충족 내역"
    >
      <h4 className="ss-completed-qual-breakdown__title">왜 이 후보가 통과했나요?</h4>
      <ul className="ss-completed-qual-breakdown__list">
        {rows.map((row) => (
          <li
            key={row.id}
            data-testid={`ss-qual-criterion-${row.id}`}
            data-met={row.met ? "true" : "false"}
          >
            <strong>{row.label}</strong>
            <span>{row.thresholdLabel}</span>
            <span>{row.resultLabel}</span>
            <span className="ss-completed-qual-breakdown__status">
              {row.met ? "기준 충족 ✓" : "미충족"}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
