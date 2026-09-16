/**
 * Presentation helpers for Settings → AI 공급자.
 * Does not change routing, credentials, or model IDs.
 */

export type SettingsAiProviderId = "openai" | "gemini";

export const SETTINGS_AI_PROVIDER_IDS = ["openai", "gemini"] as const;

export const SETTINGS_AI_TECHNICAL_KEYS = [
  "defaultProvider",
  "fallbackEnabled",
  "fallbackProvider",
  "emergencyDisabled",
  "openai.selectedModel",
  "gemini.selectedModel",
  "fingerprint",
] as const;

export function settingsAiProviderDisplayName(
  id: SettingsAiProviderId | null,
): string {
  if (id === "openai") return "OpenAI";
  if (id === "gemini") return "Google Gemini";
  return "없음";
}

export function settingsAiConfiguredLabel(configured: boolean): string {
  return configured ? "설정됨" : "미설정";
}

/** Key presence is not verified health. */
export function settingsAiConfiguredTone(
  configured: boolean,
  lastTestOk: boolean | null,
): "ok" | "warn" | undefined {
  if (!configured) return undefined;
  if (lastTestOk === true) return "ok";
  return "warn";
}

export function settingsAiEnabledLabel(enabled: boolean): string {
  return enabled ? "활성" : "비활성";
}

export function settingsAiTestLabel(lastTestOk: boolean | null): string {
  if (lastTestOk === true) return "검증됨";
  if (lastTestOk === false) return "실패";
  return "미검증";
}

export function settingsAiTestTone(
  lastTestOk: boolean | null,
): "ok" | "warn" | "bad" | undefined {
  if (lastTestOk === true) return "ok";
  if (lastTestOk === false) return "bad";
  return undefined;
}

export function settingsAiFallbackLabel(
  enabled: boolean,
  provider: SettingsAiProviderId | null,
): string {
  if (!enabled) return "꺼짐";
  if (provider === "openai") return "OpenAI";
  if (provider === "gemini") return "Google Gemini";
  return "로컬 폴백";
}

export function settingsAiModelOptionLabel(model: {
  id: string;
  recommendedDefault?: boolean;
}): string {
  return model.id;
}

export function settingsAiRecommendedModelNote(
  models: Array<{ id: string; recommendedDefault?: boolean }>,
): string | null {
  const recommended = models.find((model) => model.recommendedDefault);
  return recommended ? `권장 모델 ${recommended.id}` : null;
}

export function settingsAiTechnicalKeyLabel(key: string): string {
  switch (key) {
    case "defaultProvider":
      return "기본 공급자";
    case "fallbackEnabled":
      return "예비 공급자 사용";
    case "fallbackProvider":
      return "예비 공급자";
    case "emergencyDisabled":
      return "비상 비활성화";
    case "openai.selectedModel":
      return "OpenAI 모델";
    case "gemini.selectedModel":
      return "Gemini 모델";
    case "fingerprint":
      return "자격 증명 지문";
    default:
      return key;
  }
}

export function settingsAiRuntimeLabel(reasoningActive: boolean): string {
  return reasoningActive ? "공급자 활성" : "로컬 폴백만 활성";
}
