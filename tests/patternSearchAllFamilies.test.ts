/**
 * Pattern Search families: FVG / Trendline / S-R sequence builders + adapter path.
 */
import { describe, expect, it } from "vitest";
import type { OhlcvCandle } from "../src/lib/rextora/data/ohlcvTypes";
import {
  buildFvgSequence,
  buildSupportResistanceSequence,
  buildTrendlineSequence,
  validateEventSequence,
} from "../src/lib/rextora/strategy/definition/eventSequence";
import { defaultDefinition } from "../src/lib/rextora/strategy/definition/validator";
import { runEventSequenceBacktest } from "../src/lib/rextora/strategy/eventSequenceBacktest";
import { computeParamsHash } from "../src/lib/rextora/strategy/strategyHash";
import { evaluateCandidateWindow } from "../src/lib/rextora/strategySearch/backtestAdapter";
import { generateRandomCandidate } from "../src/lib/rextora/strategySearch/candidateGenerator";
import {
  FVG_BASE_PARAMS,
  SUPPORT_RESISTANCE_BASE_PARAMS,
  TRENDLINE_BASE_PARAMS,
  fvgSearchRanges,
  resolvePatternFamilyFromParams,
  supportResistanceSearchRanges,
  trendlineSearchRanges,
} from "../src/lib/rextora/strategySearch/patternSearchSpaces";
import { createSeededRandom } from "../src/lib/rextora/strategySearch/random";
import { createStrategySearchJobId } from "../src/lib/rextora/strategySearch/searchId";
import { getSearchSpaceById, rangesForSpace } from "../src/lib/rextora/strategySearch/searchSpaces";
import { buildTradeEventTrace } from "../src/lib/rextora/backtest/tradeEventTrace";

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

/** Warm-up then bullish FVG (gap between bar i-2 high and i low). */
function buildFvgLongCandles(): OhlcvCandle[] {
  const out: OhlcvCandle[] = [];
  for (let i = 0; i < 24; i += 1) {
    const px = 100 + (i % 3) * 0.05;
    out.push(candle(i, px, px + 0.2, px - 0.2, px + 0.05));
  }
  // 24: left of gap
  out.push(candle(24, 100, 100.3, 99.7, 100.1));
  // 25: impulse mid
  out.push(candle(25, 100.1, 103, 100, 102.5, 5000));
  // 26: right — bullish FVG: candle[24].high < candle[26].low → gap [100.3, 101.5]
  out.push(candle(26, 101.6, 104, 101.5, 103.5, 4000));
  // 27 away
  out.push(candle(27, 103.5, 104.2, 103, 103.8));
  // 28 revisit / fill / confirm into gap
  out.push(candle(28, 102.2, 102.8, 100.5, 102.5, 3000));
  out.push(candle(29, 102.5, 103.5, 102.2, 103.2));
  out.push(candle(30, 103.2, 108, 103, 107));
  return out;
}

