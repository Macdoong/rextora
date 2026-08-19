/**
 * AI Agent Control Plane — type definitions.
 *
 * Conversational product contract:
 * Natural Language → Intent → Facts → Decision Context → Interpretation →
 * One Recommended Action → Explicit Approval → Typed Command (deep-link) →
 * Existing Engines
 *
 * Phase 1 remains non-executing for Search/Backtest/Paper/Live engines.
 * The agent never bypasses approval gates or modifies SAFE.
 */

import type { ProposedAction } from "./proposedAction";
import type { ConversationEntityMemory } from "./conversationContext";
import type { AgentPlanDraft } from "./planDrafts";
import type { PipelineLifecycleStage } from "./lifecycleStage";
import type { ResearchWorkspaceSummary } from "./researchWorkspace";
import type { DecisionContext } from "./decisionContext";
import type { ConversationWorkingState } from "./conversationState";
import type { AgentGoal } from "./goalDetector";
import type { MissionTimeline } from "./missionTimeline";

// ─── Intent ──────────────────────────────────────────────────────────────────

export type AgentIntentType =
  | "search_status"
  | "search_pause_request"
  | "search_resume_request"
  | "explain_strategy"
  | "backtest_summary"
  | "explain_rejection"
  | "compare_strategies"
  | "compare_plans"
  | "market_status"
  | "risk_summary"
  | "recommend_next"
  | "first_run_help"
  | "demo_overview"
  | "paper_start_request"
  | "paper_status"
  | "paper_pause_request"
  | "paper_resume_request"
  | "paper_stop_request"
  | "strategy_rename_request"
  | "strategy_archive_request"
  | "strategy_restore_request"
  | "strategy_delete_request"
  | "search_failure_explanation"
  | "prepare_search_plan"
  | "prepare_backtest_plan"
  | "prepare_paper_plan"
  | "research_workspace"
  | "workspace_status"
  | "research_analysis"
  | "results_promote_request"
  | "memory_recall"
  | "follow_up_why"
  | "explain_approval"
  | "explain_waiting"
  | "continue_session"
  | "approve_pending"
  | "cancel_pending"
  | "modify_safe"
  | "execute_trade"
  | "start_live"
  | "unknown";

export interface AgentIntent {
  type: AgentIntentType;
  /** Extracted parameters from the query (e.g. symbol, strategyId). */
  params: Record<string, string>;
  /** Confidence score 0–1. */
  confidence: number;
  /** The original query text, preserved for display. */
  rawQuery: string;
}

// ─── Lifecycle context (client → server, optional) ────────────────────────────

export interface AgentLifecycleContext {
  /** Current pathname, e.g. "/backtest". */
  route?: string | null;
  strategyId?: string | null;
  runId?: string | null;
  jobId?: string | null;
  paperSessionId?: string | null;
  symbol?: string | null;
  timeframe?: string | null;
}

/** Explicit scope echo for evidence — never invents missing fields. */
export interface AgentScope {
  route?: string | null;
  strategyId?: string | null;
  runId?: string | null;
  jobId?: string | null;
  paperSessionId?: string | null;
  symbol?: string | null;
  timeframe?: string | null;
}

// ─── Evidence ─────────────────────────────────────────────────────────────────

export type FactSource =
  | "strategy_store"
  | "backtest_store"
  | "strategy_search_jobs"
  | "trading_dashboard"
  | "risk_engine"
  | "market_data"
  | "system_status"
  | "paper_session_store"
  | "lifecycle_context";

export interface FactItem {
  /** Short Korean label, e.g. "탐색 작업 수" */
  labelKo: string;
  /** Formatted value string, e.g. "12개" */
  value: string;
  /** Where this fact came from — shown as data provenance badge. */
  source: FactSource;
  /** ISO timestamp of when this data was fetched. */
  fetchedAt: string;
}

// ─── Actions ──────────────────────────────────────────────────────────────────

export type AgentActionType =
  | "navigate"
  | "open_backtest"
  | "view_results"
  | "view_strategy"
  | "open_paper"
  | "open_search"
  | "view_report"
  | "view_recommendation"
  | "none";

export interface AgentAction {
  type: AgentActionType;
  /** Korean label shown on the action card button. */
  labelKo: string;
  /** Optional Korean description of what this action will do. */
  descriptionKo?: string;
  /** URL to navigate to (deep link only — never executes). */
  href?: string;
  /** Whether this action requires the approval gate before execution. */
  requiresApproval: boolean;
}

// ─── Request / Response ───────────────────────────────────────────────────────

export interface AgentRequest {
  query: string;
  /** Stable client session identity for server stores and idempotency. */
  sessionId?: string;
  /** Per-turn identity used to deduplicate provider reasoning. */
  turnId?: string;
  /** Optional conversation history for multi-turn context. Max 10 turns. */
  history?: AgentTurn[];
  /** Optional operator lifecycle context from the current UI. */
  context?: AgentLifecycleContext;
  /** Optional prior entity memory from the client session (bounded). */
  entityMemory?: ConversationEntityMemory | null;
  /** Optional pending proposed action from the prior turn. */
  pendingProposedAction?: ProposedAction | null;
  /** All visible pending approvals; used to refuse ambiguous approval commands. */
  pendingApprovals?: ProposedAction[];
  /** Explicitly selected UI object has higher precedence than workflow state. */
  selectedUiObject?: {
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
    id?: string | null;
    descriptionKo?: string | null;
  } | null;
  /** Conversation topic is persisted separately from workflow entity memory. */
  conversationContext?: {
    currentTopic?: string | null;
    previousTopic?: string | null;
    clarificationState?: "none" | "needed" | "resolved";
    confidence?: number;
  } | null;
  /** Per-session provider/model override selected in the Agent chat header. */
  providerSelection?: {
    provider: "openai" | "gemini";
    model: string;
  } | null;
}

