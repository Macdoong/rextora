import { Skeleton } from "@/components/ui/primitives";
import { DashboardActionLink } from "./DashboardActionLink";
import type { PrimaryAction } from "./dashboardData";

export function DashboardPrimaryAction({
  initialLoading,
  primaryAction,
}: {
  initialLoading: boolean;
  primaryAction: PrimaryAction;
}) {
  if (initialLoading) {
    return (
      <section
        className="rextora-dashboard-primary-action"
        data-testid="dashboard-primary-action"
        aria-label="다음 권장 행동"
      >
        <Skeleton className="h-12" />
      </section>
    );
  }

  return (
    <section
      className="rextora-dashboard-primary-action"
      data-testid="dashboard-primary-action"
      aria-label="다음 권장 행동"
    >
      <p className="rextora-dashboard-kicker">다음 권장 행동</p>
      <p className="rextora-dashboard-primary-label">{primaryAction.label}</p>
      <p className="rextora-dashboard-primary-desc">{primaryAction.description}</p>
      <DashboardActionLink
        href={primaryAction.href}
        variant="primary"
        size="lg"
        className="rextora-dashboard-primary-cta"
        data-testid="dash-start-research"
      >
        {primaryAction.label}
      </DashboardActionLink>
    </section>
  );
}
