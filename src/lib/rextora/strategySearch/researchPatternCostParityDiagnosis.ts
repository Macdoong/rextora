/**
 * P3-A8.1 read-only forensic: SAFE vs Pattern Research cost-arithmetic
 * parity, fixture quantification, and A8.2 migration design.
 *
 * Does not change production arithmetic, SAFE, jobs, trials, or Paper/Live.
 */

import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { productionReadonlyHashes } from "../backtest/backtestCostAssumptionsDiagnosis";
import {
  applyAdverseSlippage,
  toSlippageSide,
} from "../backtest/executionSlippage";
import { evaluateCostGuard } from "../cost/costGuard";
import {
  calculateCandidateScore,
  evaluateCandidatePass,
} from "./evaluationPolicy";
import { buildCostStressConfig } from "./costStress";
import {
  ENGINE_COST_MODEL_EVENT_SEQUENCE,
  ENGINE_COST_MODEL_SAFE,
  RESEARCH_EVALUATION_IDENTITY_VERSION,
  buildResearchEvaluationIdentity,
  computeResearchEvaluationHash,
} from "./researchEvaluationIdentity";
import type {
  StrategySearchBacktestCostConfig,
  StrategySearchCandidateEvaluation,
  StrategySearchCostStressScenario,
  StrategySearchPassPolicy,
  StrategySearchScoreWeights,
  StrategySearchWindowEvaluation,
} from "./types";

export const P3A81_ARTIFACT_TS = "2026-09-04T06-00-00-000Z";

export const FIXTURE_MARGIN = 1000;
export const FIXTURE_LEVERAGE = 1;
export const FIXTURE_FEE_RATE = 0.0004;
export const FIXTURE_SLIPPAGE_RATE = 0.0002;
export const FIXTURE_FUNDING_RATE = 0.0001;
export const FIXTURE_SPREAD_RATE = 0.0001;
export const RAW_ENTRY = 100;
export const LONG_RAW_EXIT = 110;
export const SHORT_RAW_EXIT = 90;

export const RECOMMENDED_PATTERN_COST_MODEL =
  "event_sequence_execution_price_v1" as const;

export const GROUP_RANK_HISTORY_UNAVAILABLE_NOTE =
  "Cost parity does not restore SAFE/Pattern global ranking.";

function signedPriceReturn(
  side: "LONG" | "SHORT",
  entry: number,
  exit: number,
): number {
  return side === "LONG" ? (exit - entry) / entry : (entry - exit) / entry;
}

export function replaySafeCloseAccounting(input: {
  side: "LONG" | "SHORT";
  rawEntry: number;
  rawExit: number;
  feeRate: number;
  slippageRate: number;
  applyFunding: boolean;
  fundingRate: number;
  applySpread: boolean;
  spreadRate: number;
  margin?: number;
  leverage?: number;
}) {
  const margin = input.margin ?? FIXTURE_MARGIN;
  const leverage = input.leverage ?? FIXTURE_LEVERAGE;
  const execEntry = applyAdverseSlippage({
    side: toSlippageSide(input.side),
    action: "entry",
    rawPrice: input.rawEntry,
    slippageRate: input.slippageRate,
  });
  const execExit = applyAdverseSlippage({
    side: toSlippageSide(input.side),
    action: "exit",
    rawPrice: input.rawExit,
    slippageRate: input.slippageRate,
  });
  const executionReturn = signedPriceReturn(input.side, execEntry, execExit);
  const unslippedReturn = signedPriceReturn(
    input.side,
    input.rawEntry,
    input.rawExit,
  );
  const feePct = input.feeRate * 2;
  const fundingPct = input.applyFunding ? input.fundingRate : 0;
  const spreadPct = input.applySpread ? input.spreadRate : 0;
  const pnlPct =
    (executionReturn - feePct - fundingPct - spreadPct) * leverage;
  const feeUsdt = margin * feePct * leverage;
  const fundingUsdt = margin * fundingPct * leverage;
  const spreadUsdt = margin * spreadPct * leverage;
  const grossUsdt = margin * executionReturn * leverage;
  const unslippedGrossUsdt = margin * unslippedReturn * leverage;
  const slippageAttributionUsdt = unslippedGrossUsdt - grossUsdt;
  const netUsdt = margin * pnlPct;
  return {
    engine: "runSafeV44Backtest",
    model: ENGINE_COST_MODEL_SAFE,
    rawEntry: input.rawEntry,
    rawExit: input.rawExit,
    execEntry,
    execExit,
    executionReturn,
    unslippedReturn,
    feePct,
    fundingPct,
    spreadPct,
    ledgerSlipPct: 0,
    pnlPct,
    grossUsdt,
    feeUsdt,
    slippageAttributionUsdt,
    fundingUsdt,
    spreadUsdt,
    netUsdt,
    source:
      "backtestEngine.ts close: applyAdverseSlippage entry/exit; pnlPct=(executionReturn-feePct-fundingPct-spreadPct)*leverage; equity+=margin*pnlPct",
  };
}

