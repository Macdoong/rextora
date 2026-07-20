import { Badge, Card, Metric, ProgressBar } from "@/components/ui/primitives";
import type { RiskStatus } from "@/lib/types";
import type { UnifiedRiskView } from "@/src/lib/rextora/metrics/types";
import {
  computeRemainingLossAllowancePct,
  computeRiskUsagePct,
  normalizeDailyLossPct
} from "@/src/lib/rextora/metrics/riskFormulas";

function toView(risk: RiskStatus, riskView?: UnifiedRiskView): UnifiedRiskView {
  if (riskView) return riskView;
  const limit = risk.settings.dailyLossLimitPct;
  const current = normalizeDailyLossPct(risk.dailyLossPct);
  const usagePct = computeRiskUsagePct(current, limit);
  return {
    riskState: risk.riskState,
    dailyLossLimitPct: limit,
    currentDailyLossPct: current,
    remainingDailyLossPct: computeRemainingLossAllowancePct(current, limit),
    usagePct,
    accountDrawdownPct: risk.totalLossPct,
    accountLossLimitPct: risk.settings.totalLossLimitPct,
    consecutiveLosses: risk.consecutiveLosses,
    consecutiveLossLimit: risk.settings.consecutiveLossLimit,
    dailyTrades: risk.dailyTrades,
    maxDailyTrades: risk.settings.maxDailyTrades,
    remainingTrades: Math.max(0, risk.settings.maxDailyTrades - risk.dailyTrades),
    openPositions: risk.openPositions,
    maxPositions: risk.settings.maxSimultaneousPositions,
    remainingPositionSlots: Math.max(0, risk.settings.maxSimultaneousPositions - risk.openPositions),
    currentLeverage: risk.currentLeverage,
    maxLeverage: risk.settings.maxLeverage
  };
}

export function RiskPanel({ risk, riskView }: { risk: RiskStatus; riskView?: UnifiedRiskView }) {
  const view = toView(risk, riskView);
  const riskTone = view.riskState === "정상" ? "success" : view.riskState === "주의" ? "warning" : "danger";
  const limitAbs = Math.abs(view.dailyLossLimitPct);

  return (
    <div className="space-y-3">
      <Card title="리스크 상태" action={<Badge tone={riskTone}>{view.riskState}</Badge>}>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Metric label="오늘 손실 한도" value={`${limitAbs.toFixed(2)}%`} />
          <Metric label="전체 손실 한도" value={`${Math.abs(view.accountLossLimitPct).toFixed(2)}%`} />
          <Metric label="연속 손실 제한" value={view.consecutiveLossLimit} />
          <Metric label="최대 동시 포지션" value={view.maxPositions} />
          <Metric label="코인별 진입 한도" value={`${risk.settings.maxPositionSizePerCoinPct}%`} />
          <Metric label="최대 레버리지" value={`${view.maxLeverage}x`} />
          <Metric label="일 최대 거래" value={view.maxDailyTrades} />
          <Metric label="과매매 쿨다운" value={`${risk.settings.overtradingCooldownMinutes}분`} />
        </div>
      </Card>
      <Card title="한도 사용 현황">
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
            <Metric
              label="현재 일 손실"
              value={`${Math.abs(view.currentDailyLossPct).toFixed(2)}%`}
              tone={view.currentDailyLossPct < 0 ? "danger" : "success"}
            />
            <Metric label="남은 손실 여유" value={`${view.remainingDailyLossPct.toFixed(2)}%`} />
            <Metric
              label="손실 한도 사용률"
              value={`${view.usagePct}%`}
              tone={view.usagePct >= 100 ? "danger" : view.usagePct >= 70 ? "warning" : "default"}
            />
          </div>
          {(view.todayRealizedLossUsdt != null || view.todayUnrealizedLossUsdt != null) && (
            <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
              <Metric label="현재 실현 손실" value={`${(view.todayRealizedLossUsdt ?? 0).toFixed(2)} USDT`} />
              <Metric label="현재 미실현 손실" value={`${(view.todayUnrealizedLossUsdt ?? 0).toFixed(2)} USDT`} />
              <Metric label="현재 총손실" value={`${(view.todayTotalLossUsdt ?? 0).toFixed(2)} USDT`} />
            </div>
          )}
          <div>
            <div className="mb-1 flex justify-between text-xs">
              <span>일 손실 한도 사용률</span>
              <span>{view.usagePct}%</span>
            </div>
            <ProgressBar value={Math.min(100, view.usagePct)} tone="danger" />
          </div>
          <div className="grid grid-cols-3 gap-2">
            <Metric label="연속 손실" value={`${view.consecutiveLosses}/${view.consecutiveLossLimit}`} />
            <Metric label="일 거래" value={`${view.dailyTrades}/${view.maxDailyTrades}`} />
            <Metric label="사용 중인 포지션 슬롯" value={`${view.openPositions}/${view.maxPositions}`} />
          </div>
        </div>
      </Card>
    </div>
  );
}
