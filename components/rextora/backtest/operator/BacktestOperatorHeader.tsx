"use client";

import { Badge } from "@/components/ui/primitives";
import {
  BACKTEST_OPERATOR_UNAVAILABLE,
  backtestOperatorResultContextLabel,
  type BacktestOperatorResultContext,
} from "@/src/lib/rextora/backtest/backtestOperatorPresentation";

export function BacktestOperatorHeader({
  strategyLabel,
  strategyType,
  symbol,
  timeframe,
  fromDate,
  toDate,
  validationLabel,
  validationTone,
  usableLabel,
  resultContext,
  runId,
  createdAt,
}: {
  strategyLabel: string;
  strategyType: string;
  symbol: string;
  timeframe: string;
  fromDate: string;
  toDate: string;
  validationLabel: string;
  validationTone: "success" | "danger" | "warning" | "muted";
  usableLabel: string;
  resultContext: BacktestOperatorResultContext;
  runId?: string | null;
  createdAt?: string | null;
}) {
  return (
    <header
      className="bt-op-header"
      data-testid="backtest-operator-header"
      data-result-context={resultContext}
    >
      <div className="bt-op-header-main">
        <div className="min-w-0">
          <p className="rextora-label">백테스트 운영</p>
          <h2 className="bt-op-strategy-name">{strategyLabel}</h2>
          <p className="bt-op-meta">
            {strategyType}
            <span aria-hidden="true"> · </span>
            {symbol || BACKTEST_OPERATOR_UNAVAILABLE}
            <span aria-hidden="true"> · </span>
            {timeframe || BACKTEST_OPERATOR_UNAVAILABLE}
            <span aria-hidden="true"> · </span>
            {fromDate || BACKTEST_OPERATOR_UNAVAILABLE}
            <span aria-hidden="true"> → </span>
            {toDate || BACKTEST_OPERATOR_UNAVAILABLE}
          </p>
        </div>
        <div className="bt-op-header-badges">
          <Badge tone={validationTone}>{validationLabel}</Badge>
          <Badge tone={usableLabel === "사용 가능" ? "success" : "danger"}>
            {usableLabel}
          </Badge>
          <Badge tone={resultContext === "saved_historical" ? "warning" : "info"}>
            {backtestOperatorResultContextLabel(resultContext)}
          </Badge>
        </div>
      </div>
      {(runId || createdAt) ? (
        <p className="bt-op-identity" data-testid="backtest-operator-identity">
          {createdAt ? `실행 시각 ${createdAt}` : null}
          {createdAt && runId ? " · " : null}
          {runId ? `결과 ID ${runId}` : null}
        </p>
      ) : null}
    </header>
  );
}
