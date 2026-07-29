/**
 * Provider Configuration — SERVER-SIDE ONLY.
 * Reads AI provider settings from environment variables.
 *
 * SECURITY: This module must never be imported by client components.
 * Keys are read here and NEVER forwarded to the browser, logs, or responses.
 */

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
 * Reads provider configuration from environment.
 * Returns sanitised config — keys are present/absent flags only, never values.
 */
export function getProviderConfig(): ProviderConfig {
  const rawProvider = process.env.AI_AGENT_PROVIDER?.toLowerCase();
  const provider: ProviderName =
    rawProvider === "openai" || rawProvider === "gemini" || rawProvider === "local"
      ? rawProvider
      : "local";

  return {
    provider,
    openaiConfigured: Boolean(process.env.OPENAI_API_KEY?.trim()),
    geminiConfigured: Boolean(process.env.GEMINI_API_KEY?.trim()),
    openaiModel: process.env.AI_AGENT_OPENAI_MODEL?.trim() || "gpt-4o-mini",
    geminiModel: process.env.AI_AGENT_GEMINI_MODEL?.trim() || "gemini-1.5-flash",
  };
}

/**
 * Returns only the API key for the specified provider.
 * Never logs, never forwards to client.
 * Called by adapters immediately before HTTP request — key does not persist in memory longer than needed.
 */
export function getProviderKey(provider: "openai" | "gemini"): string | undefined {
  if (provider === "openai") return process.env.OPENAI_API_KEY;
  if (provider === "gemini") return process.env.GEMINI_API_KEY;
  return undefined;
}
