import { StrategySearchWorkbench } from "@/components/rextora/strategySearch/StrategySearchWorkbench";
import { PageHeader } from "@/components/ui/primitives";
import { AgentContextStrip } from "@/components/rextora/agent/AgentContextStrip";
import { ClientHydrated } from "@/components/rextora/ClientHydrated";

export default function StrategySearchPage() {
  return (
    <div
      className="rextora-page ss-page v3 v3-strategy-search"
      data-testid="strategy-search-page"
    >
      <div className="v3-ss-pagehead">
        <PageHeader
          compact
          title="전략 탐색"
          description="새 탐색, 재개 작업, 후보 비교를 한 화면에서 처리합니다."
        />
        <p className="v3-ss-asof">연구/검증 전용</p>
      </div>
      <ClientHydrated
        fallback={
          <div
            className="v3-ss-hydrate"
            aria-label="전략 탐색 화면 준비 중"
          />
        }
      >
        <AgentContextStrip pageLabelKo="전략 탐색" />
        <div id="results" className="scroll-mt-20">
          <StrategySearchWorkbench />
        </div>
      </ClientHydrated>
    </div>
  );
}
