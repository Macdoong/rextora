import { describe, expect, it } from "vitest";
import {
  evaluateStructuredProviderCanary,
  classifyFallbackReason,
  listConfiguredProviders,
  pickVerifiedProviderAttempt,
} from "../src/lib/rextora/agent/v2/reasoning/providerCanary";

describe("provider canary verification", () => {
  it("marks healthy only after a successful structured canary", () => {
    const result = evaluateStructuredProviderCanary({
      requestedProvider: "gemini",
      healthChecks: [{ provider: "gemini", configured: true, ok: true }],
      canary: {
        status: 200,
        provider: "gemini",
        fallbackUsed: false,
        validationOk: true,
        toolIds: ["search.status"],
        writeToolExecuted: false,
        conclusionKo: "현재 실행 중인 탐색은 없습니다.",
      },
    });
    expect(result.canaryPassed).toBe(true);
    expect(result.healthyMarked).toBe(true);
    expect(result.providerSucceeded).toBe(true);
    expect(result.fallbackUsed).toBe(false);
    expect(result.selectedProvider).toBe("gemini");
  });

  it("rejects HTTP 200 with unusable structured output", () => {
    const result = evaluateStructuredProviderCanary({
      requestedProvider: "gemini",
      healthChecks: [{ provider: "gemini", configured: true, ok: true }],
      canary: {
        status: 200,
        provider: "gemini",
        fallbackUsed: true,
        validationOk: false,
        toolIds: [],
        writeToolExecuted: false,
        conclusionKo: "로컬 안내",
      },
    });
    expect(result.canaryPassed).toBe(false);
    expect(result.healthyMarked).toBe(false);
    expect(result.fallbackReason).toBe("deterministic_fallback");
  });

  it("rejects null canary", () => {
    const result = evaluateStructuredProviderCanary({
      requestedProvider: "gemini",
      healthChecks: [{ provider: "gemini", configured: true, ok: true }],
      canary: null,
    });
    expect(result.canaryNull).toBe(true);
    expect(result.canaryPassed).toBe(false);
    expect(result.healthyMarked).toBe(false);
  });

  it("rejects empty checks with null canary", () => {
    const result = evaluateStructuredProviderCanary({
      requestedProvider: "gemini",
      healthChecks: [],
      canary: null,
    });
    expect(result.checksEmpty).toBe(true);
    expect(result.fallbackReason).toBe("empty_checks_and_null_canary");
    expect(result.healthyMarked).toBe(false);
  });

  it("does not let forced provider bypass verification", () => {
    const result = evaluateStructuredProviderCanary({
      requestedProvider: "gemini",
      healthChecks: [],
      canary: null,
      forcedProvider: "gemini",
    });
    expect(result.fallbackReason).toBe("forced_provider_without_canary");
    expect(result.healthyMarked).toBe(false);
    expect(result.providerSucceeded).toBe(false);
  });

  it("classifies provider timeout as deterministic fallback reason", () => {
    expect(classifyFallbackReason({ timedOut: true })).toBe("provider_timeout");
  });

  it("treats local deterministic fallback as non-verified provider", () => {
    const result = evaluateStructuredProviderCanary({
      requestedProvider: "gemini",
      healthChecks: [{ provider: "gemini", configured: true, ok: false }],
      canary: {
        status: 200,
        provider: "local",
        fallbackUsed: true,
        validationOk: true,
        toolIds: [],
        writeToolExecuted: false,
        conclusionKo: "로컬 안내",
      },
    });
    expect(result.providerSucceeded).toBe(false);
    expect(result.selectedProvider).toBeNull();
    expect(result.fallbackUsed).toBe(true);
  });

  it("fails canary when a write tool executed", () => {
    const result = evaluateStructuredProviderCanary({
      requestedProvider: "gemini",
      healthChecks: [{ provider: "gemini", configured: true, ok: true }],
      canary: {
        status: 200,
        provider: "gemini",
        fallbackUsed: false,
        validationOk: true,
        toolIds: ["search.create"],
        writeToolExecuted: true,
        conclusionKo: "탐색을 시작했습니다.",
      },
    });
    expect(result.canaryPassed).toBe(false);
    expect(result.fallbackReason).toBe("canary_attempted_write_tools");
  });

  it("lists configured providers from health checks", () => {
    expect(
      listConfiguredProviders([
        { provider: "openai", configured: true, ok: true },
        { provider: "gemini", configured: false, ok: false },
      ]),
    ).toEqual(["openai"]);
  });

  it("selects the first verified provider attempt", () => {
    const openaiFail = evaluateStructuredProviderCanary({
      requestedProvider: "openai",
      healthChecks: [{ provider: "openai", configured: true, ok: true }],
      canary: {
        status: 200,
        provider: "openai",
        fallbackUsed: true,
        validationOk: false,
        toolIds: [],
        writeToolExecuted: false,
        conclusionKo: "로컬",
      },
    });
    const geminiPass = evaluateStructuredProviderCanary({
      requestedProvider: "gemini",
      healthChecks: [{ provider: "gemini", configured: true, ok: true }],
      canary: {
        status: 200,
        provider: "gemini",
        fallbackUsed: false,
        validationOk: true,
        toolIds: ["search.status"],
        writeToolExecuted: false,
        conclusionKo: "현재 실행 중인 탐색은 없습니다.",
      },
    });
    const picked = pickVerifiedProviderAttempt([
      { requestedProvider: "openai", verification: openaiFail },
      { requestedProvider: "gemini", verification: geminiPass },
    ]);
    expect(picked.selected?.selectedProvider).toBe("gemini");
  });
});
