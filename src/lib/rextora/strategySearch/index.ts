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
export {
  StrategySearchPersistenceError,
  projectSearchJobIndexEntry,
} from "./jobStore";

export {
  createSearchJob,
  deleteSearchJob,
  getSearchJob,
  getSearchTrial,
  listSearchJobs,
  listSearchTrials,
  markSearchJobCancelled,
  markSearchJobCancelling,
  markSearchJobCompleted,
  markSearchJobFailed,
  markSearchJobInterrupted,
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
  transitionJobToInterrupted,
  transitionJobToPauseRequested,
  transitionJobCooperativelyPaused,
  transitionJobToPaused,
  transitionJobToQueued,
  transitionJobToRunning,
} from "./jobState";

export type {
  StrategySearchCanonicalCounters,
  StrategySearchJobStatistics,
} from "./jobStatistics";
export {
  ERROR_RATE_MIN_EVALUATED,
  assertCanonicalCounterInvariant,
  createEmptyJobStatistics,
  deriveCanonicalCounters,
  deriveErrorRateWarning,
  isBetterScore,
  recordDuplicate,
  recordElapsed,
  recordError,
  recordEvaluation,
  recordGenerated,
} from "./jobStatistics";
export type { StrategySearchErrorRateWarning } from "./jobStatistics";

export {
  buildRepeatedGenerationErrorFingerprint,
  classifyEngineError,
  isInvalidParameterRangesError,
  isRecoverableGenerationError,
  isResearchMarketDataError,
} from "./engineErrorClassification";
export type { StrategySearchEngineErrorClass } from "./engineErrorClassification";

export {
  buildSymbolSelectionEvidence,
  SELECTABLE_SYMBOLS,
} from "./symbolSelection";

export {
  areStructurallyNearDuplicates,
  buildResearchResultsSummary,
  buildStructureFingerprint,
  parseSourceResearchJobId,
  parseSourceTrialIteration,
  promoteTopResearchResults,
  refreshLiveResearchTop10,
  registerTrialForBacktest,
  validateResearchResultsIntegrity,
} from "./researchResultsSummary";
export type {
  BestReturnView,
  ResearchCluster,
  ResearchResultCard,
  ResearchResultCounts,
  ResearchResultsSummary,
} from "./researchResultsSummary";

export {
  resolveResearchOutcome,
} from "./researchOutcome";
export type {
  ResearchOutcomeId,
  ResearchOutcomeInput,
  ResearchOutcomeView,
} from "./researchOutcome";

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
  NEW_JOB_EVENT_SEQUENCE_COST_MODEL,
  STRATEGY_SEARCH_EXECUTION_PROFILE_VERSION,
  getJobExecutionProfile,
  resolveProfileEventSequenceCostModel,
  saveJobExecutionProfile,
} from "./jobExecutionProfile";

export type { SearchJobExecutionDeps } from "./jobExecutionRegistry";
export {
  StrategySearchExecutionRegistryError,
  isNormalSearchCompletionReason,
  isSearchJobExecutionActive,
  isSearchJobExecutionWorkerActive,
  listActiveSearchJobExecutions,
  planHasNormalTerminalCompletionReason,
  resetSearchJobExecutionRegistryForTests,
  setDefaultSearchJobExecutionDepsForTests,
  startSearchJobExecution,
  waitForSearchJobExecution,
} from "./jobExecutionRegistry";

export type {
  JobExecutionOwnershipAuditRecord,
  JobExecutionOwnershipRecord,
  StaleJobExecutionOwnershipRecovery,
} from "./jobExecutionOwnership";
export {
  acquireJobExecutionOwnership,
  getJobExecutionOwnership,
  getProcessExecutionOwnerId,
  isJobExecutionOwnedOnDisk,
  listJobExecutionOwnershipAudits,
  recoverStaleJobExecutionOwnership,
  recoverStaleJobExecutionOwnershipDetailed,
  releaseJobExecutionOwnership,
  resetJobExecutionOwnershipForTests,
} from "./jobExecutionOwnership";

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
  restoreStrategySearchJobApi,
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
  SAFETY_BUDGET_CEILING,
  activeElapsedMs,
  computeExpectedCompletionAtMs,
  createEmptySearchPlan,
  getSearchPlan,
  markPlanPaused,
  markPlanInterrupted,
  markPlanInterruptionResumed,
  markPlanResumed,
  saveSearchPlan,
  syncPlanTimingFields,
  replenishDeadlineBudget,
} from "./searchPlan";

export type {
  InterruptedRecoveryBlocker,
  InterruptedRecoveryInspection,
} from "./processInterruption";
export {
  completeInterruptedJobAtDeadline,
  inspectInterruptedRecovery,
  interruptRunningJobFromStaleOwnership,
  prepareInterruptedJobForRecovery,
  resolveProcessInterruptionBoundaryMs,
  rollbackPreparedInterruptedRecovery,
} from "./processInterruption";

