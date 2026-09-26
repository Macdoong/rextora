"use client";

import type { CompletedDashboardViewModel } from "./completedViewModel";
import { CompletedEvaluationFunnel } from "./CompletedEvaluationFunnel";
import { CompletedPassFailDistribution } from "./CompletedPassFailDistribution";

export function CompletedSummaryRow(props: {
  model: CompletedDashboardViewModel;
}) {
  return (
    <div
      className="ss-completed-upper-summary ss-completed-upper-summary--enter"
      data-testid="ss-completed-upper-summary"
    >
      <CompletedPassFailDistribution model={props.model} />
      <CompletedEvaluationFunnel model={props.model} />
    </div>
  );
}
