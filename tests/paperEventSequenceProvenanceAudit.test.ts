/**
 * Event-Sequence Paper ownership + finalized-candle OHLC audit.
 * Isolated temp stores only. Does not start production Paper/Live.
 */

vi.mock("../src/lib/rextora/telegramOperation", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/lib/rextora/telegramOperation")>();
  return {
    ...actual,
    notifyTradeEntry: vi.fn(async () => undefined),
    notifyTradeClosed: vi.fn(async () => undefined),
  };
});

vi.mock("../src/lib/rextora/report/aiTradeReport", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/lib/rextora/report/aiTradeReport")>();
  return {
    ...actual,
    generateAiTradeReport: vi.fn(() => ({ id: "mock-provenance-audit" })),
  };
});

import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { resetAccountStateForTests } from "../src/lib/rextora/accountStateStore";
import { productionReadonlyHashes } from "../src/lib/rextora/backtest/backtestCostAssumptionsDiagnosis";
import type { OhlcvCandle } from "../src/lib/rextora/data/ohlcvTypes";
import {
  isEventSequencePaperOwned,
  manageEventSequencePaperPositions,
  openEventSequencePaperPosition,
} from "../src/lib/rextora/paper/paperEventSequenceLifecycle";
import {
  activatePaperSession,
  getExecutablePaperSession,
  preparePaperSession,
} from "../src/lib/rextora/paper/paperSessionStore";
import { getOpenPositions } from "../src/lib/rextora/positionManager";
import { invalidateJsonStoreCache } from "../src/lib/rextora/storage/jsonStore";
import { loadPaperPositions, savePaperOrders, savePaperPositions } from "../src/lib/rextora/storage/tradeStore";
import { resetUnifiedTradeResultsForTests, loadUnifiedTradeResults } from "../src/lib/rextora/metrics/tradeResultStore";
import { decideEventSequencePositionExit } from "../src/lib/rextora/strategy/eventSequenceBacktest";
import {
  EVENT_SEQUENCE_COST_MODEL_EXECUTION_PRICE_V1,
  settleEventSequenceClose,
} from "../src/lib/rextora/strategy/eventSequenceCostModel";
import {
  createStrategy,
  ensureStrategyStore,
} from "../src/lib/rextora/strategy/strategyStore";
import { EVENT_SEQUENCE_PAPER_LIFECYCLE_V1, type Position } from "../src/lib/rextora/types";
import {
  FEE,
  FUNDING,
  patternDefinition,
  SLIP,
  source,
  SPREAD,
} from "./helpers/paperEventSequenceLifecycleForensics";
import { installIsolatedStrategyStore } from "./helpers/isolatedStrategyStore";

const SAFE_SHA =
  "fb3f19169c8911fe041f3f8cb1d9e654f9166078f0c5cd8e29f04ec02a56dfc0";
const INTERVAL = 15 * 60 * 1000;
const START = Date.UTC(2026, 0, 1);
const hashesBefore = productionReadonlyHashes();
const cleanups: Array<() => void> = [];
const tempDirs: string[] = [];

afterEach(() => {
  while (cleanups.length) cleanups.pop()?.();
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
  delete process.env.REXTORA_PAPER_SESSIONS_DIR;
  delete process.env.REXTORA_DATA_DIR;
  invalidateJsonStoreCache();
});

