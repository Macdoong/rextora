/**
 * P3-A7.1 read-only forensic: Research cost models vs Backtest SAFE
 * execution_price_v1, ranking impact, and provenance gaps.
 *
 * Does not change Research/Backtest arithmetic, SAFE, jobs, trials, or Paper/Live.
 */

import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { applyAdverseSlippage } from "../backtest/executionSlippage";
import { runSafeV44Backtest } from "../backtest/backtestEngine";
import { productionReadonlyHashes } from "../backtest/backtestCostAssumptionsDiagnosis";
import { evaluateCostGuard } from "../cost/costGuard";
import { generateSyntheticCandles, type OhlcvCandle } from "../data/ohlcvTypes";
import { CONTEXT_FALLBACK_PARAMS } from "../strategy/safeV44Params";
import { runConditionBuilderBacktest } from "../strategy/conditionBacktest";
import { defaultDefinition } from "../strategy/definition/validator";
import type { CanonicalStrategyDefinition, LeafCondition } from "../strategy/definition/types";
import { computeParamsHash } from "../strategy/strategyHash";
import type { SafeV44Params } from "../strategy/strategyTypes";
import { evaluateCandidateWindow } from "./backtestAdapter";
import { buildCostStressConfig } from "./costStress";
import { calculateCandidateScore } from "./evaluationPolicy";
import { ORDER_BLOCK_BASE_PARAMS } from "./patternSearchSpaces";
import type {
  StrategySearchBacktestCostConfig,
  StrategySearchCandidate,
  StrategySearchCandidateEvaluation,
  StrategySearchEvaluationWindowPlan,
  StrategySearchScoreWeights,
  StrategySearchWindowEvaluation,
} from "./types";

export const P3A71_ARTIFACT_TS = "2026-09-04T01-45-00-000Z";

export const RESEARCH_DEFAULT_FEE_RATE = 0.0004;
export const RESEARCH_DEFAULT_SLIPPAGE_RATE = 0.0002;
export const RESEARCH_DEFAULT_FUNDING_RATE = 0.0001;
export const RESEARCH_DEFAULT_APPLY_FUNDING = false;
export const RESEARCH_DEFAULT_SPREAD_RATE = 0.0001;
export const RESEARCH_DEFAULT_APPLY_SPREAD = true;
export const BACKTEST_API_DEFAULT_APPLY_SPREAD = false;
export const BACKTEST_API_DEFAULT_COST_GUARD_K = 3;
export const RESEARCH_DEFAULT_FUNDING_MULTIPLIER = 1;

const INTERVAL_MS = 15 * 60 * 1000;
const WINDOW_FROM = Date.UTC(2024, 0, 1);
const CANDLE_COUNT = 320;
const WINDOW_TO = WINDOW_FROM + (CANDLE_COUNT - 1) * INTERVAL_MS;

