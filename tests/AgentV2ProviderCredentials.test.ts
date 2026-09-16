import { describe, expect, it, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  credentialFingerprint,
  deleteProviderCredential,
  describeProviderCredentialIssue,
  resolveProviderApiKey,
  saveProviderCredential,
} from "@/src/lib/rextora/agent/v2/providers/providerCredentialStore";
import { getAiProvidersPublic } from "@/src/lib/rextora/agent/v2/providers/providerSettingsService";
import { preferDefaultModel } from "@/src/lib/rextora/agent/v2/providers/providerCatalog";
import { OPENAI_RECOMMENDED_MODEL } from "@/src/lib/rextora/agent/v2/providers/providerTypes";
import {
  isProviderRuntimeActive,
  isProviderRuntimeEmergencyDisabled,
  resolveProviderRuntime,
} from "@/src/lib/rextora/agent/v2/providers/providerRuntimeConfig";
import { rextoraDataRoot } from "@/src/lib/rextora/storage/runtimePaths";

function credentialFilePath(): string {
  return path.join(rextoraDataRoot(), "secrets", "ai-provider-credentials.enc.json");
}

describe("Agent V2 provider credentials", () => {
  const prevOpenAi = process.env.OPENAI_API_KEY;
  const prevGemini = process.env.GEMINI_API_KEY;
  const prevEmergency = process.env.AGENT_V2_REASONING_EMERGENCY_DISABLE;

  beforeEach(() => {
    delete process.env.AGENT_V2_REASONING_EMERGENCY_DISABLE;
  });

  afterEach(() => {
    if (prevOpenAi === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = prevOpenAi;
    if (prevGemini === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = prevGemini;
    if (prevEmergency === undefined) {
      delete process.env.AGENT_V2_REASONING_EMERGENCY_DISABLE;
    } else {
      process.env.AGENT_V2_REASONING_EMERGENCY_DISABLE = prevEmergency;
    }
    try {
      deleteProviderCredential("openai");
      deleteProviderCredential("gemini");
    } catch {
      /* ignore */
    }
  });

  it("never returns apiKey fields from public GET payload", () => {
    const pub = getAiProvidersPublic() as Record<string, unknown>;
    const raw = JSON.stringify(pub);
    expect(raw).not.toMatch(/sk-[A-Za-z0-9]/);
    expect(pub).not.toHaveProperty("apiKey");
    expect(pub.openai).not.toHaveProperty("apiKey");
    expect(pub.gemini).not.toHaveProperty("apiKey");
  });

  it("persists credentials encrypted and resolves without returning plaintext via public API", () => {
    process.env.OPENAI_API_KEY = "";
    const key = "sk-test-provider-credential-security-key-0001";
    const { fingerprint } = saveProviderCredential("openai", key);
    expect(fingerprint).toBe(credentialFingerprint(key));
    expect(resolveProviderApiKey("openai")).toBe(key);
    const pub = getAiProvidersPublic();
    expect(pub.openai.configured).toBe(true);
    expect(pub.openai.fingerprint).toBe(fingerprint);
    expect(JSON.stringify(pub)).not.toContain(key);
    const credFile = credentialFilePath();
    expect(fs.existsSync(credFile)).toBe(true);
    const disk = fs.readFileSync(credFile, "utf8");
    expect(disk).not.toContain(key);
    expect(disk).toContain("ciphertext");
    const mode = fs.statSync(credFile).mode & 0o777;
    expect(mode).toBe(0o600);
    deleteProviderCredential("openai");
    expect(resolveProviderApiKey("openai")).toBeUndefined();
  });

  it("rejects invalid short keys", () => {
    expect(() => saveProviderCredential("openai", "short")).toThrow(
      /INVALID_API_KEY/,
    );
  });

  it("rejects OpenAI env keys with non-ASCII corruption", () => {
    process.env.OPENAI_API_KEY = "sk-test-bad-\u0441yrillic";
    expect(resolveProviderApiKey("openai")).toBeUndefined();
    expect(describeProviderCredentialIssue("openai")).toMatch(/문자/);
  });

  it("recommends gpt-5-mini only when present in catalog", () => {
    expect(
      preferDefaultModel("openai", [
        {
          id: "gpt-4o-mini",
          labelKo: "gpt-4o-mini",
          provider: "openai",
          supportsStructuredOutput: true,
          supportsGenerateContent: true,
          profile: "conversation",
        },
      ]),
    ).toBeNull();
    expect(
      preferDefaultModel("openai", [
        {
          id: OPENAI_RECOMMENDED_MODEL,
          labelKo: "GPT-5 mini",
          provider: "openai",
          supportsStructuredOutput: true,
          supportsGenerateContent: true,
          profile: "conversation",
          recommendedDefault: true,
        },
      ]),
    ).toBe(OPENAI_RECOMMENDED_MODEL);
  });

  it("activates runtime from credentials and respects emergency disable", () => {
    process.env.OPENAI_API_KEY = "";
    process.env.GEMINI_API_KEY = "gemini-test-key-for-runtime-activation";
    expect(isProviderRuntimeActive()).toBe(true);
    process.env.AGENT_V2_REASONING_EMERGENCY_DISABLE = "true";
    expect(isProviderRuntimeEmergencyDisabled()).toBe(true);
    expect(isProviderRuntimeActive()).toBe(false);
  });

  it("session selection overrides default provider", () => {
    process.env.OPENAI_API_KEY = "sk-test-session-override-openai-key-aaaa";
    process.env.GEMINI_API_KEY = "gemini-test-session-override-key";
    const runtime = resolveProviderRuntime({
      provider: "gemini",
      model: "gemini-2.5-flash",
    });
    expect(runtime.provider).toBe("gemini");
    expect(runtime.model).toBe("gemini-2.5-flash");
    expect(runtime.source).toBe("session");
  });
});
