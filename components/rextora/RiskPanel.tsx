import { Badge, Card, Metric, ProgressBar } from "@/components/ui/primitives";
import type { RiskStatus } from "@/lib/types";

export function RiskPanel({ risk }: { risk: RiskStatus }) {
  const dailyRemaining = Math.max(0, 100 - (Math.abs(risk.dailyLossPct / risk.settings.dailyLossLimitPct) * 100));
  const riskTone = risk.riskState === "정상" ? "success" : risk.riskState === "주의" ? "warning" : "danger";

  return (
    <div className="space-y-3">
      <Card title="리스크 상태" action={<Badge tone={riskTone}>{risk.riskState}</Badge>}>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Metric label="일 손실 한도" value={`${risk.settings.dailyLossLimitPct}%`} />
          <Metric label="전체 손실 한도" value={`${risk.settings.totalLossLimitPct}%`} />
          <Metric label="연속 손실 제한" value={risk.settings.consecutiveLossLimit} />
          <Metric label="동시 포지션" value={risk.settings.maxSimultaneousPositions} />
          <Metric label="코인별 진입 한도" value={`${risk.settings.maxPositionSizePerCoinPct}%`} />
          <Metric label="최대 레버리지" value={`${risk.settings.maxLeverage}x`} />
          <Metric label="일 최대 거래" value={risk.settings.maxDailyTrades} />
          <Metric label="과매매 쿨다운" value={`${risk.settings.overtradingCooldownMinutes}분`} />
        </div>
      </Card>
      <Card title="한도 사용 현황">
        <div className="space-y-3">
          <div>
            <div className="mb-1 flex justify-between text-xs"><span>일 손실</span><span>{risk.dailyLossPct}% / {risk.settings.dailyLossLimitPct}%</span></div>
            <ProgressBar value={100 - dailyRemaining} tone="danger" />
          </div>
          <div className="grid grid-cols-3 gap-2">
            <Metric label="연속 손실" value={`${risk.consecutiveLosses}/${risk.settings.consecutiveLossLimit}`} />
            <Metric label="일 거래" value={`${risk.dailyTrades}/${risk.settings.maxDailyTrades}`} />
            <Metric label="포지션" value={`${risk.openPositions}/${risk.settings.maxSimultaneousPositions}`} />
          </div>
        </div>
      </Card>
    </div>
  );
}