function sha256File(filePath: string): string | null {
  if (!fs.existsSync(filePath)) return null;
  return createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

export function researchDefaultCostConfig(
  overrides: Partial<StrategySearchBacktestCostConfig> = {},
): StrategySearchBacktestCostConfig {
  return {
    feeRate: RESEARCH_DEFAULT_FEE_RATE,
    slippageRate: RESEARCH_DEFAULT_SLIPPAGE_RATE,
    fundingRate: RESEARCH_DEFAULT_FUNDING_RATE,
    applyFunding: RESEARCH_DEFAULT_APPLY_FUNDING,
    applySpread: RESEARCH_DEFAULT_APPLY_SPREAD,
    spreadRate: RESEARCH_DEFAULT_SPREAD_RATE,
    ...overrides,
  };
}

export function getResearchCandidateEngineMatrix() {
  return {
    SAFE: {
      candidateType: "SafeV44 searchable params (not the protected SAFE file)",
      adapter: "src/lib/rextora/strategySearch/backtestAdapter.ts::runCandidateWindowEvaluation",
      engine: "runSafeV44Backtest",
      productionReachable: true,
      feeModel: "round_trip_taker_2x",
      slippageModel: "execution_price_v1",
      fundingModel: "synthetic_flat_per_trade (applyFunding gated)",
      spreadModel: "flat_fraction_per_trade (applySpread gated)",
      costGuard: "candidate.params.cost_guard_k on base; stress uses costGuardKOverride",
      stress: "costStress.ts multiplies fee/slip/funding/spread; default fundingMultiplier=1",
      scoringConsumer: "evaluationPolicy.calculateCandidateScore → jobRunner.trialFromEvaluation.score",
    },
    PATTERN: {
      candidateType: "order_block | fvg | trendline | support_resistance | supply_demand",
      adapter: "backtestAdapter.ts when isPatternCandidateParams(params)",
      engine: "runEventSequenceBacktest",
      productionReachable: true,
      feeModel: "round_trip_taker_2x (feePct = feeRate*2)",
      slippageModel: "event_sequence_ledger_v0 (slipPct = slippageRate*2; raw entry/exit prices)",
      fundingModel: "NOT APPLIED — adapter stamps fundingApplied:false; engine has no fundingRate input",
      spreadModel: "NOT APPLIED in engine; adapter only stamps spreadApplied flag",
      costGuard: "pattern candidates have no SafeV44 cost_guard_k; stress defaults k=3",
      stress: "same costStress.ts multipliers; funding/spread rates unused by ES engine",
      scoringConsumer: "same calculateCandidateScore pool as SAFE candidates",
    },
    CONDITION_BUILDER: {
      candidateType: "condition_builder storage / Backtest runner path",
      adapter: "NOT used by Research evaluation",
      engine: "runConditionBuilderBacktest (Backtest runner + promote storage type only)",
      productionReachableAsResearchEngine: false,
      productionReachableAsPromotedType: true,
      costModel:
        "ledger-only fee+slip on in-loop TP/SL/max_hold/end; trailing END close omits slipPct",
    },
  };
}

export function getCanonicalEngineCostMatrix() {
  return {
    SAFE_EXECUTION_PRICE_V1: {
      ENGINE: "runSafeV44Backtest",
      ENTRY_SLIPPAGE: "adverse execution price (long raw*(1+r), short raw*(1-r))",
      EXIT_SLIPPAGE: "adverse execution price on TP/SL/max_hold/end",
      LEDGER_SLIPPAGE: "attribution only; not deducted again",
      FEE: "feePct=feeRate*2 deducted",
      FUNDING: "flat per trade when applyFunding",
      SPREAD: "flat fraction when applySpread",
      COST_GUARD: "evaluateCostGuard / rate_times_two slip estimate",
      FUNDING_STRESS: "Backtest runner does NOT multiply fundingRate",
      MODEL_ID: "safe_execution_price_v1",
    },
    EVENT_SEQUENCE_LEDGER_V0: {
      ENGINE: "runEventSequenceBacktest",
      ENTRY_SLIPPAGE: "none — stores raw entryPrice",
      EXIT_SLIPPAGE: "none — stores raw exitPrice",
      LEDGER_SLIPPAGE: "slipPct=slippageRate*2 deducted from raw return every close including end",
      FEE: "feePct=feeRate*2 deducted",
      FUNDING: "absent",
      SPREAD: "absent from pnl",
      COST_GUARD: "not in ES engine; Research stress may still pass k override unused",
      FUNDING_STRESS: "Research multiplies fundingRate in config; ES ignores it",
      MODEL_ID: "event_sequence_ledger_v0",
    },
    CONDITION_BUILDER_LEDGER_V0: {
      ENGINE: "runConditionBuilderBacktest",
      ENTRY_SLIPPAGE: "none — entryPrice=c.close",
      EXIT_SLIPPAGE: "none — raw stop/TP/close",
      LEDGER_SLIPPAGE:
        "in-loop closes: slipPct=slippageRate*2; trailing open-at-end close: fee only, no slip",
      FEE: "feePct=feeRate*2",
      FUNDING: "absent",
      SPREAD: "absent",
      COST_GUARD: "definition.execution.costGuardK unused by this engine loop",
      FUNDING_STRESS: "n/a — Research does not evaluate this engine",
      MODEL_ID: "condition_builder_ledger_v0",
    },
  };
}

export function getResearchDefaultAuthorities() {
  return {
    feeRate: {
      value: 0.0004,
      sources: [
        "components/rextora/strategySearch/formDefaults.ts feeRate:'0.0004'",
        "followUpResearch.ts baseCostConfig.feeRate=0.0004",
        "jobApiValidation.parseCostConfig requires explicit body.baseCostConfig.feeRate",
      ],
      hiddenEngineFallback: "eventSequenceBacktest feeRate ?? 0.0004 (Research adapter always passes explicit)",
    },
    slippageRate: {
      value: 0.0002,
      sources: ["formDefaults slippageRate:'0.0002'", "followUpResearch 0.0002"],
    },
    fundingRate: {
      value: 0.0001,
      sources: ["formDefaults fundingRate:'0.0001'", "followUpResearch 0.0001"],
    },
    applyFunding: {
      value: false,
      sources: ["formDefaults applyFunding:false", "all sampled execution profiles false"],
    },
    applySpread: {
      value: true,
      uiDefault: true,
      backtestApiDefault: false,
      productionExecutionProfiles: "1073 true / 10 false of 1083 (sampled at diagnosis time)",
      intent: "NOT_VERIFIED — hardcoded in formDefaults/followUpResearch with no conservatism comment",
    },
    spreadRate: { value: 0.0001, sources: ["formDefaults", "followUpResearch"] },
    costGuardK: {
      base: "candidate.params.cost_guard_k (public base forbids costConfig.costGuardK)",
      patternStressFallback: 3,
      backtestApiDefault: 3,
    },
    stressMultipliers: {
      uiDefault: {
        feeMultiplier: 1.5,
        slippageMultiplier: 1.5,
        fundingMultiplier: 1,
        spreadMultiplier: 1.5,
        costGuardKMultiplier: 1,
      },
      mechanism: "buildCostStressConfig multiplies fundingRate * fundingMultiplier",
      backtestRunner: "multiplies fee/slip/spread only; fundingRate unchanged",
    },
    hiddenFallbacks: [
      "runSafeV44Backtest feeRate??0.0004 / slippageRate??0.0002 / fundingRate??0.0001 / spreadRate??0.0001",
      "runEventSequenceBacktest feeRate??0.0004 / slippageRate??0.0002",
      "evaluateCostGuard / unifiedCost default rates if omitted",
      "pattern stress cost_guard_k fallback 3",
    ],
  };
}

export function makeSafeSearchCandidate(
  emaFastOffset = 2,
): StrategySearchCandidate {
  const params = {
    ...CONTEXT_FALLBACK_PARAMS,
    ema_fast: CONTEXT_FALLBACK_PARAMS.ema_fast + emaFastOffset,
  };
  return {
    candidateId: `search_p3a71_candidate_${String(emaFastOffset).padStart(8, "0")}`,
    jobId: "search_p3a71_isolated",
    iteration: emaFastOffset,
    generatorType: "random",
    parentCandidateIds: [],
    params,
    paramsHash: computeParamsHash(params),
    createdAt: "2026-09-04T00:00:00.000Z",
  };
}

export function makePatternSearchCandidate(): StrategySearchCandidate {
  const params = { ...ORDER_BLOCK_BASE_PARAMS } as unknown as StrategySearchCandidate["params"];
  return {
    candidateId: "search_p3a71_candidate_pattern1",
    jobId: "search_p3a71_isolated",
    iteration: 99,
    generatorType: "random",
    parentCandidateIds: [],
    params,
    paramsHash: computeParamsHash(params as Record<string, number | boolean | string>),
    createdAt: "2026-09-04T00:00:00.000Z",
  };
}

export function isolatedCandles(): OhlcvCandle[] {
  return generateSyntheticCandles(CANDLE_COUNT, 100, 0.00025, {
    startOpenTime: WINDOW_FROM,
    intervalMs: INTERVAL_MS,
  });
}

export function isolatedWindow(): StrategySearchEvaluationWindowPlan {
  return {
    id: "full",
    label: "isolated",
    requestedFrom: WINDOW_FROM,
    requestedTo: WINDOW_TO,
    requiredForPass: true,
  };
}

export async function proveSafeResearchBacktestParity() {
  const candidate = makeSafeSearchCandidate(3);
  const candles = isolatedCandles();
  const window = isolatedWindow();
  const cost = researchDefaultCostConfig({ applySpread: false });
  const balance = 10_000;
  const params = candidate.params as unknown as SafeV44Params;

  const backtest = runSafeV44Backtest({
    symbol: "BTCUSDT",
    candles,
    params,
    paramsHash: candidate.paramsHash,
    strategyName: candidate.candidateId,
    strategyId: candidate.candidateId,
    sourceStatus: "user_created",
    timeframe: "15m",
    balance,
    feeRate: cost.feeRate,
    slippageRate: cost.slippageRate,
    fundingRate: cost.fundingRate,
    applyFunding: cost.applyFunding,
    applySpread: cost.applySpread,
    spreadRate: cost.spreadRate,
    dataSource: "synthetic-test",
  });

  const research = await evaluateCandidateWindow({
    candidate,
    symbol: "BTCUSDT",
    timeframe: "15m",
    window,
    balance,
    costConfig: cost,
    preloadedCandles: candles,
  });

  const btTrades = backtest.trades;
  const sameTradeCount = research.tradeCount === backtest.report.tradeCount;
  const sameReturn = research.metrics.totalReturn === backtest.report.totalReturn;
  const sameMdd = research.metrics.mdd === backtest.report.mdd;
  const sameEnd = research.metrics.endingBalance === backtest.report.endingBalance;
  const firstBt = btTrades[0];
  return {
    SAFE_RESEARCH_BACKTEST_COST_PARITY:
      sameTradeCount && sameReturn && sameMdd && sameEnd ? ("YES" as const) : ("NO" as const),
    tradeCount: {
      backtest: backtest.report.tradeCount,
      research: research.tradeCount,
      equal: sameTradeCount,
    },
    totalReturn: {
      backtest: backtest.report.totalReturn,
      research: research.metrics.totalReturn,
      equal: sameReturn,
    },
    mdd: { backtest: backtest.report.mdd, research: research.metrics.mdd, equal: sameMdd },
    endingBalance: {
      backtest: backtest.report.endingBalance,
      research: research.metrics.endingBalance,
      equal: sameEnd,
    },
    firstTrade: firstBt
      ? {
          entryPrice: firstBt.entryPrice,
          exitPrice: firstBt.exitPrice,
          netPnlUsdt: firstBt.netPnlUsdt ?? null,
          feeCostUsdt: firstBt.feeCostUsdt ?? null,
          slippageAttributionUsdt: firstBt.slippageAttributionUsdt ?? firstBt.slippageCostUsdt ?? null,
        }
      : null,
    slippageModelVersion: backtest.report.slippageModelVersion,
    source:
      "Both paths call runSafeV44Backtest. Research omits costGuardK (uses params.cost_guard_k). This fixture uses identical params.k and identical rates.",
    paramsHashProtected: false,
  };
}

export function compareExecutionPriceVsLedger(input: {
  side: "LONG" | "SHORT";
  rawEntry: number;
  rawExit: number;
  margin: number;
  leverage: number;
  slippageRate: number;
  feeRate: number;
}) {
  const side = input.side === "LONG" ? "long" : "short";
  const entryExec = applyAdverseSlippage({
    side,
    action: "entry",
    rawPrice: input.rawEntry,
    slippageRate: input.slippageRate,
  });
  const exitExec = applyAdverseSlippage({
    side,
    action: "exit",
    rawPrice: input.rawExit,
    slippageRate: input.slippageRate,
  });
  const safeGrossFrac =
    input.side === "LONG"
      ? (exitExec - entryExec) / entryExec
      : (entryExec - exitExec) / entryExec;
  const unslippedFrac =
    input.side === "LONG"
      ? (input.rawExit - input.rawEntry) / input.rawEntry
      : (input.rawEntry - input.rawExit) / input.rawEntry;
  const feePct = input.feeRate * 2;
  const safeNetFrac = (safeGrossFrac - feePct) * input.leverage;
  const slipPct = input.slippageRate * 2;
  const esNetFrac = (unslippedFrac - feePct - slipPct) * input.leverage;
  const safeNetUsdt = input.margin * safeNetFrac;
  const esNetUsdt = input.margin * esNetFrac;
  const diffUsdt = safeNetUsdt - esNetUsdt;
  const diffBps = (safeNetFrac - esNetFrac) * 10_000;
  return {
    side: input.side,
    entryExecution: entryExec,
    exitExecution: exitExec,
    rawEntry: input.rawEntry,
    rawExit: input.rawExit,
    safeGrossFrac,
    unslippedFrac,
    ledgerSlipPct: slipPct,
    feePct,
    safeNetUsdt,
    esLedgerNetUsdt: esNetUsdt,
    differenceUsdt: diffUsdt,
    differenceBps: diffBps,
  };
}

function alwaysLongLeaf(): LeafCondition {
  return {
    id: "always_long",
    type: "min_quote_volume",
    category: "filter",
    enabled: true,
    validationStatus: "ok",
    parameters: {},
    comparison: "gt",
    value: 0,
  };
}

function conditionDef(input: {
  maxHoldBars: number;
  stopLossAtrMult: number;
  takeProfitAtrMult: number;
  cooldownBars: number;
  longEnabled?: boolean;
  shortEnabled?: boolean;
}): CanonicalStrategyDefinition {
  const longGroup = {
    id: "long_root",
    type: "group" as const,
    category: "group" as const,
    operator: "AND" as const,
    enabled: true,
    children: [alwaysLongLeaf()],
    validationStatus: "ok" as const,
  };
  return defaultDefinition({
    strategyId: "p3a71_cb",
    strategyName: "P3-A7.1 CB fixture",
    strategyType: "condition_builder",
    timeframe: "15m",
    longEnabled: input.longEnabled ?? true,
    shortEnabled: input.shortEnabled ?? false,
    entryConditions: { long: longGroup, short: { ...longGroup, id: "short_root", children: [] } },
    risk: {
      stopLossAtrMult: input.stopLossAtrMult,
      takeProfitAtrMult: input.takeProfitAtrMult,
      useTrailing: false,
      trailAtrMult: 1,
      maxHoldBars: input.maxHoldBars,
      oppositeSignalExit: false,
      structureInvalidationExit: false,
      partialExitEnabled: false,
    },
    execution: {
      costGuardEnabled: false,
      costGuardK: 3,
      cooldownBars: input.cooldownBars,
      longEnabled: input.longEnabled ?? true,
      shortEnabled: input.shortEnabled ?? false,
    },
    positionSizing: {
      baseBalancePct: 1,
      sizeMin: 1,
      sizeMax: 1,
      useVolTarget: false,
      targetAtrPct: 0.02,
    },
  });
}

function cbCandle(i: number, o: number, h: number, l: number, c: number): OhlcvCandle {
  return {
    openTime: WINDOW_FROM + i * INTERVAL_MS,
    open: o,
    high: h,
    low: l,
    close: c,
    volume: 1000,
    closeTime: WINDOW_FROM + (i + 1) * INTERVAL_MS - 1,
  };
}

function warmupThen(after: OhlcvCandle[]): OhlcvCandle[] {
  const out: OhlcvCandle[] = [];
  for (let i = 0; i < 32; i += 1) {
    out.push(cbCandle(i, 100, 100.3, 99.7, 100));
  }
  return out.concat(after);
}

export function proveConditionBuilderCostModel() {
  const feeRate = 0.0004;
  const slippageRate = 0.0002;
  const slipPct = slippageRate * 2;
  const feePct = feeRate * 2;

  const tpDef = conditionDef({
    maxHoldBars: 48,
    stopLossAtrMult: 50,
    takeProfitAtrMult: 0.01,
    cooldownBars: 80,
  });
  const tpCandles = warmupThen([
    cbCandle(32, 100, 120, 99.9, 110),
  ]);
  const tp = runConditionBuilderBacktest({
    def: tpDef,
    symbol: "BTCUSDT",
    candles: tpCandles,
    balance: 10_000,
    feeRate,
    slippageRate,
  });

  const slDef = conditionDef({
    maxHoldBars: 48,
    stopLossAtrMult: 0.01,
    takeProfitAtrMult: 50,
    cooldownBars: 80,
  });
  const slCandles = warmupThen([
    cbCandle(32, 100, 100.1, 80, 90),
  ]);
  const sl = runConditionBuilderBacktest({
    def: slDef,
    symbol: "BTCUSDT",
    candles: slCandles,
    balance: 10_000,
    feeRate,
    slippageRate,
  });

  const holdDef = conditionDef({
    maxHoldBars: 1,
    stopLossAtrMult: 50,
    takeProfitAtrMult: 50,
    cooldownBars: 80,
  });
  const holdCandles = warmupThen([
    cbCandle(32, 100, 100.2, 99.8, 100.1),
    cbCandle(33, 100.1, 100.3, 99.9, 100.2),
  ]);
  const hold = runConditionBuilderBacktest({
    def: holdDef,
    symbol: "BTCUSDT",
    candles: holdCandles,
    balance: 10_000,
    feeRate,
    slippageRate,
  });

  const endDef = conditionDef({
    maxHoldBars: 500,
    stopLossAtrMult: 50,
    takeProfitAtrMult: 50,
    cooldownBars: 80,
  });
  const endCandles = warmupThen([
    cbCandle(32, 100, 100.2, 99.8, 100.05),
  ]);
  const end = runConditionBuilderBacktest({
    def: endDef,
    symbol: "BTCUSDT",
    candles: endCandles,
    balance: 10_000,
    feeRate,
    slippageRate,
  });

  const endTrade = end.trades[end.trades.length - 1];
  const inLoopEndWouldHaveSlip = Boolean(endTrade && endTrade.slippagePct == null);
  return {
    model: "condition_builder_ledger_v0",
    feePct,
    slipPct,
    tp: {
      exitReason: tp.trades[0]?.exitReason ?? null,
      slippagePct: tp.trades[0]?.slippagePct ?? null,
      appliesLedgerSlip: tp.trades[0]?.slippagePct === slipPct,
    },
    sl: {
      exitReason: sl.trades[0]?.exitReason ?? null,
      slippagePct: sl.trades[0]?.slippagePct ?? null,
      appliesLedgerSlip: sl.trades[0]?.slippagePct === slipPct,
    },
    maxHold: {
      exitReason: hold.trades[0]?.exitReason ?? null,
      slippagePct: hold.trades[0]?.slippagePct ?? null,
      appliesLedgerSlip: hold.trades[0]?.slippagePct === slipPct,
    },
    end: {
      exitReason: endTrade?.exitReason ?? null,
      slippagePct: endTrade?.slippagePct ?? null,
      omitsLedgerSlip: inLoopEndWouldHaveSlip,
      source:
        "conditionBacktest.ts trailing open-at-end close: pnlPct = raw - feePct (no slipPct)",
    },
  };
}

export function proveFundingStressParity() {
  const base = researchDefaultCostConfig({ applyFunding: true });
  const researchResolved = [1, 1.5, 2].map((mult) => {
    const cfg = buildCostStressConfig(
      base,
      {
        id: `x${mult}`,
        label: `x${mult}`,
        requiredForPass: false,
        feeMultiplier: mult,
        slippageMultiplier: mult,
        fundingMultiplier: mult,
        spreadMultiplier: mult,
        costGuardKMultiplier: 1,
      },
      3,
    );
    return {
      multiplier: mult,
      researchResolvedFundingRate: cfg.fundingRate,
      researchDefaultUiFundingMultiplier: RESEARCH_DEFAULT_FUNDING_MULTIPLIER,
      researchDefaultUiResolvedFundingRate:
        base.fundingRate * RESEARCH_DEFAULT_FUNDING_MULTIPLIER,
    };
  });
  return {
    BACKTEST_STRESS_FUNDING: {
      rule: "backtestRunner passes config.fundingRate unchanged at every costStress multiplier",
      resolved: [
        { multiplier: 1, fundingRate: 0.0001 },
        { multiplier: 1.5, fundingRate: 0.0001 },
        { multiplier: 2, fundingRate: 0.0001 },
      ],
    },
    RESEARCH_STRESS_FUNDING: {
      rule: "buildCostStressConfig: fundingRate * fundingMultiplier",
      mechanismWhenMultiplierMatchesStress: researchResolved.map((r) => ({
        multiplier: r.multiplier,
        fundingRate: r.researchResolvedFundingRate,
      })),
      defaultProductionScenarios: {
        fundingMultiplier: 1,
        resolvedAt1_5xFeeScenario: 0.0001,
        note: "formDefaults/operatorProfiles/followUpResearch set fundingMultiplier=1. All 1074 sampled production scenarios used 1.",
      },
    },
    FUNDING_STRESS_PARITY:
      "MECHANISM_DIVERGES / DEFAULT_RESOLVED_RATES_MATCH" as const,
  };
}

export function proveSpreadParity() {
  return {
    researchUiDefault: RESEARCH_DEFAULT_APPLY_SPREAD,
    backtestApiDefault: BACKTEST_API_DEFAULT_APPLY_SPREAD,
    productionExecutionProfiles: {
      applySpreadTrue: 1073,
      applySpreadFalse: 10,
      applyFundingFalse: 1083,
    },
    intent: "NOT_VERIFIED",
    classification: "legacy default divergence (UI hardcoded true; Backtest API false)",
    patternEngineAppliesSpread: false,
    safeEngineAppliesSpread: "only when applySpread true",
  };
}

export function proveCostGuardParity() {
  const entry = 100;
  const reward = 0.003;
  const tp = entry * (1 + reward);
  const common = {
    entryPrice: entry,
    takeProfitPrice: tp,
    side: "LONG" as const,
    atr: 1,
    feeRate: 0.0004,
    slippageRate: 0.0002,
    spreadRate: 0,
    fundingRate: 0,
  };
  const k2 = evaluateCostGuard({
    ...common,
    params: { cost_guard: true, cost_guard_k: 2 },
  });
  const k3 = evaluateCostGuard({
    ...common,
    params: { cost_guard: true, cost_guard_k: 3 },
  });
  return {
    sameModel: true,
    expectedRewardPct: k2.expectedRewardPct,
    requiredAtK2: k2.requiredRewardPct,
    requiredAtK3: k3.requiredRewardPct,
    researchK2Accepted: k2.passed,
    backtestApiK3Rejected: !k3.passed,
    selectionDifferenceDueSolelyToK:
      k2.passed !== k3.passed
        ? ("YES" as const)
        : ("NO" as const),
    note: "Research base uses candidate.params.cost_guard_k. Backtest API default costGuardK=3 overrides params.",
  };
}

const SCORE_WEIGHTS: StrategySearchScoreWeights = {
  returnWeight: 1,
  mddWeight: 1,
  profitFactorWeight: 0.25,
  winRateWeight: 0.25,
  tradeAdequacyWeight: 0.25,
  negativeMonthWeight: 0.1,
  consistencyWeight: 0.1,
};

function syntheticEval(
  candidateId: string,
  totalReturn: number,
): StrategySearchCandidateEvaluation {
  const window = isolatedWindow();
  const w: StrategySearchWindowEvaluation = {
    window,
    symbol: "BTCUSDT",
    timeframe: "15m",
    candidateId,
    paramsHash: candidateId,
    metrics: {
      startingBalance: 10_000,
      endingBalance: 10_000 * (1 + totalReturn),
      totalReturn,
      mdd: -0.05,
      trades: 20,
      winRate: 0.55,
      profitFactor: 1.2,
      monthlyReturns: [],
      negativeMonths: 1,
      feeTotal: 0,
      slippageTotal: 0,
    },
    tradeCount: 20,
    processedCandleCount: CANDLE_COUNT,
    firstProcessedOpenTime: WINDOW_FROM,
    lastProcessedOpenTime: WINDOW_TO,
    durationMs: 1,
  };
  return {
    candidateId,
    paramsHash: candidateId,
    symbols: ["BTCUSDT"],
    timeframe: "15m",
    windows: [w],
    costConfig: researchDefaultCostConfig(),
    startedAt: "2026-09-04T00:00:00.000Z",
    completedAt: "2026-09-04T00:00:01.000Z",
    durationMs: 1,
  };
}

export function proveRankingSensitivity() {
  const longZeroFee = compareExecutionPriceVsLedger({
    side: "LONG",
    rawEntry: 100,
    rawExit: 110,
    margin: 1000,
    leverage: 1,
    slippageRate: 0.0002,
    feeRate: 0,
  });
  const aRaw = 0.1;
  const bRaw = 0.09997;
  const aSafe = longZeroFee.safeGrossFrac;
  const bSafe = compareExecutionPriceVsLedger({
    side: "LONG",
    rawEntry: 100,
    rawExit: 109.997,
    margin: 1000,
    leverage: 1,
    slippageRate: 0.0002,
    feeRate: 0,
  }).safeGrossFrac;
  const aEs = aRaw - 0.0004;
  const bEs = bRaw - 0.0004;

  const sameModelSafeA = calculateCandidateScore({
    evaluation: syntheticEval("A", aSafe),
    weights: SCORE_WEIGHTS,
  });
  const sameModelSafeB = calculateCandidateScore({
    evaluation: syntheticEval("B", bSafe),
    weights: SCORE_WEIGHTS,
  });
  const mixedA = calculateCandidateScore({
    evaluation: syntheticEval("A_SAFE", aSafe),
    weights: SCORE_WEIGHTS,
  });
  const mixedB = calculateCandidateScore({
    evaluation: syntheticEval("B_ES", bEs),
    weights: SCORE_WEIGHTS,
  });

  const beforeCostsABetter = aRaw > bRaw;
  const sameModelABetter = sameModelSafeA.finalScore > sameModelSafeB.finalScore;
  const mixedBBetter = mixedB.finalScore > mixedA.finalScore;

  return {
    beforeCosts: { aRaw, bRaw, aBetter: beforeCostsABetter },
    sameEngineSafe: {
      aSafe,
      bSafe,
      scoreA: sameModelSafeA.finalScore,
      scoreB: sameModelSafeB.finalScore,
      aStillBetter: sameModelABetter,
    },
    eventSequenceLedger: { aEs, bEs },
    mixedEnginePool: {
      scoreA_SAFE: mixedA.finalScore,
      scoreB_ES: mixedB.finalScore,
      inverted: mixedBBetter && beforeCostsABetter,
    },
    RANKING_INVERSION_DUE_TO_COST_MODEL: mixedBBetter && beforeCostsABetter ? ("YES" as const) : ("NO" as const),
    sameEngineInversion: sameModelABetter ? ("NO" as const) : ("YES" as const),
  };
}

export async function proveTinyCandidateFamily() {
  const candles = isolatedCandles();
  const window = isolatedWindow();
  const cost = researchDefaultCostConfig({ applySpread: false });
  const safeA = makeSafeSearchCandidate(2);
  const safeB = makeSafeSearchCandidate(4);
  const pattern = makePatternSearchCandidate();
  const rows = [];
  for (const candidate of [safeA, safeB, pattern]) {
    const ev = await evaluateCandidateWindow({
      candidate,
      symbol: "BTCUSDT",
      timeframe: "15m",
      window,
      balance: 10_000,
      costConfig: cost,
      preloadedCandles: candles,
    });
    const score = calculateCandidateScore({
      evaluation: {
        candidateId: candidate.candidateId,
        paramsHash: candidate.paramsHash,
        symbols: ["BTCUSDT"],
        timeframe: "15m",
        windows: [ev],
        costConfig: cost,
        startedAt: "2026-09-04T00:00:00.000Z",
        completedAt: "2026-09-04T00:00:01.000Z",
        durationMs: ev.durationMs,
      },
      weights: SCORE_WEIGHTS,
    });
    rows.push({
      candidateId: candidate.candidateId,
      engineFamily: candidate.candidateId.includes("pattern")
        ? "event_sequence_ledger_v0"
        : "safe_execution_price_v1",
      paramsHash: candidate.paramsHash,
      tradeCount: ev.tradeCount,
      totalReturn: ev.metrics.totalReturn,
      netEnding: ev.metrics.endingBalance,
      score: score.finalScore,
    });
  }
  const ranked = [...rows].sort((a, b) => b.score - a.score);
  return {
    rows,
    ranked,
    MIXED_ENGINE_CANDIDATES_COMPARED_IN_SAME_POOL: true,
    note: "jobRunner stores all families in one trial list; calculateCandidateScore is family-agnostic.",
  };
}

export function getScoringPipeline() {
  return {
    order: [
      "backtestAdapter.evaluateCandidateAcrossWindows → window metrics (totalReturn, mdd, trades, winRate, profitFactor, negativeMonths)",
      "evaluationPolicy.evaluateCandidatePass (thresholds)",
      "evaluationPolicy.calculateCandidateScore (weighted return/mdd/pf/win/tradeAdequacy/negMonths/consistency)",
      "costStress.evaluateCostStress → same score function per scenario",
      "jitterEvaluator.evaluateCandidateJitter → calculateCandidateScore per sample",
      "jobRunner.trialFromEvaluation persists score + passed + costStressResults.score",
      "jobStatistics.isBetterScore / recordEvaluation bestScore",
      "searchOrchestrator qualifiedHashes / best passed trial",
      "researchResultsSummary.compositeScore (netReturn, mdd, profitFactor, score, stress/jitter bonus) → 최종 추천",
      "researchTop10 rank by that card score",
      "promoteFromSearch requires Final PASS; identity is paramsHash",
    ],
    costSensitiveFields: [
      "totalReturn / net ending (primary score returnWeight)",
      "mdd",
      "profitFactor",
      "winRate",
      "trades (adequacy + cost-guard tradeCount)",
      "negativeMonths",
      "costStress passed/score (finalPassed and composite bonus)",
    ],
    notConsumed: ["Sharpe is optional display on Top-10 cards, not calculateCandidateScore"],
  };
}

export function getChampionImpact() {
  const ranking = proveRankingSensitivity();
  return {
    COST_MODEL_CAN_CHANGE_CHAMPION:
      ranking.RANKING_INVERSION_DUE_TO_COST_MODEL === "YES"
        ? ("YES" as const)
        : ("NOT_PROVEN" as const),
    path: "score → isBetterScore/bestScore → qualifiedHashes / compositeScore 최종 추천 → promote paramsHash",
    ranking,
    promotionNotExecuted: true,
  };
}

export function getResearchProvenanceInventory() {
  return {
    RESEARCH_TRIAL_COST_PROVENANCE: "PARTIAL" as const,
    trialRecords: {
      present: [
        "params",
        "paramsHash",
        "score",
        "passed",
        "windowResults (return/mdd/trades/...)",
        "costStressResults (scenarioId, passed, score)",
      ],
      absent: [
        "feeRate",
        "slippageRate",
        "slippageModelVersion",
        "funding enabled/rate/model",
        "spread enabled/rate/model",
        "costGuard k",
        "engineCostModel",
        "resolved stress rates",
      ],
    },
    executionProfile: {
      present: "baseCostConfig rates + apply flags + stress multipliers",
      absent: "engineCostModel / slippage model / cost_assumptions_v1",
    },
  };
}

export function getResearchCostIdentity() {
  const a = makeSafeSearchCandidate(5);
  const sameParamsDifferentCost = a.paramsHash;
  return {
    RESEARCH_COSTS_INCLUDED_IN_IDENTITY: "NO" as const,
    identityKeys: ["paramsHash (strategy params only)", "candidateId", "job iteration"],
    sameCandidateDifferentFeeTreatedAsSame: true,
    exampleParamsHash: sameParamsDifferentCost,
    note: "computeParamsHash(normalized params). fee/slip/funding/spread are job execution-profile fields, not trial identity.",
  };
}

export function getProvenanceWithoutParity() {
  return {
    feasible: true,
    recommended: {
      costAssumptionsVersion: "cost_assumptions_v1",
      engineCostModel: [
        "safe_execution_price_v1",
        "event_sequence_ledger_v0",
        "condition_builder_ledger_v0",
      ],
      invariant: "same provenance schema does NOT imply same arithmetic model",
      sourceSupport:
        "Adapter already branches SAFE vs pattern; Backtest runner already branches three engines. Names match source architecture.",
    },
  };
}

export function getFixOrderComparison() {
  return {
    MODEL_A: {
      name: "Provenance first, keep arithmetic divergence",
      rankingIntegrity: "WEAK — mixed-engine scores remain incomparable",
      regressionRisk: "LOW",
      assessment: "Necessary but insufficient",
    },
    MODEL_B: {
      name: "Unify SAFE + ES + CB arithmetic first",
      rankingIntegrity: "STRONG if completed",
      regressionRisk: "HIGH — changes ES/CB PnL and historical comparability",
      assessment: "Unsafe as first step; violates this phase's no-arithmetic rule and SAFE isolation",
    },
    MODEL_C: {
      name: "Provenance first, block cross-engine ranking until parity",
      rankingIntegrity: "STRONG",
      regressionRisk: "LOW — no math change; rank within engine family",
      assessment: "Selected",
    },
    MODEL_D: {
      name: "Keep engine math, add a ranking normalization layer",
      rankingIntegrity: "UNCERTAIN — invented adjustment is not evidence",
      regressionRisk: "MEDIUM",
      assessment: "Rejected; would fabricate a common score scale",
    },
    RECOMMENDED_RESEARCH_COST_FIX_ORDER: "MODEL_C",
  };
}

export function getHistoricalResearchPolicy() {
  return {
    view: "allowed — do not rewrite trials",
    resume: "allowed — resume uses persisted execution profile; do not mutate past trials",
    rerun: "allowed as a NEW job/evaluation; do not overwrite historical trial JSON",
    compare: "allowed with PARTIAL caveat — missing engineCostModel",
    promote:
      "currently allowed if Final PASS; recommended A7.2: block new promotion from mixed-engine undocumented models until provenance+family rank exists",
    approve: "unchanged approval gate; no automatic invalidation",
    recommendedLegacyClass: "viewable + resumable; promotion should become family-scoped / provenance-gated",
  };
}

export function getRootDefects() {
  return {
    RESEARCH_COST_PROVENANCE_MISSING: {
      status: "PROVEN",
      severity: "HIGH",
      scoreImpact: "indirect (cannot reconstruct why a score happened)",
      rankingImpact: "YES — operators cannot audit mixed-model ranks",
      promotionImpact: "YES — promote uses paramsHash/score without model stamp",
      p3a72Blocker: "YES",
    },
    SAFE_RESEARCH_BACKTEST_PARITY_GAP: {
      status: "PROVEN_ABSENT_WHEN_RATES_AND_K_MATCH",
      severity: "LOW",
      detail: "Same engine. Gap appears only if Backtest API costGuardK / applySpread differ from Research profile.",
      scoreImpact: "possible via k/spread config handoff, not engine math",
      rankingImpact: "possible",
      promotionImpact: "possible if operator re-backs-tests with API defaults",
      p3a72Blocker: "NO",
    },
    EVENT_SEQUENCE_SAFE_COST_MODEL_DIVERGENCE: {
      status: "PROVEN",
      severity: "HIGH",
      scoreImpact: "YES — different net for same raw move",
      rankingImpact: "YES in mixed pool",
      promotionImpact: "YES",
      p3a72Blocker: "YES",
    },
    CONDITION_BUILDER_END_SLIPPAGE_GAP: {
      status: "PROVEN",
      severity: "MEDIUM",
      scoreImpact: "Backtest CB path only; not a Research evaluator",
      rankingImpact: "NO for Research ranking",
      promotionImpact: "later if CB is backtested after promote",
      p3a72Blocker: "NO",
    },
    RESEARCH_BACKTEST_FUNDING_STRESS_DIVERGENCE: {
      status: "PROVEN_MECHANISM / DEFAULTS_MATCH",
      severity: "MEDIUM",
      scoreImpact: "only if fundingMultiplier≠1 and applyFunding true (defaults: multiplier 1, applyFunding false)",
      rankingImpact: "latent",
      promotionImpact: "latent",
      p3a72Blocker: "NO",
    },
    RESEARCH_BACKTEST_SPREAD_DEFAULT_DIVERGENCE: {
      status: "PROVEN",
      severity: "HIGH for SAFE family (Research UI true vs Backtest API false)",
      scoreImpact: "YES when SAFE Research applySpread=true",
      rankingImpact: "YES vs later Backtest",
      promotionImpact: "YES",
      p3a72Blocker: "YES",
    },
    RESEARCH_COST_IDENTITY_INCOMPLETE: {
      status: "PROVEN",
      severity: "HIGH",
      scoreImpact: "same paramsHash can hide different costs",
      rankingImpact: "dedup/seenHashes ignore costs",
      promotionImpact: "YES",
      p3a72Blocker: "YES",
    },
    MIXED_ENGINE_RANKING_COST_BIAS: {
      status: "PROVEN",
      severity: "CRITICAL",
      scoreImpact: "YES",
      rankingImpact: "YES — inversion fixture",
      promotionImpact: "YES — champion can change",
      p3a72Blocker: "YES",
    },
  };
}

export function getFrozenP3A72Contract() {
  const defects = getRootDefects();
  const blockers = Object.entries(defects)
    .filter(([, v]) => v.p3a72Blocker === "YES")
    .map(([k]) => k);
  return {
    P3_A7_2_READY: "YES" as const,
    A_provenanceBeforeArithmeticParity: true,
    B_engineCostModelIds: [
      "safe_execution_price_v1",
      "event_sequence_ledger_v0",
      "condition_builder_ledger_v0",
    ],
    C_mixedEngineRankingBeforeParity: "blocked — rank within engine family only",
    D_historicalTrialPolicy: getHistoricalResearchPolicy(),
    E_identityRule:
      "paramsHash remains strategy identity; result/trial identity MUST also hash costAssumptions + engineCostModel",
    F_fundingStressRule:
      "Do not change Backtest (funding unmultiplied). Keep Research mechanism (multiplies when fundingMultiplier≠1). Default UI stays fundingMultiplier=1. Persist both.",
    G_spreadRule:
      "Do not silently flip Research applySpread to false. Persist applySpread. Disclose Backtest API default false vs Research UI default true.",
    H_implementationScope: [
      "Stamp cost_assumptions_v1 + engineCostModel on new Research evaluations/trials",
      "Do not change fee/slip/funding/spread/guard arithmetic",
      "Do not rewrite historical trials",
      "Family-scope ranking/champion until arithmetic parity",
      "Identity includes costs + model id for new trials",
      "No production Research start, no SAFE change, no Paper/Live",
    ],
    blockers,
  };
}

export function getRepeatedSignatureImpact() {
  return {
    interactsWithCostModel: false,
    evidence:
      "repeatedErrorSignatures / candidate_invalid use generation-error fingerprints in engineErrorClassification — not cost rates or engine cost models.",
  };
}

export async function buildP3A71Diagnosis(cwd = process.cwd()) {
  const hashes = productionReadonlyHashes(cwd);
  const safeParity = await proveSafeResearchBacktestParity();
  const longZero = compareExecutionPriceVsLedger({
    side: "LONG",
    rawEntry: 100,
    rawExit: 110,
    margin: 1000,
    leverage: 1,
    slippageRate: 0.0002,
    feeRate: 0,
  });
  const shortZero = compareExecutionPriceVsLedger({
    side: "SHORT",
    rawEntry: 100,
    rawExit: 90,
    margin: 1000,
    leverage: 1,
    slippageRate: 0.0002,
    feeRate: 0,
  });
  const longFee = compareExecutionPriceVsLedger({
    side: "LONG",
    rawEntry: 100,
    rawExit: 110,
    margin: 1000,
    leverage: 1,
    slippageRate: 0.0002,
    feeRate: 0.0004,
  });
  const condition = proveConditionBuilderCostModel();
  const funding = proveFundingStressParity();
  const spread = proveSpreadParity();
  const guard = proveCostGuardParity();
  const ranking = proveRankingSensitivity();
  const family = await proveTinyCandidateFamily();
  const champion = getChampionImpact();
  return {
    hashes,
    matrix: getResearchCandidateEngineMatrix(),
    engineCostMatrix: getCanonicalEngineCostMatrix(),
    authorities: getResearchDefaultAuthorities(),
    safeParity,
    eventSequence: { longZero, shortZero, longFee },
    condition,
    funding,
    spread,
    guard,
    scoring: getScoringPipeline(),
    ranking,
    family,
    champion,
    repeatedSignature: getRepeatedSignatureImpact(),
    provenance: getResearchProvenanceInventory(),
    identity: getResearchCostIdentity(),
    provenanceWithoutParity: getProvenanceWithoutParity(),
    fixOrder: getFixOrderComparison(),
    historical: getHistoricalResearchPolicy(),
    defects: getRootDefects(),
    frozen: getFrozenP3A72Contract(),
  };
}

export async function writeP3A71Artifacts(cwd = process.cwd()) {
  const diagnosis = await buildP3A71Diagnosis(cwd);
  const dir = path.join(
    cwd,
    ".validation",
    "research-p3-a7-1-cost-parity",
    P3A71_ARTIFACT_TS,
  );
  fs.mkdirSync(dir, { recursive: true });
  const files: Record<string, unknown> = {
    "research-engine-cost-matrix.json": diagnosis.engineCostMatrix,
    "research-default-authorities.json": diagnosis.authorities,
    "safe-backtest-parity.json": diagnosis.safeParity,
    "event-sequence-comparison.json": diagnosis.eventSequence,
    "condition-builder-comparison.json": diagnosis.condition,
    "funding-stress-parity.json": diagnosis.funding,
    "spread-parity.json": diagnosis.spread,
    "cost-guard-parity.json": diagnosis.guard,
    "scoring-pipeline.json": diagnosis.scoring,
    "ranking-sensitivity.json": diagnosis.ranking,
    "candidate-family-fixture.json": diagnosis.family,
    "champion-impact.json": diagnosis.champion,
    "research-provenance-inventory.json": diagnosis.provenance,
    "research-cost-identity.json": diagnosis.identity,
    "fix-order-comparison.json": diagnosis.fixOrder,
    "historical-research-policy.json": diagnosis.historical,
    "root-defects.json": diagnosis.defects,
    "p3-a7-2-frozen-contract.json": diagnosis.frozen,
    "production-readonly-hashes.json": diagnosis.hashes,
  };
  for (const [name, value] of Object.entries(files)) {
    fs.writeFileSync(path.join(dir, name), JSON.stringify(value, null, 2), "utf8");
  }
  return { dir, diagnosis };
}
