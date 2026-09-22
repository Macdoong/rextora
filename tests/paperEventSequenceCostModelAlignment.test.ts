import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { applyAdverseSlippage, toSlippageSide } from "../src/lib/rextora/backtest/executionSlippage";
import { productionReadonlyHashes } from "../src/lib/rextora/backtest/backtestCostAssumptionsDiagnosis";
import type { OhlcvCandle } from "../src/lib/rextora/data/ohlcvTypes";
import {
  PAPER_COST_MODEL_UNRESOLVED,
  PAPER_ES_COST_LABEL_CANONICAL,
  PAPER_ES_COST_LABEL_LEGACY,
  PAPER_ES_COST_LABEL_UNRESOLVED,
  parseExplicitEventSequenceCostModel,
  resolvePaperEventSequenceCostModel,
} from "../src/lib/rextora/paper/paperEventSequenceCostModel";
import { paperEventSequenceCostModelOperatorLabel } from "../src/lib/rextora/paper/paperEventSequenceCostLabels";
import {
  getPaperSession,
  migratePaperSessionRecord,
  preparePaperSession,
} from "../src/lib/rextora/paper/paperSessionStore";
import type { StoredStrategyV1 } from "../src/lib/rextora/strategy/definition/bridge";
import {
  evaluateEventSequencePaperSignal,
  runEventSequenceBacktest,
} from "../src/lib/rextora/strategy/eventSequenceBacktest";
import {
  EVENT_SEQUENCE_COST_MODEL_EXECUTION_PRICE_V1,
  EVENT_SEQUENCE_COST_MODEL_LEDGER_V0,
  settleEventSequenceClose,
} from "../src/lib/rextora/strategy/eventSequenceCostModel";
import {
  createStrategy,
  ensureStrategyStore,
  getStrategyById,
} from "../src/lib/rextora/strategy/strategyStore";

import { NEW_JOB_EVENT_SEQUENCE_COST_MODEL } from "../src/lib/rextora/strategySearch/jobExecutionProfile";
import { buildPatternSearchDefinition } from "../src/lib/rextora/strategySearch/patternEventSequence";
import { ORDER_BLOCK_BASE_PARAMS } from "../src/lib/rextora/strategySearch/patternSearchSpaces";
import { installIsolatedStrategyStore } from "./helpers/isolatedStrategyStore";
import { RETIRED_SAFE_STRATEGY_ID } from "../src/lib/rextora/strategy/retiredSafeBaseline";


const INTERVAL = 15 * 60 * 1000;
const START = Date.UTC(2024, 0, 1);
const FEE = 0.0004;
const SLIP = 0.0002;
const FUNDING = 0.0001;
const SPREAD = 0.0001;

const hashesBefore = productionReadonlyHashes();
const cleanups: Array<() => void> = [];
const tempDirs: string[] = [];

afterEach(() => {
  while (cleanups.length) cleanups.pop()?.();
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
  delete process.env.REXTORA_PAPER_SESSIONS_DIR;
});

function isolatePaper(): { rootDir: string } {
  const iso = installIsolatedStrategyStore();
  cleanups.push(iso.cleanup);
  ensureStrategyStore();
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "rextora-paper-a83-"));
  tempDirs.push(rootDir);
  process.env.REXTORA_PAPER_SESSIONS_DIR = rootDir;
  return { rootDir };
}

