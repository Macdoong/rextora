"use client";

import type { StrategySearchJobDetail } from "./types";
import { CompletedDashboard } from "./completed/CompletedDashboard";

/**
 * Primary customer surface for a selected completed Strategy Search job.
 */
export function StrategySearchCompletedDashboard(props: {
  job: StrategySearchJobDetail;
  passCount: number;
  bestStrategyName?: string | null;
  bestStrategyId?: string | null;
  onNewSearch: () => void;
  onRegisterBest?: (() => void) | null;
  onPromoteTop?: (() => void) | null;
  onRegisterForBacktest?: ((iteration: number) => void) | null;
  registeringForBacktest?: boolean;
  onRetryWithSettings?: (() => void) | null;
}) {
  return (
    <div
      id="ss-completed-dashboard-anchor"
      className="ss-completed-dashboard"
      data-testid="ss-completed-dashboard"
    >
      <CompletedDashboard
        job={props.job}
        passCount={props.passCount}
        onNewSearch={props.onNewSearch}
        onRetryWithSettings={props.onRetryWithSettings}
        onRegisterBest={props.onRegisterBest}
        onPromoteTop={props.onPromoteTop}
      />
    </div>
  );
}
