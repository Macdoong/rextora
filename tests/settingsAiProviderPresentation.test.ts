import { describe, expect, it } from "vitest";
import {
  SETTINGS_AI_PROVIDER_IDS,
  SETTINGS_AI_TECHNICAL_KEYS,
  settingsAiConfiguredLabel,
  settingsAiConfiguredTone,
  settingsAiEnabledLabel,
  settingsAiFallbackLabel,
  settingsAiModelOptionLabel,
  settingsAiProviderDisplayName,
  settingsAiRecommendedModelNote,
  settingsAiRuntimeLabel,
  settingsAiTechnicalKeyLabel,
  settingsAiTestLabel,
  settingsAiTestTone,
} from "../src/lib/rextora/settings/settingsAiProviderPresentation";

describe("Settings AI provider presentation", () => {
  it("lists only production providers", () => {
    expect([...SETTINGS_AI_PROVIDER_IDS]).toEqual(["openai", "gemini"]);
    expect(settingsAiProviderDisplayName("openai")).toBe("OpenAI");
    expect(settingsAiProviderDisplayName("gemini")).toBe("Google Gemini");
    expect(settingsAiProviderDisplayName(null)).toBe("없음");
  });

  it("does not treat API key presence as verified health", () => {
    expect(settingsAiConfiguredLabel(true)).toBe("설정됨");
    expect(settingsAiConfiguredLabel(false)).toBe("미설정");
    expect(settingsAiConfiguredTone(true, null)).toBe("warn");
    expect(settingsAiConfiguredTone(true, false)).toBe("warn");
    expect(settingsAiConfiguredTone(true, true)).toBe("ok");
    expect(settingsAiConfiguredTone(false, null)).toBeUndefined();
    expect(settingsAiTestLabel(null)).toBe("미검증");
    expect(settingsAiTestLabel(true)).toBe("검증됨");
    expect(settingsAiTestLabel(false)).toBe("실패");
    expect(settingsAiTestTone(null)).toBeUndefined();
    expect(settingsAiTestTone(true)).toBe("ok");
    expect(settingsAiTestTone(false)).toBe("bad");
  });

  it("keeps model IDs exact and labels Korean-first", () => {
    expect(settingsAiModelOptionLabel({ id: "gpt-5-mini" })).toBe("gpt-5-mini");
    expect(
      settingsAiModelOptionLabel({ id: "gpt-5-mini", recommendedDefault: true }),
    ).toBe("gpt-5-mini");
    expect(settingsAiModelOptionLabel({ id: "gemini-2.5-flash" })).toBe(
      "gemini-2.5-flash",
    );
    expect(
      settingsAiRecommendedModelNote([
        { id: "gpt-5-mini", recommendedDefault: true },
      ]),
    ).toBe("권장 모델 gpt-5-mini");
    expect(settingsAiEnabledLabel(true)).toBe("활성");
    expect(settingsAiRuntimeLabel(true)).toBe("공급자 활성");
    expect(settingsAiRuntimeLabel(false)).toBe("로컬 폴백만 활성");
    expect(settingsAiFallbackLabel(true, "gemini")).toBe("Google Gemini");
    expect(settingsAiFallbackLabel(false, "openai")).toBe("꺼짐");
    expect(settingsAiFallbackLabel(true, null)).toBe("로컬 폴백");
    expect(settingsAiTechnicalKeyLabel("defaultProvider")).toBe("기본 공급자");
    expect(settingsAiTechnicalKeyLabel("fingerprint")).toBe("자격 증명 지문");
    expect([...SETTINGS_AI_TECHNICAL_KEYS]).toEqual([
      "defaultProvider",
      "fallbackEnabled",
      "fallbackProvider",
      "emergencyDisabled",
      "openai.selectedModel",
      "gemini.selectedModel",
      "fingerprint",
    ]);
  });
});
