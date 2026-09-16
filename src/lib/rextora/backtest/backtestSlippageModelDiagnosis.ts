/**
 * P3-A5.1 read-only forensic diagnosis: SAFE Backtest slippage
 * execution vs ledger double-application, exit-reason inconsistency,
 * and canonical correction-model selection.
 *
 * Does not mutate production arithmetic, SAFE, Research, Paper/Live.
 */

import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type { OhlcvCandle } from "../data/ohlcvTypes";
import { computeSlippageCost } from "../metrics/unifiedCost";
import { evaluateCostGuard } from "../cost/costGuard";
import {
  runSafeV44Backtest,
  type BacktestTrade,
} from "./backtestEngine";
import {
  microStrategyParams,
  productionReadonlyHashes,
} from "./backtestCostAssumptionsDiagnosis";
import type { SafeV44Params } from "../strategy/strategyTypes";

export const P3A51_ARTIFACT_TS = "2026-09-03T13-10-00-000Z";
export const SLIPPAGE_RATE = 0.0002;
export const FEE_RATE = 0.0004;
export const SPREAD_RATE = 0.0001;

export const SLIPPAGE_SOURCE_PIPELINE = [
  "components/rextora/backtest/BacktestReviewWorkbench.tsx (omits slippageRate; API default 0.0002)",
  "app/api/rextora/backtest/run/route.ts::POST body.slippageRate ?? 0.0002",
  "src/lib/rextora/backtest/backtestRunner.ts::runConfiguredBacktest (slippageRate * costStress multiplier)",
  "SAFE: src/lib/rextora/backtest/backtestEngine.ts::runSafeV44Backtest",
  "event-sequence: src/lib/rextora/strategy/eventSequenceBacktest.ts::runEventSequenceBacktest",
  "condition-builder: src/lib/rextora/strategy/conditionBacktest.ts::runConditionBuilderBacktest",
  "cost guard: src/lib/rextora/cost/costGuard.ts::evaluateCostGuard → metrics/unifiedCost.ts::computeSlippageCost (rate*2)",
  "ledger: backtestEngine.ts::ledgerFields slippageCostUsdt = margin * slipPct * leverage",
  "report: backtestReport.ts::aggregateBacktestMetrics slippageTotal / costs.slippageCostUsdt",
].join(" → ");

export type ExitReason = BacktestTrade["exitReason"];
export type Side = "LONG" | "SHORT";
export type SlipClass = "DOUBLE_APPLIED" | "SINGLE_APPLIED" | "NOT_APPLIED" | "MIXED";

function round6(n: number): number {
  return Number(n.toFixed(6));
}

function sha256File(p: string): string | null {
  if (!fs.existsSync(p)) return null;
  return createHash("sha256").update(fs.readFileSync(p)).digest("hex");
}

export function applyAdverseSlippage(input: {
  side: Side;
  action: "entry" | "exit";
  rawPrice: number;
  slippageRate: number;
}): number {
  const s = input.slippageRate;
  if (input.action === "entry") {
    return input.side === "LONG"
      ? input.rawPrice * (1 + s)
      : input.rawPrice * (1 - s);
  }
  return input.side === "LONG"
    ? input.rawPrice * (1 - s)
    : input.rawPrice * (1 + s);
}

const WARMUP = 8;

function baseCandles(side: Side, extra: OhlcvCandle[]): OhlcvCandle[] {
  const intervalMs = 900_000;
  const start = Date.UTC(2026, 0, 1);
  const out: OhlcvCandle[] = [];
  for (let i = 0; i < WARMUP; i += 1) {
    out.push({
      openTime: start + i * intervalMs,
      open: 100,
      high: 100.1,
      low: 99.9,
      close: 100,
      volume: 100,
    });
  }
  const entryTime = start + WARMUP * intervalMs;
  if (side === "LONG") {
    out.push({
      openTime: entryTime,
      open: 100,
      high: 110,
      low: 100,
      close: 110,
      volume: 5_000,
    });
  } else {
    out.push({
      openTime: entryTime,
      open: 100,
      high: 100,
      low: 90,
      close: 90,
      volume: 5_000,
    });
  }
  return out.concat(extra);
}

function extraBar(
  side: Side,
  offset: number,
  ohlc: { open: number; high: number; low: number; close: number },
): OhlcvCandle {
  const intervalMs = 900_000;
  const start = Date.UTC(2026, 0, 1);
  return {
    openTime: start + (WARMUP + offset) * intervalMs,
    ...ohlc,
    volume: 100,
  };
}

export interface ExitFixtureRow {
  side: Side;
  exitReason: ExitReason;
  requestedReason: ExitReason;
  rawEntry: number;
  executionEntry: number;
  triggerLevel: number | null;
  rawExit: number;
  executionExit: number;
  grossPnlUsdt: number;
  slippagePct: number;
  slippageCostUsdt: number;
  feeCostUsdt: number;
  spreadCostUsdt: number;
  netPnlUsdt: number;
  entryPriceSlipApplied: boolean;
  exitPriceSlipApplied: boolean;
  ledgerSlipApplied: boolean;
  priceApplicationCount: number;
  ledgerApplicationCount: number;
  effectiveLegCount: number;
  classification: SlipClass;
  marginUsdt: number;
  leverage: number;
  holdBars: number | undefined;
  takeProfit: number;
  stopLoss: number;
}

