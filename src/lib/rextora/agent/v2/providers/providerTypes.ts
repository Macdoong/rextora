/**
 * Provider settings / credential types — SERVER-SIDE ONLY.
 * Never include raw API key values in client-facing DTOs.
 */

export type AiProviderId = "openai" | "gemini";

export interface ProviderModelInfo {
  id: string;
  labelKo: string;
  provider: AiProviderId;
  supportsStructuredOutput: boolean;
  supportsGenerateContent: boolean;
  profile: "conversation" | "lightweight" | "unknown";
  recommendedDefault?: boolean;
}

export interface ProviderHealthPublic {
  configured: boolean;
  enabled: boolean;
  fingerprint: string | null;
  selectedModel: string | null;
  lastTestAt: string | null;
  lastTestOk: boolean | null;
  lastErrorKo: string | null;
  catalogCount: number;
}

export interface AiProviderSettingsPublic {
  emergencyDisabled: boolean;
  defaultProvider: AiProviderId | null;
  fallbackEnabled: boolean;
  fallbackProvider: AiProviderId | null;
  openai: ProviderHealthPublic;
  gemini: ProviderHealthPublic;
  reasoningActive: boolean;
}

export interface AiProviderSettingsRecord {
  schemaVersion: 1;
  updatedAt: string;
  emergencyDisabled: boolean;
  defaultProvider: AiProviderId | null;
  fallbackEnabled: boolean;
  fallbackProvider: AiProviderId | null;
  openai: {
    enabled: boolean;
    selectedModel: string | null;
    lastTestAt: string | null;
    lastTestOk: boolean | null;
    lastErrorKo: string | null;
  };
  gemini: {
    enabled: boolean;
    selectedModel: string | null;
    lastTestAt: string | null;
    lastTestOk: boolean | null;
    lastErrorKo: string | null;
  };
}

export interface ProviderCredentialRecord {
  schemaVersion: 1;
  updatedAt: string;
  openai: { ciphertext: string; iv: string; tag: string; fingerprint: string } | null;
  gemini: { ciphertext: string; iv: string; tag: string; fingerprint: string } | null;
}

export interface ResolvedProviderRuntime {
  active: boolean;
  emergencyDisabled: boolean;
  provider: AiProviderId | "local";
  model: string | null;
  source: "session" | "settings" | "env" | "none";
  fallbackEnabled: boolean;
  fallbackProvider: AiProviderId | null;
  openaiConfigured: boolean;
  geminiConfigured: boolean;
}

export interface SessionProviderSelection {
  provider: AiProviderId | null;
  model: string | null;
}

export const OPENAI_RECOMMENDED_MODEL = "gpt-5-mini";
export const GEMINI_FALLBACK_STABLE = "gemini-2.5-flash";
