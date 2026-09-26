"use client";

import type { CompletedDashboardViewModel } from "./completedViewModel";

const STAGES: Array<{
  key: keyof CompletedDashboardViewModel["funnel"];
  label: string;
  testId: string;
}> = [
  { key: "generated", label: "생성", testId: "ss-funnel-generated" },
  { key: "evaluated", label: "평가", testId: "ss-funnel-evaluated" },
  { key: "passed", label: "통과", testId: "ss-funnel-passed" },
  { key: "qualified", label: "최종 적격", testId: "ss-funnel-qualified" },
];

export function CompletedEvaluationFunnel(props: {
  model: CompletedDashboardViewModel;
}) {
  const max = Math.max(
    ...STAGES.map((s) => props.model.funnel[s.key] ?? 0),
    1,
  );

  return (
    <section
      className="ss-completed-funnel-panel ss-completed-funnel-panel--enter"
      aria-label="탐색 퍼널"
    >
      <h3 className="ss-completed-funnel-panel__title">탐색 퍼널</h3>
      <ol className="ss-completed-funnel-v2" data-testid="ss-completed-funnel">
        {STAGES.map((stage, index) => {
          const value = props.model.funnel[stage.key];
          const width =
            value != null && max > 0
              ? `${Math.max(8, (Number(value) / max) * 100)}%`
              : "8%";
          return (
            <li
              key={stage.key}
              className="ss-completed-funnel-v2__step"
              data-testid={stage.testId}
              style={{ animationDelay: `${index * 70}ms` }}
            >
              <div className="ss-completed-funnel-v2__head">
                <span>{stage.label}</span>
                <strong>{value ?? "—"}</strong>
              </div>
              <div className="ss-completed-funnel-v2__track">
                <div
                  className="ss-completed-funnel-v2__fill"
                  style={{ width }}
                />
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
