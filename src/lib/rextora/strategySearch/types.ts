/**
 * Strategy-search domain types (Phase 1).
 * Serializable JSON only — no functions, Map, Set, Date, BigInt, or class instances.
 */

export type StrategySearchJobStatus =
  | "queued"
  | "running"
  | "pause_requested"
  | "paused"
  | "cancel_requested"
  | "cancelled"
  | "completed"
  | "failed";

export type StrategySearchGeneratorType = "random" | "local" | "genetic";

/** Generic serializable metric bag — formulas live in later phases. */
export type StrategySearchMetricRecord = Record<
  string,
  number | string | boolean | null
>;

export interface StrategySearchWindow {
  id: string;
  label: string;
  /** Inclusive open-time range start (ms), same convention as BacktestConfig.fromOpenTime / OhlcvCandle.openTime. */
  fromOpenTime: number;
  /** Inclusive open-time range end (ms), same convention as BacktestConfig.toOpenTime / OhlcvCandle.openTime. */
  toOpenTime: number;
  /** When omitted, window planning treats the window as required for PASS. */
  requiredForPass?: boolean;
}

/**
 * Deterministic evaluation window plan (epoch-ms open times).
 * Timestamp convention matches BacktestConfig.fromOpenTime/toOpenTime and OhlcvCandle.openTime.
 */
export interface StrategySearchEvaluationWindowPlan {
  id: string;
  label: string;
  requestedFrom: number;
  requestedTo: number;
  requiredForPass: boolean;
}

/**
 * Public base evaluation cost knobs (fee/slippage/funding/spread).
 *
 * Ownership of cost_guard_k:
 * - Base evaluation: candidate.params.cost_guard_k (engine input.costGuardK omitted)
 * - Cost stress: candidate.params.cost_guard_k * scenario.costGuardKMultiplier
 *   via StrategySearchStressRuntimeCostConfig.costGuardKOverride only
 *
 * This public type must not contain costGuardK or costGuardKOverride.
 */
export interface StrategySearchBacktestCostConfig {
  feeRate: number;
  slippageRate: number;
  fundingRate: number;
  applyFunding: boolean;
  applySpread: boolean;
  spreadRate: number;
}

/**
 * Stress-only runtime cost context.
 * Constructed exclusively by costStress.ts — not part of the public base cost API.
 * Not re-exported from strategySearch/index.ts.
 */
export interface StrategySearchStressRuntimeCostConfig {
  feeRate: number;
  slippageRate: number;
  fundingRate: number;
  applyFunding: boolean;
  applySpread: boolean;
  spreadRate: number;
  /** Runtime engine input.costGuardK for this stress scenario only. */
  costGuardKOverride: number;
}

/**
 * Metrics mapped from BacktestReport only — no invented formulas.
 * Field comments in the adapter name exact BacktestReport sources.
 */
export interface StrategySearchWindowMetrics {
  startingBalance: number;
  endingBalance: number;
  totalReturn: number;
  mdd: number;
  /** Mapped from BacktestReport.tradeCount */
  trades: number;
  winRate: number;
  profitFactor: number;
  /** Mapped from BacktestReport.averageTrade (additive). */
  averageTrade?: number;
  monthlyReturns: Array<{
    month: string;
    returnPct: number;
    trades: number;
    mdd: number;
    fees: number;
    netPnlUsdt?: number;
    winRate?: number;
    totalCostUsdt?: number;
    labelKo?: string;
  }>;
  negativeMonths: number;
  feeTotal: number;
  slippageTotal: number;
}

export interface StrategySearchWindowEvaluation {
  window: StrategySearchEvaluationWindowPlan;
  symbol: string;
  timeframe: string;
  candidateId: string;
  paramsHash: string;
  metrics: StrategySearchWindowMetrics;
  tradeCount: number;
  processedCandleCount: number;
  firstProcessedOpenTime: number | null;
  lastProcessedOpenTime: number | null;
  durationMs: number;
}

export interface StrategySearchCandidateEvaluation {
  candidateId: string;
  paramsHash: string;
  symbols: string[];
  timeframe: string;
  windows: StrategySearchWindowEvaluation[];
  costConfig: StrategySearchBacktestCostConfig;
  startedAt: string;
  completedAt: string;
  durationMs: number;
}

export interface StrategySearchPassCriteria {
  /** Opaque serializable criteria keys; evaluation in later phases. */
  minTradeCount?: number | null;
  maxMdd?: number | null;
  minTotalReturn?: number | null;
  maxNegativeMonths?: number | null;
  requireAllWindowsPass?: boolean;
  extra?: StrategySearchMetricRecord;
}

