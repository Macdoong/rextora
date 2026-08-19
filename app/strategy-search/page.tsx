import { StrategySearchWorkbench } from "@/components/rextora/strategySearch/StrategySearchWorkbench";
import { PageHeader } from "@/components/ui/primitives";
import { AgentContextStrip } from "@/components/rextora/agent/AgentContextStrip";
import { ClientHydrated } from "@/components/rextora/ClientHydrated";

export default function StrategySearchPage() {
  return (
    <div className="rextora-page ss-page" data-testid="strategy-search-page">
      <PageHeader
        eyebrow="RESEARCH"
        title="전략 탐색"
        description="연구 목표와 검증 기준을 정하면 AI가 전략을 탐색합니다. 완료 후 결과를 직접 검토하고 다음 단계로 이동합니다."
      />
      <ClientHydrated
        fallback={
          <div
            className="min-h-24 rounded-xl border border-slate-800 bg-slate-950/30"
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
