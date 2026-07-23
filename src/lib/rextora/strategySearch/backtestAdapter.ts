/**
 * Production backtest adapter for strategy search (Phase 3).
 * Calls runSafeV44Backtest directly — no scoring, PASS, persistence, or cost stress.
 */

import { runSafeV44Backtest } from "../backtest/backtestEngine";
import type { BacktestReport } from "../backtest/backtestTypes";
import { loadHistoricalCandles } from "../data/historicalCandleLoader";
import type { OhlcvCandle } from "../data/ohlcvTypes";
import { isLockedSafeHash } from "../strategy/strategyHash";
import type { SafeV44Params } from "../strategy/strategyTypes";
import type {
  StrategySearchBacktestCostConfig,
  StrategySearchCandidate,
  StrategySearchCandidateEvaluation,
  StrategySearchEvaluationWindowPlan,
  StrategySearchStressRuntimeCostConfig,
  StrategySearchWindowEvaluation,
  StrategySearchWindowMetrics,
} from "./types";

const PROTECTED_STRATEGY_ID = "SAFE_v44_i4060";
const PROTECTED_HASH = "7893ca3f0e30";

export type StrategySearchAdapterErrorCode =
  | "INVALID_CANDIDATE"
  | "PROTECTED_HASH_COLLISION"
  | "INVALID_WINDOW"
  | "EMPTY_CANDLES"
  | "UNSORTED_CANDLES"
  | "DUPLICATE_CANDLE_TIME"
  | "CANDLE_OUTSIDE_WINDOW"
  | "BACKTEST_FAILED";

export class StrategySearchAdapterError extends Error {
  readonly code: StrategySearchAdapterErrorCode;
  readonly symbol: string | null;
  readonly windowId: string | null;
  readonly candidateId: string | null;

  constructor(
    code: StrategySearchAdapterErrorCode,
    message: string,
    context?: {
      symbol?: string | null;
      windowId?: string | null;
      candidateId?: string | null;
    },
  ) {
    super(message);
    this.name = "StrategySearchAdapterError";
    this.code = code;
    this.symbol = context?.symbol ?? null;
    this.windowId = context?.windowId ?? null;
    this.candidateId = context?.candidateId ?? null;
  }
}

export interface EvaluateCandidateWindowInput {
  candidate: StrategySearchCandidate;
  symbol: string;
  timeframe: string;
  window: StrategySearchEvaluationWindowPlan;
  balance: number;
  costConfig: StrategySearchBacktestCostConfig;
  /** When supplied, skips the production candle loader (tests / future cache). */
  preloadedCandles?: OhlcvCandle[];
}

export interface EvaluateCandidateAcrossWindowsInput {
  candidate: StrategySearchCandidate;
  symbols: string[];
  timeframe: string;
  windows: readonly StrategySearchEvaluationWindowPlan[];
  balance: number;
  costConfig: StrategySearchBacktestCostConfig;
  /**
   * Optional candle cache for tests / future use.
   * Key format: `${symbol}|${windowId}`
   */
  preloadedCandlesByKey?: Record<string, OhlcvCandle[]>;
}

/** Stress-only across-windows input — constructed by costStress.ts only. */
export interface EvaluateCandidateAcrossWindowsForStressInput {
  candidate: StrategySearchCandidate;
  symbols: string[];
  timeframe: string;
  windows: readonly StrategySearchEvaluationWindowPlan[];
  balance: number;
  costConfig: StrategySearchStressRuntimeCostConfig;
  preloadedCandlesByKey?: Record<string, OhlcvCandle[]>;
}

function preloadedKey(symbol: string, windowId: string): string {
  return `${symbol}|${windowId}`;
}

