/**
 * Commercialization regression: hash identity, terminal progress freeze,
 * runtime display, cost/sample metric consistency, entry explainability.
 */
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import { resolveCostStatus } from "../src/lib/rextora/results/researchDisplay";
import { buildTradeEventTrace } from "../src/lib/rextora/backtest/tradeEventTrace";
import { formatRuntimeKo } from "../components/rextora/strategySearch/formValidation";
import {
  displayParamsHashLabel,
  displayStrategyHashLabel,
} from "../src/lib/rextora/displayLabels";
import type { BacktestTrade } from "../src/lib/rextora/backtest/backtestEngine";

describe("commercial lifecycle fixes", () => {
  it("formats sub-hour runtime as minutes, never 0시간", () => {
    expect(formatRuntimeKo(120_000)).toBe("2분");
    expect(formatRuntimeKo(60_000)).toBe("1분");
    expect(formatRuntimeKo(3_600_000)).toBe("1시간");
    expect(formatRuntimeKo(90 * 60_000)).toBe("1시간 30분");
  });

  it("prefers stress evidence over raw totalCost for cost status", () => {
    expect(
      resolveCostStatus({ totalCost: 1, stressPassed: true }),
    ).toBe("비용 스트레스 통과");
    expect(
      resolveCostStatus({ totalCost: 1, stressPassed: false }),
    ).toBe("비용 스트레스 미통과");
  });

  it("builds entry WHY from persisted pattern evidence (no fabrication)", () => {
    const trade = {
      id: "t1",
      side: "LONG",
      entryTime: "2026-06-01T00:00:00.000Z",
      exitTime: "2026-06-01T01:00:00.000Z",
      entryPrice: 100,
      exitPrice: 101,
      exitReason: "take_profit",
      stopPrice: 99,
      takeProfitPrice: 102,
      patternType: "order_block",
      zoneHigh: 101,
      zoneLow: 99.5,
      confirmationCandleTime: "2026-06-01T00:00:00.000Z",
      revisitCandleTime: "2026-05-31T23:45:00.000Z",
      penetrationPct: 0.45,
      patternBlocks: [
        {
          blockId: "b1",
          family: "order_block",
          role: "entry_zone",
          order: 0,
          status: "detected",
          patternType: "order_block",
          zoneHigh: 101,
          zoneLow: 99.5,
          required: true,
          weight: 1,
          priority: 0,
          detectorParams: {},
          measuredValues: {},
          thresholds: {},
        },
      ],
    } as unknown as BacktestTrade & Record<string, unknown>;

    const trace = buildTradeEventTrace(trade, {
      symbol: "BTCUSDT",
      timeframe: "15m",
    });
    expect(trace.whyEnteredKo).toContain("order_block");
    expect(trace.whyEnteredKo).toContain("리테스트");
    expect(trace.whyEnteredKo).toMatch(/침투|존 대비/);
    expect(trace.whyEnteredKo).not.toMatch(/침투 748%/);
    expect(trace.whyExitedKo).toMatch(/익절|take_profit/);
    expect(trace.events.some((e) => e.labelKo === "확인")).toBe(true);
    expect(trace.events.some((e) => e.labelKo === "리테스트")).toBe(true);
    expect(trace.zoneHigh).toBe(101);
    expect(trace.zoneLow).toBe(99.5);
  });

  it("Backtest UI must send canonical strategyHash not paramsHash", async () => {
    const src = await import("fs").then((fs) =>
      fs.readFileSync(
        "components/rextora/backtest/BacktestReviewWorkbench.tsx",
        "utf8",
      ),
    );
    expect(src).toContain(
      "strategyHash: strategy.strategyHash ?? strategy.paramsHash",
    );
    expect(src).not.toMatch(
      /strategyHash:\s*strategy\.paramsHash\s*,/,
    );
    // Must not show MDD banner from trade-count observedValue (15 → 1500%).
    expect(src).toContain("mddExceededReason");
    expect(src).toContain("backtest-eligibility-fail-reason");
    expect(src).toMatch(
      /report\?\.mdd != null[\s\S]*Math\.abs\(report\.mdd \* 100\)/,
    );
  });

  it("operator labels distinguish strategyHash from paramsHash", () => {
    expect(displayStrategyHashLabel()).toBe("전략 해시");
    expect(displayParamsHashLabel()).toBe("파라미터 해시");
    expect(displayStrategyHashLabel()).not.toBe("전략 고유값");
    const wb = fs.readFileSync(
      "components/rextora/backtest/BacktestReviewWorkbench.tsx",
      "utf8",
    );
    expect(wb).toContain("displayStrategyHashLabel()");
    expect(wb).toContain("SavedRunHydrationState");
    expect(wb).toContain("fetchAndApplyRunById");
    expect(wb).toContain('url.searchParams.set("runId"');
    const results = fs.readFileSync(
      "components/rextora/results/ResultsWorkbench.tsx",
      "utf8",
    );
    expect(results).toContain("libraryLoadState");
    expect(results).toContain("전략 라이브러리 불러오는 중");
  });
});
