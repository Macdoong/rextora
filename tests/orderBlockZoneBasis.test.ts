import { describe, expect, it } from "vitest";
import type { OhlcvCandle } from "../src/lib/rextora/data/ohlcvTypes";
import {
  computeOrderBlockZoneBounds,
  resolveOrderBlockZoneBasis,
} from "../src/lib/rextora/strategy/conditions/orderBlockZoneBasis";
import {
  buildOrderBlockLongSequence,
} from "../src/lib/rextora/strategy/definition/eventSequence";
import { defaultDefinition } from "../src/lib/rextora/strategy/definition/validator";
import { runEventSequenceBacktest } from "../src/lib/rextora/strategy/eventSequenceBacktest";

/** OB creation candle from eventSequenceBacktest.test.ts (bar 24). */
const OB_CANDLE = {
  open: 100,
  high: 100.2,
  low: 97.8,
  close: 98,
};

describe("orderBlockZoneBasis", () => {
  it("maps legacy bodyOnly to zone basis without changing defaults", () => {
    expect(resolveOrderBlockZoneBasis({ bodyOnly: true })).toBe("BODY");
    expect(resolveOrderBlockZoneBasis({ bodyOnly: false })).toBe("FULL_CANDLE");
    expect(resolveOrderBlockZoneBasis({})).toBe("BODY");
    expect(
      resolveOrderBlockZoneBasis({ zoneBasis: "BODY_PLUS_WICK_PERCENT" }),
    ).toBe("BODY_PLUS_WICK_PERCENT");
  });

  it("computes BODY, FULL_CANDLE, and BODY_PLUS_WICK_PERCENT bounds", () => {
    expect(computeOrderBlockZoneBounds(OB_CANDLE, "BODY")).toEqual({
      high: 100,
      low: 98,
    });
    expect(computeOrderBlockZoneBounds(OB_CANDLE, "FULL_CANDLE")).toEqual({
      high: 100.2,
      low: 97.8,
    });
    expect(
      computeOrderBlockZoneBounds(OB_CANDLE, "BODY_PLUS_WICK_PERCENT", 50),
    ).toEqual({
      high: 100.1,
      low: 97.9,
    });
  });

  it("matches BODY zone to candle open/close on persisted sidecar evidence", () => {
    // Verified from bt_ms3zb3pd_628c2f: creation candle O/H/L/C vs zone.
    const candle = { open: 88310.9, high: 88311, low: 87907.4, close: 87910.9 };
    const body = computeOrderBlockZoneBounds(candle, "BODY");
    expect(body).toEqual({ high: 88310.9, low: 87910.9 });
    expect(body.high).toBe(Math.max(candle.open, candle.close));
    expect(body.low).toBe(Math.min(candle.open, candle.close));
    expect(body.high).not.toBe(candle.high);
    expect(body.low).not.toBe(candle.low);
  });

  it("persists BODY zoneHigh/zoneLow equal to candle body on a real backtest trade", () => {
    const INTERVAL = 15 * 60 * 1000;
    const START = Date.UTC(2024, 0, 1);
    const candle = (
      i: number,
      o: number,
      h: number,
      l: number,
      c: number,
      volume = 1000,
    ): OhlcvCandle => ({
      openTime: START + i * INTERVAL,
      open: o,
      high: h,
      low: l,
      close: c,
      volume,
      closeTime: START + (i + 1) * INTERVAL - 1,
    });
    const candles: OhlcvCandle[] = [];
    for (let i = 0; i < 24; i += 1) {
      const px = 100 + (i % 3) * 0.05;
      candles.push(candle(i, px, px + 0.2, px - 0.2, px + 0.05, 1000));
    }
    candles.push(candle(24, 100, 100.2, 97.8, 98, 1200));
    candles.push(candle(25, 98.1, 104.5, 97.9, 104, 8000));
    candles.push(candle(26, 104, 106.5, 103.5, 106, 2000));
    candles.push(candle(27, 106, 107.2, 105.5, 107, 1800));
    candles.push(candle(28, 99.2, 100.3, 98.1, 100.05, 2500));
    candles.push(candle(29, 100.05, 101.5, 99.8, 101.2, 1500));
    candles.push(candle(30, 101.2, 112, 100.5, 110, 1600));

    const seq = buildOrderBlockLongSequence({
      penetrationPct: 0.5,
      stopAtrMult: 0.5,
      tpAtrMult: 2,
      maxHoldBars: 48,
      zoneLookback: 40,
      zoneBasis: "BODY",
    });
    const result = runEventSequenceBacktest({
      def: defaultDefinition({
        strategyId: "ob_zone_body",
        strategyName: "OB BODY",
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
          volTargetPct: 0.02,
        },
      }),
      symbol: "BTCUSDT",
      candles,
      balance: 10_000,
      feeRate: 0,
      slippageRate: 0,
    });

    const trade = result.trades[0]!;
    expect(trade.zoneHigh).toBe(100);
    expect(trade.zoneLow).toBe(98);
    expect(trade.creationBar).toBe(24);

    const block = trade.patternBlocks?.find((b) => b.family === "order_block");
    expect(block?.zoneHigh).toBe(100);
    expect(block?.zoneLow).toBe(98);
    expect(block?.detectorParams?.zoneBasis ?? block?.detectorParams?.bodyOnly).toBeTruthy();
  });

  it("FULL_CANDLE bounds include wick extremes", () => {
    const { high, low } = computeOrderBlockZoneBounds(OB_CANDLE, "FULL_CANDLE");
    expect(high).toBe(100.2);
    expect(low).toBe(97.8);
    expect(high).toBeGreaterThan(Math.max(OB_CANDLE.open, OB_CANDLE.close));
    expect(low).toBeLessThan(Math.min(OB_CANDLE.open, OB_CANDLE.close));
  });
});