function assertCandidate(
  candidate: StrategySearchCandidate,
): void {
  if (!candidate || typeof candidate !== "object") {
    throw new StrategySearchAdapterError(
      "INVALID_CANDIDATE",
      "candidate must be an object",
    );
  }
  if (
    typeof candidate.candidateId !== "string" ||
    candidate.candidateId.trim() === ""
  ) {
    throw new StrategySearchAdapterError(
      "INVALID_CANDIDATE",
      "candidateId must be a non-empty string",
      { candidateId: candidate.candidateId ?? null },
    );
  }
  if (
    candidate.candidateId === PROTECTED_STRATEGY_ID ||
    /SAFE_v44_i4060/i.test(candidate.candidateId)
  ) {
    throw new StrategySearchAdapterError(
      "INVALID_CANDIDATE",
      "candidateId must not reference the protected SAFE strategy",
      { candidateId: candidate.candidateId },
    );
  }
  if (
    typeof candidate.paramsHash !== "string" ||
    candidate.paramsHash.trim() === ""
  ) {
    throw new StrategySearchAdapterError(
      "INVALID_CANDIDATE",
      "paramsHash must be a non-empty string",
      { candidateId: candidate.candidateId },
    );
  }
  if (
    isLockedSafeHash(candidate.paramsHash) ||
    candidate.paramsHash === PROTECTED_HASH
  ) {
    throw new StrategySearchAdapterError(
      "PROTECTED_HASH_COLLISION",
      "candidate paramsHash collides with protected SAFE hash",
      { candidateId: candidate.candidateId },
    );
  }
  if (!candidate.params || typeof candidate.params !== "object") {
    throw new StrategySearchAdapterError(
      "INVALID_CANDIDATE",
      "candidate params must be an object",
      { candidateId: candidate.candidateId },
    );
  }
}

function assertWindow(
  window: StrategySearchEvaluationWindowPlan,
  candidateId: string,
  symbol?: string,
): void {
  if (!window || typeof window !== "object") {
    throw new StrategySearchAdapterError(
      "INVALID_WINDOW",
      "window must be an object",
      { candidateId, symbol: symbol ?? null },
    );
  }
  if (typeof window.id !== "string" || window.id.trim() === "") {
    throw new StrategySearchAdapterError(
      "INVALID_WINDOW",
      "window id must be a non-empty string",
      { candidateId, symbol: symbol ?? null, windowId: window.id ?? null },
    );
  }
  if (
    typeof window.requestedFrom !== "number" ||
    !Number.isFinite(window.requestedFrom) ||
    typeof window.requestedTo !== "number" ||
    !Number.isFinite(window.requestedTo) ||
    window.requestedFrom >= window.requestedTo
  ) {
    throw new StrategySearchAdapterError(
      "INVALID_WINDOW",
      "window requestedFrom must be strictly less than requestedTo",
      { candidateId, symbol: symbol ?? null, windowId: window.id },
    );
  }
}

function assertBaseCostRates(
  costConfig: {
    feeRate: number;
    slippageRate: number;
    fundingRate: number;
    applyFunding: boolean;
    applySpread: boolean;
    spreadRate: number;
  },
  candidateId: string,
): void {
  if (!costConfig || typeof costConfig !== "object") {
    throw new StrategySearchAdapterError(
      "INVALID_CANDIDATE",
      "costConfig must be an object",
      { candidateId },
    );
  }
  const numericKeys = [
    "feeRate",
    "slippageRate",
    "fundingRate",
    "spreadRate",
  ] as const;
  for (const key of numericKeys) {
    if (typeof costConfig[key] !== "number" || !Number.isFinite(costConfig[key])) {
      throw new StrategySearchAdapterError(
        "INVALID_CANDIDATE",
        `costConfig.${key} must be a finite number`,
        { candidateId },
      );
    }
  }
  if (typeof costConfig.applyFunding !== "boolean") {
    throw new StrategySearchAdapterError(
      "INVALID_CANDIDATE",
      "costConfig.applyFunding must be a boolean",
      { candidateId },
    );
  }
  if (typeof costConfig.applySpread !== "boolean") {
    throw new StrategySearchAdapterError(
      "INVALID_CANDIDATE",
      "costConfig.applySpread must be a boolean",
      { candidateId },
    );
  }
}

/**
 * Public base cost config: reject any cost_guard_k channel (legacy or override).
 * Engine costGuardK is never set on the public base path.
 */
