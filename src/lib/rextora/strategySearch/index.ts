export type {
  StrategySearchBacktestCostConfig,
  StrategySearchBestCandidateReference,
  StrategySearchCandidate,
  StrategySearchCandidateEvaluation,
  StrategySearchCheckpoint,
  StrategySearchCompleteCandidateEvaluation,
  StrategySearchCompleteEvaluationConfig,
  StrategySearchConfig,
  StrategySearchCostStressConfig,
  StrategySearchCostStressResult,
  StrategySearchCostStressScenario,
  StrategySearchEvaluationWindowPlan,
  StrategySearchFailureReason,
  StrategySearchGeneratorType,
  StrategySearchJob,
  StrategySearchJobIndex,
  StrategySearchJobIndexEntry,
  StrategySearchJobJitterConfig,
  StrategySearchJobStatus,
  StrategySearchJitterConfig,
  StrategySearchJitterResult,
  StrategySearchJitterSampleResult,
  StrategySearchJitterSampleSummary,
  StrategySearchMetricRecord,
  StrategySearchParameterRange,
  StrategySearchParameterValue,
  StrategySearchParameterValueType,
  StrategySearchPassCriteria,
  StrategySearchPassIssue,
  StrategySearchPassPolicy,
  StrategySearchPassResult,
  StrategySearchScoreBreakdown,
  StrategySearchScoreResult,
  StrategySearchScoreWeights,
  StrategySearchThresholdRule,
  StrategySearchTrial,
  StrategySearchValidationIssue,
  StrategySearchValidationResult,
  StrategySearchWindow,
  StrategySearchWindowEvaluation,
  StrategySearchWindowMetrics,
} from "./types";

export {
  assertStrategySearchIteration,
  assertStrategySearchJobId,
  createStrategySearchCandidateId,
  createStrategySearchJobId,
  isValidStrategySearchJobId,
} from "./searchId";

export type { StrategySearchStoreOptions } from "./jobStore";
export { StrategySearchPersistenceError } from "./jobStore";

export {
  createSearchJob,
  deleteSearchJob,
  getSearchJob,
  getSearchTrial,
  listSearchJobs,
  listSearchTrials,
  markSearchJobCancelled,
  markSearchJobCompleted,
  markSearchJobFailed,
  markSearchJobPaused,
  markSearchJobRunning,
  requestCancelSearchJob,
  requestPauseSearchJob,
  resumeSearchJob,
  saveSearchJob,
  saveSearchTrial,
  updateSearchCheckpoint,
} from "./jobStore";

export {
  STRATEGY_SEARCH_HISTORY_RETENTION_DEFAULT,
  STRATEGY_SEARCH_HISTORY_RETENTION_MAX,
  STRATEGY_SEARCH_HISTORY_RETENTION_MIN,
  STRATEGY_SEARCH_HISTORY_VISIBLE_DEFAULT,
  classifyJobForRetention,
  clampHistoryRetentionLimit,
  compareJobsNewestFirst,
  deleteSearchJobIfAllowed,
  descriptionReferencesSearchJob,
  enforceHistoryRetention,
  getManualDeleteBlockReason,
  manualDeleteBlockMessageKo,
  normalizeJobStatusForRetention,
  runHistoryRetentionAfterCreate,
} from "./historyRetention";
export type {
  HistoryRetentionResult,
  ManualDeleteBlockReason,
  RetentionEligibility,
  RetentionProtectReason,
} from "./historyRetention";

export type { SeededRandom, SeededRandomState } from "./random";
export { createSeededRandom, restoreSeededRandom } from "./random";

export {
  getDefaultSafeV44SearchSpace,
  normalizeCandidateParams,
  validateCandidateParams,
  validateSearchParameterRanges,
} from "./paramSpace";

export type {
  GenerateLocalCandidateInput,
  GenerateRandomCandidateInput,
  GenerateUniqueCandidateInput,
} from "./candidateGenerator";
export {
  StrategySearchGenerationError,
  generateLocalCandidate,
  generateRandomCandidate,
  generateUniqueCandidate,
} from "./candidateGenerator";

export type { BuildEvaluationWindowPlansInput } from "./windowPlanner";
export {
  StrategySearchWindowPlannerError,
  buildEvaluationWindowPlans,
  validateEvaluationWindowPlans,
} from "./windowPlanner";

export type {
  EvaluateCandidateAcrossWindowsInput,
  EvaluateCandidateWindowInput,
  StrategySearchAdapterErrorCode,
} from "./backtestAdapter";
export {
  StrategySearchAdapterError,
  evaluateCandidateAcrossWindows,
  evaluateCandidateWindow,
} from "./backtestAdapter";
// Stress-only evaluateCandidateAcrossWindowsForStress is intentionally NOT
// re-exported — call sites must go through evaluateCostStress / costStress.ts.

export type {
  CalculateCandidateScoreInput,
  EvaluateCandidatePassInput,
} from "./evaluationPolicy";
export {
  StrategySearchEvaluationPolicyError,
  assertHasRequiredEvaluationWindows,
  calculateCandidateScore,
  evaluateCandidatePass,
  populationStdev,
  validatePassPolicy,
  validateScoreWeights,
} from "./evaluationPolicy";

