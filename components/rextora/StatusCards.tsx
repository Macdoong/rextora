import type { ReactNode } from "react";
import { Badge, Card, Metric, ProgressBar, StatusBadge } from "@/components/ui/primitives";
import { displayLabel } from "@/src/lib/rextora/displayLabels";
import { formatUsdt } from "@/src/lib/rextora/displayFormat";
import type { ApiStatus, BotStatus, TodayPnlSummary } from "@/lib/types";

export function PageHeader({
  title,
  description,
  compact = false,
  actions,
}: {
  title: string;
  description: string;
  compact?: boolean;
  actions?: ReactNode;
}) {
  return (
    <header
      className={`${compact ? "mb-2" : "mb-5"} flex flex-wrap items-start justify-between gap-3 rx-fade-in`}
    >
      <div className="min-w-0">
        <h1 className="rextora-page-title">{title}</h1>
        <p className="rextora-helper mt-2 max-w-2xl leading-relaxed">{description}</p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {actions}
        <div
          className="rextora-badge rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-emerald-200"
          data-testid="page-mode-banner"
        >
          모의 거래 기본 · 실전 거래 차단
        </div>
      </div>
    </header>
  );
}

export function BotStatusCard({ bot, api, className = "" }: { bot: BotStatus; api: ApiStatus; className?: string }) {
  const runState = bot.running ? (bot.state === "오류" ? "오류" : "실행 중") : "중지";
  const binanceLabel = api.binanceFuturesConnected ? displayLabel("connected") : displayLabel("read-only/mock");
  const telegramLabel = api.configured.telegramToken ? displayLabel("configured") : displayLabel("mock");

  return (
    <Card title="봇 상태" action={<StatusBadge status={runState} />} className={className}>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Metric label="봇 상태" value={<StatusBadge status={runState} />} />
        <Metric
          label="모드"
          value={<StatusBadge status={displayLabel(bot.mode)} />}
          tone={bot.mode === "LIVE" ? "danger" : "success"}
        />
        <Metric
          label="Binance"
          value={<StatusBadge status={binanceLabel} />}
          tone={api.binanceFuturesConnected ? "success" : "default"}
        />
        <Metric label="Telegram" value={<StatusBadge status={telegramLabel} />} />
      </div>
      <p className="rextora-helper mt-3">마지막 상태 확인 {bot.lastHeartbeat}</p>
    </Card>
  );
}

function fmtPct(v: number | undefined, digits = 2): string {
  if (v == null || !Number.isFinite(v)) return "-";
  return `${v >= 0 ? "+" : ""}${v.toFixed(digits)}%`;
}

function fmtUsdt(v: number | undefined): string {
  if (v == null || !Number.isFinite(v)) return "-";
  return formatUsdt(v);
}

export function TodayPnlRiskCard({ summary, className = "" }: { summary: TodayPnlSummary; className?: string }) {
  const riskTone = summary.riskState === "정상" ? "success" : summary.riskState === "주의" ? "warning" : "danger";

  return (
    <Card title="오늘 손익 / 리스크 요약" action={<Badge tone={riskTone}>{summary.riskState}</Badge>} className={className}>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <Metric
          label="오늘 실현 손익"
          value={summary.todayRealizedPnlUsdt != null ? fmtUsdt(summary.todayRealizedPnlUsdt) : fmtPct(summary.todayPnlPct)}
          tone={(summary.todayRealizedPnlUsdt ?? summary.todayPnlPct) >= 0 ? "success" : "danger"}
        />
        <Metric
          label="오늘 미실현"
          value={summary.todayUnrealizedPnlUsdt != null ? fmtUsdt(summary.todayUnrealizedPnlUsdt) : "-"}
        />
        <Metric label="계정 수익률" value={fmtPct(summary.accountReturnPct ?? summary.todayPnlPct)} />
        <Metric label="오늘 거래" value={summary.todayTradeCount} />
        <Metric label="리스크 사용률" value={`${summary.dailyLossLimitUsagePct}%`} />
      </div>
      <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Metric label="현재 자산" value={summary.accountEquity != null ? fmtUsdt(summary.accountEquity) : "-"} />
        <Metric label="오늘 수수료" value={summary.todayFeeUsdt != null ? fmtUsdt(summary.todayFeeUsdt) : "-"} />
        <Metric label="오늘 펀딩" value={summary.todayFundingUsdt != null ? fmtUsdt(summary.todayFundingUsdt) : "-"} />
        <Metric label="오늘 슬리피지" value={summary.todaySlippageUsdt != null ? fmtUsdt(summary.todaySlippageUsdt) : "-"} />
      </div>
      <div className="mt-3">
        <div className="rextora-helper mb-1 flex justify-between">
          <span>일 손실 한도 사용률</span>
          <span>{summary.dailyLossLimitUsagePct}%</span>
        </div>
        <ProgressBar
          value={summary.dailyLossLimitUsagePct}
          tone={summary.dailyLossLimitUsagePct > 70 ? "danger" : summary.dailyLossLimitUsagePct > 40 ? "warning" : "success"}
        />
      </div>
      <p className="rextora-helper mt-2">
        포지션 {summary.openPositionCount} · 리스크 {summary.riskState}
      </p>
    </Card>
  );
}