function classify(row: {
  entryPriceSlipApplied: boolean;
  exitPriceSlipApplied: boolean;
  ledgerSlipApplied: boolean;
}): {
  classification: SlipClass;
  priceApplicationCount: number;
  ledgerApplicationCount: number;
  effectiveLegCount: number;
} {
  const priceApplicationCount =
    Number(row.entryPriceSlipApplied) + Number(row.exitPriceSlipApplied);
  const ledgerApplicationCount = Number(row.ledgerSlipApplied);
  const effectiveLegCount = priceApplicationCount + ledgerApplicationCount;
  let classification: SlipClass;
  if (priceApplicationCount > 0 && ledgerApplicationCount > 0) {
    classification = "DOUBLE_APPLIED";
  } else if (priceApplicationCount === 1 && ledgerApplicationCount === 0) {
    classification = "MIXED";
  } else if (priceApplicationCount === 2 && ledgerApplicationCount === 0) {
    classification = "SINGLE_APPLIED";
  } else if (priceApplicationCount === 0 && ledgerApplicationCount === 1) {
    classification = "SINGLE_APPLIED";
  } else if (effectiveLegCount === 0) {
    classification = "NOT_APPLIED";
  } else {
    classification = "MIXED";
  }
  return {
    classification,
    priceApplicationCount,
    ledgerApplicationCount,
    effectiveLegCount,
  };
}

export function runExitReasonFixture(input: {
  side: Side;
  reason: ExitReason;
  slippageRate?: number;
  feeRate?: number;
  applySpread?: boolean;
  spreadRate?: number;
  leverage?: number;
  useTrailing?: boolean;
}): ExitFixtureRow {
  const slippageRate = input.slippageRate ?? SLIPPAGE_RATE;
  const feeRate = input.feeRate ?? 0;
  const leverage = input.leverage ?? 1;
  const side = input.side;
  let maxHold = 999;
  let extras: OhlcvCandle[] = [];
  let slMult = 50;
  let tpMult = 50;

  if (input.reason === "max_hold") {
    maxHold = 1;
    extras =
      side === "LONG"
        ? [
            extraBar(side, 1, {
              open: 110.8,
              high: 111.2,
              low: 110.6,
              close: 111,
            }),
            extraBar(side, 2, {
              open: 111,
              high: 111.2,
              low: 110.8,
              close: 112,
            }),
          ]
        : [
            extraBar(side, 1, {
              open: 89.2,
              high: 89.4,
              low: 88.8,
              close: 89,
            }),
            extraBar(side, 2, {
              open: 89,
              high: 89.2,
              low: 88.8,
              close: 88,
            }),
          ];
  } else if (input.reason === "take_profit") {
    tpMult = 0.001;
    extras =
      side === "LONG"
        ? [
            extraBar(side, 1, {
              open: 110,
              high: 200,
              low: 109.5,
              close: 120,
            }),
          ]
        : [
            extraBar(side, 1, {
              open: 90,
              high: 90.5,
              low: 10,
              close: 80,
            }),
          ];
  } else if (input.reason === "stop_loss") {
    slMult = 0.001;
    extras =
      side === "LONG"
        ? [
            extraBar(side, 1, {
              open: 110,
              high: 110.2,
              low: 1,
              close: 50,
            }),
          ]
        : [
            extraBar(side, 1, {
              open: 90,
              high: 200,
              low: 89.5,
              close: 120,
            }),
          ];
  } else if (input.reason === "end") {
    extras =
      side === "LONG"
        ? [
            extraBar(side, 1, {
              open: 110,
              high: 110.3,
              low: 109.7,
              close: 110.2,
            }),
          ]
        : [
            extraBar(side, 1, {
              open: 90,
              high: 90.3,
              low: 89.7,
              close: 89.8,
            }),
          ];
  } else if (input.reason === "trailing_stop") {
    extras =
      side === "LONG"
        ? [
            extraBar(side, 1, {
              open: 110,
              high: 140,
              low: 109.8,
              close: 135,
            }),
            extraBar(side, 2, {
              open: 135,
              high: 135.2,
              low: 1,
              close: 80,
            }),
          ]
        : [
            extraBar(side, 1, {
              open: 90,
              high: 90.2,
              low: 60,
              close: 65,
            }),
            extraBar(side, 2, {
              open: 65,
              high: 200,
              low: 64,
              close: 120,
            }),
          ];
  }

  const params: SafeV44Params = {
    ...microStrategyParams({ side, leverage, maxHoldBars: maxHold }),
    sl_atr_mult: slMult,
    tp_atr_mult: tpMult,
    use_trailing: Boolean(input.useTrailing) || input.reason === "trailing_stop",
    trail_atr_mult: input.reason === "trailing_stop" ? 0.05 : 0,
  };
  const candles = baseCandles(side, extras);
  const result = runSafeV44Backtest({
    symbol: "BTCUSDT",
    candles,
    params,
    paramsHash: "p3a51-slip-fixture",
    strategyName: "P3A51_SLIP",
    strategyId: "P3A51_SLIP",
    sourceStatus: "user_created",
    timeframe: "15m",
    balance: 10_000,
    feeRate,
    slippageRate,
    fundingRate: 0,
    applyFunding: false,
    applySpread: Boolean(input.applySpread),
    spreadRate: input.spreadRate ?? 0,
    dataSource: "synthetic-test",
  });
  if (result.trades.length !== 1) {
    throw new Error(
      `${side} ${input.reason}: expected 1 trade, got ${result.trades.length} ${JSON.stringify(result.report.zeroTradeDiagnostics)}`,
    );
  }
  const trade = result.trades[0]!;
  const rawEntry = candles[trade.entryBar]!.close;
  const executionEntry = trade.entryPrice;
  let triggerLevel: number | null = null;
  let rawExit: number;
  if (trade.exitReason === "take_profit") {
    triggerLevel = trade.takeProfit;
    rawExit = trade.takeProfit;
  } else if (trade.exitReason === "stop_loss" || trade.exitReason === "trailing_stop") {
    triggerLevel = trade.stopLoss;
    rawExit = trade.stopLoss;
  } else {
    triggerLevel = null;
    rawExit = candles[trade.exitBar]!.close;
  }
  const executionExit = trade.exitPrice;
  const entryPriceSlipApplied = Math.abs(executionEntry - rawEntry) > 1e-12;
  const exitPriceSlipApplied = Math.abs(executionExit - rawExit) > 1e-12;
  const ledgerSlipApplied = Math.abs(
    (trade.netPnlUsdt ?? 0) -
      ((trade.grossPnlUsdt ?? 0) -
        (trade.feeCostUsdt ?? 0) -
        (trade.fundingCostUsdt ?? 0) -
        (trade.spreadCostUsdt ?? 0)),
  ) > 1e-4;
  const cls = classify({
    entryPriceSlipApplied,
    exitPriceSlipApplied,
    ledgerSlipApplied,
  });
  return {
    side,
    exitReason: trade.exitReason,
    requestedReason: input.reason,
    rawEntry,
    executionEntry,
    triggerLevel,
    rawExit,
    executionExit,
    grossPnlUsdt: trade.grossPnlUsdt ?? 0,
    slippagePct: trade.slippagePct ?? 0,
    slippageCostUsdt: trade.slippageCostUsdt ?? 0,
    feeCostUsdt: trade.feeCostUsdt ?? 0,
    spreadCostUsdt: trade.spreadCostUsdt ?? 0,
    netPnlUsdt: trade.netPnlUsdt ?? 0,
    entryPriceSlipApplied,
    exitPriceSlipApplied,
    ledgerSlipApplied,
    ...cls,
    marginUsdt: trade.marginUsdt ?? 0,
    leverage: trade.leverage,
    holdBars: trade.holdBars,
    takeProfit: trade.takeProfit,
    stopLoss: trade.stopLoss,
  };
}