export type {
  CanonicalHistoricalInventoryRow,
  HistoricalBoundaryConfidence,
  HistoricalBudgetVerdict,
  HistoricalCheckpointVerdict,
  HistoricalProcessLossApplyResult,
  HistoricalProcessLossCandidate,
  HistoricalProcessLossClassification,
  HistoricalProcessLossDryRunResult,
} from "./historicalProcessLossRecovery";
export {
  canonicalHistoricalInventoryDigest,
  recoverHistoricalProcessLossOrphans,
} from "./historicalProcessLossRecovery";

export {
  APPROVED_P2_E2B_RECONCILE_IDS,
  INDEX_PROJECTION_FIELDS,
  assessJobCatalogAuthority,
  buildIndexReconciliationPlan,
  projectIndexInPlace,
} from "./indexReconciliationPlan";
export type {
  IndexReconciliationPlanResult,
  IndexReconciliationTarget,
} from "./indexReconciliationPlan";
export {
  loadRawIndexReconciliationSnapshot,
  runIndexReconciliationDryRun,
} from "./indexReconciliationDryRun";
export {
  applyApprovedIndexReconciliation,
  EXPECTED_POST_APPLY_INDEX_SHA256,
  EXPECTED_PRE_APPLY_INDEX_SHA256,
} from "./indexReconciliationApply";
export {
  APPROVED_P2_F2B_IDS,
  CANONICAL_COMPLETION_WRITE_SET,
  FINISHED_AT_CONTRACT,
  expectedOutcomeAfterProposal,
  expectedPendingAfterProposal,
  loadHistoricalDeadlineDryRun,
  projectHistoricalDeadlineCompletion,
  reconstructHistoricalFinishedAt,
  writeHistoricalDeadlineDryRunArtifacts,
} from "./historicalDeadlineCompletionDryRun";
export {
  APPROVED_HISTORICAL_FINISHED_AT,
  EXPECTED_F2B_MANIFEST_SHA256,
  EXPECTED_POST_APPLY_INDEX_SHA256 as EXPECTED_F2C_POST_APPLY_INDEX_SHA256,
  EXPECTED_PRE_APPLY_INDEX_SHA256 as EXPECTED_F2C_PRE_APPLY_INDEX_SHA256,
  applyApprovedHistoricalDeadlineCompletion,
  evaluateHistoricalDeadlineApplyGates,
} from "./historicalDeadlineCompletionApply";
export {
  classifyCheckpoint,
  classifyInterruptedJob,
  classifyQueuedJob,
  detectDashboardContradiction,
  loadResidualLifecycleInventory,
  writeResidualLifecycleInventoryArtifacts,
} from "./residualLifecycleInventory";
export {
  planOrphanStartupSelection,
  STARTUP_CANDIDATE_ORDER,
} from "./startupResumePolicyDiagnosis";

export {
  buildReadableStrategyIdentity,
  summarizeSafeV44Rules,
} from "./readableStrategyName";

export {
  performanceSummaryFromWindowResults,
  formatMetricOrUnavailable,
} from "./performanceSummary";

export {
  nextQualified,
  runOrchestratedSearchJob,
  retryFailedPromotions,
} from "./searchOrchestrator";

export type {
  StrategyWeaknessCategory,
  StrategyWeaknessFinding,
  StrategySearchAdjustmentPlan,
  WeaknessAnalysisResult,
  CandidateMetricsSnapshot,
} from "./weaknessAnalysis";
export {
  analyzeCandidateWeaknesses,
  snapshotFromTrial,
} from "./weaknessAnalysis";

export type { SearchSpaceMutationRecord } from "./searchSpaceMutation";
export { applySearchSpaceMutation } from "./searchSpaceMutation";

export type { ResearchGeneration, ResearchGenerationFile } from "./researchGeneration";
export {
  listResearchGenerations,
  appendResearchGeneration,
  createResearchGenerationId,
} from "./researchGeneration";

export type { PaperFeedback } from "./paperFeedback";
export { buildPaperFeedback } from "./paperFeedback";

export {
  recoverOrphanSearchJobs,
  inspectOrphanSearchJobs,
} from "./orphanJobRecovery";
export type {
  OrphanJobRecoveryResult,
  OrphanJobInspectionResult,
} from "./orphanJobRecovery";

export {
  CANCEL_ACK_TIMEOUT_MS,
  requestCancelWithFinalization,
  finalizeCancellation,
  recoverStaleCancelRequestedJobs,
} from "./cancellationLifecycle";
export type {
  CancellationFinalizeResult,
  CancellationFinalizeBlockReason,
} from "./cancellationLifecycle";

export {
  recoverMissingJobRecord,
  recoverOrphanIndexEntries,
} from "./jobRecordRecovery";
export type { JobRecordRecoveryResult } from "./jobRecordRecovery";

export { appendRecoveryAudit, listRecoveryAudits } from "./recoveryAudit";
export type { StrategySearchRecoveryAuditRecord } from "./recoveryAudit";

export {
  buildCalculationErrorBreakdown,
  calculationErrorRate,
} from "./calculationErrorBreakdown";
export type {
  CalculationErrorBreakdown,
  CalculationErrorCategory,
} from "./calculationErrorBreakdown";

