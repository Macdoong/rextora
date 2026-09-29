"use client";

import type { CompletedDashboardViewModel } from "./completedViewModel";
import { CompletedFilterDonutFlow } from "./CompletedFilterDonutFlow";

export function CompletedSummaryRow(props: {
  model: CompletedDashboardViewModel;
}) {
  return (
    <div
      className="ss-completed-upper-summary ss-completed-upper-summary--enter"
      data-testid="ss-completed-upper-summary"
    >
      <CompletedFilterDonutFlow model={props.model} />
    </div>
  );
}
