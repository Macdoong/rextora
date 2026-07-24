import { describe, expect, it } from "vitest";
import type { OhlcvCandle } from "../src/lib/rextora/data/ohlcvTypes";
import {
  buildOrderBlockLongSequence,
  validateEventSequence,
  type StrategyEventSequence,
} from "../src/lib/rextora/strategy/definition/eventSequence";
import { defaultDefinition } from "../src/lib/rextora/strategy/definition/validator";
import {
  evaluateEventSequencePaperSignal,
  runEventSequenceBacktest,
} from "../src/lib/rextora/strategy/eventSequenceBacktest";
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

/** Flat warm-up then a clear bullish OB → revisit → penetrate → confirm. */
function buildObLongCandles(opts?: {
  /** Extra bars after confirmation for exit control */
  after?: OhlcvCandle[];
}): OhlcvCandle[] {
  const out: OhlcvCandle[] = [];
  for (let i = 0; i < 24; i += 1) {
    const px = 100 + (i % 3) * 0.05;
    out.push(candle(i, px, px + 0.2, px - 0.2, px + 0.05, 1000));
  }
  // 24: bearish order-block candle (body zone [98, 100])
  out.push(candle(24, 100, 100.2, 97.8, 98, 1200));
  // 25: bullish impulse
  out.push(candle(25, 98.1, 104.5, 97.9, 104, 8000));
  // 26: detection bar (away from zone)
  out.push(candle(26, 104, 106.5, 103.5, 106, 2000));
  // 27: still away
  out.push(candle(27, 106, 107.2, 105.5, 107, 1800));
  // 28: revisit + penetrate (≥50%) + bullish confirmation close
  out.push(candle(28, 99.2, 100.3, 98.1, 100.05, 2500));

  if (opts?.after?.length) {
    for (const a of opts.after) out.push(a);
  } else {
    // 29: mild continuation
    out.push(candle(29, 100.05, 101.5, 99.8, 101.2, 1500));
    // 30: take profit region (wide enough for typical ATR*tp)
    out.push(candle(30, 101.2, 112, 100.5, 110, 1600));
  }
  return out;
}

