"use client";

/**
 * Agent analytics — privacy-safe client-side event emitter.
 *
 * SECURITY: This module must never log API keys, full prompts,
 * raw model responses, strategy files, or user credentials.
 *
 * Events are logged to console in development.
 * In production, extend the `emit` function to call your analytics endpoint.
 */

export type AgentAnalyticsEvent =
  | { name: "agent_opened" }
  | { name: "message_sent"; intentType: string; queryLength: number }
  | { name: "local_answer_returned"; intentType: string; factCount: number }
  | { name: "llm_answer_returned"; intentType: string; provider: string; latencyMs: number; cached?: boolean }
  | { name: "suggestion_clicked"; text: string }
  | { name: "result_explained"; intentType: string }
  | { name: "expert_screen_opened"; href: string }
  | { name: "action_card_opened"; actionType: string; href?: string }
  | { name: "provider_error"; provider: string; errorCategory: string }
  | { name: "safety_blocked"; intentType: string };

function emit(event: AgentAnalyticsEvent): void {
  // In development: log sanitised event (no secrets, no raw text)
  if (process.env.NODE_ENV === "development") {
    console.debug("[rextora:agent]", event.name, event);
  }
  // TODO: extend for production analytics endpoint
  // fetch('/api/analytics', { method: 'POST', body: JSON.stringify({ event }) })
}

export const analytics = {
  agentOpened: () => emit({ name: "agent_opened" }),

  messageSent: (intentType: string, queryLength: number) =>
    emit({ name: "message_sent", intentType, queryLength }),

  localAnswerReturned: (intentType: string, factCount: number) =>
    emit({ name: "local_answer_returned", intentType, factCount }),

  llmAnswerReturned: (intentType: string, provider: string, latencyMs: number, cached?: boolean) =>
    emit({ name: "llm_answer_returned", intentType, provider, latencyMs, cached }),

  suggestionClicked: (text: string) =>
    emit({ name: "suggestion_clicked", text }),

  resultExplained: (intentType: string) =>
    emit({ name: "result_explained", intentType }),

  expertScreenOpened: (href: string) =>
    emit({ name: "expert_screen_opened", href }),

  actionCardOpened: (actionType: string, href?: string) =>
    emit({ name: "action_card_opened", actionType, href }),

  providerError: (provider: string, errorCategory: string) =>
    emit({ name: "provider_error", provider, errorCategory }),

  safetyBlocked: (intentType: string) =>
    emit({ name: "safety_blocked", intentType }),
};
