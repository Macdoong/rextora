/**
 * Provider Configuration — SERVER-SIDE ONLY.
 * Resolves provider/model from settings + encrypted credentials + env fallback.
 *
 * SECURITY: This module must never be imported by client components.
 * Keys are read here and NEVER forwarded to the browser, logs, or responses.
 */

import {
  resolveProviderApiKey,
  resolveProviderRuntime,
  type SessionProviderSelection,
} from "./v2/providers";

export type ProviderName = "openai" | "gemini" | "local";

export interface ProviderConfig {
  provider: ProviderName;
  openaiConfigured: boolean;
  geminiConfigured: boolean;
  /** Resolved model name — never contains key. */
  openaiModel: string;
  geminiModel: string;
}

/**
 * Reads provider configuration from runtime settings + environment.
 * Optional session selection overrides the default for this resolution only.
 */
export function getProviderConfig(
  session?: SessionProviderSelection | null,
): ProviderConfig {
  const runtime = resolveProviderRuntime(session ?? null);
  return {
    provider: runtime.provider,
    openaiConfigured: runtime.openaiConfigured,
    geminiConfigured: runtime.geminiConfigured,
    openaiModel:
      runtime.provider === "openai" && runtime.model
        ? runtime.model
        : process.env.AI_AGENT_OPENAI_MODEL?.trim() || "gpt-5-mini",
    geminiModel:
      runtime.provider === "gemini" && runtime.model
        ? runtime.model
        : process.env.AI_AGENT_GEMINI_MODEL?.trim() || "gemini-2.5-flash",
  };
}

/**
 * Returns only the API key for the specified provider.
 * Never logs, never forwards to client.
 */
export function getProviderKey(
  provider: "openai" | "gemini",
): string | undefined {
  return resolveProviderApiKey(provider);
}
