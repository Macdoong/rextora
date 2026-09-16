"use client";

import {
  backtestOperatorPageStateCopy,
  type BacktestOperatorPageState,
} from "@/src/lib/rextora/backtest/backtestOperatorPresentation";

export function BacktestResultState({
  state,
  nextAction,
}: {
  state: BacktestOperatorPageState;
  nextAction?: string;
}) {
  const copy = backtestOperatorPageStateCopy(state);
  return (
    <section
      className={`bt-op-state bt-op-state-${state}`}
      data-testid="backtest-result-state"
      data-state={state}
    >
      <h3 className="bt-op-state-title">{copy.titleKo}</h3>
      <p className="bt-op-state-body">{copy.bodyKo}</p>
      {nextAction ? <p className="bt-op-state-next">{nextAction}</p> : null}
    </section>
  );
}
