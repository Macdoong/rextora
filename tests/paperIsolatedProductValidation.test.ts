/**
 * Isolated Pattern Paper product lifecycle — temp stores only.
 * Does not start/resume production Paper or Live.
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
    generateAiTradeReport: vi.fn(() => ({ id: "mock-closeout-paper" })),
  };
});

import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getAccountState,
} from "../src/lib/rextora/accountStateStore";
import {
  manageEventSequencePaperPositions,
} from "../src/lib/rextora/paper/paperEventSequenceLifecycle";
import {
  computeEventSequencePaperRealizedBalance,
  reconcileEventSequencePaperAccountState,
} from "../src/lib/rextora/paper/paperEventSequenceAccountReconcile";
import {
  getPaperSession,
} from "../src/lib/rextora/paper/paperSessionStore";
import { getOpenPositions } from "../src/lib/rextora/positionManager";
import {
  isolateA834,
  nowAfter,
  openCanonical,
  PATTERN_BASE_BALANCE_PCT,
  PROCESS_START_BALANCE_USDT,
  prepareIsolatedActiveSession,
  productionRecordHashes,
  readSessionFromDisk,
  simulateProcessRestartBoundary,
  snapshotEsContinuity,
  tpBar,
} from "./helpers/paperRuntimeContinuityAndWarmupForensics";

const hashesBefore = productionRecordHashes();
const cleanups: Array<() => void> = [];

afterEach(() => {
  while (cleanups.length) cleanups.pop()?.();
  expect(productionRecordHashes()).toEqual(hashesBefore);
});

function isolate() {
  const iso = isolateA834();
  cleanups.push(iso.cleanup);
  return iso;
}

async function closeOpened(
  opened: ReturnType<typeof openCanonical>,
) {
  const closeCandle = tpBar(opened.candles, opened.es.targetPrice ?? 110);
  const window = [...opened.candles, closeCandle];
  await manageEventSequencePaperPositions({
    candlesBySymbol: { BTCUSDT: window },
    nowMs: nowAfter(window),
  });
  return window;
}

describe("isolated Pattern Paper product validation", () => {
  it("A–N: two trades, two restarts, equity/cursor/cost continuity", async () => {
    const iso = isolate();
    const session = prepareIsolatedActiveSession();
    expect(session.status).toBe("active");
    expect(session.exchangeCalled).toBe(false);

    const trade1 = openCanonical({ strategyId: session.strategyId });
    expect(getOpenPositions()).toHaveLength(1);
    await closeOpened(trade1);
    expect(getOpenPositions()).toHaveLength(0);

    const afterTrade1 = getPaperSession(session.id)!;
    const trade1Pnl = afterTrade1.realizedPnl;
    expect(trade1Pnl).not.toBe(0);
    const equity1 = computeEventSequencePaperRealizedBalance(afterTrade1);
    expect(getAccountState().balanceUsdt).toBeCloseTo(equity1, 6);
    expect(afterTrade1.virtualBalance).toBe(10_000);

    simulateProcessRestartBoundary();
    expect(getAccountState().balanceUsdt).toBe(PROCESS_START_BALANCE_USDT);
    const reloaded1 = getPaperSession(session.id)!;
    expect(reloaded1.status).toBe("active");
    expect(reloaded1.realizedPnl).toBeCloseTo(trade1Pnl, 6);
    expect(readSessionFromDisk(iso.paper, session.id).realizedPnl).toBeCloseTo(
      trade1Pnl,
      6,
    );
    reconcileEventSequencePaperAccountState();
    expect(getAccountState().balanceUsdt).toBeCloseTo(equity1, 6);
    expect(getOpenPositions()).toHaveLength(0);

    const trade2 = openCanonical({ strategyId: session.strategyId });
    const expectedMargin = equity1 * PATTERN_BASE_BALANCE_PCT;
    expect(trade2.position.margin).toBeCloseTo(expectedMargin, 5);
    expect(trade2.position.margin).not.toBeCloseTo(10_000 * PATTERN_BASE_BALANCE_PCT, 5);
    const openSnap = snapshotEsContinuity(getOpenPositions()[0]!);
    expect(openSnap.costModel).toBe(trade2.position.eventSequencePaper?.costModel);
    expect(openSnap.lastProcessedCandleOpenTime).toBe(
      trade2.position.eventSequencePaper?.lastProcessedCandleOpenTime,
    );

    simulateProcessRestartBoundary();
    reconcileEventSequencePaperAccountState();
    const restoredOpen = getOpenPositions()[0]!;
    expect(snapshotEsContinuity(restoredOpen)).toEqual(openSnap);
    expect(getAccountState().balanceUsdt).toBeCloseTo(equity1, 6);

    await closeOpened({ ...trade2, candles: trade2.candles });
    expect(getOpenPositions()).toHaveLength(0);
    const afterTrade2 = getPaperSession(session.id)!;
    const equity2 = computeEventSequencePaperRealizedBalance(afterTrade2);
    expect(afterTrade2.realizedPnl).not.toBeCloseTo(trade1Pnl, 6);
    expect(getAccountState().balanceUsdt).toBeCloseTo(equity2, 6);

    simulateProcessRestartBoundary();
    reconcileEventSequencePaperAccountState();
    const afterRestart2 = getPaperSession(session.id)!;
    expect(afterRestart2.realizedPnl).toBeCloseTo(afterTrade2.realizedPnl, 6);
    expect(getAccountState().balanceUsdt).toBeCloseTo(equity2, 6);
    expect(getOpenPositions()).toHaveLength(0);
  });
});
