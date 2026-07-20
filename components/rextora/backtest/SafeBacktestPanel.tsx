"use client";

import { useEffect, useMemo, useState } from "react";
import { Badge, Button, Card } from "@/components/ui/primitives";
import type { StoredStrategy } from "@/src/lib/rextora/strategy/strategyTypes";
import type { BacktestReport } from "@/src/lib/rextora/backtest/backtestTypes";
import { BacktestAnalysisView } from "@/components/rextora/charts/BacktestAnalysisView";
import type { OhlcvCandle } from "@/src/lib/rextora/data/ohlcvTypes";

type TradeRow = {
  side: string;
  signalType: string;
  entryBar: number;
  exitBar: number;
  entryPrice: number;
  exitPrice: number;
  pnlPct: number;
  feePct: number;
  slippagePct?: number;
  leverage: number;
  exitReason: string;
  symbol: string;
  holdBars?: number;
  stopLoss?: number;
  takeProfit?: number;
};

const PRESETS: Array<[string, number]> = [
  ["최근 1개월", 30],
  ["최근 3개월", 90],
  ["최근 6개월", 180],
  ["최근 10개월", 300],
  ["최근 1년", 365]
];

export function BacktestWorkbench() {
  const [strategies, setStrategies] = useState<StoredStrategy[]>([]);
  const [strategyId, setStrategyId] = useState("SAFE_v44_i4060");
  const [symbolsText, setSymbolsText] = useState("BTCUSDT");
  const [timeframe, setTimeframe] = useState("15m");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [balance, setBalance] = useState(10000);
  const [feeRate, setFeeRate] = useState(0.0004);
  const [slippageRate, setSlippageRate] = useState(0.0002);
  const [fundingRate, setFundingRate] = useState(0.0001);
  const [applyFunding, setApplyFunding] = useState(false);
  const [applySpread, setApplySpread] = useState(false);
  const [costGuardK, setCostGuardK] = useState(3);
  const [baseBalPct, setBaseBalPct] = useState(0.02);
  const [loading, setLoading] = useState(false);
  const [report, setReport] = useState<BacktestReport | null>(null);
  const [trades, setTrades] = useState<TradeRow[]>([]);
  const [equityCurve, setEquityCurve] = useState<number[]>([]);
  const [candles, setCandles] = useState<OhlcvCandle[]>([]);
  const [message, setMessage] = useState("");

  useEffect(() => {
    const timer = setTimeout(() => {
      void fetch("/api/rextora/strategies")
        .then((r) => r.json())
        .then((j) => {
          const list = (j.data ?? []) as StoredStrategy[];
          setStrategies(list);
          if (list[0]) setStrategyId(list.find((s) => s.paperActive)?.id ?? list[0].id);
        });
    }, 0);
    return () => clearTimeout(timer);
  }, []);

  const strategy = useMemo(() => strategies.find((s) => s.id === strategyId) ?? null, [strategies, strategyId]);

  function applyPreset(days: number) {
    const to = new Date();
    const from = new Date(to.getTime() - days * 86400000);
    setToDate(to.toISOString().slice(0, 10));
    setFromDate(from.toISOString().slice(0, 10));
  }

  async function run(save = false) {
    setLoading(true);
    setMessage("");
    try {
      const symbols = symbolsText
        .split(/[,\s]+/)
        .map((s) => s.trim().toUpperCase())
        .filter(Boolean);
      const res = await fetch("/api/rextora/backtest/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          strategyId,
          symbols,
          timeframe,
          fromOpenTime: fromDate ? Date.parse(fromDate) : undefined,
          toOpenTime: toDate ? Date.parse(toDate) + 86400000 - 1 : undefined,
          balance,
          feeRate,
          slippageRate,
          fundingRate,
          applyFunding,
          applySpread,
          costGuardK,
          baseBalPct,
          costStressMultipliers: [1, 1.5, 2],
          save
        })
      });
      const json = await res.json();
      const payload = json.data;
      if (!json.ok || !payload?.report) {
        setMessage(json.error ?? "백테스트 실패");
        return;
      }
      setReport(payload.report);
      setTrades(payload.trades ?? []);
      setEquityCurve(payload.equityCurve ?? []);
      setCandles(payload.candles ?? []);
      setMessage(save ? "결과가 저장되었고 전략 성과에 반영되었습니다." : "백테스트 완료 (실주문 없음)");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-4" data-testid="backtest-panel">
      <Card title="백테스트 설정">
        <div className="grid gap-3 md:grid-cols-3">
          <label className="text-sm text-slate-300">
            전략 선택
            <select className="mt-1 w-full rounded border border-slate-700 bg-slate-950 px-3 py-2" value={strategyId} onChange={(e) => setStrategyId(e.target.value)} data-testid="backtest-strategy">
              {strategies.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm text-slate-300">
            심볼 (쉼표 구분)
            <input className="mt-1 w-full rounded border border-slate-700 bg-slate-950 px-3 py-2" value={symbolsText} onChange={(e) => setSymbolsText(e.target.value)} data-testid="backtest-symbol" />
          </label>
          <div className="flex flex-wrap items-end gap-2">
            <Button onClick={() => setSymbolsText("BTCUSDT,ETHUSDT,SOLUSDT,BNBUSDT,XRPUSDT,ADAUSDT,DOGEUSDT,AVAXUSDT,LINKUSDT,DOTUSDT")}>Top 10</Button>
            <Button onClick={() => setSymbolsText("BTCUSDT")}>단일</Button>
          </div>
        </div>

        {strategy && (
          <div className="mt-3 rounded-lg border border-slate-800 bg-slate-950/60 p-3 text-sm text-slate-300" data-testid="backtest-strategy-summary">
            <div>전략: {strategy.name}</div>
            <div>hash: {strategy.paramsHash}</div>
            <div>타임프레임: {strategy.timeframe === "unknown" ? "Unknown" : strategy.timeframe}</div>
            <div>sourceStatus: {strategy.sourceStatus}</div>
            <div>최근 백테스트: {strategy.lastBacktest?.at?.slice(0, 10) ?? "-"}</div>
          </div>
        )}

        <div className="mt-4 grid gap-3 md:grid-cols-4">
          <label className="text-sm text-slate-300">
            시작일
            <input type="date" className="mt-1 w-full rounded border border-slate-700 bg-slate-950 px-3 py-2" value={fromDate} onChange={(e) => setFromDate(e.target.value)} data-testid="backtest-from" />
          </label>
          <label className="text-sm text-slate-300">
            종료일
            <input type="date" className="mt-1 w-full rounded border border-slate-700 bg-slate-950 px-3 py-2" value={toDate} onChange={(e) => setToDate(e.target.value)} data-testid="backtest-to" />
          </label>
          <label className="text-sm text-slate-300">
            타임프레임
            <select className="mt-1 w-full rounded border border-slate-700 bg-slate-950 px-3 py-2" value={timeframe} onChange={(e) => setTimeframe(e.target.value)} data-testid="backtest-timeframe">
              {["1m", "3m", "5m", "15m", "1h"].map((tf) => (
                <option key={tf} value={tf}>
                  {tf}
                </option>
              ))}
            </select>
          </label>
          <div className="flex flex-wrap items-end gap-2">
            {PRESETS.map(([label, days]) => (
              <Button key={label} onClick={() => applyPreset(days)}>
                {label}
              </Button>
            ))}
          </div>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-4" data-testid="backtest-cost-settings">
          <label className="text-sm text-slate-300">
            초기 자본
            <input type="number" className="mt-1 w-full rounded border border-slate-700 bg-slate-950 px-3 py-2" value={balance} onChange={(e) => setBalance(Number(e.target.value))} />
          </label>
          <label className="text-sm text-slate-300">
            수수료율
            <input type="number" step="0.0001" className="mt-1 w-full rounded border border-slate-700 bg-slate-950 px-3 py-2" value={feeRate} onChange={(e) => setFeeRate(Number(e.target.value))} />
          </label>
          <label className="text-sm text-slate-300">
            슬리피지
            <input type="number" step="0.0001" className="mt-1 w-full rounded border border-slate-700 bg-slate-950 px-3 py-2" value={slippageRate} onChange={(e) => setSlippageRate(Number(e.target.value))} />
          </label>
          <label className="text-sm text-slate-300">
            cost_guard_k
            <input type="number" step="0.1" className="mt-1 w-full rounded border border-slate-700 bg-slate-950 px-3 py-2" value={costGuardK} onChange={(e) => setCostGuardK(Number(e.target.value))} />
          </label>
          <label className="text-sm text-slate-300">
            펀딩비
            <input type="number" step="0.0001" className="mt-1 w-full rounded border border-slate-700 bg-slate-950 px-3 py-2" value={fundingRate} onChange={(e) => setFundingRate(Number(e.target.value))} />
          </label>
          <label className="flex items-center gap-2 text-sm text-slate-300">
            <input type="checkbox" checked={applyFunding} onChange={(e) => setApplyFunding(e.target.checked)} /> 펀딩비 반영
          </label>
          <label className="flex items-center gap-2 text-sm text-slate-300">
            <input type="checkbox" checked={applySpread} onChange={(e) => setApplySpread(e.target.checked)} /> 스프레드 반영
          </label>
          <label className="text-sm text-slate-300">
            base_bal_pct
            <input type="number" step="0.001" className="mt-1 w-full rounded border border-slate-700 bg-slate-950 px-3 py-2" value={baseBalPct} onChange={(e) => setBaseBalPct(Number(e.target.value))} />
          </label>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <Button tone="success" data-testid="backtest-run" disabled={loading} onClick={() => void run(false)}>
            {loading ? "실행 중..." : "백테스트 실행"}
          </Button>
          <Button data-testid="backtest-stress" disabled={loading} onClick={() => void run(false)}>
            비용 스트레스 테스트 실행
          </Button>
          <Button data-testid="backtest-save" disabled={loading} onClick={() => void run(true)}>
            결과 저장 / 전략 성과 반영
          </Button>
        </div>
        <p className="rextora-helper mt-3 text-slate-400">실거래 주문은 절대 발생하지 않습니다.</p>
        {message && <p className="mt-2 text-sm text-emerald-300">{message}</p>}
      </Card>

      {report && (
        <>
          <BacktestAnalysisView
            report={report}
            trades={trades.map((t) => ({
              ...t,
              side: t.side === "SHORT" ? "SHORT" : "LONG",
              stopLoss: t.stopLoss ?? 0,
              takeProfit: t.takeProfit ?? 0,
              exitReason: (t.exitReason as "take_profit" | "stop_loss" | "trailing_stop" | "max_hold" | "end") ?? "end"
            }))}
            equityCurve={equityCurve.length ? equityCurve : [report.startingBalance, report.endingBalance]}
            candles={candles}
          />

          {report.costStress && (
            <Card title="비용 스트레스 비교" data-testid="backtest-cost-stress">
              <table className="w-full text-left text-sm">
                <thead className="text-slate-400">
                  <tr>
                    <th>배율</th>
                    <th>수익률</th>
                    <th>MDD</th>
                    <th>거래</th>
                    <th>음수월</th>
                  </tr>
                </thead>
                <tbody>
                  {report.costStress.map((row) => (
                    <tr key={row.multiplier} className="border-t border-slate-900">
                      <td className="py-2">x{row.multiplier.toFixed(1)}</td>
                      <td>{(row.totalReturn * 100).toFixed(2)}%</td>
                      <td>{(row.mdd * 100).toFixed(2)}%</td>
                      <td>{row.tradeCount}</td>
                      <td>{row.negativeMonths}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          )}

          <Card title="거래 리스트">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px] text-left text-sm">
                <thead className="text-slate-400">
                  <tr>
                    <th>코인</th>
                    <th>방향</th>
                    <th>진입</th>
                    <th>청산</th>
                    <th>손익</th>
                    <th>청산 이유</th>
                    <th>수수료</th>
                    <th>슬리피지</th>
                    <th>레버리지</th>
                    <th>보유</th>
                  </tr>
                </thead>
                <tbody>
                  {trades.slice(0, 100).map((t, i) => (
                    <tr key={`${t.symbol}-${t.entryBar}-${i}`} className="border-t border-slate-900">
                      <td className="py-2">{t.symbol}</td>
                      <td>
                        <Badge>{t.side}</Badge>
                      </td>
                      <td>
                        #{t.entryBar} / {t.entryPrice.toFixed(4)}
                      </td>
                      <td>
                        #{t.exitBar} / {t.exitPrice.toFixed(4)}
                      </td>
                      <td className={t.pnlPct >= 0 ? "text-green-300" : "text-red-300"}>{(t.pnlPct * 100).toFixed(2)}%</td>
                      <td>{t.exitReason}</td>
                      <td>{(t.feePct * 100).toFixed(3)}%</td>
                      <td>{((t.slippagePct ?? 0) * 100).toFixed(3)}%</td>
                      <td>{t.leverage.toFixed(2)}</td>
                      <td>{t.holdBars ?? t.exitBar - t.entryBar}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}
    </div>
  );
}