export type { EvaluateCostStressInput } from "./costStress";
export {
  StrategySearchCostStressError,
  buildCostStressConfig,
  evaluateCostStress,
  validateCostStressScenarios,
} from "./costStress";

export type {
  EvaluateCandidateJitterInput,
  GenerateJitterCandidateInput,
} from "./jitterEvaluator";
export {
  StrategySearchJitterError,
  calculateScoreDropRatio,
  evaluateCandidateJitter,
  generateJitterCandidate,
  jitterSampleIteration,
  validateJitterConfig,
} from "./jitterEvaluator";

export type { EvaluateCompleteCandidateInput } from "./candidateEvaluator";
export {
  StrategySearchCompleteEvaluationError,
  evaluateCompleteCandidate,
} from "./candidateEvaluator";

export type { StrategySearchJobStateLabel } from "./jobState";
export {
  StrategySearchJobStateError,
  assertJobStateTransition,
  canTransitionJobState,
  isRunnableJobStatus,
  isTerminalJobStatus,
  toJobStateLabel,
  transitionJobToCancelRequested,
  transitionJobToCancelled,
  transitionJobToCompleted,
  transitionJobToFailed,
  transitionJobToPauseRequested,
  transitionJobToPaused,
  transitionJobToQueued,
  transitionJobToRunning,
} from "./jobState";

export type { StrategySearchJobStatistics } from "./jobStatistics";
export {
  createEmptyJobStatistics,
  isBetterScore,
  recordDuplicate,
  recordElapsed,
  recordError,
  recordEvaluation,
  recordGenerated,
} from "./jobStatistics";

export type { StrategySearchRunnerCheckpointPayload } from "./jobCheckpoint";
export {
  RUNNER_CHECKPOINT_VERSION,
  StrategySearchCheckpointError,
  buildPersistedCheckpoint,
  createInitialRunnerPayload,
  decodeRunnerCheckpointPayload,
  encodeRunnerCheckpointPayload,
  readRunnerPayloadFromCheckpoint,
} from "./jobCheckpoint";

export type { RunSearchJobInput, RunSearchJobResult } from "./jobRunner";
export {
  StrategySearchJobRunnerError,
  requestSearchJobCancel,
  requestSearchJobPause,
  resumeSearchJobForRun,
  runSearchJob,
} from "./jobRunner";

export type {
  StrategySearchDataReference,
  StrategySearchExecutionProfile,
} from "./jobExecutionProfile";
export {
  STRATEGY_SEARCH_EXECUTION_PROFILE_VERSION,
  getJobExecutionProfile,
  saveJobExecutionProfile,
} from "./jobExecutionProfile";

export type { SearchJobExecutionDeps } from "./jobExecutionRegistry";
export {
  StrategySearchExecutionRegistryError,
  isSearchJobExecutionActive,
  listActiveSearchJobExecutions,
  resetSearchJobExecutionRegistryForTests,
  setDefaultSearchJobExecutionDepsForTests,
  startSearchJobExecution,
  waitForSearchJobExecution,
} from "./jobExecutionRegistry";

export type {
  StrategySearchApiErrorCode,
  StrategySearchBestResultResponse,
  StrategySearchJobDetail,
  StrategySearchJobSummary,
} from "./jobApiService";
export {
  StrategySearchApiError,
  cancelStrategySearchJobApi,
  createStrategySearchJobApi,
  deleteStrategySearchJobApi,
  getStrategySearchBestApi,
  getStrategySearchJobApi,
  listStrategySearchJobsApi,
  listStrategySearchTrialsApi,
  pauseStrategySearchJobApi,
  readProtectedSafeSnapshot,
  resumeStrategySearchJobApi,
  startStrategySearchJobApi,
  setStrategySearchApiStoreOptionsForTests,
} from "./jobApiService";

export type {
  PromoteSearchCandidateInput,
  PromoteSearchCandidateResult,
} from "./promoteFromSearch";
export {
  promoteAllPassedTrialsFromJob,
  promoteSelectedTrialsFromJob,
  promoteSearchCandidateToStrategy,
} from "./promoteFromSearch";

export type {
  SearchDepthProfileId,
  QualificationProfileId,
} from "./operatorProfiles";
export {
  SEARCH_DEPTH_PROFILES,
  QUALIFICATION_PROFILES,
  OPERATOR_SUPPORTED_SYMBOLS,
  OPERATOR_SUPPORTED_TIMEFRAMES,
  getSearchDepthProfile,
  getQualificationProfile,
  resolveSpacesForDepth,
} from "./operatorProfiles";

export type {
  StrategySearchCompletionReason,
  StrategySearchPlan,
} from "./searchPlan";
export {
  createEmptySearchPlan,
  getSearchPlan,
  saveSearchPlan,
} from "./searchPlan";

export {
  buildReadableStrategyIdentity,
  summarizeSafeV44Rules,
} from "./readableStrategyName";

export {
  performanceSummaryFromWindowResults,
  formatMetricOrUnavailable,
} from "./performanceSummary";

export { runOrchestratedSearchJob, retryFailedPromotions } from "./searchOrchestrator";

export type { ValidatedCreateSearchJob } from "./jobApiValidation";
export {
  StrategySearchApiValidationError,
  validateCreateSearchJobBody,
} from "./jobApiValidation";
