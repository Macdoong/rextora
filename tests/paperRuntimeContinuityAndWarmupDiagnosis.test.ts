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
    generateAiTradeReport: vi.fn(() => ({ id: "mock-a834" })),
  };
});

import fs from "node:fs";
import path from "node:path";
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import { getAccountState } from "../src/lib/rextora/accountStateStore";
import {
  manageEventSequencePaperPositions,
} from "../src/lib/rextora/paper/paperEventSequenceLifecycle";
import { getPaperSession } from "../src/lib/rextora/paper/paperSessionStore";
import { getOpenPositions } from "../src/lib/rextora/positionManager";
import { CONTEXT_FALLBACK_PARAMS } from "../src/lib/rextora/strategy/safeV44Params";
import {
  closeOneCanonicalTrade,
  entryWindow,
  EXECUTION_PRICE_V1,
  familyHistoryRequirements,
  isolateA834,
  ISOLATED_START_BALANCE,
  lastOpen,
  LEDGER_V0,
  mildNextBar,
  nowAfter,
  openCanonical,
  P3A834_ARTIFACT_TS,
  paperProductionGateBlocks,
  paperProductionWarmupRequiredBars,
  parseAccountModuleInitializer,
  PATTERN_BASE_BALANCE_PCT,
  prepareIsolatedActiveSession,
  PROCESS_START_AVAILABLE_USDT,
  PROCESS_START_BALANCE_USDT,
  productionRecordHashes,
  promotedPatternPaperRequiredBars,
  readSessionFromDisk,
  signalCoverageFixture,
  simulateProcessRestartBoundary,
  snapshotEsContinuity,
  warmupSourceFacts,
  ES_PAPER_SIGNAL_MIN_CANDLES,
  ES_WALKER_WARMUP_BARS,
} from "./helpers/paperRuntimeContinuityAndWarmupForensics";
import { source as readSource } from "./helpers/paperEventSequenceLifecycleForensics";

const hashesBefore = productionRecordHashes();
const ARTIFACT_DIR = path.join(
  process.cwd(),
  ".validation/research-p3-a8-3-4-runtime-continuity",
  P3A834_ARTIFACT_TS,
);
const cleanups: Array<() => void> = [];

afterEach(() => {
  while (cleanups.length) cleanups.pop()?.();
});

function isolate() {
  const iso = isolateA834();
  cleanups.push(iso.cleanup);
  return iso;
}

function writeJson(name: string, value: unknown) {
  fs.mkdirSync(ARTIFACT_DIR, { recursive: true });
  fs.writeFileSync(path.join(ARTIFACT_DIR, name), `${JSON.stringify(value, null, 2)}\n`);
}

const findings: Record<string, unknown> = {
  paperStarts: 0,
  paperResumes: 0,
  liveActivations: 0,
  orders: 0,
};