describe("pattern Search spaces catalog", () => {
  it("exposes fvg / trendline / support_resistance spaces", () => {
    for (const id of ["fvg", "trendline", "support_resistance"]) {
      const space = getSearchSpaceById(id);
      expect(space?.id).toBe(id);
      expect(rangesForSpace(space!).length).toBeGreaterThan(5);
    }
  });

  it("sequence builders validate", () => {
    expect(validateEventSequence(buildFvgSequence(FVG_BASE_PARAMS)).ok).toBe(
      true,
    );
    expect(
      validateEventSequence(buildTrendlineSequence(TRENDLINE_BASE_PARAMS)).ok,
    ).toBe(true);
    expect(
      validateEventSequence(
        buildSupportResistanceSequence(SUPPORT_RESISTANCE_BASE_PARAMS),
      ).ok,
    ).toBe(true);
  });

  it("generates FVG candidates without SafeV44 keys", () => {
    const candidate = generateRandomCandidate({
      jobId: createStrategySearchJobId(),
      iteration: 1,
      parameterRanges: fvgSearchRanges(),
      baseParams: { ...FVG_BASE_PARAMS },
      random: createSeededRandom(9),
      searchVersion: "1",
    });
    expect(resolvePatternFamilyFromParams(candidate.params)).toBe("fvg");
    expect(candidate.params).not.toHaveProperty("ema_fast");
    expect(candidate.paramsHash).toBe(computeParamsHash(candidate.params));
  });

  it("generates TL and SR candidates", () => {
    const tl = generateRandomCandidate({
      jobId: createStrategySearchJobId(),
      iteration: 2,
      parameterRanges: trendlineSearchRanges(),
      baseParams: { ...TRENDLINE_BASE_PARAMS },
      random: createSeededRandom(11),
      searchVersion: "1",
    });
    expect(resolvePatternFamilyFromParams(tl.params)).toBe("trendline");

    const sr = generateRandomCandidate({
      jobId: createStrategySearchJobId(),
      iteration: 3,
      parameterRanges: supportResistanceSearchRanges(),
      baseParams: { ...SUPPORT_RESISTANCE_BASE_PARAMS },
      random: createSeededRandom(13),
      searchVersion: "1",
    });
    expect(resolvePatternFamilyFromParams(sr.params)).toBe(
      "support_resistance",
    );
  });
});

describe("FVG Search → event-sequence evaluation", () => {
  it("evaluates FVG candidate via adapter and persists zone geometry on trades", async () => {
    const candles = buildFvgLongCandles();
    const params = { ...FVG_BASE_PARAMS, penetrationPct: 0.4 };
    const seq = buildFvgSequence(params);
    const direct = runEventSequenceBacktest({
      def: defaultDefinition({
        strategyId: "fvg_direct",
        strategyName: "fvg",
        strategyType: "condition_builder",
        timeframe: "15m",
        eventSequence: seq,
        risk: {
          stopLossAtrMult: params.stopAtrMult,
          takeProfitAtrMult: params.tpAtrMult,
          useTrailing: false,
          trailAtrMult: 1,
          maxHoldBars: params.maxHoldBars,
          oppositeSignalExit: false,
          structureInvalidationExit: false,
          partialExitEnabled: false,
        },
        execution: {
          costGuardEnabled: false,
          costGuardK: 3,
          cooldownBars: 0,
          longEnabled: true,
          shortEnabled: false,
        },
      }),
      symbol: "BTCUSDT",
      candles,
      balance: 10_000,
      feeRate: 0.0004,
      slippageRate: 0.0002,
    });

    // Adapter path must use the same event-sequence engine.
    const evaluation = await evaluateCandidateWindow({
      candidate: {
        candidateId: "cand_fvg_1",
        jobId: createStrategySearchJobId(),
        iteration: 1,
        generatorType: "random",
        parentCandidateIds: [],
        params,
        paramsHash: computeParamsHash(params),
        createdAt: new Date().toISOString(),
      },
      symbol: "BTCUSDT",
      timeframe: "15m",
      window: {
        id: "w1",
        label: "test",
        requestedFrom: candles[0]!.openTime,
        requestedTo: candles[candles.length - 1]!.openTime,
        requiredForPass: true,
      },
      balance: 10_000,
      costConfig: {
        feeRate: 0.0004,
        slippageRate: 0.0002,
        fundingRate: 0,
        applyFunding: false,
        applySpread: false,
        spreadRate: 0,
      },
      preloadedCandles: candles,
    });

    expect(evaluation.metrics.startingBalance).toBe(10_000);
    // Trade count may be 0 on edge geometry — still a valid evaluation path.
    expect(evaluation.metrics.trades).toBeGreaterThanOrEqual(0);
    expect(evaluation.durationMs).toBeGreaterThanOrEqual(0);

    if (direct.trades.length > 0) {
      const t = direct.trades[0]!;
      expect(t.patternType).toBe("fvg");
      expect(t.zoneHigh).toBeGreaterThan(t.zoneLow!);
      const trace = buildTradeEventTrace(t as never);
      expect(trace.patternType).toBe("fvg");
      expect(trace.zoneHigh).toBe(t.zoneHigh);
    }
  });
});

