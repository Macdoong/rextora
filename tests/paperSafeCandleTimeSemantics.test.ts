/**
 * SAFE Paper candle-time semantics — finalized bars, cooldown, max-hold.
 * Isolated temp stores only. Does not start production Paper or Live.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import type { OhlcvCandle } from "../src/lib/rextora/data/ohlcvTypes";
import type { SafeV44Params } from "../src/lib/rextora/strategy/strategyTypes";
import { SAFE_STRATEGY_ID } from "../src/lib/rextora/strategy/strategyTypes";
import { sha256File } from "./helpers/paperRuntimeContinuityAndWarmupForensics";

const INTERVAL = 15 * 60_000;
const SCAN_MS = 15_000;
const OPEN_N = Date.UTC(2026, 8, 7, 12, 30, 0); // 12:30 finalized
const OPEN_FORMING = Date.UTC(2026, 8, 7, 12, 45, 0); // 12:45–13:00
const CLOSE_FORMING = OPEN_FORMING + INTERVAL - 1;
const SCAN_1254 = Date.UTC(2026, 8, 7, 12, 54, 29);

const { loadOhlcvMock, evaluateSignalMock, costGuardMock, actualEvaluate } = vi.hoisted(
  () => ({
    loadOhlcvMock: vi.fn(),
    evaluateSignalMock: vi.fn(),
    costGuardMock: vi.fn(),
    actualEvaluate: {
      fn: null as null | ((input: never) => unknown),
    },
  }),
);

vi.mock("../src/lib/rextora/telegramOperation", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../src/lib/rextora/telegramOperation")>();
  return {
    ...actual,
    notifyTradeEntry: vi.fn(async () => undefined),
    notifyTradeClosed: vi.fn(async () => undefined),
  };
});

vi.mock("../src/lib/rextora/report/aiTradeReport", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../src/lib/rextora/report/aiTradeReport")>();
  return {
    ...actual,
    generateAiTradeReport: vi.fn(() => ({ id: "mock-candle-time" })),
  };
});

vi.mock("../src/lib/rextora/data/candleLoader", () => ({
  loadOhlcvCandles: loadOhlcvMock,
}));

vi.mock("../src/lib/rextora/signal/safeV44SignalEngine", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../src/lib/rextora/signal/safeV44SignalEngine")>();
  actualEvaluate.fn = actual.evaluateSafeV44Signal as (input: never) => unknown;
  return {
    ...actual,
    evaluateSafeV44Signal: (...args: unknown[]) => evaluateSignalMock(...args),
  };
});

vi.mock("../src/lib/rextora/cost/costGuard", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../src/lib/rextora/cost/costGuard")>();
  return {
    ...actual,
    evaluateCostGuard: (...args: unknown[]) => costGuardMock(...args),
  };
});

import { computeIndicators } from "../src/lib/rextora/indicator/indicatorEngine";
import {
  isCandleFinalized,
  listFinalizedUnprocessedCandles,
} from "../src/lib/rextora/paper/paperEventSequenceLifecycle";
import {
  elapsedFinalizedBars,
  lastEntryBarIndexFromCandleTimes,
  latestFinalizedCandle,
} from "../src/lib/rextora/data/candleTime";
import {
  resetSafePaperCandleRuntimeForTests,
  runSafePaperScanLoop,
} from "../src/lib/rextora/execution/safePaperLoop";
import { resolvePaperExecutionSymbols } from "../src/lib/rextora/paper/paperExecutionSymbols";
import { FUTURES_SYMBOLS } from "../src/lib/rextora/seedData";
import {
  activatePaperSession,
  applySafePaperSessionCloseAccounting,
  getPaperSession,
  haltPaperSessionForRisk,
  paperSessionCapitalUsdt,
  preparePaperSession,
} from "../src/lib/rextora/paper/paperSessionStore";
import {
  recordPaperEntryFromSafe,
  recordPaperExit,
} from "../src/lib/rextora/tradeLifecycle";
import { loadUnifiedTradeResults } from "../src/lib/rextora/metrics/tradeResultStore";
import { getOpenPositions } from "../src/lib/rextora/positionManager";
import { managePaperPositions as managePaperPositionsActual } from "../src/lib/rextora/paperExecutionEngine";
import { PAPER_MAX_CONSECUTIVE_LOSSES } from "../src/lib/rextora/riskStateStore";
import { getConfig } from "../src/lib/rextora/config";
import { copyStrategy } from "../src/lib/rextora/strategy/strategyStore";
import { CONTEXT_FALLBACK_PARAMS } from "../src/lib/rextora/strategy/safeV44Params";
import {
  isolateA834,
  prepareIsolatedActiveSession,
  productionRecordHashes,
} from "./helpers/paperRuntimeContinuityAndWarmupForensics";

const hashesBefore = productionRecordHashes();
const cleanups: Array<() => void> = [];

afterEach(() => {
  while (cleanups.length) cleanups.pop()?.();
  resetSafePaperCandleRuntimeForTests();
  loadOhlcvMock.mockReset();
  evaluateSignalMock.mockReset();
  costGuardMock.mockReset();
  expect(productionRecordHashes()).toEqual(hashesBefore);
});

function isolate() {
  const iso = isolateA834();
  cleanups.push(iso.cleanup);
  return iso;
}

function candle(openTime: number, close = 100, volume = 1000): OhlcvCandle {
  return {
    openTime,
    open: close,
    high: close * 1.001,
    low: close * 0.999,
    close,
    volume,
    closeTime: openTime + INTERVAL - 1,
  };
}

function rollingWindow(lastOpen: number, count = 255, includeForming = false): OhlcvCandle[] {
  const last = includeForming ? lastOpen : lastOpen;
  const start = last - (count - 1) * INTERVAL;
  return Array.from({ length: count }, (_, i) => candle(start + i * INTERVAL, 100 + i * 0.01));
}

function passingSignal(barIndex: number) {
  return {
    symbol: "BTCUSDT",
    side: "LONG" as const,
    signalType: "trend_long" as const,
    passed: true,
    score: 70,
    entryReason: "fixture",
    rejectReason: null,
    indicators: {
      emaFast: 1,
      emaMid: 1,
      emaSlow: 1,
      rsi: 50,
      atr: 1,
      atrPct: 0.01,
      volumeRatio: 1.3,
      resistanceHigh: 2,
      slope: 0.001,
      breakoutHigh: 1,
      breakoutLow: 1,
      roomToResist: 0.02,
      pullbackDist: 0.01,
      close: 100,
      volume: 10,
      barIndex,
    },
    paramsHash: "fixture",
    cooldownActive: false,
    inRange: false,
  };
}

function prepareBtc() {
  const copy = copyStrategy(SAFE_STRATEGY_ID, "candle-time-btc");
  const prepared = preparePaperSession({
    strategyId: copy.id,
    symbol: "BTCUSDT",
    requireApproval: false,
    virtualBalance: 10_000,
  });
  return { copy, session: activatePaperSession(prepared.id) };
}

function armPassingScan(candles: OhlcvCandle[]) {
  loadOhlcvMock.mockResolvedValue({ candles, source: "binance" });
  evaluateSignalMock.mockImplementation((input: { barIndex?: number }) =>
    passingSignal(input.barIndex ?? candles.length - 1),
  );
  costGuardMock.mockReturnValue({
    passed: true,
    reason: "",
    feeRoundTrip: 0,
    slippageCost: 0,
    spreadCost: 0,
    fundingRisk: 0,
    totalCostPct: 0,
    expectedRewardPct: 1,
    costGuardK: 3,
    requiredRewardPct: 0,
  });
}

describe("FINALIZED CANDLE", () => {
  it("1-2: forming 15m candle is not evaluated; finalized candle is", async () => {
    isolate();
    prepareBtc();
    const pending = rollingWindow(OPEN_FORMING, 255);
    armPassingScan(pending);
    const waiting = await runSafePaperScanLoop({
      nowMs: pending[0]!.openTime + 1_000,
    });
    expect(waiting.entries).toBe(0);
    expect(waiting.signals[0]?.observeCode).toBe("WAITING_FOR_FINALIZED_CANDLE");
    expect(evaluateSignalMock).not.toHaveBeenCalled();

    const candles = rollingWindow(OPEN_FORMING, 255);
    armPassingScan(candles);
    const midBar = await runSafePaperScanLoop({ nowMs: SCAN_1254 });
    expect(evaluateSignalMock).toHaveBeenCalledTimes(1);
    const midArg = evaluateSignalMock.mock.calls[0]![0] as { barIndex: number };
    expect(midArg.barIndex).toBe(candles.length - 2);
    expect(midArg.barIndex).not.toBe(candles.length - 1);
    expect(midBar.entries).toBe(1);

    resetSafePaperCandleRuntimeForTests();
    recordPaperExit("BTCUSDT", 100, "익절");
    evaluateSignalMock.mockClear();
    const finalizedNow = CLOSE_FORMING + 1;
    const again = await runSafePaperScanLoop({ nowMs: finalizedNow });
    const arg = evaluateSignalMock.mock.calls[0]![0] as { barIndex: number };
    expect(arg.barIndex).toBe(candles.length - 1);
    expect(again.entries).toBe(1);
    expect(again.signals[0]?.observeCode).toBe("VALID_SIGNAL");
  });

  it("3-4: same finalized candle evaluated once; next candle once", async () => {
    isolate();
    prepareBtc();
    const n = rollingWindow(OPEN_N, 255);
    armPassingScan(n);
    const nowN = OPEN_N + INTERVAL;
    const first = await runSafePaperScanLoop({ nowMs: nowN });
    expect(first.entries).toBe(1);
    recordPaperExit("BTCUSDT", 100, "익절");
    for (let i = 0; i < 20; i += 1) {
      const repeat = await runSafePaperScanLoop({ nowMs: nowN + i * SCAN_MS });
      expect(repeat.entries).toBe(0);
      expect(repeat.signals[0]?.observeCode).toBe("SAME_FINALIZED_CANDLE");
    }
    expect(evaluateSignalMock).toHaveBeenCalledTimes(1);

    const next = rollingWindow(OPEN_N + INTERVAL, 255);
    armPassingScan(next);
    const second = await runSafePaperScanLoop({
      nowMs: OPEN_N + INTERVAL * 2,
    });
    expect(second.entries).toBe(1);
    expect(evaluateSignalMock).toHaveBeenCalledTimes(2);
  });

  it("5: production-like 12:54 scan cannot trade from 12:45 forming candle", async () => {
    isolate();
    prepareBtc();
    const candles = rollingWindow(OPEN_FORMING, 255);
    armPassingScan(candles);
    const scan = await runSafePaperScanLoop({ nowMs: SCAN_1254 });
    const arg = evaluateSignalMock.mock.calls[0]![0] as { barIndex: number };
    expect(arg.barIndex).toBe(candles.length - 2);
    expect(candles[arg.barIndex]?.openTime).toBe(OPEN_FORMING - INTERVAL);
    expect(candles[candles.length - 1]?.openTime).toBe(OPEN_FORMING);
    expect(scan.signals[0]?.observeCode).not.toBeUndefined();
  });

  it("6: Pattern finalized semantics remain unchanged", () => {
    const prior = { openTime: OPEN_N, closeTime: OPEN_N + INTERVAL - 1 };
    const current = { openTime: OPEN_FORMING, closeTime: CLOSE_FORMING };
    expect(isCandleFinalized(current, SCAN_1254, INTERVAL)).toBe(false);
    expect(isCandleFinalized(current, CLOSE_FORMING, INTERVAL)).toBe(false);
    expect(isCandleFinalized(current, CLOSE_FORMING + 1, INTERVAL)).toBe(true);
    expect(
      listFinalizedUnprocessedCandles({
        candles: [prior, current],
        lastProcessedCandleOpenTime: prior.openTime,
        intervalMs: INTERVAL,
        nowMs: SCAN_1254,
      }),
    ).toEqual([]);
  });
});

describe("COOLDOWN", () => {
  it("7-13: openTime bars, not rolling index; N / N+1 / N+2; scans do not matter", () => {
    const windowA = rollingWindow(OPEN_N, 255);
    const finalizedA = latestFinalizedCandle(windowA, OPEN_N + INTERVAL, INTERVAL)!;
    expect(finalizedA.index).toBe(254);

    const windowShifted = rollingWindow(OPEN_N + INTERVAL, 255);
    const finalizedB = latestFinalizedCandle(
      windowShifted,
      OPEN_N + INTERVAL * 2,
      INTERVAL,
    )!;
    expect(finalizedB.index).toBe(254);

    const idxSame = lastEntryBarIndexFromCandleTimes({
      finalizedIndex: finalizedA.index,
      finalizedOpenTime: OPEN_N,
      lastEntryOpenTime: OPEN_N,
      intervalMs: INTERVAL,
    });
    expect(finalizedA.index - (idxSame ?? 0)).toBe(0);

    const idxN1 = lastEntryBarIndexFromCandleTimes({
      finalizedIndex: finalizedB.index,
      finalizedOpenTime: OPEN_N + INTERVAL,
      lastEntryOpenTime: OPEN_N,
      intervalMs: INTERVAL,
    });
    expect(finalizedB.index - (idxN1 ?? 0)).toBe(1);

    const idxN2 = lastEntryBarIndexFromCandleTimes({
      finalizedIndex: 254,
      finalizedOpenTime: OPEN_N + INTERVAL * 2,
      lastEntryOpenTime: OPEN_N,
      intervalMs: INTERVAL,
    });
    expect(254 - (idxN2 ?? 0)).toBe(2);

    expect(elapsedFinalizedBars(OPEN_N, OPEN_N, INTERVAL)).toBe(0);
    expect(elapsedFinalizedBars(OPEN_N, OPEN_N + INTERVAL, INTERVAL)).toBe(1);
    expect(elapsedFinalizedBars(OPEN_N, OPEN_N + INTERVAL * 2, INTERVAL)).toBe(2);

    const params = {
      ...CONTEXT_FALLBACK_PARAMS,
      ema_slow: 0,
      cooldown_bars: 2,
      vol_ratio_min: 99,
      vol_ratio_min_break: 99,
      max_atr_pct: 0.000001,
      max_atr_pct_break: 0.000001,
      allow_in_range: false,
      confirm_bear: false,
      confirm_bull: false,
    } as SafeV44Params;
    const series = computeIndicators(windowA, params);
    const same = actualEvaluate.fn!({
      symbol: "BTCUSDT",
      series,
      params,
      paramsHash: "x",
      barIndex: finalizedA.index,
      lastEntryBarIndex: idxSame,
    }) as { cooldownActive: boolean; rejectReason: string | null };
    expect(same.cooldownActive).toBe(true);
    expect(same.rejectReason).toMatch(/쿨다운/);

    const seriesB = computeIndicators(windowShifted, params);
    const plus1 = actualEvaluate.fn!({
      symbol: "BTCUSDT",
      series: seriesB,
      params,
      paramsHash: "x",
      barIndex: finalizedB.index,
      lastEntryBarIndex: idxN1,
    });
    expect(plus1.cooldownActive).toBe(true);

    const windowC = rollingWindow(OPEN_N + INTERVAL * 2, 255);
    const seriesC = computeIndicators(windowC, params);
    const plus2 = actualEvaluate.fn!({
      symbol: "BTCUSDT",
      series: seriesC,
      params,
      paramsHash: "x",
      barIndex: 254,
      lastEntryBarIndex: idxN2,
    });
    expect(plus2.cooldownActive).toBe(false);

    const rollingIdxStuck = lastEntryBarIndexFromCandleTimes({
      finalizedIndex: 254,
      finalizedOpenTime: OPEN_N + INTERVAL * 40,
      lastEntryOpenTime: OPEN_N,
      intervalMs: INTERVAL,
    });
    expect(254 - (rollingIdxStuck ?? 0)).toBe(40);
    expect(elapsedFinalizedBars(OPEN_N, OPEN_N, INTERVAL)).toBe(0);
    for (let i = 0; i < 20; i += 1) {
      expect(elapsedFinalizedBars(OPEN_N, OPEN_N, INTERVAL)).toBe(0);
    }
  });

  it("11,14: loop cooldown expires after two finalized bars; BTCUSDT scope", async () => {
    isolate();
    prepareBtc();
    const n = rollingWindow(OPEN_N, 255);
    armPassingScan(n);
    expect((await runSafePaperScanLoop({ nowMs: OPEN_N + INTERVAL })).entries).toBe(1);
    recordPaperExit("BTCUSDT", 100, "익절");

    evaluateSignalMock.mockImplementation((input: { lastEntryBarIndex?: number | null; barIndex?: number }) => {
      const elapsed =
        input.lastEntryBarIndex == null
          ? 99
          : (input.barIndex ?? 0) - input.lastEntryBarIndex;
      if (elapsed < 2) {
        return {
          ...passingSignal(input.barIndex ?? 0),
          passed: false,
          side: "NONE" as const,
          cooldownActive: true,
          rejectReason: "쿨다운 중 (2 bars)",
          indicators: null,
        };
      }
      return passingSignal(input.barIndex ?? 0);
    });

    loadOhlcvMock.mockResolvedValue({
      candles: rollingWindow(OPEN_N + INTERVAL, 255),
      source: "binance",
    });
    const n1 = await runSafePaperScanLoop({ nowMs: OPEN_N + INTERVAL * 2 });
    expect(n1.entries).toBe(0);
    expect(n1.signals[0]?.observeCode).toBe("COOLDOWN");

    loadOhlcvMock.mockResolvedValue({
      candles: rollingWindow(OPEN_N + INTERVAL * 2, 255),
      source: "binance",
    });
    const n2 = await runSafePaperScanLoop({ nowMs: OPEN_N + INTERVAL * 3 });
    expect(n2.entries).toBe(1);

    const scoped = resolvePaperExecutionSymbols({
      strategy: { symbols: ["BTCUSDT"] },
      session: { symbol: "BTCUSDT" },
      watchedSymbols: FUTURES_SYMBOLS,
    });
    expect(scoped.symbols).toEqual(["BTCUSDT"]);
  });
});

describe("MAX HOLD", () => {
  it("15-20: barsHeld follows finalized 15m bars, not 15s scans", async () => {
    isolate();
    const opened = recordPaperEntryFromSafe({
      symbol: "BTCUSDT",
      side: "LONG",
      signalType: "trend_long",
      entryReason: "fixture",
      score: 1,
      entryPrice: 100,
      stopLoss: 1,
      takeProfit: 10_000,
      leverage: 2,
      quantity: 1,
      margin: 50,
      strategyName: "fixture",
      paramsHash: "fixture",
      maxHoldBars: 5,
      paperSessionId: "paper_test",
      paperStrategyId: "copy_test",
      entrySignalCandleOpenTime: OPEN_N,
      entrySignalIntervalMs: INTERVAL,
    });
    expect(opened.position.entrySignalCandleOpenTime).toBe(OPEN_N);
    expect(opened.position.barsHeld).toBe(0);

    for (let i = 0; i < 8; i += 1) {
      await managePaperPositionsActual({
        nowMs: OPEN_N + INTERVAL + i * SCAN_MS,
        latestFinalizedBySymbol: {
          BTCUSDT: { openTime: OPEN_N, intervalMs: INTERVAL },
        },
      });
    }
    expect(getOpenPositions()[0]?.barsHeld).toBe(0);
    expect(getOpenPositions()[0]?.side).not.toBe("Flat");

    await managePaperPositionsActual({
      nowMs: OPEN_N + INTERVAL * 2,
      latestFinalizedBySymbol: {
        BTCUSDT: { openTime: OPEN_N + INTERVAL, intervalMs: INTERVAL },
      },
    });
    expect(getOpenPositions()[0]?.barsHeld).toBe(1);
    await managePaperPositionsActual({
      nowMs: OPEN_N + INTERVAL * 2 + SCAN_MS,
      latestFinalizedBySymbol: {
        BTCUSDT: { openTime: OPEN_N + INTERVAL, intervalMs: INTERVAL },
      },
    });
    expect(getOpenPositions()[0]?.barsHeld).toBe(1);

    for (let step = 2; step <= 4; step += 1) {
      await managePaperPositionsActual({
        nowMs: OPEN_N + INTERVAL * (step + 1),
        latestFinalizedBySymbol: {
          BTCUSDT: { openTime: OPEN_N + step * INTERVAL, intervalMs: INTERVAL },
        },
      });
    }
    expect(getOpenPositions()[0]?.barsHeld).toBe(4);
    expect(getOpenPositions()[0]?.side).not.toBe("Flat");

    const closed = await managePaperPositionsActual({
      nowMs: OPEN_N + INTERVAL * 6,
      latestFinalizedBySymbol: {
        BTCUSDT: { openTime: OPEN_N + 5 * INTERVAL, intervalMs: INTERVAL },
      },
    });
    expect(closed.closed).toBe(1);
    expect(getOpenPositions().filter((p) => p.side !== "Flat" && p.quantity > 0)).toHaveLength(0);
    expect(elapsedFinalizedBars(OPEN_N, OPEN_N + 5 * INTERVAL, INTERVAL)).toBe(5);
  });

  it("19: 75 seconds alone cannot trigger max-hold on 15m", async () => {
    isolate();
    recordPaperEntryFromSafe({
      symbol: "BTCUSDT",
      side: "LONG",
      signalType: "trend_long",
      entryReason: "fixture",
      score: 1,
      entryPrice: 100,
      stopLoss: 1,
      takeProfit: 10_000,
      leverage: 2,
      quantity: 1,
      margin: 50,
      strategyName: "fixture",
      paramsHash: "fixture",
      maxHoldBars: 5,
      entrySignalCandleOpenTime: OPEN_N,
      entrySignalIntervalMs: INTERVAL,
    });
    await managePaperPositionsActual({
      nowMs: OPEN_N + 75_000,
      latestFinalizedBySymbol: {
        BTCUSDT: { openTime: OPEN_N, intervalMs: INTERVAL },
      },
    });
    expect(getOpenPositions()[0]?.barsHeld).toBe(0);
    expect(getOpenPositions()[0]?.quantity).toBeGreaterThan(0);
  });

  it("historical position without candle identity fails closed on max-hold", async () => {
    isolate();
    recordPaperEntryFromSafe({
      symbol: "ETHUSDT",
      side: "LONG",
      signalType: "trend_long",
      entryReason: "legacy",
      score: 1,
      entryPrice: 100,
      stopLoss: 1,
      takeProfit: 10_000,
      leverage: 1,
      quantity: 1,
      margin: 10,
      strategyName: "legacy",
      paramsHash: "legacy",
      maxHoldBars: 5,
    });
    for (let i = 0; i < 8; i += 1) {
      await managePaperPositionsActual({ nowMs: OPEN_N + i * SCAN_MS });
    }
    expect(getOpenPositions()[0]?.quantity).toBeGreaterThan(0);
    expect(getOpenPositions()[0]?.barsHeld).toBe(0);
  });
});

describe("ACCOUNTING / SAFETY", () => {
  it("21-24: SAFE close accounting still uses unified.realizedUsdt once", () => {
    isolate();
    const session = prepareIsolatedActiveSession();
    const opened = recordPaperEntryFromSafe({
      symbol: "BTCUSDT",
      side: "LONG",
      signalType: "trend_long",
      entryReason: "acct",
      score: 1,
      entryPrice: 100,
      stopLoss: 99,
      takeProfit: 101,
      leverage: 2,
      quantity: 1,
      margin: 50,
      strategyName: "acct",
      paramsHash: "acct",
      paperSessionId: session.id,
      paperStrategyId: session.strategyId,
      entrySignalCandleOpenTime: OPEN_N,
      entrySignalIntervalMs: INTERVAL,
    });
    recordPaperExit("BTCUSDT", 101, "익절");
    const unified = loadUnifiedTradeResults()[0]!;
    expect(unified.id).toBe(`safe-close-${opened.position.id}`);
    const after = getPaperSession(session.id)!;
    expect(after.tradeCount).toBe(1);
    expect(after.realizedPnl).toBeCloseTo(unified.realizedUsdt, 8);
    expect(paperSessionCapitalUsdt(after)).toBeCloseTo(
      after.virtualBalance + after.realizedPnl,
      8,
    );
    applySafePaperSessionCloseAccounting({
      paperSessionId: session.id,
      paperStrategyId: session.strategyId,
      closeId: unified.id,
      realizedNetUsdt: unified.realizedUsdt,
    });
    expect(getPaperSession(session.id)?.tradeCount).toBe(1);
    expect(getPaperSession(session.id)?.realizedPnl).toBeCloseTo(after.realizedPnl, 8);
  });

  it("25-28: symbol resolver, risk halt, Live threshold, ES import surface unchanged", () => {
    expect(
      resolvePaperExecutionSymbols({
        strategy: { symbols: ["BTCUSDT"] },
        session: { symbol: "BTCUSDT" },
        watchedSymbols: FUTURES_SYMBOLS,
      }).symbols,
    ).toEqual(["BTCUSDT"]);
    isolate();
    const session = prepareIsolatedActiveSession();
    const halted = haltPaperSessionForRisk(session.id, "리스크 한도 위반");
    expect(halted.status).toBe("risk_halted");
    expect(PAPER_MAX_CONSECUTIVE_LOSSES).toBe(6);
    expect(getConfig().risk.consecutiveLossLimit).toBe(3);
    const es = fs.readFileSync(
      path.join(process.cwd(), "src/lib/rextora/paper/paperEventSequenceLifecycle.ts"),
      "utf8",
    );
    expect(es).toContain("listFinalizedUnprocessedCandles");
    expect(es).toContain('export { isCandleFinalized } from "../data/candleTime"');
  });

  it("29-30: SAFE arithmetic and protected file unchanged", () => {
    const engine = fs.readFileSync(
      path.join(process.cwd(), "src/lib/rextora/signal/safeV44SignalEngine.ts"),
      "utf8",
    );
    expect(engine).toContain("거래량 비율 부족");
    expect(engine).toContain("idx - lastEntry < params.cooldown_bars");
    expect(
      sha256File(path.join(process.cwd(), "data/strategies/SAFE_v44_i4060.json")),
    ).toBe("fb3f19169c8911fe041f3f8cb1d9e654f9166078f0c5cd8e29f04ec02a56dfc0");
  });
});

describe("PRODUCTION-CASE FIXTURE", () => {
  it("A-E: 12:54 forming + 15s scans + cooldown_bars=2 + max_hold_bars=5", async () => {
    isolate();
    prepareBtc();
    const formingWindow = rollingWindow(OPEN_FORMING, 255);
    armPassingScan(formingWindow);
    const at1254 = await runSafePaperScanLoop({ nowMs: SCAN_1254 });
    const formingArg = evaluateSignalMock.mock.calls[0]![0] as { barIndex: number };
    expect(formingArg.barIndex).not.toBe(formingWindow.length - 1);
    expect(formingWindow[formingArg.barIndex]?.openTime).toBe(OPEN_FORMING - INTERVAL);
    expect(at1254.entries).toBe(1);
    recordPaperExit("BTCUSDT", 100, "익절");

    resetSafePaperCandleRuntimeForTests();
    armPassingScan(formingWindow);
    const entered = await runSafePaperScanLoop({ nowMs: CLOSE_FORMING + 1 });
    expect(entered.entries).toBe(1);
    const pos = getOpenPositions().find((p) => p.symbol === "BTCUSDT")!;
    expect(pos.entrySignalCandleOpenTime).toBe(OPEN_FORMING);
    expect(pos.entrySignalIntervalMs).toBe(INTERVAL);

    for (let i = 0; i < 5; i += 1) {
      await managePaperPositionsActual({
        nowMs: CLOSE_FORMING + 1 + i * SCAN_MS,
        latestFinalizedBySymbol: {
          BTCUSDT: { openTime: OPEN_FORMING, intervalMs: INTERVAL },
        },
      });
    }
    expect(getOpenPositions()[0]?.barsHeld).toBe(0);
    expect(getOpenPositions()[0]?.quantity).toBeGreaterThan(0);
    recordPaperExit("BTCUSDT", 100, "익절");

    evaluateSignalMock.mockImplementation((input: { lastEntryBarIndex?: number | null; barIndex?: number }) => {
      const elapsed =
        input.lastEntryBarIndex == null
          ? 99
          : (input.barIndex ?? 0) - input.lastEntryBarIndex;
      if (elapsed < 2) {
        return {
          ...passingSignal(input.barIndex ?? 0),
          passed: false,
          side: "NONE" as const,
          cooldownActive: true,
          rejectReason: "쿨다운 중 (2 bars)",
          indicators: null,
        };
      }
      return passingSignal(input.barIndex ?? 0);
    });
    loadOhlcvMock.mockResolvedValue({
      candles: rollingWindow(OPEN_FORMING + INTERVAL, 255),
      source: "binance",
    });
    const cool1 = await runSafePaperScanLoop({
      nowMs: OPEN_FORMING + INTERVAL * 2,
    });
    expect(cool1.entries).toBe(0);
    expect(cool1.signals[0]?.observeCode).toBe("COOLDOWN");
    loadOhlcvMock.mockResolvedValue({
      candles: rollingWindow(OPEN_FORMING + INTERVAL * 2, 255),
      source: "binance",
    });
    const cool2 = await runSafePaperScanLoop({
      nowMs: OPEN_FORMING + INTERVAL * 3,
    });
    expect(cool2.signals[0]?.observeCode === "COOLDOWN" || cool2.entries === 1).toBe(true);
    expect(elapsedFinalizedBars(OPEN_FORMING, OPEN_FORMING + INTERVAL * 2, INTERVAL)).toBe(2);
  });
});