export function replayPatternLedgerCloseAccounting(input: {
  side: "LONG" | "SHORT";
  rawEntry: number;
  rawExit: number;
  feeRate: number;
  slippageRate: number;
  margin?: number;
  leverage?: number;
}) {
  const margin = input.margin ?? FIXTURE_MARGIN;
  const leverage = input.leverage ?? FIXTURE_LEVERAGE;
  const raw = signedPriceReturn(input.side, input.rawEntry, input.rawExit);
  const feePct = input.feeRate * 2;
  const slipPct = input.slippageRate * 2;
  const unit = raw - feePct - slipPct;
  const pnlPct = unit * leverage;
  return {
    engine: "runEventSequenceBacktest",
    model: ENGINE_COST_MODEL_EVENT_SEQUENCE,
    rawEntry: input.rawEntry,
    rawExit: input.rawExit,
    execEntry: input.rawEntry,
    execExit: input.rawExit,
    rawReturn: raw,
    feePct,
    fundingPct: 0,
    spreadPct: 0,
    ledgerSlipPct: slipPct,
    pnlPct,
    grossUsdt: margin * raw * leverage,
    feeUsdt: margin * feePct * leverage,
    slippageLedgerUsdt: margin * slipPct * leverage,
    fundingUsdt: 0,
    spreadUsdt: 0,
    netUsdt: margin * pnlPct,
    source:
      "eventSequenceBacktest.ts close+end: raw prices; pnl unit = raw-feePct-slipPct; stored pnlPct=unit*lev; equity*=1+unit*baseBalancePct*lev",
  };
}

export function replayProposedPatternExecutionAccounting(input: {
  side: "LONG" | "SHORT";
  rawEntry: number;
  rawExit: number;
  feeRate: number;
  slippageRate: number;
  applyFunding: boolean;
  fundingRate: number;
  applySpread: boolean;
  spreadRate: number;
  margin?: number;
  leverage?: number;
}) {
  const safe = replaySafeCloseAccounting(input);
  return {
    ...safe,
    engine: "runEventSequenceBacktest + proposed execution_price accounting",
    model: RECOMMENDED_PATTERN_COST_MODEL,
    rawSignalEntry: input.rawEntry,
    rawSignalExit: input.rawExit,
    source:
      "Proposed P-B: keep Pattern raw signal/trigger prices; apply applyAdverseSlippage + SAFE fee/funding/spread ledger. Do not also deduct slipPct.",
  };
}

function diffUsdt(a: number, b: number): { usdt: number; bps: number } {
  const usdt = a - b;
  const bps = (usdt / FIXTURE_MARGIN) * 10_000;
  return { usdt, bps };
}

export function getEngineCostPaths() {
  return {
    SAFE: {
      adapter:
        "src/lib/rextora/strategySearch/backtestAdapter.ts::runCandidateWindowEvaluation",
      engine: "src/lib/rextora/backtest/backtestEngine.ts::runSafeV44Backtest",
      model: ENGINE_COST_MODEL_SAFE,
      rawEntry: "risk.entryPrice = candle.close (signal/trigger unchanged)",
      executionEntry:
        "applyAdverseSlippage({action:'entry'}) stored as open.entryPrice; rawEntryPrice kept",
      rawExit:
        "TP=takeProfit, SL=stop, max_hold=candle.close, end=last.close, trailing_stop=updated stop",
      executionExit: "applyAdverseSlippage({action:'exit'}) stored as trade.exitPrice",
      grossReturn: "signedPriceReturn(side, execEntry, execExit)",
      fee: "feePct = feeRate * 2; feeCostUsdt = margin * feePct * leverage",
      slippage:
        "in execution prices only; ledger slippageCostUsdt = unslippedGross - executionGross (not deducted again)",
      funding:
        "fundingPct = applyFunding ? (fundingRate ?? 0.0001) : 0; flat per trade; not duration-scaled; long and short both charged",
      spread: "spreadPct = applySpread ? (spreadRate ?? 0.0001) : 0; flat fraction per trade",
      net: "pnlPct = (executionReturn - feePct - fundingPct - spreadPct) * leverage",
      equity: "equity = equity + open.margin * pnlPct (additive)",
      tradeRecord:
        "entryPrice=exec, exitPrice=exec, feePct, fundingPct, spreadPct, pnlPct, ledger USDT fields",
      aggregates: "buildBacktestReport from trades + equityCurve",
    },
    PATTERN: {
      adapter:
        "backtestAdapter.ts when isPatternCandidateParams; runEventSequenceBacktest({feeRate,slippageRate}) — no fundingRate/applyFunding/applySpread inputs",
      engine:
        "src/lib/rextora/strategy/eventSequenceBacktest.ts::runEventSequenceBacktest",
      model: ENGINE_COST_MODEL_EVENT_SEQUENCE,
      rawEntry: "trigger/close assigned to m.entryPrice (no slippage helper)",
      executionEntry: "none — stores raw entryPrice",
      rawExit:
        "TP=m.tp, SL=m.stop, max_hold=c.close, invalidation/end=c.close or last.close",
      executionExit: "none — stores raw exitPrice",
      grossReturn: "raw = signed raw exit vs raw entry / raw entry",
      fee: "feePct = feeRate * 2; feeCostUsdt = margin * feePct * leverage",
      slippage: "slipPct = slippageRate * 2 deducted from raw every close including end",
      funding: "not applied; adapter stamps fundingApplied:false",
      spread: "not applied to pnl; adapter may stamp spreadApplied flag only",
      net: "unit = raw - feePct - slipPct; stored pnlPct = unit * leverage",
      equity: "equity *= 1 + unit * def.positionSizing.baseBalancePct * leverage",
      tradeRecord: "raw entry/exit, feePct, slippagePct, no fundingPct/spreadPct",
      aggregates: "buildBacktestReport from ES trades + endingBalance",
    },
  };
}

