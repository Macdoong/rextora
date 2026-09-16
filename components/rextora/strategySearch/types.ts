/**
 * Client-side types mirroring Phase 6 Strategy Search API responses.
 * Do not import server strategySearch modules into client bundles.
 */

export type StrategySearchJobStatus =
  | "queued"
  | "running"
  | "interrupted"
  | "pause_requested"
  | "paused"
  | "cancel_requested"
  | "cancelling"
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
  | "DEADLINE_REACHED"
  | "HARD_SAFETY_LIMIT"
  | "SEARCH_SPACE_EXHAUSTED"
  | "USER_CANCELLED"
  | "FATAL_ERROR"
  | "MAX_ITERATIONS"
  | "PAUSED"
  | null;

export type PatternFamilyId =
  | "order_block"
  | "fvg"
  | "trendline"
  | "support_resistance"
  | "supply_demand";

export interface PatternCombinationBlockConfig {
  id: string;
  family: PatternFamilyId;
  role:
    | "entry_zone"
    | "trend_filter"
    | "confirmation"
    | "invalidation"
    | "stop_placement"
    | "take_profit"
    | "exit_filter";
  order: number;
  required?: boolean;
  weight?: number;
  priority?: number;
  params: Record<string, number | string | boolean | null>;
}

export interface PatternCombinationSpecInput {
  version: 1;
  templateId:
    | "single"
    | "confluence"
    | "entry_confirmation"
    | "ordered_sequence"
    | "breakout_retest"
    | "zone_confluence"
    | "invalidation_composite";
  operator: "and" | "or" | "sequence" | "weighted_score" | "priority";
  failurePolicy: "any" | "all" | "majority";
  invalidationMode: "any" | "all" | "majority";
  weightedThreshold?: number;
  blocks: PatternCombinationBlockConfig[];
}

/** Operator plan sent on create so the server can orchestrate the campaign. */
export interface StrategySearchOperatorPlan {
  depthProfile: "fast" | "standard" | "deep";
  qualificationProfile: "conservative" | "balanced" | "aggressive" | "custom";
  qualifiedTarget: number;
  /** When true, stop at qualified target. Default omitted/false = run to deadline. */
  stopWhenQualifiedTarget?: boolean;
  candidateBudget: number;
  stageBatchSize: number;
  maxRuntimeMs: number | null;
  minScore: number | null;
  searchName: string;
  /** Calculation-error rate warning threshold (0–1). */
  errorWarningRate?: number | null;
  /** Auto-pause when error rate exceeds this (0–1). */
  errorAutoPauseRate?: number | null;
  /** Block repeated invalid failure fingerprints after N hits. */
  repeatedSignatureThreshold?: number | null;
  /** Optional override of SafeV44 search space ids (null = depth default). */
  selectedSpaceIds?: string[] | null;
  /**
   * Canonical pattern-family selection mode.
   * automatic → selectedSpaceIds ignored (null); system picks spaces.
   * manual → selectedSpaceIds persisted and applied.
   */
  patternSelectionMode?: "automatic" | "manual" | null;
  leverageMode?: "automatic" | "fixed" | "range" | "disabled" | null;
  leverageFixed?: number | null;
  leverageMin?: number | null;
  leverageMax?: number | null;
  adaptiveLeverageEnabled?: boolean | null;
  patternConfigLevel?: "automatic" | "basic" | "expert" | null;
  patternDirection?: "both" | "long" | "short" | null;
  patternRetestMode?: "required" | "optional" | "disabled" | null;
  patternConfirmStrength?: "standard" | "strict" | null;
  patternConfirmClose?: "required" | "disabled" | null;
  patternConfirmationMode?:
    | "none"
    | "single_close"
    | "consecutive_closes"
    | "threshold_count"
    | null;
  patternConfirmationCandleCount?: number | null;
  patternConfirmationWindow?: number | null;
  patternExpiryBars?: number | null;
  patternRiskStyle?: "conservative" | "balanced" | "aggressive" | null;
  patternStrength?: "loose" | "standard" | "strict" | null;
  patternSrSensitivity?: "tight" | "standard" | "loose" | null;
  patternCombinationTemplate?:
    | "single"
    | "confluence"
    | "entry_confirmation"
    | "ordered_sequence"
    | "breakout_retest"
    | "zone_confluence"
    | "invalidation_composite"
    | null;
  patternCombinationOperator?:
    | "and"
    | "or"
    | "sequence"
    | "weighted_score"
    | "priority"
    | null;
  patternCombinationInvalidationMode?: "any" | "all" | "majority" | null;
  patternCombinationFailurePolicy?: "any" | "all" | "majority" | null;
  patternCombinationWeightedThreshold?: number | null;
  patternCombinationFamilies?: string[] | null;
  patternCombinationSpec?: PatternCombinationSpecInput | null;
}

