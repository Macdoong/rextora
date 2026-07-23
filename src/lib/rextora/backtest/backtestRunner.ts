import {
  generateSyntheticCandles,
  generateSyntheticCandlesForRange,
  type OhlcvCandle,
} from "../data/ohlcvTypes";
import {
  HistoricalCandleLoadError,
  loadHistoricalCandles,
} from "../data/historicalCandleLoader";
import { resolveTimeframe } from "../data/timeframes";
import {
  getStrategyById,
  updateStrategyLastBacktest,
} from "../strategy/strategyStore";
import { runSafeV44Backtest, type BacktestTrade } from "./backtestEngine";
import { saveBacktestResult } from "./backtestStore";
import type { BacktestConfig, BacktestReport } from "./backtestTypes";
import {
  storedToDefinition,
  type StoredStrategyV1,
} from "../strategy/definition/bridge";
import { runConditionBuilderBacktest } from "../strategy/conditionBacktest";
import { validateCanonicalDefinition } from "../strategy/definition/validator";
import { buildBacktestReport } from "./backtestReport";

/**
 * Legacy display-sample ceiling (disabled).
 * Chart payload now returns the full processed OHLC series.
 * Viewport virtualization in CandlestickChart handles render cost.
 */
export const CHART_CANDLE_SAMPLE_LIMIT = Number.POSITIVE_INFINITY;

export class BacktestPipelineError extends Error {
  readonly code: string;
  readonly userMessage: string;
  readonly technicalReason: string;
  readonly details: Record<string, unknown>;

  constructor(input: {
    code: string;
    userMessage: string;
    technicalReason: string;
    details?: Record<string, unknown>;
  }) {
    super(input.userMessage);
    this.name = "BacktestPipelineError";
    this.code = input.code;
    this.userMessage = input.userMessage;
    this.technicalReason = input.technicalReason;
    this.details = input.details ?? {};
  }

  toJSON() {
    return {
      code: this.code,
      userMessage: this.userMessage,
      technicalReason: this.technicalReason,
      ...this.details,
    };
  }
}

export type SymbolResultStatus = "ok" | "zero_trades" | "failed";

/** Independent per-symbol backtest payload — never overwritten by another symbol. */
export interface SymbolBacktestResult {
  symbol: string;
  status: SymbolResultStatus;
  error?: { code: string; message: string; technicalReason?: string };
  report: BacktestReport | null;
  trades: BacktestTrade[];
  equityCurve: number[];
  candles: OhlcvCandle[];
  chartCandles: OhlcvCandle[];
  chartSamplingApplied: boolean;
  processedCandleCount: number;
}

export interface BacktestRunnerResult {
  /** Compatibility: first successful symbol report, else combined when multi. */
  report: BacktestReport;
  trades: BacktestTrade[];
  equityCurve: number[];
  candles: OhlcvCandle[];
  chartCandles: OhlcvCandle[];
  chartSamplingApplied: boolean;
  processedCandleCount: number;
  /** Canonical multi-symbol results — one entry per requested symbol. */
  symbolResults: SymbolBacktestResult[];
  /**
   * Capital-split combined summary when ≥2 symbols succeed.
   * Not an average of percentages — sums equity deltas from equal capital allocation.
   */
  combinedReport: BacktestReport | null;
  requestedSymbols: string[];
  successSymbols: string[];
  failedSymbols: string[];
}

/**
 * Chart candles must equal the full processed OHLC series.
 * Never downsample / stride / aggregate market history for display.
 * (Previously: every-Nth sample to CHART_CANDLE_SAMPLE_LIMIT=400 → e.g. 2884→362.)
 */
function sampleChartCandles(candles: OhlcvCandle[]): {
  chartCandles: OhlcvCandle[];
  chartSamplingApplied: boolean;
} {
  return { chartCandles: candles, chartSamplingApplied: false };
}

