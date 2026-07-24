import { Suspense } from "react";
import { BacktestReviewWorkbench } from "@/components/rextora/backtest/BacktestReviewWorkbench";
import { BacktestWorkbench } from "@/components/rextora/backtest/SafeBacktestPanel";
import { ExpertRouteGuard } from "@/components/rextora/settings/ExpertRouteGuard";

export default async function BacktestPage({
  searchParams,
}: {
  searchParams: Promise<{ expert?: string; strategyId?: string }>;
}) {
  const sp = await searchParams;
  const expert = sp.expert === "1";

  if (expert) {
    return (
      <div className="rextora-page" data-testid="backtest-expert-page">
        <div>
          <h1 className="rextora-page-title text-white">백테스트 · 전문가</h1>
          <p className="rextora-helper mt-1.5">
            수동 파라미터·비용 스트레스는 전문가 모드에서만 제공합니다. 기본
            검토 화면은{" "}
            <a className="text-sky-300 underline" href="/backtest">
              /backtest
            </a>
            입니다.
          </p>
        </div>
        <p className="rextora-caption">
          데이터 출처: 과거 데이터 시뮬레이션 · 실제 주문 없음
        </p>
        <ExpertRouteGuard title="전문가 수동 백테스트는 Expert Mode가 필요합니다.">
          <BacktestWorkbench />
        </ExpertRouteGuard>
      </div>
    );
  }

  return (
    <div className="rextora-page" data-testid="backtest-page">
      <div>
        <h1 className="rextora-page-title text-white">백테스트</h1>
        <p className="rextora-helper mt-1.5">
          선택된 전략의 백테스트 결과를 검토합니다. 차트·거래·이벤트 추적으로
          진입·청산 근거를 확인하세요. 실주문 없음.
        </p>
      </div>
      <p className="rextora-caption">
        데이터 출처: 과거 데이터 시뮬레이션 · 실제 주문 없음 · 비용 기본값은
        시스템 설정
      </p>
      <Suspense
        fallback={
          <p className="text-sm text-slate-400">백테스트 화면을 준비합니다…</p>
        }
      >
        <BacktestReviewWorkbench />
      </Suspense>
    </div>
  );
}
