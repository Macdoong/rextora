"use client";

import {
  BACKTEST_OPERATOR_UNAVAILABLE,
  backtestOperatorFormatCount,
  backtestOperatorFormatPct,
  type BacktestOperatorPeriodStats,
} from "@/src/lib/rextora/backtest/backtestOperatorPresentation";

export function BacktestPeriodPerformance({
  period,
}: {
  period: BacktestOperatorPeriodStats | typeof BACKTEST_OPERATOR_UNAVAILABLE;
}) {
  if (period === BACKTEST_OPERATOR_UNAVAILABLE) {
    return (
      <section className="bt-op-panel" data-testid="backtest-period-section">
        <h3 className="bt-op-section-title">기간별 성과</h3>
        <p className="bt-op-empty">{BACKTEST_OPERATOR_UNAVAILABLE}</p>
      </section>
    );
  }

  return (
    <section className="bt-op-panel" data-testid="backtest-period-section">
      <h3 className="bt-op-section-title">기간별 성과</h3>
      <p className="bt-op-period-summary">{period.factualSummaryKo}</p>
      <p className="bt-op-meta">
        최고 {period.bestMonth?.labelKo ?? period.bestMonth?.month ?? BACKTEST_OPERATOR_UNAVAILABLE}
        {" "}
        ({typeof period.bestMonth?.returnPct === "number"
          ? backtestOperatorFormatPct(period.bestMonth.returnPct)
          : BACKTEST_OPERATOR_UNAVAILABLE})
        <span aria-hidden="true"> · </span>
        최저 {period.worstMonth?.labelKo ?? period.worstMonth?.month ?? BACKTEST_OPERATOR_UNAVAILABLE}
        {" "}
        ({typeof period.worstMonth?.returnPct === "number"
          ? backtestOperatorFormatPct(period.worstMonth.returnPct)
          : BACKTEST_OPERATOR_UNAVAILABLE})
      </p>
      <div className="bt-op-table-wrap">
        <table className="bt-op-table">
          <thead>
            <tr>
              <th>월</th>
              <th>수익률</th>
              <th>거래</th>
            </tr>
          </thead>
          <tbody>
            {period.rows.map((row) => (
              <tr key={row.month}>
                <td>{row.labelKo ?? row.month}</td>
                <td>{backtestOperatorFormatPct(row.returnPct)}</td>
                <td>
                  {typeof row.trades === "number"
                    ? backtestOperatorFormatCount(row.trades)
                    : BACKTEST_OPERATOR_UNAVAILABLE}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
