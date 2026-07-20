/**
 * Condition-builder backtest — uses Unified Risk/Cost mapping via definition risk fields.
 * Does not modify SAFE_v44 signal engine.
 */
import type { OhlcvCandle } from "../data/ohlcvTypes";
import type { CanonicalStrategyDefinition } from "./definition/types";
import { evaluateBuilderSignal, shouldExitBuilder } from "./conditions/evaluator";
import { computeAtrSeries } from "../indicator/indicatorEngine";
import type { BacktestTrade } from "../backtest/backtestEngine";

export function runConditionBuilderBacktest(input: {
  def: CanonicalStrategyDefinition;
  symbol: string;
  candles: OhlcvCandle[];
  balance: number;
  feeRate: number;
  slippageRate: number;
}): { trades: BacktestTrade[]; equityCurve: number[]; endingBalance: number } {
  const { def, symbol, candles } = input;
  const atr = computeAtrSeries(
    candles.map((c) => c.high),
    candles.map((c) => c.low),
    candles.map((c) => c.close),
    14
  );
  const trades: BacktestTrade[] = [];
  let equity = input.balance;
  const equityCurve = [equity];
  let open: {
    side: "LONG" | "SHORT";
    entryBar: number;
    entryPrice: number;
    stop: number;
    tp: number;
  } | null = null;
  let cooldown = 0;

  for (let i = 30; i < candles.length; i += 1) {
    const c = candles[i];
    const ctx = { candles, bar: i };
    if (cooldown > 0) cooldown -= 1;

    if (open) {
      const hold = i - open.entryBar;
      let exitPrice: number | null = null;
      let exitReason: BacktestTrade["exitReason"] = "end";
      if (open.side === "LONG") {
        if (c.low <= open.stop) {
          exitPrice = open.stop;
          exitReason = "stop_loss";
        } else if (c.high >= open.tp) {
          exitPrice = open.tp;
          exitReason = "take_profit";
        }
      } else {
        if (c.high >= open.stop) {
          exitPrice = open.stop;
          exitReason = "stop_loss";
        } else if (c.low <= open.tp) {
          exitPrice = open.tp;
          exitReason = "take_profit";
        }
      }
      if (exitPrice == null && shouldExitBuilder(def, open.side, ctx, hold)) {
        exitPrice = c.close;
        exitReason = hold >= def.risk.maxHoldBars ? "max_hold" : "end";
      }
      if (exitPrice != null) {
        const feePct = input.feeRate * 2;
        const slipPct = input.slippageRate * 2;
        const raw =
          open.side === "LONG" ? (exitPrice - open.entryPrice) / open.entryPrice : (open.entryPrice - exitPrice) / open.entryPrice;
        const pnlPct = raw - feePct - slipPct;
        equity *= 1 + pnlPct * def.positionSizing.baseBalancePct;
        trades.push({
          symbol,
          side: open.side,
          signalType: "CONDITION_BUILDER",
          entryBar: open.entryBar,
          exitBar: i,
          entryPrice: open.entryPrice,
          exitPrice,
          stopLoss: open.stop,
          takeProfit: open.tp,
          leverage: 1,
          pnlPct,
          feePct,
          slippagePct: slipPct,
          exitReason,
          holdBars: hold
        });
        open = null;
        cooldown = def.execution.cooldownBars;
        equityCurve.push(equity);
      }
    } else if (cooldown === 0) {
      const sig = evaluateBuilderSignal(def, ctx);
      if (sig === "LONG" || sig === "SHORT") {
        const a = Math.max(atr[i], c.close * 0.001);
        const stop =
          sig === "LONG" ? c.close - a * def.risk.stopLossAtrMult : c.close + a * def.risk.stopLossAtrMult;
        const tp =
          sig === "LONG" ? c.close + a * def.risk.takeProfitAtrMult : c.close - a * def.risk.takeProfitAtrMult;
        open = { side: sig, entryBar: i, entryPrice: c.close, stop, tp };
      }
    }
  }

  if (open) {
    const last = candles[candles.length - 1];
    const feePct = input.feeRate * 2;
    const raw =
      open.side === "LONG" ? (last.close - open.entryPrice) / open.entryPrice : (open.entryPrice - last.close) / open.entryPrice;
    const pnlPct = raw - feePct;
    equity *= 1 + pnlPct * def.positionSizing.baseBalancePct;
    trades.push({
      symbol,
      side: open.side,
      signalType: "CONDITION_BUILDER",
      entryBar: open.entryBar,
      exitBar: candles.length - 1,
      entryPrice: open.entryPrice,
      exitPrice: last.close,
      stopLoss: open.stop,
      takeProfit: open.tp,
      leverage: 1,
      pnlPct,
      feePct,
      exitReason: "end",
      holdBars: candles.length - 1 - open.entryBar
    });
    equityCurve.push(equity);
  }

  return { trades, equityCurve, endingBalance: equity };
}
