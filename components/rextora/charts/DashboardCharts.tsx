"use client";

import { Card, Metric } from "@/components/ui/primitives";
import { BarChart, DrawdownChart, EquityCurveChart, TimelineChart } from "@/components/rextora/charts";
import {
  drawdownFromEquity,
  metricsDailyPnl,
  metricsToEquitySpark,
  rollingWinRate,
  signalTimeline,
  unifiedTradesToTimeline
} from "@/src/lib/rextora/charts/adapters";
import type { UnifiedMetricsSnapshot } from "@/src/lib/rextora/metrics/types";
import type { AiCandidate, BotStatus, TodayPnlSummary } from "@/lib/types";
import { uiLabel } from "@/src/lib/rextora/displayLabels";

export function DashboardCharts({
  metrics,
  bot,
  todayPnl,
  signalCount,
  candidates
}: {
  metrics: UnifiedMetricsSnapshot | null;
  bot?: BotStatus | null;
  todayPnl?: TodayPnlSummary | null;
  signalCount?: number;
  candidates?: AiCandidate[];
}) {
  const equity = metrics ? metricsToEquitySpark(metrics) : null;
  const daily = metrics ? metricsDailyPnl(metrics) : null;
  const dd = equity ? drawdownFromEquity(equity.data.map((p) => p.y)) : null;
  const wr = metrics ? rollingWinRate(metrics.recentTrades.map((t) => ({ pnlPct: t.netPct / 100 }))) : null;
  const timeline = metrics ? unifiedTradesToTimeline(metrics.recentTrades.slice(0, 20)) : [];
  const signals = signalTimeline(
    (candidates ?? []).slice(0, 12).map((c) => ({
      symbol: c.symbol,
      side: c.direction,
      signal: c.signalType,
      judgment: c.status,
      signalScore: c.aiScore,
      reason: c.entryReason ?? c.signalReason ?? c.blockReason
    }))
  );

  const hasMiniCharts = Boolean(equity || dd || daily || wr);
  const hasTimelines = timeline.length > 0 || signals.length > 0;

  return (
    <div className="space-y-3" data-testid="dashboard-charts">
      <div className="grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-6">
        <Card title={uiLabel("Bot")} className="!p-3">
          <Metric label={uiLabel("Status")} value={bot?.running ? "실행 중" : "중지"} />
        </Card>
        <Card title={uiLabel("Today")} className="!p-3">
          <Metric
            label={uiLabel("Profit")}
            value={`${todayPnl?.todayRealizedPnlUsdt ?? metrics?.todayRealizedPnlUsdt ?? 0} USDT`}
            tone={(todayPnl?.todayRealizedPnlUsdt ?? 0) >= 0 ? "success" : "danger"}
          />
        </Card>
        <Card title={uiLabel("Equity")} className="!p-3">
          <Metric label={uiLabel("Balance")} value={`${metrics?.accountEquity ?? "-"}`} />
        </Card>
        <Card title={uiLabel("Risk")} className="!p-3">
          <Metric label="손실 한도 사용률" value={`${todayPnl?.dailyLossLimitUsagePct ?? metrics?.riskUsagePct ?? 0}%`} />
        </Card>
        <Card title={uiLabel("Positions")} className="!p-3">
          <Metric label="열린 포지션" value={todayPnl?.openPositionCount ?? metrics?.openPositionCount ?? 0} />
        </Card>
        <Card title={uiLabel("Signals")} className="!p-3">
          <Metric label={uiLabel("Count")} value={signalCount ?? candidates?.length ?? 0} />
        </Card>
      </div>

      {hasMiniCharts ? (
        <div className="grid gap-3 lg:grid-cols-2 xl:grid-cols-4">
          {equity && <EquityCurveChart title={uiLabel("Mini Equity")} series={equity} height={140} />}
          {dd && <DrawdownChart title={uiLabel("Mini Drawdown")} series={dd} height={140} />}
          {daily && <BarChart title={uiLabel("Mini Daily Profit")} series={daily} height={140} diverging />}
          {wr && <EquityCurveChart title={uiLabel("Mini Win Rate")} series={wr} height={140} area={false} />}
        </div>
      ) : (
        <Card title="차트" className="!p-3">
          <p className="text-sm text-slate-400">표시할 자산·손익 데이터가 없습니다. 모의 매매 또는 백테스트를 실행하면 채워집니다.</p>
        </Card>
      )}

      {hasTimelines ? (
        <div className="grid gap-3 lg:grid-cols-2">
          {timeline.length > 0 && <TimelineChart title={uiLabel("Latest Trades")} events={timeline} height={140} showLabels />}
          {signals.length > 0 && <TimelineChart title={uiLabel("Latest Signals")} events={signals} height={140} showLabels />}
        </div>
      ) : null}
    </div>
  );
}
