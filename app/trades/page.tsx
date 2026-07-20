"use client";

import { useEffect, useMemo, useState } from "react";
import { Badge, Card, Button } from "@/components/ui/primitives";
import { CandlestickChart, TimelineChart } from "@/components/rextora/charts";
import { candlesToPoints, tradeReplayOverlay } from "@/src/lib/rextora/charts/adapters";
import type { CandlePoint } from "@/src/lib/rextora/charts/types";

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
  grossPct?: number;
  netPct?: number;
  grossPnl?: number;
  netPnl?: number;
  fee?: number;
  funding?: number;
  slippage?: number;
  holdingTimeLabel?: string;
  realizedUsdt?: number;
  stopLoss?: number;
  takeProfit?: number;
};

export default function TradesPage() {
  const [tab, setTab] = useState<"all" | "paper" | "live">("all");
  const [trades, setTrades] = useState<Trade[]>([]);
  const [selected, setSelected] = useState<Trade | null>(null);
  const [candles, setCandles] = useState<CandlePoint[]>([]);

  useEffect(() => {
    const timer = setTimeout(() => {
      void fetch("/api/rextora/trading/dashboard")
        .then((r) => r.json())
        .then((j) => setTrades(j.data?.status?.recentTrades ?? j.status?.recentTrades ?? []));
    }, 0);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!selected?.symbol) return;
    let active = true;
    void fetch(`/api/rextora/charts/candles?symbol=${selected.symbol}&interval=15m&limit=120`)
      .then((r) => r.json())
      .then((j) => {
        if (!active) return;
        if (j.ok) setCandles(candlesToPoints(j.data.candles ?? []));
      });
    return () => {
      active = false;
    };
  }, [selected]);

  const filtered = useMemo(() => {
    if (tab === "paper") return trades.filter((t) => t.modeLabel.includes("모의"));
    if (tab === "live") return trades.filter((t) => t.modeLabel.includes("실전"));
    return trades;
  }, [tab, trades]);

  const replay = useMemo(() => {
    if (!selected || selected.entryPrice == null) return { markers: [], levels: [] };
    const side = selected.direction.includes("숏") || selected.direction === "SHORT" ? "SHORT" : "LONG";
    return tradeReplayOverlay({
      entryPrice: selected.entryPrice,
      exitPrice: selected.exitPrice,
      stopLoss: selected.stopLoss,
      takeProfit: selected.takeProfit,
      side,
      netPct: selected.netPct ?? selected.pnlPct
    });
  }, [selected]);

  return (
    <div className="space-y-4" data-testid="trades-page">
      <div>
        <h1 className="text-2xl font-bold text-white">거래 기록</h1>
        <p className="mt-1 text-sm text-slate-400">완료된 거래만 표시합니다. 행을 선택하면 캔들 리플레이를 엽니다.</p>
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
          <table className="w-full min-w-[1200px] text-left text-sm">
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
                <th>Gross %</th>
                <th>Net %</th>
                <th>Gross USDT</th>
                <th>Net USDT</th>
                <th>Fee</th>
                <th>Funding</th>
                <th>Slippage</th>
                <th>보유</th>
                <th>청산 이유</th>
                <th></th>
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
                  <td>{t.grossPct ?? t.pnlPct ?? "-"}%</td>
                  <td>{t.netPct ?? t.pnlPct ?? "-"}%</td>
                  <td>{t.grossPnl ?? "-"}</td>
                  <td>{t.netPnl ?? t.realizedUsdt ?? "-"}</td>
                  <td>{t.fee ?? "-"}</td>
                  <td>{t.funding ?? "-"}</td>
                  <td>{t.slippage ?? "-"}</td>
                  <td>{t.holdingTimeLabel ?? "-"}</td>
                  <td>{t.exitReasonLabel}</td>
                  <td>
                    <Button onClick={() => setSelected(t)}>Replay</Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {filtered.length === 0 && <p className="text-sm text-slate-400">거래 기록이 없습니다.</p>}
      </Card>

      {selected && (
        <Card title={`Candlestick Replay · ${selected.symbol}`}>
          <div className="mb-3 grid gap-2 text-sm text-slate-300 md:grid-cols-4">
            <div>
              Entry: {selected.entryPrice} → Exit: {selected.exitPrice}
            </div>
            <div>
              Net: {selected.netPct ?? selected.pnlPct}% / {selected.netPnl ?? selected.realizedUsdt} USDT
            </div>
            <div>Hold: {selected.holdingTimeLabel ?? "-"}</div>
            <div>Reason: {selected.exitReasonLabel}</div>
          </div>
          <CandlestickChart candles={candles} markers={replay.markers} levels={replay.levels} height={300} />
          <TimelineChart
            title="Trade Timeline"
            events={[
              { time: 1, label: "Entry", tone: "neutral" },
              {
                time: 2,
                label: "Exit",
                tone: (selected.netPct ?? 0) >= 0 ? "up" : "down",
                value: selected.netPct ?? undefined
              }
            ]}
            height={100}
          />
          <Button className="mt-2" onClick={() => setSelected(null)}>
            Close Replay
          </Button>
        </Card>
      )}
    </div>
  );
}