export interface StrategySearchJobSummary {
  id: string;
  status: StrategySearchJobStatus;
  createdAt: string;
  updatedAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  elapsedMs?: number | null;
  remainingMs?: number | null;
  maxRuntimeMs?: number | null;
  campaignStartedAtMs?: number | null;
  pausedAtMs?: number | null;
  accumulatedPauseMs?: number | null;
  interruptedAtMs?: number | null;
  accumulatedInterruptionMs?: number | null;
  recoveryBlocker?: string | null;
  resumedAtMs?: number | null;
  expectedCompletionAtMs?: number | null;
  maxIterations: number | null;
  completedIterations: number;
  nextIteration: number;
  progressRatio: number | null;
  statistics: StrategySearchJobStatisticsView | null;
  bestScore: number | null;
  bestCandidateHash: string | null;
  bestPassedCandidateHash: string | null;
  /** Authoritative group ranking. Scalars above are compatibility-only. */
  rankingGroups?: Array<{
    rankingCompatibilityGroup:
      | "safe_execution_price_v1"
      | "event_sequence_execution_price_v1"
      | "event_sequence_ledger_v0";
    engineCostModel:
      | "safe_execution_price_v1"
      | "event_sequence_execution_price_v1"
      | "event_sequence_ledger_v0";
    rankingEligible: true;
    bestCandidate: StrategySearchBestRef | null;
    bestPassedCandidate: StrategySearchBestRef | null;
    topCandidates: Array<{
      iteration: number;
      paramsHash: string;
      score: number | null;
      passed: boolean;
      researchEvaluationHash?: string | null;
      engineCostModel?: string | null;
      rankingCompatibilityGroup?: string | null;
      rankingEligible?: boolean;
      promotionEligible?: boolean;
      provenanceStatus?:
        | "stamped"
        | "reconstructed"
        | "legacy_unclassified"
        | null;
    }>;
  }>;
  unknownLegacy?: {
    rankingCompatibilityGroup: "unknown_legacy";
    rankingEligible: false;
    promotionEligible: false;
    provenanceStatus: "legacy_unclassified";
    count: number;
  };
  failureMessage: string | null;
  terminationReason?: string | null;
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
  /** Derived live error-rate warning (not persisted). */
  errorRate?: number;
  errorWarningActive?: boolean;
  errorWarningRate?: number;
  currentSearchFamily?: string | null;
  currentCombinationLabel?: string | null;
  patternCombinationFamilies?: string[] | null;
  patternCombinationOperator?: string | null;
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
  /** Live Research Top-10 (persisted; polled with job detail). */
  liveTop10?: {
    updatedAt: string;
    finalizedAt: string | null;
    phase: "live" | "final";
    entries: Array<{
      rank: number;
      previousRank?: number | null;
      displayAlias: string;
      readableName: string;
      strategyFamily?: string;
      strategyHash: string;
      netReturn: number | null;
      maxDrawdown: number | null;
      tradeCount: number | null;
      profitFactor: number | null;
      winRate?: number | null;
      sharpe?: number | null;
      patternStack?: string;
      confidence?: string;
      risk?: string;
      miniSeries?: number[] | null;
      costStatus: string;
      robustnessStatus: string;
      sampleConfidence: string;
      leverageLabel?: string;
      rankReason?: string;
      rankChange: string;
      rankChangeShort: string;
      movementReasonKo?: string;
      roleBadges: string[];
      eligibilityStatus?: string;
      recommendable?: boolean;
      registrationState?: string;
      overfittingRisk?: string;
      score?: number | null;
      previousNetReturn?: number | null;
      previousMaxDrawdown?: number | null;
      previousTradeCount?: number | null;
      previousScore?: number | null;
    }>;
    finalEntries?: Array<{
      rank: number;
      displayAlias: string;
      readableName: string;
      strategyHash: string;
      netReturn: number | null;
      maxDrawdown: number | null;
      tradeCount: number | null;
      profitFactor: number | null;
      winRate?: number | null;
      sharpe?: number | null;
      patternStack?: string;
      confidence?: string;
      risk?: string;
      miniSeries?: number[] | null;
      costStatus: string;
      robustnessStatus: string;
      sampleConfidence: string;
      leverageLabel?: string;
      rankReason?: string;
      rankChange: string;
      rankChangeShort: string;
      movementReasonKo?: string;
      roleBadges: string[];
      overfittingRisk?: string;
      score?: number | null;
      previousNetReturn?: number | null;
      previousMaxDrawdown?: number | null;
      previousTradeCount?: number | null;
      previousScore?: number | null;
    }>;
    finalVsLive?: Array<{
      strategyHash: string;
      liveRank: number | null;
      finalRank: number | null;
      exclusionReasonKo: string | null;
    }>;
  } | null;
  remainingBudget?: number | null;
  candidateBudgetUsed?: number | null;
  overallProgressPct?: number | null;
  currentImprovementStage?: string | null;
  familyBudgetRemaining?: number | null;
  /** Applied search-space mutation from plan (only when mutations were applied). */
  lastMutation?: {
    appliedAt: string;
    weaknessCategories: string[];
    mutationCount: number;
    firstChange: {
      key: string;
      field: "min" | "max" | "step" | "defaultValue";
      from: number;
      to: number;
      reason: string;
    } | null;
  } | null;
  counters?: {
    evaluated: number;
    qualified: number;
    rejected: number;
    evaluationErrors: number;
    invariantOk: boolean;
    equation: string;
  } | null;
  initialCandidateBudget?: number | null;
  resourceSafetyCeiling?: number | null;
  outcomePresentation?:
    | "queued"
    | "running"
    | "interrupted"
    | "completed"
    | "user_stopped"
    | "cancelled"
    | "partial_completed"
    | "failed"
    | null;
  candidatesPreserved?: boolean;
  preservedCandidateCount?: number | null;
  retryable?: boolean;
  failedStage?: string | null;
  lastSuccessfulStage?: string | null;
  terminationDetail?: string | null;
  symbolSelection?: {
    mode: "recommended" | "manual";
    selectedSymbol: string;
    reasonKo: string;
    liquidityStatus: string;
    volatilityStatus: string;
    dataAvailability: string;
    excludedAlternatives: Array<{ symbol: string; reasonKo: string }>;
  } | null;
  currentBestRisk?: {
    netReturn: number | null;
    maxDrawdown: number | null;
    tradeCount: number | null;
    totalCost: number | null;
    profitFactor: number | null;
    robustnessStatus: string;
    overfittingRisk: string;
    eligibilityStatus: string;
    recommendable: boolean;
  } | null;
  appliedSearchSummary?: {
    titleKo: string;
    subtitleKo: string;
    sections: Array<{
      id: string;
      titleKo: string;
      rows: Array<{ labelKo: string; valueKo: string }>;
    }>;
    developerPayload?: Record<string, unknown>;
  } | null;
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
  researchEvaluationHash?: string | null;
  engineCostModel?: string | null;
  rankingCompatibilityGroup?: string | null;
  rankingEligible?: boolean;
  promotionEligible?: boolean;
  provenanceStatus?:
    | "stamped"
    | "reconstructed"
    | "legacy_unclassified"
    | null;
  registeredStrategyId?: string | null;
  registrationState?:
    | "not_registered"
    | "registered"
    | "duplicate"
    | "registration_failed"
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
  rankingGroups?: StrategySearchJobSummary["rankingGroups"];
  unknownLegacy?: StrategySearchJobSummary["unknownLegacy"];
  rankingAuthority?: "rankingGroups" | "legacy_scalar";
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
  /** Symbol selection mode for persisted selection evidence. */
  marketMode?: "recommended" | "manual";
}

