import Link from "next/link";
import { Skeleton } from "@/components/ui/primitives";
import type { DashStatus, ResearchJob } from "./dashboardData";
import {
  dashboardResearchLifecycleHref,
  dashboardResearchLifecycleLabel,
  type DashboardResearchSelection,
} from "./dashboardResearchSelection";
import { buildOperatorPipeline } from "@/src/lib/rextora/ui/operatorPipeline";

export function DashboardLifecycleOverview({
  initialLoading,
  researchSelection,
  completedRecent,
  paperName,
  paperSessionStatus,
  status,
}: {
  initialLoading: boolean;
  researchSelection: DashboardResearchSelection<ResearchJob>;
  completedRecent: ResearchJob | undefined;
  paperName: string | null;
  paperSessionStatus: string | null;
  status: DashStatus | null;
}) {
  const steps = buildOperatorPipeline({
    researchLabel: dashboardResearchLifecycleLabel(researchSelection),
    researchHref: dashboardResearchLifecycleHref(researchSelection),
    completedRecent,
    paperName,
    paperSessionStatus,
    liveAllowed: status?.liveAllowed,
    canStartLive: status?.canStartLive,
    liveBlockReason: status?.liveBlockReason,
    emergencyActive: status?.emergencyActive,
  });

  return (
    <section
      className="rextora-dashboard-lifecycle"
      aria-label="거래 파이프라인"
    >
      <div className="rextora-dashboard-section-head">
        <h2 className="rextora-dashboard-section-title">거래 파이프라인</h2>
        <p className="rextora-dashboard-section-desc">
          전략 탐색 → 전략 → 백테스트 → 모의매매 → 실전 승인 → 실전 진입
        </p>
      </div>
      {initialLoading ? (
        <Skeleton className="h-24" />
      ) : (
        <ol className="rextora-dashboard-lifecycle-track">
          {steps.map((step, index) => (
            <li key={step.id} className="rextora-dashboard-lifecycle-step">
              <Link
                href={step.href}
                className="rextora-dashboard-lifecycle-link"
                data-testid={step.testId}
              >
                <span className="rextora-dashboard-lifecycle-index">
                  {index + 1}
                </span>
                <span className="rextora-dashboard-lifecycle-label">
                  {step.label}
                </span>
                <span className="rextora-dashboard-lifecycle-status">
                  {step.status}
                </span>
              </Link>
              {index < steps.length - 1 ? (
                <span className="rextora-dashboard-lifecycle-arrow" aria-hidden>
                  →
                </span>
              ) : null}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
