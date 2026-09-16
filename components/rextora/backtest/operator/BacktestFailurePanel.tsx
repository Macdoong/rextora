"use client";

import type { BacktestOperatorFailurePresentation } from "@/src/lib/rextora/backtest/backtestOperatorPresentation";

export function BacktestFailurePanel({
  failure,
}: {
  failure: BacktestOperatorFailurePresentation;
}) {
  return (
    <section
      className="bt-op-failure"
      data-testid="backtest-failure-panel"
      role="alert"
    >
      <p className="bt-op-failure-kicker">검증 실패</p>
      <h3 className="bt-op-failure-title">{failure.titleKo}</h3>
      <dl className="bt-op-failure-dl">
        <div>
          <dt>사유</dt>
          <dd>{failure.reasonKo}</dd>
        </div>
        <div>
          <dt>실패한 항목</dt>
          <dd>{failure.failedWhatKo}</dd>
        </div>
        <div>
          <dt>다음 조치</dt>
          <dd>{failure.nextActionKo}</dd>
        </div>
      </dl>
      {failure.code ? (
        <details className="bt-op-failure-tech">
          <summary>기술 상세</summary>
          <p data-testid="backtest-failure-raw-code">{failure.code}</p>
        </details>
      ) : null}
    </section>
  );
}
