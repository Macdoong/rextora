/**
 * SAFE Paper runtime integrity — symbol contract, session accounting,
 * status/runtime sync, risk authority. Isolated temp stores only.
 * Does not start/resume production Paper or Live.
 */
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
    generateAiTradeReport: vi.fn(() => ({ id: "mock-integrity-paper" })),
  };
});

vi.mock("../src/lib/rextora/data/candleLoader", () => ({
  loadOhlcvCandles: vi.fn(async (symbol: string) => {
    scannedSymbols.push(String(symbol).toUpperCase());
    return { candles: [], source: "synthetic" as const };
  }),
}));

vi.mock("../src/lib/rextora/paperExecutionEngine", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../src/lib/rextora/paperExecutionEngine")>();
  return {
    ...actual,
    managePaperPositions: vi.fn(async () => undefined),
  };
});

import { afterEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { getConfig } from "../src/lib/rextora/config";
import { getRuntimeState, markEmergencyStop, clearEmergencyStop } from "../src/lib/rextora/runtimeState";
import { buildUnifiedTradeResult } from "../src/lib/rextora/metrics/tradeResult";
import { loadUnifiedTradeResults } from "../src/lib/rextora/metrics/tradeResultStore";
import { FUTURES_SYMBOLS } from "../src/lib/rextora/seedData";
import { resolvePaperExecutionSymbols } from "../src/lib/rextora/paper/paperExecutionSymbols";
import {
  resetSafePaperCandleRuntimeForTests,
  runSafePaperScanLoop,
} from "../src/lib/rextora/execution/safePaperLoop";
import {
  haltPaperSessionForRiskService,
  recoverPaperSessionsAfterRestart,
} from "../src/lib/rextora/paper/paperSessionService";
import {
  activatePaperSession,
  applySafePaperSessionCloseAccounting,
  failPaperSession,
  getExecutablePaperSession,
  getPaperSession,
  haltPaperSessionForRisk,
  paperSessionCapitalUsdt,
  paperSessionOperatorView,
  pausePaperSession,
  preparePaperSession,
  stopPaperSession,
  touchPaperSessionHeartbeat,
} from "../src/lib/rextora/paper/paperSessionStore";
import { manageEventSequencePaperPositions } from "../src/lib/rextora/paper/paperEventSequenceLifecycle";
import {
  copyStrategy,
  getStrategyById,
  saveStrategy,
} from "../src/lib/rextora/strategy/strategyStore";
import { SAFE_STRATEGY_ID } from "../src/lib/rextora/strategy/strategyTypes";
import {
  recordPaperEntryFromSafe,
  recordPaperExit,
} from "../src/lib/rextora/tradeLifecycle";
import {
  PAPER_MAX_CONSECUTIVE_LOSSES,
  applyPaperRiskDefaults,
  loadPaperRiskState,
  loadRiskState,
  resetPaperRiskStateForNewSession,
} from "../src/lib/rextora/riskStateStore";
import { getUnifiedRiskView } from "../src/lib/rextora/metrics/riskService";
import {
  isolateA834,
  openCanonical,
  prepareIsolatedActiveSession,
  productionRecordHashes,
  tpBar,
  nowAfter,
} from "./helpers/paperRuntimeContinuityAndWarmupForensics";

const scannedSymbols: string[] = [];
const hashesBefore = productionRecordHashes();
const cleanups: Array<() => void> = [];

afterEach(() => {
  while (cleanups.length) cleanups.pop()?.();
  scannedSymbols.length = 0;
  resetSafePaperCandleRuntimeForTests();
  clearEmergencyStop();
  expect(productionRecordHashes()).toEqual(hashesBefore);
  expect(getRuntimeState().mode).not.toBe("LIVE");
  expect(getRuntimeState().running).toBe(false);
});

function isolate() {
  const iso = isolateA834();
  cleanups.push(iso.cleanup);
  return iso;
}

function prepareSafeBtcSession(symbol: string | null = "BTCUSDT") {
  const copy = copyStrategy(SAFE_STRATEGY_ID, "integrity-safe-btc");
  const prepared = preparePaperSession({
    strategyId: copy.id,
    symbol,
    requireApproval: false,
    virtualBalance: 10_000,
  });
  return { copy, session: activatePaperSession(prepared.id) };
}

function closeSafeOwned(input: {
  sessionId: string;
  strategyId: string;
  symbol: string;
  entryPrice: number;
  exitPrice: number;
  quantity?: number;
  exitReason: string;
}) {
  const opened = recordPaperEntryFromSafe({
    symbol: input.symbol,
    side: "LONG",
    signalType: "trend_long",
    entryReason: "integrity fixture",
    score: 1,
    entryPrice: input.entryPrice,
    stopLoss: input.entryPrice * 0.99,
    takeProfit: input.exitPrice,
    leverage: 2,
    quantity: input.quantity ?? 1,
    margin: 50,
    strategyName: "integrity-safe",
    paramsHash: "integrity",
    paperSessionId: input.sessionId,
    paperStrategyId: input.strategyId,
  });
  recordPaperExit(input.symbol, input.exitPrice, input.exitReason);
  const unified = loadUnifiedTradeResults()[0]!;
  expect(unified.id).toBe(`safe-close-${opened.position.id}`);
  return { opened, unified };
}

describe("SYMBOL CONTRACT", () => {
  it("1-9: explicit strategy/session symbols constrain Paper scan; watched cannot expand", async () => {
    isolate();
    const watched = FUTURES_SYMBOLS.slice(0, 50);
    expect(watched).toContain("SUIUSDT");
    expect(watched).toContain("PEPEUSDT");

    const btcOnly = resolvePaperExecutionSymbols({
      strategy: { symbols: ["BTCUSDT"] },
      session: { symbol: "BTCUSDT" },
      watchedSymbols: watched,
      allowedSymbols: watched.slice(0, 40),
    });
    expect(btcOnly.symbols).toEqual(["BTCUSDT"]);
    expect(btcOnly.constrained).toBe(true);
    expect(btcOnly.symbols).not.toContain("SUIUSDT");
    expect(btcOnly.symbols).not.toContain("PEPEUSDT");

    const expanded = resolvePaperExecutionSymbols({
      strategy: { symbols: ["BTCUSDT"] },
      session: { symbol: "BTCUSDT" },
      watchedSymbols: ["BTCUSDT", "SUIUSDT", "PEPEUSDT", "ETHUSDT"],
      allowedSymbols: ["BTCUSDT", "SUIUSDT", "PEPEUSDT", "ETHUSDT"],
    });
    expect(expanded.symbols).toEqual(["BTCUSDT"]);

    const two = resolvePaperExecutionSymbols({
      strategy: { symbols: ["BTCUSDT", "ETHUSDT"] },
      session: { symbol: "BTCUSDT" },
      watchedSymbols: watched,
    });
    expect(two.symbols).toEqual(["BTCUSDT", "ETHUSDT"]);

    const intersected = resolvePaperExecutionSymbols({
      strategy: { symbols: ["BTCUSDT", "FAKEUSDT"] },
      allowedSymbols: ["BTCUSDT", "ETHUSDT"],
    });
    expect(intersected.symbols).toEqual(["BTCUSDT"]);

    const fallback = resolvePaperExecutionSymbols({
      strategy: { symbols: [] },
      session: { symbol: null },
      watchedSymbols: ["AAAUSDT", "BBBUSDT"],
    });
    expect(fallback.source).toBe("watched_default");
    expect(fallback.constrained).toBe(false);
    expect(fallback.symbols).toEqual(["AAAUSDT", "BBBUSDT"]);

    const pattern = resolvePaperExecutionSymbols({
      strategy: {
        symbols: ["ETHUSDT"],
        definition: { symbols: ["ETHUSDT"] },
      },
      session: { symbol: "ETHUSDT" },
      watchedSymbols: watched,
    });
    expect(pattern.symbols).toEqual(["ETHUSDT"]);

    const { copy, session } = prepareSafeBtcSession("BTCUSDT");
    expect(copy.symbols).toEqual(["BTCUSDT"]);
    expect(session.symbol).toBe("BTCUSDT");
    await runSafePaperScanLoop({ maxSymbols: 40, maxNewEntries: 2 });
    expect(scannedSymbols.length).toBeGreaterThan(0);
    expect([...new Set(scannedSymbols)]).toEqual(["BTCUSDT"]);
    expect(scannedSymbols).not.toContain("SUIUSDT");
    expect(scannedSymbols).not.toContain("PEPEUSDT");

    scannedSymbols.length = 0;
    saveStrategy(copy.id, { symbols: ["BTCUSDT", "ETHUSDT"] });
    await runSafePaperScanLoop({ maxSymbols: 40, maxNewEntries: 2 });
    expect([...new Set(scannedSymbols)].sort()).toEqual(["BTCUSDT", "ETHUSDT"]);
  });
});

describe("SAFE SESSION ACCOUNTING", () => {
  it("10-22: SAFE close updates matching active session once using unified net PnL", () => {
    isolate();
    const { copy, session } = prepareSafeBtcSession();

    const win = closeSafeOwned({
      sessionId: session.id,
      strategyId: copy.id,
      symbol: "BTCUSDT",
      entryPrice: 100,
      exitPrice: 101,
      exitReason: "익절",
    });
    const afterWin = getPaperSession(session.id)!;
    expect(afterWin.tradeCount).toBe(1);
    expect(afterWin.realizedPnl).toBeCloseTo(win.unified.realizedUsdt, 8);
    expect(win.unified.realizedUsdt).toBe(win.unified.netPnl);
    expect(paperSessionCapitalUsdt(afterWin)).toBeCloseTo(
      afterWin.virtualBalance + afterWin.realizedPnl,
      8,
    );
    expect(afterWin.virtualBalance).toBe(10_000);

    const loss = closeSafeOwned({
      sessionId: session.id,
      strategyId: copy.id,
      symbol: "BTCUSDT",
      entryPrice: 100,
      exitPrice: 99,
      exitReason: "손절",
    });
    const afterTwo = getPaperSession(session.id)!;
    expect(afterTwo.tradeCount).toBe(2);
    expect(afterTwo.realizedPnl).toBeCloseTo(
      win.unified.realizedUsdt + loss.unified.realizedUsdt,
      8,
    );
    expect(paperSessionCapitalUsdt(afterTwo)).toBeCloseTo(
      10_000 + afterTwo.realizedPnl,
      8,
    );
    expect(loss.unified.realizedUsdt).toBeLessThan(0);

    const history = loadUnifiedTradeResults();
    expect(history[0]?.id).toBe(loss.unified.id);
    expect(history[1]?.id).toBe(win.unified.id);

    applySafePaperSessionCloseAccounting({
      paperSessionId: session.id,
      paperStrategyId: copy.id,
      closeId: loss.unified.id,
      realizedNetUsdt: loss.unified.realizedUsdt,
    });
    expect(getPaperSession(session.id)?.tradeCount).toBe(2);
    expect(getPaperSession(session.id)?.realizedPnl).toBeCloseTo(
      afterTwo.realizedPnl,
      8,
    );

    const otherPrepared = preparePaperSession({
      strategyId: copy.id,
      symbol: "ETHUSDT",
      requireApproval: false,
    });
    expect(getPaperSession(session.id)?.tradeCount).toBe(2);
    expect(getPaperSession(otherPrepared.id)?.tradeCount).toBe(0);
    expect(getPaperSession(otherPrepared.id)?.realizedPnl).toBe(0);
  });

  it("20-22: wrong session, stopped session, and missing ownership fail closed", () => {
    isolate();
    const owned = prepareSafeBtcSession();
    recordPaperEntryFromSafe({
      symbol: "BTCUSDT",
      side: "LONG",
      signalType: "trend_long",
      entryReason: "unowned",
      score: 1,
      entryPrice: 100,
      stopLoss: 99,
      takeProfit: 101,
      leverage: 2,
      quantity: 1,
      margin: 50,
      strategyName: "integrity-safe",
      paramsHash: "integrity",
    });
    recordPaperExit("BTCUSDT", 101, "익절");
    expect(getPaperSession(owned.session.id)?.tradeCount).toBe(0);

    stopPaperSession(owned.session.id);
    closeSafeOwned({
      sessionId: owned.session.id,
      strategyId: owned.copy.id,
      symbol: "ETHUSDT",
      entryPrice: 100,
      exitPrice: 101,
      exitReason: "익절",
    });
    expect(getPaperSession(owned.session.id)?.tradeCount).toBe(0);

    const active = prepareSafeBtcSession();
    expect(
      applySafePaperSessionCloseAccounting({
        paperSessionId: owned.session.id,
        closeId: "close-wrong",
        realizedNetUsdt: 12,
      }),
    ).toBeNull();
    expect(getPaperSession(owned.session.id)?.tradeCount).toBe(0);
    expect(getPaperSession(active.session.id)?.tradeCount).toBe(0);
  });

  it("18: Event-Sequence session accounting path remains applyActivePaperSessionRealizedPnl", async () => {
    isolate();
    const session = prepareIsolatedActiveSession();
    const opened = openCanonical({ strategyId: session.strategyId });
    const closeCandle = tpBar(opened.candles, opened.es.targetPrice ?? 110);
    await manageEventSequencePaperPositions({
      candlesBySymbol: { BTCUSDT: [...opened.candles, closeCandle] },
      nowMs: nowAfter([...opened.candles, closeCandle]),
    });
    const after = getPaperSession(session.id)!;
    expect(after.tradeCount).toBe(1);
    expect(after.realizedPnl).not.toBe(0);
  });
});

describe("SESSION STATUS", () => {
  it("23-31: risk halt, emergency, pause, stop, fail, heartbeat, no auto-resume", () => {
    isolate();
    const { session } = prepareSafeBtcSession();
    expect(getExecutablePaperSession()?.id).toBe(session.id);
    expect(paperSessionOperatorView(session).scanning).toBe(true);

    const heartbeatBefore = getPaperSession(session.id)!.heartbeatAt;
    const halted = haltPaperSessionForRisk(session.id, "리스크 한도 위반");
    expect(halted.status).toBe("risk_halted");
    expect(getExecutablePaperSession()).toBeNull();
    const view = paperSessionOperatorView(halted);
    expect(view.scanning).toBe(false);
    expect(view.haltReason).toContain("리스크");
    expect(view.requiresOperatorAction).toBe(true);
    expect(view.resumeRequiresOperator).toBe(true);

    markEmergencyStop("리스크 한도 위반");
    expect(getRuntimeState().emergencyStopped).toBe(true);
    expect(getRuntimeState().running).toBe(false);

    touchPaperSessionHeartbeat(session.id);
    expect(getPaperSession(session.id)?.heartbeatAt).toBe(heartbeatBefore);
    expect(getPaperSession(session.id)?.status).toBe("risk_halted");

    const recovered = recoverPaperSessionsAfterRestart({ manageExecutor: false });
    expect(getPaperSession(session.id)?.status).toBe("risk_halted");
    expect(recovered.notes.some((n) => n.includes("risk_halted"))).toBe(true);

    const official = haltPaperSessionForRiskService({
      sessionId: session.id,
      lastError: "리스크 한도 위반",
    });
    expect(official.status).toBe("risk_halted");

    const paused = activatePaperSession(
      preparePaperSession({
        strategyId: getStrategyById(session.strategyId)!.id,
        requireApproval: false,
      }).id,
    );
    const afterPause = pausePaperSession(paused.id);
    expect(afterPause.status).toBe("paused");
    expect(paperSessionOperatorView(afterPause).scanning).toBe(false);

    const stopped = activatePaperSession(
      preparePaperSession({
        strategyId: session.strategyId,
        requireApproval: false,
      }).id,
    );
    expect(stopPaperSession(stopped.id).status).toBe("stopped");

    const failed = activatePaperSession(
      preparePaperSession({
        strategyId: session.strategyId,
        requireApproval: false,
      }).id,
    );
    expect(failPaperSession(failed.id, "engine boom").status).toBe("failed");
  });
});

describe("RISK AUTHORITY", () => {
  it("32-37: Paper overlay 6, persist/start Live 3, Live unchanged", () => {
    isolate();
    expect(PAPER_MAX_CONSECUTIVE_LOSSES).toBe(6);
    expect(getConfig().risk.consecutiveLossLimit).toBe(3);
    const reset = resetPaperRiskStateForNewSession();
    expect(reset.settings.consecutiveLossLimit).toBe(6);
    expect(loadRiskState().settings.consecutiveLossLimit).toBe(3);
    expect(loadPaperRiskState().settings.consecutiveLossLimit).toBe(6);
    const live = loadRiskState();
    expect(applyPaperRiskDefaults(live).settings.consecutiveLossLimit).toBe(6);
    expect(live.settings.consecutiveLossLimit).toBe(3);
    const view = getUnifiedRiskView();
    if (getRuntimeState().mode === "PAPER") {
      expect(view.consecutiveLossLimit).toBe(6);
    } else {
      expect(view.consecutiveLossLimit).toBe(3);
    }
  });
});

describe("SAFETY", () => {
  it("38-46: SAFE file, Live, production hashes, no production Paper start", () => {
    isolate();
    const safePath = path.join(process.cwd(), "data/strategies/SAFE_v44_i4060.json");
    expect(fs.existsSync(safePath)).toBe(true);
    expect(productionRecordHashes().safeSha256).toBe(hashesBefore.safeSha256);
    expect(getRuntimeState().mode).not.toBe("LIVE");
    expect(buildUnifiedTradeResult).toBeTypeOf("function");
  });
});

describe("isolated SAFE Paper two-trade + risk-halt fixture", () => {
  it("BTCUSDT-only session: two SAFE closes, capital, then risk halt", async () => {
    isolate();
    const { copy, session } = prepareSafeBtcSession("BTCUSDT");
    scannedSymbols.length = 0;
    await runSafePaperScanLoop({ maxSymbols: 40 });
    expect([...new Set(scannedSymbols)]).toEqual(["BTCUSDT"]);

    const t1 = closeSafeOwned({
      sessionId: session.id,
      strategyId: copy.id,
      symbol: "BTCUSDT",
      entryPrice: 50_000,
      exitPrice: 50_100,
      quantity: 0.01,
      exitReason: "익절",
    });
    const t2 = closeSafeOwned({
      sessionId: session.id,
      strategyId: copy.id,
      symbol: "BTCUSDT",
      entryPrice: 50_000,
      exitPrice: 49_900,
      quantity: 0.01,
      exitReason: "손절",
    });
    const after = getPaperSession(session.id)!;
    expect(after.tradeCount).toBe(2);
    expect(after.realizedPnl).toBeCloseTo(
      t1.unified.realizedUsdt + t2.unified.realizedUsdt,
      8,
    );
    expect(paperSessionCapitalUsdt(after)).toBeCloseTo(
      after.virtualBalance + after.realizedPnl,
      8,
    );

    const halted = haltPaperSessionForRisk(session.id, "리스크 한도 위반");
    expect(halted.status).toBe("risk_halted");
    expect(paperSessionOperatorView(halted).scanning).toBe(false);
    expect(getExecutablePaperSession()).toBeNull();
    expect(getRuntimeState().running).toBe(false);
  });
});