function candle(i: number, o: number, h: number, l: number, c: number): OhlcvCandle {
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

function buildObLongCandles(): OhlcvCandle[] {
  const out: OhlcvCandle[] = [];
  for (let i = 0; i < 24; i += 1) {
    const px = 100 + (i % 3) * 0.05;
    out.push(candle(i, px, px + 0.2, px - 0.2, px + 0.05));
  }
  out.push(candle(24, 100, 100.2, 97.8, 98));
  out.push(candle(25, 98.1, 104.5, 97.9, 104));
  out.push(candle(26, 104, 106.5, 103.5, 106));
  out.push(candle(27, 106, 107.2, 105.5, 107));
  out.push(candle(28, 99.2, 100.3, 98.1, 100.05));
  out.push(candle(29, 100.05, 101.5, 99.8, 101.2));
  out.push(candle(30, 101.2, 112, 100.5, 110));
  return out;
}

function patternDefinition() {
  return buildPatternSearchDefinition({
    candidateId: "pending",
    strategyName: "A8.3 pattern",
    timeframe: "15m",
    params: { ...ORDER_BLOCK_BASE_PARAMS, minImpulseAtrMult: 1.7 },
    family: "order_block",
  })!;
}

function createPatternStrategy(description: string): StoredStrategyV1 {
  return createStrategy({
    name: "A8.3 pattern",
    description,
    strategyType: "condition_builder",
    definition: patternDefinition(),
    sourceParamsHash: "a83_source",
  });
}

function stubStrategy(description: string): StoredStrategyV1 {
  return {
    id: "custom_a83_stub",
    name: "stub",
    description,
    type: "custom",
    timeframe: "15m",
    paramsHash: "abcd1234abcd",
    params: {} as StoredStrategyV1["params"],
    locked: false,
    sourceFile: null,
    sourceStatus: "user_created",
    paperActive: false,
    liveActive: false,
    liveEligible: false,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    longConditionSummary: "",
    shortConditionSummary: "",
    stopLossSummary: "",
    takeProfitSummary: "",
    strategyType: "condition_builder",
    definition: patternDefinition(),
  };
}

const CANONICAL_DESC =
  "전략 탐색 · sourceResearchJobId=job_canonical_a83 · sourceTrialIteration=1 · candidateParamsHash=ph_c · engineCostModel=event_sequence_execution_price_v1 · rankingCompatibilityGroup=event_sequence_execution_price_v1";
const LEGACY_DESC =
  "전략 탐색 · sourceResearchJobId=job_legacy_a83 · sourceTrialIteration=2 · candidateParamsHash=ph_l · engineCostModel=event_sequence_ledger_v0 · rankingCompatibilityGroup=event_sequence_ledger_v0 · costModelWarning=legacy_event_sequence_ledger_v0";
const OLD_MISSING_DESC =
  "전략 탐색 · sourceResearchJobId=job_old_missing_a83 · sourceTrialIteration=3 · candidateParamsHash=ph_old · searchFamily=order_block";

function source(rel: string): string {
  return fs.readFileSync(path.join(process.cwd(), rel), "utf8");
}

describe("P3-A8.3 Paper Event-Sequence cost-model alignment", () => {
  it("1. canonical promoted Pattern resolves canonical_v1", () => {
    const resolved = resolvePaperEventSequenceCostModel({
      strategy: stubStrategy(CANONICAL_DESC),
    });
    expect(resolved.costModel).toBe(EVENT_SEQUENCE_COST_MODEL_EXECUTION_PRICE_V1);
    expect(resolved.status).toBe("canonical");
    expect(resolved.source).toBe("strategy_explicit");
  });

  it("2. legacy promoted Pattern resolves ledger_v0", () => {
    const resolved = resolvePaperEventSequenceCostModel({
      strategy: stubStrategy(LEGACY_DESC),
    });
    expect(resolved.costModel).toBe(EVENT_SEQUENCE_COST_MODEL_LEDGER_V0);
    expect(resolved.status).toBe("legacy");
  });

  it("3. old Pattern with proven legacy evidence resolves ledger_v0", () => {
    const resolved = resolvePaperEventSequenceCostModel({
      strategy: stubStrategy(OLD_MISSING_DESC),
    });
    expect(resolved.costModel).toBe(EVENT_SEQUENCE_COST_MODEL_LEDGER_V0);
    expect(resolved.status).toBe("legacy");
    expect(resolved.source).toBe("strategy_legacy_provenance");
  });

  it("4. insufficient Pattern evidence fails closed", () => {
    const resolved = resolvePaperEventSequenceCostModel({
      strategy: stubStrategy("user-created pattern with no provenance"),
    });
    expect(resolved.status).toBe("unresolved");
    expect(resolved.costModel).toBeNull();
    expect(resolved.code).toBe(PAPER_COST_MODEL_UNRESOLVED);
    expect(resolved.costModel).not.toBe(NEW_JOB_EVENT_SEQUENCE_COST_MODEL);
  });

  it("5. ordinary safe_params strategy bypasses Pattern resolver", () => {
    isolatePaper();
    const strategy = createStrategy({
      name: "safe-params-fixture",
      timeframe: "15m",
      strategyType: "safe_params",
    }) as StoredStrategyV1;
    const resolved = resolvePaperEventSequenceCostModel({ strategy });
    expect(resolved.status).toBe("not_applicable");
    expect(resolved.costModel).toBeNull();
  });

  it("6-13. canonical/legacy Paper pass explicit cost inputs", () => {
    const canonical = resolvePaperEventSequenceCostModel({
      strategy: stubStrategy(CANONICAL_DESC),
    });
    const legacy = resolvePaperEventSequenceCostModel({
      strategy: stubStrategy(LEGACY_DESC),
    });
    const def = patternDefinition();
    const candles = buildObLongCandles().slice(0, 29);
    const paperCanonical = evaluateEventSequencePaperSignal({
      def,
      symbol: "BTCUSDT",
      candles,
      costModel: canonical.costModel,
      feeRate: 0.0005,
      slippageRate: 0.0003,
      applyFunding: true,
      fundingRate: FUNDING,
      applySpread: true,
      spreadRate: SPREAD,
    });
    const paperLegacy = evaluateEventSequencePaperSignal({
      def,
      symbol: "BTCUSDT",
      candles,
      costModel: legacy.costModel,
      feeRate: FEE,
      slippageRate: SLIP,
      applyFunding: true,
      fundingRate: FUNDING,
      applySpread: true,
      spreadRate: SPREAD,
    });
    expect(paperCanonical.costModel).toBe(
      EVENT_SEQUENCE_COST_MODEL_EXECUTION_PRICE_V1,
    );
    expect(paperLegacy.costModel).toBe(EVENT_SEQUENCE_COST_MODEL_LEDGER_V0);
    expect(canonical.costAssumptions.feeRate).toBe(FEE);
    expect(canonical.costAssumptions.slippageRate).toBe(SLIP);

    const enabled = resolvePaperEventSequenceCostModel({
      strategy: stubStrategy(CANONICAL_DESC),
      session: {
        eventSequenceCostAssumptions: {
          feeRate: 0.0005,
          slippageRate: 0.0003,
          fundingRate: FUNDING,
          applyFunding: true,
          applySpread: true,
          spreadRate: SPREAD,
        },
      } as never,
    });
    expect(enabled.costAssumptions.applyFunding).toBe(true);
    expect(enabled.costAssumptions.applySpread).toBe(true);
    const disabled = resolvePaperEventSequenceCostModel({
      strategy: stubStrategy(CANONICAL_DESC),
      session: {
        eventSequenceCostAssumptions: {
          feeRate: FEE,
          slippageRate: SLIP,
          fundingRate: FUNDING,
          applyFunding: false,
          applySpread: false,
          spreadRate: SPREAD,
        },
      } as never,
    });
    expect(disabled.costAssumptions.applyFunding).toBe(false);
    expect(disabled.costAssumptions.applySpread).toBe(false);
    expect(paperCanonical.costModel).not.toBe(paperLegacy.costModel);
    expect(paperCanonical.rejectReason === null || paperCanonical.passed).toBeTruthy();
  });

  it("14. canonical Paper no extra slip ledger deduction", () => {
    const settled = settleEventSequenceClose({
      side: "LONG",
      rawEntryPrice: 100,
      rawExitPrice: 110,
      feeRate: FEE,
      slippageRate: SLIP,
      leverage: 1,
      equityBefore: 1000,
      baseBalancePct: 1,
      costModel: EVENT_SEQUENCE_COST_MODEL_EXECUTION_PRICE_V1,
    });
    expect(settled.slipLedgerPct).toBe(0);
  });

  it("15. canonical Paper no Pattern cost guard", () => {
    expect(source("src/lib/rextora/execution/safePaperLoop.ts")).toMatch(
      /executionKind === "event_sequence"[\s\S]*evaluateCostGuard/,
    );
    expect(source("src/lib/rextora/execution/safePaperLoop.ts")).toMatch(
      /executionKind === "event_sequence"\s*\?\s*\{\s*passed:\s*true,\s*reason:\s*""\s*\}/,
    );
    expect(source("src/lib/rextora/strategy/eventSequenceCostModel.ts")).not.toContain(
      "evaluateCostGuard",
    );
  });

  it("16-18. legacy Paper ignores funding/spread and keeps ledger arithmetic", () => {
    const on = settleEventSequenceClose({
      side: "LONG",
      rawEntryPrice: 100,
      rawExitPrice: 110,
      feeRate: FEE,
      slippageRate: SLIP,
      leverage: 1,
      equityBefore: 1000,
      baseBalancePct: 1,
      costModel: EVENT_SEQUENCE_COST_MODEL_LEDGER_V0,
      applyFunding: true,
      fundingRate: FUNDING,
      applySpread: true,
      spreadRate: SPREAD,
    });
    const off = settleEventSequenceClose({
      side: "LONG",
      rawEntryPrice: 100,
      rawExitPrice: 110,
      feeRate: FEE,
      slippageRate: SLIP,
      leverage: 1,
      equityBefore: 1000,
      baseBalancePct: 1,
      costModel: EVENT_SEQUENCE_COST_MODEL_LEDGER_V0,
      applyFunding: false,
      applySpread: false,
    });
    expect(on.fundingPct).toBe(0);
    expect(on.spreadPct).toBe(0);
    expect(on.pnlUnit).toBeCloseTo(off.pnlUnit, 12);
    expect(on.slipLedgerPct).toBe(SLIP * 2);
  });

  it("19-20. Paper raw signal invariant for canonical and legacy", () => {
    const def = patternDefinition();
    const candles = buildObLongCandles().slice(0, 29);
    const canonical = evaluateEventSequencePaperSignal({
      def,
      symbol: "BTCUSDT",
      candles,
      costModel: EVENT_SEQUENCE_COST_MODEL_EXECUTION_PRICE_V1,
      feeRate: FEE,
      slippageRate: SLIP,
    });
    const legacy = evaluateEventSequencePaperSignal({
      def,
      symbol: "BTCUSDT",
      candles,
      costModel: EVENT_SEQUENCE_COST_MODEL_LEDGER_V0,
      feeRate: FEE,
      slippageRate: SLIP,
    });
    expect(canonical.side).toBe(legacy.side);
    expect(canonical.passed).toBe(legacy.passed);
    expect(canonical.rawEntryPrice).toBe(legacy.rawEntryPrice);
  });

  it("21-24. Paper session persists and reloads canonical/legacy models", () => {
    const { rootDir } = isolatePaper();
    const canonical = createPatternStrategy(CANONICAL_DESC);
    const legacy = createPatternStrategy(LEGACY_DESC);
    const canonicalSession = preparePaperSession(
      { strategyId: canonical.id, requireApproval: true },
      { rootDir },
    );
    const legacySession = preparePaperSession(
      { strategyId: legacy.id, requireApproval: true },
      { rootDir },
    );
    expect(canonicalSession.eventSequenceCostModel).toBe(
      EVENT_SEQUENCE_COST_MODEL_EXECUTION_PRICE_V1,
    );
    expect(legacySession.eventSequenceCostModel).toBe(
      EVENT_SEQUENCE_COST_MODEL_LEDGER_V0,
    );
    expect(getPaperSession(canonicalSession.id, { rootDir })?.eventSequenceCostModel).toBe(
      EVENT_SEQUENCE_COST_MODEL_EXECUTION_PRICE_V1,
    );
    expect(getPaperSession(legacySession.id, { rootDir })?.eventSequenceCostModel).toBe(
      EVENT_SEQUENCE_COST_MODEL_LEDGER_V0,
    );
  });

  it("25. missing session model does not use today's default", () => {
    isolatePaper();
    const strategy = stubStrategy(OLD_MISSING_DESC);
    const raw = {
      id: "paper_missing_model_a83",
      strategyId: strategy.id,
      strategyHash: "hash",
      paramsHash: "params",
      strategyName: "old",
      status: "stopped",
      schemaVersion: 2,
      startedAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
      virtualBalance: 10000,
      realizedPnl: 0,
      unrealizedPnl: 0,
      tradeCount: 0,
      signalCount: 0,
      drawdown: 0,
    };
    const migrated = migratePaperSessionRecord(raw);
    expect(migrated.eventSequenceCostModel).toBeUndefined();
    const resolved = resolvePaperEventSequenceCostModel({
      strategy,
      session: migrated,
    });
    expect(resolved.costModel).toBe(EVENT_SEQUENCE_COST_MODEL_LEDGER_V0);
    expect(resolved.costModel).not.toBe(NEW_JOB_EVENT_SEQUENCE_COST_MODEL);
  });

  it("26-27. unresolved model is a structured blocker, not a crash", () => {
    expect(() =>
      resolvePaperEventSequenceCostModel({
        strategy: stubStrategy("no evidence"),
      }),
    ).not.toThrow();
    const resolved = resolvePaperEventSequenceCostModel({
      strategy: stubStrategy("no evidence"),
    });
    expect(resolved.code).toBe(PAPER_COST_MODEL_UNRESOLVED);
    expect(resolved.status).toBe("unresolved");
  });

  it("28-30. operator labels and technical ids", () => {
    expect(paperEventSequenceCostModelOperatorLabel("canonical")).toBe(
      PAPER_ES_COST_LABEL_CANONICAL,
    );
    expect(paperEventSequenceCostModelOperatorLabel("legacy")).toBe(
      PAPER_ES_COST_LABEL_LEGACY,
    );
    expect(paperEventSequenceCostModelOperatorLabel("unresolved")).toBe(
      PAPER_ES_COST_LABEL_UNRESOLVED,
    );
    expect(parseExplicitEventSequenceCostModel("event_sequence_execution_price_v1")).toBe(
      EVENT_SEQUENCE_COST_MODEL_EXECUTION_PRICE_V1,
    );
    expect(parseExplicitEventSequenceCostModel("event_sequence_ledger_v0")).toBe(
      EVENT_SEQUENCE_COST_MODEL_LEDGER_V0,
    );
    const page = source("app/paper-trading/page.tsx");
    expect(page).toContain("paper-event-sequence-cost-model");
    expect(page).toContain("paper-event-sequence-cost-model-id");
  });

  it("31-33. approval/auto-start/auto-resume not introduced", () => {
    const loop = source("src/lib/rextora/execution/safePaperLoop.ts");
    const store = source("src/lib/rextora/paper/paperSessionStore.ts");
    expect(loop).not.toMatch(/approveAndStartPaperSession/);
    expect(store).toContain("pending_approval");
    expect(store).not.toMatch(/autoStart|auto-start|autoResume/);
  });

  it("34-35. Research and Backtest arithmetic files still own ES settlement", () => {
    expect(source("src/lib/rextora/strategy/eventSequenceCostModel.ts")).toContain(
      "slipLedgerPct = canonical ? 0 : input.slippageRate * 2",
    );
    expect(source("src/lib/rextora/strategySearch/backtestAdapter.ts")).toContain(
      "EVENT_SEQUENCE_COST_MODEL_EXECUTION_PRICE_V1",
    );
    expect(source("src/lib/rextora/backtest/backtestRunner.ts")).toContain(
      "EVENT_SEQUENCE_COST_MODEL_EXECUTION_PRICE_V1",
    );
  });

  it("36. retired SAFE cannot become a Paper session", () => {
    const { rootDir } = isolatePaper();
    expect(() =>
      preparePaperSession(
        { strategyId: RETIRED_SAFE_STRATEGY_ID, requireApproval: true },
        { rootDir },
      ),
    ).toThrow();
  });

  it("37-39. Live SAFE path remains; Event-Sequence Live is dispatched separately; no Live activation/orders", () => {
    const live = source("src/lib/rextora/botRuntime.ts");
    expect(live).toContain("async function runSafeLiveEntries");
    expect(live).toContain("dispatchLiveExecution");
    expect(live).not.toContain("evaluateEventSequencePaperSignal");
    expect(live).not.toContain("paperEventSequenceCostModel");
    expect(live).not.toContain("openEventSequencePaperPosition");
    expect(source("src/lib/rextora/execution/paperStrategyResolver.ts")).not.toContain(
      "resolvePaperEventSequenceCostModel",
    );
  });

  it("40. retired SAFE file remains absent", () => {
    expect(fs.existsSync("data/strategies/SAFE_v44_i4060.json")).toBe(false);
    expect(hashesBefore.paramsHash).toBe("7893ca3f0e30");
  });

  it("41-43. canonical Research/Backtest/Paper raw signal and execution-fill parity", () => {
    const def = patternDefinition();
    const candles = buildObLongCandles().slice(0, 29);
    const paper = evaluateEventSequencePaperSignal({
      def,
      symbol: "BTCUSDT",
      candles,
      costModel: EVENT_SEQUENCE_COST_MODEL_EXECUTION_PRICE_V1,
      feeRate: FEE,
      slippageRate: SLIP,
      applyFunding: true,
      fundingRate: FUNDING,
      applySpread: true,
      spreadRate: SPREAD,
    });
    const backtest = runEventSequenceBacktest({
      def,
      symbol: "BTCUSDT",
      candles,
      balance: 10_000,
      feeRate: FEE,
      slippageRate: SLIP,
      costModel: EVENT_SEQUENCE_COST_MODEL_EXECUTION_PRICE_V1,
      applyFunding: true,
      fundingRate: FUNDING,
      applySpread: true,
      spreadRate: SPREAD,
    });
    const lastBar = candles.length - 1;
    const btEntered = backtest.trades.find((t) => t.entryBar === lastBar);
    if (!btEntered) {
      expect(paper.passed).toBe(false);
      return;
    }
    expect(paper.passed).toBe(true);
    expect(paper.side).toBe(btEntered.side);
    expect(paper.rawEntryPrice).toBe(btEntered.rawEntryPrice ?? btEntered.entryPrice);
    const expectedFill = applyAdverseSlippage({
      side: toSlippageSide(btEntered.side),
      action: "entry",
      rawPrice: btEntered.rawEntryPrice ?? btEntered.entryPrice,
      slippageRate: SLIP,
    });
    expect(paper.executionEntryPrice).toBeCloseTo(expectedFill, 10);
    expect(paper.entryPrice).toBeCloseTo(btEntered.entryPrice, 10);
    expect(source("src/lib/rextora/strategySearch/backtestAdapter.ts")).toContain(
      "costModel: eventSequenceCostModel",
    );
  });

  it("44-47. Paper closed-trade fee/funding/spread/net are signal-only N/A; dispatch rates are canonical", () => {
    const paperSignal = source("src/lib/rextora/strategy/eventSequenceBacktest.ts");
    expect(paperSignal).toContain("Emits LONG/SHORT only when an entry occurs on the last candle.");
    expect(paperSignal).toContain("applyFunding: input.applyFunding");
    expect(paperSignal).toContain("applySpread: input.applySpread");
    expect(paperSignal).not.toMatch(
      /evaluateEventSequencePaperSignal[\s\S]*feeCostUsdt/,
    );
  });

  it("48. legacy model parity between Paper evaluator and engine", () => {
    const def = patternDefinition();
    const candles = buildObLongCandles().slice(0, 29);
    const paper = evaluateEventSequencePaperSignal({
      def,
      symbol: "BTCUSDT",
      candles,
      costModel: EVENT_SEQUENCE_COST_MODEL_LEDGER_V0,
      feeRate: FEE,
      slippageRate: SLIP,
      applyFunding: true,
      fundingRate: FUNDING,
      applySpread: true,
      spreadRate: SPREAD,
    });
    const engine = runEventSequenceBacktest({
      def,
      symbol: "BTCUSDT",
      candles,
      balance: 10_000,
      feeRate: FEE,
      slippageRate: SLIP,
      costModel: EVENT_SEQUENCE_COST_MODEL_LEDGER_V0,
      applyFunding: true,
      fundingRate: FUNDING,
      applySpread: true,
      spreadRate: SPREAD,
    });
    const last = engine.trades.find((t) => t.entryBar === candles.length - 1);
    if (!last) {
      expect(paper.passed).toBe(false);
      return;
    }
    expect(paper.costModel).toBe(EVENT_SEQUENCE_COST_MODEL_LEDGER_V0);
    expect(paper.rawEntryPrice).toBe(last.rawEntryPrice ?? last.entryPrice);
    expect(paper.entryPrice).toBe(last.entryPrice);
  });

  it("production hashes unchanged after resolver/session tests", () => {
    const after = productionReadonlyHashes();
    expect(after.safeSha256).toBeNull();
    expect(after.researchIndexSha256).toBe(hashesBefore.researchIndexSha256);
    expect(after.backtestIndexSha256).toBe(hashesBefore.backtestIndexSha256);
    expect(after.safeSha256).toBe(hashesBefore.safeSha256);
  });
});
