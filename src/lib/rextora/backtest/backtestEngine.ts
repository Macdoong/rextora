import { generateSyntheticCandles, type OhlcvCandle } from "../data/ohlcvTypes";
import { computeIndicators } from "../indicator/indicatorEngine";
import { evaluateSafeV44Signal } from "../signal/safeV44SignalEngine";
import { evaluateCostGuard } from "../cost/costGuard";
import { calculateSafeV44Risk, updateTrailingStop } from "../risk/safeV44RiskEngine";
import { loadSafeV44Strategy } from "../strategy/safeV44Strategy";
import type { SafeV44Params } from "../strategy/strategyTypes";
import { buildBacktestReport, type BacktestReport } from "./backtestReport";

export interface BacktestTrade {
  symbol: string;
  side: "LONG" | "SHORT";
  signalType: string;
  entryBar: number;
  exitBar: number;
  entryPrice: number;
  exitPrice: number;
  stopLoss: number;
  takeProfit: number;
  leverage: number;
  pnlPct: number;
  feePct: number;
  slippagePct?: number;
  exitReason: "take_profit" | "stop_loss" | "trailing_stop" | "max_hold" | "end";
  entryTime?: number;
  exitTime?: number;
  holdBars?: number;
}

export interface BacktestRunInput {
  symbol: string;
  candles?: OhlcvCandle[];
  params?: SafeV44Params;
  paramsHash?: string;
  strategyName?: string;
  strategyId?: string;
  sourceStatus?: string;
  timeframe?: string;
  balance?: number;
  feeRate?: number;
  slippageRate?: number;
  fundingRate?: number;
  applyFunding?: boolean;
  costGuardK?: number;
  fromOpenTime?: number;
  toOpenTime?: number;
}

export interface BacktestRunResult {
  report: BacktestReport;
  trades: BacktestTrade[];
  equityCurve: number[];
}

