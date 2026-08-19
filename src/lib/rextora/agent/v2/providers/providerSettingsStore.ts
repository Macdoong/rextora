/**
 * Non-secret AI provider preferences — SERVER-SIDE ONLY.
 */

import { readJsonStore, writeJsonStore } from "../../../storage/jsonStore";
import type { AiProviderId, AiProviderSettingsRecord } from "./providerTypes";
import { OPENAI_RECOMMENDED_MODEL, GEMINI_FALLBACK_STABLE } from "./providerTypes";

const FILENAME = "ai-provider-settings.json";

function defaults(): AiProviderSettingsRecord {
  return {
    schemaVersion: 1,
    updatedAt: new Date().toISOString(),
    emergencyDisabled: false,
    defaultProvider: null,
    fallbackEnabled: true,
    fallbackProvider: null,
    openai: {
      enabled: true,
      selectedModel: OPENAI_RECOMMENDED_MODEL,
      lastTestAt: null,
      lastTestOk: null,
      lastErrorKo: null,
    },
    gemini: {
      enabled: true,
      selectedModel: GEMINI_FALLBACK_STABLE,
      lastTestAt: null,
      lastTestOk: null,
      lastErrorKo: null,
    },
  };
}

export function loadAiProviderSettings(): AiProviderSettingsRecord {
  const base = defaults();
  const stored = readJsonStore<Partial<AiProviderSettingsRecord>>(FILENAME, {});
  return {
    ...base,
    ...stored,
    openai: { ...base.openai, ...(stored.openai ?? {}) },
    gemini: { ...base.gemini, ...(stored.gemini ?? {}) },
    schemaVersion: 1,
  };
}

export type AiProviderSettingsPatch = {
  emergencyDisabled?: boolean;
  defaultProvider?: AiProviderId | null;
  fallbackEnabled?: boolean;
  fallbackProvider?: AiProviderId | null;
  openai?: Partial<AiProviderSettingsRecord["openai"]>;
  gemini?: Partial<AiProviderSettingsRecord["gemini"]>;
};

export function saveAiProviderSettings(
  patch: AiProviderSettingsPatch,
): AiProviderSettingsRecord {
  const current = loadAiProviderSettings();
  const next: AiProviderSettingsRecord = {
    ...current,
    ...patch,
    openai: { ...current.openai, ...(patch.openai ?? {}) },
    gemini: { ...current.gemini, ...(patch.gemini ?? {}) },
    schemaVersion: 1,
    updatedAt: new Date().toISOString(),
  };
  if (
    next.defaultProvider &&
    next.defaultProvider !== "openai" &&
    next.defaultProvider !== "gemini"
  ) {
    next.defaultProvider = null;
  }
  writeJsonStore(FILENAME, next);
  return next;
}

export function recordProviderTestResult(
  provider: AiProviderId,
  result: { ok: boolean; errorKo: string | null; model?: string | null },
): AiProviderSettingsRecord {
  const current = loadAiProviderSettings();
  const slot = {
    ...current[provider],
    lastTestAt: new Date().toISOString(),
    lastTestOk: result.ok,
    lastErrorKo: result.ok ? null : result.errorKo,
    selectedModel:
      result.ok && result.model ? result.model : current[provider].selectedModel,
  };
  return saveAiProviderSettings({ [provider]: slot });
}
