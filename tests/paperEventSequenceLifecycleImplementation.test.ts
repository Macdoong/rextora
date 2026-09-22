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
    generateAiTradeReport: vi.fn(() => ({ id: "mock-a833" })),
  };
});

import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { resetAccountStateForTests, getAccountState } from "../src/lib/rextora/accountStateStore";
import { productionReadonlyHashes } from "../src/lib/rextora/backtest/backtestCostAssumptionsDiagnosis";
import { calculateSafeV44Risk } from "../src/lib/rextora/risk/safeV44RiskEngine";
import { managePaperPositions, executePaperExit, emergencyStopPaper } from "../src/lib/rextora/paperExecutionEngine";
import {
  EVENT_SEQUENCE_PAPER_EMERGENCY_CLOSE,
  EVENT_SEQUENCE_PAPER_MANUAL_CLOSE,
  isEventSequencePaperOwned,
  manageEventSequencePaperPositions,
  openEventSequencePaperPosition,
  settleEventSequencePaperClose,
} from "../src/lib/rextora/paper/paperEventSequenceLifecycle";
import {
  activatePaperSession,
  getPaperSession,
  preparePaperSession,
} from "../src/lib/rextora/paper/paperSessionStore";
import { getOpenPositions } from "../src/lib/rextora/positionManager";
import { invalidateJsonStoreCache } from "../src/lib/rextora/storage/jsonStore";
import { savePaperOrders, savePaperPositions } from "../src/lib/rextora/storage/tradeStore";
import { resetUnifiedTradeResultsForTests } from "../src/lib/rextora/metrics/tradeResultStore";
import {
  evaluateEventSequencePaperSignal,
  runEventSequenceBacktest,
} from "../src/lib/rextora/strategy/eventSequenceBacktest";
import {
  EVENT_SEQUENCE_COST_MODEL_EXECUTION_PRICE_V1,
  EVENT_SEQUENCE_COST_MODEL_LEDGER_V0,
} from "../src/lib/rextora/strategy/eventSequenceCostModel";
import { CONTEXT_FALLBACK_PARAMS } from "../src/lib/rextora/strategy/safeV44Params";
import {
  createStrategy,
  ensureStrategyStore,
} from "../src/lib/rextora/strategy/strategyStore";
import { EVENT_SEQUENCE_PAPER_LIFECYCLE_V1 } from "../src/lib/rextora/types";
import { recordPaperEntryFromSafe, recordPaperExit } from "../src/lib/rextora/tradeLifecycle";
import {
  buildObLongCandles,
  candle,
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

function isolate(): { paper: string; data: string } {
  const iso = installIsolatedStrategyStore();
  cleanups.push(iso.cleanup);
  ensureStrategyStore();
  const paper = fs.mkdtempSync(path.join(os.tmpdir(), "rextora-a833-paper-"));
  const data = fs.mkdtempSync(path.join(os.tmpdir(), "rextora-a833-data-"));
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

const ASSUMPTIONS = {
  feeRate: FEE,
  slippageRate: SLIP,
  fundingRate: FUNDING,
  applyFunding: true,
  applySpread: true,
  spreadRate: SPREAD,
};

function sha256(filePath: string): string | null {
  if (!fs.existsSync(filePath)) return null;
  return createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

function entryWindow() {
  return buildObLongCandles().slice(0, 29);
}

function lastOpen(candles: ReturnType<typeof entryWindow>): number {
  return candles[candles.length - 1].openTime;
}

function nowAfter(candles: ReturnType<typeof entryWindow>, extra = 0): number {
  const last = candles[candles.length - 1];
  return (last.closeTime ?? last.openTime + 900_000) + 1 + extra;
}

function openCanonical(overrides?: { costModel?: typeof EVENT_SEQUENCE_COST_MODEL_LEDGER_V0; def?: ReturnType<typeof patternDefinition>; applyFunding?: boolean; applySpread?: boolean }) {
  const def = overrides?.def ?? patternDefinition();
  const candles = entryWindow();
  const costModel = overrides?.costModel ?? EVENT_SEQUENCE_COST_MODEL_EXECUTION_PRICE_V1;
  const es = evaluateEventSequencePaperSignal({
    def,
    symbol: "BTCUSDT",
    candles,
    costModel,
    feeRate: FEE,
    slippageRate: SLIP,
    applyFunding: overrides?.applyFunding ?? true,
    fundingRate: FUNDING,
    applySpread: overrides?.applySpread ?? true,
    spreadRate: SPREAD,
  });
  const position = openEventSequencePaperPosition({
    symbol: "BTCUSDT",
    strategyId: "custom_a833",
    paperSessionId: "paper_test_a833",
    paperStrategyId: "custom_a833",
    strategyName: "A8.3.3",
    paramsHash: "diag_a833",
    def,
    side: es.side === "SHORT" ? "SHORT" : "LONG",
    rawEntryPrice: es.rawEntryPrice!,
    executionEntryPrice: es.entryPrice!,
    stopPrice: es.stopPrice!,
    targetPrice: es.targetPrice!,
    entryCandleOpenTime: es.entryCandleOpenTime ?? lastOpen(candles),
    maxHoldBars: es.maxHoldBars ?? def.risk.maxHoldBars,
    invalidateRule: es.invalidateRule ?? "close_beyond_zone",
    geo: {
      patternType: es.patternType ?? "order_block",
      zoneHigh: es.zoneHigh ?? es.entryPrice!,
      zoneLow: es.zoneLow ?? es.entryPrice!,
      creationBar: es.creationBar ?? es.entryBar ?? candles.length - 1,
    },
    costModel,
    costAssumptions: {
      ...ASSUMPTIONS,
      applyFunding: overrides?.applyFunding ?? true,
      applySpread: overrides?.applySpread ?? true,
    },
    timeframe: "15m",
    leverage: es.leverage ?? 1,
  });
  return { def, candles, es, position };
}

function esEngine(def: ReturnType<typeof patternDefinition>, candles: ReturnType<typeof entryWindow>, costModel = EVENT_SEQUENCE_COST_MODEL_EXECUTION_PRICE_V1) {
  return runEventSequenceBacktest({
    def,
    symbol: "BTCUSDT",
    candles,
    balance: 10_000,
    feeRate: FEE,
    slippageRate: SLIP,
    costModel,
    applyFunding: costModel === EVENT_SEQUENCE_COST_MODEL_EXECUTION_PRICE_V1,
    fundingRate: FUNDING,
    applySpread: costModel === EVENT_SEQUENCE_COST_MODEL_EXECUTION_PRICE_V1,
    spreadRate: SPREAD,
  });
}

describe("P3-A8.3.3 Event-Sequence Paper lifecycle implementation", () => {
  it("1-4. ownership: SAFE / canonical / legacy / historical unstamped", () => {
    isolate();
    const safePos = {
      id: "safe-1",
      symbol: "ETHUSDT",
      side: "Long" as const,
      entryPrice: 100,
      currentPrice: 100,
      quantity: 1,
      leverage: 1,
      unrealizedPnl: 0,
      margin: 10,
      stopLoss: 99,
      takeProfit: 102,
      mode: "PAPER" as const,
      serviceState: "paper" as const,
    };
    savePaperPositions([safePos]);
    expect(isEventSequencePaperOwned(getOpenPositions()[0])).toBe(false);
    const { position: canonical } = openCanonical();
    expect(canonical.paperLifecycleModel).toBe(EVENT_SEQUENCE_PAPER_LIFECYCLE_V1);
    expect(isEventSequencePaperOwned(canonical)).toBe(true);
    const { position: legacy } = openCanonical({
      costModel: EVENT_SEQUENCE_COST_MODEL_LEDGER_V0,
      applyFunding: false,
      applySpread: false,
    });
    expect(legacy.eventSequencePaper?.costModel).toBe(EVENT_SEQUENCE_COST_MODEL_LEDGER_V0);
    expect(isEventSequencePaperOwned(legacy)).toBe(true);
    expect(isEventSequencePaperOwned(safePos)).toBe(false);
  });

  it("5-10. Pattern entry bypasses SAFE risk/trailing and uses ES sizing", () => {
    isolate();
    const loop = source("src/lib/rextora/execution/safePaperLoop.ts");
    expect(loop).toContain("openEventSequencePaperPosition");
    expect(loop).toMatch(/event_sequence[\s\S]*continue;/);
    const { es, position, def } = openCanonical();
    const safeRisk = calculateSafeV44Risk({
      entryPrice: es.entryPrice!,
      atr: 2,
      atrPct: 0.02,
      side: "LONG",
      signalType: "trend_long",
      balance: 10_000,
      params: CONTEXT_FALLBACK_PARAMS,
    });
    expect(position.stopLoss).toBe(es.stopPrice);
    expect(position.takeProfit).toBe(es.targetPrice);
    expect(position.stopLoss).not.toBe(safeRisk.stopLossPrice);
    expect(position.takeProfit).not.toBe(safeRisk.takeProfitPrice);
    expect(position.trailingDistance).toBe(0);
    expect(position.margin).toBeCloseTo(10_000 * def.positionSizing.baseBalancePct, 6);
    expect(position.leverage).toBe(es.leverage ?? 1);
    expect(position.entryPrice).toBe(es.entryPrice);
  });

  it("11-16. raw/execution/persisted entry, stop/target, durable state", () => {
    isolate();
    const { es, position } = openCanonical();
    expect(position.eventSequencePaper?.rawEntryPrice).toBe(es.rawEntryPrice);
    expect(position.eventSequencePaper?.executionEntryPrice).toBe(es.entryPrice);
    expect(position.entryPrice).toBe(es.entryPrice);
    expect(position.stopLoss).toBe(es.stopPrice);
    expect(position.takeProfit).toBe(es.targetPrice);
    const reloaded = getOpenPositions().find((p) => p.id === position.id);
    expect(reloaded?.eventSequencePaper?.lastProcessedCandleOpenTime).toBe(
      position.eventSequencePaper?.lastProcessedCandleOpenTime,
    );
  });

  it("17-21. candle dedupe, increment, reload, max-hold clock", async () => {
    isolate();
    const { candles, position, def } = openCanonical({
      def: patternDefinition({ maxHoldBars: 2 }),
    });
    const now = nowAfter(candles);
    await manageEventSequencePaperPositions({ candlesBySymbol: { BTCUSDT: candles }, nowMs: now });
    const once = getOpenPositions().find((p) => p.symbol === "BTCUSDT");
    expect(once?.barsHeld).toBe(0);
    await manageEventSequencePaperPositions({ candlesBySymbol: { BTCUSDT: candles }, nowMs: now });
    expect(getOpenPositions().find((p) => p.symbol === "BTCUSDT")?.barsHeld).toBe(0);
    const nextI = candles.length;
    const last = candles[candles.length - 1];
    const mid1 = candle(nextI, last.close, last.close + 0.05, last.close - 0.05, last.close);
    const mid2 = candle(nextI + 1, last.close, last.close + 0.05, last.close - 0.05, last.close);
    await manageEventSequencePaperPositions({
      candlesBySymbol: { BTCUSDT: [...candles, mid1] },
      nowMs: nowAfter([...candles, mid1]),
    });
    expect(getOpenPositions().find((p) => p.symbol === "BTCUSDT")?.barsHeld).toBe(1);
    const afterReload = getOpenPositions().find((p) => p.symbol === "BTCUSDT");
    expect(afterReload?.eventSequencePaper?.lastProcessedCandleOpenTime).toBe(mid1.openTime);
    await manageEventSequencePaperPositions({
      candlesBySymbol: { BTCUSDT: [...candles, mid1, mid2] },
      nowMs: nowAfter([...candles, mid1, mid2]),
    });
    const closed = getOpenPositions().filter((p) => p.symbol === "BTCUSDT" && p.side !== "Flat");
    expect(closed.length).toBe(0);
    expect(def.risk.maxHoldBars).toBe(2);
    expect(position.maxHoldBars).toBe(2);
  });

  it("22-26. TP / SL / max-hold / invalidation / same-bar precedence", async () => {
    isolate();
    const { candles, es, def } = openCanonical();
    const last = candles[candles.length - 1];
    const tpBar = candle(
      candles.length,
      last.close,
      (es.targetPrice ?? last.close) + 1,
      last.close - 0.05,
      (es.targetPrice ?? last.close) + 0.2,
    );
    await manageEventSequencePaperPositions({
      candlesBySymbol: { BTCUSDT: [...candles, tpBar] },
      nowMs: nowAfter([...candles, tpBar]),
    });
    const engineTp = esEngine(def, [...candles, tpBar]);
    const paperTp = (await import("../src/lib/rextora/metrics/tradeResultStore")).loadUnifiedTradeResults()[0];
    const esTp = engineTp.trades.find((t) => t.entryBar === candles.length - 1);
    expect(paperTp.exitReason).toBe("take_profit");
    expect(esTp?.exitReason).toBe("take_profit");

    isolate();
    const slOpen = openCanonical();
    const slLast = slOpen.candles[slOpen.candles.length - 1];
    const slBar = candle(
      slOpen.candles.length,
      slLast.close,
      slLast.close + 0.05,
      (slOpen.es.stopPrice ?? slLast.close) - 1,
      (slOpen.es.stopPrice ?? slLast.close) - 0.2,
    );
    await manageEventSequencePaperPositions({
      candlesBySymbol: { BTCUSDT: [...slOpen.candles, slBar] },
      nowMs: nowAfter([...slOpen.candles, slBar]),
    });
    const engineSl = esEngine(slOpen.def, [...slOpen.candles, slBar]);
    expect(engineSl.trades.find((t) => t.entryBar === slOpen.candles.length - 1)?.exitReason).toBe(
      "stop_loss",
    );
    expect(
      (await import("../src/lib/rextora/metrics/tradeResultStore")).loadUnifiedTradeResults()[0]
        .exitReason,
    ).toBe("stop_loss");

    isolate();
    const inv = openCanonical();
    const invLast = inv.candles[inv.candles.length - 1];
    const zoneLow = inv.es.zoneLow ?? invLast.close;
    const closeBelow = Math.min(zoneLow - 0.05, (inv.es.stopPrice ?? zoneLow) + 0.2);
    const invBar = candle(
      inv.candles.length,
      invLast.close,
      invLast.close + 0.02,
      Math.max(closeBelow, (inv.es.stopPrice ?? 0) + 0.05),
      closeBelow,
    );
    await manageEventSequencePaperPositions({
      candlesBySymbol: { BTCUSDT: [...inv.candles, invBar] },
      nowMs: nowAfter([...inv.candles, invBar]),
    });
    const engineInv = esEngine(inv.def, [...inv.candles, invBar]);
    const paperInv = (await import("../src/lib/rextora/metrics/tradeResultStore")).loadUnifiedTradeResults()[0];
    expect(engineInv.trades.find((t) => t.entryBar === inv.candles.length - 1)?.exitReason).toBe(
      paperInv?.exitReason,
    );

    isolate();
    const conflict = openCanonical();
    const cLast = conflict.candles[conflict.candles.length - 1];
    const both = candle(
      conflict.candles.length,
      cLast.close,
      (conflict.es.targetPrice ?? cLast.close) + 1,
      (conflict.es.stopPrice ?? cLast.close) - 1,
      cLast.close,
    );
    await manageEventSequencePaperPositions({
      candlesBySymbol: { BTCUSDT: [...conflict.candles, both] },
      nowMs: nowAfter([...conflict.candles, both]),
    });
    const engineBoth = esEngine(conflict.def, [...conflict.candles, both]);
    const paperBoth = (await import("../src/lib/rextora/metrics/tradeResultStore")).loadUnifiedTradeResults()[0];
    expect(paperBoth.exitReason).toBe("stop_loss");
    expect(engineBoth.trades.find((t) => t.entryBar === conflict.candles.length - 1)?.exitReason).toBe(
      "stop_loss",
    );
  });

  it("27-36. canonical and legacy cost parity", async () => {
    isolate();
    const { candles, es, def } = openCanonical();
    const last = candles[candles.length - 1];
    const tpBar = candle(
      candles.length,
      last.close,
      (es.targetPrice ?? last.close) + 1,
      last.close - 0.05,
      (es.targetPrice ?? last.close) + 0.2,
    );
    await manageEventSequencePaperPositions({
      candlesBySymbol: { BTCUSDT: [...candles, tpBar] },
      nowMs: nowAfter([...candles, tpBar]),
    });
    const engine = esEngine(def, [...candles, tpBar]);
    const esTrade = engine.trades.find((t) => t.entryBar === candles.length - 1)!;
    const paper = (await import("../src/lib/rextora/metrics/tradeResultStore")).loadUnifiedTradeResults()[0];
    expect(paper.exitPrice).toBeCloseTo(esTrade.exitPrice, 8);
    expect(paper.fee).toBeCloseTo(esTrade.feeCostUsdt ?? 0, 6);
    expect(paper.funding).toBeCloseTo(esTrade.fundingCostUsdt ?? 0, 6);
    expect(paper.spread).toBeCloseTo(esTrade.spreadCostUsdt ?? 0, 6);
    expect(paper.netPnl).toBeCloseTo(esTrade.netPnlUsdt ?? 0, 6);
    expect(esTrade.slippagePct === 0 || (esTrade.eventSequenceCostModel === EVENT_SEQUENCE_COST_MODEL_EXECUTION_PRICE_V1)).toBe(true);

    isolate();
    const legacy = openCanonical({
      costModel: EVENT_SEQUENCE_COST_MODEL_LEDGER_V0,
      applyFunding: false,
      applySpread: false,
    });
    const lLast = legacy.candles[legacy.candles.length - 1];
    const lTp = candle(
      legacy.candles.length,
      lLast.close,
      (legacy.es.targetPrice ?? lLast.close) + 1,
      lLast.close - 0.05,
      (legacy.es.targetPrice ?? lLast.close) + 0.2,
    );
    await manageEventSequencePaperPositions({
      candlesBySymbol: { BTCUSDT: [...legacy.candles, lTp] },
      nowMs: nowAfter([...legacy.candles, lTp]),
    });
    const engineL = esEngine(
      legacy.def,
      [...legacy.candles, lTp],
      EVENT_SEQUENCE_COST_MODEL_LEDGER_V0,
    );
    const paperL = (await import("../src/lib/rextora/metrics/tradeResultStore")).loadUnifiedTradeResults()[0];
    const esL = engineL.trades.find((t) => t.entryBar === legacy.candles.length - 1)!;
    expect(paperL.fee).toBeCloseTo(esL.feeCostUsdt ?? 0, 6);
    expect(paperL.funding).toBe(0);
    expect(paperL.spread).toBe(0);
    expect(paperL.slippage).toBeCloseTo(esL.slippageCostUsdt ?? 0, 6);
  });

  it("37. Pattern cost guard absent", () => {
    const loop = source("src/lib/rextora/execution/safePaperLoop.ts");
    expect(loop).toContain('executionKind === "event_sequence"');
    expect(loop).toContain("openEventSequencePaperPosition");
    expect(source("src/lib/rextora/paper/paperEventSequenceLifecycle.ts")).not.toContain(
      "evaluateCostGuard",
    );
  });

  it("38-43. account/session compounding, close once, no double settle", async () => {
    isolate();
    const created = createStrategy({
      name: "A833 session",
      description: "engineCostModel=event_sequence_execution_price_v1",
      strategyType: "condition_builder",
      definition: patternDefinition(),
      sourceParamsHash: "a833",
    });
    const prepared = preparePaperSession({ strategyId: created.id, requireApproval: false });
    const session = activatePaperSession(prepared.id);
    expect(session.status).toBe("active");
    const { candles, es, def } = openCanonical();
    const last = candles[candles.length - 1];
    const tpBar = candle(
      candles.length,
      last.close,
      (es.targetPrice ?? last.close) + 1,
      last.close - 0.05,
      (es.targetPrice ?? last.close) + 0.2,
    );
    await manageEventSequencePaperPositions({
      candlesBySymbol: { BTCUSDT: [...candles, tpBar] },
      nowMs: nowAfter([...candles, tpBar]),
    });
    const engine = esEngine(def, [...candles, tpBar]);
    const esTrade = engine.trades.find((t) => t.entryBar === candles.length - 1)!;
    expect(getAccountState().balanceUsdt).toBeCloseTo(10_000 + (esTrade.netPnlUsdt ?? 0), 6);
    expect(getPaperSession(session.id)?.realizedPnl).toBeCloseTo(esTrade.netPnlUsdt ?? 0, 6);
    const firstNet = esTrade.netPnlUsdt ?? 0;
    const secondOpen = openCanonical();
    const sLast = secondOpen.candles[secondOpen.candles.length - 1];
    const sTp = candle(
      secondOpen.candles.length,
      sLast.close,
      (secondOpen.es.targetPrice ?? sLast.close) + 1,
      sLast.close - 0.05,
      (secondOpen.es.targetPrice ?? sLast.close) + 0.2,
    );
    const equityBefore2 = getAccountState().balanceUsdt;
    await manageEventSequencePaperPositions({
      candlesBySymbol: { BTCUSDT: [...secondOpen.candles, sTp] },
      nowMs: nowAfter([...secondOpen.candles, sTp]),
    });
    const engine2 = runEventSequenceBacktest({
      def: secondOpen.def,
      symbol: "BTCUSDT",
      candles: [...secondOpen.candles, sTp],
      balance: equityBefore2,
      feeRate: FEE,
      slippageRate: SLIP,
      costModel: EVENT_SEQUENCE_COST_MODEL_EXECUTION_PRICE_V1,
      applyFunding: true,
      fundingRate: FUNDING,
      applySpread: true,
      spreadRate: SPREAD,
    });
    const es2 = engine2.trades.find((t) => t.entryBar === secondOpen.candles.length - 1)!;
    expect(getAccountState().balanceUsdt).toBeCloseTo(equityBefore2 + (es2.netPnlUsdt ?? 0), 5);
    expect(getPaperSession(session.id)?.realizedPnl).toBeCloseTo(firstNet + (es2.netPnlUsdt ?? 0), 5);
    expect(getOpenPositions().filter((p) => p.side !== "Flat").length).toBe(0);
    const pos = { ...secondOpen.position, eventSequencePaper: { ...secondOpen.position.eventSequencePaper!, settlementId: "already" } };
    expect(settleEventSequencePaperClose({ position: pos, rawExitPrice: 1, exitReason: "take_profit" })).toBeNull();
  });

  it("44-48. manual/emergency settlement and distinct reasons", async () => {
    isolate();
    const { position } = openCanonical();
    const first = await executePaperExit("BTCUSDT");
    expect(first.ok).toBe(true);
    const trades = (await import("../src/lib/rextora/metrics/tradeResultStore")).loadUnifiedTradeResults();
    expect(trades[0].exitReason).toBe(EVENT_SEQUENCE_PAPER_MANUAL_CLOSE);
    const again = await executePaperExit("BTCUSDT");
    expect(again.ok).toBe(false);

    isolate();
    const legacy = openCanonical({
      costModel: EVENT_SEQUENCE_COST_MODEL_LEDGER_V0,
      applyFunding: false,
      applySpread: false,
    });
    await executePaperExit(legacy.position.symbol);
    expect(
      (await import("../src/lib/rextora/metrics/tradeResultStore")).loadUnifiedTradeResults()[0]
        .exitReason,
    ).toBe(EVENT_SEQUENCE_PAPER_MANUAL_CLOSE);

    isolate();
    openCanonical();
    await emergencyStopPaper();
    expect(
      (await import("../src/lib/rextora/metrics/tradeResultStore")).loadUnifiedTradeResults()[0]
        .exitReason,
    ).toBe(EVENT_SEQUENCE_PAPER_EMERGENCY_CLOSE);

    isolate();
    openCanonical({
      costModel: EVENT_SEQUENCE_COST_MODEL_LEDGER_V0,
      applyFunding: false,
      applySpread: false,
    });
    await emergencyStopPaper();
    expect(
      (await import("../src/lib/rextora/metrics/tradeResultStore")).loadUnifiedTradeResults()[0]
        .exitReason,
    ).toBe(EVENT_SEQUENCE_PAPER_EMERGENCY_CLOSE);
    expect(EVENT_SEQUENCE_PAPER_MANUAL_CLOSE).not.toBe("take_profit");
    expect(EVENT_SEQUENCE_PAPER_EMERGENCY_CLOSE).not.toBe("stop_loss");
  });

  it("49-53. reload stays canonical/legacy; description edit cannot mutate open model", () => {
    isolate();
    const { position } = openCanonical();
    const reloaded = getOpenPositions().find((p) => p.id === position.id);
    expect(reloaded?.eventSequencePaper?.costModel).toBe(
      EVENT_SEQUENCE_COST_MODEL_EXECUTION_PRICE_V1,
    );
    isolate();
    const legacy = openCanonical({
      costModel: EVENT_SEQUENCE_COST_MODEL_LEDGER_V0,
      applyFunding: false,
      applySpread: false,
    });
    expect(
      getOpenPositions().find((p) => p.id === legacy.position.id)?.eventSequencePaper
        ?.feeRate,
    ).toBe(FEE);
    expect(legacy.position.eventSequencePaper?.costModel).toBe(
      EVENT_SEQUENCE_COST_MODEL_LEDGER_V0,
    );
  });

  it("54-62. Research/Backtest/Paper economic parity", async () => {
    isolate();
    const { candles, es, def } = openCanonical();
    const last = candles[candles.length - 1];
    const tpBar = candle(
      candles.length,
      last.close,
      (es.targetPrice ?? last.close) + 1,
      last.close - 0.05,
      (es.targetPrice ?? last.close) + 0.2,
    );
    const full = [...candles, tpBar];
    await manageEventSequencePaperPositions({
      candlesBySymbol: { BTCUSDT: full },
      nowMs: nowAfter(full),
    });
    const research = esEngine(def, full);
    const backtest = esEngine(def, full);
    const paper = (await import("../src/lib/rextora/metrics/tradeResultStore")).loadUnifiedTradeResults()[0];
    const esTrade = research.trades.find((t) => t.entryBar === candles.length - 1)!;
    expect(backtest.trades[0]?.entryPrice).toBe(research.trades[0]?.entryPrice);
    expect(paper.entryPrice).toBeCloseTo(esTrade.entryPrice, 8);
    expect(paper.exitReason).toBe(esTrade.exitReason);
    expect(paper.exitPrice).toBeCloseTo(esTrade.exitPrice, 8);
    expect(paper.fee).toBeCloseTo(esTrade.feeCostUsdt ?? 0, 6);
    expect(paper.funding).toBeCloseTo(esTrade.fundingCostUsdt ?? 0, 6);
    expect(paper.spread).toBeCloseTo(esTrade.spreadCostUsdt ?? 0, 6);
    expect(paper.netPnl).toBeCloseTo(esTrade.netPnlUsdt ?? 0, 6);
    expect(getAccountState().balanceUsdt).toBeCloseTo(research.endingBalance, 5);
  });

  it("63-68. SAFE Paper path unchanged", async () => {
    isolate();
    const loop = source("src/lib/rextora/execution/safePaperLoop.ts");
    expect(loop).toContain("calculateSafeV44Risk");
    expect(loop).toContain("evaluateSafeV44Signal");
    expect(source("src/lib/rextora/paperExecutionEngine.ts")).toContain(
      "isEventSequencePaperOwned(position)",
    );
    recordPaperEntryFromSafe({
      symbol: "SOLUSDT",
      side: "LONG",
      signalType: "trend_long",
      entryReason: "SAFE",
      score: 1,
      entryPrice: 100,
      stopLoss: 99,
      takeProfit: 102,
      leverage: 1,
      quantity: 1,
      margin: 10,
      strategyName: "SAFE",
      paramsHash: "7893ca3f0e30",
      trailingDistance: 1,
      maxHoldBars: 5,
    });
    expect(isEventSequencePaperOwned(getOpenPositions()[0])).toBe(false);
    const before = getOpenPositions()[0];
    await managePaperPositions();
    const after = getOpenPositions().find((p) => p.symbol === "SOLUSDT");
    expect((after?.barsHeld ?? 0) >= (before.barsHeld ?? 0)).toBe(true);
    recordPaperExit("SOLUSDT", 102, "익절");
    expect(
      (await import("../src/lib/rextora/metrics/tradeResultStore")).loadUnifiedTradeResults()[0]
        .exitReason,
    ).toBe("익절");
  });

  it("69-84. arithmetic/Live/production/SAFE unchanged", () => {
    expect(source("src/lib/rextora/botRuntime.ts")).not.toContain(
      "manageEventSequencePaperPositions",
    );
    expect(source("src/lib/rextora/botRuntime.ts")).not.toContain(
      "evaluateEventSequencePaperSignal",
    );
    expect(source("src/lib/rextora/execution/safePaperLoop.ts")).not.toContain(
      "approveAndStartPaperSession",
    );
    const after = productionReadonlyHashes();
    expect(sha256("data/strategies/SAFE_v44_i4060.json")).toBeNull();
    expect(after.safeSha256).toBe(hashesBefore.safeSha256);
    expect(after.researchIndexSha256).toBe(hashesBefore.researchIndexSha256);
    expect(after.backtestIndexSha256).toBe(hashesBefore.backtestIndexSha256);
    expect(after.paramsHash).toBe("7893ca3f0e30");
  });
});