/** Job-store cost-stress stub (Phase 1). Scenario evaluation uses StrategySearchCostStressScenario. */
export interface StrategySearchCostStressConfig {
  enabled: boolean;
  multipliers: number[];
}

/** Job-store jitter stub (Phase 1). Robustness evaluation uses StrategySearchJitterConfig. */
export interface StrategySearchJobJitterConfig {
  enabled: boolean;
  samples: number;
  /** Relative amplitude in [0, 1] (legacy job-config field). */
  relativeAmplitude: number;
}

/** Explicit numeric thresholds; null/omitted disables that rule. */
export interface StrategySearchThresholdRule {
  minTotalReturn?: number | null;
  /**
   * Engine MDD is a non-positive fraction (peak-to-trough).
   * Pass when metrics.mdd >= maxMdd (e.g. maxMdd=-0.25 rejects mdd=-0.40).
   */
  maxMdd?: number | null;
  minTradeCount?: number | null;
  minWinRate?: number | null;
  minProfitFactor?: number | null;
  maxNegativeMonths?: number | null;
  minEndingBalance?: number | null;
  /** Every monthlyReturns[].returnPct must be >= this when set. */
  minMonthlyReturn?: number | null;
  /** Population stdev of monthlyReturns[].returnPct must be <= this when set. */
  maxMonthlyReturnDispersion?: number | null;
}

export interface StrategySearchPassPolicy {
  thresholds: StrategySearchThresholdRule;
}

export interface StrategySearchPassIssue {
  code: string;
  symbol: string | null;
  windowId: string | null;
  metric: string;
  actual: number | string | boolean | null;
  expected: number | string | boolean | null;
  message: string;
}

export interface StrategySearchPassResult {
  passed: boolean;
  requiredWindowCount: number;
  passedRequiredWindowCount: number;
  failedRequiredWindowCount: number;
  issues: StrategySearchPassIssue[];
}

export interface StrategySearchScoreWeights {
  returnWeight: number;
  mddWeight: number;
  profitFactorWeight: number;
  winRateWeight: number;
  tradeAdequacyWeight: number;
  negativeMonthWeight: number;
  consistencyWeight: number;
  /** Reference trade count for adequacy normalization; default 20. */
  tradeAdequacyReference?: number;
}

export interface StrategySearchScoreBreakdown {
  returnReward: number;
  mddPenalty: number;
  profitFactorReward: number;
  winRateReward: number;
  tradeAdequacy: number;
  negativeMonthPenalty: number;
  consistency: number;
  weightedReturn: number;
  weightedMdd: number;
  weightedProfitFactor: number;
  weightedWinRate: number;
  weightedTradeAdequacy: number;
  weightedNegativeMonth: number;
  weightedConsistency: number;
}

export interface StrategySearchScoreResult {
  finalScore: number;
  breakdown: StrategySearchScoreBreakdown;
  weights: StrategySearchScoreWeights;
  requiredWindowCount: number;
}

export interface StrategySearchCostStressScenario {
  id: string;
  label: string;
  requiredForPass: boolean;
  feeMultiplier: number;
  slippageMultiplier: number;
  fundingMultiplier: number;
  spreadMultiplier: number;
  costGuardKMultiplier: number;
}

export interface StrategySearchCostStressResult {
  scenario: StrategySearchCostStressScenario;
  costConfig: StrategySearchStressRuntimeCostConfig;
  evaluation: StrategySearchCandidateEvaluation;
  pass: StrategySearchPassResult;
  score: StrategySearchScoreResult;
  passed: boolean;
}

/** Phase 4 jitter robustness evaluation config. */
export interface StrategySearchJitterConfig {
  enabled: boolean;
  sampleCount: number;
  mutationScale: number;
  seed: number;
  minimumPassRate: number;
  maximumScoreDropRatio: number;
  parameterRanges: StrategySearchParameterRange[];
}

export interface StrategySearchJitterSampleSummary {
  windowCount: number;
  symbolCount: number;
  meanTotalReturn: number;
  meanMdd: number;
  durationMs: number;
}

export interface StrategySearchJitterSampleResult {
  sampleIndex: number;
  candidateId: string;
  paramsHash: string;
  pass: StrategySearchPassResult;
  score: StrategySearchScoreResult;
  scoreDropRatio: number;
  evaluationSummary: StrategySearchJitterSampleSummary;
}

export interface StrategySearchJitterResult {
  enabled: boolean;
  jitterPassed: boolean;
  sampleCount: number;
  passedSampleCount: number;
  failedSampleCount: number;
  passRate: number;
  averageScore: number | null;
  minimumScore: number | null;
  maximumScore: number | null;
  averageScoreDropRatio: number | null;
  maximumObservedScoreDropRatio: number | null;
  baseScore: number;
  samples: StrategySearchJitterSampleResult[];
}

