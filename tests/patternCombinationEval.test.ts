/**
 * Combined-pattern evaluation proofs (fixture candles — no fabricated geometry).
 */
import { describe, expect, it } from "vitest";
import type { OhlcvCandle } from "../src/lib/rextora/data/ohlcvTypes";
import { defaultDefinition } from "../src/lib/rextora/strategy/definition/validator";
import { runEventSequenceBacktest } from "../src/lib/rextora/strategy/eventSequenceBacktest";
import { buildTradeEventTrace } from "../src/lib/rextora/backtest/tradeEventTrace";
import {
  buildCombinedEventSequence,
  buildCombinationSpec,
  combinationParamsForCandidate,
  mutateCombinationParams,
} from "../src/lib/rextora/strategySearch/patternCombination";
import { generateLocalCandidate } from "../src/lib/rextora/strategySearch/candidateGenerator";
import { createSeededRandom } from "../src/lib/rextora/strategySearch/random";
import { createStrategySearchJobId } from "../src/lib/rextora/strategySearch/searchId";
import { orderBlockSearchRanges } from "../src/lib/rextora/strategySearch/patternSearchSpaces";
import { computeParamsHash } from "../src/lib/rextora/strategy/strategyHash";

const INTERVAL = 15 * 60 * 1000;
const START = Date.UTC(2024, 0, 1);

function candle(
  i: number,
  o: number,
  h: number,
  l: number,
  c: number,
  volume = 1000,
): OhlcvCandle {
  return {
    openTime: START + i * INTERVAL,
    open: o,
    high: h,
    low: l,
    close: c,
    volume,
    closeTime: START + (i + 1) * INTERVAL - 1,
  };
}

/** Flat warm-up then a clear bullish OB → revisit → penetrate → confirm. */
function buildObLongCandles(): OhlcvCandle[] {
  const out: OhlcvCandle[] = [];
  for (let i = 0; i < 24; i += 1) {
    const px = 100 + (i % 3) * 0.05;
    out.push(candle(i, px, px + 0.2, px - 0.2, px + 0.05, 1000));
  }
  out.push(candle(24, 100, 100.2, 97.8, 98, 1200));
  out.push(candle(25, 98.1, 104.5, 97.9, 104, 8000));
  out.push(candle(26, 104, 106.5, 103.5, 106, 2000));
  out.push(candle(27, 106, 107.2, 105.5, 107, 1800));
  out.push(candle(28, 99.2, 100.3, 98.1, 100.05, 2500));
  out.push(candle(29, 100.05, 101.5, 99.8, 101.2, 1500));
  out.push(candle(30, 101.2, 112, 100.5, 110, 1600));
  return out;
}

function makeDef(seq: NonNullable<ReturnType<typeof buildCombinedEventSequence>>) {
  return defaultDefinition({
    strategyId: "combo_eval",
    strategyName: "Combo Eval",
    strategyType: "condition_builder",
    timeframe: "15m",
    eventSequence: seq,
    risk: {
      stopLossAtrMult: 0.5,
      takeProfitAtrMult: 2,
      useTrailing: false,
      trailAtrMult: 1,
      maxHoldBars: 48,
      oppositeSignalExit: false,
      structureInvalidationExit: false,
      partialExitEnabled: false,
    },
    positionSizing: {
      baseBalancePct: 0.1,
      sizeMin: 0.5,
      sizeMax: 1.5,
      useVolTarget: false,
      targetAtrPct: 0.02,
    },
    execution: {
      costGuardEnabled: false,
      costGuardK: 3,
      cooldownBars: 0,
      longEnabled: true,
      shortEnabled: false,
    },
  });
}