export function getExitReasonMatrix() {
  const channels = {
    SAFE: {
      ENTRY_SLIP: "applyAdverseSlippage entry on raw close",
      EXIT_SLIP: "applyAdverseSlippage exit on raw trigger/close",
      LEDGER_SLIP: "attribution only",
      FEE: "feeRate*2",
      FUNDING: "flat when applyFunding",
      SPREAD: "flat when applySpread",
    },
    PATTERN: {
      ENTRY_SLIP: "none",
      EXIT_SLIP: "none",
      LEDGER_SLIP: "slippageRate*2 on every close",
      FEE: "feeRate*2",
      FUNDING: "none",
      SPREAD: "none",
    },
  };
  return {
    SAFE: [
      {
        ENGINE: "SAFE",
        EXIT_REASON: "take_profit",
        RAW_EXIT: "open.takeProfit",
        ...channels.SAFE,
      },
      {
        ENGINE: "SAFE",
        EXIT_REASON: "stop_loss",
        RAW_EXIT: "stop",
        ...channels.SAFE,
      },
      {
        ENGINE: "SAFE",
        EXIT_REASON: "trailing_stop",
        RAW_EXIT: "updated trailing stop (params.use_trailing)",
        ...channels.SAFE,
        reachable: "only when use_trailing and trail moved the stop",
      },
      {
        ENGINE: "SAFE",
        EXIT_REASON: "max_hold",
        RAW_EXIT: "candle.close",
        ...channels.SAFE,
      },
      {
        ENGINE: "SAFE",
        EXIT_REASON: "end",
        RAW_EXIT: "last.close",
        ...channels.SAFE,
      },
    ],
    PATTERN: [
      {
        ENGINE: "PATTERN",
        EXIT_REASON: "take_profit",
        RAW_EXIT: "m.tp",
        ...channels.PATTERN,
      },
      {
        ENGINE: "PATTERN",
        EXIT_REASON: "stop_loss",
        RAW_EXIT: "m.stop",
        ...channels.PATTERN,
      },
      {
        ENGINE: "PATTERN",
        EXIT_REASON: "max_hold",
        RAW_EXIT: "c.close",
        ...channels.PATTERN,
      },
      {
        ENGINE: "PATTERN",
        EXIT_REASON: "end",
        RAW_EXIT: "c.close or last.close (also used for invalidation/combination close)",
        ...channels.PATTERN,
      },
    ],
    note: "SAFE trailing_stop is the only extra production-reachable reason. Pattern invalidation uses exitReason='end' with the same ledger.",
  };
}

function fixturePair(input: {
  side: "LONG" | "SHORT";
  rawExit: number;
  feeRate: number;
  applyFunding: boolean;
  applySpread: boolean;
}) {
  const common = {
    side: input.side,
    rawEntry: RAW_ENTRY,
    rawExit: input.rawExit,
    feeRate: input.feeRate,
    slippageRate: FIXTURE_SLIPPAGE_RATE,
    applyFunding: input.applyFunding,
    fundingRate: FIXTURE_FUNDING_RATE,
    applySpread: input.applySpread,
    spreadRate: FIXTURE_SPREAD_RATE,
  };
  const safe = replaySafeCloseAccounting(common);
  const pattern = replayPatternLedgerCloseAccounting(common);
  const proposed = replayProposedPatternExecutionAccounting(common);
  return {
    safe,
    pattern,
    proposed,
    safeMinusPattern: diffUsdt(safe.netUsdt, pattern.netUsdt),
    proposedMinusPattern: diffUsdt(proposed.netUsdt, pattern.netUsdt),
    proposedEqualsSafeNet: proposed.netUsdt === safe.netUsdt,
  };
}

export function getLongShortFixtures() {
  const longOff = fixturePair({
    side: "LONG",
    rawExit: LONG_RAW_EXIT,
    feeRate: FIXTURE_FEE_RATE,
    applyFunding: false,
    applySpread: false,
  });
  const shortOff = fixturePair({
    side: "SHORT",
    rawExit: SHORT_RAW_EXIT,
    feeRate: FIXTURE_FEE_RATE,
    applyFunding: false,
    applySpread: false,
  });
  return {
    assumptions: {
      margin: FIXTURE_MARGIN,
      leverage: FIXTURE_LEVERAGE,
      feeRate: FIXTURE_FEE_RATE,
      slippageRate: FIXTURE_SLIPPAGE_RATE,
      calculatedBy: "applyAdverseSlippage + exact engine close formulas",
    },
    long_fee_on_funding_off_spread_off: longOff,
    short_fee_on_funding_off_spread_off: shortOff,
    long_fee_off: fixturePair({
      side: "LONG",
      rawExit: LONG_RAW_EXIT,
      feeRate: 0,
      applyFunding: false,
      applySpread: false,
    }),
    long_funding_on: fixturePair({
      side: "LONG",
      rawExit: LONG_RAW_EXIT,
      feeRate: FIXTURE_FEE_RATE,
      applyFunding: true,
      applySpread: false,
    }),
    long_spread_on: fixturePair({
      side: "LONG",
      rawExit: LONG_RAW_EXIT,
      feeRate: FIXTURE_FEE_RATE,
      applyFunding: false,
      applySpread: true,
    }),
    short_funding_on: fixturePair({
      side: "SHORT",
      rawExit: SHORT_RAW_EXIT,
      feeRate: FIXTURE_FEE_RATE,
      applyFunding: true,
      applySpread: false,
    }),
    short_spread_on: fixturePair({
      side: "SHORT",
      rawExit: SHORT_RAW_EXIT,
      feeRate: FIXTURE_FEE_RATE,
      applyFunding: false,
      applySpread: true,
    }),
  };
}

