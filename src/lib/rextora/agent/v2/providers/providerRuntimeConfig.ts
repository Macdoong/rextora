/**
 * Authoritative runtime provider resolution — SERVER-SIDE ONLY.
 *
 * Precedence:
 * 1. Emergency environment / settings disable
 * 2. Per-session chat provider/model override
 * 3. Valid persisted default provider/model
 * 4. Valid environment credential fallback
 * 5. Local deterministic fallback
 */

import {
  hasStoredCredential,
  resolveProviderApiKey,
} from "./providerCredentialStore";
import { loadAiProviderSettings } from "./providerSettingsStore";
import type {
  AiProviderId,
  ResolvedProviderRuntime,
  SessionProviderSelection,
} from "./providerTypes";
import { OPENAI_RECOMMENDED_MODEL, GEMINI_FALLBACK_STABLE } from "./providerTypes";

function envEmergencyDisable(): boolean {
  const v = process.env.AGENT_V2_REASONING_EMERGENCY_DISABLE?.trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

function envForceEnable(): boolean {
  const v = process.env.AGENT_V2_REASONING_ENABLED?.trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

function configured(provider: AiProviderId): boolean {
  return Boolean(resolveProviderApiKey(provider));
}

function modelFor(
  provider: AiProviderId,
  session: SessionProviderSelection | null | undefined,
): string {
  if (session?.provider === provider && session.model?.trim()) {
    return session.model.trim();
  }
  const settings = loadAiProviderSettings();
  const selected = settings[provider].selectedModel?.trim();
  if (selected) return selected;
  if (provider === "openai") {
    return (
      process.env.AI_AGENT_OPENAI_MODEL?.trim() || OPENAI_RECOMMENDED_MODEL
    );
  }
  return process.env.AI_AGENT_GEMINI_MODEL?.trim() || GEMINI_FALLBACK_STABLE;
}

export function isProviderRuntimeEmergencyDisabled(): boolean {
  if (envEmergencyDisable()) return true;
  return loadAiProviderSettings().emergencyDisabled === true;
}

/**
 * Reasoning is active when emergency is off AND at least one enabled provider
 * has a usable credential (settings store or env fallback), OR when the
 * legacy AGENT_V2_REASONING_ENABLED flag forces enable with a configured key.
 */
export function isProviderRuntimeActive(): boolean {
  if (isProviderRuntimeEmergencyDisabled()) return false;
  const settings = loadAiProviderSettings();
  const openaiOk = settings.openai.enabled && configured("openai");
  const geminiOk = settings.gemini.enabled && configured("gemini");
  if (openaiOk || geminiOk) return true;
  // Legacy force-enable still requires a key.
  if (envForceEnable() && (configured("openai") || configured("gemini"))) {
    return true;
  }
  return false;
}

export function resolveProviderRuntime(
  session?: SessionProviderSelection | null,
): ResolvedProviderRuntime {
  const settings = loadAiProviderSettings();
  const openaiConfigured = configured("openai");
  const geminiConfigured = configured("gemini");
  const emergencyDisabled = isProviderRuntimeEmergencyDisabled();

  const base: ResolvedProviderRuntime = {
    active: false,
    emergencyDisabled,
    provider: "local",
    model: null,
    source: "none",
    fallbackEnabled: settings.fallbackEnabled,
    fallbackProvider: settings.fallbackProvider,
    openaiConfigured,
    geminiConfigured,
  };

  if (emergencyDisabled) return base;

  const pick = (
    provider: AiProviderId,
    source: ResolvedProviderRuntime["source"],
  ): ResolvedProviderRuntime => ({
    ...base,
    active: true,
    provider,
    model: modelFor(provider, session),
    source,
  });

  // 1) Session override
  if (
    session?.provider &&
    settings[session.provider].enabled &&
    configured(session.provider)
  ) {
    return pick(session.provider, "session");
  }

  // 2) Persisted default
  if (
    settings.defaultProvider &&
    settings[settings.defaultProvider].enabled &&
    configured(settings.defaultProvider)
  ) {
    return pick(settings.defaultProvider, "settings");
  }

  // 3) Explicit env provider preference
  const envPref = process.env.AI_AGENT_PROVIDER?.toLowerCase();
  if (envPref === "openai" && settings.openai.enabled && openaiConfigured) {
    return pick("openai", "env");
  }
  if (envPref === "gemini" && settings.gemini.enabled && geminiConfigured) {
    return pick("gemini", "env");
  }

  // 4) First available enabled provider
  if (settings.openai.enabled && openaiConfigured) {
    return pick("openai", hasStoredCredential("openai") ? "settings" : "env");
  }
  if (settings.gemini.enabled && geminiConfigured) {
    return pick("gemini", hasStoredCredential("gemini") ? "settings" : "env");
  }

  return base;
}