export function buildExitReasonMatrix() {
  const reasons: ExitReason[] = [
    "take_profit",
    "stop_loss",
    "max_hold",
    "end",
  ];
  const rows: ExitFixtureRow[] = [];
  for (const side of ["LONG", "SHORT"] as const) {
    for (const reason of reasons) {
      rows.push(runExitReasonFixture({ side, reason, slippageRate: SLIPPAGE_RATE }));
    }
  }
  const trailingProbe = runExitReasonFixture({
    side: "LONG",
    reason: "trailing_stop",
    slippageRate: SLIPPAGE_RATE,
    useTrailing: true,
  });
  return { rows, trailingProbe };
}

export function slippageApplicationCountTable(matrix = buildExitReasonMatrix()) {
  return matrix.rows.map((r) => ({
    exitReason: r.exitReason,
    side: r.side,
    entryPriceSlipApplied: r.entryPriceSlipApplied,
    exitPriceSlipApplied: r.exitPriceSlipApplied,
    ledgerSlipApplied: r.ledgerSlipApplied,
    priceApplicationCount: r.priceApplicationCount,
    ledgerApplicationCount: r.ledgerApplicationCount,
    effectiveLegCount: r.effectiveLegCount,
    classification: r.classification,
  }));
}

export function getPriceAuthorities() {
  return {
    LONG: {
      RAW_ENTRY_PRICE: "candle.close at signal bar (risk.entryPrice) — unslipped",
      ENTRY_EXECUTION_PRICE: "risk.entryPrice * (1 + slippageRate) stored as open.entryPrice / trade.entryPrice",
      RAW_EXIT_PRICE:
        "TP: open.takeProfit; SL: stop (possibly trailed); max_hold/end: candle.close / last.close",
      EXIT_EXECUTION_PRICE:
        "max_hold: rawExit * (1 - slippageRate); TP/SL/end: equal to rawExit",
      TRIGGER_PRICE: "TP: open.takeProfit vs candle.high; SL: stop vs candle.low — RAW, never slipped",
      PNL_ENTRY_PRICE: "open.entryPrice (already slipped)",
      PNL_EXIT_PRICE: "px after optional max_hold slip",
      FEE_NOTIONAL_PRICE:
        "NOT an execution price. quantity = (margin*leverage)/unslipped risk.entryPrice; feeCostUsdt = margin * (feeRate*2) * leverage",
      SLIPPAGE_LEDGER_BASE: "slipPct = (exitReason==='max_hold' ? slippageRate : 0) * 2; then margin * slipPct * leverage",
    },
    SHORT: {
      RAW_ENTRY_PRICE: "candle.close at signal bar",
      ENTRY_EXECUTION_PRICE: "risk.entryPrice * (1 - slippageRate)",
      RAW_EXIT_PRICE: "TP: open.takeProfit; SL: stop; max_hold/end: close",
      EXIT_EXECUTION_PRICE:
        "max_hold: rawExit * (1 + slippageRate); TP/SL/end: equal to rawExit",
      TRIGGER_PRICE: "TP: open.takeProfit vs candle.low; SL: stop vs candle.high — RAW",
      PNL_ENTRY_PRICE: "open.entryPrice (already slipped)",
      PNL_EXIT_PRICE: "px after optional max_hold slip",
      FEE_NOTIONAL_PRICE: "same margin*leverage abstraction as long; unslipped sizing",
      SLIPPAGE_LEDGER_BASE: "same as long: slipPct = exitSlip * 2",
    },
  };
}

export function getTriggerFillContract() {
  return {
    CURRENT_TRIGGER_MODEL:
      "A-minus: trigger at raw strategy TP/SL (intrabar high/low vs unslipped stop/target). Trailing updates stop from candle.close then assigns open.stopLoss=stop before the trailing_stop vs stop_loss comparison, making trailing_stop reason unreachable.",
    CURRENT_FILL_MODEL:
      "TP/SL: fill equals the raw trigger level (not adversely slipped). max_hold: fill = close * adverse slip. end: fill = last.close unslipped. Entry fill is always adversely slipped. SL is evaluated before TP on the same bar.",
    selectedFuture:
      "MODEL A: keep trigger at raw TP/SL; fill every close (including TP/SL/max_hold/end) at adversely slipped execution price. Do not shift triggers.",
  };
}

export function getEntryAuthorities() {
  return {
    ENTRY_SIGNAL_PRICE_AUTHORITY:
      "SAFE: evaluateSafeV44Signal uses indicator snapshots on candle.close / breakoutHigh/Low (computeBreakoutLevelSeries excludes current high). Signal is NOT next-bar. Event-sequence: pattern geometry then entryPrice = c.close. Condition-builder: evaluateBuilderSignal then entryPrice = c.close.",
    ENTRY_FILL_PRICE_AUTHORITY:
      "SAFE: slipped risk.entryPrice (candle.close ± rate). Event-sequence/condition: fill = c.close, no price slip.",
    slippageShouldAffect: "execution only — signal detection uses raw market structure; shifting signals would change strategy logic (forbidden).",
  };
}

