import { PageHeader } from "@/components/rextora/StatusCards";
import { DashboardPanelsLazy } from "@/components/rextora/dashboard/DashboardPanels";

export default function DashboardPage() {
  return (
    <div className="rextora-page">
      <PageHeader
        compact
        title="대시보드"
        description="봇 상태, 활성 전략, 손익, 포지션, 긴급 제어를 한 화면에서 확인합니다."
      />
      <div data-layout="dashboard-compact">
        <DashboardPanelsLazy />
      </div>
    </div>
  );
}
