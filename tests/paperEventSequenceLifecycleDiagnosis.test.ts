import { afterAll, describe, expect, it, vi } from "vitest";

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
    generateAiTradeReport: vi.fn(() => ({ id: "mock-a832" })),
  };
});

import fs from "node:fs";
import path from "node:path";
import {
  EVENT_SEQUENCE_COST_MODEL_EXECUTION_PRICE_V1,
} from "../src/lib/rextora/strategy/eventSequenceCostModel";
import {
  FEE,
  FUNDING,
  P3A832_ARTIFACT_TS,
  SPREAD,
  expectedExecutionEntry,
  expectedExecutionExit,
  expectedPaperUnifiedCosts,
  paperShellParams,
  productionSafetySnapshot,
  replayEventSequenceWindow,
  replayPaperClosedTrade,
  source,
  sourceFacts,
} from "./helpers/paperEventSequenceLifecycleForensics";

const hashesBefore = productionSafetySnapshot();
const ARTIFACT_DIR = path.join(
  process.cwd(),
  ".validation/research-p3-a8-3-2-paper-lifecycle",
  P3A832_ARTIFACT_TS,
);

let tpPaper: Awaited<ReturnType<typeof replayPaperClosedTrade>>;
let slPaper: Awaited<ReturnType<typeof replayPaperClosedTrade>>;
let holdPaper: Awaited<ReturnType<typeof replayPaperClosedTrade>>;
let tpEs: ReturnType<typeof replayEventSequenceWindow>;
let slEs: ReturnType<typeof replayEventSequenceWindow>;
let holdEs: ReturnType<typeof replayEventSequenceWindow>;

async function ensureReplays() {
  if (!tpPaper) {
    tpPaper = await replayPaperClosedTrade("tp");
    slPaper = await replayPaperClosedTrade("sl");
    holdPaper = await replayPaperClosedTrade("max_hold");
    tpEs = replayEventSequenceWindow("tp");
    slEs = replayEventSequenceWindow("sl");
    holdEs = replayEventSequenceWindow("max_hold");
  }
}

