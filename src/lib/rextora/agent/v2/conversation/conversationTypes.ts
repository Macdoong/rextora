import type { AgentIntentType, AgentTurn } from "../../types";
import type { ConversationEntityMemory } from "../../conversationContext";
import type { PipelineLifecycleStage } from "../../lifecycleStage";
import type { ProposedAction } from "../../proposedAction";

export type ConversationRouteMode =
  | "DIRECT_ANSWER"
  | "READ_AND_ANSWER"
  | "PLAN_AND_APPROVE"
  | "APPROVAL_CONTROL"
  | "CLARIFY_REFERENCE"
  | "SAFE_REFUSAL";

export type ConversationTopic =
  | "rextora_product"
  | "feature_search"
  | "feature_results"
  | "feature_backtest"
  | "feature_paper"
  | "feature_live"
  | "concept_mdd"
  | "concept_overfitting"
  | "concept_costs"
  | "concept_order_block"
  | "concept_fvg"
  | "strategy_explanation"
  | "strategy_risk"
  | "workspace_status"
  | "search_status"
  | "backtest_analysis"
  | "paper_status"
  | "approval_status"
  | "approval_control"
  | "workflow_action"
  | "safety"
  | "casual"
  | "unknown";

export type ReferenceSource =
  | "explicit_turn"
  | "conversation_topic"
  | "selected_ui_object"
  | "recent_assistant_turn"
  | "workspace_object"
  | "workflow_state"
  | "long_term_memory"
  | "unresolved";

export interface ResolvedConversationReference {
  kind:
    | "product"
    | "feature"
    | "strategy"
    | "search_job"
    | "backtest"
    | "paper_session"
    | "approval"
    | "assistant_statement"
    | "unknown";
  labelKo: string;
  id: string | null;
  source: ReferenceSource;
  confidence: number;
}

export interface SelectedUiObject {
  kind: ResolvedConversationReference["kind"];
  labelKo: string;
  id?: string | null;
  descriptionKo?: string | null;
}

export interface ConversationContextView {
  currentQuestion: string;
  currentTopic: ConversationTopic;
  previousTopic: ConversationTopic | null;
  previousRelevantTurn: AgentTurn | null;
  referenceCandidates: ResolvedConversationReference[];
  selectedUiObject: SelectedUiObject | null;
  clarificationState: "none" | "needed" | "resolved";
  confidence: number;
}

export interface WorkflowContextView {
  activeSearchJobId: string | null;
  activeBacktestRunId: string | null;
  activePaperSessionId: string | null;
  pendingApprovals: ProposedAction[];
  lifecycleStage: PipelineLifecycleStage | null;
  executionState: string | null;
  monitoringState: string | null;
}

export interface ConversationRouteDecision {
  mode: ConversationRouteMode;
  topic: ConversationTopic;
  resolvedReference: ResolvedConversationReference | null;
  confidence: number;
  needsWorkspaceFacts: boolean;
  requestedReadTools: string[];
  requestedWriteTools: string[];
  requiresApproval: boolean;
  answerIntent: string;
  reason: string;
  legacyIntent: AgentIntentType;
  providerExpected: boolean;
  lifecycleInfluencedRouting: boolean;
  clarificationQuestionKo: string | null;
}

export interface ConversationRouterInput {
  query: string;
  history: AgentTurn[];
  entities: ConversationEntityMemory;
  lifecycleStage: PipelineLifecycleStage | null;
  pendingApprovals: ProposedAction[];
  selectedUiObject?: SelectedUiObject | null;
  priorConversationTopic?: ConversationTopic | null;
}

