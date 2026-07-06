import { Badge, Card, Metric } from "@/components/ui/primitives";
import type { AiBriefing, AlertHistoryItem, AlertRule } from "@/lib/types";

export function AlertRulesPanel({ rules }: { rules: AlertRule[] }) {
  return (
    <Card title="알림 조건">
      <div className="space-y-2">
        {rules.map((rule) => (
          <div key={rule.id} className="flex items-center justify-between rounded-lg border border-slate-800 bg-slate-950/70 p-3 text-xs">
            <div>
              <div className="font-semibold text-slate-100">{rule.asset} · {rule.type}</div>
              <div className="mt-1 text-slate-400">{rule.timeframe} · {rule.condition}</div>
            </div>
            <Badge tone={rule.enabled ? "success" : "muted"}>{rule.enabled ? "활성" : "비활성"}</Badge>
          </div>
        ))}
      </div>
      <div className="mt-3 text-xs text-slate-400">Telegram 알림은 mock 정상 상태, PWA push는 placeholder입니다.</div>
    </Card>
  );
}

export function AlertHistoryTable({ alerts }: { alerts: AlertHistoryItem[] }) {
  return (
    <Card title="알림 히스토리">
      <div className="space-y-2">
        {alerts.map((alert) => (
          <div key={alert.id} className="grid grid-cols-5 gap-2 rounded-lg border border-slate-800 bg-slate-950/70 p-2 text-xs">
            <span className="text-slate-400">{alert.time}</span>
            <span>{alert.asset}</span>
            <span>{alert.type}</span>
            <span className="col-span-1 truncate">{alert.message}</span>
            <Badge tone={alert.riskLevel === "높음" ? "warning" : alert.riskLevel === "위험" ? "danger" : "success"}>{alert.riskLevel}</Badge>
          </div>
        ))}
      </div>
    </Card>
  );
}

export function AiBriefingPanel({ briefing }: { briefing: AiBriefing }) {
  return (
    <Card title="AI 브리핑">
      <div className="grid grid-cols-2 gap-3">
        <Metric label="자산" value={briefing.asset} />
        <Metric label="시간봉" value={briefing.timeframe} />
        <Metric label="감지 조건" value={briefing.detectedCondition} />
        <Metric label="현재가" value={briefing.currentPrice.toLocaleString()} />
        <Metric label="거래량" value={briefing.volumeContext} />
        <Metric label="지표" value={briefing.indicatorContext} />
        <Metric label="리스크" value={briefing.riskLevel} />
      </div>
      <p className="mt-3 rounded-lg bg-slate-950/70 p-3 text-sm text-slate-300">{briefing.explanation}</p>
      <p className="mt-2 text-[11px] text-orange-200">{briefing.disclaimer}</p>
    </Card>
  );
}