function sha256(filePath: string): string {
  return createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

function isolate(): { paper: string; data: string } {
  const iso = installIsolatedStrategyStore();
  cleanups.push(iso.cleanup);
  ensureStrategyStore();
  const paper = fs.mkdtempSync(path.join(os.tmpdir(), "rextora-es-audit-paper-"));
  const data = fs.mkdtempSync(path.join(os.tmpdir(), "rextora-es-audit-data-"));
  tempDirs.push(paper, data);
  process.env.REXTORA_PAPER_SESSIONS_DIR = paper;
  process.env.REXTORA_DATA_DIR = data;
  invalidateJsonStoreCache();
  savePaperPositions([]);
  savePaperOrders([]);
  resetUnifiedTradeResultsForTests([]);
  resetAccountStateForTests({ balanceUsdt: 10_000, availableBalanceUsdt: 10_000 });
  return { paper, data };
}

function bar(i: number, o: number, h: number, l: number, c: number): OhlcvCandle {
  return {
    openTime: START + i * INTERVAL,
    open: o,
    high: h,
    low: l,
    close: c,
    volume: 1000,
    closeTime: START + (i + 1) * INTERVAL - 1,
  };
}

function warmupThrough(entryIndex: number): OhlcvCandle[] {
  const out: OhlcvCandle[] = [];
  for (let i = 0; i <= entryIndex; i += 1) {
    const px = 78200 + (i % 3) * 10;
    out.push(bar(i, px, px + 40, px - 40, px + 5));
  }
  return out;
}

const ASSUMPTIONS = {
  feeRate: FEE,
  slippageRate: SLIP,
  fundingRate: FUNDING,
  applyFunding: false,
  applySpread: true,
  spreadRate: SPREAD,
};

const GEO = {
  patternType: "order_block",
  zoneHigh: 78900,
  zoneLow: 78000,
  creationBar: 20,
};

function openOwned(input: {
  paperSessionId: string;
  paperStrategyId: string;
  strategyId?: string;
  stop?: number;
  tp?: number;
  entryIndex?: number;
}): Position {
  const entryIndex = input.entryIndex ?? 24;
  const entry = warmupThrough(entryIndex)[entryIndex]!;
  return openEventSequencePaperPosition({
    symbol: "BTCUSDT",
    strategyId: input.strategyId ?? input.paperStrategyId,
    paperSessionId: input.paperSessionId,
    paperStrategyId: input.paperStrategyId,
    strategyName: "PROVENANCE_AUDIT",
    paramsHash: "audit_es",
    def: patternDefinition({ maxHoldBars: 60 }),
    side: "SHORT",
    rawEntryPrice: 78289.4,
    executionEntryPrice: 78273.74212,
    stopPrice: input.stop ?? 80_000,
    targetPrice: input.tp ?? 77_000,
    entryCandleOpenTime: entry.openTime,
    maxHoldBars: 60,
    invalidateRule: "none",
    geo: GEO,
    costModel: EVENT_SEQUENCE_COST_MODEL_EXECUTION_PRICE_V1,
    costAssumptions: ASSUMPTIONS,
    timeframe: "15m",
    leverage: 1,
  });
}

function nowAfter(candle: OhlcvCandle): number {
  return (candle.closeTime ?? candle.openTime + INTERVAL) + 1;
}

describe("Event-Sequence Paper provenance and OHLC audit", () => {
  it("1-3. new ES position persists caller ownership and does not guess the active session", () => {
    isolate();
    const created = createStrategy({
      name: "active decoy",
      description: "engineCostModel=event_sequence_execution_price_v1",
      strategyType: "condition_builder",
      definition: patternDefinition(),
      sourceParamsHash: "decoy",
    });
    const decoy = activatePaperSession(
      preparePaperSession({ strategyId: created.id, requireApproval: false }).id,
    );
    const active = getExecutablePaperSession();
    expect(active?.id).toBe(decoy.id);

    const position = openOwned({
      paperSessionId: "paper_explicit_owner",
      paperStrategyId: "custom_explicit_strategy",
    });
    expect(position.paperSessionId).toBe("paper_explicit_owner");
    expect(position.paperStrategyId).toBe("custom_explicit_strategy");
    expect(position.paperSessionId).not.toBe(decoy.id);
    expect(position.paperStrategyId).not.toBe(created.id);

    const reloaded = loadPaperPositions().find((p) => p.id === position.id);
    expect(reloaded?.paperSessionId).toBe("paper_explicit_owner");
    expect(reloaded?.paperStrategyId).toBe("custom_explicit_strategy");

    const openSrc = source("src/lib/rextora/paper/paperEventSequenceLifecycle.ts");
    const openFn = openSrc.slice(
      openSrc.indexOf("export function openEventSequencePaperPosition"),
      openSrc.indexOf("function findBarIndex"),
    );
    expect(openFn).toContain("paperSessionId: input.paperSessionId");
    expect(openFn).toContain("paperStrategyId: input.paperStrategyId");
    expect(openFn).not.toMatch(/getExecutablePaperSession|getActivePaperSession|getCurrentPaperSession/);
  });

  it("4. legacy ES position without ownership fields remains readable", async () => {
    isolate();
    const owned = openOwned({
      paperSessionId: "paper_legacy_seed",
      paperStrategyId: "custom_legacy_seed",
    });
    const { paperSessionId: _sid, paperStrategyId: _tid, ...rest } = owned;
    const legacy: Position = {
      ...rest,
      id: "paper-es-BTCUSDT-legacy-no-owner",
    };
    expect(legacy.paperSessionId).toBeUndefined();
    expect(legacy.paperStrategyId).toBeUndefined();
    savePaperPositions([legacy]);
    const loaded = loadPaperPositions().find((p) => p.id === legacy.id);
    expect(loaded).toBeTruthy();
    expect(isEventSequencePaperOwned(loaded)).toBe(true);
    expect(loaded?.paperLifecycleModel).toBe(EVENT_SEQUENCE_PAPER_LIFECYCLE_V1);

    const entryIndex = 24;
    const candles = warmupThrough(entryIndex);
    const n = bar(entryIndex + 1, 78_000, 78_100, 77_900, 78_050);
    const managed = await manageEventSequencePaperPositions({
      candlesBySymbol: { BTCUSDT: [...candles, n] },
      nowMs: nowAfter(n),
    });
    expect(managed.checked).toBe(1);
    const after = loadPaperPositions().find((p) => p.id === legacy.id);
    expect(after?.paperSessionId).toBeUndefined();
    expect(after?.eventSequencePaper?.lastProcessedFinalizedCandle?.openTime).toBe(n.openTime);
  });

  it("5-9 + 12-14. finalized management candle audit, same-candle dedupe, next-candle update", async () => {
    isolate();
    const entryIndex = 24;
    const warmup = warmupThrough(entryIndex);
    const position = openOwned({
      paperSessionId: "paper_ohlc_audit",
      paperStrategyId: "custom_ohlc_audit",
      entryIndex,
    });
    expect(position.eventSequencePaper?.lastProcessedFinalizedCandle).toBeUndefined();

    const fixture: OhlcvCandle = bar(entryIndex + 1, 78_000, 79_000, 77_500, 78_500);
    const first = await manageEventSequencePaperPositions({
      candlesBySymbol: { BTCUSDT: [...warmup, fixture] },
      nowMs: nowAfter(fixture),
    });
    expect(first.advanced).toBe(1);
    expect(first.closed).toBe(0);

    const afterFirst = getOpenPositions().find((p) => p.id === position.id)!;
    const audit = afterFirst.eventSequencePaper?.lastProcessedFinalizedCandle;
    expect(audit).toEqual({
      symbol: "BTCUSDT",
      intervalMs: INTERVAL,
      openTime: fixture.openTime,
      closeTime: fixture.closeTime,
      open: 78_000,
      high: 79_000,
      low: 77_500,
      close: 78_500,
    });
    expect(afterFirst.eventSequencePaper?.lastProcessedCandleOpenTime).toBe(fixture.openTime);
    expect(afterFirst.barsHeld).toBe(1);
    const barsHeldAfterFirst = afterFirst.barsHeld;
    const stopAfterFirst = afterFirst.stopLoss;
    const tpAfterFirst = afterFirst.takeProfit;
    const qtyAfterFirst = afterFirst.quantity;
    const entryAfterFirst = afterFirst.entryPrice;

    const sameAgain = await manageEventSequencePaperPositions({
      candlesBySymbol: { BTCUSDT: [...warmup, fixture] },
      nowMs: nowAfter(fixture) + 15_000,
    });
    expect(sameAgain.advanced).toBe(0);
    const afterSame = getOpenPositions().find((p) => p.id === position.id)!;
    expect(afterSame.barsHeld).toBe(barsHeldAfterFirst);
    expect(afterSame.eventSequencePaper?.lastProcessedFinalizedCandle).toEqual(audit);
    expect(afterSame.stopLoss).toBe(stopAfterFirst);
    expect(afterSame.takeProfit).toBe(tpAfterFirst);
    expect(afterSame.quantity).toBe(qtyAfterFirst);
    expect(afterSame.entryPrice).toBe(entryAfterFirst);
    expect(afterSame.eventSequencePaper?.stop).toBe(80_000);
    expect(afterSame.eventSequencePaper?.tp).toBe(77_000);

    const next = bar(entryIndex + 2, 78_500, 78_600, 78_400, 78_550);
    const second = await manageEventSequencePaperPositions({
      candlesBySymbol: { BTCUSDT: [...warmup, fixture, next] },
      nowMs: nowAfter(next),
    });
    expect(second.advanced).toBe(1);
    const afterNext = getOpenPositions().find((p) => p.id === position.id)!;
    expect(afterNext.barsHeld).toBe(2);
    expect(afterNext.eventSequencePaper?.lastProcessedFinalizedCandle).toEqual({
      symbol: "BTCUSDT",
      intervalMs: INTERVAL,
      openTime: next.openTime,
      closeTime: next.closeTime,
      open: 78_500,
      high: 78_600,
      low: 78_400,
      close: 78_550,
    });
    expect(afterNext.eventSequencePaper?.lastProcessedCandleOpenTime).toBe(next.openTime);
  });

  it("10-11. stop still uses high; target still uses low", () => {
    const geo = GEO;
    const shortStop = decideEventSequencePositionExit({
      side: "SHORT",
      candle: bar(0, 78_200, 79_000, 78_100, 78_400),
      stop: 78_974.48542553117,
      tp: 78_019.55326747774,
      holdBars: 1,
      maxHoldBars: 60,
      geo,
      invalidateRule: "none",
      bar: 0,
      atr: 200,
    });
    expect(shortStop.exitReason).toBe("stop_loss");
    expect(shortStop.exitPrice).toBe(78_974.48542553117);

    const shortMiss = decideEventSequencePositionExit({
      side: "SHORT",
      candle: bar(0, 78_200, 78_969.6, 78_100, 78_400),
      stop: 78_974.48542553117,
      tp: 78_019.55326747774,
      holdBars: 1,
      maxHoldBars: 60,
      geo,
      invalidateRule: "none",
      bar: 0,
      atr: 200,
    });
    expect(shortMiss.exitPrice).toBeNull();

    const shortTp = decideEventSequencePositionExit({
      side: "SHORT",
      candle: bar(0, 78_307.4, 78_344.7, 77_660, 77_816.5),
      stop: 78_974.48542553117,
      tp: 78_019.55326747774,
      holdBars: 27,
      maxHoldBars: 60,
      geo,
      invalidateRule: "none",
      bar: 27,
      atr: 200,
    });
    expect(shortTp.exitReason).toBe("take_profit");
    expect(shortTp.exitPrice).toBe(78_019.55326747774);

    const longStop = decideEventSequencePositionExit({
      side: "LONG",
      candle: bar(0, 100, 101, 98, 99),
      stop: 99,
      tp: 110,
      holdBars: 1,
      maxHoldBars: 60,
      geo,
      invalidateRule: "none",
      bar: 0,
      atr: 1,
    });
    expect(longStop.exitReason).toBe("stop_loss");
    expect(longStop.exitPrice).toBe(99);

    const longTp = decideEventSequencePositionExit({
      side: "LONG",
      candle: bar(0, 100, 111, 99.5, 110),
      stop: 90,
      tp: 110,
      holdBars: 1,
      maxHoldBars: 60,
      geo,
      invalidateRule: "none",
      bar: 0,
      atr: 1,
    });
    expect(longTp.exitReason).toBe("take_profit");
    expect(longTp.exitPrice).toBe(110);

    const src = source("src/lib/rextora/strategy/eventSequenceBacktest.ts");
    const fn = src.slice(
      src.indexOf("export function decideEventSequencePositionExit"),
      src.indexOf("if (exitPrice == null && input.combination"),
    );
    expect(fn).toContain("c.high >= input.stop");
    expect(fn).toContain("c.low <= input.tp");
    expect(fn).toContain("c.low <= input.stop");
    expect(fn).toContain("c.high >= input.tp");
  });

  it("15-17. close candle OHLC retained; cost and lifecycle unchanged", async () => {
    isolate();
    const entryIndex = 24;
    const warmup = warmupThrough(entryIndex);
    const position = openOwned({
      paperSessionId: "paper_close_audit",
      paperStrategyId: "custom_close_audit",
      entryIndex,
      stop: 80_000,
      tp: 77_000,
    });
    const closeBar = bar(entryIndex + 1, 78_000, 78_200, 76_900, 77_200);
    const managed = await manageEventSequencePaperPositions({
      candlesBySymbol: { BTCUSDT: [...warmup, closeBar] },
      nowMs: nowAfter(closeBar),
    });
    expect(managed.closed).toBe(1);
    const closed = loadPaperPositions().find((p) => p.id === position.id)!;
    expect(closed.side).toBe("Flat");
    expect(closed.eventSequencePaper?.lastProcessedFinalizedCandle).toEqual({
      symbol: "BTCUSDT",
      intervalMs: INTERVAL,
      openTime: closeBar.openTime,
      closeTime: closeBar.closeTime,
      open: 78_000,
      high: 78_200,
      low: 76_900,
      close: 77_200,
    });
    expect(closed.paperLifecycleModel).toBe(EVENT_SEQUENCE_PAPER_LIFECYCLE_V1);
    expect(closed.eventSequencePaper?.paperLifecycleModel).toBe(
      EVENT_SEQUENCE_PAPER_LIFECYCLE_V1,
    );
    expect(closed.eventSequencePaper?.costModel).toBe(
      EVENT_SEQUENCE_COST_MODEL_EXECUTION_PRICE_V1,
    );

    const trades = loadUnifiedTradeResults();
    expect(trades).toHaveLength(1);
    const expected = settleEventSequenceClose({
      side: "SHORT",
      rawEntryPrice: 78289.4,
      rawExitPrice: 77_000,
      feeRate: FEE,
      slippageRate: SLIP,
      leverage: 1,
      equityBefore: 10_000,
      baseBalancePct: patternDefinition().positionSizing.baseBalancePct,
      costModel: EVENT_SEQUENCE_COST_MODEL_EXECUTION_PRICE_V1,
      applyFunding: false,
      fundingRate: FUNDING,
      applySpread: true,
      spreadRate: SPREAD,
    });
    expect(trades[0]?.netPnl).toBe(expected.netPnlUsdt);
    expect(trades[0]?.grossPnl).toBe(expected.grossPnlUsdt);
    expect(trades[0]?.exitReason).toBe("take_profit");
  });

  it("18-20. SAFE lifecycle stays separate; SAFE file unchanged; no production Paper session", () => {
    isolate();
    openOwned({
      paperSessionId: "paper_safety",
      paperStrategyId: "custom_safety",
    });
    const loop = source("src/lib/rextora/execution/safePaperLoop.ts");
    expect(loop).toContain("manageEventSequencePaperPositions");
    expect(loop).toContain("openEventSequencePaperPosition");
    const engine = source("src/lib/rextora/paperExecutionEngine.ts");
    expect(engine).toMatch(/isEventSequencePaperOwned/);
    expect(sha256(path.join(process.cwd(), "data/strategies/SAFE_v44_i4060.json"))).toBe(
      SAFE_SHA,
    );
    const hashesAfter = productionReadonlyHashes();
    expect(hashesAfter.safeSha256).toBe(hashesBefore.safeSha256);
    expect(hashesAfter.researchIndexSha256).toBe(hashesBefore.researchIndexSha256);
    expect(tempDirs.length).toBeGreaterThan(0);
    expect(process.env.REXTORA_DATA_DIR?.startsWith(os.tmpdir()) ?? false).toBe(true);
    expect(process.env.REXTORA_PAPER_SESSIONS_DIR?.startsWith(os.tmpdir()) ?? false).toBe(
      true,
    );
  });
});
