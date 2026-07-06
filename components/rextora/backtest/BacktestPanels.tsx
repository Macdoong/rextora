import { Badge, Card, Metric, ProgressBar } from "@/components/ui/primitives";
import { BACKTEST_SNAPSHOT_WARNING } from "@/src/lib/rextora/seedData";
import type { Strategy } from "@/lib/types";

export function EquityCurvePanel({ points }: { points: Array<{ label: string; value: number }> }) {
  const max = Math.max(...points.map((point) => point.value));

  return (
    <Card title="에쿼티 커브">
      <div className="flex h-40 items-end gap-2">
        {points.map((point) => (
          <div key={point.label} className="flex flex-1 flex-col items-center gap-1">
            <div className="w-full rounded-t bg-violet-500/80" style={{ height: `${(point.value / max) * 130}px` }} />
            <span className="text-[10px] text-slate-500">{point.label}</span>
          </div>
        ))}
      </div>
    </Card>
  );
}

export function BacktestValidationPanel({ strategy }: { strategy: Strategy }) {
  const rows = [
    ["recent_3m", strategy.validation.recent3m],
    ["prev_3m", strategy.validation.prev3m],
    ["full_10m", strategy.validation.full10m]
  ] as const;

  return (
    <Card title="백테스트 검증">
      <div className="mb-3 rounded-lg border border-orange-500/30 bg-orange-500/10 p-3 text-xs text-orange-100">{BACKTEST_SNAPSHOT_WARNING}</div>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        {rows.map(([label, metrics]) => (
          <div key={label} className="rounded-lg border border-slate-800 bg-slate-950/70 p-3">
            <div className="mb-2 text-xs font-semibold text-slate-300">{label}</div>
            <div className="grid grid-cols-2 gap-2">
              <Metric label="trades" value={metrics.trades} />
              <Metric label="return" value={`${metrics.totalReturn}%`} tone="success" />
              <Metric label="MDD" value={`${metrics.maxDrawdown}%`} tone="danger" />
              <Metric label="neg months" value={metrics.negMonths} />
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

export function CostStressPanel({ strategy }: { strategy: Strategy }) {
  const items = [
    ["cost x1.0", strategy.validation.costStress.cost1x],
    ["cost x1.5", strategy.validation.costStress.cost15x],
    ["cost x2.0", strategy.validation.costStress.cost2x]
  ] as const;

  return (
    <Card title="비용 스트레스">
      <div className="grid grid-cols-3 gap-2">
        {items.map(([label, status]) => <Badge key={label} tone={status === "pass" ? "success" : "danger"}>{label}: {status}</Badge>)}
      </div>
    </Card>
  );
}

export function JitterTestPanel({ strategy }: { strategy: Strategy }) {
  return (
    <Card title="Jitter 테스트">
      <div className="mb-2 flex justify-between text-xs"><span>통과율</span><span>{strategy.validation.jitterPassRate}%</span></div>
      <ProgressBar value={strategy.validation.jitterPassRate} tone={strategy.validation.jitterPassRate > 80 ? "success" : "warning"} />
      <div className="mt-3 text-xs text-slate-400">과최적화 위험: {strategy.validation.overfittingRisk}</div>
    </Card>
  );
}

export function MonthlyReturnsTable({ strategy }: { strategy: Strategy }) {
  return (
    <Card title="월별 수익률">
      <div className="grid grid-cols-2 gap-2 md:grid-cols-5">
        {strategy.validation.monthlyReturns.map((row) => (
          <div key={row.month} className="rounded-lg border border-slate-800 bg-slate-950/70 p-2 text-xs">
            <div className="text-slate-500">{row.month}</div>
            <div className={row.returnPct >= 0 ? "font-semibold text-green-300" : "font-semibold text-red-300"}>{row.returnPct}%</div>
          </div>
        ))}
      </div>
    </Card>
  );
}
