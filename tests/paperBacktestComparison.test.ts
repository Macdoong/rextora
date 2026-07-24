import { describe, expect, it } from "vitest";
import { buildPaperBacktestComparison } from "../src/lib/rextora/paper/paperBacktestComparison";
import { buildPaperFeedback } from "../src/lib/rextora/strategySearch/paperFeedback";

describe("paperBacktestComparison", () => {
  it("flags low trade count and drawdown deviations", () => {
    const cmp = buildPaperBacktestComparison({
      strategyId: "custom_abc",
      strategyHash: "deadbeef0001",
      paperSessionId: "paper_1",
      backtestResultId: "bt_1",
      expectedTrades: 20,
      actualTrades: 4,
      expectedSignalCount: 30,
      actualSignalCount: 10,
      expectedMdd: 0.1,
      actualMdd: 0.22,
      expectedFeeUsdt: 1,
      actualFeeUsdt: 3,
      expectedSlippageUsdt: 0.5,
      actualSlippageUsdt: 1.2,
    });

    expect(cmp.missedSignals).toBe(20);
    expect(cmp.feedbackCodes).toContain("paper_trade_count_low");
    expect(cmp.feedbackCodes).toContain("signal_miss_rate_high");
    expect(cmp.feedbackCodes).toContain("paper_drawdown_high");
    expect(cmp.feedbackCodes).toContain("paper_fee_high");
    expect(cmp.feedbackCodes).toContain("paper_slippage_high");
  });

  it("buildPaperFeedback includes machine-readable comparison", () => {
    const fb = buildPaperFeedback({
      strategyId: "custom_abc",
      strategyName: "Test",
      strategyHash: "deadbeef0001",
      paperTradeCount: 2,
      paperSignalCount: 5,
      paperRealizedPnl: -10,
      expectedTrades: 10,
      expectedSignalCount: 12,
    });
    expect(fb.comparison).not.toBeNull();
    expect(fb.feedbackCodes.length).toBeGreaterThan(0);
    expect(fb.deviations.some((d) => d.key === "trade_count" && d.available)).toBe(
      true,
    );
  });
});