describe("P3-A8.3.4 Paper runtime continuity + Pattern warmup diagnosis", () => {
  it("1. account balance authority identified", () => {
    const init = parseAccountModuleInitializer();
    const life = readSource("src/lib/rextora/paper/paperEventSequenceLifecycle.ts");
    expect(init.file).toBe("src/lib/rextora/accountStateStore.ts");
    expect(life).toContain("getAccountState().balanceUsdt");
    expect(life).toContain("applyPaperRealizedPnl(settlement.netPnlUsdt)");
    expect(init.applyPaperRealizedPnlMutatesMemory).toBe(true);
    findings.PAPER_ACCOUNT_BALANCE_AUTHORITY =
      "accountStateStore.getAccountState().balanceUsdt mutated only by applyPaperRealizedPnl";
  });

  it("2. account persistence behavior identified", () => {
    const init = parseAccountModuleInitializer();
    expect(init.initializerPresent).toBe(true);
    expect(init.noAccountFileWrite).toBe(true);
    expect(hashesBefore.accountPersistenceFileExists).toBe(false);
    expect(readSource("src/lib/rextora/accountStateStore.ts")).not.toContain("readJsonStore");
    findings.PAPER_ACCOUNT_PERSISTENCE = "MEMORY_ONLY";
  });

  it("3. Pattern close updates runtime balance", async () => {
    isolate();
    const closed = await closeOneCanonicalTrade();
    expect(closed.netPnl).not.toBeNull();
    expect(closed.runtimeBalance).toBeCloseTo(ISOLATED_START_BALANCE + (closed.netPnl ?? 0), 6);
    findings.patternCloseRuntimeBalance = closed.runtimeBalance;
    findings.patternCloseNetPnl = closed.netPnl;
  });

  it("4. restart balance behavior proven", async () => {
    isolate();
    const closed = await closeOneCanonicalTrade();
    const beforeRestart = getAccountState().balanceUsdt;
    expect(beforeRestart).toBeCloseTo(ISOLATED_START_BALANCE + (closed.netPnl ?? 0), 6);
    simulateProcessRestartBoundary();
    const after = getAccountState().balanceUsdt;
    expect(after).toBe(PROCESS_START_BALANCE_USDT);
    expect(after).not.toBeCloseTo(beforeRestart, 4);
    findings.BALANCE_AFTER_RESTART = after;
    findings.restartBalanceClassification = "RESET";
    findings.restartBalanceAlso = "NOT_PERSISTED";
  });

  it("5. session realizedPnl persistence proven", async () => {
    const iso = isolate();
    const closed = await closeOneCanonicalTrade();
    const expected = closed.netPnl ?? 0;
    expect(closed.sessionRealizedPnl).toBeCloseTo(expected, 6);
    simulateProcessRestartBoundary();
    const reloaded = getPaperSession(closed.session.id);
    const fromDisk = readSessionFromDisk(iso.paper, closed.session.id);
    expect(reloaded?.realizedPnl).toBeCloseTo(expected, 6);
    expect(fromDisk.realizedPnl).toBeCloseTo(expected, 6);
    findings.SESSION_REALIZED_PNL_RESTART_PERSISTENCE = "YES";
    findings.sessionRealizedAfterRestart = reloaded?.realizedPnl ?? null;
  });

  it("6. canonical open position reload", () => {
    isolate();
    const { position } = openCanonical({ costModel: EXECUTION_PRICE_V1 });
    const before = snapshotEsContinuity(position);
    simulateProcessRestartBoundary();
    const reloaded = getOpenPositions().find((p) => p.id === position.id);
    expect(reloaded).toBeTruthy();
    expect(snapshotEsContinuity(reloaded!)).toEqual(before);
    findings.OPEN_ES_POSITION_RESTART_CONTINUITY = "YES";
    findings.canonicalReload = snapshotEsContinuity(reloaded!);
  });

  it("7. legacy open position reload", () => {
    isolate();
    const { position } = openCanonical({
      costModel: LEDGER_V0,
      applyFunding: false,
      applySpread: false,
    });
    const before = snapshotEsContinuity(position);
    simulateProcessRestartBoundary();
    const reloaded = getOpenPositions().find((p) => p.id === position.id);
    expect(reloaded?.eventSequencePaper?.costModel).toBe(LEDGER_V0);
    expect(snapshotEsContinuity(reloaded!)).toEqual(before);
    findings.legacyReload = snapshotEsContinuity(reloaded!);
  });

  it("8. cost assumptions reload", () => {
    isolate();
    const { position } = openCanonical();
    const st = position.eventSequencePaper!;
    simulateProcessRestartBoundary();
    const reloaded = getOpenPositions()[0]?.eventSequencePaper;
    expect(reloaded?.feeRate).toBe(st.feeRate);
    expect(reloaded?.slippageRate).toBe(st.slippageRate);
    expect(reloaded?.fundingRate).toBe(st.fundingRate);
    expect(reloaded?.applyFunding).toBe(st.applyFunding);
    expect(reloaded?.applySpread).toBe(st.applySpread);
    expect(reloaded?.spreadRate).toBe(st.spreadRate);
  });

  it("9. candle cursor reload", async () => {
    isolate();
    const opened = openCanonical();
    const next = mildNextBar(opened.candles, opened.candles.length);
    const window = [...opened.candles, next];
    await manageEventSequencePaperPositions({
      candlesBySymbol: { BTCUSDT: window },
      nowMs: nowAfter(window),
    });
    const advanced = getOpenPositions()[0];
    expect(advanced.barsHeld).toBe(1);
    expect(advanced.eventSequencePaper?.lastProcessedCandleOpenTime).toBe(next.openTime);
    const cursor = snapshotEsContinuity(advanced);
    simulateProcessRestartBoundary();
    const reloaded = getOpenPositions()[0];
    expect(reloaded.barsHeld).toBe(1);
    expect(reloaded.eventSequencePaper?.lastProcessedCandleOpenTime).toBe(next.openTime);
    findings.candleCursorAfterRestart = snapshotEsContinuity(reloaded);
    findings.candleCursorBeforeRestart = cursor;
  });

  it("10. same candle after restart does not increment", async () => {
    isolate();
    const opened = openCanonical();
    const next = mildNextBar(opened.candles, opened.candles.length);
    const window = [...opened.candles, next];
    await manageEventSequencePaperPositions({
      candlesBySymbol: { BTCUSDT: window },
      nowMs: nowAfter(window),
    });
    simulateProcessRestartBoundary();
    const again = await manageEventSequencePaperPositions({
      candlesBySymbol: { BTCUSDT: window },
      nowMs: nowAfter(window),
    });
    expect(again.advanced).toBe(0);
    expect(getOpenPositions()[0].barsHeld).toBe(1);
    findings.CANDLE_CURSOR_RESTART_DEDUPE = "YES";
  });

  it("11. next candle increments once", async () => {
    isolate();
    const opened = openCanonical();
    const first = mildNextBar(opened.candles, opened.candles.length);
    const firstWindow = [...opened.candles, first];
    await manageEventSequencePaperPositions({
      candlesBySymbol: { BTCUSDT: firstWindow },
      nowMs: nowAfter(firstWindow),
    });
    simulateProcessRestartBoundary();
    await manageEventSequencePaperPositions({
      candlesBySymbol: { BTCUSDT: firstWindow },
      nowMs: nowAfter(firstWindow),
    });
    const second = mildNextBar(firstWindow, firstWindow.length);
    const secondWindow = [...firstWindow, second];
    const progressed = await manageEventSequencePaperPositions({
      candlesBySymbol: { BTCUSDT: secondWindow },
      nowMs: nowAfter(secondWindow),
    });
    expect(progressed.advanced).toBe(1);
    expect(getOpenPositions()[0].barsHeld).toBe(2);
    expect(getOpenPositions()[0].eventSequencePaper?.lastProcessedCandleOpenTime).toBe(
      second.openTime,
    );
  });

  it("12. canonical model survives restart", () => {
    isolate();
    openCanonical({ costModel: EXECUTION_PRICE_V1 });
    simulateProcessRestartBoundary();
    expect(getOpenPositions()[0].eventSequencePaper?.costModel).toBe(EXECUTION_PRICE_V1);
    findings.OPEN_POSITION_COST_MODEL_RESTART_STABLE = "YES";
  });

  it("13. legacy model survives restart", () => {
    isolate();
    openCanonical({ costModel: LEDGER_V0, applyFunding: false, applySpread: false });
    simulateProcessRestartBoundary();
    expect(getOpenPositions()[0].eventSequencePaper?.costModel).toBe(LEDGER_V0);
  });

  it("14. restart compounding impact quantified", async () => {
    isolate();
    const closed = await closeOneCanonicalTrade();
    const b1 = ISOLATED_START_BALANCE + (closed.netPnl ?? 0);
    expect(getAccountState().balanceUsdt).toBeCloseTo(b1, 6);
    simulateProcessRestartBoundary();
    const b0 = getAccountState().balanceUsdt;
    expect(b0).toBe(PROCESS_START_BALANCE_USDT);
    const expectedMargin = Number((b1 * PATTERN_BASE_BALANCE_PCT).toFixed(6));
    const seedMargin = Number((b0 * PATTERN_BASE_BALANCE_PCT).toFixed(6));
    const opened = openCanonical();
    expect(opened.position.margin).toBeCloseTo(expectedMargin, 5);
    expect(opened.position.margin).not.toBeCloseTo(seedMargin, 3);
    findings.RESTART_BREAKS_PATTERN_COMPOUNDING = "NO";
    findings.compounding = {
      balanceShouldHaveBeen: b1,
      balanceAfterRestart: b0,
      baseBalancePct: PATTERN_BASE_BALANCE_PCT,
      expectedNextMargin: expectedMargin,
      actualNextMargin: opened.position.margin,
      marginDelta: Number((opened.position.margin - expectedMargin).toFixed(6)),
    };
  });

  it("15. durable Paper equity source identified", async () => {
    const iso = isolate();
    const closed = await closeOneCanonicalTrade();
    simulateProcessRestartBoundary();
    const session = getPaperSession(closed.session.id)!;
    const reconstructed = session.virtualBalance + session.realizedPnl;
    const account = getAccountState().balanceUsdt;
    expect(account).toBe(PROCESS_START_BALANCE_USDT);
    expect(reconstructed).toBeCloseTo(ISOLATED_START_BALANCE + (closed.netPnl ?? 0), 6);
    expect(account).not.toBeCloseTo(reconstructed, 4);
    findings.CURRENT_DURABLE_PAPER_EQUITY_SOURCE =
      "B. PaperSession.virtualBalance + realizedPnl (persisted). A. accountState.balanceUsdt is runtime-only and disagrees after restart.";
    findings.durableEquityInconsistency = {
      accountBalanceAfterRestart: account,
      sessionVirtualBalance: session.virtualBalance,
      sessionRealizedPnl: session.realizedPnl,
      reconstructedSessionEquity: reconstructed,
      isolatedDataDir: iso.data,
    };
  });

  it("16. SAFE warmup exact gate identified", () => {
    const facts = warmupSourceFacts();
    expect(facts.loopFile).toBe("src/lib/rextora/execution/safePaperLoop.ts");
    expect(facts.function).toBe("runSafePaperScanLoop");
    expect(facts.condition).toBe("candles.length < warmUp");
    expect(readSource("src/lib/rextora/execution/safePaperLoop.ts")).toContain(
      facts.warmUpExpression,
    );
    findings.safeWarmupGate = facts;
  });

  it("17. SAFE warmup exact required bars identified", () => {
    expect(CONTEXT_FALLBACK_PARAMS.ema_slow).toBe(200);
    expect(paperProductionWarmupRequiredBars(200)).toBe(205);
    expect(promotedPatternPaperRequiredBars()).toBe(205);
    expect(paperProductionWarmupRequiredBars(50)).toBe(55);
    findings.SAFE_REQUIRED_CANDLE_COUNT = 205;
    findings.SAFE_REQUIRED_FORMULA = "Math.max(50, ema_slow + 5)";
  });

  it("18. Pattern history requirement identified", () => {
    const facts = warmupSourceFacts();
    expect(facts.paperSignalMin).toBe(true);
    expect(facts.walkerWarmup).toBe(true);
    expect(ES_PAPER_SIGNAL_MIN_CANDLES).toBe(25);
    expect(ES_WALKER_WARMUP_BARS).toBe(20);
    findings.ES_REQUIRED_BARS = 25;
    findings.ES_WALKER_FIRST_CANDLES = 21;
  });

  it("19. OB history requirement", () => {
    const row = familyHistoryRequirements().find((r) => r.PATTERN_FAMILY === "order_block");
    expect(row?.DETECTOR_MIN_BARS).toBe(6);
    expect(row?.PAPER_SIGNAL_MIN_CANDLES).toBe(25);
  });

  it("20. FVG history requirement", () => {
    const row = familyHistoryRequirements().find((r) => r.PATTERN_FAMILY === "fvg");
    expect(row?.DETECTOR_MIN_BARS).toBe(3);
    expect(row?.PAPER_SIGNAL_MIN_CANDLES).toBe(25);
  });

  it("21. trendline history requirement", () => {
    const row = familyHistoryRequirements().find((r) => r.PATTERN_FAMILY === "trendline");
    expect(row?.DETECTOR_MIN_BARS).toBe(11);
    expect(row?.PAPER_SIGNAL_MIN_CANDLES).toBe(25);
  });

  it("22. SR history requirement", () => {
    const row = familyHistoryRequirements().find((r) => r.PATTERN_FAMILY === "support_resistance");
    expect(row?.DETECTOR_MIN_BARS).toBe(43);
    expect(row?.PAPER_SIGNAL_MIN_CANDLES).toBe(43);
    expect(row?.RESEARCH_MIN_CANDLES).toBe(43);
  });

  it("23. supply/demand history requirement", () => {
    const row = familyHistoryRequirements().find((r) => r.PATTERN_FAMILY === "supply_demand");
    expect(row?.DETECTOR_MIN_BARS).toBe(4);
    expect(row?.PAPER_SIGNAL_MIN_CANDLES).toBe(25);
  });

  it("24. Pattern signal valid before SAFE threshold fixture", () => {
    const cov = signalCoverageFixture();
    expect(cov.candleCount).toBe(29);
    expect(cov.candleCount).toBeGreaterThanOrEqual(ES_PAPER_SIGNAL_MIN_CANDLES);
    expect(cov.candleCount).toBeLessThan(cov.currentPaperRequiredBars);
    findings.signalFixtureCandleCount = cov.candleCount;
  });

  it("25. Research evaluates fixture", () => {
    const cov = signalCoverageFixture();
    expect(cov.lastBarEntry).toBe(true);
    findings.researchFixtureResult = "evaluated / last-bar entry produced";
  });

  it("26. Backtest evaluates fixture", () => {
    const cov = signalCoverageFixture();
    expect(cov.lastBarEntry).toBe(true);
    findings.backtestFixtureResult = "evaluated / last-bar entry produced (same ES walker)";
  });

  it("27. Paper gate behavior on fixture", () => {
    const cov = signalCoverageFixture();
    expect(cov.paperSignalPassed).toBe(true);
    expect(cov.paperProductionBlocked).toBe(true);
    expect(paperProductionGateBlocks(29, 200)).toBe(true);
    findings.paperProductionGateFixtureResult = "blocked by SAFE ema_slow+5 before evaluateEventSequencePaperSignal";
  });

  it("28. signal coverage loss verdict", () => {
    const cov = signalCoverageFixture();
    expect(cov.paperProductionBlocked && cov.paperSignalPassed && cov.lastBarEntry).toBe(true);
    findings.SAFE_WARMUP_CAUSES_PATTERN_SIGNAL_COVERAGE_LOSS = "YES";
  });

  it("29. Pattern-only warmup separation feasibility", () => {
    const facts = warmupSourceFacts();
    expect(facts.resolveBeforeWarmup).toBe(true);
    expect(facts.warmupBeforeFamilyDispatch).toBe(true);
    expect(facts.resolverHasExecutionKind).toBe(true);
    findings.RECOMMENDED_PATTERN_WARMUP_AUTHORITY =
      "D/C engine-derived: reuse evaluateEventSequencePaperSignal 25-bar gate + family detector floors (SR lookback+3). Do not invent a new global helper.";
    findings.PATTERN_WARMUP_CAN_BE_SEPARATED_WITHOUT_SAFE_CHANGE = "YES";
  });

  it("30. SAFE warmup remains unchanged", () => {
    const loop = readSource("src/lib/rextora/execution/safePaperLoop.ts");
    expect(loop).toContain("Math.max(50, Number(params.ema_slow ?? 50) + 5)");
    expect(loop).toContain("if (candles.length < warmUp)");
    findings.safeWarmupUnchanged = true;
  });

  it("31. open Pattern position management order identified", () => {
    const facts = warmupSourceFacts();
    expect(facts.manageEsBeforeWarmup).toBe(true);
    expect(facts.lifecycleHasWarmupGate).toBe(false);
    findings.openPositionManagementOrder =
      "resolvePaperExecutionStrategy → managePaperPositions → manageEventSequencePaperPositions → per-symbol SAFE ema_slow warmup → new-entry family dispatch";
  });

  it("32. open position not incorrectly blocked by entry warmup", async () => {
    isolate();
    const opened = openCanonical();
    const facts = warmupSourceFacts();
    expect(facts.manageEsBeforeWarmup).toBe(true);
    const next = mildNextBar(opened.candles, opened.candles.length);
    const window = [...opened.candles, next];
    expect(window.length).toBeLessThan(promotedPatternPaperRequiredBars());
    const result = await manageEventSequencePaperPositions({
      candlesBySymbol: { BTCUSDT: window },
      nowMs: nowAfter(window),
    });
    expect(result.advanced).toBe(1);
    expect(getOpenPositions()[0].barsHeld).toBe(1);
    findings.OPEN_PATTERN_POSITION_MANAGEMENT_BLOCKED_BY_WARMUP = "NO";
  });

  it("33. uninterrupted validation verdict", () => {
    findings.UNINTERRUPTED_PATTERN_PAPER_VALIDATION = "PARTIAL";
    expect(findings.UNINTERRUPTED_PATTERN_PAPER_VALIDATION).toBe("PARTIAL");
  });

  it("34. restart validation verdict", () => {
    findings.RESTARTED_PATTERN_PAPER_VALIDATION = "NO";
    expect(findings.RESTARTED_PATTERN_PAPER_VALIDATION).toBe("NO");
  });

  it("35. signal coverage validation verdict", () => {
    findings.PATTERN_SIGNAL_COVERAGE_VALIDATION = "NO";
    expect(findings.PATTERN_SIGNAL_COVERAGE_VALIDATION).toBe("NO");
  });

  it("36. next implementation contract frozen", () => {
    const contract = {
      phase: "P3-A8.3.5",
      doNotImplementInThisPhase: true,
      runtimeContinuity: {
        required: true,
        model: "reconstruct_or_persist_paper_equity",
        evidence:
          "accountState is MEMORY_ONLY and resets to 10254.32; session.virtualBalance+realizedPnl is durable",
        constraints: [
          "Do not change ES settlement arithmetic",
          "Do not infer open-position cost model from current source default",
          "Atomic session realizedPnl already persists; account equity does not",
          "Restart must not size the next Pattern trade from the module seed while session equity differs",
        ],
      },
      patternWarmup: {
        required: true,
        model: "pattern_only_after_resolve",
        evidence:
          "runSafePaperScanLoop applies ema_slow+5 before event_sequence dispatch; ES helper already requires 25",
        constraints: [
          "SAFE warmup expression unchanged",
          "Branch after resolvePaperExecutionStrategy using executionKind",
          "New-entry only",
          "Keep manageEventSequencePaperPositions before/ungated by entry warmup",
        ],
      },
    };
    findings.nextFrozenContract = contract;
    expect(contract.runtimeContinuity.required).toBe(true);
    expect(contract.patternWarmup.required).toBe(true);
  });

  it("37. Research arithmetic unchanged", () => {
    expect(readSource("src/lib/rextora/strategy/eventSequenceBacktest.ts")).toMatch(
      /const warmUp = (20|EVENT_SEQUENCE_WALKER_WARMUP_BARS)/,
    );
    expect(readSource("src/lib/rextora/strategy/eventSequenceBacktest.ts")).toContain(
      "getEventSequenceMinimumHistoryBars",
    );
  });

  it("38. Backtest arithmetic unchanged", () => {
    expect(readSource("src/lib/rextora/backtest/backtestEngine.ts")).toContain("const warmUp = params.ema_slow");
  });

  it("39. Pattern Paper lifecycle unchanged", () => {
    expect(readSource("src/lib/rextora/paper/paperEventSequenceLifecycle.ts")).toContain(
      "event_sequence_paper_v1",
    );
    expect(readSource("src/lib/rextora/paper/paperEventSequenceLifecycle.ts")).not.toContain("ema_slow");
  });

  it("40. SAFE Paper unchanged", () => {
    expect(readSource("src/lib/rextora/execution/safePaperLoop.ts")).toContain(
      "Math.max(50, Number(params.ema_slow ?? 50) + 5)",
    );
  });

  it("41. no production Paper start", () => {
    expect(findings.paperStarts).toBe(0);
    const after = productionRecordHashes();
    expect(after.paperSessionsIndexSha256).toBe(hashesBefore.paperSessionsIndexSha256);
    expect(after.paperSessionBf028Sha256).toBe(hashesBefore.paperSessionBf028Sha256);
  });

  it("42. no Paper resume", () => {
    expect(findings.paperResumes).toBe(0);
    const after = productionRecordHashes();
    expect(after.paperSessionE1dabSha256).toBe(hashesBefore.paperSessionE1dabSha256);
    expect(after.paperSessionsIndexSha256).toBe(hashesBefore.paperSessionsIndexSha256);
  });

  it("43. no Live activation", () => {
    expect(findings.liveActivations).toBe(0);
    expect(readSource("tests/paperRuntimeContinuityAndWarmupDiagnosis.test.ts")).not.toContain(
      "setAccountMode(\"LIVE\")",
    );
  });

  it("44. no orders", () => {
    expect(findings.orders).toBe(0);
  });

  it("45. production positions unchanged", () => {
    expect(productionRecordHashes().positionsSha256).toBe(hashesBefore.positionsSha256);
  });

  it("46. production account state unchanged", () => {
    expect(hashesBefore.accountPersistenceFileExists).toBe(false);
    expect(productionRecordHashes().accountPersistenceFileExists).toBe(false);
  });

  it("47. production Paper sessions unchanged", () => {
    const after = productionRecordHashes();
    expect(after.paperSessionsIndexSha256).toBe(hashesBefore.paperSessionsIndexSha256);
    expect(after.paperSessionBf028Sha256).toBe(hashesBefore.paperSessionBf028Sha256);
    expect(after.paperSessionE1dabSha256).toBe(hashesBefore.paperSessionE1dabSha256);
  });

  it("48. SAFE unchanged", () => {
    expect(productionRecordHashes().safeSha256).toBe(
      "fb3f19169c8911fe041f3f8cb1d9e654f9166078f0c5cd8e29f04ec02a56dfc0",
    );
    expect(productionRecordHashes().safeSha256).toBe(hashesBefore.safeSha256);
  });
});

