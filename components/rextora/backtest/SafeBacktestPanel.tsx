"use client";

import { useEffect, useMemo, useState } from "react";
import { Badge, Button, Card } from "@/components/ui/primitives";
import type { StoredStrategy } from "@/src/lib/rextora/strategy/strategyTypes";
import type { BacktestReport } from "@/src/lib/rextora/backtest/backtestTypes";
import { BacktestAnalysisView } from "@/components/rextora/charts/BacktestAnalysisView";
import type { OhlcvCandle } from "@/src/lib/rextora/data/ohlcvTypes";
import {
  MultiSymbolWorkspace,
  type SymbolResultPayload,
} from "@/components/rextora/backtest/MultiSymbolWorkspace";
import {
  displayDirection,
  displayParamsHashLabel,
  displaySignalReason,
  displaySourceStatus,
  displayTimeframeLabel,
  uiLabel,
} from "@/src/lib/rextora/displayLabels";
import { computeDayPresetRange } from "@/src/lib/rextora/backtest/backtestDateRange";

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

/** Expert panel keeps the extra 10-month preset; day math is shared. */
const PRESETS: Array<[string, number]> = [
  ["최근 1개월", 30],
  ["최근 3개월", 90],
  ["최근 6개월", 180],
  ["최근 10개월", 300],
  ["최근 1년", 365],
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
  const [symbolResults, setSymbolResults] = useState<SymbolResultPayload[]>([]);
  const [selectedSymbol, setSelectedSymbol] = useState("BTCUSDT");
  const [combinedReport, setCombinedReport] = useState<BacktestReport | null>(
    null,
  );
  const [requestedSymbols, setRequestedSymbols] = useState<string[]>([]);
  const [successSymbols, setSuccessSymbols] = useState<string[]>([]);
  const [failedSymbols, setFailedSymbols] = useState<string[]>([]);
  const [chartSamplingApplied, setChartSamplingApplied] = useState(false);
  const [processedCandleCount, setProcessedCandleCount] = useState(0);

  useEffect(() => {
    const timer = setTimeout(() => {
      void fetch("/api/rextora/strategies")
        .then((r) => r.json())
        .then((j) => {
          const list = (j.data ?? []) as StoredStrategy[];
          setStrategies(list);
          if (list[0])
            setStrategyId(list.find((s) => s.paperActive)?.id ?? list[0].id);
        });
    }, 0);
    return () => clearTimeout(timer);
  }, []);

  const strategy = useMemo(
    () => strategies.find((s) => s.id === strategyId) ?? null,
    [strategies, strategyId],
  );

  function applyPreset(days: number) {
    const range = computeDayPresetRange(days);
    setFromDate(range.fromDate);
    setToDate(range.toDate);
  }

  async function run(save = false) {
    setLoading(true);
    setMessage("");
    setReport(null);
    setTrades([]);
    setEquityCurve([]);
    setCandles([]);
    setSymbolResults([]);
    setCombinedReport(null);
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
          fromOpenTime: fromDate ? Date.parse(`${fromDate}T00:00:00.000Z`) : undefined,
          toOpenTime: toDate
            ? Date.parse(`${toDate}T23:59:59.999Z`)
            : undefined,
          balance,
          feeRate,
          slippageRate,
          fundingRate,
          applyFunding,
          applySpread,
          costGuardK,
          baseBalPct,
          costStressMultipliers: [1, 1.5, 2],
          save,
        }),
      });
      const json = await res.json();
      const payload = json.data;
      if (!json.ok || !payload?.report) {
        setMessage(json.error ?? "백테스트 실패");
        return;
      }

      const results = (payload.symbolResults ?? []) as SymbolResultPayload[];
      const normalized: SymbolResultPayload[] =
        results.length > 0
          ? results
          : [
              {
                symbol: payload.report.symbol ?? symbols[0] ?? "BTCUSDT",
                status:
                  payload.report.tradeCount === 0 ? "zero_trades" : "ok",
                report: payload.report,
                trades: payload.trades ?? [],
                equityCurve: payload.equityCurve ?? [],
                candles: payload.candles ?? payload.chartCandles ?? [],
                chartCandles: payload.chartCandles ?? payload.candles ?? [],
                chartSamplingApplied: Boolean(payload.chartSamplingApplied),
                processedCandleCount:
                  payload.processedCandleCount ??
                  payload.report.processedCandleCount ??
                  0,
              },
            ];

      setSymbolResults(normalized);
      setCombinedReport(payload.combinedReport ?? null);
      setRequestedSymbols(payload.requestedSymbols ?? symbols);
      setSuccessSymbols(
        payload.successSymbols ??
          normalized.filter((r) => r.report).map((r) => r.symbol),
      );
      setFailedSymbols(
        payload.failedSymbols ??
          normalized.filter((r) => r.status === "failed").map((r) => r.symbol),
      );

      const firstOk =
        normalized.find((r) => r.report != null) ?? normalized[0];
      const pickSymbol = firstOk?.symbol ?? symbols[0] ?? "BTCUSDT";
      setSelectedSymbol(pickSymbol);
      applySymbolPayload(firstOk, payload);
      setMessage(
        save
          ? "결과가 저장되었고 전략 성과에 반영되었습니다."
          : `백테스트 완료 (실주문 없음) · 심볼 ${normalized.length}개`,
      );
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "백테스트를 실행하지 못했습니다.",
      );
    } finally {
      setLoading(false);
    }
  }

  function applySymbolPayload(
    active: SymbolResultPayload | undefined,
    payload?: { chartSamplingApplied?: boolean; processedCandleCount?: number },
  ) {
    if (!active?.report) return;
    setReport(active.report);
    setTrades((active.trades as TradeRow[]) ?? []);
    setEquityCurve(active.equityCurve ?? []);
    setCandles(
      (active.chartCandles as OhlcvCandle[]) ??
        (active.candles as OhlcvCandle[]) ??
        [],
    );
    setChartSamplingApplied(
      Boolean(active.chartSamplingApplied ?? payload?.chartSamplingApplied),
    );
    setProcessedCandleCount(
      active.processedCandleCount ??
        payload?.processedCandleCount ??
        active.report.processedCandleCount ??
        0,
    );
  }

  function selectSymbol(symbol: string) {
    setSelectedSymbol(symbol);
    const active = symbolResults.find((r) => r.symbol === symbol);
    applySymbolPayload(active);
  }

  return (
    <div className="space-y-4" data-testid="backtest-panel">
      <Card title="백테스트 설정">
        <div className="grid gap-3 md:grid-cols-3">
          <label className="text-sm text-slate-300">
            전략 선택
            <select
              className="mt-1 w-full rounded border border-slate-700 bg-slate-950 px-3 py-2"
              value={strategyId}
              onChange={(e) => setStrategyId(e.target.value)}
              data-testid="backtest-strategy"
            >
              {strategies.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm text-slate-300">
            심볼 (쉼표 구분)
            <input
              className="mt-1 w-full rounded border border-slate-700 bg-slate-950 px-3 py-2"
              value={symbolsText}
              onChange={(e) => setSymbolsText(e.target.value)}
              data-testid="backtest-symbol"
            />
          </label>
          <div className="flex flex-wrap items-end gap-2">
            <Button
              data-testid="backtest-top10"
              onClick={() =>
                setSymbolsText(
                  "BTCUSDT,ETHUSDT,SOLUSDT,BNBUSDT,XRPUSDT,ADAUSDT,DOGEUSDT,AVAXUSDT,LINKUSDT,DOTUSDT",
                )
              }
            >
              Top 10
            </Button>
            <Button onClick={() => setSymbolsText("BTCUSDT")}>단일</Button>
          </div>
        </div>

        {strategy && (
          <div
            className="mt-3 rounded-lg border border-slate-800 bg-slate-950/60 p-3 text-sm text-slate-300"
            data-testid="backtest-strategy-summary"
          >
            <div>전략: {strategy.name}</div>
            <div>
              {displayParamsHashLabel()}: {strategy.paramsHash}
            </div>
            <div>시간봉: {displayTimeframeLabel(strategy.timeframe)}</div>
            <div>설정 출처: {displaySourceStatus(strategy.sourceStatus)}</div>
            <div>
              최근 백테스트: {strategy.lastBacktest?.at?.slice(0, 10) ?? "-"}
            </div>
          </div>
        )}

        <div className="mt-4 grid gap-3 md:grid-cols-4">
          <label className="text-sm text-slate-300">
            시작일
            <input
              type="date"
              className="mt-1 w-full rounded border border-slate-700 bg-slate-950 px-3 py-2"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              data-testid="backtest-from"
            />
          </label>
          <label className="text-sm text-slate-300">
            종료일
            <input
              type="date"
              className="mt-1 w-full rounded border border-slate-700 bg-slate-950 px-3 py-2"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              data-testid="backtest-to"
            />
          </label>
          <label className="text-sm text-slate-300">
            타임프레임
            <select
              className="mt-1 w-full rounded border border-slate-700 bg-slate-950 px-3 py-2"
              value={timeframe}
              onChange={(e) => setTimeframe(e.target.value)}
              data-testid="backtest-timeframe"
            >
              {["1m", "3m", "5m", "15m", "1h"].map((tf) => (
                <option key={tf} value={tf}>
                  {displayTimeframeLabel(tf)}
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

        <div
          className="mt-4 grid gap-3 md:grid-cols-4"
          data-testid="backtest-cost-settings"
        >
          <label className="text-sm text-slate-300">
            초기 자본
            <input
              type="number"
              className="mt-1 w-full rounded border border-slate-700 bg-slate-950 px-3 py-2"
              value={balance}
              onChange={(e) => setBalance(Number(e.target.value))}
            />
          </label>
          <label className="text-sm text-slate-300">
            수수료율
            <input
              type="number"
              step="0.0001"
              className="mt-1 w-full rounded border border-slate-700 bg-slate-950 px-3 py-2"
              value={feeRate}
              onChange={(e) => setFeeRate(Number(e.target.value))}
            />
          </label>
          <label className="text-sm text-slate-300">
            슬리피지
            <input
              type="number"
              step="0.0001"
              className="mt-1 w-full rounded border border-slate-700 bg-slate-950 px-3 py-2"
              value={slippageRate}
              onChange={(e) => setSlippageRate(Number(e.target.value))}
            />
          </label>
          <label className="text-sm text-slate-300">
            {uiLabel("cost_guard_k")}
            <input
              type="number"
              step="0.1"
              className="mt-1 w-full rounded border border-slate-700 bg-slate-950 px-3 py-2"
              value={costGuardK}
              onChange={(e) => setCostGuardK(Number(e.target.value))}
            />
          </label>
          <label className="text-sm text-slate-300">
            펀딩비
            <input
              type="number"
              step="0.0001"
              className="mt-1 w-full rounded border border-slate-700 bg-slate-950 px-3 py-2"
              value={fundingRate}
              onChange={(e) => setFundingRate(Number(e.target.value))}
            />
          </label>
          <label className="flex items-center gap-2 text-sm text-slate-300">
            <input
              type="checkbox"
              checked={applyFunding}
              onChange={(e) => setApplyFunding(e.target.checked)}
            />{" "}
            펀딩비 반영
          </label>
          <label className="flex items-center gap-2 text-sm text-slate-300">
            <input
              type="checkbox"
              checked={applySpread}
              onChange={(e) => setApplySpread(e.target.checked)}
            />{" "}
            스프레드 반영
          </label>
          <label className="text-sm text-slate-300">
            {uiLabel("base_bal_pct")}
            <input
              type="number"
              step="0.001"
              className="mt-1 w-full rounded border border-slate-700 bg-slate-950 px-3 py-2"
              value={baseBalPct}
              onChange={(e) => setBaseBalPct(Number(e.target.value))}
            />
          </label>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <Button
            tone="success"
            data-testid="backtest-run"
            disabled={loading}
            onClick={() => void run(false)}
          >
            {loading ? "실행 중..." : "백테스트 실행"}
          </Button>
          <Button
            data-testid="backtest-stress"
            disabled={loading}
            onClick={() => void run(false)}
          >
            비용 스트레스 테스트 실행
          </Button>
          <Button
            data-testid="backtest-save"
            disabled={loading}
            onClick={() => void run(true)}
          >
            결과 저장 / 전략 성과 반영
          </Button>
        </div>
        <p className="rextora-helper mt-3 rx-text-muted">
          실거래 주문은 절대 발생하지 않습니다.
        </p>
        {message && (
          <p
            className="mt-2 text-sm text-emerald-300"
            data-testid="backtest-message"
          >
            {message}
          </p>
        )}
      </Card>

      {symbolResults.length > 1 && (
        <MultiSymbolWorkspace
          symbolResults={symbolResults}
          selectedSymbol={selectedSymbol}
          onSelectSymbol={selectSymbol}
          combinedReport={combinedReport}
          requestedSymbols={requestedSymbols}
          successSymbols={successSymbols}
          failedSymbols={failedSymbols}
        />
      )}

      {report && (
        <div
          key={`${selectedSymbol}:${report.tradeCount}:${processedCandleCount}:${report.requestedFrom ?? ""}:${report.requestedTo ?? ""}`}
          data-testid="selected-symbol-workspace"
        >
          {symbolResults.length > 1 && (
            <p className="mb-2 text-sm rx-text-muted">
              상세 분석:{" "}
              <span className="font-semibold rx-text-primary">
                {selectedSymbol}
              </span>
            </p>
          )}
          <BacktestAnalysisView
            report={report}
            trades={trades.map((t) => ({
              ...t,
              side: t.side === "SHORT" ? "SHORT" : "LONG",
              stopLoss: t.stopLoss ?? 0,
              takeProfit: t.takeProfit ?? 0,
              exitReason:
                (t.exitReason as
                  | "take_profit"
                  | "stop_loss"
                  | "trailing_stop"
                  | "max_hold"
                  | "end") ?? "end",
            }))}
            equityCurve={
              equityCurve.length
                ? equityCurve
                : [report.startingBalance, report.endingBalance]
            }
            candles={candles}
            chartSamplingApplied={chartSamplingApplied}
            processedCandleCount={processedCandleCount}
          />

          {report.costStress && (
            <Card title="비용 스트레스 비교" data-testid="backtest-cost-stress">
              <table className="w-full text-left text-sm">
                <thead className="rx-text-muted">
                  <tr>
                    <th>배율</th>
                    <th>수익률</th>
                    <th>최대 낙폭</th>
                    <th>거래</th>
                    <th>음수월</th>
                  </tr>
                </thead>
                <tbody>
                  {report.costStress.map((row) => (
                    <tr
                      key={row.multiplier}
                      className="border-t border-slate-900"
                    >
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
        </div>
      )}
    </div>
  );
}
