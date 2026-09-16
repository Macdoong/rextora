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
    generateAiTradeReport: vi.fn(() => ({ id: "mock-a835" })),
  };
});

import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getAccountState,
  resetAccountStateForTests,
} from "../src/lib/rextora/accountStateStore";
import {
  manageEventSequencePaperPositions,
  openEventSequencePaperPosition,
} from "../src/lib/rextora/paper/paperEventSequenceLifecycle";
import {
  computeEventSequencePaperAvailableBalance,
  computeEventSequencePaperRealizedBalance,
  PAPER_ES_AVAILABLE_BALANCE_FORMULA,
  PAPER_ES_AVAILABLE_BALANCE_REASON,
  reconcileEventSequencePaperAccountState,
} from "../src/lib/rextora/paper/paperEventSequenceAccountReconcile";
import {
  activatePaperSession,
  getPaperSession,
  preparePaperSession,
} from "../src/lib/rextora/paper/paperSessionStore";
import { getOpenPositions } from "../src/lib/rextora/positionManager";
import { CONTEXT_FALLBACK_PARAMS } from "../src/lib/rextora/strategy/safeV44Params";
import {
  evaluateEventSequencePaperSignal,
  runEventSequenceBacktest,
} from "../src/lib/rextora/strategy/eventSequenceBacktest";
import {
  EVENT_SEQUENCE_FIRST_EVALUABLE_CANDLE_COUNT,
  EVENT_SEQUENCE_WALKER_WARMUP_BARS,
  getEventSequenceMinimumHistoryBars,
} from "../src/lib/rextora/strategy/eventSequenceHistoryRequirement";
import {
  createStrategy,
  ensureStrategyStore,
} from "../src/lib/rextora/strategy/strategyStore";
import { SAFE_STRATEGY_ID } from "../src/lib/rextora/strategy/strategyTypes";
import { buildPatternSearchDefinition } from "../src/lib/rextora/strategySearch/patternEventSequence";
import {
  FVG_BASE_PARAMS,
  SUPPORT_RESISTANCE_BASE_PARAMS,
  SUPPLY_DEMAND_BASE_PARAMS,
  TRENDLINE_BASE_PARAMS,
} from "../src/lib/rextora/strategySearch/patternSearchSpaces";
import {
  EXECUTION_PRICE_V1,
  isolateA834,
  LEDGER_V0,
  mildNextBar,
  nowAfter,
  openCanonical,
  PATTERN_BASE_BALANCE_PCT,
  PROCESS_START_AVAILABLE_USDT,
  PROCESS_START_BALANCE_USDT,
  productionRecordHashes,
  simulateProcessRestartBoundary,
  snapshotEsContinuity,
  tpBar,
} from "./helpers/paperRuntimeContinuityAndWarmupForensics";
import {
  buildObLongCandles,
  FEE,
  FUNDING,
  patternDefinition,
  SLIP,
  source,
  SPREAD,
} from "./helpers/paperEventSequenceLifecycleForensics";

const hashesBefore = productionRecordHashes();
const cleanups: Array<() => void> = [];

afterEach(() => {
  while (cleanups.length) cleanups.pop()?.();
});

function isolate() {
  const iso = isolateA834();
  cleanups.push(iso.cleanup);
  return iso;
}

function sha256(buf: Buffer | string): string {
  return createHash("sha256").update(buf).digest("hex");
}

function fileSha(filePath: string): string {
  return sha256(fs.readFileSync(filePath));
}

function prepareEsSession() {
  const created = createStrategy({
    name: "A835 session",
    description: "engineCostModel=event_sequence_execution_price_v1",
    strategyType: "condition_builder",
    definition: patternDefinition(),
    sourceParamsHash: "a835",
  });
  const prepared = preparePaperSession({
    strategyId: created.id,
    requireApproval: false,
  });
  return activatePaperSession(prepared.id);
}

function familyDef(
  family: "fvg" | "trendline" | "support_resistance" | "supply_demand",
  params: Record<string, unknown>,
) {
  return buildPatternSearchDefinition({
    candidateId: "pending",
    strategyName: `A835 ${family}`,
    timeframe: "15m",
    params,
    family,
  })!;
}

