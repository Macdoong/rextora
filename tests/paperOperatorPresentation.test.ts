import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  PAPER_OPERATOR_LEGACY_OHLC_LABEL,
  PAPER_OPERATOR_LEGACY_OWNERSHIP_LABEL,
  PAPER_OPERATOR_SAFE_STRATEGY_ID,
  PAPER_OPERATOR_UNRESOLVED_LABEL,
  paperOperatorCapitalDelta,
  paperOperatorChartEmptyCopy,
  paperOperatorCloseReasonPresentation,
  paperOperatorCostModelLabel,
  paperOperatorCumulativeRealizedPnl,
  paperOperatorDisplayNumeric,
  paperOperatorExecutionKind,
  paperOperatorLiveLabel,
  paperOperatorLoadedTradesComplete,
  paperOperatorHoldTimeText,
  paperOperatorLeverageAuthority,
  paperOperatorMetricText,
  paperOperatorNewestFirstToChronological,
  paperOperatorOhlcAudit,
  paperOperatorPositionOwnership,
  paperOperatorSessionCapitalUsdt,
  paperOperatorShellContext,
  paperOperatorSidePresentation,
  paperOperatorSignedFinancialText,
  paperOperatorSignedFinancialTone,
  paperOperatorStatusLabel,
  paperOperatorStatusNextStep,
  paperOperatorStatusTone,
  paperOperatorStopReasonLabel,
  paperOperatorTradeBelongsToSession,
  paperOperatorTradeSetSummary,
  paperOperatorTradeTooltipModel,
} from "../src/lib/rextora/paper/paperOperatorPresentation";

const SAFE_SHA =
  "fb3f19169c8911fe041f3f8cb1d9e654f9166078f0c5cd8e29f04ec02a56dfc0";

