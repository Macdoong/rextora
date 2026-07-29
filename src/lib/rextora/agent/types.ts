/**
 * AI Agent Control Plane — type definitions.
 *
 * Architecture: Natural Language → Intent Parser → Typed Command →
 * Schema Validation → Policy Engine → Safety Guard → Data Fetcher →
 * Response Builder → AgentResponse
 *
 * The agent is READ-ONLY in Phase 1. It never executes trades,
 * modifies strategies, or triggers live actions autonomously.
 */

// ─── Intent ──────────────────────────────────────────────────────────────────

export type AgentIntentType =
  | "search_status" // "탐색 상태 알려줘"
  | "explain_strategy" // "SAFE 전략 설명해줘"
  | "backtest_summary" // "최근 백테스트 결과 보여줘"
  | "explain_rejection" // "왜 거부됐어"
  | "compare_strategies" // "BTC와 ETH 전략 비교"
  | "market_status" // "시장 상황 어때"
  | "risk_summary" // "리스크 현황", "왜 MDD 높아"
  | "recommend_next" // "다음에 뭐 해야 해", "가장 좋은 전략"
  | "first_run_help" // "지금 뭘 해야 해", "결과가 왜 없어", "처음에는 어떻게 시작해"
  | "demo_overview" // "데모 보여줘"
  | "paper_start_request" // "Paper 시작" — deep-link only, never executes
  | "search_failure_explanation" // "실패한 탐색 원인"
  | "modify_safe" // BLOCKED
  | "execute_trade" // BLOCKED
  | "start_live" // BLOCKED
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

/** Explicit scope echo for UI — never invents missing fields. */
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
  /** Optional conversation history for multi-turn context. Max 10 turns. */
  history?: AgentTurn[];
  /** Optional operator lifecycle context from the current UI. */
  context?: AgentLifecycleContext;
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
  /** Verified facts from real data sources — labelled distinctly from interpretation. */
  facts: FactItem[];
  /** AI interpretation in Korean — always clearly separated from facts. */
  interpretationKo: string;
  /** Single recommended next action in Korean (operator-facing). */
  recommendedActionKo?: string;
  /** Where the interpretation came from — shown in developer details only. */
  interpretationSource: InterpretationSource;
  /** LLM provider metadata — shown in developer details only, never in main UI. */
  providerMeta?: ProviderMeta;
  /** Optional recommended actions for the user to approve (deep links only). */
  actions: AgentAction[];
  /** Echo of strategy/job/run/symbol scope used for this answer. */
  scope?: AgentScope;
  /** Whether the safety guard blocked any action. */
  safetyBlocked: boolean;
  /** Safety block reason in Korean, if blocked. */
  safetyReasonKo?: string;
  /** ISO timestamp of the response. */
  respondedAt: string;
}

export interface AgentErrorResponse {
  error: true;
  messageKo: string;
  intentType?: AgentIntentType;
}
