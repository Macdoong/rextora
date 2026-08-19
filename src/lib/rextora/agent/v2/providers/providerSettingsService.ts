/**
 * Public AI provider settings facade — SERVER-SIDE ONLY.
 * Never returns API key values.
 */

import {
  deleteProviderCredential,
  describeProviderCredentialIssue,
  getStoredCredentialFingerprint,
  hasStoredCredential,
  isEnvCredentialFallback,
  resolveProviderApiKey,
  saveProviderCredential,
} from "./providerCredentialStore";
import {
  invalidateProviderModelCache,
  isModelInCatalog,
  listProviderModels,
  preferDefaultModel,
} from "./providerCatalog";
import { runProviderConnectionTest } from "./providerConnectionTest";
import {
  isProviderRuntimeActive,
  isProviderRuntimeEmergencyDisabled,
  resolveProviderRuntime,
} from "./providerRuntimeConfig";
import {
  loadAiProviderSettings,
  recordProviderTestResult,
  saveAiProviderSettings,
} from "./providerSettingsStore";
import type {
  AiProviderId,
  AiProviderSettingsPublic,
  ProviderModelInfo,
} from "./providerTypes";
import { OPENAI_RECOMMENDED_MODEL } from "./providerTypes";

function healthFor(provider: AiProviderId) {
  const settings = loadAiProviderSettings();
  const slot = settings[provider];
  const configured = Boolean(resolveProviderApiKey(provider));
  const credentialIssue = describeProviderCredentialIssue(provider);
  return {
    configured,
    enabled: slot.enabled,
    fingerprint: getStoredCredentialFingerprint(provider),
    selectedModel: slot.selectedModel,
    lastTestAt: slot.lastTestAt,
    lastTestOk: slot.lastTestOk,
    lastErrorKo: slot.lastErrorKo ?? credentialIssue,
    catalogCount: 0,
    envFallback: isEnvCredentialFallback(provider),
    stored: hasStoredCredential(provider),
  };
}

export function getAiProvidersPublic(): AiProviderSettingsPublic & {
  openai: ReturnType<typeof healthFor>;
  gemini: ReturnType<typeof healthFor>;
  runtime: ReturnType<typeof resolveProviderRuntime>;
} {
  const settings = loadAiProviderSettings();
  return {
    emergencyDisabled: isProviderRuntimeEmergencyDisabled(),
    defaultProvider: settings.defaultProvider,
    fallbackEnabled: settings.fallbackEnabled,
    fallbackProvider: settings.fallbackProvider,
    openai: healthFor("openai"),
    gemini: healthFor("gemini"),
    reasoningActive: isProviderRuntimeActive(),
    runtime: resolveProviderRuntime(null),
  };
}

export async function patchAiProviders(input: {
  emergencyDisabled?: boolean;
  defaultProvider?: AiProviderId | null;
  fallbackEnabled?: boolean;
  fallbackProvider?: AiProviderId | null;
  openai?: { enabled?: boolean; selectedModel?: string | null };
  gemini?: { enabled?: boolean; selectedModel?: string | null };
}): Promise<ReturnType<typeof getAiProvidersPublic>> {
  const patch: {
    emergencyDisabled?: boolean;
    defaultProvider?: AiProviderId | null;
    fallbackEnabled?: boolean;
    fallbackProvider?: AiProviderId | null;
    openai?: { enabled?: boolean; selectedModel?: string | null };
    gemini?: { enabled?: boolean; selectedModel?: string | null };
  } = {};
  if (typeof input.emergencyDisabled === "boolean") {
    patch.emergencyDisabled = input.emergencyDisabled;
  }
  if ("defaultProvider" in input) patch.defaultProvider = input.defaultProvider ?? null;
  if (typeof input.fallbackEnabled === "boolean") {
    patch.fallbackEnabled = input.fallbackEnabled;
  }
  if ("fallbackProvider" in input) {
    patch.fallbackProvider = input.fallbackProvider ?? null;
  }
  if (input.openai) {
    if (input.openai.selectedModel) {
      const models = await listProviderModels("openai").catch(() => []);
      if (
        models.length > 0 &&
        !isModelInCatalog("openai", input.openai.selectedModel, models)
      ) {
        throw new Error("INVALID_OPENAI_MODEL");
      }
    }
    patch.openai = input.openai;
  }
  if (input.gemini) {
    if (input.gemini.selectedModel) {
      const models = await listProviderModels("gemini").catch(() => []);
      if (
        models.length > 0 &&
        !isModelInCatalog("gemini", input.gemini.selectedModel, models)
      ) {
        throw new Error("INVALID_GEMINI_MODEL");
      }
    }
    patch.gemini = input.gemini;
  }
  saveAiProviderSettings({
    emergencyDisabled: patch.emergencyDisabled,
    defaultProvider: patch.defaultProvider,
    fallbackEnabled: patch.fallbackEnabled,
    fallbackProvider: patch.fallbackProvider,
    openai: patch.openai,
    gemini: patch.gemini,
  });
  return getAiProvidersPublic();
}