/** Client mirror of GET …/results-summary (no server imports). */
export interface ResearchResultCountsView {
  evaluatedStrategies: number;
  qualifiedStrategies: number;
  uniqueQualifiedStrategies: number;
  clusteredRepresentatives: number;
  duplicateOrNearDuplicateMembers: number;
  promotedStrategies: number;
  registeredStrategies: number;
  recommendationEligibleStrategies: number;
  backtestRecommendedStrategies: number;
  /** Persistent Top-10 shortlist size (≤10). */
  top10Saved: number;
  /** Qualification stage funnel counts (evidence-based). */
  stageBasicQualified: number;
  stageStabilityPassed: number;
  stageCostPassed: number;
  stageSampleOk: number;
  stageOverfitOk: number;
  stageFinalRecommendable: number;
}

export type Top10RankChangeView =
  | "신규 진입"
  | "순위 상승"
  | "순위 하락"
  | "순위 유지"
  | "TOP 10 제외";

export interface Top10RankChangeEntryView {
  strategyHash: string;
  change: Top10RankChangeView | string;
  previousRank: number | null;
  currentRank: number | null;
}

export interface ResearchOutcomeViewClient {
  id: string;
  titleKo: string;
  detailKo: string;
  usable: boolean;
  isPresentedAsCompleted: boolean;
}

