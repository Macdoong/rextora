import { StrategySearchWorkbench } from "@/components/rextora/strategySearch/StrategySearchWorkbench";

export default function StrategySearchPage() {
  return (
    <div className="rextora-page ss-page" data-testid="strategy-search-page">
      <div>
        <h1 className="rextora-page-title ss-page-title">전략 탐색</h1>
        <p className="rextora-helper ss-page-desc mt-2">
          시장·시간봉·연구 시간만 정하면 AI가 후보를 생성·백테스트·약점 분석하며
          시간 예산이 끝날 때까지 개선합니다. 첫 합격에서 멈추지 않습니다. 합격
          전략은 검토 후 직접 모의 매매에 등록하세요.
        </p>
      </div>
      <div id="results" className="scroll-mt-20">
        <StrategySearchWorkbench />
      </div>
    </div>
  );
}
