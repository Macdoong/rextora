import { CostAnalysisPanel } from "@/components/rextora/CostAnalysisPanel";
import { PageHeader } from "@/components/rextora/StatusCards";
import { calculateCostBreakdown } from "@/src/lib/rextora/costEngine";
import { formatPercent } from "@/src/lib/rextora/displayFormat";
import { costBreakdownSeed } from "@/src/lib/rextora/seedData";
import { getTopCandidates } from "@/src/lib/rextora/aiRanker";
import { Card } from "@/components/ui/primitives";

export default function CostAnalysisPage() {
  const top = getTopCandidates(1)[0];
  const primary = top
    ? calculateCostBreakdown({
        symbol: top.symbol,
        expectedProfitPct: top.expectedProfitPct,
        estimatedSlippagePct: top.expectedCostPct * 0.3,
        spreadPct: 0.05,
        fundingFeePct: 0.03
      })
    : costBreakdownSeed;

  return (
    <>
      <PageHeader title="비용 분석" description="수수료, 슬리피지, 펀딩비, 안전마진을 반영한 진입 가치를 확인합니다." />
      <CostAnalysisPanel breakdown={primary} />
      <Card title="후보별 비용 검토" className="mt-3">
        <div className="space-y-2 rextora-body text-slate-300">
          {getTopCandidates(5).map((c) => {
            const b = calculateCostBreakdown({ symbol: c.symbol, expectedProfitPct: c.expectedProfitPct });
            return (
              <div key={c.symbol} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-800 px-3 py-2">
                <span>{c.symbol} · {c.direction}</span>
                <span className={b.passed ? "text-green-300" : "text-red-300"}>{b.decision} (기대값 {formatPercent(b.finalExpectedValuePct)})</span>
              </div>
            );
          })}
        </div>
      </Card>
    </>
  );
}