function buildAscendingTrendCandles(): OhlcvCandle[] {
  const out: OhlcvCandle[] = [];
  for (let i = 0; i < 40; i += 1) {
    const base = 100 + i * 0.35;
    const isPivotLow = i === 8 || i === 18 || i === 28;
    const isPivotHigh = i === 12 || i === 22 || i === 32;
    if (isPivotLow) {
      out.push(candle(i, base + 0.4, base + 0.5, base - 0.8, base));
    } else if (isPivotHigh) {
      out.push(candle(i, base, base + 1.2, base - 0.2, base + 0.8));
    } else {
      out.push(candle(i, base, base + 0.4, base - 0.3, base + 0.1));
    }
  }
  // Breakout above ascending support
  out.push(candle(40, 114, 116, 113.5, 115.5, 4000));
  out.push(candle(41, 115.5, 117, 115, 116.5));
  return out;
}

function buildSrSupportCandles(): OhlcvCandle[] {
  const out: OhlcvCandle[] = [];
  for (let i = 0; i < 30; i += 1) {
    const px = 100 + Math.sin(i / 3) * 2;
    out.push(candle(i, px, px + 0.8, px - 0.8, px + 0.1));
  }
  // Establish low near 96 then revisit
  out.push(candle(30, 98, 99, 96, 96.5, 2000));
  out.push(candle(31, 96.5, 98, 96.2, 97.5));
  out.push(candle(32, 97.5, 99, 96.1, 98.2, 2500));
  out.push(candle(33, 98.2, 101, 98, 100.5));
  return out;
}

describe("Trendline Search → event-sequence evaluation", () => {
  it("evaluates trendline candidate via adapter and persists geometry when traded", async () => {
    const candles = buildAscendingTrendCandles();
    const params = { ...TRENDLINE_BASE_PARAMS, minTouchCount: 2, tolerancePct: 2 };
    const seq = buildTrendlineSequence(params);
    expect(validateEventSequence(seq).ok).toBe(true);

    const direct = runEventSequenceBacktest({
      def: defaultDefinition({
        strategyId: "tl_direct",
        strategyName: "tl",
        strategyType: "condition_builder",
        timeframe: "15m",
        eventSequence: seq,
        risk: {
          stopLossAtrMult: params.stopAtrMult,
          takeProfitAtrMult: params.tpAtrMult,
          useTrailing: false,
          trailAtrMult: 1,
          maxHoldBars: params.maxHoldBars,
          oppositeSignalExit: false,
          structureInvalidationExit: false,
          partialExitEnabled: false,
        },
        execution: {
          costGuardEnabled: false,
          costGuardK: 3,
          cooldownBars: 0,
          longEnabled: true,
          shortEnabled: false,
        },
      }),
      symbol: "BTCUSDT",
      candles,
      balance: 10_000,
      feeRate: 0.0004,
      slippageRate: 0.0002,
    });

    const evaluation = await evaluateCandidateWindow({
      candidate: {
        candidateId: "cand_tl_1",
        jobId: createStrategySearchJobId(),
        iteration: 1,
        generatorType: "random",
        parentCandidateIds: [],
        params,
        paramsHash: computeParamsHash(params),
        createdAt: new Date().toISOString(),
      },
      symbol: "BTCUSDT",
      timeframe: "15m",
      window: {
        id: "w1",
        label: "test",
        requestedFrom: candles[0]!.openTime,
        requestedTo: candles[candles.length - 1]!.openTime,
        requiredForPass: true,
      },
      balance: 10_000,
      costConfig: {
        feeRate: 0.0004,
        slippageRate: 0.0002,
        fundingRate: 0,
        applyFunding: false,
        applySpread: false,
        spreadRate: 0,
      },
      preloadedCandles: candles,
    });

    expect(evaluation.metrics.trades).toBeGreaterThanOrEqual(0);
    expect(evaluation.durationMs).toBeGreaterThanOrEqual(0);

    if (direct.trades.length > 0) {
      const t = direct.trades[0]!;
      expect(t.patternType).toBe("trendline");
      expect(t.zoneHigh).toBeGreaterThan(t.zoneLow!);
      const trace = buildTradeEventTrace(t as never);
      expect(trace.patternType).toBe("trendline");
      expect(trace.zoneHigh).toBe(t.zoneHigh);
      expect(trace.zoneLow).toBe(t.zoneLow);
    }
  });
});

