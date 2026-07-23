import type { OhlcvCandle } from "../data/ohlcvTypes";
import { computeIndicators } from "../indicator/indicatorEngine";
import { evaluateSafeV44Signal } from "../signal/safeV44SignalEngine";
import { evaluateCostGuard } from "../cost/costGuard";
import { calculateSafeV44Risk, updateTrailingStop } from "../risk/safeV44RiskEngine";
import { loadSafeV44Strategy } from "../strategy/safeV44Strategy";
import type { SafeV44Params } from "../strategy/strategyTypes";
import { buildBacktestReport, type BacktestReport } from "./backtestReport";
import type { BacktestZeroTradeDiagnostics } from "./backtestTypes";

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
  fundingPct?: number;
  spreadPct?: number;
  exitReason: "take_profit" | "stop_loss" | "trailing_stop" | "max_hold" | "end";
  entryTime?: number;
  exitTime?: number;
  holdBars?: number;
  /** Additive ledger fields for analysis UX */
  id?: string;
  marginUsdt?: number;
  quantity?: number;
  grossPnlUsdt?: number;
  netPnlUsdt?: number;
  feeCostUsdt?: number;
  slippageCostUsdt?: number;
  spreadCostUsdt?: number;
  fundingCostUsdt?: number;
}

export interface BacktestRunInput {
  symbol: string;
  /** Required — caller must supply candles. No silent synthetic fallback. */
  candles: OhlcvCandle[];
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
  applySpread?: boolean;
  spreadRate?: number;
  costGuardK?: number;
  dataSource?: "binance" | "synthetic-test";
  requestedFrom?: string | null;
  requestedTo?: string | null;
}

export interface BacktestRunResult {
  report: BacktestReport;
  trades: BacktestTrade[];
  equityCurve: number[];
  /** Exact candles processed by the engine (post any prior filtering by loader) */
  processedCandles: OhlcvCandle[];
}

function bumpReason(map: Record<string, number>, reason: string) {
  map[reason] = (map[reason] ?? 0) + 1;
}

function ledgerFields(
  margin: number,
  leverage: number,
  raw: number,
  feePct: number,
  slipPct: number,
  fundingPct: number,
  spreadPct: number,
  pnlPct: number,
  quantity: number,
) {
  const feeCostUsdt = Number((margin * feePct * leverage).toFixed(6));
  const slippageCostUsdt = Number((margin * slipPct * leverage).toFixed(6));
  const spreadCostUsdt = Number((margin * spreadPct * leverage).toFixed(6));
  const fundingCostUsdt = Number((margin * fundingPct * leverage).toFixed(6));
  const grossPnlUsdt = Number((margin * raw * leverage).toFixed(6));
  const netPnlUsdt = Number((margin * pnlPct).toFixed(6));
  return {
    marginUsdt: Number(margin.toFixed(6)),
    quantity: Number(quantity.toFixed(8)),
    feeCostUsdt,
    slippageCostUsdt,
    spreadCostUsdt,
    fundingCostUsdt,
    grossPnlUsdt,
    netPnlUsdt,
  };
}

