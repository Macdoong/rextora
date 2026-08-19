import { Badge, PageHeader } from "@/components/ui/primitives";
import { LifecycleDashboard } from "@/components/rextora/dashboard/LifecycleDashboard";
import { AgentPanel } from "@/components/rextora/agent/AgentPanel";
import { FirstRunOnboarding } from "@/components/rextora/firstRun/FirstRunOnboarding";
import { Suspense } from "react";
import { ClientHydrated } from "@/components/rextora/ClientHydrated";

export default function DashboardPage() {
  return (
    <div className="rextora-page">
      <PageHeader
        compact
        eyebrow="AI TRADING EMPLOYEE"
        title="대시보드"
        description="AI 연구원에게 질문하고, 현재 연구와 승인이 필요한 다음 단계를 한눈에 확인합니다."
        actions={<Badge tone="success">모의 거래 · 실전 주문 차단</Badge>}
      />
      <Suspense fallback={null}>
        <FirstRunOnboarding />
      </Suspense>
      <ClientHydrated
        fallback={
          <div
            className="min-h-48 rounded-xl border border-slate-800 bg-slate-950/30"
            aria-label="AI 직원 대화 준비 중"
          />
        }
      >
        <AgentPanel shared />
      </ClientHydrated>
      <LifecycleDashboard />
    </div>
  );
}
