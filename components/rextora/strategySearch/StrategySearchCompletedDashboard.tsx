"use client";

import type { StrategySearchJobDetail, StrategySearchTrialsPage } from "./types";
import { CompletedDashboard } from "./completed/CompletedDashboard";

/**
 * Primary customer surface for a selected completed Strategy Search job.
 */
export function StrategySearchCompletedDashboard(props: {
  job: StrategySearchJobDetail;
  payloadReady: boolean;
  trials: StrategySearchTrialsPage | null;
  onNewSearch: () => void;
  onRegisterBest?: (() => void) | null;
  onPromoteTop?: (() => void) | null;
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
        payloadReady={props.payloadReady}
        trials={props.trials}
        onNewSearch={props.onNewSearch}
        onRetryWithSettings={props.onRetryWithSettings}
        onRegisterBest={props.onRegisterBest}
        onPromoteTop={props.onPromoteTop}
      />
    </div>
  );
}