export function getFeeInteraction() {
  const tp = runExitReasonFixture({
    side: "LONG",
    reason: "take_profit",
    feeRate: FEE_RATE,
    slippageRate: SLIPPAGE_RATE,
  });
  const hold = runExitReasonFixture({
    side: "LONG",
    reason: "max_hold",
    feeRate: FEE_RATE,
    slippageRate: SLIPPAGE_RATE,
  });
  const expectedFee = round6(tp.marginUsdt * FEE_RATE * 2 * tp.leverage);
  return {
    FEE_DEPENDS_ON_EXECUTION_PRICE: "NO" as const,
    why: "feeCostUsdt = margin * (feeRate*2) * leverage. margin = balance * base_bal_pct. quantity sized from unslipped risk.entryPrice. Changing fill prices does not change feeCostUsdt.",
    tpFeeCostUsdt: tp.feeCostUsdt,
    maxHoldFeeCostUsdt: hold.feeCostUsdt,
    expectedFee,
    feesEqualAcrossExitReasons: Math.abs(tp.feeCostUsdt - hold.feeCostUsdt) < 1e-9,
    isolation:
      "Slippage correction can be isolated: stop subtracting slipPct from pnlPct and apply exit-price slip; leave feePct math untouched.",
  };
}

export function getSpreadInteraction() {
  const off = runExitReasonFixture({
    side: "LONG",
    reason: "max_hold",
    applySpread: false,
    spreadRate: SPREAD_RATE,
    slippageRate: SLIPPAGE_RATE,
  });
  const on = runExitReasonFixture({
    side: "LONG",
    reason: "max_hold",
    applySpread: true,
    spreadRate: SPREAD_RATE,
    slippageRate: SLIPPAGE_RATE,
  });
  return {
    SPREAD_RUNTIME_FORMULA:
      "If applySpread: spreadRate ?? 0.0001 else 0. spreadPct = spreadRate (ONCE, not *2). Does not shift entry/exit prices. spreadCostUsdt = margin * spreadPct * leverage. Subtracted from raw in pnlPct alongside fee/slip/funding.",
    SLIPPAGE_SPREAD_DOUBLE_COUNT_RISK: "PARTIAL" as const,
    executionPricesUnchangedBySpread:
      Math.abs(off.executionEntry - on.executionEntry) < 1e-12 &&
      Math.abs(off.executionExit - on.executionExit) < 1e-12,
    spreadCostWhenOn: on.spreadCostUsdt,
    spreadCostWhenOff: off.spreadCostUsdt,
    note: "Economically both are friction. They are separate ledger lines. Do not redesign spread in P3-A5.2. MODEL A execution slip + remaining spreadPct is still two friction models; document, do not merge.",
  };
}

export function getCostGuardAnalysis() {
  const guard = evaluateCostGuard({
    entryPrice: 100,
    takeProfitPrice: 101,
    side: "LONG",
    atr: 1,
    params: { cost_guard: true, cost_guard_k: 3 },
    feeRate: FEE_RATE,
    slippageRate: SLIPPAGE_RATE,
    spreadRate: 0,
    fundingRate: 0,
  });
  return {
    TRADE_SELECTION_COST_ESTIMATE:
      "evaluateUnifiedCost / evaluateCostGuard: slippageCost = computeSlippageCost(slippageRate) = slippageRate * 2. Compared against expectedReward = |TP-entry|/entry using UNSLIPPED risk.entryPrice and UNSLIPPED takeProfitPrice. Pass if expectedReward >= totalCost * cost_guard_k. Stress multiplies slippageRate → fewer trades pass → tradeCount changes.",
    REALIZED_TRADE_COST_ACCOUNTING:
      "SAFE close: raw from slipped stored entryPrice and (max_hold-only) slipped exit, then subtracts slipPct=exitSlip*2 from that raw. Distinct from the pre-trade estimate.",
    relationship:
      "PRE-TRADE ESTIMATE, not realized double-count. Conservative vs fill because guard measures TP from unslipped entry while fill entry is already worse. Numerically uses the same rate*2 as the max_hold ledger, which is coincidental overlap not a shared function call from the close path.",
    captured: {
      slippageCost: guard.slippageCost,
      expectedFromHelper: computeSlippageCost(SLIPPAGE_RATE),
      feeRoundTrip: guard.feeRoundTrip,
      passed: guard.passed,
    },
    stressTradeCountCause:
      "backtestRunner scales feeRate and slippageRate into both costGuard and the engine. Higher rates raise the guard threshold and change fills; observed production tradeCount 1642/1619/1541.",
  };
}

export interface ModelArithmetic {
  model: "CURRENT_MAX_HOLD" | "CURRENT_TP_SL_END" | "MODEL_A" | "MODEL_B";
  side: Side;
  rawEntry: number;
  rawExit: number;
  leverage: number;
  margin: number;
  entryExecution: number;
  exitExecution: number;
  grossPnlUsdt: number;
  slippageMonetaryUsdt: number;
  slippageDeductedAgainUsdt: number;
  netPnlUsdt: number;
}

