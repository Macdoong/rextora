import { Badge, Card, Metric } from "@/components/ui/primitives";
import { displayLabel, formatUsdt } from "@/src/lib/rextora/displayFormat";
import type { Position } from "@/lib/types";

export function CurrentPositionsCard({ positions, className = "" }: { positions: Position[]; className?: string }) {
  return (
    <Card title="현재 포지션" action={<Badge tone="success">{positions.length}개</Badge>} className={className}>
      {positions.length === 0 ? (
        <p className="text-sm text-slate-400">열린 포지션이 없습니다.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-left text-xs">
            <thead>
              <tr className="border-b border-slate-800 text-slate-400">
                <th className="px-2 py-1.5">코인</th>
                <th className="px-2 py-1.5">방향</th>
                <th className="px-2 py-1.5">진입가</th>
                <th className="px-2 py-1.5">현재가</th>
                <th className="px-2 py-1.5">미실현 손익</th>
                <th className="px-2 py-1.5">손절가</th>
                <th className="px-2 py-1.5">익절가</th>
              </tr>
            </thead>
            <tbody>
              {positions.map((p) => (
                <tr key={p.id} className="border-b border-slate-800/60">
                  <td className="px-2 py-1.5">{p.symbol}</td>
                  <td className={`px-2 py-1.5 ${p.side === "Long" ? "text-green-300" : "text-red-300"}`}>{displayLabel(p.side)}</td>
                  <td className="px-2 py-1.5">{p.entryPrice.toLocaleString()}</td>
                  <td className="px-2 py-1.5">{p.currentPrice.toLocaleString()}</td>
                  <td className={`px-2 py-1.5 ${p.unrealizedPnl >= 0 ? "text-green-300" : "text-red-300"}`}>{p.unrealizedPnl >= 0 ? "+" : ""}{formatUsdt(Math.abs(p.unrealizedPnl)).replace(" USDT", "")} USDT</td>
                  <td className="px-2 py-1.5 text-red-300">{p.stopLoss.toLocaleString()}</td>
                  <td className="px-2 py-1.5 text-green-300">{p.takeProfit.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

export function CurrentPositionCard({ position }: { position: Position }) {
  return (
    <Card title="현재 포지션">
      <div className="grid grid-cols-2 gap-3">
        <Metric label="심볼" value={position.symbol} />
        <Metric label="방향" value={displayLabel(position.side)} tone="success" />
        <Metric label="진입가" value={position.entryPrice.toLocaleString()} />
        <Metric label="현재가" value={position.currentPrice.toLocaleString()} />
        <Metric label="손절가" value={position.stopLoss.toLocaleString()} tone="danger" />
        <Metric label="익절가" value={position.takeProfit.toLocaleString()} tone="success" />
      </div>
    </Card>
  );
}
