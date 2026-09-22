/**
 * P3-A5 read-only forensic diagnosis: Backtest fee / slippage / funding
 * provenance, application path, and report reproducibility.
 *
 * Does not mutate production data, SAFE, Research jobs, Paper/Live, or engine math.
 */

import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type { OhlcvCandle } from "../data/ohlcvTypes";
import { CONTEXT_FALLBACK_PARAMS } from "../strategy/safeV44Params";
import {
  RETIRED_SAFE_FILE_NAME,
  RETIRED_SAFE_PARAMS_HASH,
  RETIRED_SAFE_STRATEGY_ID,
} from "../strategy/retiredSafeBaseline";
import type { SafeV44Params } from "../strategy/strategyTypes";
import { runSafeV44Backtest, type BacktestTrade } from "./backtestEngine";
import { buildBacktestReport } from "./backtestReport";
import { backtestResultHash } from "./backtestStore";
import { evaluateBacktestEligibility } from "./backtestEligibility";
import type { BacktestConfig, BacktestReport } from "./backtestTypes";
import {
  normalizeCostAssumptions,
  resolvePrimaryCostAssumptions,
} from "./costAssumptions";

export const P3A5_ARTIFACT_TS = "2026-09-03T12-50-00-000Z";

export const COST_PIPELINE = [
  "components/rextora/backtest/BacktestReviewWorkbench.tsx::runUserBacktest (omits fee/slip/funding; API defaults apply)",
  "components/rextora/backtest/SafeBacktestPanel.tsx (legacy panel sends explicit rates)",
  "app/api/rextora/backtest/run/route.ts::POST (feeRate??0.0004, slippageRate??0.0002, fundingRate??0.0001, applyFunding??false)",
  "src/lib/rextora/backtest/backtestRunner.ts::runConfiguredBacktest (stress: fee/slip/spread * multiplier; fundingRate NOT multiplied)",
  "src/lib/rextora/backtest/backtestEngine.ts::runSafeV44Backtest (SAFE primary) | eventSequenceBacktest | conditionBacktest",
  "src/lib/rextora/cost/costGuard.ts::evaluateCostGuard → metrics/unifiedCost.ts",
  "src/lib/rextora/backtest/backtestReport.ts::buildBacktestReport / aggregateBacktestMetrics",
  "src/lib/rextora/backtest/backtestStore.ts::saveBacktestResult / backtestResultHash",
  "src/lib/rextora/backtest/backtestEligibility.ts::evaluateBacktestEligibility",
].join(" → ");

export const ENGINE_DEFAULT_FEE_RATE = 0.0004;
export const ENGINE_DEFAULT_SLIPPAGE_RATE = 0.0002;
export const ENGINE_DEFAULT_FUNDING_RATE = 0.0001;
export const API_DEFAULT_APPLY_FUNDING = false;
export const API_DEFAULT_APPLY_SPREAD = false;
export const API_DEFAULT_STRESS_MULTIPLIERS = [1, 1.5, 2] as const;

export const FEE_CANONICAL_UNIT =
  "decimal_fraction_of_price (0.0004 = 4 bps = 0.04%)";
export const SLIPPAGE_CANONICAL_UNIT =
  "decimal_fraction_of_price (0.0002 = 2 bps = 0.02%)";
export const FUNDING_CANONICAL_UNIT =
  "decimal_fraction_of_price per trade (0.0001 = 1 bp = 0.01%), not per 8h";

export const FEE_RUNTIME_FORMULA =
  "feePct = feeRate * 2; feeCostUsdt = margin * feePct * leverage; subtracted from raw price-return before * leverage in pnlPct. Applied on every close including TP/SL/max_hold/end. Same long/short. Notional = margin*leverage (unslipped risk sizing). Round-trip = two fees (entry+exit) as a single 2*feeRate charge, not two separate ledger rows. No maker/taker split. Source: backtestEngine.ts runSafeV44Backtest close + end-of-series.";

export const LONG_ENTRY_EXECUTION_PRICE =
  "risk.entryPrice * (1 + slippageRate)  // always; risk.entryPrice = candle.close";
export const LONG_EXIT_EXECUTION_PRICE =
  "max_hold: exitPrice * (1 - slippageRate); TP/SL: unslipped stop or takeProfit; end: last.close unslipped";
export const SHORT_ENTRY_EXECUTION_PRICE =
  "risk.entryPrice * (1 - slippageRate)  // always";
export const SHORT_EXIT_EXECUTION_PRICE =
  "max_hold: exitPrice * (1 + slippageRate); TP/SL: unslipped stop or takeProfit; end: last.close unslipped";

export const FUNDING_RUNTIME_MODEL =
  "SYNTHETIC_FLAT_PER_TRADE: if applyFunding then fundingPct = fundingRate ?? 0.0001 else 0. Not pro-rated by holdBars, not Binance 00:00/08:00/16:00 timestamps, not historical funding series. Long and short both charged the same positive rate (shorts do not receive). feeModel.getFundingFeePctFromRate(holdHours/8) is NOT on the Backtest engine path.";

export const FUNDING_APPLICATION_FORMULA =
  "fundingPct = applyFunding ? (fundingRate ?? 0.0001) : 0; fundingCostUsdt = margin * fundingPct * leverage; pnlPct = (raw - feePct - slipPct - fundingPct - spreadPct) * leverage";

export const SLIPPAGE_PNL_FORMULA =
  "Entry price is always slipped. Exit price slipped only when exitReason==='max_hold'. Then slipPct = (max_hold ? slippageRate : 0) * 2 is ALSO subtracted from raw (which already uses slipped prices). TP/SL trigger and fill use raw stop/TP. End-of-series: no exit slip and slipPct=0.";

export type Authority =
  | "USER_INPUT"
  | "STRATEGY_CONFIG"
  | "BACKTEST_DEFAULT"
  | "SAFE_CONFIG"
  | "HARDCODED_CONSTANT"
  | "PROVIDER_DATA"
  | "OTHER";

export type Presence = "PRESENT" | "PARTIAL" | "ABSENT";