export function getFeeParity() {
  const on = fixturePair({
    side: "LONG",
    rawExit: LONG_RAW_EXIT,
    feeRate: FIXTURE_FEE_RATE,
    applyFunding: false,
    applySpread: false,
  });
  const off = fixturePair({
    side: "LONG",
    rawExit: LONG_RAW_EXIT,
    feeRate: 0,
    applyFunding: false,
    applySpread: false,
  });
  return {
    FEE_PARITY: "PARTIAL",
    feePctBoth: "feeRate * 2",
    feeUsdtBoth: "margin * feePct * leverage — equal at same margin/leverage",
    longFeeUsdtSafe: on.safe.feeUsdt,
    longFeeUsdtPattern: on.pattern.feeUsdt,
    feeUsdtEqual: on.safe.feeUsdt === on.pattern.feeUsdt,
    deductedFrom: {
      SAFE: "executionReturn (slipped prices)",
      PATTERN: "raw return (unslipped prices)",
    },
    feeOffNetDifferenceUsdt: off.safeMinusPattern.usdt,
    defaultFeeNetDifferenceUsdt: on.safeMinusPattern.usdt,
    note: "Do not treat feeRate*2 as full net parity. Fee USDT matches; net does not because slippage sits in different places.",
  };
}

export function getSlippageHelperReuse() {
  const longEntry = applyAdverseSlippage({
    side: "long",
    action: "entry",
    rawPrice: RAW_ENTRY,
    slippageRate: FIXTURE_SLIPPAGE_RATE,
  });
  const longExit = applyAdverseSlippage({
    side: "long",
    action: "exit",
    rawPrice: LONG_RAW_EXIT,
    slippageRate: FIXTURE_SLIPPAGE_RATE,
  });
  const shortEntry = applyAdverseSlippage({
    side: "short",
    action: "entry",
    rawPrice: RAW_ENTRY,
    slippageRate: FIXTURE_SLIPPAGE_RATE,
  });
  const shortExit = applyAdverseSlippage({
    side: "short",
    action: "exit",
    rawPrice: SHORT_RAW_EXIT,
    slippageRate: FIXTURE_SLIPPAGE_RATE,
  });
  return {
    CAN_REUSE_CANONICAL_SLIPPAGE_HELPER: "YES",
    helper: "src/lib/rextora/backtest/executionSlippage.ts::applyAdverseSlippage",
    longEntry,
    longExit,
    shortEntry,
    shortExit,
    validation: "throws if rawPrice<=0 or slippageRate<0",
    unit: "fractional rate, same as SAFE Research/Backtest",
    constraint: "call on fill prices only; do not move Pattern TP/SL/max_hold triggers",
  };
}

export function getFundingDesign() {
  const on = fixturePair({
    side: "LONG",
    rawExit: LONG_RAW_EXIT,
    feeRate: FIXTURE_FEE_RATE,
    applyFunding: true,
    applySpread: false,
  });
  return {
    SAFE: {
      amountBasis: "fundingPct = applyFunding ? fundingRate : 0 (default rate 0.0001)",
      leverage: "fundingCostUsdt = margin * fundingPct * leverage",
      direction: "long and short both charged; shorts do not receive",
      duration: "none — not * holdBars, not 8h periods",
      enabled: "applyFunding gate",
      timing: "charged once on every close including TP/SL/max_hold/end",
    },
    PATTERN_CURRENT: {
      applied: false,
      engineInput: "runEventSequenceBacktest has no fundingRate",
      adapter: "fundingApplied: false hardcoded",
      fundingOnNetUsdt: on.pattern.netUsdt,
    },
    SAFE_FUNDING_ON_NET: on.safe.netUsdt,
    PATTERN_CAN_REUSE_SAFE_FUNDING: "YES",
    how: "add the same flat fundingPct deduction after executionReturn; no signal change",
  };
}

export function getSpreadDesign() {
  const on = fixturePair({
    side: "LONG",
    rawExit: LONG_RAW_EXIT,
    feeRate: FIXTURE_FEE_RATE,
    applyFunding: false,
    applySpread: true,
  });
  return {
    SAFE: {
      amountBasis: "spreadPct = applySpread ? spreadRate : 0 (default 0.0001)",
      leverage: "spreadCostUsdt = margin * spreadPct * leverage",
      timing: "flat per trade on every close",
    },
    PATTERN_CURRENT: {
      applied: false,
      engine: "no spreadPct in pnl",
      adapter: "spreadApplied flag only",
      spreadOnNetUsdt: on.pattern.netUsdt,
    },
    SAFE_SPREAD_ON_NET: on.safe.netUsdt,
    PATTERN_CAN_REUSE_SAFE_SPREAD: "YES",
    how: "same flat spreadPct ledger deduction; do not change raw trigger prices",
  };
}

