"use client";

import { useState } from "react";
import type {
  BacktestOperatorAnalysisViewId,
  BacktestOperatorDerivedTradeStats,
  BacktestOperatorPeriodStats,
  BacktestOperatorValidationCheck,
} from "@/src/lib/rextora/backtest/backtestOperatorPresentation";
import {
  BACKTEST_OPERATOR_ANALYSIS_VIEWS,
  BACKTEST_OPERATOR_UNAVAILABLE,
} from "@/src/lib/rextora/backtest/backtestOperatorPresentation";
import { BacktestPerformanceSection } from "./BacktestPerformanceSection";
import { BacktestRiskSection } from "./BacktestRiskSection";
import { BacktestPeriodPerformance } from "./BacktestPeriodPerformance";
import { BacktestValidationPanel } from "./BacktestValidationPanel";

export function BacktestOperatorAnalysis({
  totalReturn,
  netPnl,
  mdd,
  stats,
  period,
  checks,
}: {
  totalReturn: number | typeof BACKTEST_OPERATOR_UNAVAILABLE;
  netPnl: number | typeof BACKTEST_OPERATOR_UNAVAILABLE;
  mdd: number | typeof BACKTEST_OPERATOR_UNAVAILABLE;
  stats: BacktestOperatorDerivedTradeStats;
  period: BacktestOperatorPeriodStats | typeof BACKTEST_OPERATOR_UNAVAILABLE;
  checks: BacktestOperatorValidationCheck[];
}) {
  const [tab, setTab] = useState<BacktestOperatorAnalysisViewId>("summary");

  return (
    <section
      className="bt-op-analysis"
      data-testid="backtest-operator-analysis"
    >
      <div
        className="bt-op-analysis-tabs"
        role="tablist"
        aria-label="백테스트 분석"
      >
        {BACKTEST_OPERATOR_ANALYSIS_VIEWS.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={tab === item.id}
            className={`bt-op-tab ${tab === item.id ? "is-active" : ""}`}
            onClick={() => setTab(item.id)}
            data-testid={`backtest-operator-tab-${item.id}`}
          >
            {item.label}
          </button>
        ))}
      </div>
      <label className="bt-op-analysis-select-wrap">
        <span className="sr-only">백테스트 분석 보기</span>
        <select
          className="bt-op-analysis-select"
          value={tab}
          aria-label="백테스트 분석 보기"
          data-testid="backtest-operator-analysis-select"
          onChange={(event) =>
            setTab(event.target.value as BacktestOperatorAnalysisViewId)
          }
        >
          {BACKTEST_OPERATOR_ANALYSIS_VIEWS.map((item) => (
            <option key={item.id} value={item.id}>
              {item.label}
            </option>
          ))}
        </select>
      </label>
      <div className="bt-op-analysis-body" role="tabpanel">
        {tab === "summary" ? (
          <div className="bt-op-analysis-stack">
            <BacktestPerformanceSection
              totalReturn={totalReturn}
              netPnl={netPnl}
              stats={stats}
            />
            <BacktestRiskSection mdd={mdd} stats={stats} />
          </div>
        ) : null}
        {tab === "trades" ? (
          <BacktestPerformanceSection
            totalReturn={totalReturn}
            netPnl={netPnl}
            stats={stats}
          />
        ) : null}
        {tab === "period" ? <BacktestPeriodPerformance period={period} /> : null}
        {tab === "risk" ? <BacktestRiskSection mdd={mdd} stats={stats} /> : null}
        {tab === "validation" ? (
          <BacktestValidationPanel checks={checks} />
        ) : null}
      </div>
    </section>
  );
}
