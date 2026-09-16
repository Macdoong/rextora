import { describe, expect, it } from "vitest";
import {
  isCandleFinalized,
  listFinalizedUnprocessedCandles,
} from "../src/lib/rextora/paper/paperEventSequenceLifecycle";
import { candlesFromBinanceKlines } from "../src/lib/rextora/data/ohlcvTypes";

const INTERVAL = 15 * 60_000;
const OPEN = Date.UTC(2026, 0, 1, 0, 0, 0);
const CLOSE = OPEN + INTERVAL - 1;

describe("Pattern Paper finalized-candle production semantics", () => {
  it("authority is exchange closeTime vs nowMs, exclusive at equality", () => {
    const candle = { openTime: OPEN, closeTime: CLOSE };
    expect(isCandleFinalized(candle, CLOSE - 1, INTERVAL)).toBe(false);
    expect(isCandleFinalized(candle, CLOSE, INTERVAL)).toBe(false);
    expect(isCandleFinalized(candle, CLOSE + 1, INTERVAL)).toBe(true);
  });

  it("missing closeTime falls back to openTime + intervalMs - 1", () => {
    const candle = { openTime: OPEN };
    expect(isCandleFinalized(candle, CLOSE, INTERVAL)).toBe(false);
    expect(isCandleFinalized(candle, CLOSE + 1, INTERVAL)).toBe(true);
  });

  it("Binance kline row[6] is closeTime", () => {
    const mapped = candlesFromBinanceKlines([
      [OPEN, "1", "2", "0.5", "1.5", "10", CLOSE],
    ])[0]!;
    expect(mapped.openTime).toBe(OPEN);
    expect(mapped.closeTime).toBe(CLOSE);
  });

  it("source-proven: Paper uses nowMs > closeTime, Research/Backtest walker unchanged", () => {
    const life = require("node:fs").readFileSync(
      require("node:path").join(
        process.cwd(),
        "src/lib/rextora/paper/paperEventSequenceLifecycle.ts",
      ),
      "utf8",
    ) as string;
    const candleTime = require("node:fs").readFileSync(
      require("node:path").join(
        process.cwd(),
        "src/lib/rextora/data/candleTime.ts",
      ),
      "utf8",
    ) as string;
    const loop = require("node:fs").readFileSync(
      require("node:path").join(
        process.cwd(),
        "src/lib/rextora/execution/safePaperLoop.ts",
      ),
      "utf8",
    ) as string;
    const decision = require("node:fs").readFileSync(
      require("node:path").join(
        process.cwd(),
        "src/lib/rextora/paper/paperEventSequenceDecisionCandle.ts",
      ),
      "utf8",
    ) as string;
    const walker = require("node:fs").readFileSync(
      require("node:path").join(
        process.cwd(),
        "src/lib/rextora/strategy/eventSequenceBacktest.ts",
      ),
      "utf8",
    ) as string;
    expect(candleTime).toContain("return nowMs > candleCloseTime(candle, intervalMs)");
    expect(life).toContain('export { isCandleFinalized } from "../data/candleTime"');
    expect(decision).toContain("latestFinalizedCandle(");
    expect(loop).toContain("selectEventSequencePaperDecisionCandle");
    expect(walker).not.toContain("isCandleFinalized");
  });

  it("repeated unfinished scans and stale bars do not advance", () => {
    const prior = { openTime: OPEN - INTERVAL, closeTime: OPEN - 1 };
    const current = { openTime: OPEN, closeTime: CLOSE };
    const candles = [prior, current];
    const unfinishedNow = CLOSE;
    const first = listFinalizedUnprocessedCandles({
      candles,
      lastProcessedCandleOpenTime: prior.openTime,
      intervalMs: INTERVAL,
      nowMs: unfinishedNow,
    });
    const second = listFinalizedUnprocessedCandles({
      candles,
      lastProcessedCandleOpenTime: prior.openTime,
      intervalMs: INTERVAL,
      nowMs: unfinishedNow,
    });
    expect(first).toEqual([]);
    expect(second).toEqual([]);

    const afterClose = listFinalizedUnprocessedCandles({
      candles,
      lastProcessedCandleOpenTime: prior.openTime,
      intervalMs: INTERVAL,
      nowMs: CLOSE + 1,
    });
    expect(afterClose).toHaveLength(1);
    expect(afterClose[0]?.openTime).toBe(OPEN);

    const staleRepeat = listFinalizedUnprocessedCandles({
      candles,
      lastProcessedCandleOpenTime: OPEN,
      intervalMs: INTERVAL,
      nowMs: CLOSE + 60_000,
    });
    expect(staleRepeat).toEqual([]);
  });

  it("restart while current candle is unfinished does not advance", () => {
    const current = { openTime: OPEN, closeTime: CLOSE };
    const afterRestart = listFinalizedUnprocessedCandles({
      candles: [current],
      lastProcessedCandleOpenTime: OPEN - INTERVAL,
      intervalMs: INTERVAL,
      nowMs: CLOSE,
    });
    expect(afterRestart).toEqual([]);
  });
});