export function getCostGuardAnalysis() {
  const guard = evaluateCostGuard({
    entryPrice: RAW_ENTRY,
    takeProfitPrice: LONG_RAW_EXIT,
    side: "LONG",
    atr: 1,
    params: { cost_guard: true, cost_guard_k: 3 },
    feeRate: FIXTURE_FEE_RATE,
    slippageRate: FIXTURE_SLIPPAGE_RATE,
    spreadRate: 0,
    fundingRate: 0,
  });
  return {
    semantic: "A. pre-trade economic viability filter",
    COST_GUARD_IS_ACCOUNTING_PARITY: "NO",
    PATTERN_COST_GUARD_RECOMMENDATION:
      "Do not add Pattern cost guard in A8.2. It is SAFE-specific selection (evaluateCostGuard before open). Adding it would change which Pattern trades occur and violate the signal-selection invariant.",
    safeSource:
      "backtestEngine.ts evaluateCostGuard before opening; fail → no trade",
    patternSource:
      "eventSequenceBacktest has no evaluateCostGuard; Research pattern params have no cost_guard_k (stress falls back to k=3 unused by ES engine)",
    liveGuardPassed: guard.passed,
    liveGuardTotalCostPct: guard.totalCostPct,
  };
}

export function getSignalSelectionInvariant() {
  return {
    PATTERN_SIGNAL_SELECTION_UNCHANGED: "YES",
    PATTERN_TRADE_COUNT_INVARIANT: "YES",
    provided:
      "P-B accounting uses raw Pattern entry/exit trigger prices as inputs to applyAdverseSlippage. TP/SL/max_hold/end hit tests stay on raw levels.",
    wouldBreakIf: [
      "cost guard added (selection filter)",
      "trigger prices replaced by slipped prices",
    ],
    equityUpdateRemainsDifferent:
      "SAFE additive margin*pnlPct vs Pattern multiplicative baseBalancePct is not part of cost accounting parity and must stay out of this migration.",
  };
}

const SCORE_WEIGHTS: StrategySearchScoreWeights = {
  returnWeight: 1,
  mddWeight: 0.5,
  profitFactorWeight: 0.25,
  winRateWeight: 0.25,
  tradeAdequacyWeight: 0.25,
  negativeMonthWeight: 0.1,
  consistencyWeight: 0.1,
};

function oneTradeEval(
  id: string,
  netUsdt: number,
): StrategySearchCandidateEvaluation {
  const starting = FIXTURE_MARGIN;
  const ending = starting + netUsdt;
  const totalReturn = netUsdt / starting;
  const window: StrategySearchWindowEvaluation = {
    window: {
      id: "w1",
      label: "diag",
      requestedFrom: Date.UTC(2024, 0, 1),
      requestedTo: Date.UTC(2024, 0, 2),
      requiredForPass: true,
    },
    symbol: "BTCUSDT",
    timeframe: "15m",
    candidateId: id,
    paramsHash: id,
    metrics: {
      startingBalance: starting,
      endingBalance: ending,
      totalReturn,
      mdd: totalReturn < 0 ? totalReturn : 0,
      trades: 1,
      winRate: netUsdt > 0 ? 1 : 0,
      profitFactor: netUsdt > 0 ? 2 : 0,
      monthlyReturns: [],
      negativeMonths: netUsdt < 0 ? 1 : 0,
      feeTotal: 0,
      slippageTotal: 0,
    },
    tradeCount: 1,
    processedCandleCount: 2,
    firstProcessedOpenTime: Date.UTC(2024, 0, 1),
    lastProcessedOpenTime: Date.UTC(2024, 0, 2),
    durationMs: 1,
  };
  return {
    candidateId: id,
    paramsHash: id,
    symbols: ["BTCUSDT"],
    timeframe: "15m",
    windows: [window],
    costConfig: {
      feeRate: FIXTURE_FEE_RATE,
      slippageRate: FIXTURE_SLIPPAGE_RATE,
      fundingRate: FIXTURE_FUNDING_RATE,
      applyFunding: false,
      applySpread: false,
      spreadRate: FIXTURE_SPREAD_RATE,
    },
    startedAt: "2024-01-01T00:00:00.000Z",
    completedAt: "2024-01-01T00:00:01.000Z",
    durationMs: 1,
  };
}