function sha256File(filePath: string): string | null {
  if (!fs.existsSync(filePath)) return null;
  return createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

export function productionReadonlyHashes(cwd = process.cwd()) {
  const safePath = path.join(cwd, "data/strategies", RETIRED_SAFE_FILE_NAME);
  const researchIndex = path.join(
    cwd,
    "data/rextora/strategy-search/index.json",
  );
  const backtestIndex = path.join(cwd, "data/rextora/backtests/index.json");
  const paperDir = path.join(cwd, "data/rextora/paper-sessions");
  return {
    safePath,
    safeSha256: sha256File(safePath),
    paramsHash: RETIRED_SAFE_PARAMS_HASH,
    researchIndexSha256: sha256File(researchIndex),
    backtestIndexSha256: sha256File(backtestIndex),
    paperSessionsDirExists: fs.existsSync(paperDir),
    safeStrategyId: RETIRED_SAFE_STRATEGY_ID,
  };
}

export function getCostSourceInventory() {
  return {
    engineDefaults: {
      file: "src/lib/rextora/backtest/backtestEngine.ts",
      function: "runSafeV44Backtest",
      feeRate: ENGINE_DEFAULT_FEE_RATE,
      slippageRate: ENGINE_DEFAULT_SLIPPAGE_RATE,
      fundingRate: ENGINE_DEFAULT_FUNDING_RATE,
      applyFundingGate: "input.applyFunding ? (fundingRate ?? 0.0001) : 0",
    },
    apiDefaults: {
      file: "app/api/rextora/backtest/run/route.ts",
      feeRate: ENGINE_DEFAULT_FEE_RATE,
      slippageRate: ENGINE_DEFAULT_SLIPPAGE_RATE,
      fundingRate: ENGINE_DEFAULT_FUNDING_RATE,
      applyFunding: API_DEFAULT_APPLY_FUNDING,
      applySpread: API_DEFAULT_APPLY_SPREAD,
      costStressMultipliers: [...API_DEFAULT_STRESS_MULTIPLIERS],
    },
    productionUi: {
      file: "components/rextora/backtest/BacktestReviewWorkbench.tsx",
      sendsRates: false,
      note: "POST body has strategyId/symbols/timeframe/dates/save only. Cost knobs come from API defaults. Workbench costSummary reads settings.cost.feeRate/takerFee which do not exist on defaultSettings (makerFeePct/takerFeePct percent-points).",
    },
    legacyUi: {
      file: "components/rextora/backtest/SafeBacktestPanel.tsx",
      sendsRates: true,
      useStateDefaults: {
        feeRate: 0.0004,
        slippageRate: 0.0002,
        fundingRate: 0.0001,
        applyFunding: false,
      },
    },
    unifiedCostConstants: {
      file: "src/lib/rextora/metrics/unifiedCost.ts",
      BINANCE_FUTURES_TAKER_FEE: 0.0004,
      DEFAULT_SLIPPAGE_RATE: 0.0002,
      DEFAULT_SPREAD_RATE: 0.0001,
      usedByBacktestEngine: false,
      usedByCostGuard: true,
      providerDerived: false,
      note: "Named Binance taker in comment; hardcoded constant, not live provider data.",
    },
    unusedBacktestPaths: {
      feeModel: "src/lib/rextora/feeModel.ts (percent-points UI helpers; funding holdHours/8 NOT used by backtestEngine)",
      slippageModel: "src/lib/rextora/slippageModel.ts (legacy UI estimates; NOT used by backtestEngine)",
      settingsCost: "src/lib/rextora/settings/defaultSettings.ts cost.makerFeePct=0.02 takerFeePct=0.04 slippageBasePct=0.05 (percent-points; Paper/Live/settings, not Backtest runner)",
    },
    alternateEngines: {
      eventSequence:
        "src/lib/rextora/strategy/eventSequenceBacktest.ts — feePct=feeRate*2, slipPct=slippageRate*2 always, prices NOT slipped, no funding",
      conditionBuilder:
        "src/lib/rextora/strategy/conditionBacktest.ts — feePct=feeRate*2, slipPct=slippageRate*2 on intra-bar exits, prices NOT slipped, no funding; end-of-series omits slippagePct",
    },
    research: {
      adapter: "src/lib/rextora/strategySearch/backtestAdapter.ts::runCandidateWindowEvaluation",
      followUpDefaults:
        "src/lib/rextora/strategySearch/followUpResearch.ts baseCostConfig feeRate 0.0004 slippage 0.0002 funding 0.0001 applyFunding false applySpread true",
      jobApi: "src/lib/rextora/strategySearch/jobApiValidation.ts::parseCostConfig — required object, no silent default",
      stress: "src/lib/rextora/strategySearch/costStress.ts DOES multiply fundingRate; Backtest runner does NOT",
    },
    identity: {
      file: "src/lib/rextora/backtest/backtestStore.ts::backtestResultHash",
      includes: ["feeRate", "slippageRate", "fundingRate", "costGuardK", "totalReturn", "endingBalance"],
      excludes: ["applyFunding", "applySpread", "spreadRate", "costStressMultipliers", "application formulas"],
    },
  };
}

export function microStrategyParams(input: {
  side: "LONG" | "SHORT";
  leverage: number;
  maxHoldBars: number;
}): SafeV44Params {
  const lev = input.leverage;
  return {
    ...CONTEXT_FALLBACK_PARAMS,
    ema_fast: 2,
    ema_mid: 3,
    ema_slow: 5,
    rsi_period: 3,
    atr_period: 3,
    vol_lookback: 3,
    res_lookback: 3,
    slope_lookback: 2,
    break_lookback: 4,
    break_margin: 0.001,
    vol_ratio_min_break: 0.5,
    max_atr_pct_break: 1,
    confirm_bull: false,
    confirm_bear: input.side === "SHORT",
    rsi_min_short: 0,
    cooldown_bars: 10_000,
    allow_in_range: false,
    max_hold_bars: input.maxHoldBars,
    use_trailing: false,
    use_vol_target: false,
    size_min: 1,
    size_max: 1,
    use_dynamic_leverage: false,
    lev_min: lev,
    lev_base: lev,
    lev_max: lev,
    base_bal_pct: 0.1,
    cost_guard: false,
    sl_atr_mult: 50,
    tp_atr_mult: 50,
  };
}

export function buildMicroCandles(input: {
  side: "LONG" | "SHORT";
  holdBars: number;
  intervalMs?: number;
  startOpenTime?: number;
}): OhlcvCandle[] {
  const intervalMs = input.intervalMs ?? 900_000;
  const start = input.startOpenTime ?? Date.UTC(2026, 0, 1);
  const warmup = 8;
  const pad = 2;
  const count = warmup + 1 + input.holdBars + pad;
  const candles: OhlcvCandle[] = [];
  for (let i = 0; i < count; i += 1) {
    const openTime = start + i * intervalMs;
    if (i < warmup) {
      candles.push({
        openTime,
        open: 100,
        high: 100.1,
        low: 99.9,
        close: 100,
        volume: 100,
      });
      continue;
    }
    if (i === warmup) {
      if (input.side === "LONG") {
        candles.push({
          openTime,
          open: 100,
          high: 110,
          low: 100,
          close: 110,
          volume: 5_000,
        });
      } else {
        candles.push({
          openTime,
          open: 100,
          high: 100,
          low: 90,
          close: 90,
          volume: 5_000,
        });
      }
      continue;
    }
    const held = i - warmup;
    if (input.side === "LONG") {
      const px = 110 + held;
      candles.push({
        openTime,
        open: px - 0.2,
        high: px + 0.2,
        low: px - 0.4,
        close: px,
        volume: 100,
      });
    } else {
      const px = 90 - held;
      candles.push({
        openTime,
        open: px + 0.2,
        high: px + 0.4,
        low: px - 0.2,
        close: px,
        volume: 100,
      });
    }
  }
  return candles;
}

export interface MicroCostInput {
  feeRate: number;
  slippageRate: number;
  fundingRate: number;
  applyFunding: boolean;
  side: "LONG" | "SHORT";
  leverage: number;
  maxHoldBars: number;
  balance?: number;
}

export interface MicroCostRow {
  label: string;
  side: "LONG" | "SHORT";
  exitReason: BacktestTrade["exitReason"];
  holdBars: number | undefined;
  leverage: number;
  entryRawPrice: number;
  entryExecutionPrice: number;
  exitRawPrice: number;
  exitExecutionPrice: number;
  marginUsdt: number;
  positionNotional: number;
  grossPnlUsdt: number;
  entryFeeUsdt: number;
  exitFeeUsdt: number;
  totalFeeUsdt: number;
  slippageCostUsdt: number;
  fundingCostUsdt: number;
  netPnlUsdt: number;
  feePct: number;
  slippagePct: number;
  fundingPct: number;
  expected: {
    entryExecutionPrice: number;
    exitExecutionPrice: number;
    feePct: number;
    slippagePct: number;
    fundingPct: number;
    feeCostUsdt: number;
    slippageCostUsdt: number;
    fundingCostUsdt: number;
    grossPnlUsdt: number;
    netPnlUsdt: number;
  };
  arithmeticMatches: boolean;
  tradeCount: number;
  report: BacktestReport;
  trade: BacktestTrade;
}

function round6(n: number): number {
  return Number(n.toFixed(6));
}

export function expectedExecutionPrices(input: {
  side: "LONG" | "SHORT";
  entryRaw: number;
  exitRaw: number;
  slippageRate: number;
  exitReason: BacktestTrade["exitReason"];
}) {
  const s = input.slippageRate;
  const entryExecutionPrice =
    input.side === "LONG" ? input.entryRaw * (1 + s) : input.entryRaw * (1 - s);
  const exitSlip = s;
  const exitExecutionPrice =
    input.side === "LONG"
      ? input.exitRaw * (1 - exitSlip)
      : input.exitRaw * (1 + exitSlip);
  return { entryExecutionPrice, exitExecutionPrice, exitSlip };
}

export function runMicroCostFixture(
  label: string,
  input: MicroCostInput,
): MicroCostRow {
  const params = microStrategyParams({
    side: input.side,
    leverage: input.leverage,
    maxHoldBars: input.maxHoldBars,
  });
  const candles = buildMicroCandles({
    side: input.side,
    holdBars: input.maxHoldBars,
  });
  const balance = input.balance ?? 10_000;
  const result = runSafeV44Backtest({
    symbol: "BTCUSDT",
    candles,
    params,
    paramsHash: "p3a5-micro-fixture",
    strategyName: "P3A5_MICRO",
    strategyId: "P3A5_MICRO",
    sourceStatus: "user_created",
    timeframe: "15m",
    balance,
    feeRate: input.feeRate,
    slippageRate: input.slippageRate,
    fundingRate: input.fundingRate,
    applyFunding: input.applyFunding,
    applySpread: false,
    spreadRate: 0,
    dataSource: "synthetic-test",
  });
  if (result.trades.length !== 1) {
    throw new Error(
      `${label}: expected exactly 1 trade, got ${result.trades.length}. diagnostics=${JSON.stringify(result.report.zeroTradeDiagnostics)}`,
    );
  }
  const trade = result.trades[0]!;
  const entryRaw = candles[trade.entryBar]!.close;
  const exitRaw =
    trade.exitReason === "max_hold" || trade.exitReason === "end"
      ? candles[trade.exitBar]!.close
      : trade.exitReason === "take_profit"
        ? trade.takeProfit
        : trade.stopLoss;
  const px = expectedExecutionPrices({
    side: input.side,
    entryRaw,
    exitRaw,
    slippageRate: input.slippageRate,
    exitReason: trade.exitReason,
  });
  const feePct = input.feeRate * 2;
  const fundingPct = input.applyFunding ? input.fundingRate : 0;
  const unslippedReturn =
    input.side === "LONG"
      ? (exitRaw - entryRaw) / entryRaw
      : (entryRaw - exitRaw) / entryRaw;
  const executionReturn =
    input.side === "LONG"
      ? (px.exitExecutionPrice - px.entryExecutionPrice) /
        px.entryExecutionPrice
      : (px.entryExecutionPrice - px.exitExecutionPrice) /
        px.entryExecutionPrice;
  const margin = trade.marginUsdt ?? 0;
  const lev = trade.leverage;
  const feeCostUsdt = round6(margin * feePct * lev);
  const fundingCostUsdt = round6(margin * fundingPct * lev);
  const grossPnlUsdt = round6(margin * executionReturn * lev);
  const unslippedGrossUsdt = round6(margin * unslippedReturn * lev);
  const slippageCostUsdt = round6(unslippedGrossUsdt - grossPnlUsdt);
  const notional = margin * lev;
  const slipPct = Number(
    (notional > 0 ? slippageCostUsdt / notional : 0).toFixed(8),
  );
  const pnlPct = (executionReturn - feePct - fundingPct) * lev;
  const netPnlUsdt = round6(margin * pnlPct);

  const arithmeticMatches =
    Math.abs(trade.entryPrice - px.entryExecutionPrice) < 1e-9 &&
    Math.abs(trade.exitPrice - px.exitExecutionPrice) < 1e-9 &&
    Math.abs((trade.feePct ?? 0) - feePct) < 1e-12 &&
    Math.abs((trade.slippagePct ?? 0) - slipPct) < 1e-12 &&
    Math.abs((trade.fundingPct ?? 0) - fundingPct) < 1e-12 &&
    Math.abs((trade.feeCostUsdt ?? 0) - feeCostUsdt) < 1e-6 &&
    Math.abs((trade.slippageCostUsdt ?? 0) - slippageCostUsdt) < 1e-6 &&
    Math.abs((trade.fundingCostUsdt ?? 0) - fundingCostUsdt) < 1e-6 &&
    Math.abs((trade.grossPnlUsdt ?? 0) - grossPnlUsdt) < 1e-6 &&
    Math.abs((trade.netPnlUsdt ?? 0) - netPnlUsdt) < 1e-6;

  return {
    label,
    side: trade.side,
    exitReason: trade.exitReason,
    holdBars: trade.holdBars,
    leverage: lev,
    entryRawPrice: entryRaw,
    entryExecutionPrice: trade.entryPrice,
    exitRawPrice: exitRaw,
    exitExecutionPrice: trade.exitPrice,
    marginUsdt: margin,
    positionNotional: round6(margin * lev),
    grossPnlUsdt: trade.grossPnlUsdt ?? 0,
    entryFeeUsdt: round6(feeCostUsdt / 2),
    exitFeeUsdt: round6(feeCostUsdt / 2),
    totalFeeUsdt: trade.feeCostUsdt ?? 0,
    slippageCostUsdt: trade.slippageCostUsdt ?? 0,
    fundingCostUsdt: trade.fundingCostUsdt ?? 0,
    netPnlUsdt: trade.netPnlUsdt ?? 0,
    feePct: trade.feePct ?? 0,
    slippagePct: trade.slippagePct ?? 0,
    fundingPct: trade.fundingPct ?? 0,
    expected: {
      entryExecutionPrice: px.entryExecutionPrice,
      exitExecutionPrice: px.exitExecutionPrice,
      feePct,
      slippagePct: slipPct,
      fundingPct,
      feeCostUsdt,
      slippageCostUsdt,
      fundingCostUsdt,
      grossPnlUsdt,
      netPnlUsdt,
    },
    arithmeticMatches,
    tradeCount: result.trades.length,
    report: result.report,
    trade,
  };
}

export function runStandardMicroMatrix() {
  const fee = ENGINE_DEFAULT_FEE_RATE;
  const slip = ENGINE_DEFAULT_SLIPPAGE_RATE;
  const fund = ENGINE_DEFAULT_FUNDING_RATE;
  const zero = runMicroCostFixture("A_zero", {
    feeRate: 0,
    slippageRate: 0,
    fundingRate: 0,
    applyFunding: false,
    side: "LONG",
    leverage: 1,
    maxHoldBars: 1,
  });
  const feeOnly = runMicroCostFixture("B_fee_only", {
    feeRate: fee,
    slippageRate: 0,
    fundingRate: 0,
    applyFunding: false,
    side: "LONG",
    leverage: 1,
    maxHoldBars: 1,
  });
  const slipOnly = runMicroCostFixture("C_slippage_only", {
    feeRate: 0,
    slippageRate: slip,
    fundingRate: 0,
    applyFunding: false,
    side: "LONG",
    leverage: 1,
    maxHoldBars: 1,
  });
  const fundOnly = runMicroCostFixture("D_funding_only", {
    feeRate: 0,
    slippageRate: 0,
    fundingRate: fund,
    applyFunding: true,
    side: "LONG",
    leverage: 1,
    maxHoldBars: 1,
  });
  const combined = runMicroCostFixture("E_combined", {
    feeRate: fee,
    slippageRate: slip,
    fundingRate: fund,
    applyFunding: true,
    side: "LONG",
    leverage: 1,
    maxHoldBars: 1,
  });
  return { zero, feeOnly, slipOnly, fundOnly, combined };
}

export function runLongShortComparison() {
  const common = {
    feeRate: ENGINE_DEFAULT_FEE_RATE,
    slippageRate: ENGINE_DEFAULT_SLIPPAGE_RATE,
    fundingRate: ENGINE_DEFAULT_FUNDING_RATE,
    applyFunding: true,
    leverage: 1,
    maxHoldBars: 1,
  } as const;
  const long = runMicroCostFixture("LONG", { ...common, side: "LONG" });
  const short = runMicroCostFixture("SHORT", { ...common, side: "SHORT" });
  const feeSymmetric = long.feePct === short.feePct && long.totalFeeUsdt === short.totalFeeUsdt;
  const slipRateSymmetric = long.slippagePct === short.slippagePct;
  const fundingSymmetric =
    long.fundingPct === short.fundingPct &&
    long.fundingCostUsdt === short.fundingCostUsdt;
  return {
    long,
    short,
    feeSymmetric,
    slipRateSymmetric,
    fundingSymmetric,
    shortsDoNotReceiveFunding: short.fundingCostUsdt > 0 && short.fundingPct > 0,
    LONG_SHORT_COST_SYMMETRY: "PARTIAL" as const,
    intendedAsymmetry:
      "Slippage is adverse by side (long buy high/sell low; short sell low/buy high). Fee formula is identical. Funding is charged identically to long and short — shorts never receive. Gross/net PnL differ because breakout entry prices differ (110 vs 90) even with a +1/-1 close move.",
  };
}

export function runLeverageInteraction() {
  const rows = [1, 5, 10].map((leverage) =>
    runMicroCostFixture(`lev_${leverage}x`, {
      feeRate: ENGINE_DEFAULT_FEE_RATE,
      slippageRate: ENGINE_DEFAULT_SLIPPAGE_RATE,
      fundingRate: ENGINE_DEFAULT_FUNDING_RATE,
      applyFunding: true,
      side: "LONG",
      leverage,
      maxHoldBars: 1,
    }),
  );
  const base = rows[0]!;
  const x5 = rows[1]!;
  return {
    rows: rows.map((r) => ({
      leverage: r.leverage,
      notional: r.positionNotional,
      margin: r.marginUsdt,
      grossPnlUsdt: r.grossPnlUsdt,
      totalFeeUsdt: r.totalFeeUsdt,
      slippageCostUsdt: r.slippageCostUsdt,
      fundingCostUsdt: r.fundingCostUsdt,
      netPnlUsdt: r.netPnlUsdt,
    })),
    FEE_LEVERAGE_INTERACTION:
      "feeCostUsdt = margin * (feeRate*2) * leverage; margin is independent of leverage (balance*base_bal_pct). Fee USDT scales linearly with leverage.",
    SLIPPAGE_LEVERAGE_INTERACTION:
      "Price-level slippage is a fraction of price (independent of leverage). Monetary slippageCostUsdt = margin * slipPct * leverage, so USDT impact scales with leverage. Gross PnL also uses slipped prices * leverage.",
    FUNDING_LEVERAGE_INTERACTION:
      "fundingCostUsdt = margin * fundingPct * leverage; USDT scales linearly with leverage. Rate itself does not.",
    observedFeeScale1to5: Number((x5.totalFeeUsdt / base.totalFeeUsdt).toFixed(4)),
    observedNotionalScale1to5: Number(
      (x5.positionNotional / base.positionNotional).toFixed(4),
    ),
  };
}

export function runFundingDurationSensitivity() {
  const holds = [
    { bars: 1, label: "1_bar" },
    { bars: 32, label: "8h_15m" },
    { bars: 64, label: "16h_15m" },
    { bars: 96, label: "24h_15m" },
  ];
  const rows = holds.map((h) =>
    runMicroCostFixture(h.label, {
      feeRate: 0,
      slippageRate: 0,
      fundingRate: ENGINE_DEFAULT_FUNDING_RATE,
      applyFunding: true,
      side: "LONG",
      leverage: 1,
      maxHoldBars: h.bars,
    }),
  );
  const rates = new Set(rows.map((r) => r.fundingPct));
  const usdt = new Set(rows.map((r) => r.fundingCostUsdt));
  return {
    rows: rows.map((r) => ({
      label: r.label,
      holdBars: r.holdBars,
      fundingPct: r.fundingPct,
      fundingCostUsdt: r.fundingCostUsdt,
    })),
    FUNDING_DURATION_SENSITIVE: rates.size === 1 && usdt.size === 1 ? "NO" : "YES",
    flatPerTrade:
      rates.size === 1
        ? "fundingPct equals fundingRate for every hold length; not * holdBars and not * ceil(hours/8)"
        : "duration changed the rate",
  };
}

export function getCostStressMatrix() {
  const baseFee = ENGINE_DEFAULT_FEE_RATE;
  const baseSlip = ENGINE_DEFAULT_SLIPPAGE_RATE;
  const baseFund = ENGINE_DEFAULT_FUNDING_RATE;
  const baseSpread = 0.0001;
  const scenarios = API_DEFAULT_STRESS_MULTIPLIERS.map((multiplier, index) => ({
    index,
    multiplier,
    feeRate: baseFee * multiplier,
    slippageRate: baseSlip * multiplier,
    spreadRate: baseSpread * multiplier,
    fundingRate: baseFund,
    fundingMultiplied: false,
    isPrimaryDisplayed: index === 0,
    reportFields:
      "costStress[] = {multiplier,totalReturn,mdd,tradeCount,negativeMonths} — rates omitted",
  }));
  return {
    scenarioCount: scenarios.length,
    primary: "multipliers[0] === 1; primary symbol result uses baseMult before the stress loop; stress array is attached onto the same report",
    validationImpact:
      "evaluateBacktestEligibility.hasCostStress=false is warning-only (robustness_missing), not a hard blocker. Stress assumptions are not required before Paper registration.",
    confusionRisk:
      "Primary report totals are the x1 run. costStress rows can have different tradeCount because cost_guard still uses scaled fee/slip. Operator cannot see per-scenario rates on the report.",
    COST_STRESS_MATRIX: scenarios,
    runnerFundingGap:
      "backtestRunner multiplies fee/slip/spread by mult but passes config.fundingRate unchanged. Research costStress.ts multiplies fundingRate.",
  };
}

export function getUnitAudit() {
  return {
    FEE_CANONICAL_UNIT,
    SLIPPAGE_CANONICAL_UNIT,
    FUNDING_CANONICAL_UNIT,
    uiDisplayUnit: {
      SafeBacktestPanel: "raw decimal 0.0004 in number inputs; label 수수료율 with no %/bps suffix",
      BacktestReviewWorkbench:
        "attempts settings.cost.feeRate/takerFee (absent on defaultSettings); defaultSettings uses percent-points makerFeePct=0.02 / takerFeePct=0.04 which are NOT converted into the Backtest POST",
      reportCosts:
        "costs.fees is SUM of per-trade feePct decimals (0.0008 each); costs.feeCostUsdt is USDT. rateSumNoteKo explains the distinction.",
    },
    conversionsInBacktestTree: {
      "/100 /10000 *100 *10000":
        "None on the engine/runner cost-rate path. *100 appears only in display helpers (scatterDomain, visualAnalysis formatPct, eligibility winRate text).",
      engineDoubling: "feePct = feeRate * 2; max_hold slipPct = slippageRate * 2",
      settingsVsEngine:
        "settings takerFeePct 0.04 percent-points == 0.04% == 0.0004 fraction. Displaying 0.04 next to engine 0.0004 without unit labels is a unit trap.",
    },
  };
}

const REPORT_RATE_FIELDS = [
  "feeRate",
  "makerFeeRate",
  "takerFeeRate",
  "entryFeeRate",
  "exitFeeRate",
  "slippageRate",
  "slippageBps",
  "fundingRate",
  "fundingModel",
  "fundingIntervals",
  "costScenario",
  "costAssumptions",
] as const;

export function inventoryReportProvenance(report: BacktestReport, config?: BacktestConfig) {
  const r = report as unknown as Record<string, unknown>;
  const costs = report.costs as unknown as Record<string, unknown>;
  const field = (_name: string, present: boolean, partial = false): Presence =>
    present ? (partial ? "PARTIAL" : "PRESENT") : "ABSENT";
  const inventory: Record<string, Presence> = {};
  for (const k of REPORT_RATE_FIELDS) {
    inventory[k] = field(k, k in r && r[k] != null);
  }
  inventory.totalFees = field("totalFees", "feeTotal" in r || "feeCostUsdt" in costs, true);
  inventory.totalSlippage = field(
    "totalSlippage",
    "slippageTotal" in r || "slippageCostUsdt" in costs,
    true,
  );
  inventory.totalFunding = field(
    "totalFunding",
    "fundingTotal" in r || "fundingCostUsdt" in costs,
    true,
  );
  inventory.sourceProvenance = field(
    "sourceProvenance",
    Boolean(report.validation?.feesApplied),
    true,
  );
  inventory.validationFlags = field(
    "validationFlags",
    report.validation != null,
    true,
  );
  return {
    inventory,
    notes: {
      feeTotal: "Sum of per-trade feePct (round-trip fractions), not the input feeRate",
      slippageTotal: "Sum of per-trade slippagePct; 0 on TP/SL/end even though entry was slipped",
      fundingTotal: "0 when applyFunding is false; report does not store applyFunding or fundingRate",
      configHasRates: config
        ? {
            feeRate: config.feeRate,
            slippageRate: config.slippageRate,
            fundingRate: config.fundingRate,
            applyFunding: config.applyFunding,
          }
        : "config not part of BacktestReport",
    },
  };
}

export function attemptReportOnlyReconstruction(row: MicroCostRow) {
  const report = row.report;
  const missing = [
    "feeRate (report has feeTotal = sum of feePct, not the input rate)",
    "round-trip doubling rule (feePct = 2 * feeRate)",
    "slippageRate and the max_hold-only exit-slip rule",
    "entry price already includes slippage while slippagePct may be 0 on TP/SL",
    "applyFunding gate (fundingTotal=0 is ambiguous: off vs rate 0 vs no trades)",
    "fundingModel (flat per trade vs 8h vs historical)",
    "maker vs taker (none in engine)",
    "whether fee notional includes leverage",
    "cost-stress which scenario is primary",
    "spreadRate / applySpread",
  ];
  const fromTotals = {
    feeCostUsdt: report.costs.feeCostUsdt,
    slippageCostUsdt: report.costs.slippageCostUsdt,
    fundingCostUsdt: report.costs.fundingCostUsdt,
    grossPnLBeforeCosts: report.costs.grossPnLBeforeCosts,
    netPnLAfterCosts: report.costs.netPnLAfterCosts,
  };
  const canRecoverNetFromTotals =
    fromTotals.netPnLAfterCosts != null &&
    fromTotals.grossPnLBeforeCosts != null &&
    fromTotals.feeCostUsdt != null;
  return {
    REPORT_ONLY_COST_REPRODUCIBLE: "NO" as const,
    canReadAggregates: canRecoverNetFromTotals,
    cannotRecomputeWithoutHiddenDefaults: missing,
    observedAggregates: fromTotals,
    actualNetPnlUsdt: row.netPnlUsdt,
  };
}

export function getApprovalImpact() {
  const assumptions = normalizeCostAssumptions({});
  const zeroCostEligibleShape = evaluateBacktestEligibility({
    status: "completed",
    totalReturn: 0.1,
    mdd: -0.05,
    tradeCount: 40,
    winRate: 0.6,
    profitFactor: 1.5,
    totalCostPctOfGrossProfit: 0,
    negativeMonths: 0,
    monthlyReturnCount: 4,
    hasCostStress: false,
    slippageModelVersion: "execution_price_v1",
    costAssumptions: assumptions,
    primaryCostAssumptions: resolvePrimaryCostAssumptions(assumptions, 1),
  });
  return {
    COST_ASSUMPTION_PROVEN_BEFORE_APPROVAL: "NO" as const,
    requiresCostRatesPresent: false,
    zeroCostsCanPass: zeroCostEligibleShape.eligible,
    missingMetadataCanBeApproved: true,
    stressVisibleBeforeApproval: "PARTIAL — costStress multipliers exist without per-scenario rates",
    changingCostInvalidatesIdentity:
      "PARTIAL — feeRate/slippageRate/fundingRate are in backtestResultHash; applyFunding/spreadRate/stress multipliers are not. Outcome fields also hash, so live PnL changes usually diverge.",
    eligibilityFunction: "src/lib/rextora/backtest/backtestEligibility.ts::evaluateBacktestEligibility",
    paperGate:
      "BacktestReviewWorkbench.registerPaper uses evaluateBacktestEligibility on report metrics; does not require feeRate/slippageRate/fundingRate fields.",
  };
}

export function getResultIdentityFinding() {
  const mk = (feeRate: number, applyFunding: boolean): Parameters<typeof backtestResultHash>[0] => ({
    config: {
      strategyId: "P3A5",
      symbols: ["BTCUSDT"],
      timeframe: "15m",
      fromOpenTime: 1,
      toOpenTime: 2,
      balance: 10_000,
      feeRate,
      slippageRate: 0.0002,
      fundingRate: 0.0001,
      applyFunding,
      applySpread: false,
      spreadRate: 0.0001,
      costStressMultipliers: [1, 1.5, 2],
      costGuardK: 3,
    },
    report: {
      strategyId: "P3A5",
      strategyHash: "abc",
      strategyName: "x",
      sourceStatus: "user_created",
      symbol: "BTCUSDT",
      symbols: ["BTCUSDT"],
      timeframe: "15m",
      fromDate: "2026-01-01",
      toDate: "2026-01-02",
      requestedFrom: null,
      requestedTo: null,
      actualFirstCandleTime: null,
      actualLastCandleTime: null,
      candleCount: 10,
      processedCandleCount: 10,
      dataSource: "synthetic-test",
      totalReturn: 0.01,
      mdd: -0.01,
      tradeCount: 1,
      winRate: 1,
      averageTrade: 0.01,
      profitFactor: 1,
      maxConsecutiveLosses: 0,
      feeImpact: 0,
      feeTotal: 0,
      slippageTotal: 0,
      fundingTotal: 0,
      spreadTotal: 0,
      costs: {
        fees: 0,
        slippage: 0,
        funding: 0,
        spread: 0,
        totalTradingCost: 0,
      },
      monthlyReturns: [],
      negativeMonths: 0,
      startingBalance: 10_000,
      endingBalance: 10_100,
      validation: {
        paramsHashVerified: true,
        feesApplied: true,
        slippageApplied: true,
        fundingApplied: applyFunding,
        spreadApplied: false,
        noRealOrders: true,
      },
    } as BacktestReport,
    trades: [],
  });
  const a = backtestResultHash(mk(0.0004, false));
  const b = backtestResultHash(mk(0.0008, false));
  const c = backtestResultHash(mk(0.0004, true));
  return {
    COSTS_INCLUDED_IN_RESULT_IDENTITY: "PARTIAL" as const,
    differentFeeRateDifferentHash: a !== b,
    applyFundingIgnoredWhenOutcomesIdentical: a === c,
    hashA: a,
    hashB: b,
    hashC: c,
  };
}

export function getResearchCostParity() {
  return {
    BACKTEST_RESEARCH_COST_PARITY: "PARTIAL" as const,
    sameNumericDefaults: {
      feeRate: 0.0004,
      slippageRate: 0.0002,
      fundingRate: 0.0001,
      applyFunding: false,
    },
    divergences: [
      "Production Backtest UI omits rates (API defaults applySpread=false). followUpResearch baseCostConfig applySpread=true.",
      "SAFE Research candidates use runSafeV44Backtest (price-level entry slip + max_hold exit slip + slipPct*2). Pattern candidates use runEventSequenceBacktest (no price slip, always slipPct=2*rate, fundingApplied hardcoded false even if applyFunding true).",
      "Research costStress multiplies fundingRate; Backtest runner does not.",
      "Research job API requires explicit baseCostConfig; Backtest API silently defaults.",
    ],
  };
}

export function classifyDefects() {
  return {
    provenance: [
      "BacktestReport lacks feeRate/slippageRate/fundingRate/applyFunding/fundingModel/costAssumptions",
      "validation.feesApplied/slippageApplied are always true even when rates are 0",
      "costStress rows omit the scaled rates; funding is not scaled in Backtest stress",
      "Workbench does not send or display the rates actually used by the engine",
      "Settings percent-point fees are a different unit system than Backtest decimals",
      "backtestResultHash omits applyFunding/applySpread/spreadRate/stress multipliers",
      "Eligibility/approval does not require cost assumption metadata",
    ],
    modelAccuracy: [
      "Exit slippage applied only on max_hold; TP/SL/end fills are unslipped",
      "On max_hold, prices are slipped AND slipPct=2*exitSlip is subtracted from already-slipped raw (double application vs a single stated slippageRate)",
      "Entry slippage is baked into entryPrice but slippageCostUsdt is 0 on TP/SL, so ledger under-states entry slip as a named cost (it sits inside gross PnL)",
      "Funding is a synthetic flat per-trade rate, not historical Binance funding and not hold-duration based; shorts pay rather than receive",
      "Event-sequence / condition-builder engines use a different slippage model and ignore funding",
    ],
    both: [
      "Operator cannot tell whether fundingTotal=0 means applyFunding=false, rate=0, or model skipped",
      "Primary vs stress confusion: tradeCount changes with multiplier via cost_guard, but assumptions are not labeled",
    ],
  };
}

export function getRecommendedFix() {
  return {
    recommendedModel: "MODEL_C",
    why: [
      "Exact reproducibility requires the canonical object to exist before the engine and survive into report, API, UI, validation, and result identity.",
      "MODEL A (add rate fields only) still hides applyFunding, application formulas, stress identity, and unit.",
      "MODEL B (canonical object on report only) can drift from what the engine actually used.",
      "MODEL D (provider historical funding) is not justified: current engine is synthetic-flat and product P3-A5 is provenance, not a market-data rewrite. SAFE must stay untouched.",
    ],
    p3a6Files: [
      "src/lib/rextora/backtest/costAssumptions.ts — new BacktestCostAssumptions type + freeze/normalize (no math change)",
      "src/lib/rextora/backtest/backtestTypes.ts — attach costAssumptions to BacktestConfig, BacktestReport, costStress rows",
      "src/lib/rextora/backtest/backtestEngine.ts::runSafeV44Backtest — accept frozen assumptions, persist into report (keep current formulas)",
      "src/lib/rextora/backtest/backtestRunner.ts::runConfiguredBacktest — normalize once; record per-stress snapshot; do not infer funding*mult unless explicitly designed later",
      "src/lib/rextora/backtest/backtestReport.ts::buildBacktestReport — persist costAssumptions + application notes",
      "src/lib/rextora/backtest/backtestStore.ts::backtestResultHash — include full costAssumptions (applyFunding, spread, formulas/version)",
      "app/api/rextora/backtest/run/route.ts — record resolved defaults onto the payload (still allowed as defaults, but never silent in the result)",
      "components/rextora/backtest/BacktestReviewWorkbench.tsx — send explicit rates or display resolved assumptions; stop implying settings.cost is what ran",
      "src/lib/rextora/backtest/backtestEligibility.ts — require costAssumptions present before Paper eligibility (fail-closed metadata, not a performance threshold)",
      "src/lib/rextora/strategySearch/backtestAdapter.ts — reuse the same type for Research SAFE path; pattern path must record fundingApplied=false / different slip model",
      "tests/backtestCostAssumptions.test.ts — new implementation suite (not this diagnosis file)",
    ],
    doNotInP3A6: [
      "Do not change fee/slip/funding arithmetic",
      "Do not enable historical Binance funding",
      "Do not recreate the retired SAFE identity",
      "Do not change rerun-result preservation (separate debt)",
      "Split model-accuracy (double slip, TP unslipped, shorts paying funding) to a later phase unless PnL identity is being documented as the current frozen model",
    ],
    productionMigration: "NOT required to rewrite old run JSON; P3-A6 should treat missing costAssumptions as PARTIAL/unproven on historical records and require the object on new runs.",
  };
}

export function inspectProductionReportProvenance(cwd = process.cwd()) {
  const dir = path.join(cwd, "data/rextora/backtests");
  const indexPath = path.join(dir, "index.json");
  if (!fs.existsSync(indexPath)) {
    return { present: false as const, reason: "no production backtest index" };
  }
  const files = fs
    .readdirSync(dir)
    .filter((f) => f.startsWith("bt_") && f.endsWith(".json") && !f.includes(".chart."));
  for (const f of files) {
    const raw = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")) as {
      report?: BacktestReport;
      config?: BacktestConfig;
      trades?: BacktestTrade[];
      status?: string;
    };
    if (raw.report && (raw.trades?.length ?? 0) > 0) {
      return {
        present: true as const,
        file: f,
        status: raw.status ?? null,
        configRates: raw.config
          ? {
              feeRate: raw.config.feeRate,
              slippageRate: raw.config.slippageRate,
              fundingRate: raw.config.fundingRate,
              applyFunding: raw.config.applyFunding,
              applySpread: raw.config.applySpread,
              costStressMultipliers: raw.config.costStressMultipliers,
            }
          : null,
        reportInventory: inventoryReportProvenance(raw.report, raw.config),
        sampleTrade: raw.trades![0]
          ? {
              exitReason: raw.trades![0].exitReason,
              feePct: raw.trades![0].feePct,
              slippagePct: raw.trades![0].slippagePct,
              fundingPct: raw.trades![0].fundingPct,
            }
          : null,
        costStress: raw.report.costStress ?? null,
      };
    }
  }
  return { present: false as const, reason: "no completed report with trades" };
}

