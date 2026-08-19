/**
 * Agent V2 Reasoning Engine types — structured planning artifact.
 */

import type { AgentIntentType, AgentTurn, FactItem } from "../../types";
import type { AgentGoal } from "../../goalDetector";
import type { AgentLifecycleContext } from "../../types";
import type { ConversationEntityMemory } from "../../conversationContext";
import type { PipelineLifecycleStage } from "../../lifecycleStage";
import type { AgentPlanDraft } from "../../planDrafts";
import type { ProposedAction } from "../../proposedAction";
import type { AgentWorkspaceSnapshot } from "../session/sessionTypes";
import type { ReasoningTaskProfile } from "./reasoningTaskProfile";

export type ReasoningRiskLevel = "low" | "medium" | "high" | "blocked";

export type ToolPlanStepStatus =
  | "pending"
  | "ready"
  | "running"
  | "succeeded"
  | "failed"
  | "skipped"
  | "blocked";

export type ToolPlanOnFailure = "abort" | "continue" | "retry_once";

export interface ToolPlanItem {
  stepId: string;
  toolId: string;
  arguments: Record<string, unknown>;
  dependsOn: string[];
  purpose: string;
  expectedResult: string;
  requiresApproval: boolean;
  executionOrder: number;
  onFailure: ToolPlanOnFailure;
  status: ToolPlanStepStatus;
}

export interface ReasoningArtifact {
  reasoningId: string;
  sessionId: string | null;
  goal: string;
  userIntent: string;
  confidence: number;
  currentStateSummary: string;
  verifiedFactRefs: string[];
  assumptions: string[];
  missingInformation: string[];
  decision: string;
  decisionReason: string;
  recommendedAction: string;
  toolPlan: ToolPlanItem[];
  requiresApproval: boolean;
  riskLevel: ReasoningRiskLevel;
  blockedReason: string | null;
  fallbackUsed: boolean;
  provider: string;
  model: string;
  createdAt: string;
  /** Conversational Korean prose for the operator (validated). */
  conclusionKo?: string;
  explanationKo?: string;
  /** Canonical hash for plan idempotency / approval invalidation. */
  requestHash?: string | null;
  planId?: string | null;
}

export interface ReasoningInput {
  query: string;
  sessionId: string | null;
  intentType: AgentIntentType;
  goal: AgentGoal | null;
  facts: FactItem[];
  history: AgentTurn[];
  context: AgentLifecycleContext | null;
  entities: ConversationEntityMemory;
  workspace: AgentWorkspaceSnapshot | null;
  lifecycleStage: PipelineLifecycleStage | null;
  availableToolIds: string[];
  toolMetadata: Array<{
    id: string;
    description: string;
    requiresApproval: boolean;
    executionMode: "read" | "write";
  }>;
  pendingPlan: AgentPlanDraft | null;
  pendingProposedAction: ProposedAction | null;
  policiesKo: string[];
  /** Bounded task profile for provider token/timeout policy. */
  taskProfile?: ReasoningTaskProfile;
}

export interface ReasoningValidationResult {
  ok: boolean;
  artifact: ReasoningArtifact | null;
  issues: string[];
  blocked: boolean;
  blockedReason: string | null;
}

export interface ReasoningEngineResult {
  artifact: ReasoningArtifact;
  validation: ReasoningValidationResult;
  usedFallback: boolean;
  providerErrorKo: string | null;
  providerLatencyMs: number | null;
}

export interface PlanDiffField {
  key: string;
  labelKo: string;
  before: string;
  after: string;
}

export interface PlanDiff {
  planId: string;
  previousHash: string;
  nextHash: string;
  fields: PlanDiffField[];
  summaryKo: string;
}

export interface ShadowComparisonRecord {
  at: string;
  query: string;
  v1Intent: string;
  v1Goal: string | null;
  v2Goal: string;
  v1RequiresApproval: boolean;
  v2RequiresApproval: boolean;
  v1Tools: string[];
  v2Tools: string[];
  safetyAgreement: boolean;
  v2Blocked: boolean;
  v2FallbackUsed: boolean;
  v2Provider: string | null;
  v2Model: string | null;
  v2RecommendationKo: string | null;
  differences: string[];
}
