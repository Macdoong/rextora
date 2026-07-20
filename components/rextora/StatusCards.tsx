import { Badge, Card, Metric, ProgressBar } from "@/components/ui/primitives";
import { displayLabel } from "@/src/lib/rextora/displayLabels";
import type { ApiStatus, BotStatus, TodayPnlSummary } from "@/lib/types";

export function PageHeader({ title, description, compact = false }: { title: string; description: string; compact?: boolean }) {
  return (
    <header className={`${compact ? "mb-2" : "mb-4"} flex flex-wrap items-center justify-between gap-3`}>
      <div>
        <h1 className="rextora-page-title font-black tracking-tight">{title}</h1>
        <p className="rextora-helper mt-1">{description}</p>
      </div>
      <div className="rextora-badge rounded-full border border-violet-500/40 bg-violet-500/10 px-3 py-1 text-violet-200" data-testid="page-mode-banner">
        모의 거래 기본 · 실전 거래 차단
      </div>
    </header>
  );
}

export function BotStatusCard({ bot, api, className = "" }: { bot: BotStatus; api: ApiStatus; className?: string }) {
  const runState = bot.running ? (bot.state === "오류" ? "오류" : "실행 중") : "중지";
  const runTone = runState === "실행 중" ? "success" : runState === "오류" ? "danger" : "muted";
  const binanceLabel = api.binanceFuturesConnected ? displayLabel("connected") : displayLabel("read-only/mock");
  const telegramLabel = api.configured.telegramToken ? displayLabel("configured") : displayLabel("mock");

  return (
    <Card title="봇 상태" action={<Badge tone={runTone}>{runState}</Badge>} className={className}>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Metric label="봇 상태" value={runState} tone={runTone === "success" ? "success" : runTone === "danger" ? "danger" : "default"} />
        <Metric label="모드" value={displayLabel(bot.mode)} tone={bot.mode === "LIVE" ? "danger" : "success"} />
        <Metric label="Binance" value={binanceLabel} tone={api.binanceFuturesConnected ? "success" : "default"} />
        <Metric label="Telegram" value={telegramLabel} />
      </div>
      <p className="rextora-helper mt-3">마지막 상태 확인 {bot.lastHeartbeat}</p>
    </Card>
  );
}

export function TodayPnlRiskCard({ summary, className = "" }: { summary: TodayPnlSummary; className?: string }) {
  const riskTone = summary.riskState === "정상" ? "success" : summary.riskState === "주의" ? "warning" : "danger";

  return (
    <Card title="오늘 손익 / 리스크 요약" action={<Badge tone={riskTone}>{summary.riskState}</Badge>} className={className}>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <Metric label="오늘 손익" value={`${summary.todayPnlPct >= 0 ? "+" : ""}${summary.todayPnlPct}%`} tone={summary.todayPnlPct >= 0 ? "success" : "danger"} />
        <Metric label="일 손실 한도 사용" value={`${summary.dailyLossLimitUsagePct}%`} />
        <Metric label="현재 포지션" value={summary.openPositionCount} />
        <Metric label="오늘 거래" value={summary.todayTradeCount} />
        <Metric label="리스크 상태" value={summary.riskState} tone={riskTone === "success" ? "success" : riskTone === "warning" ? "default" : "danger"} />
      </div>
      <div className="mt-3">
        <div className="rextora-helper mb-1 flex justify-between"><span>일 손실 한도 사용률</span><span>{summary.dailyLossLimitUsagePct}%</span></div>
        <ProgressBar value={summary.dailyLossLimitUsagePct} tone={summary.dailyLossLimitUsagePct > 70 ? "danger" : summary.dailyLossLimitUsagePct > 40 ? "warning" : "success"} />
      </div>
    </Card>
  );
}