export function getCandidateScoreImpact() {
  const long = fixturePair({
    side: "LONG",
    rawExit: LONG_RAW_EXIT,
    feeRate: FIXTURE_FEE_RATE,
    applyFunding: false,
    applySpread: false,
  });
  const current = oneTradeEval("pattern_ledger", long.pattern.netUsdt);
  const proposed = oneTradeEval("pattern_exec", long.proposed.netUsdt);
  const currentScore = calculateCandidateScore({
    evaluation: current,
    weights: SCORE_WEIGHTS,
  });
  const proposedScore = calculateCandidateScore({
    evaluation: proposed,
    weights: SCORE_WEIGHTS,
  });
  const passPolicy: StrategySearchPassPolicy = {
    thresholds: {
      minTotalReturn: (long.pattern.netUsdt + long.proposed.netUsdt) / 2 / FIXTURE_MARGIN,
      minTradeCount: 1,
    },
  };
  const currentPass = evaluateCandidatePass({
    evaluation: current,
    policy: passPolicy,
  });
  const proposedPass = evaluateCandidatePass({
    evaluation: proposed,
    policy: passPolicy,
  });
  return {
    tradeCountCurrent: 1,
    tradeCountProposed: 1,
    totalReturnCurrent: current.windows[0]!.metrics.totalReturn,
    totalReturnProposed: proposed.windows[0]!.metrics.totalReturn,
    totalReturnDelta:
      proposed.windows[0]!.metrics.totalReturn -
      current.windows[0]!.metrics.totalReturn,
    mddCurrent: current.windows[0]!.metrics.mdd,
    mddProposed: proposed.windows[0]!.metrics.mdd,
    profitFactorCurrent: current.windows[0]!.metrics.profitFactor,
    profitFactorProposed: proposed.windows[0]!.metrics.profitFactor,
    winRateCurrent: current.windows[0]!.metrics.winRate,
    winRateProposed: proposed.windows[0]!.metrics.winRate,
    negativeMonthsCurrent: current.windows[0]!.metrics.negativeMonths,
    negativeMonthsProposed: proposed.windows[0]!.metrics.negativeMonths,
    endingBalanceCurrent: current.windows[0]!.metrics.endingBalance,
    endingBalanceProposed: proposed.windows[0]!.metrics.endingBalance,
    endingBalanceDelta:
      proposed.windows[0]!.metrics.endingBalance -
      current.windows[0]!.metrics.endingBalance,
    scoreCurrent: currentScore.finalScore,
    scoreProposed: proposedScore.finalScore,
    scoreDelta: proposedScore.finalScore - currentScore.finalScore,
    passThresholdUsed: passPolicy.thresholds.minTotalReturn,
    passCurrent: currentPass.passed,
    passProposed: proposedPass.passed,
    passFlips: currentPass.passed !== proposedPass.passed,
  };
}

export function getCostStressImpact() {
  const base: StrategySearchBacktestCostConfig = {
    feeRate: FIXTURE_FEE_RATE,
    slippageRate: FIXTURE_SLIPPAGE_RATE,
    fundingRate: FIXTURE_FUNDING_RATE,
    applyFunding: true,
    applySpread: true,
    spreadRate: FIXTURE_SPREAD_RATE,
  };
  const defaultScenario: StrategySearchCostStressScenario = {
    id: "stress_1_5x",
    label: "비용 1.5배",
    requiredForPass: false,
    feeMultiplier: 1.5,
    slippageMultiplier: 1.5,
    fundingMultiplier: 1,
    spreadMultiplier: 1.5,
    costGuardKMultiplier: 1,
  };
  const nonDefault: StrategySearchCostStressScenario = {
    id: "stress_2x_all",
    label: "전채널 2배",
    requiredForPass: false,
    feeMultiplier: 2,
    slippageMultiplier: 2,
    fundingMultiplier: 2,
    spreadMultiplier: 2,
    costGuardKMultiplier: 2,
  };
  return {
    CURRENT_PATTERN_STRESS_EFFECTIVE_CHANNELS: ["fee", "slippage"],
    PROPOSED_PATTERN_STRESS_EFFECTIVE_CHANNELS: [
      "fee",
      "slippage",
      "funding",
      "spread",
    ],
    stillIgnoredUnlessSeparateDecision: ["costGuardK"],
    defaultStressed: buildCostStressConfig(base, defaultScenario, 3),
    nonDefaultStressed: buildCostStressConfig(base, nonDefault, 3),
    note: "Historical Pattern stress scores are not comparable to future parity runs because funding/spread multipliers become live.",
  };
}

export function getJitterImpact() {
  return {
    JITTER_GENERATION_CHANGED_BY_COST_PARITY: "NO",
    reason:
      "jitterEvaluator.generateJitterCandidate mutates parameter ranges only. Cost model is applied later during evaluation.",
  };
}

function sampleIdentity(engineCostModel: typeof ENGINE_COST_MODEL_SAFE | typeof ENGINE_COST_MODEL_EVENT_SEQUENCE) {
  return buildResearchEvaluationIdentity({
    paramsHash: "diag_pattern_hash",
    engineCostModel,
    cost: {
      feeRate: FIXTURE_FEE_RATE,
      slippageRate: FIXTURE_SLIPPAGE_RATE,
      fundingRate: FIXTURE_FUNDING_RATE,
      applyFunding: false,
      applySpread: true,
      spreadRate: FIXTURE_SPREAD_RATE,
    },
    costGuardK: null,
    symbols: ["BTCUSDT"],
    timeframe: "15m",
    windows: [
      {
        id: "w1",
        fromOpenTime: Date.UTC(2024, 0, 1),
        toOpenTime: Date.UTC(2024, 0, 2),
        requiredForPass: true,
      },
    ],
    dataVersion: "diag",
    evaluationBalance: 10_000,
    evaluationPolicy: {
      version: "research_evaluation_policy_v1",
      passPolicy: { thresholds: { minTradeCount: 1 } },
      scorePolicy: {
        returnWeight: 1,
        mddWeight: 0.5,
        profitFactorWeight: 0.25,
        winRateWeight: 0.25,
        tradeAdequacyWeight: 0.25,
        negativeMonthWeight: 0.1,
        consistencyWeight: 0.1,
        tradeAdequacyReference: 20,
      },
      costStress: { scenarios: [] },
      jitter: { enabled: false },
    },
  });
}

