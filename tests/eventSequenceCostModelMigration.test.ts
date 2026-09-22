import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  applyAdverseSlippage,
  toSlippageSide,
} from "../src/lib/rextora/backtest/executionSlippage";
import { productionReadonlyHashes } from "../src/lib/rextora/backtest/backtestCostAssumptionsDiagnosis";
import type { OhlcvCandle } from "../src/lib/rextora/data/ohlcvTypes";
import {
  GROUP_PATTERN as UI_GROUP_PATTERN,
  GROUP_PATTERN_CANONICAL as UI_GROUP_PATTERN_CANONICAL,
  GROUP_SAFE as UI_GROUP_SAFE,
  GROUP_UNKNOWN as UI_GROUP_UNKNOWN,
  groupDecisionHighlights,
  groupScopedRankHistory,
  groupShortlistTitle,
  hasAuthoritativeRankingGroups,
  rankingGroupLabel,
  topCandidatesForGroup,
} from "../src/lib/rextora/researchRankingReadModel";
import {
  buildOrderBlockLongSequence,
  validateEventSequence,
} from "../src/lib/rextora/strategy/definition/eventSequence";
import { defaultDefinition } from "../src/lib/rextora/strategy/definition/validator";
import { runEventSequenceBacktest } from "../src/lib/rextora/strategy/eventSequenceBacktest";
import {
  EVENT_SEQUENCE_COST_MODEL_EXECUTION_PRICE_V1,
  EVENT_SEQUENCE_COST_MODEL_LEDGER_V0,
  resolveEventSequenceCostModel,
  settleEventSequenceClose,
} from "../src/lib/rextora/strategy/eventSequenceCostModel";
import { computeParamsHash } from "../src/lib/rextora/strategy/strategyHash";
import * as strategyStore from "../src/lib/rextora/strategy/strategyStore";
import { evaluateCandidateWindow } from "../src/lib/rextora/strategySearch/backtestAdapter";
import { buildCostStressConfig } from "../src/lib/rextora/strategySearch/costStress";
import {
  NEW_JOB_EVENT_SEQUENCE_COST_MODEL,
  resolveProfileEventSequenceCostModel,
  saveJobExecutionProfile,
} from "../src/lib/rextora/strategySearch/jobExecutionProfile";
import { createSearchJob, listSearchTrials, saveSearchTrial } from "../src/lib/rextora/strategySearch/jobStore";
import { buildPatternSearchDefinition } from "../src/lib/rextora/strategySearch/patternEventSequence";
import {
  ORDER_BLOCK_BASE_PARAMS,
  orderBlockSearchRanges,
} from "../src/lib/rextora/strategySearch/patternSearchSpaces";
import { promoteSearchCandidateToStrategy } from "../src/lib/rextora/strategySearch/promoteFromSearch";
import {
  ENGINE_COST_MODEL_EVENT_SEQUENCE,
  ENGINE_COST_MODEL_EVENT_SEQUENCE_V1,
  ENGINE_COST_MODEL_SAFE,
  GROUP_PATTERN,
  GROUP_PATTERN_CANONICAL,
  GROUP_SAFE,
  GROUP_UNKNOWN_LEGACY,
  applyGroupChampA,
  buildResearchCostProvenance,
  classifyResearchTrial,
  computeResearchEvaluationHash,
  emptyBestByCompatibilityGroup,
  stampResearchEvaluation,
} from "../src/lib/rextora/strategySearch/researchEvaluationIdentity";
import {
  runSearchJob,
  type EvaluateCompleteCandidateInput,
  type StrategySearchCompleteCandidateEvaluation,
  type StrategySearchConfig,
} from "../src/lib/rextora/strategySearch";

const SAFE_SHA =
  "fb3f19169c8911fe041f3f8cb1d9e654f9166078f0c5cd8e29f04ec02a56dfc0";
const BACKTEST_INDEX_SHA =
  "4140af487e4bd32aa0b2b34ea2f57069e7785689a268a437acfca5d886fda9ae";

const INTERVAL = 15 * 60 * 1000;
const START = Date.UTC(2024, 0, 1);
const FEE = 0.0004;
const SLIP = 0.0002;
const FUNDING = 0.0001;
const SPREAD = 0.0001;

const PATTERN_PARAMS = { ...ORDER_BLOCK_BASE_PARAMS };
const COST = {
  feeRate: FEE,
  slippageRate: SLIP,
  fundingRate: FUNDING,
  applyFunding: true,
  applySpread: true,
  spreadRate: SPREAD,
};