describe("Paper operator presentation", () => {
  it("1-4. maps source-backed Korean status labels", () => {
    expect(paperOperatorStatusLabel("pending_approval")).toBe("승인 대기");
    expect(paperOperatorStatusLabel("active")).toBe("모의매매 실행 중");
    expect(paperOperatorStatusLabel("paused")).toBe("일시정지");
    expect(paperOperatorStatusLabel("risk_halted")).toBe(
      "위험 제한으로 자동 중단",
    );
    expect(paperOperatorStatusLabel("stopped")).toBe("종료");
    expect(paperOperatorStatusNextStep("pending_approval")).toBe(
      "승인 후 모의매매를 시작할 수 있습니다.",
    );
  });

  it("5. maps stored stop reasons without rewriting them", () => {
    const mapped = paperOperatorStopReasonLabel(
      "pattern_paper_validation_complete",
    );
    expect(mapped.label).toBe("검증 완료로 종료");
    expect(mapped.raw).toBe("pattern_paper_validation_complete");
  });

  it("6-7. session capital is virtualBalance + realizedPnl, not a mock balance", () => {
    expect(
      paperOperatorSessionCapitalUsdt({
        virtualBalance: 10_000,
        realizedPnl: 2.148084,
      }),
    ).toBe(10002.148084);
    expect(
      paperOperatorSessionCapitalUsdt({
        virtualBalance: 10_000,
        realizedPnl: 0,
      }),
    ).toBe(10_000);
    expect(paperOperatorMetricText(0, " USDT")).toBe("0 USDT");
    expect(paperOperatorMetricText(10254.32, " USDT")).not.toBe(
      paperOperatorMetricText(2.148084, " USDT"),
    );
  });

  it("8-9. SAFE and Pattern identities stay truthful", () => {
    expect(
      paperOperatorExecutionKind({
        strategyId: PAPER_OPERATOR_SAFE_STRATEGY_ID,
      }).label,
    ).toBe("SAFE");
    expect(
      paperOperatorExecutionKind({
        strategyId: "custom_mts6svuf",
        hasEventSequenceDefinition: true,
      }).label,
    ).toBe("Pattern / Event-Sequence");
    expect(
      paperOperatorExecutionKind({ strategyId: "unknown_copy" }).label,
    ).toBe(PAPER_OPERATOR_UNRESOLVED_LABEL);
  });

  it("10-11. ownership uses stamped ids; legacy absence is labeled", () => {
    expect(
      paperOperatorPositionOwnership({
        paperSessionId: "paper_abc",
        paperStrategyId: "custom_mts6svuf",
        sessionId: "paper_abc",
        strategyId: "custom_mts6svuf",
      }).owned,
    ).toBe(true);
    const legacy = paperOperatorPositionOwnership({
      paperSessionId: null,
      paperStrategyId: null,
      sessionId: "paper_abc",
      strategyId: "custom_mts6svuf",
    });
    expect(legacy.legacy).toBe(true);
    expect(legacy.label).toBe(PAPER_OPERATOR_LEGACY_OWNERSHIP_LABEL);
  });

  it("12-13. OHLC audit uses stored candle or legacy fallback", () => {
    const ok = paperOperatorOhlcAudit({
      symbol: "BTCUSDT",
      intervalMs: 900_000,
      openTime: 1_788_874_200_000,
      closeTime: 1_788_875_099_999,
      open: 78_307.4,
      high: 78_344.7,
      low: 77_660,
      close: 77_816.5,
    });
    expect(ok.available).toBe(true);
    expect(ok.candle?.low).toBe(77_660);
    expect(paperOperatorOhlcAudit(null).label).toBe(
      PAPER_OPERATOR_LEGACY_OHLC_LABEL,
    );
  });

  it("14. current-session trades are distinguishable from global history", () => {
    expect(
      paperOperatorTradeBelongsToSession({
        tradePaperSessionId: "paper_abc",
        tradeStrategyId: "custom_mts6svuf",
        tradeMode: "PAPER",
        sessionId: "paper_abc",
        sessionStrategyId: "custom_mts6svuf",
      }),
    ).toBe("session");
    expect(
      paperOperatorTradeBelongsToSession({
        tradePaperSessionId: "paper_other",
        tradeStrategyId: "SAFE_v44_i4060",
        tradeMode: "PAPER",
        sessionId: "paper_abc",
        sessionStrategyId: "custom_mts6svuf",
      }),
    ).toBe("global");
    expect(
      paperOperatorTradeBelongsToSession({
        tradePaperSessionId: null,
        tradeStrategyId: "custom_mts6svuf",
        tradeMode: "PAPER",
        sessionId: "paper_abc",
        sessionStrategyId: "custom_mts6svuf",
      }),
    ).toBe("unscoped");
  });

  it("15-16. zero metrics stay visible and Live stays inactive on Paper", () => {
    expect(paperOperatorMetricText(0)).toBe("0");
    const live = paperOperatorLiveLabel({
      liveTradingEnabled: false,
      allowLiveTrading: false,
    });
    expect(live.liveActive).toBe(false);
    expect(live.label).toBe("실전 매매 아님");
  });

  it("17-18. cost label is source-backed; tests do not create Paper sessions; SAFE unchanged", () => {
    expect(
      paperOperatorCostModelLabel({
        costModel: "event_sequence_execution_price_v1",
        costModelStatus: "canonical",
      }).label,
    ).toBe("최신 체결가격 기반 비용 계산");
    expect(
      paperOperatorCostModelLabel({
        costModel: null,
        costModelStatus: "unresolved",
      }).label,
    ).toBe(PAPER_OPERATOR_UNRESOLVED_LABEL);
    expect(process.env.REXTORA_PAPER_SESSIONS_DIR).toBeUndefined();
    const safe = path.join(process.cwd(), "data/strategies/SAFE_v44_i4060.json");
    expect(
      createHash("sha256").update(fs.readFileSync(safe)).digest("hex"),
    ).toBe(SAFE_SHA);
  });

  it("LEVERAGE 1-4. execution authority ignores alias text", () => {
    const resolved = paperOperatorLeverageAuthority({
      definitionMetadata: {
        lev_min: 1,
        lev_base: 3,
        lev_max: 5,
        use_dynamic_leverage: true,
      },
      strategyParams: {
        lev_min: 1.2,
        lev_base: 1.667,
        lev_max: 2.5,
        use_dynamic_leverage: true,
      },
      strategyName: "BTCUSDT 15m · Order Block · 자동 1.0–5.0x · V29",
    });
    expect(resolved.source).toBe("definition_metadata");
    expect(resolved.label).toBe("자동 1–5배");
    expect(resolved.label).not.toContain("1.2");
    expect(resolved.appliedLabel).toBeNull();
    const withOpen = paperOperatorLeverageAuthority({
      definitionMetadata: {
        lev_min: 1,
        lev_max: 5,
        use_dynamic_leverage: true,
      },
      openPositionLeverage: 1,
    });
    expect(withOpen.appliedLabel).toBe("현재 적용 1배");
    expect(
      paperOperatorLeverageAuthority({
        definitionMetadata: null,
        strategyParams: null,
      }).label,
    ).toBe(PAPER_OPERATOR_UNRESOLVED_LABEL);
  });

  it("AGENT CONTEXT 5-9. Paper page context beats stale Research memory", () => {
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
      agentStrategyId: "custom_ms1y81v1",
      agentStrategyLabel: "stale research",
      agentJobId: "search_f199146b-7fec-48ab-8063-747e0c484b07",
      agentPaperSessionId: null,
    });
    expect(paper.usedPaperPageContext).toBe(true);
    expect(paper.strategy).toBe("custom_mts6svuf");
    expect(paper.researchJobId).toBeNull();
    expect(paper.paperSessionId).toBe(
      "paper_dbdfa88e-fe2b-432d-9c94-adff4cdbab32",
    );
    const idle = paperOperatorShellContext({
      routeIsPaper: true,
      paperContext: null,
      agentStrategyId: "custom_ms1y81v1",
      agentJobId: "search_f199146b-7fec-48ab-8063-747e0c484b07",
    });
    expect(idle.strategy).toBeNull();
    expect(idle.researchJobId).toBeNull();
    const research = paperOperatorShellContext({
      routeIsPaper: false,
      paperContext: null,
      agentStrategyId: "custom_ms1y81v1",
      agentJobId: "search_f199146b-7fec-48ab-8063-747e0c484b07",
    });
    expect(research.usedPaperPageContext).toBe(false);
    expect(research.strategy).toBe("custom_ms1y81v1");
    expect(research.researchJobId).toBe(
      "search_f199146b-7fec-48ab-8063-747e0c484b07",
    );
  });

  it("STOPPED CHART 10-13. started/stopped sessions do not use never-started copy", () => {
    expect(
      paperOperatorChartEmptyCopy({
        sessionPresent: false,
        status: "idle",
        startedAt: null,
        tradeCount: 0,
      }).kind,
    ).toBe("never_started");
    expect(
      paperOperatorChartEmptyCopy({
        sessionPresent: false,
        status: "idle",
        startedAt: null,
        tradeCount: 0,
      }).message,
    ).toBe("아직 거래가 시작되지 않았습니다.");
    const stopped = paperOperatorChartEmptyCopy({
      sessionPresent: true,
      status: "stopped",
      startedAt: "2026-09-08T06:56:00.904Z",
      tradeCount: 0,
    });
    expect(stopped.kind).toBe("stopped");
    expect(stopped.message).not.toContain("아직 거래가 시작되지");
    const traded = paperOperatorChartEmptyCopy({
      sessionPresent: true,
      status: "stopped",
      startedAt: "2026-09-08T06:56:00.904Z",
      tradeCount: 1,
    });
    expect(traded.kind).toBe("stopped_with_trades");
    expect(traded.message).toContain("완료 거래 기록");
    const active = paperOperatorChartEmptyCopy({
      sessionPresent: true,
      status: "active",
      startedAt: "2026-09-08T06:56:00.904Z",
      tradeCount: 0,
    });
    expect(active.kind).not.toBe("stopped");
    expect(active.kind).not.toBe("stopped_with_trades");
  });

  it("SAFETY 14-18. capital/status/Live/SAFE remain presentation-only", () => {
    expect(
      paperOperatorSessionCapitalUsdt({
        virtualBalance: 10_000,
        realizedPnl: 2.148084,
      }),
    ).toBe(10002.148084);
    expect(paperOperatorStatusLabel("stopped")).toBe("종료");
    expect(paperOperatorStatusLabel("pending_approval")).toBe("승인 대기");
    expect(process.env.REXTORA_PAPER_SESSIONS_DIR).toBeUndefined();
    expect(
      paperOperatorLiveLabel({
        liveTradingEnabled: false,
        allowLiveTrading: false,
      }).liveActive,
    ).toBe(false);
    const safeFile = path.join(
      process.cwd(),
      "data/strategies/SAFE_v44_i4060.json",
    );
    expect(
      createHash("sha256").update(fs.readFileSync(safeFile)).digest("hex"),
    ).toBe(SAFE_SHA);
  });

  it("maps signed PnL tone without inventing values", () => {
    expect(paperOperatorSignedFinancialTone(2.148084)).toBe("positive");
    expect(paperOperatorSignedFinancialTone(-3.170778)).toBe("negative");
    expect(paperOperatorSignedFinancialTone(0)).toBe("zero");
    expect(paperOperatorSignedFinancialText(2.148084, " USDT")).toBe(
      "+2.148084 USDT",
    );
    expect(paperOperatorSignedFinancialText(-3.170778, " USDT")).toBe(
      "-3.170778 USDT",
    );
    expect(paperOperatorSignedFinancialText(0, " USDT")).toBe("0 USDT");
  });

  it("formats PnL display without IEEE float noise or negative zero", () => {
    expect(paperOperatorDisplayNumeric(-2.2220000000000004)).toBe("-2.222");
    expect(paperOperatorSignedFinancialText(-2.2220000000000004, " USDT")).toBe(
      "-2.222 USDT",
    );
    expect(paperOperatorSignedFinancialText(2.148084, " USDT")).toBe(
      "+2.148084 USDT",
    );
    expect(paperOperatorSignedFinancialText(0, " USDT")).toBe("0 USDT");
    expect(paperOperatorSignedFinancialText(-0, " USDT")).toBe("0 USDT");
    expect(paperOperatorDisplayNumeric(-0)).toBe("0");
    expect(paperOperatorDisplayNumeric(0)).toBe("0");
    expect(paperOperatorCumulativeRealizedPnl([2.148084, -3.170778])[1]).toBe(
      2.148084 - 3.170778,
    );
  });

  it("maps verified close reasons and keeps the raw value", () => {
    const tp = paperOperatorCloseReasonPresentation("take_profit");
    expect(tp.tone).toBe("success");
    expect(tp.label).toBe("익절");
    expect(tp.raw).toBe("take_profit");
    const sl = paperOperatorCloseReasonPresentation("stop_loss");
    expect(sl.tone).toBe("danger");
    expect(sl.label).toBe("손절");
    const hold = paperOperatorCloseReasonPresentation("최대 보유 청산");
    expect(hold.tone).toBe("warning");
    expect(hold.label).toBe("최대 보유 청산");
    const trail = paperOperatorCloseReasonPresentation("트레일링 손절");
    expect(trail.tone).toBe("warning");
    expect(trail.raw).toBe("트레일링 손절");
    const manual = paperOperatorCloseReasonPresentation("manual_close");
    expect(manual.tone).toBe("neutral");
    const unknown = paperOperatorCloseReasonPresentation("not_a_real_reason");
    expect(unknown.tone).toBe("neutral");
    expect(unknown.label).toBe("not_a_real_reason");
    expect(unknown.mapped).toBe(false);
  });

  it("treats stopped as a historical state, not a failure", () => {
    expect(paperOperatorStatusTone("stopped")).toBe("neutral");
    expect(paperOperatorStatusTone("active")).toBe("brand");
    expect(paperOperatorStatusTone("paused")).toBe("warning");
    expect(paperOperatorStatusTone("error")).toBe("danger");
    expect(paperOperatorSidePresentation("LONG").tone).toBe("success");
    expect(paperOperatorSidePresentation("숏").label).toBe("숏");
  });

  it("derives capital delta and cumulative PnL from existing numbers only", () => {
    const delta = paperOperatorCapitalDelta(10_000, 10002.15);
    expect(delta?.absolute).toBeCloseTo(2.15);
    expect(delta?.percent).toBeCloseTo(0.0215);
    expect(delta?.tone).toBe("positive");
    expect(paperOperatorCumulativeRealizedPnl([2.148084, -3.170778, 1])).toEqual(
      [2.148084, 2.148084 - 3.170778, 2.148084 - 3.170778 + 1],
    );
    expect(paperOperatorNewestFirstToChronological([3, 2, 1])).toEqual([
      1, 2, 3,
    ]);
    expect(paperOperatorLoadedTradesComplete(20)).toBe(true);
    expect(paperOperatorLoadedTradesComplete(40)).toBe(false);
  });

  it("uses stored hold labels and derives duration only from timestamps", () => {
    expect(
      paperOperatorHoldTimeText({ holdingTimeLabel: "6시간 45분" }),
    ).toBe("6시간 45분");
    expect(
      paperOperatorHoldTimeText({
        openedAt: "2026-09-08T07:00:01.319Z",
        closedAt: "2026-09-08T13:45:10.337Z",
      }),
    ).toBe("6시간 45분");
    expect(paperOperatorHoldTimeText({})).toBeNull();
  });

  it("rolls up global trade PnL without writing values back", () => {
    const summary = paperOperatorTradeSetSummary([
      2.148084, -3.170778, -0.888702, 1, 0, -1,
    ]);
    expect(summary.totalTrades).toBe(6);
    expect(summary.wins).toBe(2);
    expect(summary.losses).toBe(3);
    expect(summary.zeros).toBe(1);
    expect(summary.winRatePct).toBeCloseTo(33.3333);
    expect(summary.bestTrade).toBe(2.148084);
    expect(summary.worstTrade).toBe(-3.170778);
    expect(summary.totalRealizedPnl).toBeCloseTo(2.148084 - 3.170778 - 0.888702);
  });

  it("builds a source-backed chart tooltip model", () => {
    const tip = paperOperatorTradeTooltipModel({
      time: "09. 08. 오후 10:45",
      symbol: "BTCUSDT",
      direction: "숏",
      exitReason: "take_profit",
      netPnl: 2.148084,
      pnlPct: 0.2148,
      cumulativePnl: 2.148084,
    });
    expect(tip.closeReason).toBe("익절");
    expect(tip.side).toBe("숏");
    expect(tip.realizedPnl).toBe("+2.148084 USDT");
    expect(tip.realizedPnlPct).toBe("+0.2148%");
    expect(tip.cumulativePnl).toBe("+2.148084 USDT");
    const noisy = paperOperatorTradeTooltipModel({
      time: "09. 08. 오후 10:45",
      symbol: "BTCUSDT",
      direction: "숏",
      exitReason: "take_profit",
      netPnl: -0.1,
      pnlPct: null,
      cumulativePnl: -2.2220000000000004,
    });
    expect(noisy.cumulativePnl).toBe("-2.222 USDT");
    expect(noisy.realizedPnl).toBe("-0.1 USDT");
  });
});