export interface AgentTurn {
  role: "user" | "agent";
  content: string;
  timestamp: string;
}

/** Where the interpretationKo text came from. */
export type InterpretationSource = "llm" | "local";

/** LLM provider metadata — never contains secret values. */
export interface ProviderMeta {
  provider: string;
  model: string;
  latencyMs: number;
  tokens?: { input: number; output: number; total: number };
  cached?: boolean;
  /** Normalised Korean error string, if provider failed and local fallback was used. */
  errorKo?: string;
}

export interface AgentResponse {
  /** Detected intent type. */
  intentType: AgentIntentType;
  /**
   * Conversational conclusion — primary visible answer.
   * Must not include raw internal IDs.
   */
  conclusionKo: string;
  /**
   * Short explanation — why the conclusion matters.
   * Must not include raw internal IDs.
   */
  explanationKo: string;
  /** Verified facts from real data sources — collapsed evidence by default. */
  facts: FactItem[];
  /**
   * Full interpretation text (legacy + LLM). Kept for compatibility;
   * UI prefers conclusionKo + explanationKo.
   */
  interpretationKo: string;
  /** Single recommended next action in Korean (operator-facing). */
  recommendedActionKo?: string;
  /** Where the interpretation came from — shown in developer details only. */
  interpretationSource: InterpretationSource;
  /** LLM provider metadata — shown in developer details only, never in main UI. */
  providerMeta?: ProviderMeta;
  /** Exactly one primary action when applicable (deep links only). */
  actions: AgentAction[];
  /** Typed proposed action for multi-turn approval. */
  proposedAction?: ProposedAction | null;
  /** Structured planning object (draft only — never execution). */
  plan?: AgentPlanDraft | null;
  /** Deterministic decision surface for UI (understanding / evidence / decision / reason). */
  decision?: Pick<
    DecisionContext,
    | "situationKo"
    | "meaningKo"
    | "whyMattersKo"
    | "recommendedActionKo"
    | "whyBetterThanAlternativesKo"
    | "uncertaintyKo"
    | "conclusionKo"
    | "explanationKo"
    | "evidenceKeys"
  > | null;
  /** Pipeline lifecycle stage derived from verified facts. */
  lifecycleStage?: PipelineLifecycleStage | null;
  /** Pinned session objective for the operator. */
  pinnedObjectiveKo?: string | null;
  /** Optional research workspace snapshot (recommend / workspace intents). */
  workspace?: ResearchWorkspaceSummary | null;
  /** Updated entity memory for the client session. */
  entityMemory?: ConversationEntityMemory;
  /** Echo of strategy/job/run/symbol scope used for this answer (evidence only). */
  scope?: AgentScope;
  /** Whether the safety guard blocked any action. */
  safetyBlocked: boolean;
  /** Safety block reason in Korean, if blocked. */
  safetyReasonKo?: string;
  /** ISO timestamp of the response. */
  respondedAt: string;
  /** Optional follow-up suggestion chips (conversational, not technical). */
  followUpSuggestions?: string[];
  /** Working-session state machine snapshot. */
  conversationState?: ConversationWorkingState | null;
  /** Detected operator goal. */
  goal?: AgentGoal | null;
  /** Mission timeline for the commercial workspace. */
  missionTimeline?: MissionTimeline | null;
  /** Real typed-command execution result after explicit approval. */
  executionResult?: {
    commandId: string;
    commandType: string;
    executionStatus: string;
    resultReference: string | null;
    jobId: string | null;
    runId: string | null;
    alreadyExecuted: boolean;
    summaryKo: string | null;
  } | null;
  /** Agent V2 reasoning evidence — developer/evidence panel only. */
  reasoningMeta?: {
    reasoningId: string;
    fallbackUsed: boolean;
    provider: string;
    model: string;
    validationOk: boolean;
    toolIds: string[];
    verifiedFactRefs: string[];
    requestHash: string | null;
    latencyMs?: number;
  } | null;
  /** Conversation-first route evidence; developer/evidence surfaces only. */
  conversationRoute?: {
    mode:
      | "DIRECT_ANSWER"
      | "READ_AND_ANSWER"
      | "PLAN_AND_APPROVE"
      | "APPROVAL_CONTROL"
      | "CLARIFY_REFERENCE"
      | "SAFE_REFUSAL";
    topic: string;
    confidence: number;
    resolvedReference: string | null;
    needsWorkspaceFacts: boolean;
    requestedReadTools: string[];
    requestedWriteTools: string[];
    requiresApproval: boolean;
    providerExpected: boolean;
    lifecycleInfluencedRouting: boolean;
    reason: string;
  } | null;
  /** Conversation topic state, intentionally separate from workflow memory. */
  conversationContext?: {
    currentTopic: string;
    previousTopic: string | null;
    clarificationState: "none" | "needed" | "resolved";
    confidence: number;
  } | null;
}

export interface AgentErrorResponse {
  error: true;
  messageKo: string;
  intentType?: AgentIntentType;
}