export function computeModelArithmetic(input: {
  model: ModelArithmetic["model"];
  side: Side;
  rawEntry: number;
  rawExit: number;
  leverage: number;
  margin?: number;
  slippageRate?: number;
}): ModelArithmetic {
  const rate = input.slippageRate ?? SLIPPAGE_RATE;
  const margin = input.margin ?? 1000;
  const lev = input.leverage;
  const notional = margin * lev;
  const signed = (entry: number, exit: number) =>
    input.side === "LONG" ? (exit - entry) / entry : (entry - exit) / entry;

  if (input.model === "MODEL_A") {
    const entryExecution = applyAdverseSlippage({
      side: input.side,
      action: "entry",
      rawPrice: input.rawEntry,
      slippageRate: rate,
    });
    const exitExecution = applyAdverseSlippage({
      side: input.side,
      action: "exit",
      rawPrice: input.rawExit,
      slippageRate: rate,
    });
    const rawUnslip = signed(input.rawEntry, input.rawExit);
    const rawExec = signed(entryExecution, exitExecution);
    const grossPnlUsdt = round6(margin * rawExec * lev);
    const unslipGross = round6(margin * rawUnslip * lev);
    const slippageMonetaryUsdt = round6(unslipGross - grossPnlUsdt);
    return {
      model: "MODEL_A",
      side: input.side,
      rawEntry: input.rawEntry,
      rawExit: input.rawExit,
      leverage: lev,
      margin,
      entryExecution,
      exitExecution,
      grossPnlUsdt,
      slippageMonetaryUsdt,
      slippageDeductedAgainUsdt: 0,
      netPnlUsdt: grossPnlUsdt,
    };
  }

  if (input.model === "MODEL_B") {
    const raw = signed(input.rawEntry, input.rawExit);
    const grossPnlUsdt = round6(margin * raw * lev);
    const slippageMonetaryUsdt = round6(notional * rate * 2);
    return {
      model: "MODEL_B",
      side: input.side,
      rawEntry: input.rawEntry,
      rawExit: input.rawExit,
      leverage: lev,
      margin,
      entryExecution: input.rawEntry,
      exitExecution: input.rawExit,
      grossPnlUsdt,
      slippageMonetaryUsdt,
      slippageDeductedAgainUsdt: slippageMonetaryUsdt,
      netPnlUsdt: round6(grossPnlUsdt - slippageMonetaryUsdt),
    };
  }

  if (input.model === "CURRENT_MAX_HOLD") {
    const entryExecution = applyAdverseSlippage({
      side: input.side,
      action: "entry",
      rawPrice: input.rawEntry,
      slippageRate: rate,
    });
    const exitExecution = applyAdverseSlippage({
      side: input.side,
      action: "exit",
      rawPrice: input.rawExit,
      slippageRate: rate,
    });
    const raw = signed(entryExecution, exitExecution);
    const grossPnlUsdt = round6(margin * raw * lev);
    const extra = round6(notional * rate * 2);
    return {
      model: "CURRENT_MAX_HOLD",
      side: input.side,
      rawEntry: input.rawEntry,
      rawExit: input.rawExit,
      leverage: lev,
      margin,
      entryExecution,
      exitExecution,
      grossPnlUsdt,
      slippageMonetaryUsdt: extra,
      slippageDeductedAgainUsdt: extra,
      netPnlUsdt: round6(grossPnlUsdt - extra),
    };
  }

  const entryExecution = applyAdverseSlippage({
    side: input.side,
    action: "entry",
    rawPrice: input.rawEntry,
    slippageRate: rate,
  });
  const raw = signed(entryExecution, input.rawExit);
  const grossPnlUsdt = round6(margin * raw * lev);
  return {
    model: "CURRENT_TP_SL_END",
    side: input.side,
    rawEntry: input.rawEntry,
    rawExit: input.rawExit,
    leverage: lev,
    margin,
    entryExecution,
    exitExecution: input.rawExit,
    grossPnlUsdt,
    slippageMonetaryUsdt: 0,
    slippageDeductedAgainUsdt: 0,
    netPnlUsdt: grossPnlUsdt,
  };
}

export function buildModelComparison() {
  const longRaw = { rawEntry: 100, rawExit: 110 };
  const shortRaw = { rawEntry: 100, rawExit: 90 };
  const leverages = [1, 5, 10] as const;
  const long = leverages.map((leverage) => ({
    leverage,
    currentMaxHold: computeModelArithmetic({
      model: "CURRENT_MAX_HOLD",
      side: "LONG",
      ...longRaw,
      leverage,
    }),
    currentTp: computeModelArithmetic({
      model: "CURRENT_TP_SL_END",
      side: "LONG",
      ...longRaw,
      leverage,
    }),
    modelA: computeModelArithmetic({
      model: "MODEL_A",
      side: "LONG",
      ...longRaw,
      leverage,
    }),
    modelB: computeModelArithmetic({
      model: "MODEL_B",
      side: "LONG",
      ...longRaw,
      leverage,
    }),
  }));
  const short = leverages.map((leverage) => ({
    leverage,
    currentMaxHold: computeModelArithmetic({
      model: "CURRENT_MAX_HOLD",
      side: "SHORT",
      ...shortRaw,
      leverage,
    }),
    currentTp: computeModelArithmetic({
      model: "CURRENT_TP_SL_END",
      side: "SHORT",
      ...shortRaw,
      leverage,
    }),
    modelA: computeModelArithmetic({
      model: "MODEL_A",
      side: "SHORT",
      ...shortRaw,
      leverage,
    }),
    modelB: computeModelArithmetic({
      model: "MODEL_B",
      side: "SHORT",
      ...shortRaw,
      leverage,
    }),
  }));
  return {
    MODEL_A:
      "Adverse execution prices on entry AND every exit. PnL from execution prices only. slippageCostUsdt is derived attribution (unslippedGross - executionGross), not deducted again. Triggers remain raw. Matches two-leg economic cost without double count. Same semantics for TP/SL/max_hold/end.",
    MODEL_B:
      "Raw prices throughout. Deduct notional * 2 * slippageRate. Internally consistent and matches event-sequence/condition-builder today. Does not model adverse TP/SL fills. Trigger=fill=raw.",
    MODEL_C:
      "Preserve reason-specific differences. Rejected: that IS the defect (max_hold double, TP/SL/end missing exit slip).",
    MODEL_D:
      "Execution prices plus an extra ledger only if a cost is not in the price. Current extra max_hold ledger IS represented by the price move — no leftover component proven. Rejected.",
    RECOMMENDED_SLIPPAGE_MODEL: "MODEL_A" as const,
    CANONICAL_SLIPPAGE_LEG_COUNT: 2,
    whyLegCount:
      "A closed trade has an entry fill and an exit fill. Both should be adverse. The existing ×2 ledger is not evidence of correctness — it is the max_hold double-count. Canonical count is two PRICE legs, zero deducting ledger legs.",
    long,
    short,
  };
}