export function getIdentityVersioning() {
  const ledger = sampleIdentity(ENGINE_COST_MODEL_EVENT_SEQUENCE);
  const ledgerHash = computeResearchEvaluationHash(ledger);
  const proposedHash = createHash("sha256")
    .update(
      JSON.stringify({
        ...ledger,
        engineCostModel: RECOMMENDED_PATTERN_COST_MODEL,
        rankingCompatibilityGroup: RECOMMENDED_PATTERN_COST_MODEL,
      }),
    )
    .digest("hex");
  return {
    NEW_ENGINE_COST_MODEL_REQUIRED: "YES",
    recommendedEngineCostModel: RECOMMENDED_PATTERN_COST_MODEL,
    keepIdentityVersion: RESEARCH_EVALUATION_IDENTITY_VERSION,
    schemaNote:
      "ResearchEngineCostModel is a closed 2-value union. A8.2 must extend the union. Version string can stay because the hash already includes engineCostModel.",
    ledgerHash,
    proposedDiagnosticHash: proposedHash,
    hashesDiffer: ledgerHash !== proposedHash,
  };
}

export function getRankingComparability() {
  return {
    CROSS_ENGINE_GLOBAL_RANKING_AFTER_COST_PARITY: "NO",
    reasons: [
      "Different trade engines and signal families",
      "SAFE additive equity vs Pattern multiplicative baseBalancePct",
      "SAFE cost guard changes trade selection; Pattern must not gain it in this migration",
      "Same calculateCandidateScore formula does not make engines comparable",
      "Window/PASS/stress/jitter policy shared, but inputs are engine-specific",
    ],
    OLD_NEW_PATTERN_DIRECT_RANKING: "NO",
    recommendedGroups: {
      SAFE: ENGINE_COST_MODEL_SAFE,
      PATTERN_LEGACY: ENGINE_COST_MODEL_EVENT_SEQUENCE,
      PATTERN_PARITY: RECOMMENDED_PATTERN_COST_MODEL,
    },
  };
}

export function getHistoricalPolicy() {
  return {
    view: "allowed — do not rewrite historical Pattern trials",
    compare: "allowed only with model-id caveat; do not treat ledger_v0 as execution_price_v1",
    ranking: "ledger_v0 stays in event_sequence_ledger_v0; new trials use a new group",
    OLD_NEW_PATTERN_DIRECT_RANKING: "NO",
  };
}

export function getResumePolicy() {
  return {
    RECOMMENDED_LEGACY_PATTERN_RESUME_POLICY:
      "A. Continue event_sequence_ledger_v0 for jobs whose persisted engineCostModel/profile is ledger_v0. New jobs use event_sequence_execution_price_v1. Do not mix models inside one ranking group. Do not block resume.",
    avoid: "B switching mid-job and C blocking resume",
  };
}

export function getPromotionPolicy() {
  return {
    alreadyPromoted: "untouched",
    historicalLedgerFinalPass:
      "allow manual promotion with legacy provenance warning; do not require rerun",
    newParityTrials: "promote under the new model id and group",
  };
}

export function getResearchBacktestParity() {
  return {
    current:
      "Backtest runner and Research adapter both call runEventSequenceBacktest with feeRate+slippageRate only. Same event_sequence_ledger_v0.",
    Research_equals_Backtest_today: "YES",
    PATTERN_RESEARCH_BACKTEST_PARITY_TARGET:
      "Update the shared event-sequence close-accounting path (not only Research adapter). Otherwise Research Pattern ≠ Backtest Pattern after A8.2.",
    SHARED_HELPER_REUSE_POSSIBLE_LATER: "YES",
    conditionBuilder:
      "conditionBacktest uses the same ledger deduct; a shared helper can later fix it. Out of A8.2 scope.",
  };
}

export function getMigrationOptions() {
  return {
    A: {
      name: "Modify shared ES accounting in place",
      reproducibility: "breaks historical resume semantics",
      historicalResume: "unsafe — old jobs would silently change",
      researchBacktestParity: "kept, but history rewritten in behavior",
      duplication: "lowest",
      risk: "high",
      verdict: "reject",
    },
    B: {
      name: "Explicit ES cost-model mode legacy_v0 vs canonical_v1",
      reproducibility: "job/profile selects mode",
      historicalResume: "legacy jobs stay v0",
      researchBacktestParity: "shared engine, same mode",
      duplication: "low — one close-accounting switch",
      risk: "moderate",
      verdict: "recommended",
    },
    C: {
      name: "Wrapper around legacy signals",
      reproducibility: "possible",
      historicalResume: "needs dual path wiring",
      researchBacktestParity: "easy to miss Backtest runner",
      duplication: "higher",
      risk: "moderate-high",
      verdict: "fallback if mode switch is too invasive",
    },
    D: {
      name: "Keep arithmetic permanently separate",
      reproducibility: "current",
      historicalResume: "safe",
      researchBacktestParity: "current ledger both sides",
      ranking: "never restore cross-engine ranking",
      verdict: "only if A8.2 evidence later fails",
    },
    RECOMMENDED_MIGRATION_MODEL: "B",
    RECOMMENDED_PATTERN_COST_MODEL,
    target: "MODEL P-B — raw Pattern signals + canonical execution-cost helper",
  };
}