export function buildP3A5ArtifactPayload() {
  const hashes = productionReadonlyHashes();
  const matrix = runStandardMicroMatrix();
  const longShort = runLongShortComparison();
  const leverage = runLeverageInteraction();
  const duration = runFundingDurationSensitivity();
  const stress = getCostStressMatrix();
  const production = inspectProductionReportProvenance();
  const reportInventory = inventoryReportProvenance(
    matrix.combined.report,
    undefined,
  );
  return {
    hashes,
    matrix,
    longShort,
    leverage,
    duration,
    stress,
    production,
    reportInventory,
    unitAudit: getUnitAudit(),
    reconstruction: attemptReportOnlyReconstruction(matrix.combined),
    approval: getApprovalImpact(),
    identity: getResultIdentityFinding(),
    research: getResearchCostParity(),
    defects: classifyDefects(),
    recommended: getRecommendedFix(),
    inventory: getCostSourceInventory(),
  };
}

export function writeP3A5Artifacts(cwd = process.cwd()) {
  const dir = path.join(
    cwd,
    ".validation/backtest-p3-a5-cost-assumptions",
    P3A5_ARTIFACT_TS,
  );
  fs.mkdirSync(dir, { recursive: true });
  const payload = buildP3A5ArtifactPayload();
  const write = (name: string, value: unknown) => {
    fs.writeFileSync(path.join(dir, name), JSON.stringify(value, null, 2), "utf8");
  };
  write("cost-source-inventory.json", payload.inventory);
  write("fee-trace.json", {
    pipeline: COST_PIPELINE,
    FEE_RUNTIME_FORMULA,
    canonicalUnit: FEE_CANONICAL_UNIT,
    runtimeDefault: ENGINE_DEFAULT_FEE_RATE,
    authority: "BACKTEST_DEFAULT / HARDCODED_CONSTANT (unifiedCost BINANCE_FUTURES_TAKER_FEE comment; not provider feed; not SAFE_CONFIG)",
    makerTaker: "ABSENT in backtestEngine — single feeRate",
    entryExit: "both via feePct = 2 * feeRate",
    leverage: payload.leverage.FEE_LEVERAGE_INTERACTION,
    micro: payload.matrix.feeOnly,
  });
  write("slippage-trace.json", {
    SLIPPAGE_PNL_FORMULA,
    LONG_ENTRY_EXECUTION_PRICE,
    LONG_EXIT_EXECUTION_PRICE,
    SHORT_ENTRY_EXECUTION_PRICE,
    SHORT_EXIT_EXECUTION_PRICE,
    canonicalUnit: SLIPPAGE_CANONICAL_UNIT,
    runtimeDefault: ENGINE_DEFAULT_SLIPPAGE_RATE,
    authority: "BACKTEST_DEFAULT / HARDCODED_CONSTANT",
    micro: payload.matrix.slipOnly,
  });
  write("funding-trace.json", {
    FUNDING_RUNTIME_MODEL,
    FUNDING_APPLICATION_FORMULA,
    canonicalUnit: FUNDING_CANONICAL_UNIT,
    runtimeDefault: ENGINE_DEFAULT_FUNDING_RATE,
    applyFundingDefault: API_DEFAULT_APPLY_FUNDING,
    authority: "BACKTEST_DEFAULT (rate) + USER_INPUT/API default false for applyFunding. NOT PROVIDER_DATA.",
    duration: payload.duration,
    micro: payload.matrix.fundOnly,
  });
  write("micro-fixture-arithmetic.json", {
    zero: stripTrade(payload.matrix.zero),
    feeOnly: stripTrade(payload.matrix.feeOnly),
    slipOnly: stripTrade(payload.matrix.slipOnly),
    fundOnly: stripTrade(payload.matrix.fundOnly),
    combined: stripTrade(payload.matrix.combined),
  });
  write("long-short-comparison.json", {
    LONG_SHORT_COST_SYMMETRY: payload.longShort.LONG_SHORT_COST_SYMMETRY,
    intendedAsymmetry: payload.longShort.intendedAsymmetry,
    feeSymmetric: payload.longShort.feeSymmetric,
    slipRateSymmetric: payload.longShort.slipRateSymmetric,
    fundingSymmetric: payload.longShort.fundingSymmetric,
    shortsDoNotReceiveFunding: payload.longShort.shortsDoNotReceiveFunding,
    long: stripTrade(payload.longShort.long),
    short: stripTrade(payload.longShort.short),
  });
  write("leverage-interaction.json", payload.leverage);
  write("funding-duration.json", payload.duration);
  write("cost-stress-matrix.json", payload.stress);
  write("unit-audit.json", payload.unitAudit);
  write("report-provenance.json", {
    microReport: payload.reportInventory,
    production: payload.production,
  });
  write("report-reproducibility.json", payload.reconstruction);
  write("approval-impact.json", payload.approval);
  write("result-identity.json", payload.identity);
  write("research-cost-parity.json", payload.research);
  write("defect-classification.json", payload.defects);
  write("recommended-fix.json", payload.recommended);
  write("production-readonly-hashes.json", payload.hashes);
  return { dir, hashes: payload.hashes };
}

