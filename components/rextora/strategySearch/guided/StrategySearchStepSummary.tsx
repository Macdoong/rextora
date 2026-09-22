"use client";

import type { StepCompactSummary } from "./strategySearchStepModel";

export function StrategySearchStepSummary(props: {
  summaries: StepCompactSummary[];
  currentStepId: string;
}) {
  const inactive = props.summaries.filter(
    (s) => s.stepId !== props.currentStepId && s.stepId !== "review",
  );
  if (inactive.length === 0) return null;
  return (
    <div className="ss-guided-summaries" data-testid="ss-guided-step-summaries">
      {inactive.map((s) => (
        <div key={s.stepId} className="ss-guided-summary-chip">
          <span className="ss-guided-summary-chip__title">{s.titleKo}</span>
          <span className="ss-guided-summary-chip__line">{s.lineKo}</span>
        </div>
      ))}
    </div>
  );
}
