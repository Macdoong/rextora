"use client";

import { Metric } from "@/components/ui/primitives";
import {
  BACKTEST_OPERATOR_UNAVAILABLE,
  backtestOperatorFormatCount,
  backtestOperatorFormatNumber,
  backtestOperatorFormatPct,
  backtestOperatorFormatUsdt,
  type BacktestOperatorDerivedTradeStats,
} from "@/src/lib/rextora/backtest/backtestOperatorPresentation";

function text(value: number | typeof BACKTEST_OPERATOR_UNAVAILABLE, kind: "pct" | "usdt" | "num" | "count"): string {
  if (typeof value !== "number") return BACKTEST_OPERATOR_UNAVAILABLE;
  if (kind === "pct") return backtestOperatorFormatPct(value);
  if (kind === "usdt") return backtestOperatorFormatUsdt(value);
  if (kind === "count") return backtestOperatorFormatCount(value);
  return backtestOperatorFormatNumber(value);
}

export function BacktestPerformanceSection({
  totalReturn,
  netPnl,
  stats,
}: {
  totalReturn: number | typeof BACKTEST_OPERATOR_UNAVAILABLE;
  netPnl: number | typeof BACKTEST_OPERATOR_UNAVAILABLE;
  stats: BacktestOperatorDerivedTradeStats;
}) {
  return (
    <section className="bt-op-panel" data-testid="backtest-performance-section">
      <h3 className="bt-op-section-title">성과 분석</h3>
      <div className="bt-op-kpi-grid">
        <Metric
          label="총수익률"
          value={text(totalReturn, "pct")}
        />
        <Metric label="순손익" value={text(netPnl, "usdt")} />
        <Metric label="평균 거래 손익" value={text(stats.averageTradePnl, "num")} />
        <Metric label="이익 거래" value={text(stats.winningTrades, "count")} />
        <Metric label="손실 거래" value={text(stats.losingTrades, "count")} />
        <Metric
          label="손익비"
          value={
            typeof stats.profitFactor === "number"
              ? text(stats.profitFactor, "num")
              : text(stats.payoffRatio, "num")
          }
        />
      </div>
    </section>
  );
}