function stripTrade(row: MicroCostRow) {
  return {
    label: row.label,
    side: row.side,
    exitReason: row.exitReason,
    holdBars: row.holdBars,
    leverage: row.leverage,
    entryRawPrice: row.entryRawPrice,
    entryExecutionPrice: row.entryExecutionPrice,
    exitRawPrice: row.exitRawPrice,
    exitExecutionPrice: row.exitExecutionPrice,
    marginUsdt: row.marginUsdt,
    positionNotional: row.positionNotional,
    grossPnlUsdt: row.grossPnlUsdt,
    entryFeeUsdt: row.entryFeeUsdt,
    exitFeeUsdt: row.exitFeeUsdt,
    totalFeeUsdt: row.totalFeeUsdt,
    slippageCostUsdt: row.slippageCostUsdt,
    fundingCostUsdt: row.fundingCostUsdt,
    netPnlUsdt: row.netPnlUsdt,
    feePct: row.feePct,
    slippagePct: row.slippagePct,
    fundingPct: row.fundingPct,
    expected: row.expected,
    arithmeticMatches: row.arithmeticMatches,
    tradeCount: row.tradeCount,
    reportFeeTotal: row.report.feeTotal,
    reportFundingTotal: row.report.fundingTotal,
    reportSlippageTotal: row.report.slippageTotal,
    validation: row.report.validation,
  };
}

/** Ensure diagnosis helpers are referenced for tree-shaking-free tests. */
export function buildEmptyReportForInventory(): BacktestReport {
  return buildBacktestReport({
    symbol: "BTCUSDT",
    paramsHash: "p3a5",
    strategyName: "P3A5",
    strategyId: "P3A5",
    sourceStatus: "user_created",
    timeframe: "15m",
    startingBalance: 10_000,
    endingBalance: 10_000,
    equityCurve: [10_000],
    trades: [],
    candleCount: 0,
  });
}
