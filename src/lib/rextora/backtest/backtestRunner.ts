import { generateSyntheticCandles } from "../data/ohlcvTypes";
import {
  getStrategyById,
  updateStrategyLastBacktest,
} from "../strategy/strategyStore";
import { runSafeV44Backtest } from "./backtestEngine";
import { saveBacktestResult } from "./backtestStore";
import type { BacktestConfig, BacktestReport } from "./backtestTypes";
import type { BacktestTrade } from "./backtestEngine";
import {
  storedToDefinition,
  type StoredStrategyV1,
} from "../strategy/definition/bridge";
import { runConditionBuilderBacktest } from "../strategy/conditionBacktest";
import { validateCanonicalDefinition } from "../strategy/definition/validator";
import { buildBacktestReport } from "./backtestReport";

function barsForRange(
  timeframe: string,
  fromMs?: number,
  toMs?: number,
): number {
  const span = (toMs ?? Date.now()) - (fromMs ?? Date.now() - 90 * 86400000);
  const tfMs =
    timeframe === "1m"
      ? 60_000
      : timeframe === "3m"
        ? 180_000
        : timeframe === "5m"
          ? 300_000
          : timeframe === "1h"
            ? 3_600_000
            : 900_000;
  return Math.max(250, Math.min(2000, Math.floor(span / tfMs)));
}

export function runConfiguredBacktest(config: BacktestConfig): {
  report: BacktestReport;
  trades: BacktestTrade[];
  equityCurve: number[];
  candles: ReturnType<typeof generateSyntheticCandles>;
} {
  const strategy = getStrategyById(config.strategyId) as
    StoredStrategyV1 | undefined;
  if (!strategy) throw new Error("전략을 찾을 수 없습니다.");

  if (strategy.strategyType === "condition_builder") {
    const def = storedToDefinition(strategy);
    const v = validateCanonicalDefinition(def);
    if (!v.ok) throw new Error(v.errors.join(" · "));
    if (def.timeframe === "unknown")
      throw new Error("적용 시간봉이 확인되지 않았습니다.");
  }

  const symbols = config.symbols.length ? config.symbols : ["BTCUSDT"];
  const allTrades: BacktestTrade[] = [];
  let combinedEquity = config.balance;
  const equityCurve: number[] = [config.balance];
  let candleCount = 0;
  let primaryCandles: ReturnType<typeof generateSyntheticCandles> = [];

  const stress: NonNullable<BacktestReport["costStress"]> = [];

  for (const mult of config.costStressMultipliers.length
    ? config.costStressMultipliers
    : [1]) {
    const feeRate = config.feeRate * mult;
    const slippageRate = config.slippageRate * mult;
    let stressReturn = 0;
    let stressMdd = 0;
    let stressTrades = 0;
    let stressNegMonths = 0;
    let stressEquity = config.balance;

    for (const symbol of symbols) {
      const count = barsForRange(
        config.timeframe,
        config.fromOpenTime,
        config.toOpenTime,
      );
      const candles = generateSyntheticCandles(
        count,
        80 + symbol.length * 3,
        0.00012 + symbol.length * 0.00001,
      );

      let resultTrades: BacktestTrade[] = [];
      let resultEquity: number[] = [];
      let resultReport: {
        candleCount: number;
        endingBalance: number;
        startingBalance: number;
        totalReturn: number;
        mdd: number;
        tradeCount: number;
        negativeMonths: number;
      };

      if (strategy.strategyType === "condition_builder") {
        const def = storedToDefinition(strategy);
        const cb = runConditionBuilderBacktest({
          def,
          symbol,
          candles,
          balance: config.balance / Math.max(1, symbols.length),
          feeRate,
          slippageRate,
        });
        const starting = config.balance / Math.max(1, symbols.length);
        const totalReturn =
          starting > 0 ? (cb.endingBalance - starting) / starting : 0;
        let peak = starting;
        let mdd = 0;
        for (const eq of cb.equityCurve) {
          peak = Math.max(peak, eq);
          mdd = Math.min(mdd, peak > 0 ? (eq - peak) / peak : 0);
        }
        resultTrades = cb.trades;
        resultEquity = cb.equityCurve;
        resultReport = {
          candleCount: candles.length,
          endingBalance: cb.endingBalance,
          startingBalance: starting,
          totalReturn,
          mdd,
          tradeCount: cb.trades.length,
          negativeMonths: 0,
        };
      } else {
        const safe = runSafeV44Backtest({
          symbol,
          candles,
          params: {
            ...strategy.params,
            cost_guard_k: config.costGuardK,
            base_bal_pct: config.baseBalPct ?? strategy.params.base_bal_pct,
          },
          paramsHash: strategy.paramsHash,
          strategyName: strategy.name,
          strategyId: strategy.id,
          sourceStatus: strategy.sourceStatus,
          timeframe: config.timeframe,
          balance: config.balance / Math.max(1, symbols.length),
          feeRate,
          slippageRate,
          fundingRate: config.fundingRate,
          applyFunding: config.applyFunding,
          costGuardK: config.costGuardK,
          fromOpenTime: config.fromOpenTime,
          toOpenTime: config.toOpenTime,
        });
        resultTrades = safe.trades;
        resultEquity = safe.equityCurve;
        resultReport = safe.report;
      }

      if (mult === (config.costStressMultipliers[0] ?? 1)) {
        allTrades.push(...resultTrades);
        candleCount += resultReport.candleCount;
        combinedEquity +=
          resultReport.endingBalance - resultReport.startingBalance;
        equityCurve.push(...resultEquity.slice(1));
        if (!primaryCandles.length) primaryCandles = candles;
      }

      stressReturn += resultReport.totalReturn;
      stressMdd = Math.min(stressMdd, resultReport.mdd);
      stressTrades += resultReport.tradeCount;
      stressNegMonths += resultReport.negativeMonths;
      stressEquity = resultReport.endingBalance;
    }

    stress.push({
      multiplier: mult,
      totalReturn: Number((stressReturn / symbols.length).toFixed(6)),
      mdd: Number(stressMdd.toFixed(6)),
      tradeCount: stressTrades,
      negativeMonths: stressNegMonths,
    });
    void stressEquity;
  }

  const report = buildBacktestReport({
    strategyName: strategy.name,
    paramsHash: strategy.paramsHash,
    strategyId: strategy.id,
    sourceStatus: strategy.sourceStatus,
    symbol: symbols[0],
    symbols,
    timeframe: config.timeframe,
    fromDate: config.fromOpenTime
      ? new Date(config.fromOpenTime).toISOString().slice(0, 10)
      : null,
    toDate: config.toOpenTime
      ? new Date(config.toOpenTime).toISOString().slice(0, 10)
      : null,
    candleCount,
    startingBalance: config.balance,
    endingBalance: combinedEquity,
    equityCurve,
    trades: allTrades,
    costStress: stress,
    paramsHashVerified:
      strategy.paramsHash === "7893ca3f0e30" || !strategy.locked,
    feesApplied: true,
    slippageApplied: true,
    fundingApplied: config.applyFunding,
  });

  return { report, trades: allTrades, equityCurve, candles: primaryCandles };
}

export function runAndSaveBacktest(config: BacktestConfig) {
  const result = runConfiguredBacktest(config);
  updateStrategyLastBacktest(config.strategyId, {
    totalReturn: result.report.totalReturn,
    mdd: result.report.mdd,
    trades: result.report.tradeCount,
    winRate: result.report.winRate,
  });
  const saved = saveBacktestResult({
    config,
    report: result.report,
    trades: result.trades,
  });
  return { ...result, saved };
}
