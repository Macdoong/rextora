import { Badge, Card, Metric } from "@/components/ui/primitives";

import { COST_RULE_KO } from "@/src/lib/rextora/costEngine";

import { formatPercent } from "@/src/lib/rextora/displayFormat";

import type { CostBreakdown } from "@/lib/types";



export function CostAnalysisPanel({ breakdown }: { breakdown: CostBreakdown }) {

  const tone = breakdown.passed ? "success" : breakdown.decision === "비용 부족" ? "warning" : "danger";



  return (

    <Card title="비용 분석" action={<Badge tone={tone}>{breakdown.decision}</Badge>}>

      <p className="rextora-helper mb-3">

        단타는 수수료와 슬리피지 때문에 예상 수익이 작으면 손실이 날 수 있습니다. 그래서 Rextora는 예상 수익이 모든 비용보다 충분히 클 때만 진입 후보로 봅니다.

      </p>

      <p className="rextora-helper mb-3">

        예상 수익이 수수료, 슬리피지, 펀딩비, 안전마진보다 충분히 커야 진입 가치가 있습니다.

      </p>

      <div className="mb-4 rounded-lg border border-violet-500/30 bg-violet-500/10 p-3 text-violet-100">

        {COST_RULE_KO}

      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">

        <Metric label="예상 수익률" value={formatPercent(breakdown.expectedProfitPct)} tone="success" />

        <Metric label="왕복 수수료" value={formatPercent(breakdown.roundTripFeePct, 3)} />

        <Metric label="예상 슬리피지" value={formatPercent(breakdown.estimatedSlippagePct, 3)} />

        <Metric label="스프레드" value={formatPercent(breakdown.spreadPct, 3)} />

        <Metric label="펀딩비" value={formatPercent(breakdown.fundingFeePct, 3)} />

        <Metric label="안전마진" value={formatPercent(breakdown.safetyMarginPct, 3)} />

        <Metric label="최종 기대값" value={formatPercent(breakdown.finalExpectedValuePct)} tone={breakdown.passed ? "success" : "danger"} />

        <Metric label="최종 판단" value={breakdown.decision} tone={tone === "success" ? "success" : "danger"} />

      </div>

      <p className="rextora-helper mt-3">예상 수익률은 참고용이며 수익이 보장되지 않습니다.</p>

    </Card>

  );

}