export async function testAndOptionallySaveProvider(input: {
  provider: AiProviderId;
  apiKey: string;
  model?: string | null;
  saveOnSuccess?: boolean;
}): Promise<{
  test: Awaited<ReturnType<typeof runProviderConnectionTest>>;
  public: ReturnType<typeof getAiProvidersPublic>;
  saved: boolean;
}> {
  const provider = input.provider;
  let model = input.model?.trim() || null;
  if (!model) {
    const models = await listProviderModels(provider, {
      apiKeyOverride: input.apiKey,
      forceRefresh: true,
    }).catch(() => [] as ProviderModelInfo[]);
    model = preferDefaultModel(provider, models);
    if (provider === "openai" && model !== OPENAI_RECOMMENDED_MODEL) {
      // Do not silently substitute when gpt-5-mini is unavailable.
      if (!models.some((m) => m.id === OPENAI_RECOMMENDED_MODEL)) {
        return {
          test: {
            ok: false,
            provider,
            model: OPENAI_RECOMMENDED_MODEL,
            latencyMs: 0,
            structuredOutputValid: false,
            writeToolAuditCount: 0,
            errorKo:
              "권장 모델 gpt-5-mini를 이 계정에서 사용할 수 없습니다. 다른 호환 모델을 선택하세요.",
            responseFingerprint: null,
          },
          public: getAiProvidersPublic(),
          saved: false,
        };
      }
    }
  }
  if (!model) {
    return {
      test: {
        ok: false,
        provider,
        model: "",
        latencyMs: 0,
        structuredOutputValid: false,
        writeToolAuditCount: 0,
        errorKo: "호환 모델을 찾지 못했습니다.",
        responseFingerprint: null,
      },
      public: getAiProvidersPublic(),
      saved: false,
    };
  }

  const test = await runProviderConnectionTest({
    provider,
    apiKey: input.apiKey,
    model,
  });
  recordProviderTestResult(provider, {
    ok: test.ok,
    errorKo: test.errorKo,
    model: test.ok ? test.model : null,
  });

  let saved = false;
  if (test.ok && input.saveOnSuccess) {
    saveProviderCredential(provider, input.apiKey);
    invalidateProviderModelCache(provider);
    saved = true;
    if (provider === "openai" && test.model === OPENAI_RECOMMENDED_MODEL) {
      saveAiProviderSettings({
        openai: { selectedModel: OPENAI_RECOMMENDED_MODEL, enabled: true },
        defaultProvider:
          loadAiProviderSettings().defaultProvider ?? "openai",
      });
    } else {
      saveAiProviderSettings({
        [provider]: { selectedModel: test.model, enabled: true },
      });
    }
  }

  return { test, public: getAiProvidersPublic(), saved };
}

export async function getProviderModelsPublic(
  provider: AiProviderId,
  forceRefresh = false,
): Promise<{
  provider: AiProviderId;
  models: ProviderModelInfo[];
  recommended: string | null;
  openaiRecommendedAvailable: boolean | null;
}> {
  const models = await listProviderModels(provider, { forceRefresh });
  return {
    provider,
    models,
    recommended: preferDefaultModel(provider, models),
    openaiRecommendedAvailable:
      provider === "openai"
        ? models.some((m) => m.id === OPENAI_RECOMMENDED_MODEL)
        : null,
  };
}

export function removeProviderCredentialPublic(provider: AiProviderId): {
  removed: boolean;
  public: ReturnType<typeof getAiProvidersPublic>;
} {
  const removed = deleteProviderCredential(provider);
  invalidateProviderModelCache(provider);
  if (removed) {
    recordProviderTestResult(provider, {
      ok: false,
      errorKo: "자격 증명이 삭제되었습니다.",
      model: null,
    });
  }
  return { removed, public: getAiProvidersPublic() };
}