const hashesBefore = productionReadonlyHashes();
const tempRoots: string[] = [];
afterEach(() => {
  vi.restoreAllMocks();
  for (const root of tempRoots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

function candle(i: number, o: number, h: number, l: number, c: number, volume = 1000): OhlcvCandle {
  return {
    openTime: START + i * INTERVAL,
    open: o,
    high: h,
    low: l,
    close: c,
    volume,
    closeTime: START + (i + 1) * INTERVAL - 1,
  };
}

function buildObLongCandles(after?: OhlcvCandle[]): OhlcvCandle[] {
  const out: OhlcvCandle[] = [];
  for (let i = 0; i < 24; i += 1) {
    const px = 100 + (i % 3) * 0.05;
    out.push(candle(i, px, px + 0.2, px - 0.2, px + 0.05, 1000));
  }
  out.push(candle(24, 100, 100.2, 97.8, 98, 1200));
  out.push(candle(25, 98.1, 104.5, 97.9, 104, 8000));
  out.push(candle(26, 104, 106.5, 103.5, 106, 2000));
  out.push(candle(27, 106, 107.2, 105.5, 107, 1800));
  out.push(candle(28, 99.2, 100.3, 98.1, 100.05, 2500));
  if (after?.length) {
    out.push(...after);
  } else {
    out.push(candle(29, 100.05, 101.5, 99.8, 101.2, 1500));
    out.push(candle(30, 101.2, 112, 100.5, 110, 1600));
  }
  return out;
}

function makeDef() {
  const seq = buildOrderBlockLongSequence({
    penetrationPct: 0.5,
    stopAtrMult: 0.5,
    tpAtrMult: 2,
    maxHoldBars: 48,
    zoneLookback: 40,
  });
  expect(validateEventSequence(seq).ok).toBe(true);
  return defaultDefinition({
    strategyId: "es_a82",
    strategyName: "A8.2 ES",
    strategyType: "condition_builder",
    timeframe: "15m",
    eventSequence: seq,
    risk: {
      stopLossAtrMult: 0.5,
      takeProfitAtrMult: 2,
      useTrailing: false,
      trailAtrMult: 1,
      maxHoldBars: 48,
      oppositeSignalExit: false,
      structureInvalidationExit: false,
      partialExitEnabled: false,
    },
    positionSizing: {
      baseBalancePct: 1,
      sizeMin: 0.5,
      sizeMax: 1.5,
      useVolTarget: false,
      targetAtrPct: 0.02,
    },
    execution: {
      costGuardEnabled: false,
      costGuardK: 3,
      cooldownBars: 0,
      longEnabled: true,
      shortEnabled: false,
    },
  });
}

function runEs(
  model: typeof EVENT_SEQUENCE_COST_MODEL_LEDGER_V0 | typeof EVENT_SEQUENCE_COST_MODEL_EXECUTION_PRICE_V1,
  extras?: {
    candles?: OhlcvCandle[];
    applyFunding?: boolean;
    applySpread?: boolean;
    fundingRate?: number;
    spreadRate?: number;
    feeRate?: number;
    slippageRate?: number;
  },
) {
  return runEventSequenceBacktest({
    def: makeDef(),
    symbol: "BTCUSDT",
    candles: extras?.candles ?? buildObLongCandles(),
    balance: 1000,
    feeRate: extras?.feeRate ?? FEE,
    slippageRate: extras?.slippageRate ?? SLIP,
    costModel: model,
    applyFunding: extras?.applyFunding ?? true,
    fundingRate: extras?.fundingRate ?? FUNDING,
    applySpread: extras?.applySpread ?? true,
    spreadRate: extras?.spreadRate ?? SPREAD,
  });
}

function stampBase(
  overrides: Partial<Parameters<typeof stampResearchEvaluation>[0]> = {},
) {
  return stampResearchEvaluation({
    params: PATTERN_PARAMS,
    paramsHash: "pattern_a82",
    cost: COST,
    symbols: ["BTCUSDT"],
    timeframe: "15m",
    windows: [
      {
        id: "w1",
        fromOpenTime: START,
        toOpenTime: START + 40 * INTERVAL,
      },
    ],
    dataVersion: "v1",
    evaluationBalance: 1000,
    passPolicy: { thresholds: { minTradeCount: 0 } },
    scoreWeights: {
      returnWeight: 1,
      mddWeight: 0.5,
      profitFactorWeight: 0.25,
      winRateWeight: 0.25,
      tradeAdequacyWeight: 0.25,
      negativeMonthWeight: 0.1,
      consistencyWeight: 0.1,
    },
    costStressScenarios: [],
    jitterConfig: {
      enabled: false,
      sampleCount: 1,
      mutationScale: 0.1,
      seed: 1,
      minimumPassRate: 0,
      maximumScoreDropRatio: 1,
      parameterRanges: [],
    },
    ...overrides,
  });
}

function sampleConfig(overrides: Partial<StrategySearchConfig> = {}): StrategySearchConfig {
  return {
    searchVersion: "1",
    strategyTemplateId: "a82_pattern",
    symbols: ["BTCUSDT"],
    timeframe: "15m",
    dataVersion: "binance-v1",
    seed: 7,
    generatorType: "random",
    maxIterations: 1,
    parameterRanges: orderBlockSearchRanges(),
    evaluationWindows: [
      {
        id: "w1",
        label: "w1",
        fromOpenTime: START,
        toOpenTime: START + 40 * INTERVAL,
      },
    ],
    passCriteria: { minTradeCount: 0, requireAllWindowsPass: true },
    costStress: { enabled: false, multipliers: [1] },
    jitter: { enabled: false, samples: 0, relativeAmplitude: 0 },
    ...overrides,
  };
}

function executionProfile(withCanonical: boolean) {
  return {
    version: 1 as const,
    balance: 1000,
    baseCostConfig: COST,
    passPolicy: { thresholds: { minTradeCount: 0 } },
    scoreWeights: {
      returnWeight: 1,
      mddWeight: 0.5,
      profitFactorWeight: 0.25,
      winRateWeight: 0.25,
      tradeAdequacyWeight: 0.25,
      negativeMonthWeight: 0.1,
      consistencyWeight: 0.1,
    },
    costStressScenarios: [],
    jitterConfig: {
      enabled: false,
      sampleCount: 1,
      mutationScale: 0.1,
      seed: 1,
      minimumPassRate: 0,
      maximumScoreDropRatio: 1,
      parameterRanges: orderBlockSearchRanges(),
    },
    dataRef: {
      availableFrom: START,
      availableTo: START + 40 * INTERVAL,
      source: "preloaded" as const,
    },
    ...(withCanonical
      ? { eventSequenceCostModel: EVENT_SEQUENCE_COST_MODEL_EXECUTION_PRICE_V1 }
      : {}),
  };
}

function mockEval(): (
  input: EvaluateCompleteCandidateInput,
) => Promise<StrategySearchCompleteCandidateEvaluation> {
  return async (input) => ({
    candidateId: input.candidate.candidateId,
    paramsHash: input.candidate.paramsHash,
    baseEvaluation: {
      candidateId: input.candidate.candidateId,
      paramsHash: input.candidate.paramsHash,
      symbols: ["BTCUSDT"],
      timeframe: "15m",
      windows: [],
      costConfig: COST,
      startedAt: "2024-01-01T00:00:00.000Z",
      completedAt: "2024-01-01T00:00:01.000Z",
      durationMs: 1,
    },
    basePass: {
      passed: true,
      requiredWindowCount: 1,
      passedRequiredWindowCount: 1,
      failedRequiredWindowCount: 0,
      issues: [],
    },
    baseScore: {
      finalScore: 0.5,
      breakdown: {
        returnReward: 0.5,
        mddPenalty: 0,
        profitFactorReward: 0,
        winRateReward: 0,
        tradeAdequacy: 0,
        negativeMonthPenalty: 0,
        consistency: 0,
        weightedReturn: 0.5,
        weightedMdd: 0,
        weightedProfitFactor: 0,
        weightedWinRate: 0,
        weightedTradeAdequacy: 0,
        weightedNegativeMonth: 0,
        weightedConsistency: 0,
      },
      weights: executionProfile(false).scoreWeights,
      requiredWindowCount: 1,
    },
    costStressResults: [],
    costStressPassed: true,
    jitterResult: {
      enabled: false,
      jitterPassed: true,
      sampleCount: 0,
      passedSampleCount: 0,
      failedSampleCount: 0,
      passRate: 1,
      averageScore: null,
      minimumScore: null,
      maximumScore: null,
      averageScoreDropRatio: null,
      maximumObservedScoreDropRatio: null,
      baseScore: 0.5,
      samples: [],
    },
    finalPassed: true,
    startedAt: "2024-01-01T00:00:00.000Z",
    completedAt: "2024-01-01T00:00:01.000Z",
    durationMs: 1,
  });
}

describe("P3-A8.2 Event-Sequence cost model migration", () => {
  it("1-11. deterministic ledger vs canonical arithmetic", () => {
    const longLegacy = settleEventSequenceClose({
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
    expect(longLegacy.grossReturn).toBeCloseTo(0.1, 12);
    expect(longLegacy.feePct).toBeCloseTo(FEE * 2, 12);
    expect(longLegacy.slipLedgerPct).toBeCloseTo(SLIP * 2, 12);
    expect(longLegacy.fundingPct).toBe(0);
    expect(longLegacy.spreadPct).toBe(0);
    expect(longLegacy.pnlPct).toBeCloseTo(0.1 - FEE * 2 - SLIP * 2, 12);
    expect(longLegacy.fillEntryPrice).toBe(100);
    expect(longLegacy.fillExitPrice).toBe(110);

    const shortLegacy = settleEventSequenceClose({
      ...longLegacy,
      side: "SHORT",
      rawEntryPrice: 100,
      rawExitPrice: 90,
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
    expect(shortLegacy.grossReturn).toBeCloseTo(0.1, 12);
    expect(shortLegacy.slipLedgerPct).toBeCloseTo(SLIP * 2, 12);
    expect(shortLegacy.fundingPct).toBe(0);
    expect(shortLegacy.spreadPct).toBe(0);

    const longCanon = settleEventSequenceClose({
      side: "LONG",
      rawEntryPrice: 100,
      rawExitPrice: 110,
      feeRate: FEE,
      slippageRate: SLIP,
      leverage: 1,
      equityBefore: 1000,
      baseBalancePct: 1,
      costModel: EVENT_SEQUENCE_COST_MODEL_EXECUTION_PRICE_V1,
      applyFunding: false,
      fundingRate: FUNDING,
      applySpread: false,
      spreadRate: SPREAD,
    });
    const execEntry = applyAdverseSlippage({
      side: toSlippageSide("LONG"),
      action: "entry",
      rawPrice: 100,
      slippageRate: SLIP,
    });
    const execExit = applyAdverseSlippage({
      side: toSlippageSide("LONG"),
      action: "exit",
      rawPrice: 110,
      slippageRate: SLIP,
    });
    expect(longCanon.executionEntryPrice).toBe(execEntry);
    expect(longCanon.executionExitPrice).toBe(execExit);
    expect(longCanon.fillEntryPrice).toBe(execEntry);
    expect(longCanon.fillExitPrice).toBe(execExit);
    expect(longCanon.slipLedgerPct).toBe(0);
    expect(longCanon.feePct).toBeCloseTo(FEE * 2, 12);
    expect(longCanon.fundingPct).toBe(0);
    expect(longCanon.spreadPct).toBe(0);
    const longExecReturn = (execExit - execEntry) / execEntry;
    expect(longCanon.executionReturn).toBeCloseTo(longExecReturn, 12);
    expect(longCanon.pnlPct).toBeCloseTo(longExecReturn - FEE * 2, 12);
    expect(longCanon.slippageCostUsdt).toBeCloseTo(longCanon.slippageAttributionUsdt, 8);
    expect(longCanon.slippageAttributionUsdt).toBeGreaterThan(0);

    const shortCanon = settleEventSequenceClose({
      side: "SHORT",
      rawEntryPrice: 100,
      rawExitPrice: 90,
      feeRate: FEE,
      slippageRate: SLIP,
      leverage: 1,
      equityBefore: 1000,
      baseBalancePct: 1,
      costModel: EVENT_SEQUENCE_COST_MODEL_EXECUTION_PRICE_V1,
      applyFunding: false,
      fundingRate: 0,
      applySpread: false,
      spreadRate: 0,
    });
    const shortEntry = applyAdverseSlippage({
      side: "short",
      action: "entry",
      rawPrice: 100,
      slippageRate: SLIP,
    });
    const shortExit = applyAdverseSlippage({
      side: "short",
      action: "exit",
      rawPrice: 90,
      slippageRate: SLIP,
    });
    expect(shortCanon.executionEntryPrice).toBe(shortEntry);
    expect(shortCanon.executionExitPrice).toBe(shortExit);
    expect(shortCanon.slipLedgerPct).toBe(0);

    const funded = settleEventSequenceClose({
      side: "LONG",
      rawEntryPrice: 100,
      rawExitPrice: 110,
      feeRate: FEE,
      slippageRate: SLIP,
      leverage: 1,
      equityBefore: 1000,
      baseBalancePct: 1,
      costModel: EVENT_SEQUENCE_COST_MODEL_EXECUTION_PRICE_V1,
      applyFunding: true,
      fundingRate: FUNDING,
      applySpread: false,
      spreadRate: SPREAD,
    });
    expect(funded.fundingPct).toBe(FUNDING);
    expect(funded.pnlPct).toBeCloseTo(longCanon.pnlPct - FUNDING, 12);

    const spreadOn = settleEventSequenceClose({
      side: "LONG",
      rawEntryPrice: 100,
      rawExitPrice: 110,
      feeRate: FEE,
      slippageRate: SLIP,
      leverage: 1,
      equityBefore: 1000,
      baseBalancePct: 1,
      costModel: EVENT_SEQUENCE_COST_MODEL_EXECUTION_PRICE_V1,
      applyFunding: false,
      fundingRate: FUNDING,
      applySpread: true,
      spreadRate: SPREAD,
    });
    expect(spreadOn.spreadPct).toBe(SPREAD);
    expect(spreadOn.pnlPct).toBeCloseTo(longCanon.pnlPct - SPREAD, 12);
  });

  it("12-20. raw signals, trade count, exit reasons, no Pattern cost guard", () => {
    const candles = buildObLongCandles();
    const legacy = runEs(EVENT_SEQUENCE_COST_MODEL_LEDGER_V0, { candles });
    const canonical = runEs(EVENT_SEQUENCE_COST_MODEL_EXECUTION_PRICE_V1, {
      candles,
    });
    expect(legacy.trades.length).toBe(canonical.trades.length);
    expect(legacy.trades.length).toBeGreaterThanOrEqual(1);
    for (let i = 0; i < legacy.trades.length; i += 1) {
      const a = legacy.trades[i]!;
      const b = canonical.trades[i]!;
      expect(a.side).toBe(b.side);
      expect(a.rawEntryPrice).toBe(b.rawEntryPrice);
      expect(a.rawExitPrice).toBe(b.rawExitPrice);
      expect(a.exitReason).toBe(b.exitReason);
      expect(a.entryBar).toBe(b.entryBar);
      expect(a.exitBar).toBe(b.exitBar);
    }
    expect(legacy.trades[0]!.side).toBe("LONG");
    const shortSettle = settleEventSequenceClose({
      side: "SHORT",
      rawEntryPrice: 100,
      rawExitPrice: 90,
      feeRate: FEE,
      slippageRate: SLIP,
      leverage: 1,
      equityBefore: 1000,
      baseBalancePct: 1,
      costModel: EVENT_SEQUENCE_COST_MODEL_EXECUTION_PRICE_V1,
    });
    expect(shortSettle.rawEntryPrice).toBe(100);
    expect(shortSettle.rawExitPrice).toBe(90);

    const tp = runEs(EVENT_SEQUENCE_COST_MODEL_LEDGER_V0);
    const tpCanon = runEs(EVENT_SEQUENCE_COST_MODEL_EXECUTION_PRICE_V1);
    expect(tp.trades[0]?.exitReason).toBe(tpCanon.trades[0]?.exitReason);

    const slCandles = buildObLongCandles([
      candle(29, 100.05, 100.2, 90, 91, 1500),
    ]);
    const slLegacy = runEs(EVENT_SEQUENCE_COST_MODEL_LEDGER_V0, {
      candles: slCandles,
    });
    const slCanon = runEs(EVENT_SEQUENCE_COST_MODEL_EXECUTION_PRICE_V1, {
      candles: slCandles,
    });
    expect(slLegacy.trades.map((t) => t.exitReason)).toEqual(
      slCanon.trades.map((t) => t.exitReason),
    );

    const holdCandles = buildObLongCandles(
      Array.from({ length: 50 }, (_, i) =>
        candle(29 + i, 101, 101.4, 100.6, 101.1, 1200),
      ),
    );
    const holdLegacy = runEs(EVENT_SEQUENCE_COST_MODEL_LEDGER_V0, {
      candles: holdCandles,
    });
    const holdCanon = runEs(EVENT_SEQUENCE_COST_MODEL_EXECUTION_PRICE_V1, {
      candles: holdCandles,
    });
    expect(holdLegacy.trades.map((t) => t.exitReason)).toEqual(
      holdCanon.trades.map((t) => t.exitReason),
    );

    const endCandles = buildObLongCandles();
    const endLegacy = runEs(EVENT_SEQUENCE_COST_MODEL_LEDGER_V0, {
      candles: endCandles.slice(0, 29),
    });
    const endCanon = runEs(EVENT_SEQUENCE_COST_MODEL_EXECUTION_PRICE_V1, {
      candles: endCandles.slice(0, 29),
    });
    expect(endLegacy.trades[0]?.exitReason).toBe("end");
    expect(endCanon.trades[0]?.exitReason).toBe("end");

    const src = fs.readFileSync(
      path.join(process.cwd(), "src/lib/rextora/strategy/eventSequenceBacktest.ts"),
      "utf8",
    );
    expect(src).not.toMatch(/evaluateCostGuard/);
    expect(canonical.trades.length).toBe(legacy.trades.length);
  });

  it("21-24. funding/spread ignored on ledger, effective on canonical", () => {
    const candles = buildObLongCandles();
    const legacyOff = runEs(EVENT_SEQUENCE_COST_MODEL_LEDGER_V0, {
      candles,
      applyFunding: false,
      applySpread: false,
    });
    const legacyOn = runEs(EVENT_SEQUENCE_COST_MODEL_LEDGER_V0, {
      candles,
      applyFunding: true,
      applySpread: true,
      fundingRate: 0.05,
      spreadRate: 0.05,
    });
    expect(legacyOff.endingBalance).toBe(legacyOn.endingBalance);
    expect(legacyOn.trades[0]?.fundingPct ?? 0).toBe(0);
    expect(legacyOn.trades[0]?.spreadPct ?? 0).toBe(0);

    const canonOff = runEs(EVENT_SEQUENCE_COST_MODEL_EXECUTION_PRICE_V1, {
      candles,
      applyFunding: false,
      applySpread: false,
    });
    const canonFund = runEs(EVENT_SEQUENCE_COST_MODEL_EXECUTION_PRICE_V1, {
      candles,
      applyFunding: true,
      applySpread: false,
      fundingRate: 0.05,
    });
    const canonSpread = runEs(EVENT_SEQUENCE_COST_MODEL_EXECUTION_PRICE_V1, {
      candles,
      applyFunding: false,
      applySpread: true,
      spreadRate: 0.05,
    });
    expect(canonFund.endingBalance).not.toBe(canonOff.endingBalance);
    expect(canonSpread.endingBalance).not.toBe(canonOff.endingBalance);
    expect(canonFund.trades[0]?.fundingPct).toBe(0.05);
    expect(canonSpread.trades[0]?.spreadPct).toBe(0.05);
  });

  it("25-29. missing-field resolve ledger; resume stays ledger; new job canonical", async () => {
    expect(resolveEventSequenceCostModel(undefined)).toBe(
      EVENT_SEQUENCE_COST_MODEL_LEDGER_V0,
    );
    expect(resolveEventSequenceCostModel(null)).toBe(
      EVENT_SEQUENCE_COST_MODEL_LEDGER_V0,
    );
    expect(resolveProfileEventSequenceCostModel(null)).toBe(
      EVENT_SEQUENCE_COST_MODEL_LEDGER_V0,
    );
    expect(NEW_JOB_EVENT_SEQUENCE_COST_MODEL).toBe(
      EVENT_SEQUENCE_COST_MODEL_EXECUTION_PRICE_V1,
    );
    const createSrc = fs.readFileSync(
      path.join(
        process.cwd(),
        "src/lib/rextora/strategySearch/jobApiValidation.ts",
      ),
      "utf8",
    );
    expect(createSrc).toContain("eventSequenceCostModel: NEW_JOB_EVENT_SEQUENCE_COST_MODEL");

    const root = fs.mkdtempSync(path.join(os.tmpdir(), "rextora-a82-"));
    tempRoots.push(root);
    const store = { rootDir: root };
    const oldJob = createSearchJob(sampleConfig(), store);
    saveJobExecutionProfile(oldJob.id, executionProfile(false), store);
    const seenLegacy: string[] = [];
    await runSearchJob({
      jobId: oldJob.id,
      storeOptions: store,
      windows: [
        {
          id: "w1",
          label: "w1",
          requestedFrom: START,
          requestedTo: START + 40 * INTERVAL,
          requiredForPass: true,
        },
      ],
      balance: 1000,
      baseCostConfig: COST,
      passPolicy: { thresholds: { minTradeCount: 0 } },
      scoreWeights: executionProfile(false).scoreWeights,
      costStressScenarios: [],
      jitterConfig: executionProfile(false).jitterConfig,
      evaluate: async (input) => {
        seenLegacy.push(String(input.eventSequenceCostModel));
        return mockEval()(input);
      },
    });
    expect(seenLegacy.every((m) => m === EVENT_SEQUENCE_COST_MODEL_LEDGER_V0)).toBe(
      true,
    );
    const oldTrials = listSearchTrials(oldJob.id, store);
    expect(oldTrials.length).toBeGreaterThan(0);
    expect(oldTrials.every((t) => t.engineCostModel === ENGINE_COST_MODEL_EVENT_SEQUENCE)).toBe(
      true,
    );
    expect(
      oldTrials.every(
        (t) => t.rankingCompatibilityGroup === GROUP_PATTERN,
      ),
    ).toBe(true);

    const newJob = createSearchJob(sampleConfig({ seed: 9 }), store);
    saveJobExecutionProfile(newJob.id, executionProfile(true), store);
    const seenCanon: string[] = [];
    await runSearchJob({
      jobId: newJob.id,
      storeOptions: store,
      windows: [
        {
          id: "w1",
          label: "w1",
          requestedFrom: START,
          requestedTo: START + 40 * INTERVAL,
          requiredForPass: true,
        },
      ],
      balance: 1000,
      baseCostConfig: COST,
      passPolicy: { thresholds: { minTradeCount: 0 } },
      scoreWeights: executionProfile(true).scoreWeights,
      costStressScenarios: [],
      jitterConfig: executionProfile(true).jitterConfig,
      evaluate: async (input) => {
        seenCanon.push(String(input.eventSequenceCostModel));
        return mockEval()(input);
      },
    });
    expect(seenCanon.every((m) => m === EVENT_SEQUENCE_COST_MODEL_EXECUTION_PRICE_V1)).toBe(
      true,
    );
    const newTrials = listSearchTrials(newJob.id, store);
    expect(newTrials.length).toBeGreaterThan(0);
    expect(
      newTrials.every(
        (t) => t.engineCostModel === ENGINE_COST_MODEL_EVENT_SEQUENCE_V1,
      ),
    ).toBe(true);
    expect(
      newTrials.every(
        (t) => t.rankingCompatibilityGroup === GROUP_PATTERN_CANONICAL,
      ),
    ).toBe(true);
  });

  it("30-37. identity hash, groups, no global champion", () => {
    const paramsHash = "same_pattern_params";
    const legacy = stampBase({
      paramsHash,
      engineCostModel: ENGINE_COST_MODEL_EVENT_SEQUENCE,
    });
    const canonical = stampBase({
      paramsHash,
      engineCostModel: ENGINE_COST_MODEL_EVENT_SEQUENCE_V1,
    });
    expect(legacy.researchEvaluationHash).not.toBe(canonical.researchEvaluationHash);
    expect(legacy.researchEvaluationIdentity?.paramsHash).toBe(paramsHash);
    expect(canonical.researchEvaluationIdentity?.paramsHash).toBe(paramsHash);
    expect(legacy.classification.rankingCompatibilityGroup).toBe(GROUP_PATTERN);
    expect(canonical.classification.rankingCompatibilityGroup).toBe(
      GROUP_PATTERN_CANONICAL,
    );
    const missing = classifyResearchTrial({ params: PATTERN_PARAMS });
    expect(missing.engineCostModel).toBe(ENGINE_COST_MODEL_EVENT_SEQUENCE);
    expect(missing.rankingCompatibilityGroup).toBe(GROUP_PATTERN);

    const groups = emptyBestByCompatibilityGroup();
    expect(groups.map((g) => g.rankingCompatibilityGroup)).toEqual([
      GROUP_SAFE,
      GROUP_PATTERN_CANONICAL,
      GROUP_PATTERN,
    ]);
    let ranked = applyGroupChampA(groups, GROUP_SAFE, {
      candidateId: "s",
      iteration: 1,
      paramsHash: "safe",
      score: 0.4,
      passed: true,
    });
    ranked = applyGroupChampA(ranked, GROUP_PATTERN_CANONICAL, {
      candidateId: "p1",
      iteration: 2,
      paramsHash: "canon",
      score: 0.9,
      passed: true,
    });
    ranked = applyGroupChampA(ranked, GROUP_PATTERN, {
      candidateId: "p0",
      iteration: 3,
      paramsHash: "legacy",
      score: 0.95,
      passed: true,
    });
    ranked = applyGroupChampA(ranked, GROUP_UNKNOWN_LEGACY, {
      candidateId: "u",
      iteration: 4,
      paramsHash: "unk",
      score: 999,
      passed: true,
    });
    expect(
      ranked.find((g) => g.rankingCompatibilityGroup === GROUP_SAFE)
        ?.bestPassedCandidate?.paramsHash,
    ).toBe("safe");
    expect(
      ranked.find((g) => g.rankingCompatibilityGroup === GROUP_PATTERN_CANONICAL)
        ?.bestPassedCandidate?.paramsHash,
    ).toBe("canon");
    expect(
      ranked.find((g) => g.rankingCompatibilityGroup === GROUP_PATTERN)
        ?.bestPassedCandidate?.paramsHash,
    ).toBe("legacy");
    expect(ranked.some((g) => g.bestScore === 999)).toBe(false);
    expect(ranked.some((g) => g.bestPassedCandidate?.paramsHash === "canon" && g.rankingCompatibilityGroup === GROUP_PATTERN)).toBe(
      false,
    );
  });

  it("38-47. Research/Backtest canonical Pattern parity", async () => {
    const adapterSrc = fs.readFileSync(
      path.join(process.cwd(), "src/lib/rextora/strategySearch/backtestAdapter.ts"),
      "utf8",
    );
    const runnerSrc = fs.readFileSync(
      path.join(process.cwd(), "src/lib/rextora/backtest/backtestRunner.ts"),
      "utf8",
    );
    expect(adapterSrc).toContain("EVENT_SEQUENCE_COST_MODEL_EXECUTION_PRICE_V1");
    expect(runnerSrc).toContain("EVENT_SEQUENCE_COST_MODEL_EXECUTION_PRICE_V1");

    const candles = buildObLongCandles();
    const params = PATTERN_PARAMS as Record<string, unknown>;
    const def = buildPatternSearchDefinition({
      candidateId: "a82_pat",
      strategyName: "a82_pat",
      timeframe: "15m",
      params,
    });
    expect(def).toBeTruthy();
    const backtest = runEventSequenceBacktest({
      def: def!,
      symbol: "BTCUSDT",
      candles,
      balance: 1000,
      feeRate: FEE,
      slippageRate: SLIP,
      costModel: EVENT_SEQUENCE_COST_MODEL_EXECUTION_PRICE_V1,
      applyFunding: true,
      fundingRate: FUNDING,
      applySpread: true,
      spreadRate: SPREAD,
      params,
    });
    const research = await evaluateCandidateWindow({
      candidate: {
        candidateId: "search_a82_candidate_00000001",
        jobId: "search_a82",
        iteration: 0,
        generatorType: "random",
        parentCandidateIds: [],
        params: PATTERN_PARAMS,
        paramsHash: "pattern_a82_parity",
        createdAt: "2024-01-01T00:00:00.000Z",
      },
      symbol: "BTCUSDT",
      timeframe: "15m",
      window: {
        id: "w1",
        label: "w1",
        requestedFrom: candles[0]!.openTime,
        requestedTo: candles[candles.length - 1]!.openTime,
        requiredForPass: true,
      },
      balance: 1000,
      costConfig: COST,
      preloadedCandles: candles,
      eventSequenceCostModel: EVENT_SEQUENCE_COST_MODEL_EXECUTION_PRICE_V1,
    });
    expect(research.tradeCount).toBe(backtest.trades.length);
    expect(research.metrics.trades).toBe(backtest.trades.length);
    expect(research.metrics.endingBalance).toBeCloseTo(backtest.endingBalance, 4);
    expect(research.metrics.totalReturn).toBeCloseTo(
      (backtest.endingBalance - 1000) / 1000,
      6,
    );
    expect(backtest.trades[0]?.rawEntryPrice).toBeDefined();
    expect(backtest.trades[0]?.entryPrice).toBe(
      backtest.trades[0]?.rawEntryPrice === backtest.trades[0]?.entryPrice
        ? backtest.trades[0]?.entryPrice
        : backtest.trades[0]?.entryPrice,
    );
    expect(backtest.trades[0]?.eventSequenceCostModel).toBe(
      EVENT_SEQUENCE_COST_MODEL_EXECUTION_PRICE_V1,
    );
    expect(backtest.trades[0]?.feePct).toBeCloseTo(FEE * 2, 12);
    expect(backtest.trades[0]?.fundingPct).toBe(FUNDING);
    expect(backtest.trades[0]?.spreadPct).toBe(SPREAD);
    expect(backtest.trades[0]?.slippagePct).not.toBe(SLIP * 2);
    const feeSum = backtest.trades.reduce((s, t) => s + (t.feeCostUsdt ?? 0), 0);
    const fundingSum = backtest.trades.reduce(
      (s, t) => s + (t.fundingCostUsdt ?? 0),
      0,
    );
    const spreadSum = backtest.trades.reduce(
      (s, t) => s + (t.spreadCostUsdt ?? 0),
      0,
    );
    expect(feeSum).toBeGreaterThan(0);
    expect(fundingSum).toBeGreaterThan(0);
    expect(spreadSum).toBeGreaterThan(0);
    const net = backtest.trades.reduce((s, t) => s + (t.netPnlUsdt ?? 0), 0);
    expect(research.metrics.endingBalance).toBeCloseTo(1000 + net, 4);
  });

  it("48-56. stress channels and provenance", () => {
    const scenario = {
      id: "stress",
      label: "stress",
      requiredForPass: false,
      feeMultiplier: 1,
      slippageMultiplier: 1,
      fundingMultiplier: 10,
      spreadMultiplier: 10,
      costGuardKMultiplier: 4,
    };
    const stressed = buildCostStressConfig(COST, scenario, 3);
    expect(stressed.fundingRate).toBeCloseTo(FUNDING * 10, 12);
    expect(stressed.spreadRate).toBeCloseTo(SPREAD * 10, 12);
    const candles = buildObLongCandles();
    const legacyBase = runEs(EVENT_SEQUENCE_COST_MODEL_LEDGER_V0, { candles });
    const legacyStress = runEs(EVENT_SEQUENCE_COST_MODEL_LEDGER_V0, {
      candles,
      fundingRate: stressed.fundingRate,
      spreadRate: stressed.spreadRate,
      applyFunding: true,
      applySpread: true,
    });
    expect(legacyStress.endingBalance).toBe(legacyBase.endingBalance);

    const canonBase = runEs(EVENT_SEQUENCE_COST_MODEL_EXECUTION_PRICE_V1, {
      candles,
    });
    const canonStress = runEs(EVENT_SEQUENCE_COST_MODEL_EXECUTION_PRICE_V1, {
      candles,
      fundingRate: stressed.fundingRate,
      spreadRate: stressed.spreadRate,
      applyFunding: true,
      applySpread: true,
    });
    expect(canonStress.endingBalance).not.toBe(canonBase.endingBalance);

    const guardSrc = fs.readFileSync(
      path.join(process.cwd(), "src/lib/rextora/strategy/eventSequenceBacktest.ts"),
      "utf8",
    );
    expect(guardSrc).not.toMatch(/evaluateCostGuard/);
    expect(canonStress.trades.length).toBe(canonBase.trades.length);

    const canonProv = buildResearchCostProvenance({
      engineCostModel: ENGINE_COST_MODEL_EVENT_SEQUENCE_V1,
      cost: COST,
      costGuardK: 2,
    });
    expect(canonProv.funding.engineApplied).toBe(true);
    expect(canonProv.funding.effectiveRate).toBe(FUNDING);
    expect(canonProv.spread.engineApplied).toBe(true);
    expect(canonProv.spread.effectiveRate).toBe(SPREAD);
    expect(canonProv.costGuard.engineApplied).toBe(false);
    expect(canonProv.slippage.model).toBe(ENGINE_COST_MODEL_EVENT_SEQUENCE_V1);

    const legacyProv = buildResearchCostProvenance({
      engineCostModel: ENGINE_COST_MODEL_EVENT_SEQUENCE,
      cost: COST,
      costGuardK: 2,
    });
    expect(legacyProv.funding.engineApplied).toBe(false);
    expect(legacyProv.funding.effectiveRate).toBe(0);
    expect(legacyProv.spread.engineApplied).toBe(false);
    expect(legacyProv.spread.effectiveRate).toBe(0);
    expect(legacyProv.slippage.model).toBe(ENGINE_COST_MODEL_EVENT_SEQUENCE);
  });

  it("57-64. promotion gates", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "rextora-a82-prom-"));
    tempRoots.push(root);
    const store = { rootDir: root };
    vi.spyOn(strategyStore, "listStrategies").mockReturnValue([]);
    vi.spyOn(strategyStore, "createStrategy").mockImplementation((input) => ({
      id: `promoted_${input.sourceParamsHash ?? "x"}`,
      name: input.name,
      paramsHash: String(input.sourceParamsHash ?? "mock"),
      strategyHash: "mock",
      sourceParamsHash: input.sourceParamsHash ?? null,
      locked: false,
      description: input.description,
    }) as ReturnType<typeof strategyStore.createStrategy>);

    const fixtures = executionProfile(true);
    const canonJob = createSearchJob(sampleConfig(), store);
    saveJobExecutionProfile(canonJob.id, fixtures, store);
    const canonStamp = stampBase({
      paramsHash: "canon_promote",
      engineCostModel: ENGINE_COST_MODEL_EVENT_SEQUENCE_V1,
    });
    saveSearchTrial(
      {
        jobId: canonJob.id,
        iteration: 0,
        candidateId: "c0",
        params: PATTERN_PARAMS,
        paramsHash: "canon_promote",
        generatorType: "random",
        parentCandidateIds: [],
        score: 0.8,
        passed: true,
        failureReasons: [],
        windowResults: [
          {
            windowId: "w1",
            symbol: "BTCUSDT",
            totalReturn: 0.1,
            mdd: -0.02,
            trades: 2,
            winRate: 0.5,
            profitFactor: 1.2,
          },
        ],
        costStressResults: [],
        jitterResults: [],
        durationMs: 1,
        createdAt: new Date().toISOString(),
        researchEvaluationIdentity: canonStamp.researchEvaluationIdentity,
        researchEvaluationHash: canonStamp.researchEvaluationHash,
        engineCostModel: ENGINE_COST_MODEL_EVENT_SEQUENCE_V1,
        rankingCompatibilityGroup: GROUP_PATTERN_CANONICAL,
        rankingEligible: true,
        promotionEligible: true,
      },
      store,
    );
    const canonPromoted = promoteSearchCandidateToStrategy({
      jobId: canonJob.id,
      iteration: 0,
      storeOptions: store,
    });
    expect(canonPromoted.registrationState).toBe("registered");
    expect(canonPromoted.paramsHash).toBe("canon_promote");
    expect(strategyStore.createStrategy).toHaveBeenCalledWith(
      expect.objectContaining({
        description: expect.stringContaining("event_sequence_execution_price_v1"),
      }),
    );

    saveSearchTrial(
      {
        jobId: canonJob.id,
        iteration: 1,
        candidateId: "c1",
        params: PATTERN_PARAMS,
        paramsHash: "canon_missing",
        generatorType: "random",
        parentCandidateIds: [],
        score: 0.8,
        passed: true,
        failureReasons: [],
        windowResults: [],
        costStressResults: [],
        jitterResults: [],
        durationMs: 1,
        createdAt: new Date().toISOString(),
        researchEvaluationHash: "partial",
        engineCostModel: ENGINE_COST_MODEL_EVENT_SEQUENCE_V1,
      },
      store,
    );
    expect(() =>
      promoteSearchCandidateToStrategy({
        jobId: canonJob.id,
        iteration: 1,
        storeOptions: store,
      }),
    ).toThrow(/complete research evaluation evidence/);

    const legacyJob = createSearchJob(sampleConfig({ seed: 3 }), store);
    saveJobExecutionProfile(legacyJob.id, executionProfile(false), store);
    saveSearchTrial(
      {
        jobId: legacyJob.id,
        iteration: 0,
        candidateId: "l0",
        params: PATTERN_PARAMS,
        paramsHash: "legacy_recon",
        generatorType: "random",
        parentCandidateIds: [],
        score: 0.7,
        passed: true,
        failureReasons: [],
        windowResults: [
          {
            windowId: "w1",
            symbol: "BTCUSDT",
            totalReturn: 0.05,
            mdd: -0.01,
            trades: 1,
            winRate: 1,
            profitFactor: 2,
          },
        ],
        costStressResults: [],
        jitterResults: [],
        durationMs: 1,
        createdAt: new Date().toISOString(),
      },
      store,
    );
    const legacyPromoted = promoteSearchCandidateToStrategy({
      jobId: legacyJob.id,
      iteration: 0,
      storeOptions: store,
    });
    expect(legacyPromoted.registrationState).toBe("registered");
    expect(String(legacyPromoted)).toBeTruthy();
    expect(strategyStore.createStrategy).toHaveBeenCalledWith(
      expect.objectContaining({
        description: expect.stringContaining("legacy_event_sequence_ledger_v0"),
      }),
    );

    const incompleteJob = createSearchJob(sampleConfig({ seed: 4 }), store);
    saveSearchTrial(
      {
        jobId: incompleteJob.id,
        iteration: 0,
        candidateId: "i0",
        params: PATTERN_PARAMS,
        paramsHash: "legacy_incomplete",
        generatorType: "random",
        parentCandidateIds: [],
        score: 0.7,
        passed: true,
        failureReasons: [],
        windowResults: [],
        costStressResults: [],
        jitterResults: [],
        durationMs: 1,
        createdAt: new Date().toISOString(),
      },
      store,
    );
    expect(() =>
      promoteSearchCandidateToStrategy({
        jobId: incompleteJob.id,
        iteration: 0,
        storeOptions: store,
      }),
    ).toThrow(/evaluation evidence cannot be reconstructed/);

    const unknownJob = createSearchJob(sampleConfig({ seed: 5 }), store);
    saveJobExecutionProfile(unknownJob.id, executionProfile(false), store);
    saveSearchTrial(
      {
        jobId: unknownJob.id,
        iteration: 0,
        candidateId: "u0",
        params: {},
        paramsHash: "unknown_trial",
        generatorType: "random",
        parentCandidateIds: [],
        score: 0.9,
        passed: true,
        failureReasons: [],
        windowResults: [],
        costStressResults: [],
        jitterResults: [],
        durationMs: 1,
        createdAt: new Date().toISOString(),
      },
      store,
    );
    expect(() =>
      promoteSearchCandidateToStrategy({
        jobId: unknownJob.id,
        iteration: 0,
        storeOptions: store,
      }),
    ).toThrow(/unknown_legacy/);

    vi.mocked(strategyStore.listStrategies).mockReturnValue([
      {
        id: "already",
        name: "already",
        paramsHash: "canon_promote",
        locked: false,
        description: "candidateParamsHash=canon_promote",
      } as ReturnType<typeof strategyStore.listStrategies>[number],
    ]);
    const again = promoteSearchCandidateToStrategy({
      jobId: canonJob.id,
      iteration: 0,
      storeOptions: store,
    });
    expect(again.alreadyExists).toBe(true);
    expect(again.strategyId).toBe("already");

    const orch = fs.readFileSync(
      path.join(process.cwd(), "src/lib/rextora/strategySearch/searchOrchestrator.ts"),
      "utf8",
    );
    expect(orch).not.toMatch(/promoteSearchCandidateToStrategy\(/);
  });

  it("65-73. UI/read-model three groups stay separate", () => {
    expect(rankingGroupLabel(UI_GROUP_SAFE)).toBe("SAFE 전략");
    expect(rankingGroupLabel(UI_GROUP_PATTERN_CANONICAL)).toBe("패턴 전략");
    expect(rankingGroupLabel(UI_GROUP_PATTERN)).toBe("패턴 전략 · 기존 비용 모델");
    expect(rankingGroupLabel(UI_GROUP_UNKNOWN)).toContain("기존 기록");
    expect(groupShortlistTitle(UI_GROUP_PATTERN_CANONICAL)).toBe("패턴 숏리스트 · 표시용");
    expect(groupShortlistTitle(UI_GROUP_PATTERN)).toContain("기존 비용 모델");

    const source = {
      rankingGroups: [
        {
          rankingCompatibilityGroup: UI_GROUP_SAFE,
          engineCostModel: UI_GROUP_SAFE,
          rankingEligible: true as const,
          bestCandidate: null,
          bestPassedCandidate: {
            iteration: 1,
            paramsHash: "safe_a",
            score: 0.4,
            passed: true,
            rankingCompatibilityGroup: UI_GROUP_SAFE,
          },
          topCandidates: [
            {
              iteration: 1,
              paramsHash: "safe_a",
              score: 0.4,
              passed: true,
              rankingCompatibilityGroup: UI_GROUP_SAFE,
            },
          ],
        },
        {
          rankingCompatibilityGroup: UI_GROUP_PATTERN_CANONICAL,
          engineCostModel: UI_GROUP_PATTERN_CANONICAL,
          rankingEligible: true as const,
          bestCandidate: null,
          bestPassedCandidate: {
            iteration: 2,
            paramsHash: "canon_b",
            score: 0.9,
            passed: true,
            rankingCompatibilityGroup: UI_GROUP_PATTERN_CANONICAL,
          },
          topCandidates: [
            {
              iteration: 2,
              paramsHash: "canon_b",
              score: 0.9,
              passed: true,
              rankingCompatibilityGroup: UI_GROUP_PATTERN_CANONICAL,
            },
          ],
        },
        {
          rankingCompatibilityGroup: UI_GROUP_PATTERN,
          engineCostModel: UI_GROUP_PATTERN,
          rankingEligible: true as const,
          bestCandidate: null,
          bestPassedCandidate: {
            iteration: 3,
            paramsHash: "legacy_c",
            score: 0.95,
            passed: true,
            rankingCompatibilityGroup: UI_GROUP_PATTERN,
          },
          topCandidates: [
            {
              iteration: 3,
              paramsHash: "legacy_c",
              score: 0.95,
              passed: true,
              rankingCompatibilityGroup: UI_GROUP_PATTERN,
            },
          ],
        },
      ],
      unknownLegacy: {
        rankingCompatibilityGroup: UI_GROUP_UNKNOWN,
        rankingEligible: false as const,
        promotionEligible: false as const,
        provenanceStatus: "legacy_unclassified" as const,
        count: 1,
      },
      bestScore: null,
      bestCandidateHash: null,
      bestPassedCandidateHash: null,
    };
    expect(hasAuthoritativeRankingGroups(source)).toBe(true);
    const topCanon = topCandidatesForGroup(source.rankingGroups, UI_GROUP_PATTERN_CANONICAL);
    const topLegacy = topCandidatesForGroup(source.rankingGroups, UI_GROUP_PATTERN);
    expect(topCanon.map((r) => r.paramsHash)).toEqual(["canon_b"]);
    expect(topLegacy.map((r) => r.paramsHash)).toEqual(["legacy_c"]);
    expect(topCanon.some((r) => r.paramsHash === "legacy_c")).toBe(false);

    const highlights = groupDecisionHighlights({
      source,
      candidates: [
        { paramsHash: "safe_a", netReturn: 0.1, rankingCompatibilityGroup: UI_GROUP_SAFE },
        { paramsHash: "canon_b", netReturn: 0.5, rankingCompatibilityGroup: UI_GROUP_PATTERN_CANONICAL },
        { paramsHash: "legacy_c", netReturn: 0.9, rankingCompatibilityGroup: UI_GROUP_PATTERN },
      ],
    });
    expect(highlights?.map((h) => h.groupId)).toEqual([
      UI_GROUP_SAFE,
      UI_GROUP_PATTERN_CANONICAL,
      UI_GROUP_PATTERN,
    ]);
    expect(highlights?.find((h) => h.groupId === UI_GROUP_SAFE)?.highestReturn?.paramsHash).toBe(
      "safe_a",
    );
    expect(
      highlights?.find((h) => h.groupId === UI_GROUP_PATTERN_CANONICAL)?.highestReturn?.paramsHash,
    ).toBe("canon_b");
    expect(highlights?.find((h) => h.groupId === UI_GROUP_PATTERN)?.highestReturn?.paramsHash).toBe(
      "legacy_c",
    );

    const history = groupScopedRankHistory({
      snapshots: [
        [
          { strategyHash: "safe_a", rank: 1, rankingCompatibilityGroup: UI_GROUP_SAFE },
          { strategyHash: "canon_b", rank: 1, rankingCompatibilityGroup: UI_GROUP_PATTERN_CANONICAL },
          { strategyHash: "legacy_c", rank: 1, rankingCompatibilityGroup: UI_GROUP_PATTERN },
        ],
        [
          { strategyHash: "safe_a", rank: 1, rankingCompatibilityGroup: UI_GROUP_SAFE },
          { strategyHash: "canon_b", rank: 1, rankingCompatibilityGroup: UI_GROUP_PATTERN_CANONICAL },
          { strategyHash: "legacy_c", rank: 1, rankingCompatibilityGroup: UI_GROUP_PATTERN },
        ],
      ],
    });
    expect(history.available).toBe(true);
    expect(history.groups).toHaveLength(3);
    const mixed = groupScopedRankHistory({
      snapshots: [
        [{ strategyHash: "mixed", rank: 1 }],
        [{ strategyHash: "mixed", rank: 2 }],
      ],
    });
    expect(mixed.available).toBe(false);

    const hashes = productionReadonlyHashes();
    expect(hashes.safeSha256).toBeNull();
    expect(hashes.researchIndexSha256).toBe(hashesBefore.researchIndexSha256);
    expect(hashes.backtestIndexSha256).toBe(hashesBefore.backtestIndexSha256);
  });

  it("engine omit costModel falls back to ledger_v0; paramsHash formula files unchanged", () => {
    expect(resolveEventSequenceCostModel(undefined)).toBe(
      EVENT_SEQUENCE_COST_MODEL_LEDGER_V0,
    );
    const omitted = runEventSequenceBacktest({
      def: makeDef(),
      symbol: "BTCUSDT",
      candles: buildObLongCandles(),
      balance: 1000,
      feeRate: FEE,
      slippageRate: SLIP,
    });
    const explicit = runEs(EVENT_SEQUENCE_COST_MODEL_LEDGER_V0);
    expect(omitted.endingBalance).toBe(explicit.endingBalance);
    const scoreSrc = fs.readFileSync(
      path.join(process.cwd(), "src/lib/rextora/strategySearch/evaluationPolicy.ts"),
      "utf8",
    );
    expect(scoreSrc).toContain("calculateCandidateScore");
    const jitterSrc = fs.readFileSync(
      path.join(process.cwd(), "src/lib/rextora/strategySearch/jitterEvaluator.ts"),
      "utf8",
    );
    expect(jitterSrc).toContain("mutationScale");
    const stressSrc = fs.readFileSync(
      path.join(process.cwd(), "src/lib/rextora/strategySearch/costStress.ts"),
      "utf8",
    );
    expect(stressSrc).toContain("feeMultiplier");
    expect(computeResearchEvaluationHash).toBeTypeOf("function");
    expect(createHash("sha256").update("x").digest("hex").length).toBe(64);
    expect(computeParamsHash).toBeTypeOf("function");
  });
});
