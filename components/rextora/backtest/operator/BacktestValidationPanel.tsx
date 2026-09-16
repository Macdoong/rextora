"use client";

import type { BacktestOperatorValidationCheck } from "@/src/lib/rextora/backtest/backtestOperatorPresentation";

const STATUS_CLASS: Record<BacktestOperatorValidationCheck["status"], string> = {
  pass: "bt-op-check-pass",
  fail: "bt-op-check-fail",
  warn: "bt-op-check-warn",
  info: "bt-op-check-info",
};

export function BacktestValidationPanel({
  checks,
}: {
  checks: BacktestOperatorValidationCheck[];
}) {
  return (
    <section className="bt-op-panel" data-testid="backtest-validation-panel">
      <h3 className="bt-op-section-title">검증</h3>
      <ul className="bt-op-check-list">
        {checks.map((check) => (
          <li
            key={check.id}
            className={`bt-op-check ${STATUS_CLASS[check.status]}`}
            data-testid={`backtest-validation-check-${check.id}`}
          >
            <div className="bt-op-check-row">
              <span className="bt-op-check-label">{check.labelKo}</span>
              <span className="bt-op-check-status">{check.statusLabelKo}</span>
            </div>
            <p className="bt-op-check-explain">{check.explanationKo}</p>
            {check.technical ? (
              <p className="bt-op-check-tech">{check.technical}</p>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}