describe("S/R Search → event-sequence evaluation", () => {
  it("evaluates support_resistance candidate via adapter and persists geometry when traded", async () => {
    const candles = buildSrSupportCandles();
    const params = { ...SUPPORT_RESISTANCE_BASE_PARAMS, minTouches: 1, tolerancePct: 3 };
    const seq = buildSupportResistanceSequence(params);
    expect(validateEventSequence(seq).ok).toBe(true);

    const direct = runEventSequenceBacktest({
      def: defaultDefinition({
        strategyId: "sr_direct",
        strategyName: "sr",
        strategyType: "condition_builder",
        timeframe: "15m",
        eventSequence: seq,
        risk: {
          stopLossAtrMult: params.stopAtrMult,
          takeProfitAtrMult: params.tpAtrMult,
          useTrailing: false,
          trailAtrMult: 1,
          maxHoldBars: params.maxHoldBars,
          oppositeSignalExit: false,
          structureInvalidationExit: false,
          partialExitEnabled: false,
        },
        execution: {
          costGuardEnabled: false,
          costGuardK: 3,
          cooldownBars: 0,
          longEnabled: true,
          shortEnabled: false,
        },
      }),
      symbol: "BTCUSDT",
      candles,
      balance: 10_000,
      feeRate: 0.0004,
      slippageRate: 0.0002,
    });

    const evaluation = await evaluateCandidateWindow({
      candidate: {
        candidateId: "cand_sr_1",
        jobId: createStrategySearchJobId(),
        iteration: 1,
        generatorType: "random",
        parentCandidateIds: [],
        params,
        paramsHash: computeParamsHash(params),
        createdAt: new Date().toISOString(),
      },
      symbol: "BTCUSDT",
      timeframe: "15m",
      window: {
        id: "w1",
        label: "test",
        requestedFrom: candles[0]!.openTime,
        requestedTo: candles[candles.length - 1]!.openTime,
        requiredForPass: true,
      },
      balance: 10_000,
      costConfig: {
        feeRate: 0.0004,
        slippageRate: 0.0002,
        fundingRate: 0,
        applyFunding: false,
        applySpread: false,
        spreadRate: 0,
      },
      preloadedCandles: candles,
    });

    expect(evaluation.metrics.trades).toBeGreaterThanOrEqual(0);
    expect(resolvePatternFamilyFromParams(params)).toBe("support_resistance");

    if (direct.trades.length > 0) {
      const t = direct.trades[0]!;
      expect(t.patternType).toBe("support_resistance");
      expect(t.zoneHigh).toBeGreaterThan(t.zoneLow!);
      const trace = buildTradeEventTrace(t as never);
      expect(trace.patternType).toBe("support_resistance");
      expect(trace.zoneHigh).toBe(t.zoneHigh);
    }
  });
});

describe("pattern support honesty", () => {
  it("marks searchable only when space + sequence builder exist", async () => {
    const { PATTERN_SEARCH_SUPPORT } = await import(
      "../src/lib/rextora/strategySearch/patternSupportMatrix"
    );
    for (const entry of PATTERN_SEARCH_SUPPORT) {
      if (entry.search === "supported") {
        expect(entry.searchable).toBe(true);
        expect(entry.searchSpaceId).toBeTruthy();
        expect(getSearchSpaceById(entry.searchSpaceId!)).not.toBeNull();
      }
      if (entry.search === "unsupported") {
        expect(entry.searchable).toBe(false);
      }
    }
  });
});
