"use client";

import { CompletedRecommendationCard } from "./CompletedRecommendationCard";
import { CompletedResearchConclusion } from "./CompletedResearchConclusion";
import type { CompletedDashboardViewModel } from "./completedViewModel";

export function CompletedRecommendationBriefingRow(props: {
  model: CompletedDashboardViewModel;
}) {
  return (
    <div
      className="ss-completed-rec-briefing-row ss-completed-rec-briefing-row--enter"
      data-testid="ss-completed-rec-briefing-row"
    >
      <CompletedRecommendationCard recommendation={props.model.recommendation} />
      <CompletedResearchConclusion model={props.model} />
    </div>
  );
}
