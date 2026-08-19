/**
 * Agent V2 Reasoning Engine public exports.
 */

export type {
  ReasoningArtifact,
  ReasoningInput,
  ReasoningEngineResult,
  ReasoningValidationResult,
  ToolPlanItem,
  PlanDiff,
  ShadowComparisonRecord,
} from "./reasoningTypes";

export {
  getReasoningConfig,
  isReasoningActive,
  isReasoningPrimary,
  type ReasoningMode,
  type ReasoningConfig,
} from "./reasoningConfig";

export {
  runReasoningEngine,
  runShadowReasoningCompare,
  buildReasoningInput,
  defaultWorkspace,
} from "./reasoningEngine";

export {
  parseReasoningJson,
  extractJsonFromText,
  newReasoningId,
} from "./reasoningSchema";

export {
  validateReasoningArtifact,
  validateFactRefs,
  validateToolPlanArguments,
  buildFactRefIndex,
} from "./reasoningValidator";

export {
  evaluateReasoningPolicy,
  isSafetyBlockIntent,
} from "./reasoningPolicy";

export {
  buildFallbackReasoning,
  fallbackPlanFromReasoning,
} from "./reasoningFallback";

export {
  buildNewSearchPlan,
  buildModifiedSearchPlan,
  buildCancelReplacePlan,
  buildSearchCreatePlanSteps,
  diffSearchDrafts,
  pickDifferentPatternCombo,
  detectTimeframeChange,
  computeSearchPlanHash,
} from "./toolPlanBuilder";

export {
  buildResponseFromReasoning,
  reasoningToProposedAction,
} from "./reasoningResponseBuilder";

export { executeApprovedToolPlan } from "./reasoningExecution";

export {
  compareShadowReasoning,
  writeShadowAudit,
  readShadowAuditLines,
  summarizeShadowAudit,
  runShadowPromptMatrix,
  getShadowAuditDir,
} from "./reasoningAudit";

export { callReasoningProvider } from "./reasoningProvider";

export {
  readReasoningLifecycleAudit,
  writeReasoningLifecycleAudit,
  type ReasoningLifecycleAuditRecord,
} from "./reasoningLifecycleAudit";
