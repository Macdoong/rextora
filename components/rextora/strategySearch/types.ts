/**
 * Client-side types mirroring Phase 6 Strategy Search API responses.
 * Do not import server strategySearch modules into client bundles.
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

export type StrategySearchApiErrorCode =
  | "INVALID_REQUEST"
  | "JOB_NOT_FOUND"
  | "INVALID_STATE"
  | "JOB_ALREADY_RUNNING"
  | "CORRUPT_CHECKPOINT"
  | "UNSUPPORTED_CHECKPOINT_VERSION"
  | "PROTECTED_STRATEGY_VIOLATION"
  | "MISSING_EXECUTION_PROFILE"
  | "INTERNAL_EXECUTION_FAILURE";

export interface StrategySearchJobStatisticsView {
  generated: number;
  evaluated: number;
  passed: number;
  failed: number;
  stressPassed: number;
  jitterPassed: number;
  duplicates: number;
  errors: number;
  bestScore: number | null;
  averageScore: number | null;
  elapsedMs: number;
  remainingEstimateMs: number | null;
}

export type StrategySearchCompletionReason =
  | "QUALIFIED_TARGET_REACHED"
  | "MAX_CANDIDATE_BUDGET"
  | "MAX_RUNTIME"
  | "SEARCH_SPACE_EXHAUSTED"
  | "USER_CANCELLED"
  | "FATAL_ERROR"
  | "MAX_ITERATIONS"
  | "PAUSED"
  | null;

/** Operator plan sent on create so the server can orchestrate the campaign. */
export interface StrategySearchOperatorPlan {
  depthProfile: "fast" | "standard" | "deep";
  qualificationProfile: "conservative" | "balanced" | "aggressive" | "custom";
  qualifiedTarget: number;
  candidateBudget: number;
  stageBatchSize: number;
  maxRuntimeMs: number | null;
  minScore: number | null;
  searchName: string;
}

export interface StrategySearchJobSummary {
  id: string;
  status: StrategySearchJobStatus;
  createdAt: string;
  updatedAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  maxIterations: number | null;
  completedIterations: number;
  nextIteration: number;
  progressRatio: number | null;
  statistics: StrategySearchJobStatisticsView | null;
  bestScore: number | null;
  bestCandidateHash: string | null;
  bestPassedCandidateHash: string | null;
  failureMessage: string | null;
  executionActive: boolean;
  searchVersion: string;
  symbols: string[];
  timeframe: string;
  seed: number;
  searchSpaceExhausted?: boolean;
  searchName?: string;
  depthProfile?: string | null;
  qualificationProfile?: string | null;
  qualifiedTarget?: number | null;
  qualifiedCount?: number | null;
  uniqueEvaluatedCount?: number | null;
  duplicateSkippedCount?: number | null;
  exhaustedSpaceCount?: number | null;
  completionReason?: StrategySearchCompletionReason | string | null;
  candidateBudget?: number | null;
  promotionWarnings?: number | null;
  currentSearchFamily?: string | null;
  searchStageIndex?: number | null;
  searchStageTotal?: number | null;
  searchProgression?: Array<{
    id: string;
    labelKo: string;
    status: "pending" | "active" | "exhausted" | "completed" | string;
    budgetAllocated?: number | null;
    budgetSpent?: number | null;
    uniqueEvaluated?: number | null;
  }>;
  bestReturn?: number | null;
  bestMdd?: number | null;
  currentBestSummary?: string | null;
  remainingBudget?: number | null;
  candidateBudgetUsed?: number | null;
  overallProgressPct?: number | null;
  currentImprovementStage?: string | null;
  familyBudgetRemaining?: number | null;
}

export interface StrategySearchJobDetail extends StrategySearchJobSummary {
  config: {
    searchVersion: string;
    strategyTemplateId: string;
    symbols: string[];
    timeframe: string;
    dataVersion: string;
    seed: number;
    generatorType: "random" | "local" | "genetic";
    maxIterations: number | null;
    parameterRangeKeys: string[];
    evaluationWindowIds: string[];
  };
  checkpoint: {
    completedIterations: number;
    nextIteration: number;
    bestCandidate: StrategySearchBestRef | null;
    bestPassedCandidate: StrategySearchBestRef | null;
    updatedAt: string;
    hasRunnerPayload: boolean;
  };
}

export interface StrategySearchBestRef {
  candidateId: string;
  iteration: number;
  paramsHash: string;
  score: number | null;
  passed: boolean;
}

