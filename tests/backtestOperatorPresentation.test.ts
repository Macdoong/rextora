import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  BACKTEST_OPERATOR_ANALYSIS_VIEWS,
  BACKTEST_OPERATOR_SAFE_STRATEGY_ID,
  BACKTEST_OPERATOR_SECONDARY_VERDICT_POINTER,
  BACKTEST_OPERATOR_UNAVAILABLE,
  BACKTEST_OPERATOR_UNKNOWN_FAILURE_TITLE,
  backtestOperatorChartIdentity,
  backtestOperatorCompactStatusLabel,
  backtestOperatorDeriveTradeStats,
  backtestOperatorFailurePresentation,
  backtestOperatorFormatPct,
  backtestOperatorLoadingPreservesPrevious,
  backtestOperatorNetPnl,
  backtestOperatorPageState,
  backtestOperatorParamsHashExplanation,
  backtestOperatorPeriodStats,
  backtestOperatorPrimaryVerdictReason,
  backtestOperatorRejectsExternalTelemetry,
  backtestOperatorResolveResultContext,
  backtestOperatorResultContextLabel,
  backtestOperatorShellContext,
  backtestOperatorUsableLabel,
} from "../src/lib/rextora/backtest/backtestOperatorPresentation";
import { paperOperatorShellContext } from "../src/lib/rextora/paper/paperOperatorPresentation";

const ROOT = path.resolve(__dirname, "..");
const SAFE_PATH = path.join(ROOT, "data/strategies/SAFE_v44_i4060.json");
const SAFE_SHA =
  "fb3f19169c8911fe041f3f8cb1d9e654f9166078f0c5cd8e29f04ec02a56dfc0";

