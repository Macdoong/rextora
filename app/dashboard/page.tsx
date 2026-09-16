import { PageHeader } from "@/components/ui/primitives";
import { LifecycleDashboard } from "@/components/rextora/dashboard/LifecycleDashboard";
import { AgentPanel } from "@/components/rextora/agent/AgentPanel";
import { FirstRunOnboarding } from "@/components/rextora/firstRun/FirstRunOnboarding";
import { Suspense } from "react";
import { ClientHydrated } from "@/components/rextora/ClientHydrated";
import { LIVE_DISABLED_LABEL, LIVE_ORDERS_BLOCKED_LABEL } from "@/src/lib/rextora/live/liveGateOperatorPresentation";

export default function DashboardPage() {
  return (
    <div className="rextora-page rextora-dashboard-page op-page v3-oc-page">
      <div className="v3-oc-pagehead">
        <PageHeader
          compact
          title="운영센터"
          description="현재 상태와 다음 행동을 빠르게 판단합니다."
        />
        <p className="v3-oc-asof">
          모의거래 · {LIVE_DISABLED_LABEL} · {LIVE_ORDERS_BLOCKED_LABEL}
        </p>
      </div>
      <Suspense fallback={null}>
        <FirstRunOnboarding />
      </Suspense>
      <LifecycleDashboard />
      <section
        className="rextora-dashboard-agent-section op-ai-panel v3-oc-agent-legacy"
        aria-label="AI 트레이딩 직원"
      >
        <div className="rextora-dashboard-agent-head">
          <h2 className="rextora-dashboard-section-title">AI 트레이딩 직원</h2>
          <p className="rextora-dashboard-section-desc">
            연구·검증 질문은 여기서 이어갈 수 있습니다. 전역 AI를 열면 이 영역은
            자동으로 숨겨집니다.
          </p>
        </div>
        <ClientHydrated
          fallback={
            <div
              className="rextora-dashboard-agent-fallback"
              aria-label="AI 직원 대화 준비 중"
            />
          }
        >
          <AgentPanel shared />
        </ClientHydrated>
      </section>
    </div>
  );
}