export interface StrategySearchTrialRow {
  iteration: number;
  candidateId: string;
  paramsHash: string;
  score: number | null;
  passed: boolean;
  generatorType: string;
  durationMs: number;
  failureReasonCodes: string[];
  /** Additive operator enrichment from trials API — never fabricated client-side. */
  readableName?: string | null;
  strategyFamilyLabelKo?: string | null;
  totalReturn?: number | null;
  mdd?: number | null;
  trades?: number | null;
  winRate?: number | null;
  sharpe?: number | null;
  profitFactor?: number | null;
  stressPassed?: boolean | null;
  jitterPassed?: boolean | null;
  jitterEnabled?: boolean | null;
  params?: Record<string, unknown> | null;
  registeredStrategyId?: string | null;
  registrationState?:
    | "not_registered"
    | "registered"
    | "duplicate"
    | null;
}

export interface StrategySearchTrialsPage {
  jobId: string;
  total: number;
  limit: number;
  offset: number;
  trials: StrategySearchTrialRow[];
}

export interface StrategySearchTrialDetail {
  jobId: string;
  iteration: number;
  candidateId: string;
  params: Record<string, number | boolean | string | null>;
  paramsHash: string;
  score: number | null;
  passed: boolean;
  failureReasons: Array<{ code: string; message: string }>;
  windowResults: Array<Record<string, unknown>>;
  costStressResults: Array<Record<string, unknown>>;
  jitterResults: Array<Record<string, unknown>>;
  durationMs: number;
  createdAt: string;
  generatorType: string;
  parentCandidateIds: string[];
}

export interface StrategySearchBestResult {
  bestCandidate: StrategySearchBestRef | null;
  bestPassedCandidate: StrategySearchBestRef | null;
  bestTrial: StrategySearchTrialDetail | null;
  bestPassedTrial: StrategySearchTrialDetail | null;
  gateNotes: {
    bestCandidatePassedFinal: boolean | null;
    bestPassedCandidatePassedFinal: boolean | null;
    finalPassMeaning: string;
  };
}

export interface StrategySearchApiEnvelope<T> {
  ok: boolean;
  data: T | null;
  meta: {
    source: string;
    cached: boolean;
    durationMs: number;
    updatedAt: string | null;
  };
  error?: string;
  code?: string;
  details?: string[];
}

export interface StrategySearchCreateJobBody {
  searchVersion: string;
  strategyTemplateId: string;
  symbols: string[];
  timeframe: string;
  dataVersion: string;
  seed: number;
  generatorType: "random" | "local" | "genetic";
  maxIterations: number | null;
  parameterRanges: Array<{
    key: string;
    min: number | boolean | null;
    max: number | boolean | null;
    step?: number | null;
    valueType?: "integer" | "float" | "boolean" | "enum";
  }>;
  evaluationWindows: Array<{
    id: string;
    label: string;
    fromOpenTime: number;
    toOpenTime: number;
    requiredForPass?: boolean;
  }>;
  balance: number;
  baseCostConfig: {
    feeRate: number;
    slippageRate: number;
    fundingRate: number;
    applyFunding: boolean;
    applySpread: boolean;
    spreadRate: number;
  };
  passPolicy: {
    thresholds: {
      minTotalReturn?: number | null;
      maxMdd?: number | null;
      minTradeCount?: number | null;
      minWinRate?: number | null;
    };
  };
  scoreWeights: {
    returnWeight: number;
    mddWeight: number;
    profitFactorWeight: number;
    winRateWeight: number;
    tradeAdequacyWeight: number;
    negativeMonthWeight: number;
    consistencyWeight: number;
  };
  costStressScenarios: Array<{
    id: string;
    label: string;
    requiredForPass: boolean;
    feeMultiplier: number;
    slippageMultiplier: number;
    fundingMultiplier: number;
    spreadMultiplier: number;
    costGuardKMultiplier: number;
  }>;
  jitterConfig: {
    enabled: boolean;
    sampleCount: number;
    mutationScale: number;
    seed: number;
    minimumPassRate: number;
    maximumScoreDropRatio: number;
    parameterRanges: Array<{
      key: string;
      min: number | boolean | null;
      max: number | boolean | null;
      step?: number | null;
      valueType?: "integer" | "float" | "boolean" | "enum";
    }>;
  };
  dataRef: {
    source: "binance_historical";
    availableFrom: number;
    availableTo: number;
  };
  /** When set, server owns multi-space orchestration / completion. */
  operatorPlan?: StrategySearchOperatorPlan;
}

export class StrategySearchClientError extends Error {
  readonly code: string;
  readonly details: string[];
  readonly httpStatus: number;

  constructor(
    code: string,
    message: string,
    httpStatus: number,
    details: string[] = [],
  ) {
    super(message);
    this.name = "StrategySearchClientError";
    this.code = code;
    this.httpStatus = httpStatus;
    this.details = details;
  }
}
