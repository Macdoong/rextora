import { BacktestWorkbench } from "@/components/rextora/backtest/SafeBacktestPanel";

export default function BacktestPage() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-white">백테스트</h1>
        <p className="mt-1 text-sm text-slate-400">
          전략·기간·타임프레임·비용 설정으로 수학 전략을 검증합니다. 실주문
          없음.
        </p>
      </div>
      <p className="text-xs text-slate-500">
        데이터 출처: 과거 데이터 시뮬레이션 · 실제 주문 없음
      </p>
      <BacktestWorkbench />
    </div>
  );
}
