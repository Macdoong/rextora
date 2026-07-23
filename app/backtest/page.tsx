import { BacktestWorkbench } from "@/components/rextora/backtest/SafeBacktestPanel";

export default function BacktestPage() {
  return (
    <div className="rextora-page">
      <div>
        <h1 className="rextora-page-title text-white">백테스트</h1>
        <p className="rextora-helper mt-1.5">
          전략·기간·타임프레임·비용 설정으로 수학 전략을 검증합니다. 실주문 없음.
        </p>
      </div>
      <p className="rextora-caption">
        데이터 출처: 과거 데이터 시뮬레이션 · 실제 주문 없음
      </p>
      <BacktestWorkbench />
    </div>
  );
}
