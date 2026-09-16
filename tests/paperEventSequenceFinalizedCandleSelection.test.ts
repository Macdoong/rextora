/**
 * Event-Sequence Paper finalized-candle selection + same-bar dedupe.
 * Isolated temp stores only. Does not start production Paper or Live.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import type { OhlcvCandle } from "../src/lib/rextora/data/ohlcvTypes";
import { latestFinalizedCandle } from "../src/lib/rextora/data/candleTime";
import { resolvePaperExecutionSymbols } from "../src/lib/rextora/paper/paperExecutionSymbols";
import { EVENT_SEQUENCE_PAPER_LIFECYCLE_V1 } from "../src/lib/rextora/types";
import { EVENT_SEQUENCE_COST_MODEL_EXECUTION_PRICE_V1 } from "../src/lib/rextora/strategy/eventSequenceCostModel";
import { readEventSequenceLifecycleParams } from "../src/lib/rextora/strategy/eventSequenceBacktest";
import { sha256File } from "./helpers/paperRuntimeContinuityAndWarmupForensics";
import { patternDefinition, source } from "./helpers/paperEventSequenceLifecycleForensics";

const INTERVAL = 15 * 60_000;
const SCAN_MS = 15_000;
const OPEN_0500 = Date.UTC(2026, 8, 8, 5, 0, 0);
const OPEN_0515 = Date.UTC(2026, 8, 8, 5, 15, 0);
const SCAN_0516 = Date.UTC(2026, 8, 8, 5, 16, 0);
const SAFE_SHA =
  "fb3f19169c8911fe041f3f8cb1d9e654f9166078f0c5cd8e29f04ec02a56dfc0";

const { loadOhlcvMock, evaluateEsMock, actualEvaluateEs } = vi.hoisted(() => ({
  loadOhlcvMock: vi.fn(),
  evaluateEsMock: vi.fn(),
  actualEvaluateEs: {
    fn: null as null | ((input: never) => unknown),
  },
}));

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
    generateAiTradeReport: vi.fn(() => ({ id: "mock-es-finalized" })),
  };
});

vi.mock("../src/lib/rextora/data/candleLoader", () => ({
  loadOhlcvCandles: loadOhlcvMock,
}));

vi.mock("../src/lib/rextora/strategy/eventSequenceBacktest", async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import("../src/lib/rextora/strategy/eventSequenceBacktest")
    >();
  actualEvaluateEs.fn = actual.evaluateEventSequencePaperSignal as (
    input: never,
  ) => unknown;
  return {
    ...actual,
    evaluateEventSequencePaperSignal: (...args: unknown[]) =>
      evaluateEsMock(...args),
  };
});

import {
  eventSequencePaperDecisionEvalKey,
  eventSequencePaperDecisionIdentity,
  isSameEventSequencePaperDecisionCandle,
  markEventSequencePaperDecisionEvaluated,
  resetEventSequencePaperDecisionRuntimeForTests,
  selectEventSequencePaperDecisionCandle,
} from "../src/lib/rextora/paper/paperEventSequenceDecisionCandle";
import {
  resetSafePaperCandleRuntimeForTests,
  runSafePaperScanLoop,
} from "../src/lib/rextora/execution/safePaperLoop";
import {
  activatePaperSession,
  preparePaperSession,
} from "../src/lib/rextora/paper/paperSessionStore";
import { createStrategy } from "../src/lib/rextora/strategy/strategyStore";
import {
  isolateA834,
  productionRecordHashes,
} from "./helpers/paperRuntimeContinuityAndWarmupForensics";

const hashesBefore = productionRecordHashes();
const cleanups: Array<() => void> = [];

afterEach(() => {
  while (cleanups.length) cleanups.pop()?.();
  resetSafePaperCandleRuntimeForTests();
  loadOhlcvMock.mockReset();
  evaluateEsMock.mockReset();
  expect(productionRecordHashes()).toEqual(hashesBefore);
});

function isolate() {
  const iso = isolateA834();
  cleanups.push(iso.cleanup);
  return iso;
}

function candle(openTime: number, close = 100): OhlcvCandle {
  return {
    openTime,
    open: close,
    high: close * 1.001,
    low: close * 0.999,
    close,
    volume: 1000,
    closeTime: openTime + INTERVAL - 1,
  };
}

function historyEndingAt(lastOpen: number, count = 80): OhlcvCandle[] {
  const start = lastOpen - (count - 1) * INTERVAL;
  return Array.from({ length: count }, (_, i) =>
    candle(start + i * INTERVAL, 100 + i * 0.01),
  );
}

function productionShapeWindow(): OhlcvCandle[] {
  return [...historyEndingAt(OPEN_0500, 80), candle(OPEN_0515, 110)];
}

function prepareEsSession() {
  const created = createStrategy({
    name: "ES finalized-candle fixture",
    description: "engineCostModel=event_sequence_execution_price_v1",
    strategyType: "condition_builder",
    definition: {
      ...patternDefinition(),
      symbols: ["BTCUSDT"],
      timeframe: "15m",
    },
    sourceParamsHash: "es-finalized",
  });
  const prepared = preparePaperSession({
    strategyId: created.id,
    requireApproval: false,
    virtualBalance: 10_000,
  });
  return { created, session: activatePaperSession(prepared.id) };
}

function armScan(candles: OhlcvCandle[]) {
  loadOhlcvMock.mockResolvedValue({ candles, source: "binance" });
  evaluateEsMock.mockImplementation((input: never) => {
    const fn = actualEvaluateEs.fn;
    if (!fn) throw new Error("evaluateEventSequencePaperSignal not captured");
    return fn(input);
  });
}

describe("Event-Sequence Paper decision candle selection", () => {
  it("1-3 + production fixture: forming 05:15 ignored; 05:00 is authority", () => {
    const candles = productionShapeWindow();
    const last = candles[candles.length - 1]!;
    expect(last.openTime).toBe(OPEN_0515);
    const shared = latestFinalizedCandle(candles, SCAN_0516, INTERVAL);
    const selected = selectEventSequencePaperDecisionCandle({
      candles,
      nowMs: SCAN_0516,
      intervalMs: INTERVAL,
    });
    expect(shared?.candle.openTime).toBe(OPEN_0500);
    expect(selected?.openTime).toBe(OPEN_0500);
    expect(selected?.index).toBe(candles.length - 2);
    expect(selected?.candles.at(-1)?.openTime).toBe(OPEN_0500);
    expect(selected?.candles.some((c) => c.openTime === OPEN_0515)).toBe(false);
    expect(selected?.index).not.toBe(candles.length - 1);
  });

  it("4: no finalized candle produces WAITING_FOR_FINALIZED_CANDLE", async () => {
    const forming = candle(OPEN_0515, 110);
    expect(
      selectEventSequencePaperDecisionCandle({
        candles: [forming],
        nowMs: SCAN_0516,
        intervalMs: INTERVAL,
      }),
    ).toBeNull();

    isolate();
    prepareEsSession();
    const pending = historyEndingAt(OPEN_0515, 80);
    armScan(pending);
    const scan = await runSafePaperScanLoop({
      nowMs: pending[0]!.openTime + 1_000,
    });
    expect(scan.entries).toBe(0);
    expect(scan.signals[0]?.observeCode).toBe("WAITING_FOR_FINALIZED_CANDLE");
    expect(scan.signals[0]?.reason).not.toBe("미완료 봉");
    expect(evaluateEsMock).not.toHaveBeenCalled();
  });

  it("5-7: same finalized candle evaluates once; next candle once; rolling window safe", async () => {
    isolate();
    prepareEsSession();
    const windowN = productionShapeWindow();
    armScan(windowN);
    const first = await runSafePaperScanLoop({ nowMs: SCAN_0516 });
    expect(evaluateEsMock).toHaveBeenCalledTimes(1);
    const firstArg = evaluateEsMock.mock.calls[0]![0] as { candles: OhlcvCandle[] };
    expect(firstArg.candles.at(-1)?.openTime).toBe(OPEN_0500);
    expect(firstArg.candles.at(-1)?.openTime).not.toBe(OPEN_0515);
    expect(first.signals[0]?.reason).not.toBe("미완료 봉");

    evaluateEsMock.mockClear();
    for (let i = 0; i < 20; i += 1) {
      const shifted = windowN.slice(i, windowN.length);
      expect(shifted.at(-2)?.openTime).toBe(OPEN_0500);
      expect(shifted.at(-1)?.openTime).toBe(OPEN_0515);
      armScan(shifted);
      const repeat = await runSafePaperScanLoop({
        nowMs: SCAN_0516 + i * SCAN_MS,
      });
      expect(evaluateEsMock).not.toHaveBeenCalled();
      expect(repeat.signals[0]?.observeCode).toBe("SAME_FINALIZED_CANDLE");
      expect(repeat.entries).toBe(0);
    }

    evaluateEsMock.mockClear();
    const after0515 = [...historyEndingAt(OPEN_0515, 80)];
    armScan(after0515);
    const next = await runSafePaperScanLoop({
      nowMs: OPEN_0515 + INTERVAL + 1,
    });
    expect(evaluateEsMock).toHaveBeenCalledTimes(1);
    const nextArg = evaluateEsMock.mock.calls[0]![0] as { candles: OhlcvCandle[] };
    expect(nextArg.candles.at(-1)?.openTime).toBe(OPEN_0515);
    expect(next.signals[0]?.observeCode).not.toBe("SAME_FINALIZED_CANDLE");
  });

  it("8: BTCUSDT explicit symbol scope remains unchanged", () => {
    const resolved = resolvePaperExecutionSymbols({
      strategy: { symbols: ["BTCUSDT"], definition: { symbols: ["BTCUSDT"] } },
      session: { symbol: null },
      watchedSymbols: ["BTCUSDT", "SUIUSDT", "PEPEUSDT"],
      allowedSymbols: ["BTCUSDT", "SUIUSDT", "PEPEUSDT"],
    });
    expect(resolved.symbols).toEqual(["BTCUSDT"]);
    expect(resolved.source).toBe("strategy");
    expect(resolved.constrained).toBe(true);
  });

  it("9-14: Pattern arithmetic, cost, lifecycle, and SAFE scan path unchanged", () => {
    const life = readEventSequenceLifecycleParams(patternDefinition());
    expect(life.maxHoldBars).toBeTypeOf("number");
    expect(life.stopAtrMult).toBeTypeOf("number");
    expect(life.tpAtrMult).toBeTypeOf("number");
    expect(typeof life.invalidateRule).toBe("string");

    const loop = source("src/lib/rextora/execution/safePaperLoop.ts");
    const helper = source(
      "src/lib/rextora/paper/paperEventSequenceDecisionCandle.ts",
    );
    const lifecycle = source(
      "src/lib/rextora/paper/paperEventSequenceLifecycle.ts",
    );
    const cost = source("src/lib/rextora/strategy/eventSequenceCostModel.ts");
    const walker = source("src/lib/rextora/strategy/eventSequenceBacktest.ts");
    expect(helper).toContain("latestFinalizedCandle(");
    expect(helper).not.toContain("event_sequence_paper_v1");
    expect(lifecycle).toContain('EVENT_SEQUENCE_PAPER_LIFECYCLE_V1');
    expect(loop).toContain("selectEventSequencePaperDecisionCandle");
    expect(loop).toContain("latestFinalizedCandle(candles, nowMs, paperTf.intervalMs)");
    expect(loop).not.toContain("미완료 봉");
    expect(cost).toContain("event_sequence_execution_price_v1");
    expect(walker).toContain("export function readEventSequenceLifecycleParams");
    expect(walker).toContain("export function decideEventSequencePositionExit");
    expect(EVENT_SEQUENCE_PAPER_LIFECYCLE_V1).toBe("event_sequence_paper_v1");
    expect(EVENT_SEQUENCE_COST_MODEL_EXECUTION_PRICE_V1).toBe(
      "event_sequence_execution_price_v1",
    );
  });

  it("15-17: no production Paper start; Live stays off; SAFE file unchanged", async () => {
    isolate();
    const { session } = prepareEsSession();
    expect(session.id.startsWith("paper_")).toBe(true);
    expect(productionRecordHashes()).toEqual(hashesBefore);
    expect(sha256File("data/strategies/SAFE_v44_i4060.json")).toBe(SAFE_SHA);
    const settingsSrc = source("src/lib/rextora/settings/defaultSettings.ts");
    expect(settingsSrc).toContain("liveTradingEnabled: false");
    expect(settingsSrc).toContain("allowLiveTrading: false");
    armScan(productionShapeWindow());
    await runSafePaperScanLoop({ nowMs: SCAN_0516 });
    expect(productionRecordHashes()).toEqual(hashesBefore);
    expect(fs.existsSync(path.join(process.cwd(), "data/rextora/paper-sessions/index.json"))).toBe(true);
  });

  it("dedupe identity is session+strategy+symbol+intervalMs+openTime, not array index", () => {
    resetEventSequencePaperDecisionRuntimeForTests();
    const scope = {
      sessionId: "paper_fixture",
      strategyId: "custom_mts6svuf",
      symbol: "BTCUSDT",
      intervalMs: INTERVAL,
    };
    expect(eventSequencePaperDecisionEvalKey(scope)).toBe(
      `paper_fixture:custom_mts6svuf:BTCUSDT:${INTERVAL}`,
    );
    expect(
      eventSequencePaperDecisionIdentity({ ...scope, openTime: OPEN_0500 }),
    ).toBe(`paper_fixture:custom_mts6svuf:BTCUSDT:${INTERVAL}:${OPEN_0500}`);
    markEventSequencePaperDecisionEvaluated(scope, OPEN_0500);
    expect(isSameEventSequencePaperDecisionCandle(scope, OPEN_0500)).toBe(true);
    expect(isSameEventSequencePaperDecisionCandle(scope, OPEN_0515)).toBe(false);
  });
});