async function loadCandlesForSymbol(
  config: BacktestConfig,
  symbol: string,
): Promise<{
  candles: OhlcvCandle[];
  dataSource: "binance" | "synthetic-test";
  requestedFrom: string | null;
  requestedTo: string | null;
  actualFirstCandleTime: string | null;
  actualLastCandleTime: string | null;
  intervalMs: number;
}> {
  const dataMode = config.dataMode ?? "binance";
  const tf = resolveTimeframe(config.timeframe);
  const from = config.fromOpenTime ?? Date.now() - 90 * 86_400_000;
  const to = config.toOpenTime ?? Date.now();
  const requestedFrom = new Date(from).toISOString();
  const requestedTo = new Date(to).toISOString();

  if (dataMode === "synthetic-test") {
    const candles = generateSyntheticCandlesForRange(
      from,
      to,
      tf.intervalMs,
      80 + symbol.length * 3,
      0.00012 + symbol.length * 0.00001,
    );
    if (candles.length === 0) {
      const candlesFallback = generateSyntheticCandles(400, 100, 0.00015, {
        startOpenTime: from,
        intervalMs: tf.intervalMs,
      });
      return {
        candles: candlesFallback,
        dataSource: "synthetic-test",
        requestedFrom,
        requestedTo,
        actualFirstCandleTime: candlesFallback[0]
          ? new Date(candlesFallback[0].openTime).toISOString()
          : null,
        actualLastCandleTime: candlesFallback.length
          ? new Date(
              candlesFallback[candlesFallback.length - 1].openTime,
            ).toISOString()
          : null,
        intervalMs: tf.intervalMs,
      };
    }
    return {
      candles,
      dataSource: "synthetic-test",
      requestedFrom,
      requestedTo,
      actualFirstCandleTime: new Date(candles[0].openTime).toISOString(),
      actualLastCandleTime: new Date(
        candles[candles.length - 1].openTime,
      ).toISOString(),
      intervalMs: tf.intervalMs,
    };
  }

  try {
    const loaded = await loadHistoricalCandles({
      symbol,
      timeframe: config.timeframe,
      fromOpenTime: from,
      toOpenTime: to,
    });
    return {
      candles: loaded.candles,
      dataSource: "binance",
      requestedFrom: loaded.requestedFrom,
      requestedTo: loaded.requestedTo,
      actualFirstCandleTime: loaded.actualFirstCandleTime,
      actualLastCandleTime: loaded.actualLastCandleTime,
      intervalMs: loaded.intervalMs,
    };
  } catch (error) {
    if (error instanceof HistoricalCandleLoadError) {
      throw new BacktestPipelineError({
        code: error.code,
        userMessage: error.userMessage,
        technicalReason: error.technicalReason,
        details: error.toJSON(),
      });
    }
    throw new BacktestPipelineError({
      code: "BINANCE_FETCH_FAILED",
      userMessage: "과거 캔들 로딩 중 오류가 발생했습니다.",
      technicalReason:
        error instanceof Error ? error.message : "unknown load error",
      details: {
        symbol,
        timeframe: config.timeframe,
        requestedFrom,
        requestedTo,
        candlesReceived: 0,
      },
    });
  }
}

function failedSymbolResult(
  symbol: string,
  code: string,
  message: string,
  technicalReason?: string,
): SymbolBacktestResult {
  return {
    symbol,
    status: "failed",
    error: { code, message, technicalReason },
    report: null,
    trades: [],
    equityCurve: [],
    candles: [],
    chartCandles: [],
    chartSamplingApplied: false,
    processedCandleCount: 0,
  };
}