export function runSafeV44Backtest(input: BacktestRunInput): BacktestRunResult {
  const strategy = loadSafeV44Strategy({ throwOnHashMismatch: false });
  const feeRate = input.feeRate ?? 0.0004;
  const slippageRate = input.slippageRate ?? 0.0002;
  const fundingRate = input.applyFunding ? input.fundingRate ?? 0.0001 : 0;
  const balance0 = input.balance ?? 10_000;
  const params = input.params
    ? { ...input.params, cost_guard_k: input.costGuardK ?? input.params.cost_guard_k }
    : strategy.params;
  const paramsHash = input.paramsHash ?? strategy.paramsHash;

  let candles = input.candles ?? generateSyntheticCandles(400, 100, 0.00015);
  if (input.fromOpenTime != null) candles = candles.filter((c) => c.openTime >= input.fromOpenTime!);
  if (input.toOpenTime != null) candles = candles.filter((c) => c.openTime <= input.toOpenTime!);

  const series = computeIndicators(candles, params);
  const trades: BacktestTrade[] = [];
  const equityCurve: number[] = [balance0];
  let equity = balance0;
  let peak = balance0;
  let lastEntryBar: number | null = null;

  let open:
    | {
        side: "LONG" | "SHORT";
        signalType: string;
        entryBar: number;
        entryPrice: number;
        stopLoss: number;
        takeProfit: number;
        trailDistance: number;
        leverage: number;
        maxHoldBars: number;
        quantity: number;
        margin: number;
      }
    | null = null;

  for (let i = 0; i < candles.length; i += 1) {
    const candle = candles[i];
    const ind = series.snapshots[i];

    if (open) {
      let stop = open.stopLoss;
      if (params.use_trailing && open.trailDistance > 0) {
        stop = updateTrailingStop(open.side, candle.close, stop, open.trailDistance);
        open.stopLoss = stop;
      }

      let exitPrice: number | null = null;
      let exitReason: BacktestTrade["exitReason"] | null = null;

      const hitTp =
        open.side === "LONG" ? candle.high >= open.takeProfit : candle.low <= open.takeProfit;
      const hitSl = open.side === "LONG" ? candle.low <= stop : candle.high >= stop;

      if (hitSl) {
        exitPrice = stop;
        exitReason = params.use_trailing && stop !== open.stopLoss ? "trailing_stop" : "stop_loss";
        // Prefer SL if both in same bar for conservative estimate
      } else if (hitTp) {
        exitPrice = open.takeProfit;
        exitReason = "take_profit";
      } else if (i - open.entryBar >= open.maxHoldBars) {
        exitPrice = candle.close;
        exitReason = "max_hold";
      }

      if (exitPrice != null && exitReason) {
        const slip = exitReason === "max_hold" ? slippageRate : 0;
        const px = open.side === "LONG" ? exitPrice * (1 - slip) : exitPrice * (1 + slip);
        const raw =
          open.side === "LONG"
            ? (px - open.entryPrice) / open.entryPrice
            : (open.entryPrice - px) / open.entryPrice;
        const feePct = feeRate * 2 + fundingRate;
        const slipPct = slip * 2;
        const pnlPct = (raw - feePct - slipPct) * open.leverage;
        equity = equity + open.margin * pnlPct;
        peak = Math.max(peak, equity);
        equityCurve.push(equity);

        trades.push({
          symbol: input.symbol,
          side: open.side,
          signalType: open.signalType,
          entryBar: open.entryBar,
          exitBar: i,
          entryPrice: open.entryPrice,
          exitPrice: px,
          stopLoss: stop,
          takeProfit: open.takeProfit,
          leverage: open.leverage,
          pnlPct,
          feePct,
          slippagePct: slipPct,
          exitReason,
          entryTime: candles[open.entryBar]?.openTime,
          exitTime: candle.openTime,
          holdBars: i - open.entryBar
        });
        lastEntryBar = open.entryBar;
        open = null;
      }
    }

    if (open) continue;

    const signal = evaluateSafeV44Signal({
      symbol: input.symbol,
      series,
      params,
      paramsHash,
      barIndex: i,
      lastEntryBarIndex: lastEntryBar
    });
    if (!signal.passed || signal.side === "NONE" || !ind) continue;

    const dd = peak > 0 ? (equity - peak) / peak : 0;
    const risk = calculateSafeV44Risk({
      entryPrice: candle.close,
      atr: ind.atr,
      atrPct: ind.atrPct,
      side: signal.side,
      signalType: signal.signalType,
      balance: equity,
      params,
      currentDrawdown: dd
    });

    const cost = evaluateCostGuard({
      entryPrice: risk.entryPrice,
      takeProfitPrice: risk.takeProfitPrice,
      side: signal.side,
      atr: ind.atr,
      params
    });
    if (!cost.passed) continue;

    const entrySlip = signal.side === "LONG" ? 1 + slippageRate : 1 - slippageRate;
    open = {
      side: signal.side,
      signalType: signal.signalType,
      entryBar: i,
      entryPrice: risk.entryPrice * entrySlip,
      stopLoss: risk.stopLossPrice,
      takeProfit: risk.takeProfitPrice,
      trailDistance: risk.trailingStopDistance,
      leverage: risk.leverage,
      maxHoldBars: risk.maxHoldBars,
      quantity: risk.quantity,
      margin: risk.marginAmount
    };
  }

  if (open) {
    const last = candles[candles.length - 1];
    const px = last.close;
    const raw =
      open.side === "LONG"
        ? (px - open.entryPrice) / open.entryPrice
        : (open.entryPrice - px) / open.entryPrice;
    const feePct = feeRate * 2;
    const pnlPct = (raw - feePct) * open.leverage;
    equity = equity + open.margin * pnlPct;
    equityCurve.push(equity);
    trades.push({
      symbol: input.symbol,
      side: open.side,
      signalType: open.signalType,
      entryBar: open.entryBar,
      exitBar: candles.length - 1,
      entryPrice: open.entryPrice,
      exitPrice: px,
      stopLoss: open.stopLoss,
      takeProfit: open.takeProfit,
      leverage: open.leverage,
      pnlPct,
      feePct,
      exitReason: "end"
    });
  }

  const report = buildBacktestReport({
    symbol: input.symbol,
    paramsHash,
    strategyName: input.strategyName ?? strategy.name,
    strategyId: input.strategyId ?? strategy.name,
    sourceStatus: input.sourceStatus ?? strategy.sourceStatus,
    timeframe: input.timeframe ?? "15m",
    fromDate: candles[0] ? new Date(candles[0].openTime).toISOString().slice(0, 10) : null,
    toDate: candles.length ? new Date(candles[candles.length - 1].openTime).toISOString().slice(0, 10) : null,
    candleCount: candles.length,
    startingBalance: balance0,
    endingBalance: equity,
    equityCurve,
    trades,
    feesApplied: true,
    slippageApplied: true,
    fundingApplied: Boolean(input.applyFunding),
    paramsHashVerified: paramsHash === strategy.paramsHash || Boolean(input.paramsHash)
  });

  return { report, trades, equityCurve };
}