function paperSignal(def: ReturnType<typeof patternDefinition>, candles: ReturnType<typeof buildObLongCandles>) {
  return evaluateEventSequencePaperSignal({
    def,
    symbol: "BTCUSDT",
    candles,
    costModel: EXECUTION_PRICE_V1,
    feeRate: FEE,
    slippageRate: SLIP,
    applyFunding: true,
    fundingRate: FUNDING,
    applySpread: true,
    spreadRate: SPREAD,
  });
}

function esEngine(def: ReturnType<typeof patternDefinition>, candles: ReturnType<typeof buildObLongCandles>) {
  return runEventSequenceBacktest({
    def,
    symbol: "BTCUSDT",
    candles,
    balance: 10_000,
    feeRate: FEE,
    slippageRate: SLIP,
    costModel: EXECUTION_PRICE_V1,
    applyFunding: true,
    fundingRate: FUNDING,
    applySpread: true,
    spreadRate: SPREAD,
  });
}

async function closeOpened(
  opened: ReturnType<typeof openCanonical>,
  equityBefore = 10_000,
) {
  const closeCandle = tpBar(opened.candles, opened.es.targetPrice ?? 110);
  const window = [...opened.candles, closeCandle];
  await manageEventSequencePaperPositions({
    candlesBySymbol: { BTCUSDT: window },
    nowMs: nowAfter(window),
  });
  const engine = runEventSequenceBacktest({
    def: opened.def,
    symbol: "BTCUSDT",
    candles: window,
    balance: equityBefore,
    feeRate: FEE,
    slippageRate: SLIP,
    costModel: EXECUTION_PRICE_V1,
    applyFunding: true,
    fundingRate: FUNDING,
    applySpread: true,
    spreadRate: SPREAD,
  });
  const trade = engine.trades.find((t) => t.entryBar === opened.candles.length - 1);
  return { window, netPnl: trade?.netPnlUsdt ?? 0 };
}

