import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../src/lib/rextora/agent/providerConfig", () => ({
  getProviderKey: vi.fn(() => "test-key"),
}));

import { GeminiAdapter } from "../src/lib/rextora/agent/providers/geminiAdapter";

describe("Gemini 2.5 response handling", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("disables thinking budget and selects the non-thought text part", async () => {
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      const requestBody = JSON.parse(String(init?.body)) as {
        generationConfig?: { thinkingConfig?: { thinkingBudget?: number } };
      };
      expect(requestBody.generationConfig?.thinkingConfig?.thinkingBudget).toBe(
        0,
      );
      return new Response(
        JSON.stringify({
          candidates: [
            {
              content: {
                parts: [
                  { thought: true, text: "internal reasoning" },
                  { text: "검증된 답변" },
                ],
              },
            },
          ],
          usageMetadata: {
            promptTokenCount: 5,
            candidatesTokenCount: 3,
            totalTokenCount: 8,
          },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    });
    vi.stubGlobal("fetch", fetchMock);
    const adapter = new GeminiAdapter("gemini-2.5-flash");
    const result = await adapter.call(
      {
        intentType: "unknown",
        query: "테스트",
        facts: [],
        history: [],
        decisionContext: {
          conclusionKo: "",
          explanationKo: "",
          recommendedActionKo: "",
          whyBetterThanAlternativesKo: "",
          uncertaintyKo: null,
        },
      },
      new AbortController().signal,
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.interpretation.text).toBe("검증된 답변");
    }
  });

  it("health check allocates enough non-thinking output tokens", async () => {
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      const requestBody = JSON.parse(String(init?.body)) as {
        generationConfig?: {
          maxOutputTokens?: number;
          thinkingConfig?: { thinkingBudget?: number };
        };
      };
      expect(requestBody.generationConfig?.maxOutputTokens).toBeGreaterThanOrEqual(
        16,
      );
      expect(requestBody.generationConfig?.thinkingConfig?.thinkingBudget).toBe(
        0,
      );
      return new Response(
        JSON.stringify({
          candidates: [{ content: { parts: [{ text: "안녕하세요" }] } }],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    });
    vi.stubGlobal("fetch", fetchMock);
    const adapter = new GeminiAdapter("gemini-2.5-flash");
    const result = await adapter.healthCheck();
    expect(result.ok).toBe(true);
  });
});