export interface BestReturnViewClient {
  labelKo: string;
  netReturn: number | null;
  iteration: number | null;
  paramsHash: string | null;
  readableName: string | null;
  explanationKo: string;
}

export interface ResearchResultCardView {
  iteration: number;
  candidateId: string;
  paramsHash: string;
  readableName: string;
  displayAlias: string;
  strategyFamily: string;
  symbol: string;
  timeframe: string;
  sourceResearchJobId: string;
  netReturn: number | null;
  maxDrawdown: number | null;
  tradeCount: number | null;
  profitFactor: number | null;
  winRate?: number | null;
  sharpe?: number | null;
  patternStack?: string;
  confidence?: string;
  risk?: string;
  miniSeries?: number[] | null;
  totalCost: number | null;
  costStatus: string;
  sampleConfidence: string;
  sampleConfidenceDetail: string;
  score: number | null;
  stressPassed: boolean | null;
  jitterPassed: boolean | null;
  robustnessStatus: string;
  overfittingRisk: string;
  eligibilityStatus: string;
  recommendable: boolean;
  finalRecommendable: boolean;
  roles: string[];
  registrationState: "미등록" | "등록됨" | "중복" | "등록 실패";
  registeredStrategyId: string | null;
  clusterId: string;
  isRepresentative: boolean;
  memberCount: number;
  strongestPoint: string;
  primaryWeakness: string;
  recommendationReason: string;
  leverageLabel?: string;
  whyNotRank1?: string;
  vsPreviousRankNote?: string;
}

export interface ResearchClusterView {
  clusterId: string;
  representativeIteration: number;
  representativeParamsHash: string;
  memberCount: number;
  memberIterations: number[];
  similarityReason: string;
  family: string;
}

export interface ResearchResultsSummaryView {
  jobId: string;
  searchName: string;
  status: string;
  symbol: string;
  timeframe: string;
  outcome: ResearchOutcomeViewClient;
  counts: ResearchResultCountsView;
  equation: string;
  liveSearchBest: BestReturnViewClient;
  finalizedBest: BestReturnViewClient;
  topProfit: ResearchResultCardView | null;
  topStable: ResearchResultCardView | null;
  topRecommend: ResearchResultCardView | null;
  rankingGroups?: StrategySearchJobSummary["rankingGroups"];
  unknownLegacy?: StrategySearchJobSummary["unknownLegacy"];
  backtestRecommendations: ResearchResultCardView[];
  /** Persistent Top-10 shortlist (canonical Results focus). */
  top10: ResearchResultCardView[];
  top10RankChanges: Top10RankChangeEntryView[];
  clusters: ResearchClusterView[];
  /** Full representatives — secondary “원본 후보” explorer only. */
  representatives: ResearchResultCardView[];
  selectionSummary: {
    whyTopSelected: string[];
    whyExcluded: string[];
    overfittingNote: string;
    costSensitivityNote: string;
    drawdownRiskNote: string;
    tradeConfidenceNote: string;
    nextActions: string[];
  };
  provenanceNote: string;
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