describe("combined pattern evaluation", () => {
  it("AND OB+Trendline rejects when Trendline cannot form (impossible params)", () => {
    // Use impossible TL thresholds so the second block is verifiably missing
    // without fabricating geometry. (OB synthetic series may contain incidental FVGs.)
    const spec = buildCombinationSpec({
      templateId: "confluence",
      families: ["order_block", "trendline"],
      operator: "and",
      sharedParams: {
        minTouchCount: 99,
        minPivotCount: 99,
        slopeMin: 1e6,
      },
    });
    // Force impossible params onto the TL block only.
    const tl = spec.blocks.find((b) => b.family === "trendline");
    if (tl) {
      tl.params = {
        ...tl.params,
        minTouchCount: 99,
        minPivotCount: 99,
        slopeMin: 1e6,
      };
    }
    const seq = buildCombinedEventSequence(spec, {
      penetrationPct: 0.5,
      stopAtrMult: 0.5,
      tpAtrMult: 2,
      maxHoldBars: 48,
      zoneLookback: 40,
      confirmationMode: "single_close",
    });
    expect(seq).not.toBeNull();
    // Ensure combination sidecar keeps impossible TL params.
    const comboTl = seq!.combination?.blocks.find((b) => b.family === "trendline");
    expect(comboTl?.params.minTouchCount).toBe(99);
    const result = runEventSequenceBacktest({
      def: makeDef(seq!),
      symbol: "BTCUSDT",
      candles: buildObLongCandles(),
      balance: 10_000,
      feeRate: 0.0004,
      slippageRate: 0.0002,
    });
    expect(result.trades.length).toBe(0);
    const reasons = result.rejectedSetups.map((r) => r.reasonCode);
    expect(
      reasons.some(
        (r) =>
          r === "trendline_missing" ||
          r === "operator_not_satisfied" ||
          r.endsWith("_missing"),
      ),
    ).toBe(true);
  });

  it("OR OB+FVG allows entry when only OB is present and stores every block", () => {
    const spec = buildCombinationSpec({
      templateId: "confluence",
      families: ["order_block", "fvg"],
      operator: "or",
    });
    const seq = buildCombinedEventSequence(spec, {
      penetrationPct: 0.5,
      stopAtrMult: 0.5,
      tpAtrMult: 2,
      maxHoldBars: 48,
      zoneLookback: 40,
      confirmationMode: "single_close",
    });
    expect(seq).not.toBeNull();
    const result = runEventSequenceBacktest({
      def: makeDef(seq!),
      symbol: "BTCUSDT",
      candles: buildObLongCandles(),
      balance: 10_000,
      feeRate: 0.0004,
      slippageRate: 0.0002,
    });
    expect(result.trades.length).toBeGreaterThanOrEqual(1);
    const t = result.trades[0]!;
    expect(t.patternBlocks).toBeDefined();
    expect(t.patternBlocks!.length).toBe(2);
    expect(t.patternBlocks!.some((b) => b.family === "order_block")).toBe(true);
    expect(t.patternBlocks!.some((b) => b.family === "fvg")).toBe(true);
    expect(t.combinationOperator).toBe("or");
    expect(t.combinationResult).toBe(true);
    // At least one block detected with geometry; missing blocks must not invent zones.
    const detected = t.patternBlocks!.filter((b) => b.status === "detected");
    expect(detected.length).toBeGreaterThanOrEqual(1);
    for (const b of detected) {
      expect(b.zoneHigh).not.toBeNull();
      expect(b.zoneLow).not.toBeNull();
    }
    for (const b of t.patternBlocks!.filter((x) => x.status === "missing")) {
      expect(b.zoneHigh).toBeNull();
      expect(b.zoneLow).toBeNull();
    }

    const trace = buildTradeEventTrace(t as never);
    expect(trace.patternBlocks?.length).toBe(2);
  });

  it("SEQUENCE rejects when a later block is missing", () => {
    const spec = buildCombinationSpec({
      templateId: "ordered_sequence",
      families: ["order_block", "trendline"],
      operator: "sequence",
    });
    const tl = spec.blocks.find((b) => b.family === "trendline");
    if (tl) {
      tl.params = {
        ...tl.params,
        minTouchCount: 99,
        minPivotCount: 99,
        slopeMin: 1e6,
      };
    }
    const seq = buildCombinedEventSequence(spec, {
      penetrationPct: 0.5,
      stopAtrMult: 0.5,
      tpAtrMult: 2,
      maxHoldBars: 48,
      zoneLookback: 40,
      confirmationMode: "single_close",
    });
    const result = runEventSequenceBacktest({
      def: makeDef(seq!),
      symbol: "BTCUSDT",
      candles: buildObLongCandles(),
      balance: 10_000,
      feeRate: 0.0004,
      slippageRate: 0.0002,
    });
    expect(result.trades.length).toBe(0);
    expect(result.rejectedSetups.length).toBeGreaterThan(0);
    const codes = result.rejectedSetups.map((r) => r.reasonCode);
    expect(
      codes.some(
        (r) =>
          r === "trendline_missing" ||
          r === "sequence_order_failed" ||
          r === "operator_not_satisfied" ||
          r.endsWith("_missing"),
      ),
    ).toBe(true);
  });

  it("mutateCombinationParams can change operator (identity keys)", () => {
    const base = {
      ...combinationParamsForCandidate(
        buildCombinationSpec({
          templateId: "confluence",
          families: ["order_block", "fvg"],
          operator: "and",
        }),
      ),
      penetrationPct: 0.4,
      stopAtrMult: 1.2,
    };
    // Land in operator-mutation band [0.4, 0.55) then pick OR index.
    let calls = 0;
    const forced = mutateCombinationParams(base, {
      nextFloat: (min, max) => {
        calls += 1;
        if (calls === 1) return 0.5; // operator mutation branch
        if (max === 3) return 1; // index 1 → "or"
        return min + (max - min) * 0.5;
      },
    });
    expect(forced.combinationOperator).toBe("or");
    expect(forced.combinationOperator).not.toBe(base.combinationOperator);
  });

  it("local candidate mutation preserves combinationFamilies key when present", () => {
    const jobId = createStrategySearchJobId();
    const parentParams = {
      ...combinationParamsForCandidate(
        buildCombinationSpec({
          templateId: "confluence",
          families: ["order_block", "fvg"],
          operator: "and",
        }),
      ),
      penetrationPct: 0.4,
      stopAtrMult: 1.2,
      tpAtrMult: 2,
      maxHoldBars: 48,
      zoneLookback: 40,
    };
    const parent = {
      candidateId: `${jobId}_cand_1`,
      jobId,
      iteration: 1,
      generatorType: "random" as const,
      parentCandidateIds: [] as string[],
      params: parentParams,
      paramsHash: computeParamsHash(parentParams as never),
      createdAt: new Date().toISOString(),
    };
    const child = generateLocalCandidate({
      jobId,
      iteration: 2,
      parameterRanges: orderBlockSearchRanges(),
      random: createSeededRandom(42),
      parentCandidate: parent,
      mutationScale: 0.25,
      searchVersion: "1",
    });
    expect(typeof child.params.combinationFamilies).toBe("string");
    expect(child.paramsHash).not.toBe("7893ca3f0e30");
  });
});
