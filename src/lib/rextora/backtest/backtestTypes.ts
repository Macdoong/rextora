import type { BacktestTrade } from "./backtestEngine";

export interface MonthlyReturnRow {
  month: string;
  returnPct: number;
  trades: number;
  mdd: number;
  fees: number;
  /** Additive calendar fields */
  netPnlUsdt?: number;
  winRate?: number;
  totalCostUsdt?: number;
  labelKo?: string;
}

export type BacktestDataMode = "binance" | "synthetic-test";

export interface BacktestCostBreakdown {
  fees: number;
  slippage: number;
  funding: number;
  spread: number;
  totalTradingCost: number;
  /** Additive explicit-denominator fields (USDT / % of initial capital) */
  feeCostUsdt?: number;
  feeCostPctOfInitialCapital?: number;
  slippageCostUsdt?: number;
  slippageCostPctOfInitialCapital?: number;
  spreadCostUsdt?: number;
  spreadCostPctOfInitialCapital?: number;
  fundingCostUsdt?: number;
  fundingCostPctOfInitialCapital?: number;
  totalCostUsdt?: number;
  totalCostPctOfInitialCapital?: number;
  grossPnLBeforeCosts?: number;
  netPnLAfterCosts?: number;
  /** Explains legacy `fees` etc. are sum of per-trade rate fractions */
  rateSumNoteKo?: string;
}

export interface BacktestZeroTradeDiagnostics {
  loadedCandleCount: number;
  evaluatedCandleCount: number;
  warmUpCandleCount: number;
  longSignalCandidateCount: number;
  shortSignalCandidateCount: number;
  rejectionReasons: Record<string, number>;
  explanationKo: string;
}

export interface BacktestReport {
  strategyName: string;
  strategyHash: string;
  strategyId: string;
  sourceStatus: string;
  symbol: string;
  symbols: string[];
  timeframe: string;
  fromDate: string | null;
  toDate: string | null;
  /** ISO requested range start */
  requestedFrom: string | null;
  /** ISO requested range end */
  requestedTo: string | null;
  actualFirstCandleTime: string | null;
  actualLastCandleTime: string | null;
  candleCount: number;
  processedCandleCount: number;
  dataSource: "binance" | "synthetic-test";
  totalReturn: number;
  mdd: number;
  tradeCount: number;
  winRate: number;
  averageTrade: number;
  profitFactor: number;
  maxConsecutiveLosses: number;
  feeImpact: number;
  feeTotal: number;
  slippageTotal: number;
  fundingTotal: number;
  spreadTotal: number;
  costs: BacktestCostBreakdown;
  monthlyReturns: MonthlyReturnRow[];
  negativeMonths: number;
  startingBalance: number;
  endingBalance: number;
  costStress?: Array<{
    multiplier: number;
    totalReturn: number;
    mdd: number;
    tradeCount: number;
    negativeMonths: number;
  }>;
  zeroTradeDiagnostics?: BacktestZeroTradeDiagnostics | null;
  /** Derived trade event traces for chart explanation UI. */
  tradeEventTraces?: import("./tradeEventTrace").TradeEventTrace[];
  /** Rejected setups from event-sequence engine (optional; legacy runs omit). */
  rejectedSetups?: import("./patternOverlayAvailability").PersistedRejectedSetup[];
  validation: {
    paramsHashVerified: boolean;
    feesApplied: boolean;
    slippageApplied: boolean;
    fundingApplied: boolean;
    spreadApplied: boolean;
    noRealOrders: true;
  };
}

export interface BacktestConfig {
  strategyId: string;
  symbols: string[];
  timeframe: string;
  fromOpenTime?: number;
  toOpenTime?: number;
  balance: number;
  feeRate: number;
  slippageRate: number;
  fundingRate: number;
  applyFunding: boolean;
  applySpread: boolean;
  spreadRate: number;
  costStressMultipliers: number[];
  costGuardK: number;
  baseBalPct?: number;
  maxConcurrent?: number;
  /**
   * Production / UI must use "binance".
   * "synthetic-test" is only for unit tests and explicit fixtures.
   */
  dataMode?: BacktestDataMode;
}

/** Distinguishes search-time evaluation summaries from user-executed runs. */
export type BacktestRunSourceType = "research_evaluation" | "user_backtest_run";

export type BacktestRunStatus =
  | "queued"
  | "running"
  | "completed"
  | "failed"
  | "cancelled";

export interface SavedBacktestResult {
  id: string;
  createdAt: string;
  config: BacktestConfig;
  report: BacktestReport;
  trades: BacktestTrade[];
  /** Alias of id for lifecycle handoff clarity. Always unique per execution. */
  backtestRunId?: string;
  strategyId?: string;
  strategyHash?: string;
  sourceType?: BacktestRunSourceType;
  status?: BacktestRunStatus;
  requestedAt?: string;
  startedAt?: string;
  completedAt?: string | null;
  errorCode?: string | null;
  errorDetail?: string | null;
  engineVersion?: string;
  dataVersion?: string | null;
  /**
   * Deterministic hash of strategy + period + costs + key result metrics.
   * Identical executions share this hash but never share backtestRunId.
   */
  resultHash?: string;
  /** True when an earlier immutable result matched resultHash. */
  deduplicatedResult?: boolean;
  /** Prior execution id whose resultHash matched (if deduplicated). */
  reusedResultFromRunId?: string | null;
  /**
   * Canonical artifact id for the immutable result payload.
   * For first occurrence equals this run's id; later identical runs may
   * reference the first.
   */
  resultArtifactId?: string | null;
  /**
   * When set, chart sidecar is loaded from this run id (content-identical
   * reuse). Own path data/rextora/backtests/<id>.chart.json is preferred
   * when present.
   */
  chartEvidenceRef?: string | null;
  /**
   * When true, OHLCV + equity/drawdown evidence lives in
   * data/rextora/backtests/<id>.chart.json (schema v1), or via chartEvidenceRef.
   * Absent/false on legacy runs → best-effort remote hydrate.
   */
  hasChartEvidence?: boolean;
  chartEvidenceSchemaVersion?: number;
}
