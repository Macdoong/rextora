"use client";

import { Metric } from "@/components/ui/primitives";
import {
  BACKTEST_OPERATOR_UNAVAILABLE,
  backtestOperatorFormatCount,
  backtestOperatorFormatPct,
  backtestOperatorFormatUsdt,
  type BacktestOperatorDerivedTradeStats,
} from "@/src/lib/rextora/backtest/backtestOperatorPresentation";

function text(
  value: number | typeof BACKTEST_OPERATOR_UNAVAILABLE,
  kind: "pct" | "usdt" | "count",
): string {
  if (typeof value !== "number") return BACKTEST_OPERATOR_UNAVAILABLE;
  if (kind === "pct") return backtestOperatorFormatPct(value);
  if (kind === "usdt") return backtestOperatorFormatUsdt(value);
  return backtestOperatorFormatCount(value);
}

export function BacktestRiskSection({
  mdd,
  stats,
}: {
  mdd: number | typeof BACKTEST_OPERATOR_UNAVAILABLE;
  stats: BacktestOperatorDerivedTradeStats;
}) {
  return (
    <section className="bt-op-panel" data-testid="backtest-risk-section">
      <h3 className="bt-op-section-title">위험 분석</h3>
      <div className="bt-op-kpi-grid">
        <Metric label="최대 낙폭" value={text(mdd, "pct")} tone="danger" />
        <Metric
          label="최대 연속 손실"
          value={text(stats.maxConsecutiveLosses, "count")}
          tone="warning"
        />
        <Metric
          label="최대 연속 이익"
          value={text(stats.maxConsecutiveWins, "count")}
        />
        <Metric
          label="손실 거래 비율"
          value={text(stats.losingTradeFrequency, "pct")}
        />
        <Metric
          label="수수료 부담"
          value={text(stats.feeBurdenUsdt, "usdt")}
        />
      </div>
    </section>
  );
}