function writeJson(name: string, value: unknown) {
  fs.mkdirSync(ARTIFACT_DIR, { recursive: true });
  fs.writeFileSync(path.join(ARTIFACT_DIR, name), `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

describe("P3-A8.3.2 Paper Event-Sequence closed-trade lifecycle diagnosis", () => {
  it("1. Paper call graph owner identified", () => {
    const facts = sourceFacts();
    expect(facts.usesEsSignal).toBe(true);
    expect(source("src/lib/rextora/botRuntime.ts")).toContain("runSafePaperScanLoop");
    expect(source("src/lib/rextora/execution/safePaperLoop.ts")).toContain("managePaperPositions");
    expect(source("src/lib/rextora/execution/safePaperLoop.ts")).toContain(
      "executePaperEntryFromSignal",
    );
    expect(source("src/lib/rextora/execution/safePaperExecution.ts")).toContain(
      "recordPaperEntryFromSafe",
    );
    expect(facts.positionOwner).toContain("managePaperPositions");
  });

  it("2. Pattern post-entry model classified", () => {
    const loop = source("src/lib/rextora/execution/safePaperLoop.ts");
    expect(loop).toContain("openEventSequencePaperPosition");
    expect(loop).toContain("es.stopPrice");
    expect(source("src/lib/rextora/paperExecutionEngine.ts")).toContain(
      "isEventSequencePaperOwned",
    );
    expect(source("src/lib/rextora/paperExecutionEngine.ts")).not.toContain(
      "runEventSequenceBacktest",
    );
  });

  it("3-6. raw / execution / persisted / PnL entry authority", async () => {
    await ensureReplays();
    expect(tpPaper.paperSignal.passed).toBe(true);
    expect(tpPaper.paperSignal.rawEntryPrice).toBeTruthy();
    expect(tpPaper.paperSignal.entryPrice).toBeCloseTo(
      expectedExecutionEntry(
        tpPaper.paperSignal.rawEntryPrice!,
        tpPaper.paperSignal.side === "SHORT" ? "SHORT" : "LONG",
      ),
      10,
    );
    expect(tpPaper.opened.entryPrice).toBe(tpPaper.risk.entryPrice);
    expect(tpPaper.opened.entryPrice).toBe(tpPaper.paperSignal.entryPrice);
    expect(tpPaper.closed?.entryPrice).toBe(tpPaper.opened.entryPrice);
  });

  it("7-8. stop and target owner identified", async () => {
    await ensureReplays();
    expect(source("src/lib/rextora/execution/safePaperLoop.ts")).toContain("calculateSafeV44Risk");
    expect(tpPaper.opened.stopLoss).toBe(tpPaper.risk.stopLossPrice);
    expect(tpPaper.opened.takeProfit).toBe(tpPaper.risk.takeProfitPrice);
    expect(tpPaper.opened.stopLoss).not.toBe(tpPaper.esStop);
    expect(tpPaper.opened.takeProfit).not.toBe(tpPaper.esTarget);
  });

  it("9. TP behavior", async () => {
    await ensureReplays();
    expect(tpPaper.manage.closed).toBe(1);
    expect(tpPaper.remainingOpen).toBe(0);
    expect(tpPaper.closed?.exitReason).toBe("익절");
    expect(tpPaper.closed?.exitPrice).toBe(tpPaper.risk.takeProfitPrice);
  });

  it("10. SL behavior", async () => {
    await ensureReplays();
    expect(slPaper.manage.closed).toBe(1);
    expect(slPaper.closed?.exitReason).toMatch(/손절/);
    expect(slPaper.closed?.exitPrice).toBe(slPaper.risk.stopLossPrice);
  });

  it("11. max_hold behavior", async () => {
    await ensureReplays();
    expect(holdPaper.manage.closed).toBe(1);
    expect(holdPaper.closed?.exitReason).toBe("최대 보유 청산");
    expect(source("src/lib/rextora/paperExecutionEngine.ts")).toContain("barsHeld");
    expect(source("src/lib/rextora/config.ts")).toContain("scanIntervalMs: 15_000");
  });

  it("12. invalidation behavior", () => {
    const engine = source("src/lib/rextora/paperExecutionEngine.ts");
    expect(engine).not.toContain("isInvalidated");
    expect(engine).not.toContain("lifecycle_invalidation");
    expect(source("src/lib/rextora/execution/safePaperLoop.ts")).toContain("이미 포지션 보유");
  });

  it("13-14. exit fill and slippage model", async () => {
    await ensureReplays();
    const engine = source("src/lib/rextora/paperExecutionEngine.ts");
    expect(engine).toContain("resolveMarketPrice");
    expect(engine).not.toContain("applyAdverseSlippage");
    expect(tpPaper.closed?.exitPrice).toBe(tpPaper.spyPrice);
    const canonicalExit = expectedExecutionExit(
      tpPaper.spyPrice,
      tpPaper.paperSignal.side === "SHORT" ? "SHORT" : "LONG",
    );
    expect(tpPaper.closed?.exitPrice).not.toBe(canonicalExit);
  });

  it("15-17. fee / funding / spread accounting", async () => {
    await ensureReplays();
    const costs = expectedPaperUnifiedCosts(
      tpPaper.closed!.entryPrice,
      tpPaper.closed!.quantity,
    );
    expect(tpPaper.closed?.fee).toBeCloseTo(costs.fee, 6);
    expect(tpPaper.closed?.slippage).toBeCloseTo(costs.slippage, 6);
    expect(tpPaper.closed?.spread).toBeCloseTo(costs.spread, 6);
    expect(tpPaper.closed?.funding).toBe(0);
    expect(source("src/lib/rextora/tradeLifecycle.ts")).not.toContain("feeRate:");
  });

  it("18. realized PnL formula", async () => {
    await ensureReplays();
    const resultSrc = source("src/lib/rextora/metrics/tradeResult.ts");
    expect(resultSrc).toContain("grossPnl - costs.total");
    expect(resultSrc).toContain("computeGrossPnlUsdt");
    expect(tpPaper.closed?.netPnl).toBe(tpPaper.closed?.realizedUsdt);
  });

  it("19. balance update behavior", async () => {
    await ensureReplays();
    expect(source("src/lib/rextora/tradeLifecycle.ts")).not.toContain("availableBalanceUsdt");
    expect(source("src/lib/rextora/paper/paperSessionStore.ts")).toMatch(/realizedPnl:\s*0/);
    expect(tpPaper.accountBalanceUsdt).toBeDefined();
  });

  it("20. Pattern position sizing", async () => {
    await ensureReplays();
    const params = paperShellParams();
    expect(params.base_bal_pct).toBe(0.02);
    expect(params.use_vol_target).toBe(true);
    expect(params.use_trailing).toBe(true);
    expect(tpPaper.opened.margin).toBe(tpPaper.risk.marginAmount);
    expect(tpPaper.opened.trailingDistance).toBeGreaterThan(0);
  });

  it("21-23. canonical TP / SL / max_hold replay if reachable", async () => {
    await ensureReplays();
    expect(tpEs.trade?.exitReason).toBe("take_profit");
    expect(slEs.trade?.exitReason).toBe("stop_loss");
    expect(holdEs.trade?.exitReason).toBe("max_hold");
    expect(tpPaper.closed?.exitReason).toBe("익절");
    expect(slPaper.closed?.exitReason).toMatch(/손절/);
    expect(holdPaper.closed?.exitReason).toBe("최대 보유 청산");
  });

  it("24-26. Research/Backtest/Paper raw and execution entry comparison", async () => {
    await ensureReplays();
    expect(tpPaper.paperSignal.rawEntryPrice).toBe(tpEs.paperAtEntry.rawEntryPrice);
    expect(tpEs.trade?.rawEntryPrice).toBe(tpPaper.paperSignal.rawEntryPrice);
    expect(tpPaper.paperSignal.entryPrice).toBeCloseTo(tpEs.trade?.entryPrice ?? NaN, 10);
    expect(tpPaper.opened.entryPrice).toBe(tpPaper.paperSignal.entryPrice);
  });

  it("27-33. exit / cost / PnL / balance comparison", async () => {
    await ensureReplays();
    expect(tpEs.trade?.exitReason).toBe("take_profit");
    expect(tpPaper.closed?.exitReason).toBe("익절");
    expect(tpEs.trade?.takeProfitPrice).not.toBe(tpPaper.opened.takeProfit);
    expect(tpEs.trade?.exitPrice).not.toBe(tpPaper.closed?.exitPrice);
    expect(tpEs.settlement?.feePct).toBeCloseTo(FEE * 2, 10);
    expect(tpPaper.closed?.funding).toBe(0);
    expect(tpEs.settlement?.fundingPct).toBe(FUNDING);
    expect(tpEs.settlement?.spreadPct).toBe(SPREAD);
    expect(tpPaper.closed?.netPnl).not.toBeCloseTo(tpEs.settlement?.netPnlUsdt ?? 0, 2);
    expect(tpEs.endingBalance).not.toBe(10_000);
    expect(tpPaper.accountBalanceUsdt).not.toBe(tpEs.endingBalance);
  });

  it("34. SAFE Paper path unchanged", () => {
    const loop = source("src/lib/rextora/execution/safePaperLoop.ts");
    expect(loop).toContain("evaluateSafeV44Signal");
    expect(loop).toContain("evaluateCostGuard");
    expect(loop).toContain('executionKind === "event_sequence"');
  });

  it("35-36. structured executionProvenance and Paper session provenance unchanged", () => {
    expect(source("src/lib/rextora/strategy/strategyTypes.ts")).toContain("executionProvenance?");
    expect(source("src/lib/rextora/paper/paperEventSequenceCostModel.ts")).toContain(
      "strategy_structured",
    );
    expect(source("src/lib/rextora/paper/paperSessionStore.ts")).toContain(
      "eventSequenceCostModel",
    );
  });

  it("37-40. no production Paper start / resume / Live / orders", () => {
    const helper = source("tests/helpers/paperEventSequenceLifecycleForensics.ts");
    expect(helper).not.toMatch(/\bapproveAndStartPaperSession\s*\(/);
    expect(helper).not.toMatch(/\bstartPaperSessionFromStrategy\s*\(/);
    expect(helper).not.toMatch(/\bstartLiveBotRuntime\s*\(/);
    expect(helper).not.toMatch(/\bexecuteLiveEntry\s*\(/);
    expect(source("src/lib/rextora/botRuntime.ts")).not.toContain(
      "evaluateEventSequencePaperSignal",
    );
  });

  it("41-42. production stores and SAFE unchanged", () => {
    const after = productionSafetySnapshot();
    expect(after.safeSha256).toBe(hashesBefore.safeSha256);
    expect(after.safeSha256).toBe(
      "fb3f19169c8911fe041f3f8cb1d9e654f9166078f0c5cd8e29f04ec02a56dfc0",
    );
    expect(after.paramsHash).toBe("7893ca3f0e30");
    expect(after.researchIndexSha256).toBe(hashesBefore.researchIndexSha256);
    expect(after.backtestIndexSha256).toBe(hashesBefore.backtestIndexSha256);
    expect(after.strategyIndexSha256).toBe(hashesBefore.strategyIndexSha256);
    expect(after.positionsSha256).toBe(hashesBefore.positionsSha256);
    expect(after.ordersSha256).toBe(hashesBefore.ordersSha256);
    expect(after.paperSessionFiles).toEqual(hashesBefore.paperSessionFiles);
  });
});

afterAll(async () => {
  await ensureReplays();
  const facts = sourceFacts();
  const after = productionSafetySnapshot();
  writeJson("paper-call-graph.json", {
    activation: "botRuntime.runExecutionScanLoop(PAPER) -> runSafePaperScanLoop",
    strategyResolution: "paperStrategyResolver.resolvePaperExecutionStrategy",
    costModel: "resolvePaperEventSequenceCostModel (structured provenance first)",
    scan: "safePaperLoop.runSafePaperScanLoop",
    signal:
      "event_sequence -> evaluateEventSequencePaperSignal (last-bar entry only)",
    risk: "calculateSafeV44Risk (SAFE ATR stop/target/size) using ES fill as entryPrice",
    entry: "executePaperEntryFromSignal -> recordPaperEntryFromSafe -> positionManager.upsertPosition",
    persistence: "data/rextora/positions.json via jsonStore",
    subsequentScan: "openSymbols skip ('이미 포지션 보유'); no ES walker while open",
    exit: "managePaperPositions ticker TP/SL/trailing/maxHold -> recordPaperExit -> buildUnifiedTradeResult",
    files: [
      "src/lib/rextora/botRuntime.ts",
      "src/lib/rextora/execution/paperStrategyResolver.ts",
      "src/lib/rextora/execution/safePaperLoop.ts",
      "src/lib/rextora/execution/safePaperExecution.ts",
      "src/lib/rextora/tradeLifecycle.ts",
      "src/lib/rextora/positionManager.ts",
      "src/lib/rextora/paperExecutionEngine.ts",
      "src/lib/rextora/metrics/tradeResult.ts",
    ],
  });
  writeJson("position-owner.json", {
    PAPER_POSITION_OWNER:
      "src/lib/rextora/positionManager.ts (persist) + paperExecutionEngine.managePaperPositions (monitor/exit) + tradeLifecycle.recordPaperEntryFromSafe (create)",
    PAPER_POSITION_STATE: "Position in data/rextora/positions.json (jsonStore POSITIONS_FILE)",
    PAPER_SESSION_POSITIONS: "PaperSession.realizedPnl/unrealizedPnl are display fields initialized to 0 and not updated on close",
    PATTERN_PAPER_POST_ENTRY_MODEL: "B",
    PATTERN_PAPER_POST_ENTRY_MODEL_LABEL:
      "enters the same SAFE Paper position lifecycle after Event-Sequence last-bar entry signal",
  });
  writeJson("entry-authority.json", {
    RAW_ENTRY_PRICE: "evaluateEventSequencePaperSignal.rawEntryPrice = walker candle close / rawEntryPrice",
    EXECUTION_ENTRY_PRICE:
      "es.entryPrice = settleEventSequenceClose.fillEntryPrice (canonical applyAdverseSlippage entry)",
    PERSISTED_POSITION_ENTRY_PRICE:
      "calculateSafeV44Risk.entryPrice <- patternFillPrice <- es.entryPrice; recordPaperEntryFromSafe.entryPrice",
    PNL_ENTRY_BASIS: "buildUnifiedTradeResult.entryPrice = closed.entryPrice (persisted SAFE-risk fill)",
    replay: {
      raw: tpPaper.paperSignal.rawEntryPrice,
      execution: tpPaper.paperSignal.entryPrice,
      persisted: tpPaper.opened.entryPrice,
      pnlBasis: tpPaper.closed?.entryPrice ?? null,
    },
  });
  writeJson("exit-policy.json", {
    PATTERN_PAPER_EXIT_POLICY:
      "SAFE ATR stop/target from calculateSafeV44Risk; trailing from SAFE shell use_trailing=true; maxHold from params.max_hold_bars incremented per scan tick; no ES invalidation",
    CLASSIFICATION: "SAFE_RISK_SUBSTITUTION",
    stopOwner: "src/lib/rextora/risk/safeV44RiskEngine.ts::calculateSafeV44Risk",
    targetOwner: "src/lib/rextora/risk/safeV44RiskEngine.ts::calculateSafeV44Risk",
    invalidationOwner: "NONE after entry — scan skips open symbols; managePaperPositions has no isInvalidated",
    maxHoldOwner:
      "paperExecutionEngine.managePaperPositions barsHeld++ per scan (~15s), compared to position.maxHoldBars copied from SAFE shell (Pattern maxHoldBars merged at promotion)",
    esStopUnused: tpPaper.esStop,
    paperStop: tpPaper.opened.stopLoss,
    esTargetUnused: tpPaper.esTarget,
    paperTarget: tpPaper.opened.takeProfit,
  });
  writeJson("exit-reason-matrix.json", {
    take_profit: {
      EXIT_REASON: "익절",
      OWNER: "managePaperPositions",
      TRIGGER_SOURCE: "ticker price vs SAFE ATR takeProfit",
      RAW_EXIT_PRICE: "resolveMarketPrice (getStoredMarketCoins)",
      EXECUTION_EXIT_PRICE: "same as raw ticker — no applyAdverseSlippage",
      SLIPPAGE: "ledger notional*slippageRate*2 at close via unifiedCost defaults; price unslipped",
      FEE: "notional*feeRate*2 at close",
      FUNDING: "0 (recordPaperExit omits fundingRate)",
      SPREAD: "notional*DEFAULT_SPREAD_RATE",
      REALIZED_PNL: "buildUnifiedTradeResult.netPnl",
      BALANCE_UPDATE: "none on accountState; session.realizedPnl unchanged",
    },
    stop_loss: {
      EXIT_REASON: "손절 | 트레일링 손절",
      OWNER: "managePaperPositions",
      TRIGGER_SOURCE: "ticker vs SAFE ATR stop (trailing may mutate stop)",
    },
    max_hold: {
      EXIT_REASON: "최대 보유 청산",
      OWNER: "managePaperPositions",
      TRIGGER_SOURCE: "barsHeld >= maxHoldBars (scan ticks, not candle bars)",
    },
    invalidation: {
      EXIT_REASON: "NOT_IMPLEMENTED",
      OWNER: "none",
    },
    combination_invalidation: { EXIT_REASON: "NOT_IMPLEMENTED", OWNER: "none" },
    end: { EXIT_REASON: "NOT_IMPLEMENTED in Paper", OWNER: "none" },
    manual_close: {
      EXIT_REASON: "수동 청산",
      OWNER: "executePaperExit -> recordPaperExit",
      TRIGGER_SOURCE: "operator / closePaperPosition",
    },
    risk_stop: {
      EXIT_REASON: "emergencyStopPaper closeAllPositions",
      OWNER: "botRuntime + paperExecutionEngine.emergencyStopPaper",
      REALIZED_PNL: "NOT recorded — closeAllPositions flats without recordPaperExit",
    },
    session_stop: {
      EXIT_REASON: "session pause/stop does not itself close via ES walker",
      OWNER: "paperSessionService",
    },
    emergency_close: {
      EXIT_REASON: "PAPER 긴급 중지",
      OWNER: "emergencyStopPaper",
      REALIZED_PNL: "not settled through unified trade result",
    },
  });
  writeJson("cost-accounting.json", {
    PATTERN_PAPER_EXIT_SLIPPAGE_MODEL:
      "unslipped ticker exit + unifiedCost ledger slippageRate*2 on notional",
    EXIT_FILL_PARITY_WITH_CANONICAL_ES: "NO",
    PAPER_ES_FEE_PARITY: "PARTIAL",
    PAPER_ES_FUNDING_PARITY: "NO",
    PAPER_ES_SPREAD_PARITY: "NO",
    PAPER_ES_NET_PNL_PARITY: "NO",
    paperFee: "feeRate*2 * entry*qty at close; defaults 0.0004; not ES costAssumptions",
    paperFunding: "always 0 on recordPaperExit",
    paperSpread: "always DEFAULT_SPREAD_RATE 0.0001 even if ES applySpread false",
    esCanonical:
      "settleEventSequenceClose: execution prices via applyAdverseSlippage; feePct=feeRate*2; funding/spread only if flags; equity *= 1+pnlUnit*baseBalancePct*lev",
  });
  writeJson("position-sizing.json", {
    PATTERN_PAPER_POSITION_SIZING:
      "SAFE calculateSafeV44Risk: margin = balance * base_bal_pct(0.02) * vol-target sizeMultiplier; notional = margin * dynamic leverage; qty = notional/entry",
    ES_SIZING: "margin = equity * definition.positionSizing.baseBalancePct (0.1) * ES leverage",
    POSITION_SIZING_PARITY: "NO",
    preventsEconomicParity: true,
  });
  writeJson("balance-accounting.json", {
    PAPER_BALANCE_UPDATE_MODEL:
      "no accountState mutation on close; metricsEngine.accountEquity = account.balanceUsdt + unrealized; today realized from unified-trade-results display only; PaperSession.realizedPnl stays 0",
    ES_BALANCE: "equity *= 1 + pnlUnit * baseBalancePct * leverage (compounding)",
  });
  writeJson("multi-bar-replay.json", {
    architecture:
      "isolated REXTORA_DATA_DIR + recordPaperEntryFromSafe + managePaperPositions with mocked ticker; production session not started",
    paperTp: {
      reason: tpPaper.closed?.exitReason ?? null,
      rawEntry: tpPaper.paperSignal.rawEntryPrice,
      executionEntry: tpPaper.opened.entryPrice,
      rawExit: tpPaper.closed?.exitPrice ?? null,
      executionExit: tpPaper.closed?.exitPrice ?? null,
      fee: tpPaper.closed?.fee ?? null,
      slippage: tpPaper.closed?.slippage ?? null,
      funding: tpPaper.closed?.funding ?? null,
      spread: tpPaper.closed?.spread ?? null,
      realizedPnl: tpPaper.closed?.netPnl ?? null,
      endingPaperBalance: tpPaper.accountBalanceUsdt,
    },
    paperSl: {
      reason: slPaper.closed?.exitReason ?? null,
      exit: slPaper.closed?.exitPrice ?? null,
      realizedPnl: slPaper.closed?.netPnl ?? null,
    },
    paperMaxHold: {
      reason: holdPaper.closed?.exitReason ?? null,
      exit: holdPaper.closed?.exitPrice ?? null,
      note: "2 managePaperPositions ticks with mid ticker; not 2 candle bars",
    },
  });
  writeJson("research-backtest-paper-comparison.json", {
    dimensions: {
      tradeCount: {
        classification: "NOT_COMPARABLE",
        note: "ES walker force-closes end-of-window; Paper keeps position until SAFE TP/SL/hold",
      },
      side: { classification: "PARITY", paper: tpPaper.paperSignal.side, es: tpEs.trade?.side },
      rawEntry: {
        classification: "PARITY",
        paper: tpPaper.paperSignal.rawEntryPrice,
        es: tpEs.trade?.rawEntryPrice,
      },
      executionEntry: {
        classification: "PARITY",
        paper: tpPaper.opened.entryPrice,
        es: tpEs.trade?.entryPrice,
      },
      exitReason: {
        classification: "BUG",
        paper: tpPaper.closed?.exitReason,
        es: tpEs.trade?.exitReason,
        note: "both can take profit but owners/prices differ; Paper Korean SAFE labels vs ES take_profit",
      },
      rawExit: {
        classification: "DIFFERENT_BY_DESIGN",
        paper: tpPaper.closed?.exitPrice,
        es: tpEs.trade?.rawExitPrice,
      },
      executionExit: {
        classification: "NOT_IMPLEMENTED",
        paper: tpPaper.closed?.exitPrice,
        es: tpEs.trade?.exitPrice,
      },
      fee: { classification: "PARTIAL", paper: tpPaper.closed?.fee, es: tpEs.settlement?.feeCostUsdt },
      funding: {
        classification: "NO",
        paper: tpPaper.closed?.funding,
        es: tpEs.settlement?.fundingCostUsdt,
      },
      spread: {
        classification: "NO",
        paper: tpPaper.closed?.spread,
        es: tpEs.settlement?.spreadCostUsdt,
      },
      netPnl: {
        classification: "NO",
        paper: tpPaper.closed?.netPnl,
        es: tpEs.settlement?.netPnlUsdt,
      },
      endingBalance: {
        classification: "NOT_IMPLEMENTED",
        paper: tpPaper.accountBalanceUsdt,
        es: tpEs.endingBalance,
      },
    },
  });
  writeJson("validation-integrity.json", {
    PAPER_VALIDATES_PROMOTED_PATTERN_SEMANTICS: "NO",
    RECOMMENDED_PATTERN_PAPER_LIFECYCLE_MODEL: "L-A",
    currentModel: "L-C Event-Sequence last-bar entry + SAFE risk lifecycle",
    mismatches: [
      "stop/target from SAFE ATR + trailing, not ES walker / zone targets",
      "max_hold is scan ticks (~15s) not candle bars",
      "invalidation not evaluated while open",
      "exit fill is ticker, not applyAdverseSlippage",
      "fee/slip/spread/funding use unified defaults, not strategy costAssumptions",
      "sizing is SAFE 2% vol-target, not ES baseBalancePct 0.1",
      "Paper balance does not compound; session.realizedPnl unused",
    ],
  });
  writeJson("a8-3-3-frozen-contract.json", {
    REQUIRED: [
      "Pattern Paper must persist Event-Sequence position state after entry (raw/fill entry, ES stop, ES target, entryBar, maxHoldBars, costModel, costAssumptions)",
      "Subsequent Paper scans for an open Pattern position must run the Event-Sequence lifecycle walker (or equivalent) on candles — not SAFE managePaperPositions TP/SL/trailing",
      "Exits must settle through settleEventSequenceClose with the session-persisted costModel",
      "max_hold counted in candle bars",
      "invalidation / combination invalidation evaluated while open",
      "position sizing from definition.positionSizing.baseBalancePct + ES leverage, not SAFE vol-target shell",
      "Paper session realized PnL / equity must record ES net settlement",
      "fail closed if cost model unresolved",
      "SAFE Paper path remains calculateSafeV44Risk + managePaperPositions",
      "do not add Pattern cost guard",
      "do not change Research/Backtest/SAFE arithmetic",
      "do not activate Live Pattern execution",
    ],
    OPTIONAL: [
      "time-based funding realism",
      "ticker vs OHLC intra-bar for live Paper monitoring presentation",
      "UI labels for ES exit reasons",
    ],
    OUT_OF_SCOPE: [
      "Live Event-Sequence execution",
      "historical strategy/Paper rewrite",
      "SAFE_v44_i4060",
      "auto-promote / auto-start Paper",
    ],
  });
  writeJson("production-readonly-hashes.json", {
    before: hashesBefore,
    after,
    LIVE_EXECUTION_BEHAVIOR_CHANGED: "NO",
    researchExecutions: 0,
    paperStartsResumes: 0,
    liveActivations: 0,
    realOrders: 0,
    sourceFacts: {
      usesEsSignal: facts.usesEsSignal,
      usesSafeRiskAfterEs: facts.usesSafeRiskAfterEs,
      usesPatternFillOnly: facts.usesPatternFillOnly,
      ignoresEsStop: facts.ignoresEsStop,
      liveUsesEsPaper: facts.liveUsesEsPaper,
      costModel: EVENT_SEQUENCE_COST_MODEL_EXECUTION_PRICE_V1,
    },
  });
});
