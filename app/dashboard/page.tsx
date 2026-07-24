import { PageHeader } from "@/components/rextora/StatusCards";
import { LifecycleDashboard } from "@/components/rextora/dashboard/LifecycleDashboard";

export default function DashboardPage() {
  return (
    <div className="rextora-page">
      <PageHeader
        compact
        title="대시보드"
        description="연구·검토·모의·실전 상태를 확인하고 다음 승인 결정을 내립니다."
      />
      <LifecycleDashboard />
    </div>
  );
}