function assertPublicBaseCostConfig(
  costConfig: StrategySearchBacktestCostConfig,
  candidateId: string,
): void {
  assertBaseCostRates(costConfig, candidateId);
  const raw = costConfig as StrategySearchBacktestCostConfig & {
    costGuardK?: number;
    costGuardKOverride?: number;
  };
  if (
    Object.prototype.hasOwnProperty.call(raw, "costGuardKOverride") &&
    raw.costGuardKOverride !== undefined
  ) {
    throw new StrategySearchAdapterError(
      "INVALID_CANDIDATE",
      "costGuardKOverride is not allowed on the public base evaluation cost config",
      { candidateId },
    );
  }
  if (
    Object.prototype.hasOwnProperty.call(raw, "costGuardK") &&
    raw.costGuardK !== undefined
  ) {
    throw new StrategySearchAdapterError(
      "INVALID_CANDIDATE",
      "costGuardK is not allowed on the public base evaluation cost config; use candidate.params.cost_guard_k",
      { candidateId },
    );
  }
}

function assertStressCostConfig(
  costConfig: StrategySearchStressRuntimeCostConfig,
  candidateId: string,
): void {
  assertBaseCostRates(costConfig, candidateId);
  const override = costConfig.costGuardKOverride;
  if (typeof override !== "number" || !Number.isFinite(override) || override <= 0) {
    throw new StrategySearchAdapterError(
      "INVALID_CANDIDATE",
      "stress costGuardKOverride must be a finite number > 0",
      { candidateId },
    );
  }
}

/**
 * Validate candle sequence integrity without mutating the input array/objects.
 */
function validateCandles(
  candles: OhlcvCandle[],
  window: StrategySearchEvaluationWindowPlan,
  symbol: string,
  candidateId: string,
): void {
  if (!Array.isArray(candles) || candles.length === 0) {
    throw new StrategySearchAdapterError(
      "EMPTY_CANDLES",
      "candle set is empty",
      { symbol, windowId: window.id, candidateId },
    );
  }

  const seen = new Set<number>();
  let prevOpenTime: number | null = null;

  for (let i = 0; i < candles.length; i += 1) {
    const openTime = candles[i]?.openTime;
    if (typeof openTime !== "number" || !Number.isFinite(openTime)) {
      throw new StrategySearchAdapterError(
        "INVALID_WINDOW",
        "candle openTime must be a finite number",
        { symbol, windowId: window.id, candidateId },
      );
    }
    if (openTime < window.requestedFrom || openTime > window.requestedTo) {
      throw new StrategySearchAdapterError(
        "CANDLE_OUTSIDE_WINDOW",
        "candle openTime is outside the requested window",
        { symbol, windowId: window.id, candidateId },
      );
    }
    if (seen.has(openTime)) {
      throw new StrategySearchAdapterError(
        "DUPLICATE_CANDLE_TIME",
        "duplicate candle openTime in sequence",
        { symbol, windowId: window.id, candidateId },
      );
    }
    seen.add(openTime);
    if (prevOpenTime != null && openTime < prevOpenTime) {
      throw new StrategySearchAdapterError(
        "UNSORTED_CANDLES",
        "candles are not chronologically sorted",
        { symbol, windowId: window.id, candidateId },
      );
    }
    prevOpenTime = openTime;
  }
}

/**
 * Map BacktestReport → StrategySearchWindowMetrics.
 * Every field names its exact BacktestReport source in an English comment.
 */
