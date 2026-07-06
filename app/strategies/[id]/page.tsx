import { BacktestValidationPanel, CostStressPanel, JitterTestPanel, MonthlyReturnsTable } from "@/components/rextora/backtest/BacktestPanels";
import { PageHeader } from "@/components/rextora/dashboard/DashboardCards";
import { StrategyDetailPanel } from "@/components/rextora/strategy/StrategyPanels";
import { safeBaselineStrategy, strategies } from "@/lib/mock-data";

export default async function StrategyDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const strategy = strategies.find((item) => item.id === id) ?? safeBaselineStrategy;

  return (
    <>
      <PageHeader title="전략 상세" description="전략 조건, 검증 결과, LIVE 적격 여부를 확인합니다." />
      <div className="data-grid">
        <div className="col-span-12"><StrategyDetailPanel strategy={strategy} /></div>
        <div className="col-span-12"><BacktestValidationPanel strategy={strategy} /></div>
        <div className="col-span-12 xl:col-span-6"><CostStressPanel strategy={strategy} /></div>
        <div className="col-span-12 xl:col-span-6"><JitterTestPanel strategy={strategy} /></div>
        <div className="col-span-12"><MonthlyReturnsTable strategy={strategy} /></div>
      </div>
    </>
  );
}