export function getRecommendedFormulas() {
  return {
    LONG_ENTRY: "execution = rawEntry * (1 + slippageRate); trigger/signal unchanged (candle.close / breakout)",
    SHORT_ENTRY: "execution = rawEntry * (1 - slippageRate)",
    LONG_EXIT: "execution = rawExit * (1 - slippageRate) for TP, SL, max_hold, and end",
    SHORT_EXIT: "execution = rawExit * (1 + slippageRate) for TP, SL, max_hold, and end",
    LONG_TP: {
      trigger: "candle.high >= takeProfit (raw takeProfit from unslipped risk calc)",
      fill: "takeProfit * (1 - slippageRate)",
    },
    SHORT_TP: {
      trigger: "candle.low <= takeProfit",
      fill: "takeProfit * (1 + slippageRate)",
    },
    LONG_SL: {
      trigger: "candle.low <= stop (raw stop; trailing may move stop from close)",
      fill: "stop * (1 - slippageRate)",
    },
    SHORT_SL: {
      trigger: "candle.high >= stop",
      fill: "stop * (1 + slippageRate)",
    },
    LONG_MAX_HOLD: {
      trigger: "i - entryBar >= maxHoldBars",
      fill: "candle.close * (1 - slippageRate)",
    },
    SHORT_MAX_HOLD: {
      trigger: "i - entryBar >= maxHoldBars",
      fill: "candle.close * (1 + slippageRate)",
    },
    LONG_END: {
      trigger: "position still open after last bar",
      fill: "last.close * (1 - slippageRate)",
    },
    SHORT_END: {
      trigger: "position still open after last bar",
      fill: "last.close * (1 + slippageRate)",
    },
    pnl: "raw = LONG ? (exitExec-entryExec)/entryExec : (entryExec-exitExec)/entryExec; pnlPct = (raw - feePct - fundingPct - spreadPct) * leverage; do NOT subtract slipPct",
    attribution:
      "slippageCostUsdt = unslippedGrossUsdt - executionGrossUsdt; slippagePct = slippageCostUsdt / (margin*leverage) for display",
  };
}

export function getLedgerSemantics() {
  return {
    RECOMMENDED_SLIPPAGE_LEDGER_SEMANTIC: "A" as const,
    meaning:
      "Keep trade.slippagePct / slippageCostUsdt and report.costs.slippageCostUsdt as DERIVED ATTRIBUTION of execution-price vs unslipped-price PnL. Do not subtract them again from pnlPct.",
    backwardCompatibility:
      "Field names stay. Historical readers still render a USDT slippage number. Semantic changes from 'deducted ledger fraction' to 'attribution of fill vs raw'. Distinguisher MUST be a new slippageModelVersion on the report so old max_hold double-count totals are not compared as equal to new attribution totals.",
    rejectedB: "Zeroing slippageCostUsdt would break BacktestAnalysisView cost bars and eligibility cost ratios.",
    rejectedC: "Renames would break persisted JSON without migration (forbidden this phase anyway).",
  };
}

export function getGrossNetSemantics() {
  return {
    currentGross:
      "trade.grossPnlUsdt = margin * raw * leverage where raw uses stored (slipped) entryPrice and px (slipped only on max_hold). Report costs.grossPnLBeforeCosts sums that. UI cost identity assumes net ≈ gross - totalCost where totalCost includes slippageCostUsdt.",
    currentNet:
      "trade.netPnlUsdt = margin * pnlPct with pnlPct = (raw - feePct - slipPct - fundingPct - spreadPct) * leverage.",
    CANONICAL_GROSS_PNL_SEMANTIC:
      "PnL computed from execution (slipped) prices, before fee/funding/spread. Slippage lives in the prices, not as a second deduction. Unslipped market-move PnL is a separate attribution input, not the headline gross.",
    CANONICAL_NET_PNL_SEMANTIC:
      "Execution-price gross minus feeCostUsdt minus fundingCostUsdt minus spreadCostUsdt. slippageCostUsdt is attribution only and is NOT subtracted again.",
  };
}

export function getStressSemantics() {
  return {
    RECOMMENDED_STRESS_SLIPPAGE_SEMANTIC:
      "Multiply slippageRate, which widens adverse execution prices under MODEL A. Do not also multiply a deducting slipPct (there is none). Cost guard may keep using slippageRate*2 as a pre-trade round-trip estimate of those two price legs — that is selection, not realized double-count. Must snapshot the stressed rate on each costStress row to avoid P3-A5 unlabeled-stress confusion.",
    multipliers: [1, 1.5, 2],
    doubleCountRiskIfWrong: "If P3-A5.2 kept slipPct deduction while also slipping all exits, stress would triple-count. MODEL A forbids the deducting slipPct.",
  };
}

export function getEngineParity() {
  return {
    SAFE: "execution-price entry always + execution-price exit only on max_hold + deducting ledger slipPct=exitSlip*2 on max_hold (BOTH / DOUBLE on max_hold; MIXED on TP/SL/end)",
    eventSequence:
      "LEDGER_ONLY: entryPrice=c.close, exitPrice=raw stop/TP/close, slipPct=slippageRate*2 on every close including end",
    conditionBuilder:
      "LEDGER_ONLY on intra-loop closes (slipPct*2); END omits slippagePct entirely (fee only) — internally inconsistent even vs its own TP/SL",
    researchPattern: "uses runEventSequenceBacktest — LEDGER_ONLY, fundingApplied hardcoded false",
    researchSafe: "uses runSafeV44Backtest — same DOUBLE/MIXED as SAFE primary",
    recommendedScope: "D" as const,
    why: "Shared helper applyAdverseSlippage can exist now, but wiring it into event-sequence/condition in the same phase changes Research pattern metrics and condition-builder PnL. Fix SAFE primary realized accounting first; schedule engine parity. Do not unify by accident.",
  };
}