function mapReportMetrics(report: BacktestReport): StrategySearchWindowMetrics {
  return {
    // BacktestReport.startingBalance
    startingBalance: report.startingBalance,
    // BacktestReport.endingBalance
    endingBalance: report.endingBalance,
    // BacktestReport.totalReturn
    totalReturn: report.totalReturn,
    // BacktestReport.mdd
    mdd: report.mdd,
    // BacktestReport.tradeCount (exposed as trades for search metrics)
    trades: report.tradeCount,
    // BacktestReport.winRate
    winRate: report.winRate,
    // BacktestReport.profitFactor
    profitFactor: report.profitFactor,
    // BacktestReport.averageTrade (additive; optional on older consumers)
    averageTrade: report.averageTrade,
    // BacktestReport.monthlyReturns (shallow-copied rows)
    monthlyReturns: report.monthlyReturns.map((row) => ({
      month: row.month,
      returnPct: row.returnPct,
      trades: row.trades,
      mdd: row.mdd,
      fees: row.fees,
      ...(row.netPnlUsdt != null ? { netPnlUsdt: row.netPnlUsdt } : {}),
      ...(row.winRate != null ? { winRate: row.winRate } : {}),
      ...(row.totalCostUsdt != null ? { totalCostUsdt: row.totalCostUsdt } : {}),
      ...(row.labelKo != null ? { labelKo: row.labelKo } : {}),
    })),
    // BacktestReport.negativeMonths
    negativeMonths: report.negativeMonths,
    // BacktestReport.feeTotal
    feeTotal: report.feeTotal,
    // BacktestReport.slippageTotal
    slippageTotal: report.slippageTotal,
  };
}

async function resolveCandles(
  input: EvaluateCandidateWindowInput,
): Promise<OhlcvCandle[]> {
  if (input.preloadedCandles != null) {
    // Pass-through array reference for identity checks; do not mutate elements.
    return input.preloadedCandles;
  }

  const loaded = await loadHistoricalCandles({
    symbol: input.symbol,
    timeframe: input.timeframe,
    fromOpenTime: input.window.requestedFrom,
    toOpenTime: input.window.requestedTo,
  });
  return loaded.candles;
}

async function runCandidateWindowEvaluation(input: {
  candidate: StrategySearchCandidate;
  symbol: string;
  timeframe: string;
  window: StrategySearchEvaluationWindowPlan;
  balance: number;
  feeRate: number;
  slippageRate: number;
  fundingRate: number;
  applyFunding: boolean;
  applySpread: boolean;
  spreadRate: number;
  /** When set, stress-only engine costGuardK. When omitted, candidate.params.cost_guard_k. */
  stressCostGuardKOverride?: number;
  preloadedCandles?: OhlcvCandle[];
}): Promise<StrategySearchWindowEvaluation> {
  const started = Date.now();
  assertCandidate(input.candidate);
  assertWindow(input.window, input.candidate.candidateId, input.symbol);

  if (typeof input.symbol !== "string" || input.symbol.trim() === "") {
    throw new StrategySearchAdapterError(
      "INVALID_CANDIDATE",
      "symbol must be a non-empty string",
      {
        candidateId: input.candidate.candidateId,
        windowId: input.window.id,
      },
    );
  }
  if (typeof input.timeframe !== "string" || input.timeframe.trim() === "") {
    throw new StrategySearchAdapterError(
      "INVALID_CANDIDATE",
      "timeframe must be a non-empty string",
      {
        candidateId: input.candidate.candidateId,
        symbol: input.symbol,
        windowId: input.window.id,
      },
    );
  }
  if (typeof input.balance !== "number" || !Number.isFinite(input.balance) || input.balance <= 0) {
    throw new StrategySearchAdapterError(
      "INVALID_CANDIDATE",
      "balance must be a positive finite number",
      {
        candidateId: input.candidate.candidateId,
        symbol: input.symbol,
        windowId: input.window.id,
      },
    );
  }

  const candles = await resolveCandles({
    candidate: input.candidate,
    symbol: input.symbol,
    timeframe: input.timeframe,
    window: input.window,
    balance: input.balance,
    costConfig: {
      feeRate: input.feeRate,
      slippageRate: input.slippageRate,
      fundingRate: input.fundingRate,
      applyFunding: input.applyFunding,
      applySpread: input.applySpread,
      spreadRate: input.spreadRate,
    },
    preloadedCandles: input.preloadedCandles,
  });
  validateCandles(
    candles,
    input.window,
    input.symbol,
    input.candidate.candidateId,
  );

  const params = input.candidate.params as unknown as SafeV44Params;
  const requestedFromIso = new Date(input.window.requestedFrom).toISOString();
  const requestedToIso = new Date(input.window.requestedTo).toISOString();

  // Base: omit costGuardK → engine uses candidate.params.cost_guard_k.
  // Stress: pass stressCostGuardKOverride only (never candidate mutation).
  const engineInput: Parameters<typeof runSafeV44Backtest>[0] = {
    symbol: input.symbol,
    candles,
    params,
    paramsHash: input.candidate.paramsHash,
    strategyName: input.candidate.candidateId,
    strategyId: input.candidate.candidateId,
    sourceStatus: "user_created",
    timeframe: input.timeframe,
    balance: input.balance,
    feeRate: input.feeRate,
    slippageRate: input.slippageRate,
    fundingRate: input.fundingRate,
    applyFunding: input.applyFunding,
    applySpread: input.applySpread,
    spreadRate: input.spreadRate,
    dataSource: input.preloadedCandles != null ? "synthetic-test" : "binance",
    requestedFrom: requestedFromIso,
    requestedTo: requestedToIso,
  };
  if (input.stressCostGuardKOverride !== undefined) {
    engineInput.costGuardK = input.stressCostGuardKOverride;
  }

  let engineResult;
  try {
    engineResult = runSafeV44Backtest(engineInput);
  } catch (err) {
    if (err instanceof StrategySearchAdapterError) throw err;
    const message = err instanceof Error ? err.message : "backtest failed";
    throw new StrategySearchAdapterError("BACKTEST_FAILED", message, {
      symbol: input.symbol,
      windowId: input.window.id,
      candidateId: input.candidate.candidateId,
    });
  }

  const processed = engineResult.processedCandles;
  const durationMs = Date.now() - started;

  return {
    window: Object.freeze({ ...input.window }),
    symbol: input.symbol,
    timeframe: input.timeframe,
    candidateId: input.candidate.candidateId,
    paramsHash: input.candidate.paramsHash,
    metrics: mapReportMetrics(engineResult.report),
    tradeCount: engineResult.report.tradeCount,
    processedCandleCount: engineResult.report.processedCandleCount,
    firstProcessedOpenTime: processed[0]?.openTime ?? null,
    lastProcessedOpenTime: processed[processed.length - 1]?.openTime ?? null,
    durationMs,
  };
}

