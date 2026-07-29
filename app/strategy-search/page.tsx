import { StrategySearchWorkbench } from "@/components/rextora/strategySearch/StrategySearchWorkbench";
import { PageHeader } from "@/components/ui/primitives";

export default function StrategySearchPage() {
  return (
    <div className="rextora-page ss-page" data-testid="strategy-search-page">
      <PageHeader
        eyebrow="RESEARCH"
        title="전략 탐색"
        description="연구 목표와 검증 기준을 정하면 AI가 전략을 탐색합니다. 완료 후 결과를 직접 검토하고 다음 단계로 이동합니다."
      />
      <div id="results" className="scroll-mt-20">
        <StrategySearchWorkbench />
      </div>
    </div>
  );
}
