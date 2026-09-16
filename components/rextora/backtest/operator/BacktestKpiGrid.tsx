"use client";

import { Metric } from "@/components/ui/primitives";
import {
  BACKTEST_OPERATOR_UNAVAILABLE,
  backtestOperatorFormatCount,
  backtestOperatorFormatNumber,
  backtestOperatorFormatPct,
  backtestOperatorFormatUsdt,
} from "@/src/lib/rextora/backtest/backtestOperatorPresentation";

type KpiTone = "default" | "success" | "danger" | "warning";

function toneFromSigned(value: number | typeof BACKTEST_OPERATOR_UNAVAILABLE): KpiTone {
  if (typeof value !== "number") return "default";
  if (value > 0) return "success";
  if (value < 0) return "danger";
  return "default";
}

export function BacktestKpiGrid({
  totalReturn,
  netPnl,
  winRate,
  tradeCount,
  averageTrade,
  profitFactor,
  payoffRatio,
  mdd,
  maxConsecutiveLosses,
  stale,
}: {
  totalReturn: number | typeof BACKTEST_OPERATOR_UNAVAILABLE;
  netPnl: number | typeof BACKTEST_OPERATOR_UNAVAILABLE;
  winRate: number | typeof BACKTEST_OPERATOR_UNAVAILABLE;
  tradeCount: number | typeof BACKTEST_OPERATOR_UNAVAILABLE;
  averageTrade: number | typeof BACKTEST_OPERATOR_UNAVAILABLE;
  profitFactor: number | typeof BACKTEST_OPERATOR_UNAVAILABLE;
  payoffRatio: number | typeof BACKTEST_OPERATOR_UNAVAILABLE;
  mdd: number | typeof BACKTEST_OPERATOR_UNAVAILABLE;
  maxConsecutiveLosses: number | typeof BACKTEST_OPERATOR_UNAVAILABLE;
  stale?: boolean;
}) {
  return (
    <section
      className="bt-op-kpi"
      data-testid="backtest-kpi-grid"
      data-stale={stale ? "true" : "false"}
    >
      <div className="bt-op-section-head">
        <h3 className="bt-op-section-title">성과 KPI</h3>
        {stale ? (
          <p className="bt-op-stale-note">이전 결과 · 새로고침 중</p>
        ) : null}
      </div>
      <div className="bt-op-kpi-grid">
        <Metric
          label="총수익률"
          value={
            typeof totalReturn === "number"
              ? backtestOperatorFormatPct(totalReturn)
              : BACKTEST_OPERATOR_UNAVAILABLE
          }
          tone={toneFromSigned(totalReturn)}
        />
        <Metric
          label="순손익"
          value={
            typeof netPnl === "number"
              ? backtestOperatorFormatUsdt(netPnl)
              : BACKTEST_OPERATOR_UNAVAILABLE
          }
          tone={toneFromSigned(netPnl)}
        />
        <Metric
          label="승률"
          value={
            typeof winRate === "number"
              ? backtestOperatorFormatPct(winRate, 1)
              : BACKTEST_OPERATOR_UNAVAILABLE
          }
        />
        <Metric
          label="총 거래"
          value={
            typeof tradeCount === "number"
              ? backtestOperatorFormatCount(tradeCount)
              : BACKTEST_OPERATOR_UNAVAILABLE
          }
        />
        <Metric
          label="평균 거래"
          value={
            typeof averageTrade === "number"
              ? backtestOperatorFormatNumber(averageTrade, 4)
              : BACKTEST_OPERATOR_UNAVAILABLE
          }
        />
        <Metric
          label="손익비"
          value={
            typeof profitFactor === "number"
              ? backtestOperatorFormatNumber(profitFactor)
              : typeof payoffRatio === "number"
                ? backtestOperatorFormatNumber(payoffRatio)
                : BACKTEST_OPERATOR_UNAVAILABLE
          }
          help={
            typeof profitFactor === "number"
              ? "Profit factor"
              : typeof payoffRatio === "number"
                ? "평균 이익 / 평균 손실"
                : undefined
          }
        />
        <Metric
          label="최대 낙폭"
          value={
            typeof mdd === "number"
              ? backtestOperatorFormatPct(mdd)
              : BACKTEST_OPERATOR_UNAVAILABLE
          }
          tone="danger"
        />
        <Metric
          label="최대 연속 손실"
          value={
            typeof maxConsecutiveLosses === "number"
              ? backtestOperatorFormatCount(maxConsecutiveLosses)
              : BACKTEST_OPERATOR_UNAVAILABLE
          }
          tone="warning"
        />
      </div>
    </section>
  );
}