/**
 * Public base evaluation — never applies a runtime cost_guard_k override.
 */
export async function evaluateCandidateWindow(
  input: EvaluateCandidateWindowInput,
): Promise<StrategySearchWindowEvaluation> {
  assertPublicBaseCostConfig(input.costConfig, input.candidate.candidateId);
  return runCandidateWindowEvaluation({
    candidate: input.candidate,
    symbol: input.symbol,
    timeframe: input.timeframe,
    window: input.window,
    balance: input.balance,
    feeRate: input.costConfig.feeRate,
    slippageRate: input.costConfig.slippageRate,
    fundingRate: input.costConfig.fundingRate,
    applyFunding: input.costConfig.applyFunding,
    applySpread: input.costConfig.applySpread,
    spreadRate: input.costConfig.spreadRate,
    preloadedCandles: input.preloadedCandles,
  });
}

async function evaluateAcrossWindowsCore(input: {
  candidate: StrategySearchCandidate;
  symbols: string[];
  timeframe: string;
  windows: readonly StrategySearchEvaluationWindowPlan[];
  balance: number;
  feeRate: number;
  slippageRate: number;
  fundingRate: number;
  applyFunding: boolean;
  applySpread: boolean;
  spreadRate: number;
  stressCostGuardKOverride?: number;
  preloadedCandlesByKey?: Record<string, OhlcvCandle[]>;
  /** Stored on the result for serialization (base or stress rates). */
  resultCostConfig: StrategySearchBacktestCostConfig;
}): Promise<StrategySearchCandidateEvaluation> {
  const startedAtMs = Date.now();
  const startedAt = new Date(startedAtMs).toISOString();

  assertCandidate(input.candidate);

  if (!Array.isArray(input.symbols) || input.symbols.length === 0) {
    throw new StrategySearchAdapterError(
      "INVALID_CANDIDATE",
      "symbols must be a non-empty array",
      { candidateId: input.candidate.candidateId },
    );
  }
  if (!Array.isArray(input.windows) || input.windows.length === 0) {
    throw new StrategySearchAdapterError(
      "INVALID_WINDOW",
      "windows must be a non-empty array",
      { candidateId: input.candidate.candidateId },
    );
  }

  for (const window of input.windows) {
    assertWindow(window, input.candidate.candidateId);
  }

  const windows: StrategySearchWindowEvaluation[] = [];

  for (const symbol of input.symbols) {
    for (const window of input.windows) {
      const key = preloadedKey(symbol, window.id);
      const preloaded = input.preloadedCandlesByKey?.[key];
      const evaluation = await runCandidateWindowEvaluation({
        candidate: input.candidate,
        symbol,
        timeframe: input.timeframe,
        window,
        balance: input.balance,
        feeRate: input.feeRate,
        slippageRate: input.slippageRate,
        fundingRate: input.fundingRate,
        applyFunding: input.applyFunding,
        applySpread: input.applySpread,
        spreadRate: input.spreadRate,
        stressCostGuardKOverride: input.stressCostGuardKOverride,
        preloadedCandles: preloaded,
      });
      windows.push(evaluation);
    }
  }

  const completedAtMs = Date.now();
  return {
    candidateId: input.candidate.candidateId,
    paramsHash: input.candidate.paramsHash,
    symbols: input.symbols.slice(),
    timeframe: input.timeframe,
    windows,
    costConfig: { ...input.resultCostConfig },
    startedAt,
    completedAt: new Date(completedAtMs).toISOString(),
    durationMs: completedAtMs - startedAtMs,
  };
}

