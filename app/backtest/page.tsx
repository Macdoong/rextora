import { Suspense } from "react";
import { BacktestReviewWorkbench } from "@/components/rextora/backtest/BacktestReviewWorkbench";
import { BacktestWorkbench } from "@/components/rextora/backtest/SafeBacktestPanel";
import { ExpertRouteGuard } from "@/components/rextora/settings/ExpertRouteGuard";
import { AgentContextStrip } from "@/components/rextora/agent/AgentContextStrip";
import { PageHeader } from "@/components/ui/primitives";
import { ClientHydrated } from "@/components/rextora/ClientHydrated";

export default async function BacktestPage({
  searchParams,
}: {
  searchParams: Promise<{ expert?: string; strategyId?: string }>;
}) {
  const sp = await searchParams;
  const expert = sp.expert === "1";

  if (expert) {
    return (
      <div className="rextora-page v3 v3-backtest" data-testid="backtest-expert-page">
        <div className="v3-bt-pagehead">
          <PageHeader
            compact
            title="백테스트 · 전문가"
            description="수동 파라미터·비용 스트레스는 전문가 모드에서만 제공합니다."
          />
          <p className="v3-bt-asof">과거 데이터 시뮬레이션 · 실제 주문 없음</p>
        </div>
        <p className="v3-bt-note">
          기본 검토 화면은{" "}
          <a href="/backtest">/backtest</a>
          입니다.
        </p>
        <ExpertRouteGuard title="전문가 수동 백테스트는 Expert Mode가 필요합니다.">
          <BacktestWorkbench />
        </ExpertRouteGuard>
      </div>
    );
  }

  return (
    <div className="rextora-page v3 v3-backtest" data-testid="backtest-page">
      <div className="v3-bt-pagehead">
        <PageHeader
          compact
          title="백테스트"
          description="성과, 위험, 비용과 검증 상태를 빠르게 판단합니다. 실주문 없음."
        />
        <p className="v3-bt-asof">과거 데이터 시뮬레이션 · 실제 주문 없음</p>
      </div>
      <ClientHydrated
        fallback={
          <div className="v3-bt-hydrate" aria-label="백테스트 화면 준비 중" />
        }
      >
        <AgentContextStrip pageLabelKo="백테스트" />
        <Suspense
          fallback={
            <p className="text-sm text-slate-400">백테스트 화면을 준비합니다…</p>
          }
        >
          <BacktestReviewWorkbench />
        </Suspense>
      </ClientHydrated>
    </div>
  );
}
