"use client";

import { Skeleton } from "@/components/ui/primitives";
import type { PrimaryAction, ResearchJob } from "./dashboardData";
import {
  dashboardResearchBriefingSituation,
  type DashboardResearchSelection,
} from "./dashboardResearchSelection";

export function DashboardExecutiveBriefing({
  initialLoading,
  primaryAction,
  researchSelection,
  generationHint,
}: {
  initialLoading: boolean;
  primaryAction: PrimaryAction;
  researchSelection: DashboardResearchSelection<ResearchJob>;
  generationHint: string | null;
}) {
  if (initialLoading) {
    return (
      <section
        className="rextora-dashboard-briefing"
        data-testid="dashboard-executive-briefing"
        aria-label="AI 운영 브리핑"
      >
        <Skeleton className="h-28" />
      </section>
    );
  }

  const situation = dashboardResearchBriefingSituation(researchSelection);

  return (
    <section
      className="rextora-dashboard-briefing"
      data-testid="dashboard-executive-briefing"
      aria-label="AI 운영 브리핑"
    >
      <p className="rextora-dashboard-kicker">운영 브리핑</p>
      <dl className="rextora-dashboard-briefing-grid">
        <div>
          <dt>현재 상황</dt>
          <dd>{situation}</dd>
        </div>
        <div>
          <dt>주요 이슈</dt>
          <dd>{generationHint ?? "현재 차단 이슈 없음"}</dd>
        </div>
        <div>
          <dt>권장 행동</dt>
          <dd className="rextora-dashboard-briefing-action">{primaryAction.label}</dd>
        </div>
      </dl>
    </section>
  );
}
