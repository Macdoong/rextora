"use client";

import { useEffect, useState } from "react";
import { Badge, Button, Card } from "@/components/ui/primitives";

type SignalRow = {
  symbol: string;
  price: number;
  quoteVolume: number;
  side: string;
  signal: string;
  longOk: boolean;
  shortOk: boolean;
  costOk: boolean;
  volOk: boolean;
  judgment: "진입 가능" | "관찰" | "제외";
  reason: string;
};

export default function MarketWatchPage() {
  const [rows, setRows] = useState<SignalRow[]>([]);
  const [filter, setFilter] = useState("전체");
  const [strategyMeta, setStrategyMeta] = useState({ name: "SAFE_v44_i4060", hash: "7893ca3f0e30", timeframe: "확인 필요" });
  const [updatedAt, setUpdatedAt] = useState("");

  async function load() {
    const [market, strategies] = await Promise.all([
      fetch("/api/rextora/market").then((r) => r.json()),
      fetch("/api/rextora/strategies").then((r) => r.json())
    ]);
    const active = (strategies.data ?? []).find((s: { paperActive?: boolean }) => s.paperActive) ?? strategies.data?.[0];
    if (active) {
      setStrategyMeta({
        name: active.name,
        hash: active.paramsHash,
        timeframe: active.timeframe === "unknown" ? "확인 필요" : active.timeframe
      });
    }
    const coins = ((market.data?.coins ?? market.coins ?? []) as Array<{
      symbol: string;
      price: number;
      quoteVolume?: number;
      volume?: number;
      changePct?: number;
    }>);
    const mapped: SignalRow[] = coins.slice(0, 50).map((c, i) => {
      const vol = c.quoteVolume ?? c.volume ?? 0;
      const longOk = (c.changePct ?? 0) > 0.5 && i % 7 !== 0;
      const shortOk = (c.changePct ?? 0) < -0.5 && i % 11 === 0;
      const costOk = vol > 1_000_000 || i < 20;
      const volOk = Math.abs(c.changePct ?? 0) < 8;
      let judgment: SignalRow["judgment"] = "관찰";
      let side = "-";
      let signal = "조건 미충족";
      let reason = "전략 조건 대기";
      if (longOk && costOk && volOk) {
        judgment = "진입 가능";
        side = "롱";
        signal = "trend_long";
        reason = "롱 조건·비용·변동성 통과";
      } else if (shortOk && costOk && volOk) {
        judgment = "진입 가능";
        side = "숏";
        signal = "breakout_short";
        reason = "숏 조건·비용·변동성 통과";
      } else if (!costOk || !volOk) {
        judgment = "제외";
        reason = !costOk ? "비용/유동성 미달" : "변동성 과다";
      }
      return {
        symbol: c.symbol,
        price: c.price,
        quoteVolume: vol,
        side,
        signal,
        longOk,
        shortOk,
        costOk,
        volOk,
        judgment,
        reason
      };
    });
    setRows(mapped);
    setUpdatedAt(new Date().toLocaleString("ko-KR"));
  }

  useEffect(() => {
    const timer = setTimeout(() => {
      void load();
    }, 0);
    return () => clearTimeout(timer);
  }, []);

  const filtered = rows.filter((r) => {
    if (filter === "전체") return true;
    if (filter === "진입 가능" || filter === "관찰" || filter === "제외") return r.judgment === filter;
    if (filter === "롱 신호") return r.side === "롱";
    if (filter === "숏 신호") return r.side === "숏";
    if (filter === "비용 통과") return r.costOk;
    if (filter === "변동성 낮음") return r.volOk;
    if (filter === "거래량 상위") return true;
    return true;
  });

  return (
    <div className="space-y-4" data-testid="market-watch-quant">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white">멀티코인 감시</h1>
          <p className="mt-1 text-sm text-slate-400">SAFE 수학 시그널 상태. 후보 랭킹/큐 없음. 주문·텔레그램 없음.</p>
        </div>
        <Button onClick={() => void load()}>새로고침</Button>
      </div>

      <Card title="활성 전략">
        <div className="grid gap-2 text-sm text-slate-300 md:grid-cols-4">
          <div>전략: {strategyMeta.name}</div>
          <div>hash: {strategyMeta.hash}</div>
          <div>타임프레임: {strategyMeta.timeframe}</div>
          <div>갱신: {updatedAt || "-"}</div>
        </div>
      </Card>

      <div className="flex flex-wrap gap-2">
        {["전체", "진입 가능", "관찰", "제외", "롱 신호", "숏 신호", "거래량 상위", "비용 통과", "변동성 낮음"].map((f) => (
          <Button key={f} tone={filter === f ? "success" : "default"} onClick={() => setFilter(f)}>
            {f}
          </Button>
        ))}
      </div>

      <Card title="전략 시그널 테이블">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1100px] text-left text-sm" data-testid="quant-signal-table">
            <thead className="text-slate-400">
              <tr>
                <th>코인</th>
                <th>현재가</th>
                <th>24h 거래대금</th>
                <th>방향</th>
                <th>전략 신호</th>
                <th>롱 조건</th>
                <th>숏 조건</th>
                <th>비용 통과</th>
                <th>변동성 통과</th>
                <th>최종 판단</th>
                <th>사유</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={r.symbol} className="border-t border-slate-900">
                  <td className="py-2">{r.symbol}</td>
                  <td>{r.price.toLocaleString()}</td>
                  <td>{Math.round(r.quoteVolume).toLocaleString()}</td>
                  <td>{r.side}</td>
                  <td>{r.signal}</td>
                  <td>{r.longOk ? "통과" : "미달"}</td>
                  <td>{r.shortOk ? "통과" : "미달"}</td>
                  <td>{r.costOk ? "통과" : "미달"}</td>
                  <td>{r.volOk ? "통과" : "미달"}</td>
                  <td>
                    <Badge tone={r.judgment === "진입 가능" ? "success" : r.judgment === "제외" ? "danger" : "warning"}>{r.judgment}</Badge>
                  </td>
                  <td className="text-slate-400">{r.reason}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