function sha256(filePath: string): string {
  return createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

describe("Backtest operator presentation", () => {
  it("1. valid result presentation is usable and current", () => {
    const usable = backtestOperatorUsableLabel({
      eligible: true,
      failureCode: null,
      status: "completed",
    });
    expect(usable.usable).toBe(true);
    expect(usable.labelKo).toBe("사용 가능");
    expect(backtestOperatorResultContextLabel("current_run")).toBe(
      "현재 실행 결과",
    );
    expect(
      backtestOperatorPageState({
        strategyId: "custom_x",
        report: { totalReturn: 0.02, tradeCount: 19 },
        eligible: true,
      }),
    ).toBe("completed_valid");
  });

  it("2. failed validation presentation is not usable", () => {
    const usable = backtestOperatorUsableLabel({
      eligible: false,
      failureCode: "INVALID_DATE_RANGE",
      status: "failed",
    });
    expect(usable.usable).toBe(false);
    expect(usable.labelKo).toBe("사용 불가");
    expect(
      backtestOperatorPageState({
        strategyId: "custom_x",
        report: { totalReturn: 0.02 },
        failureCode: "INVALID_DATE_RANGE",
      }),
    ).toBe("validation_failed");
  });

  it("3. unknown failure code stays truthful", () => {
    const failure = backtestOperatorFailurePresentation(
      "NOT_A_REAL_CODE",
      null,
    );
    expect(failure.known).toBe(false);
    expect(failure.titleKo).toBe(BACKTEST_OPERATOR_UNKNOWN_FAILURE_TITLE);
    expect(failure.code).toBe("NOT_A_REAL_CODE");
    expect(failure.reasonKo).not.toContain("미래");
    expect(failure.reasonKo).not.toContain("paramsHash");
  });

  it("4. paramsHash mismatch explanation is source-backed", () => {
    const explained = backtestOperatorParamsHashExplanation(false);
    expect(explained.titleKo).toBe("전략 설정값이 일치하지 않습니다.");
    const hashMismatch = backtestOperatorFailurePresentation(
      "STRATEGY_HASH_MISMATCH",
    );
    expect(hashMismatch.titleKo).toBe("전략 설정값이 일치하지 않습니다.");
    expect(hashMismatch.known).toBe(true);
  });

  it("5. future-data failure explanation uses FUTURE_DATA_BLOCKED", () => {
    const failure = backtestOperatorFailurePresentation("FUTURE_DATA_BLOCKED");
    expect(failure.known).toBe(true);
    expect(failure.titleKo).toBe(
      "미래 데이터가 포함되어 결과를 사용할 수 없습니다.",
    );
  });

  it("6. total trades use stored or listed trades", () => {
    const fromStored = backtestOperatorDeriveTradeStats([], { tradeCount: 19 });
    expect(fromStored.totalTrades).toBe(19);
    const fromList = backtestOperatorDeriveTradeStats(
      [{ netPnlUsdt: 1 }, { netPnlUsdt: -1 }],
    );
    expect(fromList.totalTrades).toBe(2);
  });

  it("7. zero trades stay zero and do not invent averages", () => {
    const stats = backtestOperatorDeriveTradeStats([], { tradeCount: 0 });
    expect(stats.totalTrades).toBe(0);
    expect(stats.winningTrades).toBe(0);
    expect(stats.losingTrades).toBe(0);
    expect(stats.averageWinningTrade).toBe(BACKTEST_OPERATOR_UNAVAILABLE);
    expect(stats.payoffRatio).toBe(BACKTEST_OPERATOR_UNAVAILABLE);
  });

  it("8. win rate formatting is truthful for zero and missing", () => {
    expect(backtestOperatorFormatPct(0)).toBe("0.00%");
    expect(backtestOperatorFormatPct(0.4737, 1)).toBe("47.4%");
    expect(backtestOperatorFormatPct(undefined)).toBe(
      BACKTEST_OPERATOR_UNAVAILABLE,
    );
    expect(backtestOperatorFormatPct(Number.NaN)).toBe(
      BACKTEST_OPERATOR_UNAVAILABLE,
    );
  });

  it("9. average trade PnL derives from stored trades only", () => {
    const stats = backtestOperatorDeriveTradeStats([
      { netPnlUsdt: 10 },
      { netPnlUsdt: -4 },
    ]);
    expect(stats.averageTradePnl).toBe(3);
    expect(stats.averageWinningTrade).toBe(10);
    expect(stats.averageLosingTrade).toBe(-4);
  });

  it("10. max consecutive loss derives from stored trade sequence", () => {
    const stats = backtestOperatorDeriveTradeStats([
      { netPnlUsdt: 1 },
      { netPnlUsdt: -1 },
      { netPnlUsdt: -2 },
      { netPnlUsdt: -3 },
      { netPnlUsdt: 4 },
    ]);
    expect(stats.maxConsecutiveLosses).toBe(3);
    expect(stats.maxConsecutiveWins).toBe(1);
    const storedWins = backtestOperatorDeriveTradeStats(
      [{ netPnlUsdt: -1 }, { netPnlUsdt: -1 }],
      { maxConsecutiveLosses: 11 },
    );
    expect(storedWins.maxConsecutiveLosses).toBe(11);
  });

  it("11. profit factor / payoff derive from stored trades when needed", () => {
    const stats = backtestOperatorDeriveTradeStats([
      { netPnlUsdt: 20 },
      { netPnlUsdt: 10 },
      { netPnlUsdt: -10 },
    ]);
    expect(stats.profitFactor).toBe(3);
    expect(stats.payoffRatio).toBe(1.5);
    const stored = backtestOperatorDeriveTradeStats(
      [{ netPnlUsdt: 20 }, { netPnlUsdt: -10 }],
      { profitFactor: 1.8131 },
    );
    expect(stored.profitFactor).toBe(1.8131);
  });

  it("12. monthly performance uses stored month rows only", () => {
    const period = backtestOperatorPeriodStats([
      { month: "2026-06", returnPct: 0.0168, trades: 14, labelKo: "2026년 6월" },
      { month: "2026-07", returnPct: 0.0033, trades: 5 },
      { month: "2026-08", returnPct: -0.01, trades: 3 },
    ]);
    expect(period).not.toBe(BACKTEST_OPERATOR_UNAVAILABLE);
    if (period === BACKTEST_OPERATOR_UNAVAILABLE) return;
    expect(period.monthCount).toBe(3);
    expect(period.profitableMonths).toBe(2);
    expect(period.losingMonths).toBe(1);
    expect(period.factualSummaryKo).toBe("3개월 중 2개월 수익");
    expect(period.bestMonth?.month).toBe("2026-06");
    expect(period.worstMonth?.month).toBe("2026-08");
    expect(backtestOperatorPeriodStats([])).toBe(BACKTEST_OPERATOR_UNAVAILABLE);
  });

  it("13. zero and undefined values render truthfully", () => {
    expect(backtestOperatorFormatPct(0)).toBe("0.00%");
    expect(backtestOperatorNetPnl({})).toBe(BACKTEST_OPERATOR_UNAVAILABLE);
    expect(
      backtestOperatorNetPnl({
        startingBalance: 10000,
        endingBalance: 10000,
      }),
    ).toBe(0);
    expect(
      backtestOperatorNetPnl({
        costs: { netPnLAfterCosts: 200.5 },
        startingBalance: 1,
        endingBalance: 2,
      }),
    ).toBe(200.5);
  });

  it("14. current vs historical result distinction", () => {
    expect(
      backtestOperatorResolveResultContext({
        selectedRunId: "bt_1",
        runJustCompleted: true,
      }),
    ).toBe("current_run");
    expect(
      backtestOperatorResolveResultContext({
        selectedRunId: "bt_1",
        runJustCompleted: false,
      }),
    ).toBe("saved_historical");
    expect(backtestOperatorResultContextLabel("saved_historical")).toBe(
      "저장된 과거 결과",
    );
  });

  it("15. loading keeps previous authoritative result and does not fabricate", () => {
    const previous = { totalReturn: 0.020097, tradeCount: 19 };
    const held = backtestOperatorLoadingPreservesPrevious({
      previous,
      loading: true,
      next: null,
    });
    expect(held.value).toBe(previous);
    expect(held.stale).toBe(true);
    expect(held.fabricated).toBe(false);
    const replaced = backtestOperatorLoadingPreservesPrevious({
      previous,
      loading: true,
      next: { totalReturn: 0.01, tradeCount: 4 },
    });
    expect(replaced.value).toEqual({ totalReturn: 0.01, tradeCount: 4 });
    expect(replaced.stale).toBe(false);
  });

  it("16. session/global/mock account data is never used", () => {
    expect(
      backtestOperatorRejectsExternalTelemetry({
        usedSessionBalance: null,
        usedGlobalAccount: undefined,
        usedMockAccount: undefined,
      }),
    ).toBe(true);
    expect(
      backtestOperatorRejectsExternalTelemetry({
        usedMockAccount: 10000,
      }),
    ).toBe(false);
    const stats = backtestOperatorDeriveTradeStats(
      [{ pnlPct: -0.1 }],
      { tradeCount: 1 },
    );
    expect(stats.averageTradePnl).toBe(-0.1);
    expect(stats.averageTradePnl).not.toBe(10000);
  });

  it("17. SAFE file is unchanged", () => {
    expect(sha256(SAFE_PATH)).toBe(SAFE_SHA);
    expect(BACKTEST_OPERATOR_SAFE_STRATEGY_ID).toBe("SAFE_v44_i4060");
  });

  it("18. tests do not mutate production Backtest data", () => {
    const sample = path.join(
      ROOT,
      "data/rextora/backtests/bt_mt1kh58k_762ad9.json",
    );
    const before = sha256(sample);
    const raw = fs.readFileSync(sample, "utf8");
    const parsed = JSON.parse(raw) as {
      report?: { tradeCount?: number; totalReturn?: number };
    };
    backtestOperatorDeriveTradeStats([], {
      tradeCount: parsed.report?.tradeCount,
    });
    expect(sha256(sample)).toBe(before);
    expect(fs.readFileSync(sample, "utf8")).toBe(raw);
  });

  it("chart identity ignores transient picker symbol remounts", () => {
    expect(
      backtestOperatorChartIdentity({
        selectedRunId: "bt_1",
        strategyHash: "abc",
        fromDate: "2026-06-21",
        toDate: "2026-08-20",
        symbol: "BTCUSDT",
      }),
    ).toBe("bt_1:abc:2026-06-21:2026-08-20:BTCUSDT");
  });
});

describe("Backtest operator workbench wiring", () => {
  const wb = fs.readFileSync(
    path.join(ROOT, "components/rextora/backtest/BacktestReviewWorkbench.tsx"),
    "utf8",
  );

  it("keeps previous report during a new run instead of clearing it", () => {
    expect(wb).toContain("setResultRefreshing(true)");
    expect(wb).not.toMatch(/setResultRefreshing\(true\);[\s\S]{0,180}setReport\(null\)/);
    expect(wb).toContain("bt-op-refreshing");
    expect(wb).toContain("backtestOperatorChartIdentity");
  });

  it("renders operator surfaces without inventing PARAMS_HASH_MISMATCH", () => {
    expect(wb).toContain("BacktestOperatorHeader");
    expect(wb).toContain("BacktestKpiGrid");
    expect(wb).toContain("BacktestFailurePanel");
    expect(wb).not.toContain("PARAMS_HASH_MISMATCH");
    expect(wb).not.toContain("FUTURE_DATA_DETECTED");
    expect(wb).not.toContain("DATA_RANGE_INVALID");
  });
});

describe("Backtest UX final closure", () => {
  const staleResearch = {
    agentStrategyId: "custom_ms1y81v1",
    agentJobId: "search_f199146b-7fec-48ab-8063-747e0c484b07",
    agentSymbol: "ETHUSDT",
    agentTimeframe: "1h",
  };

  it("1-5. selected Backtest run overrides stale Research shell context", () => {
    const selected = backtestOperatorShellContext({
      routeIsBacktest: true,
      backtestContext: {
        source: "backtest",
        strategyId: "custom_mt03i30x",
        runId: "bt_mt1kh58k_762ad9",
        symbol: "BTCUSDT",
        timeframe: "15m",
        statusLabel: "부적격",
      },
    });
    expect(selected.usedBacktestPageContext).toBe(true);
    expect(selected.strategy).toBe("custom_mt03i30x");
    expect(selected.runId).toBe("bt_mt1kh58k_762ad9");
    expect(selected.symbolTimeframe).toBe("BTCUSDT · 15m");
    expect(selected.researchJobId).toBeNull();
    expect(selected.paperSessionLabel).toBe("Not selected");
    expect(selected.strategy).not.toBe(staleResearch.agentStrategyId);
    expect(selected.researchJobId).not.toBe(staleResearch.agentJobId);

    const idle = backtestOperatorShellContext({
      routeIsBacktest: true,
      backtestContext: {
        source: "backtest",
        strategyId: null,
        runId: null,
        symbol: null,
        timeframe: null,
        statusLabel: "검증 전",
      },
    });
    expect(idle.usedBacktestPageContext).toBe(true);
    expect(idle.strategy).toBeNull();
    expect(idle.runId).toBeNull();
    expect(idle.symbolTimeframe).toBeNull();
    expect(idle.researchJobId).toBeNull();
  });

  it("6. Research page behavior is unchanged", () => {
    const research = paperOperatorShellContext({
      routeIsPaper: false,
      paperContext: null,
      ...staleResearch,
    });
    expect(research.usedPaperPageContext).toBe(false);
    expect(research.strategy).toBe("custom_ms1y81v1");
    expect(research.researchJobId).toBe(
      "search_f199146b-7fec-48ab-8063-747e0c484b07",
    );
    expect(
      backtestOperatorShellContext({
        routeIsBacktest: false,
        backtestContext: null,
      }).usedBacktestPageContext,
    ).toBe(false);
  });

  it("7. Paper page behavior is unchanged", () => {
    const paper = paperOperatorShellContext({
      routeIsPaper: true,
      paperContext: {
        source: "paper",
        strategyId: "custom_mts6svuf",
        strategyLabel: "VERIFY_PATTERN_CANONICAL1_BTCUSDT_15m",
        paperSessionId: "paper_dbdfa88e-fe2b-432d-9c94-adff4cdbab32",
        paperSessionStatus: "stopped",
        symbol: "BTCUSDT",
        timeframe: "15m",
        researchJobId: null,
      },
      ...staleResearch,
    });
    expect(paper.usedPaperPageContext).toBe(true);
    expect(paper.strategy).toBe("custom_mts6svuf");
    expect(paper.paperSessionId).toBe(
      "paper_dbdfa88e-fe2b-432d-9c94-adff4cdbab32",
    );
    expect(paper.researchJobId).toBeNull();
  });

  it("8-11. primary failed verdict appears once and technical detail remains", () => {
    const wb = fs.readFileSync(
      path.join(ROOT, "components/rextora/backtest/BacktestReviewWorkbench.tsx"),
      "utf8",
    );
    const av = fs.readFileSync(
      path.join(ROOT, "components/rextora/charts/BacktestAnalysisView.tsx"),
      "utf8",
    );
    const ctx = fs.readFileSync(
      path.join(ROOT, "components/rextora/shell/ContextBar.tsx"),
      "utf8",
    );
    const decision = wb.slice(
      wb.indexOf('data-testid="backtest-decision-summary"'),
      wb.indexOf('data-testid="backtest-review-actions"'),
    );
    expect(decision).toContain("부적격 이유");
    expect(decision).toContain("primaryBlockReason?.labelKo");
    expect(decision).not.toContain("가장 큰 위험");
    expect(wb).toContain("BACKTEST_OPERATOR_SECONDARY_VERDICT_POINTER");
    expect(
      decision.match(/primaryBlockReason\?\.labelKo/g)?.length,
    ).toBe(1);
    expect(av).toContain("BACKTEST_OPERATOR_SECONDARY_VERDICT_POINTER");
    expect(av).not.toMatch(
      /summary-mdd-warning[\s\S]{0,180}eligibility\.verdictLabel/,
    );
    expect(wb).toContain("BacktestOperatorAnalysis");
    const validationPanel = fs.readFileSync(
      path.join(
        ROOT,
        "components/rextora/backtest/operator/BacktestValidationPanel.tsx",
      ),
      "utf8",
    );
    expect(validationPanel).toContain("backtest-validation-panel");
    expect(validationPanel).toContain("check.technical");
    const unknown = backtestOperatorFailurePresentation("NOT_A_REAL_CODE", null);
    expect(unknown.known).toBe(false);
    expect(unknown.code).toBe("NOT_A_REAL_CODE");
    expect(unknown.titleKo).toBe(BACKTEST_OPERATOR_UNKNOWN_FAILURE_TITLE);
    expect(
      backtestOperatorPrimaryVerdictReason({
        eligible: true,
        verdictLabel: "적격",
      }),
    ).toBe("해당 없음");
    expect(backtestOperatorCompactStatusLabel({ eligible: true })).toBe("적격");
    expect(ctx).toContain("backtestOperatorShellContext");
    expect(ctx).toContain("OPERATOR_LABEL.agentPaperSession");
  });

  it("12-15. analysis views stay reachable without a second full tab row", () => {
    const analysis = fs.readFileSync(
      path.join(
        ROOT,
        "components/rextora/backtest/operator/BacktestOperatorAnalysis.tsx",
      ),
      "utf8",
    );
    const css = fs.readFileSync(path.join(ROOT, "app/globals.css"), "utf8");
    const wb = fs.readFileSync(
      path.join(ROOT, "components/rextora/backtest/BacktestReviewWorkbench.tsx"),
      "utf8",
    );
    expect(BACKTEST_OPERATOR_ANALYSIS_VIEWS.map((v) => v.id)).toEqual([
      "summary",
      "trades",
      "period",
      "risk",
      "validation",
    ]);
    expect(analysis).toContain("backtest-operator-tab-${item.id}");
    expect(analysis).toContain("value={item.id}");
    expect(analysis).toContain("backtest-operator-analysis-select");
    expect(css).toContain(".bt-op-analysis-select-wrap");
    expect(css).toMatch(
      /@media \(max-width: 430px\)[\s\S]*\.bt-op-analysis-tabs \{\s*display: none;/,
    );
    expect(wb).toContain("backtest-workspace-tab-");
    expect(wb).toContain('id: "advanced"');
    expect(wb).toContain('id: "validation"');
    expect(analysis).toContain("aria-selected={tab === item.id}");
    expect(analysis).toContain("is-active");
    expect(BACKTEST_OPERATOR_SECONDARY_VERDICT_POINTER).toContain("판정 요약");
  });

  it("16-21. closure helpers stay presentation-only and do not mutate production", () => {
    const sample = path.join(
      ROOT,
      "data/rextora/backtests/bt_mt1kh58k_762ad9.json",
    );
    const before = sha256(sample);
    const wb = fs.readFileSync(
      path.join(ROOT, "components/rextora/backtest/BacktestReviewWorkbench.tsx"),
      "utf8",
    );
    expect(sha256(SAFE_PATH)).toBe(SAFE_SHA);
    expect(wb).toContain("useSetOperatorPageContext");
    expect(wb).not.toContain("runSearchJob(");
    expect(wb).not.toContain("createPaperSession");
    expect(wb).not.toContain("resumePaper");
    expect(wb).not.toContain("activateLive");
    expect(wb).not.toContain("placeOrder");
    backtestOperatorShellContext({
      routeIsBacktest: true,
      backtestContext: {
        source: "backtest",
        strategyId: "custom_mt03i30x",
        runId: "bt_mt1kh58k_762ad9",
        symbol: "BTCUSDT",
        timeframe: "15m",
        statusLabel: "부적격",
      },
    });
    expect(sha256(sample)).toBe(before);
  });
});
