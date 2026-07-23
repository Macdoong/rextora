import { StrategySearchWorkbench } from "@/components/rextora/strategySearch/StrategySearchWorkbench";

export default function StrategySearchPage() {
  return (
    <div className="rextora-page ss-page" data-testid="strategy-search-page">
      <div>
        <h1 className="rextora-page-title ss-page-title">전략 탐색</h1>
        <p className="rextora-helper ss-page-desc mt-2">
          목표만 정하면 AI가 연구합니다. 합격 전략은 직접 선택한 뒤 전략 관리에
          등록하세요. 자동으로 저장되지 않습니다.
        </p>
      </div>
      <StrategySearchWorkbench />
    </div>
  );
}
