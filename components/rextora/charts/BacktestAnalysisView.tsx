"use client";

import { Card, Metric } from "@/components/ui/primitives";
import {
  BarChart,
  CandlestickChart,
  DistributionChart,
  DrawdownChart,
  EquityCurveChart,
  HeatmapChart,
  TimelineChart
} from "@/components/rextora/charts";
import {
  candlesToPoints,
  drawdownFromEquity,
  durationDistribution,
  equityCurveToSeries,
  feeHistorySeries,
  monthlyHeatmap,
  rollingProfitFactor,
  rollingWinRate,
  tradesToMarkers,
  backtestTradeTimeline,
  winLossDistribution
} from "@/src/lib/rextora/charts/adapters";
import type { BacktestReport } from "@/src/lib/rextora/backtest/backtestTypes";
import type { BacktestTrade } from "@/src/lib/rextora/backtest/backtestEngine";
import type { OhlcvCandle } from "@/src/lib/rextora/data/ohlcvTypes";
import { displayParamsHashLabel, displayTimeframeLabel } from "@/src/lib/rextora/displayLabels";

export function BacktestAnalysisView({
  report,
  trades,
  equityCurve,
  candles
}: {
  report: BacktestReport;
  trades: BacktestTrade[];
  equityCurve: number[];
  candles: OhlcvCandle[];
}) {
  const candlePoints = candlesToPoints(candles);
  const markers = tradesToMarkers(trades);
  const equity = equityCurveToSeries(equityCurve);
  const drawdown = drawdownFromEquity(equityCurve);
  const largestWin = trades.reduce((m, t) => Math.max(m, t.pnlPct), 0);
  const largestLoss = trades.reduce((m, t) => Math.min(m, t.pnlPct), 0);
  const netProfit = report.endingBalance - report.startingBalance;
  const grossProfit = trades.filter((t) => t.pnlPct > 0).reduce((s, t) => s + t.pnlPct, 0) * report.startingBalance;
  const hasCandles = candlePoints.length > 0;

  return (
    <div className="space-y-4" data-testid="backtest-analysis">
      <Card title="결과 요약" data-testid="backtest-summary">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-7">
          <Metric label="시작 자본" value={`${report.startingBalance.toFixed(0)}`} />
          <Metric label="현재 자산" value={`${report.endingBalance.toFixed(2)}`} />
          <Metric label="순손익" value={`${netProfit.toFixed(2)}`} tone={netProfit >= 0 ? "success" : "danger"} />
          <Metric label="총이익" value={`${grossProfit.toFixed(2)}`} />
          <Metric label="순수익률" value={`${(report.totalReturn * 100).toFixed(2)}%`} />
          <Metric label="최대 낙폭" value={`${(report.mdd * 100).toFixed(2)}%`} tone="danger" />
          <Metric label="손익비" value={report.profitFactor.toFixed(2)} />
          <Metric label="승률" value={`${(report.winRate * 100).toFixed(1)}%`} />
          <Metric label="거래 수" value={report.tradeCount} />
          <Metric label="평균 거래" value={`${(report.averageTrade * 100).toFixed(2)}%`} />
          <Metric label="최대 이익" value={`${(largestWin * 100).toFixed(2)}%`} tone="success" />
          <Metric label="최대 손실" value={`${(largestLoss * 100).toFixed(2)}%`} tone="danger" />
          <Metric label="총 수수료" value={`${(report.feeTotal * 100).toFixed(3)}%`} />
          <Metric label="슬리피지" value={`${(report.slippageTotal * 100).toFixed(3)}%`} />
        </div>
      </Card>

      {hasCandles ? (
        <CandlestickChart
          title={`${report.symbol} · ${displayTimeframeLabel(report.timeframe)}`}
          candles={candlePoints}
          markers={markers}
          height={360}
        />
      ) : (
        <Card title="가격 차트" className="!p-3">
          <p className="text-sm text-slate-400">캔들 데이터가 없습니다. 백테스트를 다시 실행하면 차트가 표시됩니다.</p>
        </Card>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <EquityCurveChart title="자산 곡선" series={equity} height={220} />
        <DrawdownChart title="낙폭" series={drawdown} height={220} />
      </div>

      <TimelineChart title="거래 타임라인" events={backtestTradeTimeline(trades)} height={140} showLabels />

      <div className="grid gap-4 lg:grid-cols-2">
        <HeatmapChart title="월별 수익률" cells={monthlyHeatmap(report)} height={160} />
        <DistributionChart title="승 / 패 분포" bins={winLossDistribution(trades)} height={160} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <DistributionChart title="보유 기간 (봉)" bins={durationDistribution(trades)} height={160} />
        <BarChart title="수수료 내역 (누적 %)" series={feeHistorySeries(trades)} height={160} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <EquityCurveChart title="이동 승률" series={rollingWinRate(trades)} height={180} area={false} />
        <EquityCurveChart title="이동 손익비" series={rollingProfitFactor(trades)} height={180} area={false} />
      </div>

      <Card title="검증 상태" data-testid="backtest-validation">
        <div className="grid grid-cols-2 gap-2 text-sm text-slate-300 md:grid-cols-3">
          <div>{displayParamsHashLabel()} 검증: {report.validation.paramsHashVerified ? "통과" : "확인"}</div>
          <div>
            데이터 범위: {report.fromDate ?? "-"} ~ {report.toDate ?? "-"}
          </div>
          <div>캔들 수: {report.candleCount}</div>
          <div>수수료 적용: {report.validation.feesApplied ? "예" : "아니오"}</div>
          <div>슬리피지 적용: {report.validation.slippageApplied ? "예" : "아니오"}</div>
          <div>펀딩비 적용: {report.validation.fundingApplied ? "예" : "아니오"}</div>
          <div>실주문: 없음</div>
          <div>
            {displayParamsHashLabel()}: {report.strategyHash}
          </div>
        </div>
      </Card>
    </div>
  );
}
