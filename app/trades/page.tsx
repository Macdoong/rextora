"use client";

import { useEffect, useMemo, useState } from "react";
import { Badge, Card } from "@/components/ui/primitives";

type Trade = {
  time: string;
  modeLabel: string;
  symbol: string;
  direction: string;
  resultLabel: string;
  pnlPct: number | null;
  exitReasonLabel: string;
  entryPrice: number | null;
  exitPrice: number | null;
};

export default function TradesPage() {
  const [tab, setTab] = useState<"all" | "paper" | "live">("all");
  const [trades, setTrades] = useState<Trade[]>([]);

  useEffect(() => {
    const timer = setTimeout(() => {
      void fetch("/api/rextora/trading/dashboard")
        .then((r) => r.json())
        .then((j) => setTrades(j.data?.status?.recentTrades ?? j.status?.recentTrades ?? []));
    }, 0);
    return () => clearTimeout(timer);
  }, []);

  const filtered = useMemo(() => {
    if (tab === "paper") return trades.filter((t) => t.modeLabel.includes("모의"));
    if (tab === "live") return trades.filter((t) => t.modeLabel.includes("실전"));
    return trades;
  }, [tab, trades]);

  return (
    <div className="space-y-4" data-testid="trades-page">
      <div>
        <h1 className="text-2xl font-bold text-white">거래 기록</h1>
        <p className="mt-1 text-sm text-slate-400">완료된 거래만 표시합니다. 후보/큐 기록은 기본 숨김입니다.</p>
      </div>
      <div className="flex gap-2">
        {[
          ["all", "전체"],
          ["paper", "모의 거래"],
          ["live", "실전 거래"]
        ].map(([id, label]) => (
          <button
            key={id}
            className={`rounded-lg border px-3 py-2 text-sm ${tab === id ? "border-violet-500 bg-violet-500/20" : "border-slate-700"}`}
            onClick={() => setTab(id as typeof tab)}
            data-testid={`trades-tab-${id}`}
          >
            {label}
          </button>
        ))}
      </div>
      <Card title="완료 거래">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-left text-sm">
            <thead className="text-slate-400">
              <tr>
                <th>시간</th>
                <th>모드</th>
                <th>코인</th>
                <th>방향</th>
                <th>전략</th>
                <th>진입가</th>
                <th>청산가</th>
                <th>결과</th>
                <th>손익</th>
                <th>청산 이유</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((t, i) => (
                <tr key={`${t.symbol}-${i}`} className="border-t border-slate-900">
                  <td className="py-2">{t.time}</td>
                  <td>{t.modeLabel}</td>
                  <td>{t.symbol}</td>
                  <td>{t.direction}</td>
                  <td>SAFE_v44</td>
                  <td>{t.entryPrice ?? "-"}</td>
                  <td>{t.exitPrice ?? "-"}</td>
                  <td>
                    <Badge>{t.resultLabel}</Badge>
                  </td>
                  <td>{t.pnlPct ?? "-"}%</td>
                  <td>{t.exitReasonLabel}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {filtered.length === 0 && <p className="text-sm text-slate-400">거래 기록이 없습니다.</p>}
      </Card>
    </div>
  );
}
