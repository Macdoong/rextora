import { StrategySearchWorkbench } from "@/components/rextora/strategySearch/StrategySearchWorkbench";

export default function StrategySearchPage() {
  return (
    <div className="rextora-page ss-page" data-testid="strategy-search-page">
      <div>
        <h1 className="rextora-page-title ss-page-title">전략 탐색</h1>
        <p className="rextora-helper ss-page-desc mt-2">
          시장·시간봉·연구 시간만 정하면 AI가 탐색 전략을 만들고 검증·개선합니다.
          설정한 시간이 끝날 때까지 계속하며, 첫 합격에서 멈추지 않습니다. 합격
          전략은 검토 후 모의 매매에 직접 등록하세요.
        </p>
      </div>
      <div id="results" className="scroll-mt-20">
        <StrategySearchWorkbench />
      </div>
    </div>
  );
}
