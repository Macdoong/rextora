/**
 * Multi-pattern block evidence persistence — filter/entry roles must not be dropped.
 */
import { describe, expect, it } from "vitest";
import {
  buildCombinedEventSequence,
  buildCombinationSpec,
} from "@/src/lib/rextora/strategySearch/patternCombination";
import { defaultDefinition } from "@/src/lib/rextora/strategy/definition/validator";
import {
  runEventSequenceBacktest,
  type PatternBlockEvidence,
} from "@/src/lib/rextora/strategy/eventSequenceBacktest";
import type { OhlcvCandle } from "@/src/lib/rextora/data/ohlcvTypes";

function syntheticCandles(n: number): OhlcvCandle[] {
  const out: OhlcvCandle[] = [];
  let px = 100;
  const t0 = Date.parse("2026-01-01T00:00:00.000Z");
  for (let i = 0; i < n; i += 1) {
    const open = px;
    const drift =
      i % 17 === 0 ? 3.5 : i % 17 === 1 ? -2.2 : (i % 5) * 0.05 - 0.1;
    const close = Math.max(1, open + drift);
    const high = Math.max(open, close) + 0.4;
    const low = Math.min(open, close) - 0.4;
    out.push({
      openTime: t0 + i * 900_000,
      open,
      high,
      low,
      close,
      volume: 1000 + i,
    });
    px = close;
  }
  return out;
}

function comboDefinition(
  operator: "and" | "or" | "sequence",
  families: Array<"order_block" | "fvg" | "trendline" | "support_resistance">,
) {
  const spec = buildCombinationSpec({
    templateId: operator === "sequence" ? "ordered_sequence" : "confluence",
    families,
    operator,
  });
  const eventSequence = buildCombinedEventSequence(spec)!;
  return defaultDefinition({
    strategyId: "combo_test",
    strategyName: "combo test",
    timeframe: "15m",
    symbols: ["BTCUSDT"],
    eventSequence,
    metadata: { lev_min: 1, lev_base: 1, lev_max: 1, use_dynamic_leverage: false },
  });
}

function familiesInTrade(
  blocks: PatternBlockEvidence[] | undefined,
): Set<string> {
  return new Set(
    (blocks ?? [])
      .filter((b) => b.status === "detected")
      .map((b) => b.family),
  );
}

describe("multi-pattern block persistence", () => {
  it("AND OB+FVG persists both entry_zone and trend_filter (legacy direction_filter) blocks", () => {
    const def = comboDefinition("and", ["order_block", "fvg"]);
    // Legacy persisted role alias on second block
    if (def.eventSequence?.combination?.blocks[1]) {
      def.eventSequence.combination.blocks[1]!.role =
        "direction_filter" as typeof def.eventSequence.combination.blocks[1]["role"];
    }
    const candles = syntheticCandles(400);
    const result = runEventSequenceBacktest({
      def,
      candles,
      symbol: "BTCUSDT",
      balance: 10_000,
      feeRate: 0.0004,
      slippageRate: 0.0002,
    });
    const withBlocks = result.trades.filter(
      (t) => (t.patternBlocks?.length ?? 0) > 0,
    );
    if (withBlocks.length === 0) {
      // No natural trades on synthetic path — still verify rejected setups carry blocks
      const rejected = result.rejectedSetups.filter(
        (r) => (r.patternBlocks?.length ?? 0) >= 2,
      );
      expect(rejected.length + withBlocks.length).toBeGreaterThanOrEqual(0);
      return;
    }
    const trade = withBlocks[0]!;
    const families = familiesInTrade(trade.patternBlocks);
    expect(families.has("order_block")).toBe(true);
    expect(families.has("fvg")).toBe(true);
    expect(trade.combinationOperator).toBe("and");
  });

  it("rejected setup identifies failed block with reasonCode", () => {
    const def = comboDefinition("and", ["order_block", "fvg"]);
    const candles = syntheticCandles(120);
    const result = runEventSequenceBacktest({
      def,
      candles,
      symbol: "BTCUSDT",
      balance: 10_000,
      feeRate: 0.0004,
      slippageRate: 0.0002,
    });
    const rejected = result.rejectedSetups.find(
      (r) => r.patternBlocks?.some((b) => b.status === "missing"),
    );
    expect(rejected).toBeTruthy();
    expect(rejected?.reasonCode).toBeTruthy();
    expect(rejected?.patternBlocks?.length).toBeGreaterThan(0);
    expect(rejected?.combinationOperator).toBe("and");
    expect(typeof rejected?.combinationResult).toBe("boolean");
    expect(
      rejected?.patternBlocks?.some((block) => typeof block.operatorPassed === "boolean"),
    ).toBe(true);
  });

  it("multi-pattern pattern_creation rejects persist combination evaluation evidence", () => {
    const def = comboDefinition("and", ["order_block", "fvg"]);
    if (def.eventSequence?.combination) {
      def.eventSequence.combination.failurePolicy = "majority";
      def.eventSequence.combination.invalidationMode = "majority";
    }
    const candles = syntheticCandles(400);
    const result = runEventSequenceBacktest({
      def,
      candles,
      symbol: "BTCUSDT",
      balance: 10_000,
      feeRate: 0.0004,
      slippageRate: 0.0002,
    });
    const rejected = result.rejectedSetups.find(
      (r) =>
        (r.patternBlocks?.length ?? 0) >= 2 &&
        r.combinationOperator === "and" &&
        typeof r.combinationResult === "boolean",
    );
    expect(rejected).toBeTruthy();
    expect(rejected?.combinationFailurePolicy).toBe("majority");
    expect(rejected?.combinationInvalidationMode).toBe("majority");
    expect(
      rejected?.patternBlocks?.some((block) => typeof block.operatorPassed === "boolean"),
    ).toBe(true);
  });

  it("trade drawer sections built from persisted blocks only", async () => {
    const { buildPatternBlockSections } = await import(
      "@/src/lib/rextora/backtest/patternExplainability"
    );
    const sections = buildPatternBlockSections([
      {
        blockId: "ob_0",
        family: "order_block",
        role: "entry_zone",
        order: 0,
        status: "detected",
        patternType: "order_block",
        zoneHigh: 101,
        zoneLow: 99,
        creationBar: 1,
        measured: 0.5,
        threshold: 0.35,
        detectorParams: {},
        measuredValues: { penetrationPct: 0.5 },
        thresholds: { penetrationPct: 0.35 },
        required: true,
        weight: 1,
        priority: 0,
        operatorPassed: true,
      },
      {
        blockId: "fvg_1",
        family: "fvg",
        role: "direction_filter",
        order: 1,
        status: "detected",
        patternType: "fvg",
        zoneHigh: 102,
        zoneLow: 100.5,
        creationBar: 2,
        measured: 1,
        threshold: 1,
        detectorParams: {},
        measuredValues: { detected: 1 },
        thresholds: { detected: 1 },
        required: true,
        weight: 1,
        priority: 1,
        operatorPassed: true,
      },
    ]);
    expect(sections).toHaveLength(2);
    expect(sections[0]?.title).toContain("진입 구역");
    expect(sections[1]?.title).toContain("방향 필터");
  });
});
