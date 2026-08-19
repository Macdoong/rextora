/**
 * LLM-layer types — shared between provider adapters and orchestration.
 * No secrets, no filesystem paths — only sanitised data structures.
 */

import type { AgentIntentType, AgentTurn, FactItem } from "./types";

/** Sanitised package sent to LLM — contains no secrets or internal paths. */
export interface EvidencePackage {
  intentType: AgentIntentType;
  query: string;
  /** Pre-fetched facts from real stores — all labelled, all sanitised. */
  facts: FactItem[];
  /** Bounded prior conversation turns (max 3). */
  history: AgentTurn[];
  /** Deterministic decision inputs — LLM must not invent these. */
  decisionContext?: {
    conclusionKo: string;
    explanationKo: string;
    recommendedActionKo: string;
    whyBetterThanAlternativesKo: string;
    uncertaintyKo: string | null;
  };
}

/** Successful LLM interpretation result. */
export interface LLMInterpretation {
  text: string;
  /** Provider used. Never contains key or credential. */
  provider: "openai" | "gemini";
  /** Model name, e.g. "gpt-4o-mini". Never contains key. */
  model: string;
  latencyMs: number;
  tokens?: { input: number; output: number; total: number };
  /** True if served from short-lived in-process cache. */
  cached?: boolean;
}

/** Result union — provider adapters return this. */
export type LLMResult =
  | { ok: true; interpretation: LLMInterpretation }
  | { ok: false; errorKo: string; provider: string; retriable: boolean };

/** Provider adapter interface. */
export interface LLMProviderAdapter {
  readonly name: "openai" | "gemini";
  readonly model: string;
  call(evidence: EvidencePackage, signal: AbortSignal): Promise<LLMResult>;
  /** Minimal health check — sends 1 token request, verifies HTTP success. */
  healthCheck(): Promise<{
    ok: boolean;
    provider: string;
    model: string;
    latencyMs: number;
    errorKo?: string;
  }>;
}

/** Intent types that bypass LLM and always use local rule-based response. */
export const LOCAL_ONLY_INTENTS: AgentIntentType[] = [
  "unknown",
  "market_status", // no real-time data available to give LLM
  "first_run_help",
  "demo_overview",
  "follow_up_why",
  "explain_approval",
  "explain_waiting",
  "continue_session",
  "approve_pending",
  "cancel_pending",
  "prepare_search_plan",
  "prepare_backtest_plan",
  "prepare_paper_plan",
  "research_workspace",
  "execute_trade",
  "modify_safe",
  "start_live",
];

/** Intent types that are write operations and must be blocked. */
export const WRITE_BLOCKED_INTENTS: AgentIntentType[] = [
  "modify_safe",
  "execute_trade",
  "start_live",
];
