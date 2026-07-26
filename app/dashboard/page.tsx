import { PageHeader } from "@/components/rextora/StatusCards";
import { LifecycleDashboard } from "@/components/rextora/dashboard/LifecycleDashboard";

export default function DashboardPage() {
  return (
    <div className="rextora-page">
      <PageHeader
        compact
        title="대시보드"
        description="지금 진행 중인 연구와 다음으로 확인할 단계를 한눈에 봅니다. 실전 주문은 승인 전까지 차단됩니다."
      />
      <LifecycleDashboard />
    </div>
  );
}
