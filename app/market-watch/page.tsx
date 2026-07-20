"use client";

import { useEffect, useMemo, useState } from "react";
import { Badge, Button, Card } from "@/components/ui/primitives";
import { CandlestickChart, MeterChart, BarChart } from "@/components/rextora/charts";
import { candlesToPoints, coinMeters, marketStructureLevels, volumeSeries } from "@/src/lib/rextora/charts/adapters";
import type { CandlePoint } from "@/src/lib/rextora/charts/types";
import { displayParamsHashLabel, displayTimeframeLabel, uiLabel } from "@/src/lib/rextora/displayLabels";

type SignalRow = {
  symbol: string;
  price: number;
  quoteVolume: number;
  volumeRank: number;
  change24hPct: number;
  volatility: number;
  signalScore: number;
  side: string;
  signal: string;
  longOk: boolean;
  shortOk: boolean;
  costOk: boolean;
  volOk: boolean;
  judgment: "진입 가능" | "관찰" | "제외";
  reason: string;
  unmet: string[];
  metCount: number;
};

function readinessPct(r: SignalRow): number {
  return Math.round(Math.min(100, Math.max(0, r.signalScore)));
}

export default function MarketWatchPage() {
  const [rows, setRows] = useState<SignalRow[]>([]);
  const [filter, setFilter] = useState("전체");
  const [strategyMeta, setStrategyMeta] = useState({ name: "SAFE_v44_i4060", hash: "7893ca3f0e30", timeframe: "확인되지 않음" });
  const [updatedAt, setUpdatedAt] = useState("");
  const [selected, setSelected] = useState<SignalRow | null>(null);
  const [candles, setCandles] = useState<CandlePoint[]>([]);
  const [showHelp, setShowHelp] = useState(false);

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
        timeframe: displayTimeframeLabel(active.timeframe)
      });
    }
    const coins = (market.data?.coins ?? market.coins ?? []) as Array<{
      symbol: string;
      price: number;
      quoteVolume?: number;
      change24hPct?: number;
      volatility?: number;
      aiScore?: number;
    }>;

    const sortedByVolume = [...coins].sort((a, b) => (b.quoteVolume ?? 0) - (a.quoteVolume ?? 0));
    const rankMap = new Map(sortedByVolume.map((c, i) => [c.symbol, i + 1]));

    const mapped: SignalRow[] = coins.slice(0, 50).map((c) => {
      const vol = c.quoteVolume ?? 0;
      const change = c.change24hPct ?? 0;
      const volatility = c.volatility ?? 0;
      const signalScore = c.aiScore ?? 0;
      const longOk = change > 0.5 && volatility < 8;
      const shortOk = change < -0.5 && volatility < 8;
      const costOk = vol > 1_000_000;
      const volOk = volatility < 8;
      const trendOk = Math.abs(change) > 0.5;
      const unmet: string[] = [];
      if (!trendOk) unmet.push("추세선 돌파");
      if (!volOk) unmet.push("변동성 안정");
      if (!costOk) unmet.push("거래대금 기준");
      if (!(longOk || shortOk)) unmet.push("방향 조건");
      const metCount = 4 - unmet.length;
      let judgment: SignalRow["judgment"] = "관찰";
      let side = "관찰";
      let signal = "조건 미충족";
      let reason = "전략 조건 대기";
      if (longOk && costOk && volOk) {
        judgment = "진입 가능";
        side = "롱";
        signal = "상승 추세";
        reason = "롱 조건·비용·변동성 통과";
      } else if (shortOk && costOk && volOk) {
        judgment = "진입 가능";
        side = "숏";
        signal = "하락 돌파";
        reason = "숏 조건·비용·변동성 통과";
      } else if (!costOk || !volOk) {
        judgment = "제외";
        reason = !costOk ? "유동성(거래대금) 미달" : "변동성 과다";
      }
      return {
        symbol: c.symbol,
        price: c.price,
        quoteVolume: vol,
        volumeRank: rankMap.get(c.symbol) ?? 0,
        change24hPct: change,
        volatility,
        signalScore,
        side,
        signal,
        longOk,
        shortOk,
        costOk,
        volOk,
        judgment,
        reason,
        unmet,
        metCount: Math.max(0, metCount)
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

  useEffect(() => {
    if (!selected) return;
    let active = true;
    void fetch(`/api/rextora/charts/candles?symbol=${selected.symbol}&interval=15m&limit=150`)
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
    let list = rows;
    if (filter === "진입 가능" || filter === "관찰" || filter === "제외") list = rows.filter((r) => r.judgment === filter);
    else if (filter === "롱 신호") list = rows.filter((r) => r.side === "롱");
    else if (filter === "숏 신호") list = rows.filter((r) => r.side === "숏");
    else if (filter === "비용 통과") list = rows.filter((r) => r.costOk);
    else if (filter === "변동성 낮음") list = rows.filter((r) => r.volOk);
    else if (filter === "거래량 상위") list = [...rows].sort((a, b) => a.volumeRank - b.volumeRank);
    return list;
  }, [rows, filter]);

  const structure = marketStructureLevels(candles);

  return (
    <div className="space-y-4" data-testid="market-watch-quant">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white">멀티코인 감시</h1>
          <p className="mt-1 text-sm text-slate-400">코인별 진입 준비도와 미충족 조건을 한눈에 확인합니다.</p>
        </div>
        <div className="flex gap-2">
          <Button tone="muted" onClick={() => setShowHelp((v) => !v)}>
            점수 설명
          </Button>
          <Button onClick={() => void load()}>새로고침</Button>
        </div>
      </div>

      {showHelp && (
        <Card title="점수 계산 안내">
          <ul className="list-disc space-y-1 pl-5 text-sm text-slate-300">
            <li>진입 준비도: 시장 점수(0~100)로, 높을수록 조건이 가깝습니다.</li>
            <li>추세·모멘텀·거래량·변동성·신호를 합쳐 종합 점수를 만듭니다.</li>
            <li>거래 비용(유동성)과 변동성 한도를 통과해야 「진입 가능」이 됩니다.</li>
            <li>이 점수는 참고용이며, 실제 진입은 전략 시그널·리스크 한도가 함께 결정합니다.</li>
          </ul>
        </Card>
      )}

      <Card title="활성 전략">
        <div className="grid gap-2 text-sm text-slate-300 md:grid-cols-4">
          <div>전략: {strategyMeta.name}</div>
          <div>
            {displayParamsHashLabel()}: {strategyMeta.hash}
          </div>
          <div>시간봉: {strategyMeta.timeframe}</div>
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

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {filtered.slice(0, 12).map((r) => (
          <button key={r.symbol} type="button" className="text-left" onClick={() => setSelected(r)} data-testid={`market-card-${r.symbol}`}>
            <Card title={r.symbol} className="!p-3 transition hover:border-sky-500/40">
              <div className="space-y-1 text-sm text-slate-300">
                <div>진입 준비도 {readinessPct(r)}%</div>
                <div>방향: {r.side}</div>
                <div>충족 조건: {r.metCount}개</div>
                <div>미충족 조건: {r.unmet.length ? r.unmet.join(", ") : "없음"}</div>
                <div>거래량 상태: {r.costOk ? "충분" : "부족"}</div>
                <div>변동성 상태: {r.volOk ? "안정" : "과다"}</div>
                <div>거래 비용: {r.costOk ? "통과" : "미통과"}</div>
                <div>
                  최종 판단:{" "}
                  <Badge tone={r.judgment === "진입 가능" ? "success" : r.judgment === "제외" ? "danger" : "warning"}>{r.judgment}</Badge>
                </div>
              </div>
              <div className="mt-2">
                <MeterChart
                  title="세부 점수"
                  meters={coinMeters({
                    change24hPct: r.change24hPct,
                    volumeChangePct: 0,
                    volatility: r.volatility,
                    aiScore: r.signalScore,
                    quoteVolume: r.quoteVolume
                  })}
                  compact
                />
              </div>
            </Card>
          </button>
        ))}
      </div>

      <Card title="전략 시그널 테이블">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1200px] text-left text-sm" data-testid="quant-signal-table">
            <thead className="text-slate-400">
              <tr>
                <th>코인</th>
                <th>현재가</th>
                <th>24시간 거래대금</th>
                <th>거래량 순위</th>
                <th>24시간 변동</th>
                <th>{uiLabel("Volatility")}</th>
                <th>{uiLabel("Score")}</th>
                <th>방향</th>
                <th>전략 신호</th>
                <th>최종 판단</th>
                <th>사유</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr
                  key={r.symbol}
                  className="cursor-pointer border-t border-slate-900 hover:bg-slate-900/50"
                  onClick={() => setSelected(r)}
                >
                  <td className="py-2">{r.symbol}</td>
                  <td>{r.price.toLocaleString()}</td>
                  <td>{Math.round(r.quoteVolume).toLocaleString()}</td>
                  <td>#{r.volumeRank}</td>
                  <td>{r.change24hPct.toFixed(2)}%</td>
                  <td>{r.volatility.toFixed(2)}%</td>
                  <td>{r.signalScore.toFixed(1)}</td>
                  <td>{r.side}</td>
                  <td>{r.signal}</td>
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

      {selected && (
        <div className="space-y-3" data-testid="market-coin-detail">
          <Card title={`${selected.symbol} · 시장 구조`}>
            <CandlestickChart candles={candles} levels={structure} height={320} />
            <div className="mt-3 grid gap-3 lg:grid-cols-2">
              <BarChart title="거래량" series={volumeSeries(candles)} height={140} />
              <MeterChart
                title="세부 점수"
                meters={coinMeters({
                  change24hPct: selected.change24hPct,
                  volumeChangePct: 0,
                  volatility: selected.volatility,
                  aiScore: selected.signalScore,
                  quoteVolume: selected.quoteVolume
                })}
              />
            </div>
            <p className="mt-2 text-xs text-slate-500">차트는 지지·저항·추세·오더블럭·공정가치 갭을 표시합니다. 가짜 거래 신호는 만들지 않습니다.</p>
            <Button className="mt-2" onClick={() => setSelected(null)}>
              닫기
            </Button>
          </Card>
        </div>
      )}
    </div>
  );
}