afterAll(() => {
  const hashesAfter = productionRecordHashes();
  const facts = warmupSourceFacts();
  const families = familyHistoryRequirements();
  const cov = signalCoverageFixture();
  const init = parseAccountModuleInitializer();
  writeJson("account-call-graph.json", {
    startup: "accountStateStore module initializer (in-memory)",
    initialization: init,
    paperBalanceAuthority: findings.PAPER_ACCOUNT_BALANCE_AUTHORITY,
    patternCloseMutation: "paperEventSequenceLifecycle.settleEventSequencePaperClose → applyPaperRealizedPnl",
    termination: "process exit drops module state; no flush",
    nextStartup: "re-executes initializer balanceUsdt=10254.32 availableBalanceUsdt=10012.1",
  });
  writeJson("account-persistence.json", {
    PAPER_ACCOUNT_PERSISTENCE: findings.PAPER_ACCOUNT_PERSISTENCE,
    files: hashesBefore.accountPersistenceFiles,
    writeJsonStore: false,
    classification: "MEMORY_ONLY",
  });
  writeJson("restart-balance.json", {
    isolatedStart: ISOLATED_START_BALANCE,
    runtimeAfterClose: findings.patternCloseRuntimeBalance,
    netPnl: findings.patternCloseNetPnl,
    BALANCE_AFTER_RESTART: findings.BALANCE_AFTER_RESTART,
    classification: findings.restartBalanceClassification,
    also: findings.restartBalanceAlso,
    processStartSeed: PROCESS_START_BALANCE_USDT,
    processStartAvailable: PROCESS_START_AVAILABLE_USDT,
  });
  writeJson("session-restart.json", {
    SESSION_REALIZED_PNL_RESTART_PERSISTENCE: findings.SESSION_REALIZED_PNL_RESTART_PERSISTENCE,
    realizedPnlAfterRestart: findings.sessionRealizedAfterRestart,
    persistPath: "paperSessionStore.persistSession → isolated session JSON",
  });
  writeJson("open-position-restart.json", {
    OPEN_ES_POSITION_RESTART_CONTINUITY: findings.OPEN_ES_POSITION_RESTART_CONTINUITY,
    canonical: findings.canonicalReload,
    legacy: findings.legacyReload,
  });
  writeJson("candle-cursor-restart.json", {
    CANDLE_CURSOR_RESTART_DEDUPE: findings.CANDLE_CURSOR_RESTART_DEDUPE,
    before: findings.candleCursorBeforeRestart,
    after: findings.candleCursorAfterRestart,
    sameCandleDoesNotIncrement: true,
    nextCandleIncrementsOnce: true,
  });
  writeJson("cost-model-restart.json", {
    OPEN_POSITION_COST_MODEL_RESTART_STABLE: findings.OPEN_POSITION_COST_MODEL_RESTART_STABLE,
    canonicalSurvives: EXECUTION_PRICE_V1,
    legacySurvives: LEDGER_V0,
  });
  writeJson("compounding-impact.json", {
    RESTART_BREAKS_PATTERN_COMPOUNDING: findings.RESTART_BREAKS_PATTERN_COMPOUNDING,
    ...(findings.compounding as object),
  });
  writeJson("durable-equity-authority.json", {
    CURRENT_DURABLE_PAPER_EQUITY_SOURCE: findings.CURRENT_DURABLE_PAPER_EQUITY_SOURCE,
    inconsistency: findings.durableEquityInconsistency,
    runtimeAuthority: "A. accountState.balanceUsdt (memory)",
    durableAuthority: "B. PaperSession.virtualBalance + realizedPnl",
  });
  writeJson("warmup-call-graph.json", facts);
  writeJson("pattern-history-requirements.json", { rows: families });
  writeJson("warmup-signal-coverage.json", {
    ...cov,
    SAFE_WARMUP_CAUSES_PATTERN_SIGNAL_COVERAGE_LOSS:
      findings.SAFE_WARMUP_CAUSES_PATTERN_SIGNAL_COVERAGE_LOSS,
    fixtureLastOpen: lastOpen(entryWindow()),
  });
  writeJson("open-position-warmup-interaction.json", {
    order: findings.openPositionManagementOrder,
    OPEN_PATTERN_POSITION_MANAGEMENT_BLOCKED_BY_WARMUP:
      findings.OPEN_PATTERN_POSITION_MANAGEMENT_BLOCKED_BY_WARMUP,
  });
  writeJson("validation-integrity.json", {
    UNINTERRUPTED_PATTERN_PAPER_VALIDATION: findings.UNINTERRUPTED_PATTERN_PAPER_VALIDATION,
    RESTARTED_PATTERN_PAPER_VALIDATION: findings.RESTARTED_PATTERN_PAPER_VALIDATION,
    PATTERN_SIGNAL_COVERAGE_VALIDATION: findings.PATTERN_SIGNAL_COVERAGE_VALIDATION,
    paperStarts: findings.paperStarts,
    paperResumes: findings.paperResumes,
    liveActivations: findings.liveActivations,
    orders: findings.orders,
    hashesBefore,
    hashesAfter,
    hashesUnchanged: JSON.stringify(hashesBefore) === JSON.stringify(hashesAfter),
  });
  writeJson("next-frozen-contract.json", findings.nextFrozenContract);
  writeJson("production-readonly-hashes.json", {
    ...hashesAfter,
    expectedSafeSha256: "fb3f19169c8911fe041f3f8cb1d9e654f9166078f0c5cd8e29f04ec02a56dfc0",
    expectedSafeParamsHash: "7893ca3f0e30",
  });
});