export async function runConfiguredBacktest(
  config: BacktestConfig,
): Promise<BacktestRunnerResult> {
  const strategy = getStrategyById(config.strategyId) as
    | StoredStrategyV1
    | undefined;
  if (!strategy) {
    throw new BacktestPipelineError({
      code: "STRATEGY_NOT_FOUND",
      userMessage: "전략을 찾을 수 없습니다.",
      technicalReason: `strategyId=${config.strategyId}`,
    });
  }

  try {
    resolveTimeframe(config.timeframe);
  } catch {
    throw new BacktestPipelineError({
      code: "TIMEFRAME_UNSUPPORTED",
      userMessage: `지원하지 않는 시간봉입니다 (${config.timeframe}).`,
      technicalReason: `timeframe=${config.timeframe}`,
    });
  }

  if (strategy.strategyType === "condition_builder") {
    const def = storedToDefinition(strategy);
    const v = validateCanonicalDefinition(def);
    if (!v.ok) {
      throw new BacktestPipelineError({
        code: "STRATEGY_VALIDATION_FAILED",
        userMessage: v.errors.join(" · "),
        technicalReason: "condition_builder validation failed",
      });
    }
    if (def.timeframe === "unknown") {
      throw new BacktestPipelineError({
        code: "STRATEGY_VALIDATION_FAILED",
        userMessage: "적용 시간봉이 확인되지 않았습니다.",
        technicalReason: "timeframe unknown",
      });
    }
  }

  const symbols = config.symbols.length ? config.symbols : ["BTCUSDT"];
  const dataMode = config.dataMode ?? "binance";
  const perSymbolBalance = config.balance / Math.max(1, symbols.length);
  const multipliers = config.costStressMultipliers.length
    ? config.costStressMultipliers
    : [1];

  const symbolResults: SymbolBacktestResult[] = [];

  for (const symbol of symbols) {
    try {
      const loaded = await loadCandlesForSymbol(config, symbol);
      const warmUp = strategy.params.ema_slow ?? 50;
      if (loaded.candles.length === 0) {
        symbolResults.push(
          failedSymbolResult(
            symbol,
            "EMPTY_CANDLES",
            `${symbol} 캔들이 비어 있습니다.`,
          ),
        );
        continue;
      }
      if (dataMode === "binance" && loaded.candles.length <= warmUp) {
        symbolResults.push(
          failedSymbolResult(
            symbol,
            "INSUFFICIENT_CANDLES",
            `${symbol} 캔들 수(${loaded.candles.length})가 지표 워밍업(${warmUp}봉)에 부족합니다.`,
            `candles=${loaded.candles.length} warmUp=${warmUp}`,
          ),
        );
        continue;
      }

      // Base (x1) run for primary symbol result
      const baseMult = multipliers[0] ?? 1;
      const feeRate = config.feeRate * baseMult;
      const slippageRate = config.slippageRate * baseMult;
      const spreadRate = (config.applySpread ? config.spreadRate : 0) * baseMult;

      let resultTrades: BacktestTrade[] = [];
      let resultEquity: number[] = [];
      let resultReport: BacktestReport;

      if (strategy.strategyType === "condition_builder") {
        const def = storedToDefinition(strategy);
        const cb = runConditionBuilderBacktest({
          def,
          symbol,
          candles: loaded.candles,
          balance: perSymbolBalance,
          feeRate,
          slippageRate,
        });
        resultTrades = cb.trades;
        resultEquity = cb.equityCurve;
        resultReport = buildBacktestReport({
          strategyName: strategy.name,
          paramsHash: strategy.paramsHash,
          strategyId: strategy.id,
          sourceStatus: strategy.sourceStatus,
          symbol,
          symbols: [symbol],
          timeframe: config.timeframe,
          fromDate: loaded.actualFirstCandleTime?.slice(0, 10) ?? null,
          toDate: loaded.actualLastCandleTime?.slice(0, 10) ?? null,
          requestedFrom: loaded.requestedFrom,
          requestedTo: loaded.requestedTo,
          actualFirstCandleTime: loaded.actualFirstCandleTime,
          actualLastCandleTime: loaded.actualLastCandleTime,
          candleCount: loaded.candles.length,
          processedCandleCount: loaded.candles.length,
          dataSource: loaded.dataSource,
          startingBalance: perSymbolBalance,
          endingBalance: cb.endingBalance,
          equityCurve: cb.equityCurve,
          trades: cb.trades,
          paramsHashVerified:
            strategy.paramsHash === "7893ca3f0e30" || !strategy.locked,
          feesApplied: true,
          slippageApplied: true,
          fundingApplied: config.applyFunding,
          spreadApplied: config.applySpread,
        });
      } else {
        const safe = runSafeV44Backtest({
          symbol,
          candles: loaded.candles,
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
          balance: perSymbolBalance,
          feeRate,
          slippageRate,
          fundingRate: config.fundingRate,
          applyFunding: config.applyFunding,
          applySpread: config.applySpread,
          spreadRate,
          costGuardK: config.costGuardK,
          dataSource: loaded.dataSource,
          requestedFrom: loaded.requestedFrom,
          requestedTo: loaded.requestedTo,
        });
        resultTrades = safe.trades;
        resultEquity = safe.equityCurve;
        resultReport = safe.report;
      }

      // Cost stress for this symbol
      const stress: NonNullable<BacktestReport["costStress"]> = [];
      for (const mult of multipliers) {
        const f = config.feeRate * mult;
        const s = config.slippageRate * mult;
        const sp = (config.applySpread ? config.spreadRate : 0) * mult;
        if (strategy.strategyType === "condition_builder") {
          const def = storedToDefinition(strategy);
          const cb = runConditionBuilderBacktest({
            def,
            symbol,
            candles: loaded.candles,
            balance: perSymbolBalance,
            feeRate: f,
            slippageRate: s,
          });
          const totalReturn =
            perSymbolBalance > 0
              ? (cb.endingBalance - perSymbolBalance) / perSymbolBalance
              : 0;
          stress.push({
            multiplier: mult,
            totalReturn: Number(totalReturn.toFixed(6)),
            mdd: 0,
            tradeCount: cb.trades.length,
            negativeMonths: 0,
          });
        } else {
          const safe = runSafeV44Backtest({
            symbol,
            candles: loaded.candles,
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
            balance: perSymbolBalance,
            feeRate: f,
            slippageRate: s,
            fundingRate: config.fundingRate,
            applyFunding: config.applyFunding,
            applySpread: config.applySpread,
            spreadRate: sp,
            costGuardK: config.costGuardK,
            dataSource: loaded.dataSource,
            requestedFrom: loaded.requestedFrom,
            requestedTo: loaded.requestedTo,
          });
          stress.push({
            multiplier: mult,
            totalReturn: safe.report.totalReturn,
            mdd: safe.report.mdd,
            tradeCount: safe.report.tradeCount,
            negativeMonths: safe.report.negativeMonths,
          });
        }
      }
      resultReport = { ...resultReport, costStress: stress };

      const { chartCandles, chartSamplingApplied } = sampleChartCandles(
        loaded.candles,
      );
      symbolResults.push({
        symbol,
        status: resultTrades.length === 0 ? "zero_trades" : "ok",
        report: resultReport,
        trades: resultTrades,
        equityCurve: resultEquity,
        candles: loaded.candles,
        chartCandles,
        chartSamplingApplied,
        processedCandleCount: loaded.candles.length,
      });
    } catch (error) {
      const code =
        error instanceof BacktestPipelineError
          ? error.code
          : error instanceof HistoricalCandleLoadError
            ? error.code
            : "ENGINE_FAILURE";
      const message =
        error instanceof BacktestPipelineError ||
        error instanceof HistoricalCandleLoadError
          ? error.userMessage
          : error instanceof Error
            ? error.message
            : `${symbol} 백테스트 실패`;
      symbolResults.push(
        failedSymbolResult(
          symbol,
          code,
          message,
          error instanceof Error ? error.message : undefined,
        ),
      );
    }
  }

  const successResults = symbolResults.filter((r) => r.report != null);
  const successSymbols = successResults.map((r) => r.symbol);
  const failedSymbols = symbolResults
    .filter((r) => r.status === "failed")
    .map((r) => r.symbol);

  if (successResults.length === 0) {
    const firstFail = symbolResults[0];
    throw new BacktestPipelineError({
      code: firstFail?.error?.code ?? "ALL_SYMBOLS_FAILED",
      userMessage:
        symbols.length > 1
          ? "선택한 모든 심볼의 백테스트에 실패했습니다."
          : (firstFail?.error?.message ?? "백테스트 실패"),
      technicalReason: failedSymbols.join(","),
      details: {
        requestedSymbols: symbols,
        failedSymbols,
        symbolErrors: symbolResults.map((r) => ({
          symbol: r.symbol,
          error: r.error,
        })),
      },
    });
  }

  // Combined capital-split summary (only when multi-symbol successes)
  let combinedReport: BacktestReport | null = null;
  if (successResults.length >= 2) {
    const allTrades = successResults.flatMap((r) => r.trades);
    const starting = config.balance;
    const ending = successResults.reduce(
      (sum, r) => sum + (r.report?.endingBalance ?? 0),
      0,
    );
    const equityCurve = [starting];
    for (const r of successResults) {
      equityCurve.push(...(r.equityCurve.slice(1) ?? []));
    }
    combinedReport = buildBacktestReport({
      strategyName: strategy.name,
      paramsHash: strategy.paramsHash,
      strategyId: strategy.id,
      sourceStatus: strategy.sourceStatus,
      symbol: "MULTI",
      symbols: successSymbols,
      timeframe: config.timeframe,
      requestedFrom: successResults[0].report?.requestedFrom ?? null,
      requestedTo: successResults[0].report?.requestedTo ?? null,
      actualFirstCandleTime:
        successResults[0].report?.actualFirstCandleTime ?? null,
      actualLastCandleTime:
        successResults[0].report?.actualLastCandleTime ?? null,
      candleCount: successResults.reduce(
        (s, r) => s + r.processedCandleCount,
        0,
      ),
      processedCandleCount: successResults.reduce(
        (s, r) => s + r.processedCandleCount,
        0,
      ),
      dataSource: successResults[0].report?.dataSource ?? "binance",
      startingBalance: starting,
      endingBalance: ending,
      equityCurve,
      trades: allTrades,
      paramsHashVerified:
        strategy.paramsHash === "7893ca3f0e30" || !strategy.locked,
      feesApplied: true,
      slippageApplied: true,
      fundingApplied: config.applyFunding,
      spreadApplied: config.applySpread,
    });
  }

  const primary = successResults[0];
  const report = primary.report!;

  return {
    report,
    trades: primary.trades,
    equityCurve: primary.equityCurve,
    candles: primary.candles,
    chartCandles: primary.chartCandles,
    chartSamplingApplied: primary.chartSamplingApplied,
    processedCandleCount: primary.processedCandleCount,
    symbolResults,
    combinedReport,
    requestedSymbols: symbols,
    successSymbols,
    failedSymbols,
  };
}

export async function runAndSaveBacktest(config: BacktestConfig) {
  const result = await runConfiguredBacktest(config);
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