export {
  selectResearchTop10,
  buildAndPersistResearchTop10,
  getResearchTop10,
  findLatestSameScopeTop10,
  buildResearchScopeKey,
  finalizeResearchTop10,
  rankChangeLabelShort,
  movementReasonForChange,
  RESEARCH_TOP10_LIMIT,
} from "./researchTop10";
export type {
  ResearchTop10Snapshot,
  ResearchTop10Entry,
  ResearchTop10FinalDiff,
  Top10RankChange,
} from "./researchTop10";

export {
  applyLeverageModeToParams,
  describeLeverageFromParams,
  filterRangesForLeverageMode,
  leverageModeMutatesLev,
  resolveLeverageMode,
} from "./leverageMode";
export type { LeverageModePolicy } from "./leverageMode";

export {
  SEARCHABLE_STRATEGY_FAMILIES,
  PATTERN_SEARCH_SUPPORT,
  isSearchableSpaceId,
  defaultSelectedSpaceIds,
  patternCapabilityMatrixRows,
} from "./patternSupportMatrix";
export type {
  PatternSupportLevel,
  PatternSupportEntry,
} from "./patternSupportMatrix";

export { buildPersistedSearchSummary } from "./persistedSearchSummary";
export type {
  AppliedSearchSummaryView,
  AppliedSearchSummarySection,
  LeverageModeId,
} from "./persistedSearchSummary";

export {
  previewStrategyDeletion,
  detachResearchProvenance,
  deleteStrategyWithSafety,
  classificationLabelKo as strategyDeletionClassificationLabelKo,
} from "./strategyDeletionSafety";
export type {
  StrategyDeletionClass,
  StrategyDeletionImpact,
} from "./strategyDeletionSafety";

export { isProvenanceDetached } from "./researchProvenance";

export {
  PATTERN_COMBINATION_VERSION,
  PATTERN_COMBINATION_TEMPLATES,
  buildCombinationSpec,
  buildCombinedEventSequence,
  validatePatternCombination,
  combinationParamsForCandidate,
  combinationLabelKo,
  resolveCombinationFromParams,
  defaultFamiliesForTemplate,
  mutateCombinationParams,
  normalizePatternCombinationSpec,
  isPatternCombinationTemplateId,
  isPatternCombinationOperator,
} from "./patternCombination";
export type {
  PatternCombinationSpec,
  PatternCombinationBlock,
  PatternCombinationOperator,
  PatternCombinationTemplateId,
  PatternBlockRole,
  PatternInvalidationMode,
} from "./patternCombination";

export {
  resolvePatternSelectionMode,
  selectedSpaceIdsForSelectionMode,
  patternSelectionModeLabelKo,
} from "./patternSelectionMode";
export type { PatternSelectionMode } from "./patternSelectionMode";

export {
  PATTERN_PARAMETER_CATALOG,
  catalogDefaultsForPatternFamily,
  catalogForPatternFamily,
  catalogRangesForPatternFamily,
} from "./patternParameterCatalog";

export {
  PATTERN_SEARCH_SPACE_IDS,
  SUPPLY_DEMAND_BASE_PARAMS,
  SUPPLY_DEMAND_SEARCH_SPACE,
  baseParamsForPatternSpaceId,
  rangesForPatternSpaceId,
  readSupplyDemandParams,
  supplyDemandSearchRanges,
} from "./patternSearchSpaces";
export type {
  PatternSearchFamilyId,
  SupplyDemandSearchParams,
} from "./patternSearchSpaces";
export type {
  PatternParameterCatalogEntry,
  PatternParameterType,
  PatternParameterValue,
} from "./patternParameterCatalog";

export {
  previewResearchJobDeletion,
  writeDeletionAudit,
  executeResearchJobDeletion,
  ResearchJobDeletionError,
} from "./deletionSafety";
export type { DeletionImpactPreview, DeletionClass } from "./deletionSafety";

export {
  archiveResearchJob,
  restoreArchivedResearchJob,
  isJobArchived,
  listArchivedResearchJobs,
  listVisibleResearchJobs,
} from "./jobArchive";

export {
  getRawTrialRetentionPolicy,
  setRawTrialRetentionPolicy,
  previewRawTrialCleanup,
  executeRawTrialCleanup,
  DEFAULT_RAW_TRIAL_RETENTION,
} from "./rawTrialRetention";

export {
  listStrategySearchConfigs,
  saveStrategySearchConfig,
  loadStrategySearchConfig,
  deleteStrategySearchConfig,
  renameStrategySearchConfig,
  duplicateStrategySearchConfig,
  setDefaultStrategySearchConfig,
} from "./searchConfigStore";

export type {
  FollowUpSource,
  FollowUpResearchRequest,
  FollowUpResearchResult,
} from "./followUpResearch";
export {
  buildFollowUpResearch,
  FollowUpResearchError,
} from "./followUpResearch";

export type { ValidatedCreateSearchJob } from "./jobApiValidation";
export {
  StrategySearchApiValidationError,
  validateCreateSearchJobBody,
} from "./jobApiValidation";