function makeDef(seq: StrategyEventSequence) {
  return defaultDefinition({
    strategyId: "es_test",
    strategyName: "EventSequence OB Long",
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

describe("eventSequenceBacktest", () => {
  it("buildOrderBlockLongSequence validates", () => {
    const seq = buildOrderBlockLongSequence({
      penetrationPct: 0.5,
      stopAtrMult: 0.5,
      tpAtrMult: 2,
      maxHoldBars: 48,
      zoneLookback: 40,
    });
    expect(validateEventSequence(seq).ok).toBe(true);
  });

  it("synthetic candles produce deterministic long entry when OB sequence completes", () => {
    const seq = buildOrderBlockLongSequence({
      penetrationPct: 0.5,
      stopAtrMult: 0.5,
      tpAtrMult: 2,
      maxHoldBars: 48,
      zoneLookback: 40,
    });
    const candles = buildObLongCandles();
    const result = runEventSequenceBacktest({
      def: makeDef(seq),
      symbol: "BTCUSDT",
      candles,
      balance: 10_000,
      feeRate: 0.0004,
      slippageRate: 0.0002,
    });

    expect(result.trades.length).toBeGreaterThanOrEqual(1);
    const t = result.trades[0];
    expect(t.side).toBe("LONG");
    expect(t.signalType).toBe("EVENT_SEQUENCE");
    expect(t.patternType).toBe("order_block");
    expect(t.entryBar).toBe(28);
    expect(t.zoneHigh).toBeGreaterThan(t.zoneLow!);
    expect(t.creationBar).toBe(24);
    expect(t.revisitBar).toBe(28);
    expect(t.confirmationBar).toBe(28);
    expect(t.stopPrice).toBeDefined();
    expect(t.takeProfitPrice).toBeDefined();
    expect(result.assumptionsKo.some((a) => a.includes("손절"))).toBe(true);

    const trace = buildTradeEventTrace(t as never);
    expect(trace.patternType).toBe("order_block");
    expect(trace.zoneHigh).toBe(t.zoneHigh);
    expect(trace.creationCandleTime).toBeTruthy();
    expect(trace.rejectedReasonCode ?? null).toBeNull();
  });

  it("no look-ahead: shifting future candles does not change past decisions at bar i", () => {
    const seq = buildOrderBlockLongSequence({
      penetrationPct: 0.5,
      stopAtrMult: 0.5,
      tpAtrMult: 2,
      maxHoldBars: 48,
      zoneLookback: 40,
    });
    const base = buildObLongCandles();
    const i = 28;
    const trunc = runEventSequenceBacktest({
      def: makeDef(seq),
      symbol: "BTCUSDT",
      candles: base.slice(0, i + 1),
      balance: 10_000,
      feeRate: 0,
      slippageRate: 0,
    });

    const mutated = base.map((c, idx) =>
      idx > i
        ? {
            ...c,
            open: c.open * 3,
            high: c.high * 3,
            low: c.low * 3,
            close: c.close * 3,
            volume: c.volume * 10,
          }
        : c,
    );
    const fullMut = runEventSequenceBacktest({
      def: makeDef(seq),
      symbol: "BTCUSDT",
      candles: mutated,
      balance: 10_000,
      feeRate: 0,
      slippageRate: 0,
    });

    const entryKey = (t: {
      entryBar: number;
      entryPrice: number;
      side: string;
      stopPrice?: number;
      takeProfitPrice?: number;
      creationBar?: number;
      revisitBar?: number;
      confirmationBar?: number;
    }) => ({
      entryBar: t.entryBar,
      entryPrice: t.entryPrice,
      side: t.side,
      stopPrice: t.stopPrice,
      takeProfitPrice: t.takeProfitPrice,
      creationBar: t.creationBar,
      revisitBar: t.revisitBar,
      confirmationBar: t.confirmationBar,
    });

    const truncEntries = trunc.trades
      .filter((t) => t.entryBar <= i)
      .map(entryKey);
    const mutEntries = fullMut.trades
      .filter((t) => t.entryBar <= i)
      .map(entryKey);
    expect(mutEntries).toEqual(truncEntries);
    expect(truncEntries.length).toBeGreaterThanOrEqual(1);
  });

  it("invalid sequence is rejected", () => {
    const good = buildOrderBlockLongSequence({
      penetrationPct: 0.5,
      stopAtrMult: 0.5,
      tpAtrMult: 2,
      maxHoldBars: 48,
      zoneLookback: 40,
    });
    const bad: StrategyEventSequence = {
      ...good,
      steps: [...good.steps].reverse(),
    };
    expect(validateEventSequence(bad).ok).toBe(false);

    const result = runEventSequenceBacktest({
      def: makeDef(bad),
      symbol: "BTCUSDT",
      candles: buildObLongCandles(),
      balance: 10_000,
      feeRate: 0,
      slippageRate: 0,
    });
    expect(result.trades).toEqual([]);
    expect(result.rejectedSetups[0]?.reasonCode).toBe("invalid_event_sequence");
  });

  it("same-candle stop preferred over target", () => {
    const seq = buildOrderBlockLongSequence({
      penetrationPct: 0.5,
      stopAtrMult: 0.1,
      tpAtrMult: 0.1,
      maxHoldBars: 48,
      zoneLookback: 40,
    });
    // After entry at 28, bar 29 spans both stop and target
    const after = [
      candle(29, 100, 130, 50, 100, 2000),
    ];
    const candles = buildObLongCandles({ after });
    const result = runEventSequenceBacktest({
      def: makeDef(seq),
      symbol: "BTCUSDT",
      candles,
      balance: 10_000,
      feeRate: 0,
      slippageRate: 0,
    });

    expect(result.trades.length).toBeGreaterThanOrEqual(1);
    const t = result.trades[0];
    expect(t.exitReason).toBe("stop_loss");
    expect(t.exitPrice).toBe(t.stopPrice);
  });

  it("paper signal matches backtest entry on last bar", () => {
    const seq = buildOrderBlockLongSequence({
      penetrationPct: 0.5,
      stopAtrMult: 0.5,
      tpAtrMult: 2,
      maxHoldBars: 48,
      zoneLookback: 40,
    });
    // Truncate at confirmation/entry bar so last bar is the entry
    const candles = buildObLongCandles().slice(0, 29);
    const def = makeDef(seq);
    const bt = runEventSequenceBacktest({
      def,
      symbol: "BTCUSDT",
      candles,
      balance: 10_000,
      feeRate: 0,
      slippageRate: 0,
    });
    const paper = evaluateEventSequencePaperSignal({
      def,
      symbol: "BTCUSDT",
      candles,
    });
    const enteredLast = bt.trades.some((t) => t.entryBar === candles.length - 1);
    if (enteredLast) {
      expect(paper.passed).toBe(true);
      expect(paper.side).toBe("LONG");
      expect(paper.patternType).toBe("order_block");
    } else {
      expect(paper.passed).toBe(false);
      expect(paper.side).toBe("NONE");
    }
  });
});