export function runSafeV44Backtest(input: BacktestRunInput): BacktestRunResult {
  const strategy = loadSafeV44Strategy({ throwOnHashMismatch: false });
  const feeRate = input.feeRate ?? 0.0004;
  const slippageRate = input.slippageRate ?? 0.0002;
  const fundingRate = input.applyFunding ? input.fundingRate ?? 0.0001 : 0;
  const spreadRate = input.applySpread ? input.spreadRate ?? 0.0001 : 0;
  const balance0 = input.balance ?? 10_000;
  const params = input.params
    ? { ...input.params, cost_guard_k: input.costGuardK ?? input.params.cost_guard_k }
    : strategy.params;
  const paramsHash = input.paramsHash ?? strategy.paramsHash;

  if (!Array.isArray(input.candles)) {
    throw new Error("backtest requires candles — synthetic fallback disabled");
  }
  const candles = input.candles;
  const warmUp = params.ema_slow;
  const rejectionReasons: Record<string, number> = {};
  let longSignalCandidateCount = 0;
  let shortSignalCandidateCount = 0;
  let evaluatedCandleCount = 0;

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
        const feePct = feeRate * 2;
        const fundingPct = fundingRate;
        const slipPct = slip * 2;
        const spreadPct = spreadRate;
        const pnlPct = (raw - feePct - slipPct - fundingPct - spreadPct) * open.leverage;
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
          fundingPct,
          spreadPct,
          exitReason,
          entryTime: candles[open.entryBar]?.openTime,
          exitTime: candle.openTime,
          holdBars: i - open.entryBar,
          ...ledgerFields(
            open.margin,
            open.leverage,
            raw,
            feePct,
            slipPct,
            fundingPct,
            spreadPct,
            pnlPct,
            open.quantity,
          ),
        });
        lastEntryBar = open.entryBar;
        open = null;
      }
    }

    if (open) continue;

    evaluatedCandleCount += 1;
    const signal = evaluateSafeV44Signal({
      symbol: input.symbol,
      series,
      params,
      paramsHash,
      barIndex: i,
      lastEntryBarIndex: lastEntryBar
    });

    if (!signal.passed || signal.side === "NONE" || !ind) {
      if (signal.rejectReason) bumpReason(rejectionReasons, signal.rejectReason);
      continue;
    }

    if (signal.side === "LONG") longSignalCandidateCount += 1;
    if (signal.side === "SHORT") shortSignalCandidateCount += 1;

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
      params,
      feeRate,
      slippageRate,
      spreadRate: input.applySpread ? spreadRate : 0,
      fundingRate
    });
    if (!cost.passed) {
      bumpReason(rejectionReasons, cost.reason || "비용 가드 차단");
      continue;
    }

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
    const fundingPct = fundingRate;
    const spreadPct = spreadRate;
    const slipPct = 0;
    const pnlPct = (raw - feePct - fundingPct - spreadPct) * open.leverage;
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
      fundingPct,
      spreadPct,
      exitReason: "end",
      entryTime: candles[open.entryBar]?.openTime,
      exitTime: last.openTime,
      holdBars: candles.length - 1 - open.entryBar,
      ...ledgerFields(
        open.margin,
        open.leverage,
        raw,
        feePct,
        slipPct,
        fundingPct,
        spreadPct,
        pnlPct,
        open.quantity,
      ),
    });
  }

  let zeroTradeDiagnostics: BacktestZeroTradeDiagnostics | null = null;
  if (trades.length === 0 && candles.length > 0) {
    const topReasons = Object.entries(rejectionReasons)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([reason, count]) => `${reason} (${count})`)
      .join(", ");
    zeroTradeDiagnostics = {
      loadedCandleCount: candles.length,
      evaluatedCandleCount,
      warmUpCandleCount: Math.min(warmUp, candles.length),
      longSignalCandidateCount,
      shortSignalCandidateCount,
      rejectionReasons,
      explanationKo:
        candles.length <= warmUp
          ? `캔들 ${candles.length}개로는 지표 워밍업(${warmUp}봉)에 부족합니다.`
          : longSignalCandidateCount + shortSignalCandidateCount === 0
            ? `전략이 ${evaluatedCandleCount}개 봉을 평가했지만 진입 후보 신호가 없었습니다.${topReasons ? ` 주요 사유: ${topReasons}` : ""}`
            : `진입 후보는 있었으나 비용 가드 등에서 차단되어 체결된 거래가 없습니다.${topReasons ? ` 주요 사유: ${topReasons}` : ""}`
    };
  }

  const first = candles[0];
  const last = candles[candles.length - 1];
  const report = buildBacktestReport({
    symbol: input.symbol,
    paramsHash,
    strategyName: input.strategyName ?? strategy.name,
    strategyId: input.strategyId ?? strategy.name,
    sourceStatus: input.sourceStatus ?? strategy.sourceStatus,
    timeframe: input.timeframe ?? "15m",
    fromDate: first ? new Date(first.openTime).toISOString().slice(0, 10) : null,
    toDate: last ? new Date(last.openTime).toISOString().slice(0, 10) : null,
    requestedFrom: input.requestedFrom ?? null,
    requestedTo: input.requestedTo ?? null,
    actualFirstCandleTime: first ? new Date(first.openTime).toISOString() : null,
    actualLastCandleTime: last ? new Date(last.openTime).toISOString() : null,
    candleCount: candles.length,
    processedCandleCount: candles.length,
    dataSource: input.dataSource ?? "binance",
    startingBalance: balance0,
    endingBalance: equity,
    equityCurve,
    trades,
    feesApplied: true,
    slippageApplied: true,
    fundingApplied: Boolean(input.applyFunding),
    spreadApplied: Boolean(input.applySpread),
    paramsHashVerified: paramsHash === strategy.paramsHash || Boolean(input.paramsHash),
    zeroTradeDiagnostics
  });

  return { report, trades, equityCurve, processedCandles: candles };
}