export function getHistoricalImpact() {
  return {
    SLIPPAGE_MODEL_VERSION_REQUIRED: "YES" as const,
    HISTORICAL_REPORT_MIGRATION_REQUIRED: "NO" as const,
    whyVersion:
      "backtestResultHash includes feeRate/slippageRate and endingBalance. After math change, identical inputs produce different endingBalance so hashes diverge — BUT only after a rerun. A cached/deduplicated prior artifact could be reused if someone hashes without outcomes. Safer to add slippageModelVersion to the hash BEFORE changing math, and stamp old records as slippageModelVersion=legacy_v0 on read without rewriting files.",
    distinguishOldVsNew:
      "New reports must persist slippageModelVersion=execution_price_v1. Old reports lack the field (= legacy). Do not rewrite production JSON.",
  };
}

export function getApprovalImpact() {
  return {
    policy: "B+C",
    existingSavedResultPolicy:
      "Grandfather stored artifacts: remain readable, tagged legacy cost model. Do not rewrite numbers.",
    existingApprovalPolicy:
      "New Paper/Live eligibility from a Backtest run MUST require slippageModelVersion=execution_price_v1. Legacy runs stay visible but are not a valid fresh approval basis after the arithmetic fix. Do not auto-invalidate already-started Paper/Live sessions.",
    evidence:
      "evaluateBacktestEligibility does not inspect cost model version today. Without a version gate, an operator could approve a newly rerun result that is not comparable to the saved one they thought they reviewed.",
  };
}

export function getRootDefects() {
  const matrix = buildExitReasonMatrix();
  const byReason = (reason: ExitReason) =>
    matrix.rows.filter((r) => r.exitReason === reason);
  const maxHoldDouble = byReason("max_hold").every((r) => r.classification === "DOUBLE_APPLIED");
  const tpMissingExit = byReason("take_profit").every(
    (r) => r.entryPriceSlipApplied && !r.exitPriceSlipApplied && !r.ledgerSlipApplied,
  );
  const slMissingExit = byReason("stop_loss").every(
    (r) => r.entryPriceSlipApplied && !r.exitPriceSlipApplied && !r.ledgerSlipApplied,
  );
  const endMissingExit = byReason("end").every(
    (r) => r.entryPriceSlipApplied && !r.exitPriceSlipApplied && !r.ledgerSlipApplied,
  );
  return {
    SLIPPAGE_DOUBLE_DEDUCTION_MAX_HOLD: {
      status: maxHoldDouble ? "PROVEN" : "CLOSED",
      engine: "SAFE runSafeV44Backtest",
      pnlImpact: "max_hold economically charges price-slip plus slipPct*2",
      selectionImpact: "none directly; stress still uses rate*2 in guard",
      p3a52Blocker: "YES",
    },
    EXIT_REASON_SLIPPAGE_INCONSISTENCY: {
      status: "PROVEN",
      engine: "SAFE",
      pnlImpact: "same slippageRate produces different cost semantics by exitReason",
      selectionImpact: "none",
      p3a52Blocker: "YES",
    },
    TP_EXIT_SLIPPAGE_MISSING: {
      status: tpMissingExit ? "PROVEN" : "CLOSED",
      engine: "SAFE",
      pnlImpact: "TP fills at exact target; optimistic vs adverse-fill intent",
      selectionImpact: "none",
      p3a52Blocker: "YES",
    },
    SL_EXIT_SLIPPAGE_MISSING: {
      status: slMissingExit ? "PROVEN" : "CLOSED",
      engine: "SAFE",
      pnlImpact: "SL fills at exact stop",
      selectionImpact: "none",
      p3a52Blocker: "YES",
    },
    END_EXIT_SLIPPAGE_MISSING: {
      status: endMissingExit ? "PROVEN" : "CLOSED",
      engine: "SAFE (and condition-builder end also omits ledger slip)",
      pnlImpact: "forced flat at last.close",
      selectionImpact: "none",
      p3a52Blocker: "YES",
    },
    COST_GUARD_REPRESENTATION_MISMATCH: {
      status: "PROVEN",
      engine: "evaluateCostGuard / unifiedCost vs SAFE close",
      pnlImpact: "none (selection only)",
      selectionImpact: "rate*2 estimate vs unslipped TP; stress changes tradeCount",
      p3a52Blocker: "NO — keep as pre-trade estimate aligned with two-leg MODEL A",
    },
    GROSS_PNL_SEMANTIC_AMBIGUITY: {
      status: "PROVEN",
      engine: "SAFE ledgerFields + report + UI identity net≈gross-totalCost",
      pnlImpact: "identity holds algebraically while economic slippage is double-counted on max_hold",
      selectionImpact: "none",
      p3a52Blocker: "YES — must freeze gross/net meaning with MODEL A",
    },
    ENGINE_PATH_COST_MODEL_DIVERGENCE: {
      status: "PROVEN",
      engine: "SAFE vs event-sequence vs condition-builder vs Research pattern",
      pnlImpact: "same slippageRate does not mean the same PnL",
      selectionImpact: "Research pattern candidates incomparable to SAFE Backtest",
      p3a52Blocker: "NO — parity scheduled separately (scope D)",
    },
    TRAILING_STOP_REASON_UNREACHABLE: {
      status: "PROVEN",
      engine: "SAFE runSafeV44Backtest",
      pnlImpact: "none (still stop_loss fill at updated stop, unslipped)",
      selectionImpact: "none",
      p3a52Blocker: "NO — do not change trailing trigger logic in P3-A5.2",
      observedExitReason: matrix.trailingProbe.exitReason,
    },
    matrix,
  };
}