/**
 * Public base multi-window evaluation — no runtime cost_guard_k override.
 */
export async function evaluateCandidateAcrossWindows(
  input: EvaluateCandidateAcrossWindowsInput,
): Promise<StrategySearchCandidateEvaluation> {
  assertPublicBaseCostConfig(input.costConfig, input.candidate.candidateId);
  return evaluateAcrossWindowsCore({
    candidate: input.candidate,
    symbols: input.symbols,
    timeframe: input.timeframe,
    windows: input.windows,
    balance: input.balance,
    feeRate: input.costConfig.feeRate,
    slippageRate: input.costConfig.slippageRate,
    fundingRate: input.costConfig.fundingRate,
    applyFunding: input.costConfig.applyFunding,
    applySpread: input.costConfig.applySpread,
    spreadRate: input.costConfig.spreadRate,
    preloadedCandlesByKey: input.preloadedCandlesByKey,
    resultCostConfig: {
      feeRate: input.costConfig.feeRate,
      slippageRate: input.costConfig.slippageRate,
      fundingRate: input.costConfig.fundingRate,
      applyFunding: input.costConfig.applyFunding,
      applySpread: input.costConfig.applySpread,
      spreadRate: input.costConfig.spreadRate,
    },
  });
}

/**
 * Stress-only multi-window evaluation.
 * Sole production strategy-search entry that applies costGuardKOverride.
 * Exported for costStress.ts only — not re-exported from strategySearch/index.ts.
 */
export async function evaluateCandidateAcrossWindowsForStress(
  input: EvaluateCandidateAcrossWindowsForStressInput,
): Promise<StrategySearchCandidateEvaluation> {
  assertStressCostConfig(input.costConfig, input.candidate.candidateId);
  return evaluateAcrossWindowsCore({
    candidate: input.candidate,
    symbols: input.symbols,
    timeframe: input.timeframe,
    windows: input.windows,
    balance: input.balance,
    feeRate: input.costConfig.feeRate,
    slippageRate: input.costConfig.slippageRate,
    fundingRate: input.costConfig.fundingRate,
    applyFunding: input.costConfig.applyFunding,
    applySpread: input.costConfig.applySpread,
    spreadRate: input.costConfig.spreadRate,
    stressCostGuardKOverride: input.costConfig.costGuardKOverride,
    preloadedCandlesByKey: input.preloadedCandlesByKey,
    resultCostConfig: {
      feeRate: input.costConfig.feeRate,
      slippageRate: input.costConfig.slippageRate,
      fundingRate: input.costConfig.fundingRate,
      applyFunding: input.costConfig.applyFunding,
      applySpread: input.costConfig.applySpread,
      spreadRate: input.costConfig.spreadRate,
    },
  });
}