export function getFrozenP3A82Contract() {
  return {
    P3_A8_2_READY: "YES",
    A_targetPatternCostModel: "P-B / event_sequence_execution_price_v1",
    B_slippage:
      "applyAdverseSlippage on raw Pattern entry/exit fills; do not deduct slipPct; do not change triggers",
    C_fee: "feePct = feeRate * 2 deducted from executionReturn, same USDT formula as SAFE",
    D_funding:
      "fundingPct = applyFunding ? fundingRate : 0; current SAFE flat per-trade semantic",
    E_spread: "spreadPct = applySpread ? spreadRate : 0; current SAFE flat semantic",
    F_costGuard: "do not add; not accounting parity",
    G_tradeSelectionInvariant: "YES — raw signals/trade count unchanged",
    H_engineCostModel: RECOMMENDED_PATTERN_COST_MODEL,
    I_researchBacktestScope: "shared event-sequence accounting path",
    J_oldPatternTrialPolicy: "viewable; stay in event_sequence_ledger_v0; do not rewrite",
    K_resumePolicy: "resume historical jobs on ledger_v0; new jobs use v1",
    L_promotionPolicy:
      "historical Final PASS may promote with legacy warning; already-promoted untouched",
    M_rankingCompatibilityGroupPolicy:
      "keep SAFE / ledger_v0 / execution_price_v1 as three groups; no global ranking",
    identityVersion: RESEARCH_EVALUATION_IDENTITY_VERSION,
    productionMigrationRequired: true,
    doNotImplementInA81: true,
  };
}

export function getProvenanceImpact() {
  return {
    historical: "do not change",
    futureParity: {
      fee: { configured: true, engineApplied: true },
      slippage: { configured: true, engineApplied: true, model: "execution_price_v1" },
      funding: {
        configuredEnabled: "applyFunding",
        engineApplied: "applyFunding",
        effectiveRate: "applyFunding ? fundingRate : 0",
      },
      spread: {
        configuredEnabled: "applySpread",
        engineApplied: "applySpread",
        effectiveRate: "applySpread ? spreadRate : 0",
      },
    },
  };
}

export function buildP3A81Diagnosis(cwd = process.cwd()) {
  return {
    hashes: productionReadonlyHashes(cwd),
    engineCostPaths: getEngineCostPaths(),
    exitReasonMatrix: getExitReasonMatrix(),
    fixtures: getLongShortFixtures(),
    feeParity: getFeeParity(),
    fundingDesign: getFundingDesign(),
    spreadDesign: getSpreadDesign(),
    costGuard: getCostGuardAnalysis(),
    signalSelection: getSignalSelectionInvariant(),
    scoreImpact: getCandidateScoreImpact(),
    costStress: getCostStressImpact(),
    jitter: getJitterImpact(),
    identity: getIdentityVersioning(),
    ranking: getRankingComparability(),
    historical: getHistoricalPolicy(),
    resume: getResumePolicy(),
    promotion: getPromotionPolicy(),
    researchBacktest: getResearchBacktestParity(),
    migration: getMigrationOptions(),
    provenance: getProvenanceImpact(),
    frozen: getFrozenP3A82Contract(),
    slippageHelper: getSlippageHelperReuse(),
  };
}

export async function writeP3A81Artifacts(cwd = process.cwd()) {
  const diagnosis = buildP3A81Diagnosis(cwd);
  const dir = path.join(
    cwd,
    ".validation",
    "research-p3-a8-1-cost-arithmetic-parity",
    P3A81_ARTIFACT_TS,
  );
  fs.mkdirSync(dir, { recursive: true });
  const files: Record<string, unknown> = {
    "engine-cost-paths.json": diagnosis.engineCostPaths,
    "exit-reason-matrix.json": diagnosis.exitReasonMatrix,
    "long-short-fixtures.json": diagnosis.fixtures,
    "fee-parity.json": diagnosis.feeParity,
    "funding-design.json": diagnosis.fundingDesign,
    "spread-design.json": diagnosis.spreadDesign,
    "cost-guard-analysis.json": diagnosis.costGuard,
    "signal-selection-invariant.json": diagnosis.signalSelection,
    "candidate-score-impact.json": diagnosis.scoreImpact,
    "cost-stress-impact.json": diagnosis.costStress,
    "identity-versioning.json": diagnosis.identity,
    "ranking-comparability.json": diagnosis.ranking,
    "historical-policy.json": diagnosis.historical,
    "resume-policy.json": diagnosis.resume,
    "promotion-policy.json": diagnosis.promotion,
    "research-backtest-parity.json": diagnosis.researchBacktest,
    "migration-options.json": diagnosis.migration,
    "p3-a8-2-frozen-contract.json": diagnosis.frozen,
    "production-readonly-hashes.json": diagnosis.hashes,
  };
  for (const [name, value] of Object.entries(files)) {
    fs.writeFileSync(path.join(dir, name), JSON.stringify(value, null, 2), "utf8");
  }
  return { dir, diagnosis };
}