export function getImplementationPlan() {
  return {
    model: "MODEL_A",
    helper: "src/lib/rextora/backtest/executionSlippage.ts::applyAdverseSlippage({side, action, rawPrice, slippageRate})",
    files: [
      "src/lib/rextora/backtest/executionSlippage.ts (new)",
      "src/lib/rextora/backtest/backtestEngine.ts::runSafeV44Backtest close + end-of-series + entry fill (already slipped — keep) + stop subtracting slipPct from pnlPct; derive attribution slippageCostUsdt",
      "src/lib/rextora/backtest/backtestTypes.ts — slippageModelVersion on report/config",
      "src/lib/rextora/backtest/backtestReport.ts — persist version; keep slippageCostUsdt as attribution",
      "src/lib/rextora/backtest/backtestStore.ts::backtestResultHash — include slippageModelVersion",
      "src/lib/rextora/backtest/backtestEligibility.ts — new runs require execution_price_v1 for Paper eligibility (read-only gate, no session mutation)",
      "tests/backtestExecutionSlippage.test.ts (implementation suite, not this diagnosis)",
    ],
    doNotTouch: [
      "fee math",
      "funding math",
      "spread math (leave spreadPct deduction)",
      "evaluateCostGuard formula (keep rate*2 estimate)",
      "SAFE_v44_i4060",
      "signal/trigger comparisons (high/low vs raw TP/SL)",
      "eventSequenceBacktest / conditionBacktest (parity later)",
      "production saved JSON rewrite",
    ],
  };
}

export function writeP3A51Artifacts(cwd = process.cwd()) {
  const dir = path.join(
    cwd,
    ".validation/backtest-p3-a5-1-slippage-model",
    P3A51_ARTIFACT_TS,
  );
  fs.mkdirSync(dir, { recursive: true });
  const defects = getRootDefects();
  const models = buildModelComparison();
  const hashes = productionReadonlyHashes(cwd);
  const write = (name: string, value: unknown) => {
    fs.writeFileSync(path.join(dir, name), JSON.stringify(value, null, 2), "utf8");
  };
  write("source-trace.json", {
    pipeline: SLIPPAGE_SOURCE_PIPELINE,
    authorities: getPriceAuthorities(),
    consumers: {
      safe: "src/lib/rextora/backtest/backtestEngine.ts::runSafeV44Backtest",
      eventSequence: "src/lib/rextora/strategy/eventSequenceBacktest.ts::runEventSequenceBacktest",
      condition: "src/lib/rextora/strategy/conditionBacktest.ts::runConditionBuilderBacktest",
      unifiedCost: "src/lib/rextora/metrics/unifiedCost.ts::computeSlippageCost",
      costGuard: "src/lib/rextora/cost/costGuard.ts::evaluateCostGuard",
      stress: "src/lib/rextora/backtest/backtestRunner.ts cost stress loop",
      report: "src/lib/rextora/backtest/backtestReport.ts::aggregateBacktestMetrics",
    },
  });
  write("exit-reason-matrix.json", {
    rows: defects.matrix.rows,
    trailingProbe: defects.matrix.trailingProbe,
    table: slippageApplicationCountTable(defects.matrix),
  });
  write("trigger-fill-contract.json", {
    ...getTriggerFillContract(),
    entry: getEntryAuthorities(),
  });
  write("fee-interaction.json", getFeeInteraction());
  write("spread-interaction.json", getSpreadInteraction());
  write("cost-guard-analysis.json", getCostGuardAnalysis());
  write("model-comparison.json", {
    MODEL_A: models.MODEL_A,
    MODEL_B: models.MODEL_B,
    MODEL_C: models.MODEL_C,
    MODEL_D: models.MODEL_D,
    RECOMMENDED_SLIPPAGE_MODEL: models.RECOMMENDED_SLIPPAGE_MODEL,
    CANONICAL_SLIPPAGE_LEG_COUNT: models.CANONICAL_SLIPPAGE_LEG_COUNT,
    whyLegCount: models.whyLegCount,
  });
  write("micro-arithmetic.json", { long: models.long, short: models.short });
  write("recommended-formulas.json", getRecommendedFormulas());
  write("ledger-semantics.json", getLedgerSemantics());
  write("gross-net-semantics.json", getGrossNetSemantics());
  write("stress-semantics.json", getStressSemantics());
  write("engine-parity.json", getEngineParity());
  write("historical-impact.json", getHistoricalImpact());
  write("approval-impact.json", getApprovalImpact());
  write("root-defects.json", {
    SLIPPAGE_DOUBLE_DEDUCTION_MAX_HOLD: defects.SLIPPAGE_DOUBLE_DEDUCTION_MAX_HOLD,
    EXIT_REASON_SLIPPAGE_INCONSISTENCY: defects.EXIT_REASON_SLIPPAGE_INCONSISTENCY,
    TP_EXIT_SLIPPAGE_MISSING: defects.TP_EXIT_SLIPPAGE_MISSING,
    SL_EXIT_SLIPPAGE_MISSING: defects.SL_EXIT_SLIPPAGE_MISSING,
    END_EXIT_SLIPPAGE_MISSING: defects.END_EXIT_SLIPPAGE_MISSING,
    COST_GUARD_REPRESENTATION_MISMATCH: defects.COST_GUARD_REPRESENTATION_MISMATCH,
    GROSS_PNL_SEMANTIC_AMBIGUITY: defects.GROSS_PNL_SEMANTIC_AMBIGUITY,
    ENGINE_PATH_COST_MODEL_DIVERGENCE: defects.ENGINE_PATH_COST_MODEL_DIVERGENCE,
    TRAILING_STOP_REASON_UNREACHABLE: defects.TRAILING_STOP_REASON_UNREACHABLE,
  });
  write("implementation-plan.json", getImplementationPlan());
  write("production-readonly-hashes.json", {
    ...hashes,
    safeFileSha: sha256File(path.join(cwd, "data/strategies/SAFE_v44_i4060.json")),
  });
  return { dir, hashes };
}