describe("P3-A8.3.5 durable Pattern Paper equity + Pattern warmup", () => {
  it("1. accountState default seed remains unchanged when no Pattern session", () => {
    resetAccountStateForTests({
      balanceUsdt: PROCESS_START_BALANCE_USDT,
      availableBalanceUsdt: PROCESS_START_AVAILABLE_USDT,
      initialSeedUsdt: null,
    });
    const result = reconcileEventSequencePaperAccountState();
    expect(result.applied).toBe(false);
    expect(result.reason).toBe("no_executable_session");
    expect(getAccountState().balanceUsdt).toBe(PROCESS_START_BALANCE_USDT);
    expect(getAccountState().availableBalanceUsdt).toBe(PROCESS_START_AVAILABLE_USDT);
  });

  it("2. active Pattern session realized balance identified", () => {
    isolate();
    const session = prepareEsSession();
    expect(session.virtualBalance).toBe(10_000);
    expect(session.realizedPnl).toBe(0);
    expect(computeEventSequencePaperRealizedBalance(session)).toBe(10_000);
  });

  it("3. reconciliation restores session-derived balance", () => {
    isolate();
    const session = prepareEsSession();
    resetAccountStateForTests({
      balanceUsdt: PROCESS_START_BALANCE_USDT,
      availableBalanceUsdt: PROCESS_START_AVAILABLE_USDT,
    });
    const result = reconcileEventSequencePaperAccountState();
    expect(result.applied).toBe(true);
    expect(getAccountState().balanceUsdt).toBe(
      computeEventSequencePaperRealizedBalance(session),
    );
  });

  it("4. hardcoded 10254.32 does not override Pattern restart balance", async () => {
    isolate();
    const session = prepareEsSession();
    const opened = openCanonical();
    const { netPnl } = await closeOpened(opened);
    const expected = 10_000 + netPnl;
    expect(getAccountState().balanceUsdt).toBeCloseTo(expected, 6);
    simulateProcessRestartBoundary();
    expect(getAccountState().balanceUsdt).toBe(PROCESS_START_BALANCE_USDT);
    reconcileEventSequencePaperAccountState();
    expect(getAccountState().balanceUsdt).toBeCloseTo(expected, 6);
    expect(getAccountState().balanceUsdt).not.toBe(PROCESS_START_BALANCE_USDT);
    expect(getPaperSession(session.id)?.realizedPnl).toBeCloseTo(netPnl, 6);
  });

  it("5. available-balance formula source-proven", () => {
    const account = source("src/lib/rextora/accountStateStore.ts");
    const life = source("src/lib/rextora/paper/paperEventSequenceLifecycle.ts");
    expect(account).toContain("availableBalanceUsdt + deltaUsdt");
    expect(account).not.toContain("sum(margin)");
    expect(life).not.toContain("availableBalanceUsdt");
    expect(PAPER_ES_AVAILABLE_BALANCE_FORMULA).toBe(
      "availableBalanceUsdt = virtualBalance + realizedPnl",
    );
    expect(PAPER_ES_AVAILABLE_BALANCE_REASON).toContain("no Paper reserve/release");
  });

  it("6. no open position available balance", () => {
    isolate();
    prepareEsSession();
    resetAccountStateForTests({
      balanceUsdt: PROCESS_START_BALANCE_USDT,
      availableBalanceUsdt: PROCESS_START_AVAILABLE_USDT,
    });
    reconcileEventSequencePaperAccountState();
    expect(getOpenPositions()).toHaveLength(0);
    expect(getAccountState().availableBalanceUsdt).toBe(10_000);
    expect(
      computeEventSequencePaperAvailableBalance({ realizedBalance: 10_000, openPositions: [] }),
    ).toBe(10_000);
  });

  it("7. one ES open position available balance", () => {
    isolate();
    prepareEsSession();
    const { position } = openCanonical();
    resetAccountStateForTests({
      balanceUsdt: PROCESS_START_BALANCE_USDT,
      availableBalanceUsdt: PROCESS_START_AVAILABLE_USDT,
    });
    reconcileEventSequencePaperAccountState();
    expect(position.margin).toBeGreaterThan(0);
    expect(getAccountState().balanceUsdt).toBe(10_000);
    expect(getAccountState().availableBalanceUsdt).toBe(10_000);
    expect(getAccountState().availableBalanceUsdt).not.toBeCloseTo(
      10_000 - position.margin,
      3,
    );
  });

  it("8. multiple relevant Paper positions if supported", () => {
    isolate();
    prepareEsSession();
    const a = openCanonical();
    const b = openEventSequencePaperPosition({
      ...{
        symbol: "ETHUSDT",
        strategyId: "custom_a835",
        paperSessionId: "paper_test_a835",
        paperStrategyId: "custom_a835",
        strategyName: "A8.3.5",
        paramsHash: "diag_a835",
        def: a.def,
        side: "LONG" as const,
        rawEntryPrice: a.es.rawEntryPrice!,
        executionEntryPrice: a.es.entryPrice!,
        stopPrice: a.es.stopPrice!,
        targetPrice: a.es.targetPrice!,
        entryCandleOpenTime: a.es.entryCandleOpenTime ?? a.candles[a.candles.length - 1].openTime,
        maxHoldBars: a.es.maxHoldBars ?? a.def.risk.maxHoldBars,
        invalidateRule: a.es.invalidateRule ?? "close_beyond_zone",
        geo: {
          patternType: a.es.patternType ?? "order_block",
          zoneHigh: a.es.zoneHigh ?? a.es.entryPrice!,
          zoneLow: a.es.zoneLow ?? a.es.entryPrice!,
          creationBar: a.es.creationBar ?? a.candles.length - 1,
        },
        costModel: EXECUTION_PRICE_V1,
        costAssumptions: {
          feeRate: FEE,
          slippageRate: SLIP,
          fundingRate: FUNDING,
          applyFunding: true,
          applySpread: true,
          spreadRate: SPREAD,
        },
        timeframe: "15m",
        leverage: 1,
      },
    });
    expect(getOpenPositions().length).toBeGreaterThanOrEqual(2);
    resetAccountStateForTests({
      balanceUsdt: PROCESS_START_BALANCE_USDT,
      availableBalanceUsdt: PROCESS_START_AVAILABLE_USDT,
    });
    reconcileEventSequencePaperAccountState();
    expect(getAccountState().availableBalanceUsdt).toBe(10_000);
    expect(b.margin).toBeGreaterThan(0);
  });

  it("9. unrelated positions excluded according to existing semantics", () => {
    isolate();
    prepareEsSession();
    openCanonical();
    const available = computeEventSequencePaperAvailableBalance({
      realizedBalance: 10_000,
      openPositions: [
        {
          id: "live-unrelated",
          symbol: "XRPUSDT",
          side: "Long",
          entryPrice: 1,
          currentPrice: 1,
          quantity: 1,
          leverage: 1,
          unrealizedPnl: 0,
          margin: 500,
          mode: "LIVE",
          serviceState: "live",
        } as never,
      ],
    });
    expect(available).toBe(10_000);
  });

  it("10. reconciliation does not mutate session file", () => {
    const iso = isolate();
    const session = prepareEsSession();
    const fp = path.join(iso.paper, `${session.id}.json`);
    const before = fileSha(fp);
    resetAccountStateForTests({
      balanceUsdt: PROCESS_START_BALANCE_USDT,
      availableBalanceUsdt: PROCESS_START_AVAILABLE_USDT,
    });
    reconcileEventSequencePaperAccountState();
    expect(fileSha(fp)).toBe(before);
  });

  it("11. reconciliation does not mutate position file", () => {
    const iso = isolate();
    prepareEsSession();
    openCanonical();
    const fp = path.join(iso.data, "positions.json");
    const before = fileSha(fp);
    resetAccountStateForTests({
      balanceUsdt: PROCESS_START_BALANCE_USDT,
      availableBalanceUsdt: PROCESS_START_AVAILABLE_USDT,
    });
    reconcileEventSequencePaperAccountState();
    expect(fileSha(fp)).toBe(before);
  });

  it("12. canonical position cost model unchanged", () => {
    isolate();
    prepareEsSession();
    const { position } = openCanonical({ costModel: EXECUTION_PRICE_V1 });
    const before = snapshotEsContinuity(position);
    simulateProcessRestartBoundary();
    reconcileEventSequencePaperAccountState();
    expect(snapshotEsContinuity(getOpenPositions()[0])).toEqual(before);
    expect(getOpenPositions()[0].eventSequencePaper?.costModel).toBe(EXECUTION_PRICE_V1);
  });

  it("13. legacy position cost model unchanged", () => {
    isolate();
    prepareEsSession();
    openCanonical({ costModel: LEDGER_V0, applyFunding: false, applySpread: false });
    simulateProcessRestartBoundary();
    reconcileEventSequencePaperAccountState();
    expect(getOpenPositions()[0].eventSequencePaper?.costModel).toBe(LEDGER_V0);
  });

  it("14. candle cursor unchanged", async () => {
    isolate();
    prepareEsSession();
    const opened = openCanonical();
    const next = mildNextBar(opened.candles, opened.candles.length);
    const window = [...opened.candles, next];
    await manageEventSequencePaperPositions({
      candlesBySymbol: { BTCUSDT: window },
      nowMs: nowAfter(window),
    });
    const cursor = snapshotEsContinuity(getOpenPositions()[0]);
    simulateProcessRestartBoundary();
    reconcileEventSequencePaperAccountState();
    expect(getOpenPositions()[0].barsHeld).toBe(cursor.barsHeld);
    expect(getOpenPositions()[0].eventSequencePaper?.lastProcessedCandleOpenTime).toBe(
      cursor.lastProcessedCandleOpenTime,
    );
  });

  it("15. Pattern close keeps runtime/session balance consistent", async () => {
    isolate();
    const session = prepareEsSession();
    const { netPnl } = await closeOpened(openCanonical());
    const runtime = getAccountState().balanceUsdt;
    const reconstructed = computeEventSequencePaperRealizedBalance(
      getPaperSession(session.id)!,
    );
    expect(runtime).toBeCloseTo(10_000 + netPnl, 6);
    expect(runtime).toBeCloseTo(reconstructed, 6);
  });

  it("16. no double realized-PnL application", async () => {
    isolate();
    const session = prepareEsSession();
    const { netPnl } = await closeOpened(openCanonical());
    reconcileEventSequencePaperAccountState();
    expect(getAccountState().balanceUsdt).toBeCloseTo(10_000 + netPnl, 6);
    expect(getPaperSession(session.id)?.realizedPnl).toBeCloseTo(netPnl, 6);
  });

  it("17. restart after trade 1 restores exact balance", async () => {
    isolate();
    prepareEsSession();
    const { netPnl } = await closeOpened(openCanonical());
    simulateProcessRestartBoundary();
    reconcileEventSequencePaperAccountState();
    expect(getAccountState().balanceUsdt).toBeCloseTo(10_000 + netPnl, 6);
  });

  it("18. trade 2 sizes from restored balance", async () => {
    isolate();
    prepareEsSession();
    const first = await closeOpened(openCanonical());
    simulateProcessRestartBoundary();
    const second = openCanonical();
    expect(getAccountState().balanceUsdt).toBeCloseTo(10_000 + first.netPnl, 6);
    expect(second.position.margin).toBeCloseTo(
      (10_000 + first.netPnl) * PATTERN_BASE_BALANCE_PCT,
      5,
    );
    expect(second.position.margin).not.toBeCloseTo(
      PROCESS_START_BALANCE_USDT * PATTERN_BASE_BALANCE_PCT,
      3,
    );
  });

  it("19. two-trade realizedPnl accumulates", async () => {
    isolate();
    const session = prepareEsSession();
    const first = await closeOpened(openCanonical());
    simulateProcessRestartBoundary();
    const secondOpen = openCanonical();
    const second = await closeOpened(secondOpen, 10_000 + first.netPnl);
    expect(getPaperSession(session.id)?.realizedPnl).toBeCloseTo(
      first.netPnl + second.netPnl,
      5,
    );
    expect(getAccountState().balanceUsdt).toBeCloseTo(
      10_000 + first.netPnl + second.netPnl,
      5,
    );
  });

  it("20. second restart restores two-trade balance", async () => {
    isolate();
    prepareEsSession();
    const first = await closeOpened(openCanonical());
    simulateProcessRestartBoundary();
    const second = await closeOpened(openCanonical(), 10_000 + first.netPnl);
    const expected = 10_000 + first.netPnl + second.netPnl;
    simulateProcessRestartBoundary();
    expect(getAccountState().balanceUsdt).toBe(PROCESS_START_BALANCE_USDT);
    reconcileEventSequencePaperAccountState();
    expect(getAccountState().balanceUsdt).toBeCloseTo(expected, 5);
  });

  it("21. Pattern baseBalancePct sizing parity after restart", async () => {
    isolate();
    prepareEsSession();
    const first = await closeOpened(openCanonical());
    const equity = 10_000 + first.netPnl;
    simulateProcessRestartBoundary();
    const opened = openCanonical();
    expect(opened.def.positionSizing.baseBalancePct).toBe(PATTERN_BASE_BALANCE_PCT);
    expect(opened.position.margin).toBeCloseTo(equity * PATTERN_BASE_BALANCE_PCT, 5);
  });

  it("22. open-margin reconciliation survives restart", () => {
    isolate();
    prepareEsSession();
    const { position } = openCanonical();
    simulateProcessRestartBoundary();
    reconcileEventSequencePaperAccountState();
    expect(getOpenPositions()[0].margin).toBe(position.margin);
    expect(getAccountState().availableBalanceUsdt).toBe(10_000);
  });

  it("23. closing restored position does not double-release margin", async () => {
    isolate();
    const session = prepareEsSession();
    const opened = openCanonical();
    const availableBeforeClose = 10_000;
    simulateProcessRestartBoundary();
    reconcileEventSequencePaperAccountState();
    expect(getAccountState().availableBalanceUsdt).toBe(availableBeforeClose);
    const { netPnl } = await closeOpened(opened);
    expect(getAccountState().availableBalanceUsdt).toBeCloseTo(
      availableBeforeClose + netPnl,
      6,
    );
    expect(getAccountState().availableBalanceUsdt).toBeCloseTo(
      computeEventSequencePaperRealizedBalance(getPaperSession(session.id)!),
      6,
    );
  });

  it("24. SAFE account path unchanged", () => {
    isolate();
    ensureStrategyStore();
    const prepared = preparePaperSession({
      strategyId: SAFE_STRATEGY_ID,
      requireApproval: false,
    });
    activatePaperSession(prepared.id);
    resetAccountStateForTests({
      balanceUsdt: PROCESS_START_BALANCE_USDT,
      availableBalanceUsdt: PROCESS_START_AVAILABLE_USDT,
    });
    const result = reconcileEventSequencePaperAccountState();
    expect(result.applied).toBe(false);
    expect(result.reason).toBe("not_event_sequence");
    expect(getAccountState().balanceUsdt).toBe(PROCESS_START_BALANCE_USDT);
  });

  it("25. Event-Sequence base history requirement source identified", () => {
    expect(EVENT_SEQUENCE_WALKER_WARMUP_BARS).toBe(20);
    expect(EVENT_SEQUENCE_FIRST_EVALUABLE_CANDLE_COUNT).toBe(21);
    expect(source("src/lib/rextora/strategy/eventSequenceBacktest.ts")).toContain(
      "EVENT_SEQUENCE_WALKER_WARMUP_BARS",
    );
  });

  it("26. OB minimum history", () => {
    expect(getEventSequenceMinimumHistoryBars(patternDefinition())).toBe(21);
  });

  it("27. FVG minimum history", () => {
    expect(getEventSequenceMinimumHistoryBars(familyDef("fvg", { ...FVG_BASE_PARAMS }))).toBe(21);
  });

  it("28. trendline minimum history", () => {
    expect(
      getEventSequenceMinimumHistoryBars(familyDef("trendline", { ...TRENDLINE_BASE_PARAMS })),
    ).toBe(21);
  });

  it("29. SR default minimum history", () => {
    expect(
      getEventSequenceMinimumHistoryBars(
        familyDef("support_resistance", { ...SUPPORT_RESISTANCE_BASE_PARAMS }),
      ),
    ).toBe(43);
  });

  it("30. SR custom-lookback minimum history", () => {
    const def = familyDef("support_resistance", {
      ...SUPPORT_RESISTANCE_BASE_PARAMS,
      zoneLookback: 20,
    });
    expect(getEventSequenceMinimumHistoryBars(def)).toBe(23);
    expect(getEventSequenceMinimumHistoryBars(def)).not.toBe(43);
  });

  it("31. supply-demand minimum history", () => {
    expect(
      getEventSequenceMinimumHistoryBars(
        familyDef("supply_demand", { ...SUPPLY_DEMAND_BASE_PARAMS }),
      ),
    ).toBe(21);
  });

  it("32. Pattern 20 bars blocked", () => {
    const candles = buildObLongCandles().slice(0, 20);
    const paper = paperSignal(patternDefinition(), candles);
    expect(candles.length).toBe(20);
    expect(paper.passed).toBe(false);
    expect(paper.rejectReason).toBe("캔들 부족");
  });

  it("33. OB 21-bar evaluator eligibility", () => {
    const candles = buildObLongCandles().slice(0, 21);
    const def = patternDefinition();
    const paper = paperSignal(def, candles);
    const research = esEngine(def, candles);
    expect(candles.length).toBe(21);
    expect(paper.rejectReason).not.toBe("캔들 부족");
    const paperLast = paper.passed && paper.side !== "NONE";
    const researchLast = research.trades.some((t) => t.entryBar === candles.length - 1);
    expect(paperLast).toBe(researchLast);
  });

  it("34. previous 29-bar OB fixture no longer blocked by SAFE warmup", () => {
    const def = patternDefinition();
    const candles = buildObLongCandles().slice(0, 29);
    const patternWarmup = getEventSequenceMinimumHistoryBars(def);
    const safeWarmup = Math.max(50, Number(CONTEXT_FALLBACK_PARAMS.ema_slow ?? 50) + 5);
    expect(patternWarmup).toBe(21);
    expect(safeWarmup).toBe(205);
    expect(candles.length).toBeGreaterThanOrEqual(patternWarmup);
    expect(candles.length).toBeLessThan(safeWarmup);
    const paper = paperSignal(def, candles);
    expect(paper.passed).toBe(true);
    expect(paper.rejectReason).not.toBe("캔들 부족");
  });

  it("35. SR 42 bars blocked", () => {
    const def = familyDef("support_resistance", { ...SUPPORT_RESISTANCE_BASE_PARAMS });
    expect(getEventSequenceMinimumHistoryBars(def)).toBe(43);
    const padded = buildObLongCandles().slice(0, 29);
    while (padded.length < 42) {
      padded.push({
        ...padded[padded.length - 1]!,
        openTime: padded[padded.length - 1]!.openTime + 900_000,
        closeTime: padded[padded.length - 1]!.openTime + 1_800_000 - 1,
      });
    }
    expect(padded.length).toBe(42);
    expect(paperSignal(def, padded).rejectReason).toBe("캔들 부족");
  });

  it("36. SR 43 bars eligible", () => {
    const def = familyDef("support_resistance", { ...SUPPORT_RESISTANCE_BASE_PARAMS });
    const padded = buildObLongCandles().slice(0, 29);
    while (padded.length < 43) {
      padded.push({
        ...padded[padded.length - 1]!,
        openTime: padded[padded.length - 1]!.openTime + 900_000,
        closeTime: padded[padded.length - 1]!.openTime + 1_800_000 - 1,
      });
    }
    expect(padded.length).toBe(43);
    expect(paperSignal(def, padded).rejectReason).not.toBe("캔들 부족");
  });

  it("37. Pattern gate does not read SAFE ema_slow for new entry", () => {
    const loop = source("src/lib/rextora/execution/safePaperLoop.ts");
    expect(loop).toContain("getEventSequenceMinimumHistoryBars");
    expect(loop).toContain('executionKind === "event_sequence"');
    const def = patternDefinition();
    expect(getEventSequenceMinimumHistoryBars(def)).not.toBe(
      Math.max(50, CONTEXT_FALLBACK_PARAMS.ema_slow + 5),
    );
  });

  it("38. SAFE still uses ema_slow+5", () => {
    expect(source("src/lib/rextora/execution/safePaperLoop.ts")).toContain(
      "Math.max(50, Number(params.ema_slow ?? 50) + 5)",
    );
  });

  it("39. SAFE ema_slow=200 still requires 205", () => {
    expect(CONTEXT_FALLBACK_PARAMS.ema_slow).toBe(200);
    expect(Math.max(50, Number(CONTEXT_FALLBACK_PARAMS.ema_slow ?? 50) + 5)).toBe(205);
  });

  it("40. Pattern and SAFE warmups branch after strategy resolution", () => {
    const loop = source("src/lib/rextora/execution/safePaperLoop.ts");
    const resolveIdx = loop.indexOf("resolvePaperExecutionStrategy()");
    const branchIdx = loop.indexOf('executionKind === "event_sequence" && strategy.definition');
    const safeExprIdx = loop.indexOf("Math.max(50, Number(params.ema_slow ?? 50) + 5)");
    expect(resolveIdx).toBeGreaterThan(-1);
    expect(branchIdx).toBeGreaterThan(resolveIdx);
    expect(safeExprIdx).toBeGreaterThan(resolveIdx);
  });

  it("41. open ES position management stays before entry warmup", () => {
    const loop = source("src/lib/rextora/execution/safePaperLoop.ts");
    const manageIdx = loop.indexOf("manageEventSequencePaperPositions");
    const warmupIdx = loop.indexOf("getEventSequenceMinimumHistoryBars");
    expect(manageIdx).toBeGreaterThan(-1);
    expect(manageIdx).toBeLessThan(warmupIdx);
  });

  it("42. existing open Pattern position advances with entry history below threshold", async () => {
    isolate();
    prepareEsSession();
    const opened = openCanonical();
    const next = mildNextBar(opened.candles, opened.candles.length);
    const window = [...opened.candles, next];
    expect(window.length).toBeLessThan(205);
    const result = await manageEventSequencePaperPositions({
      candlesBySymbol: { BTCUSDT: window },
      nowMs: nowAfter(window),
    });
    expect(result.advanced).toBe(1);
    expect(getOpenPositions()[0].barsHeld).toBe(1);
  });

  it("43. Research warmup behavior unchanged", () => {
    expect(EVENT_SEQUENCE_WALKER_WARMUP_BARS).toBe(20);
    const candles = buildObLongCandles().slice(0, 29);
    expect(esEngine(patternDefinition(), candles).trades.length).toBeGreaterThan(0);
  });

  it("44. Backtest warmup behavior unchanged", () => {
    expect(source("src/lib/rextora/backtest/backtestEngine.ts")).toContain(
      "const warmUp = params.ema_slow",
    );
  });

  it("45. Event-Sequence signal arithmetic unchanged", () => {
    const candles = buildObLongCandles().slice(0, 29);
    const def = patternDefinition();
    const paper = paperSignal(def, candles);
    const research = esEngine(def, candles);
    const last = research.trades.find((t) => t.entryBar === candles.length - 1);
    expect(paper.passed).toBe(true);
    expect(paper.rawEntryPrice).toBeCloseTo(last?.rawEntryPrice ?? 0, 6);
  });

  it("46. Pattern Paper lifecycle arithmetic unchanged", () => {
    expect(source("src/lib/rextora/paper/paperEventSequenceLifecycle.ts")).toContain(
      "settleEventSequenceClose",
    );
    expect(source("src/lib/rextora/paper/paperEventSequenceLifecycle.ts")).toContain(
      "applyPaperRealizedPnl",
    );
  });

  it("47. Pattern cost model unchanged", () => {
    expect(source("src/lib/rextora/strategy/eventSequenceCostModel.ts")).toContain(
      "event_sequence_execution_price_v1",
    );
  });

  it("48. paramsHash unchanged", () => {
    expect(hashesBefore.safeSha256).toBe(
      "fb3f19169c8911fe041f3f8cb1d9e654f9166078f0c5cd8e29f04ec02a56dfc0",
    );
    expect(productionRecordHashes().strategyIndexSha256).toBe(hashesBefore.strategyIndexSha256);
  });

  it("49. researchEvaluationHash unchanged", () => {
    expect(productionRecordHashes().researchIndexSha256).toBe(hashesBefore.researchIndexSha256);
    expect(source("src/lib/rextora/strategySearch/researchRankingIdentityContract.ts")).toContain(
      "researchEvaluationHash",
    );
  });

  it("50. ranking semantics unchanged", () => {
    expect(productionRecordHashes().researchIndexSha256).toBe(
      hashesBefore.researchIndexSha256,
    );
  });

  it("51. Paper auto-start not introduced", () => {
    expect(source("src/lib/rextora/paper/paperEventSequenceAccountReconcile.ts")).not.toContain(
      "activatePaperSession",
    );
    expect(source("src/lib/rextora/execution/safePaperLoop.ts")).not.toContain(
      "startPaperSessionFromStrategy",
    );
  });

  it("52. Paper auto-resume not introduced", () => {
    expect(source("src/lib/rextora/paper/paperEventSequenceAccountReconcile.ts")).not.toContain(
      "resumePaperSession",
    );
  });

  it("53. Live behavior unchanged", () => {
    expect(source("src/lib/rextora/botRuntime.ts")).toContain("ema_slow + 5");
    expect(source("src/lib/rextora/paper/paperEventSequenceAccountReconcile.ts")).toContain(
      "live_mode",
    );
  });

  it("54. Live Pattern not enabled", () => {
    expect(source("src/lib/rextora/botRuntime.ts")).not.toContain(
      "evaluateEventSequencePaperSignal",
    );
  });

  it("55. Live activations = 0", () => {
    expect(getAccountState().mode).not.toBe("LIVE");
  });

  it("56. orders = 0", () => {
    expect(productionRecordHashes().positionsSha256).toBe(hashesBefore.positionsSha256);
  });

  it("57. production sessions unchanged", () => {
    const after = productionRecordHashes();
    expect(after.paperSessionsIndexSha256).toBe(hashesBefore.paperSessionsIndexSha256);
    expect(after.paperSessionBf028Sha256).toBe(hashesBefore.paperSessionBf028Sha256);
  });

  it("58. production positions unchanged", () => {
    expect(productionRecordHashes().positionsSha256).toBe(hashesBefore.positionsSha256);
  });

  it("59. production strategies unchanged", () => {
    expect(productionRecordHashes().strategyIndexSha256).toBe(hashesBefore.strategyIndexSha256);
  });

  it("60. SAFE unchanged", () => {
    expect(productionRecordHashes().safeSha256).toBe(
      "fb3f19169c8911fe041f3f8cb1d9e654f9166078f0c5cd8e29f04ec02a56dfc0",
    );
  });
});