export interface StrategySearchCompleteEvaluationConfig {
  passPolicy: StrategySearchPassPolicy;
  scoreWeights: StrategySearchScoreWeights;
  costStressScenarios: StrategySearchCostStressScenario[];
  jitterConfig: StrategySearchJitterConfig;
}

export interface StrategySearchCompleteCandidateEvaluation {
  candidateId: string;
  paramsHash: string;
  baseEvaluation: StrategySearchCandidateEvaluation;
  basePass: StrategySearchPassResult;
  baseScore: StrategySearchScoreResult;
  costStressResults: StrategySearchCostStressResult[];
  costStressPassed: boolean;
  jitterResult: StrategySearchJitterResult;
  finalPassed: boolean;
  startedAt: string;
  completedAt: string;
  durationMs: number;
}

/** JSON-safe parameter scalar used by search candidates. */
export type StrategySearchParameterValue = number | boolean | string;

export type StrategySearchParameterValueType =
  | "integer"
  | "float"
  | "boolean"
  | "enum";

export interface StrategySearchParameterRange {
  key: string;
  min: number | boolean | null;
  max: number | boolean | null;
  step?: number | null;
  valueType?: StrategySearchParameterValueType;
  enumValues?: StrategySearchParameterValue[];
  defaultValue?: StrategySearchParameterValue;
}

export interface StrategySearchCandidate {
  candidateId: string;
  jobId: string;
  iteration: number;
  generatorType: StrategySearchGeneratorType;
  parentCandidateIds: string[];
  /** Complete searchable + base parameter record (no undefined). */
  params: Record<string, StrategySearchParameterValue>;
  paramsHash: string;
  createdAt: string;
}

export interface StrategySearchValidationIssue {
  code: string;
  parameter: string | null;
  message: string;
  actualValue: StrategySearchParameterValue | null;
  expected: StrategySearchParameterValue | string | null;
}

export interface StrategySearchValidationResult {
  ok: boolean;
  issues: StrategySearchValidationIssue[];
}

export interface StrategySearchConfig {
  searchVersion: string;
  strategyTemplateId: string;
  symbols: string[];
  timeframe: string;
  dataVersion: string;
  seed: number;
  generatorType: StrategySearchGeneratorType;
  /** null = no predefined iteration limit */
  maxIterations: number | null;
  parameterRanges: StrategySearchParameterRange[];
  evaluationWindows: StrategySearchWindow[];
  passCriteria: StrategySearchPassCriteria;
  costStress: StrategySearchCostStressConfig;
  jitter: StrategySearchJobJitterConfig;
}

export interface StrategySearchBestCandidateReference {
  candidateId: string;
  iteration: number;
  paramsHash: string;
  score: number | null;
  passed: boolean;
}

export interface StrategySearchCheckpoint {
  completedIterations: number;
  nextIteration: number;
  /** Opaque PRNG / generator resume token (string or null). */
  randomState: string | null;
  bestCandidate: StrategySearchBestCandidateReference | null;
  bestPassedCandidate: StrategySearchBestCandidateReference | null;
  updatedAt: string;
}

export interface StrategySearchJob {
  id: string;
  status: StrategySearchJobStatus;
  config: StrategySearchConfig;
  checkpoint: StrategySearchCheckpoint;
  createdAt: string;
  updatedAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  failureMessage: string | null;
}

export interface StrategySearchFailureReason {
  code: string;
  message: string;
}

export interface StrategySearchTrial {
  jobId: string;
  iteration: number;
  candidateId: string;
  params: Record<string, number | boolean | string | null>;
  paramsHash: string;
  generatorType: StrategySearchGeneratorType;
  parentCandidateIds: string[];
  score: number | null;
  passed: boolean;
  failureReasons: StrategySearchFailureReason[];
  windowResults: StrategySearchMetricRecord[];
  costStressResults: StrategySearchMetricRecord[];
  jitterResults: StrategySearchMetricRecord[];
  durationMs: number;
  createdAt: string;
}

/** Index row synchronized with jobs on disk. */
export interface StrategySearchJobIndexEntry {
  id: string;
  status: StrategySearchJobStatus;
  strategyTemplateId: string;
  generatorType: StrategySearchGeneratorType;
  createdAt: string;
  updatedAt: string;
  completedIterations: number;
  finishedAt: string | null;
}

export interface StrategySearchJobIndex {
  version: 1;
  updatedAt: string;
  jobs: StrategySearchJobIndexEntry[];
}
